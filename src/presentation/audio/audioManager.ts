/**
 * AudioManager — Howler + Web Audio API spatial audio for NEON BREACH.
 *
 * Responsibilities:
 *   - Single shared AudioContext obtained from Howler.ctx.
 *   - Unlock / resume AudioContext on first user gesture (Howler handles most
 *     of this; we add a pointerdown/keydown fallback and verify state).
 *   - Spatial listener updated from the camera transform each frame.
 *   - Procedural sounds (no asset files yet — T-620 adds real audio):
 *       weaponFire  — layered: transient crack + body thump + tail (3 short buffers)
 *       footstep    — short click/thud
 *       impact      — short crack/ping
 *   - Voice budget: ≤ 8 concurrent weapon voices, ≤ 4 footstep/impact voices.
 *   - Test counter: getScheduledCount() — total sounds scheduled (fire+footstep+impact).
 *
 * Wires to the sim event bus:
 *   'hit'   → weaponFire + impact
 *   'jump'  → footstep
 *
 * Import boundary: presentation only — NO src/sim imports except GameEvents type
 * (which is a pure type import, not a runtime dependency).
 *
 * Reference: docs/research/06-audio.md §1, §2.1, §4.
 */

import { Howler } from 'howler';
import type { EventBus } from '../../sim/core/events';
import type { GameEvents } from '../../sim/world';

// ── Voice budget constants ────────────────────────────────────────────────────
const MAX_WEAPON_VOICES = 8;
const MAX_FOOTSTEP_VOICES = 4;

// ── Procedural buffer generation ─────────────────────────────────────────────

/**
 * Generate a short transient buffer: exponentially-decaying bandpass noise.
 * Simulates a sharp gun crack / attack transient.
 * Duration: ~30 ms at the given sample rate.
 */
function makeTransientBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.03; // 30 ms
  const n = Math.floor(sampleRate * duration);
  const buf = ctx.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);
  // White noise * exponential decay — sharp attack, fast tail
  // lambda = 150 → 1/e at ~7 ms
  const lambda = 150;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Pseudo-deterministic noise — not in sim, presentation only.
    // Using a simple LCG for the sample values (no Math.random in sim!).
    // Here in presentation it's fine.
    const noise = Math.sin(i * 1.2345 + 0.7) * Math.cos(i * 0.4321);
    data[i] = noise * Math.exp(-lambda * t);
  }
  return buf;
}

/**
 * Generate a body thump buffer: low-frequency sine burst.
 * Simulates the weight/boom of a gunshot body layer.
 * Duration: ~60 ms.
 */
function makeBodyBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.06; // 60 ms
  const n = Math.floor(sampleRate * duration);
  const buf = ctx.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);
  // Low-freq (80 Hz) sine * exponential decay
  const freq = 80;
  const lambda = 60;
  const twoPiF = 2 * Math.PI * freq;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    data[i] = Math.sin(twoPiF * t) * 0.7 * Math.exp(-lambda * t);
  }
  return buf;
}

/**
 * Generate a tail / reverb trail buffer: filtered noise that decays slowly.
 * Duration: ~80 ms.
 */
function makeTailBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.08; // 80 ms
  const n = Math.floor(sampleRate * duration);
  const buf = ctx.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);
  const lambda = 25;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const noise = Math.sin(i * 0.8765) * Math.cos(i * 2.1);
    data[i] = noise * 0.35 * Math.exp(-lambda * t);
  }
  return buf;
}

/**
 * Generate a footstep/jump tick: short mid-frequency click.
 * Duration: ~20 ms.
 */
function makeFootstepBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.02; // 20 ms
  const n = Math.floor(sampleRate * duration);
  const buf = ctx.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);
  const freq = 400;
  const lambda = 200;
  const twoPiF = 2 * Math.PI * freq;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    data[i] = Math.sin(twoPiF * t) * 0.5 * Math.exp(-lambda * t);
  }
  return buf;
}

/**
 * Generate an impact buffer: high-frequency metallic ping.
 * Duration: ~25 ms.
 */
function makeImpactBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.025;
  const n = Math.floor(sampleRate * duration);
  const buf = ctx.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);
  const freq = 1200;
  const lambda = 120;
  const twoPiF = 2 * Math.PI * freq;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const noise = Math.sin(i * 1.732) * 0.3;
    data[i] = (Math.sin(twoPiF * t) + noise) * 0.4 * Math.exp(-lambda * t);
  }
  return buf;
}

// ── Voice management ──────────────────────────────────────────────────────────

interface Voice {
  source: AudioBufferSourceNode;
  startedAt: number;
}

/**
 * Play a buffer through a gain node connected to the master bus.
 * If voicePool is at capacity, steals the oldest voice (stops it).
 * Returns the new voice, or null if AudioContext is not running.
 */
function playBuffer(
  ctx: AudioContext,
  buf: AudioBuffer,
  masterGain: GainNode,
  volume: number,
  voicePool: Voice[],
  maxVoices: number,
  now: number,
): Voice | null {
  // Don't try to play if context is suspended (autoplay policy)
  if (ctx.state !== 'running') return null;

  // Steal oldest voice if at capacity
  if (voicePool.length >= maxVoices) {
    const oldest = voicePool.shift();
    if (oldest) {
      try {
        oldest.source.stop();
      } catch {
        // already stopped — ignore
      }
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buf;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);

  source.connect(gain);
  gain.connect(masterGain);
  source.start(now);

  const voice: Voice = { source, startedAt: now };

  // Auto-remove from pool on end
  source.onended = () => {
    const idx = voicePool.indexOf(voice);
    if (idx >= 0) voicePool.splice(idx, 1);
  };

  voicePool.push(voice);
  return voice;
}

// ── AudioManager ─────────────────────────────────────────────────────────────

export class AudioManager {
  /** Total sounds scheduled since construction (for E2E assertion). */
  private scheduled = 0;

  private ctx!: AudioContext;
  private masterGain!: GainNode;
  private masterCompressor!: DynamicsCompressorNode;

  // Pre-decoded procedural buffers
  private bufTransient!: AudioBuffer;
  private bufBody!: AudioBuffer;
  private bufTail!: AudioBuffer;
  private bufFootstep!: AudioBuffer;
  private bufImpact!: AudioBuffer;

  // Voice pools per category
  private weaponVoices: Voice[] = [];
  private footstepVoices: Voice[] = [];

  // Cleanup handles
  private unsubHit?: () => void;
  private unsubJump?: () => void;
  private gestureHandler?: () => void;

  // Whether init has succeeded (AudioContext created)
  private ready = false;

  constructor(events: EventBus<GameEvents>) {
    this.init(events);
  }

  /**
   * Initialise the AudioContext via Howler (ensures a single shared context)
   * and generate procedural buffers.
   * Safe to call in headless — catches errors silently.
   */
  private init(events: EventBus<GameEvents>): void {
    try {
      // Trigger Howler to create / unlock its AudioContext.
      // Howler.ctx is the shared AudioContext instance (or null if not yet created).
      // Calling Howler.volume() is a safe no-op that forces context creation.
      Howler.volume(Howler.volume());

      const ctx = Howler.ctx as AudioContext | null | undefined;
      if (!ctx) {
        // AudioContext not yet available (possible in headless/test without gesture).
        // We'll try again on first gesture via the gesture handler.
        this.setupGestureUnlock(events);
        return;
      }

      this.setupWithContext(ctx, events);
    } catch {
      // In headless or restricted environments, audio init may fail.
      // This is graceful — no uncaught errors.
    }
  }

  private setupWithContext(ctx: AudioContext, events: EventBus<GameEvents>): void {
    this.ctx = ctx;

    // Master compressor/limiter — prevents clipping when voices stack.
    this.masterCompressor = ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-12, ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(6, ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(8, ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.003, ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.1, ctx.currentTime);
    this.masterCompressor.connect(ctx.destination);

    // Master gain bus
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.5, ctx.currentTime);
    this.masterGain.connect(this.masterCompressor);

    // Generate procedural buffers (pure math, no files)
    this.bufTransient = makeTransientBuffer(ctx);
    this.bufBody = makeBodyBuffer(ctx);
    this.bufTail = makeTailBuffer(ctx);
    this.bufFootstep = makeFootstepBuffer(ctx);
    this.bufImpact = makeImpactBuffer(ctx);

    this.ready = true;

    // Subscribe to sim events
    this.unsubHit = events.on('hit', () => {
      this.playWeaponFire();
      this.playImpact();
    });

    this.unsubJump = events.on('jump', () => {
      this.playFootstep();
    });

    // Resume context on gesture (handle the case where it starts suspended)
    this.setupGestureUnlock(events);
  }

  /**
   * Set up a one-time gesture listener to resume/unlock the AudioContext.
   * Called regardless of init success — if context is created later, we retry.
   */
  private setupGestureUnlock(events: EventBus<GameEvents>): void {
    const handler = (): void => {
      try {
        // If context doesn't exist yet, try to init now
        if (!this.ready) {
          const ctx = Howler.ctx as AudioContext | null | undefined;
          if (ctx) {
            this.setupWithContext(ctx, events);
          }
        }
        // Resume if suspended
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume();
        }
      } catch {
        // Silent fail
      }
    };

    this.gestureHandler = handler;

    // Register on common gesture events (pointer lock click, key, touch)
    document.addEventListener('pointerdown', handler, { once: true, passive: true });
    document.addEventListener('keydown', handler, { once: true, passive: true });
    document.addEventListener('touchend', handler, { once: true, passive: true });
  }

  // ── Public playback API ────────────────────────────────────────────────────

  /**
   * Play layered weapon fire: transient + body + tail, staggered slightly.
   * Layers are scheduled at ctx.currentTime + small offsets per research/06 §2.1.
   */
  playWeaponFire(): void {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Layer 1: transient crack — immediate
    const v1 = playBuffer(
      this.ctx,
      this.bufTransient,
      this.masterGain,
      0.8,
      this.weaponVoices,
      MAX_WEAPON_VOICES,
      now,
    );
    // Layer 2: body thump — +5 ms stagger for depth
    const v2 = playBuffer(
      this.ctx,
      this.bufBody,
      this.masterGain,
      0.6,
      this.weaponVoices,
      MAX_WEAPON_VOICES,
      now + 0.005,
    );
    // Layer 3: tail — +15 ms stagger (environmental reverb layer)
    const v3 = playBuffer(
      this.ctx,
      this.bufTail,
      this.masterGain,
      0.4,
      this.weaponVoices,
      MAX_WEAPON_VOICES,
      now + 0.015,
    );

    if (v1 || v2 || v3) {
      this.scheduled += 3;
    }
  }

  /** Play a footstep / jump sound. */
  playFootstep(): void {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const v = playBuffer(
      this.ctx,
      this.bufFootstep,
      this.masterGain,
      0.3,
      this.footstepVoices,
      MAX_FOOTSTEP_VOICES,
      now,
    );
    if (v) this.scheduled += 1;
  }

  /** Play a bullet impact sound. */
  playImpact(): void {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const v = playBuffer(
      this.ctx,
      this.bufImpact,
      this.masterGain,
      0.5,
      this.footstepVoices,
      MAX_FOOTSTEP_VOICES,
      now,
    );
    if (v) this.scheduled += 1;
  }

  // ── Spatial listener ──────────────────────────────────────────────────────

  /**
   * Sync the AudioListener position and orientation with the camera transform.
   * Called each render frame by the game loop.
   *
   * @param x, y, z  — listener position in world space
   * @param fwdX, fwdY, fwdZ — forward (look) direction (unit vector)
   * @param upX, upY, upZ    — up direction (unit vector, default 0,1,0)
   */
  updateListener(
    x: number,
    y: number,
    z: number,
    fwdX: number,
    fwdY: number,
    fwdZ: number,
    upX = 0,
    upY = 1,
    upZ = 0,
  ): void {
    if (!this.ready || !this.ctx) return;
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;

    try {
      // Modern API (AudioParam setters) — preferred
      if (listener.positionX !== undefined) {
        listener.positionX.setValueAtTime(x, now);
        listener.positionY.setValueAtTime(y, now);
        listener.positionZ.setValueAtTime(z, now);
        listener.forwardX.setValueAtTime(fwdX, now);
        listener.forwardY.setValueAtTime(fwdY, now);
        listener.forwardZ.setValueAtTime(fwdZ, now);
        listener.upX.setValueAtTime(upX, now);
        listener.upY.setValueAtTime(upY, now);
        listener.upZ.setValueAtTime(upZ, now);
      } else {
        // Legacy fallback (deprecated but supported on some Firefox versions)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const l = listener as any;
        if (typeof l.setPosition === 'function') l.setPosition(x, y, z);
        if (typeof l.setOrientation === 'function')
          l.setOrientation(fwdX, fwdY, fwdZ, upX, upY, upZ);
      }
    } catch {
      // Listener update failure is non-fatal
    }
  }

  // ── Test instrumentation ──────────────────────────────────────────────────

  /** Total sound schedules since construction (for E2E assertion). */
  getScheduledCount(): number {
    return this.scheduled;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.unsubHit?.();
    this.unsubJump?.();
    if (this.gestureHandler) {
      document.removeEventListener('pointerdown', this.gestureHandler);
      document.removeEventListener('keydown', this.gestureHandler);
      document.removeEventListener('touchend', this.gestureHandler);
    }
    // Stop all active voices
    for (const v of [...this.weaponVoices, ...this.footstepVoices]) {
      try {
        v.source.stop();
      } catch {
        // ignore
      }
    }
    this.weaponVoices = [];
    this.footstepVoices = [];
  }
}
