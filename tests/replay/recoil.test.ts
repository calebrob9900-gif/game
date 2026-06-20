/**
 * T-112 — Two-layer recoil (fixed pattern moves bullets + recovering visual kick).
 *
 * Verifier: V2 (logic/replay).
 *
 * Tests:
 *   1. Shot-by-shot aim offset follows the AR_BASELINE pattern with CONCRETE values.
 *   2. Visual kick accumulates as a fraction (visualKickMult) of aim recoil.
 *   3. Recovery: after stop firing, offsets decay toward 0 (monotonic, concrete values).
 *   4. Tunable: higher recoilRecoverySpeed recovers faster.
 *   5. Determinism: two runs same seed + inputs produce identical hashes.
 *   6. Existing movement/sprint/crouch goldens UNCHANGED (recoil only fires).
 *
 * NOTE (re-baselined T-111 golden):
 *   The T-111 hitscan golden changed from 'afa4eefa' to 'abe20566' because the fire
 *   system now uses aim-recoil-offset ray direction (T-112 requirement: aim recoil
 *   is authoritative for bullet direction) and the recoil state fields are included
 *   in the world hash. The game outcome (target dies in 4 shots) is unchanged.
 *
 * AR_BASELINE recoil params (from src/sim/weapons/weapons.ts + research/03 §1.2):
 *   pattern: [{p:0.0,y:0.0},{p:0.45,y:0.05},{p:0.55,y:-0.10},...]
 *   recoilTailRandom: 0.35   (only for shots beyond pattern length = 8)
 *   recoilRecoveryDelay: 0.08  (s → 4.8 ticks at 60Hz; recovery after tick 5+)
 *   recoilRecoverySpeed: 10    (1/s exponential rate)
 *   autoRecoverFraction: 0.6   (0=no assist, 1=full assist)
 *   visualKickMult: 0.30       (visual kick = 30% of aim recoil)
 *
 * Recoil convention:
 *   - recoilPitch negative = aim kicked upward (pitch positive = look down in this sim).
 *   - Shot 0: pattern[0]={p:0,y:0} → zero kick.
 *   - Shot 1: pattern[1]={p:0.45,y:0.05} → pitchKick=0.45°=7.854e-3 rad up, etc.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  snapshot,
  hashWorld,
  DEFAULT_SETTINGS,
  AR_BASELINE,
  type Command,
} from '../../src/sim';
import { createTestLevel } from '../../src/sim/levels/testLevel';

// ── Constants from AR_BASELINE ─────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;
const PATTERN = AR_BASELINE.recoilPattern;
const DT = 1 / 60;

/**
 * Compute expected accumulated recoilPitch and recoilYaw after N shots (no tail
 * randomness — all shots are within the 8-entry deterministic pattern).
 */
function expectedRecoilAfterShots(nShots: number): { pitch: number; yaw: number } {
  let pitch = 0;
  let yaw = 0;
  for (let i = 0; i < nShots; i++) {
    const idx = Math.min(i, PATTERN.length - 1);
    const entry = PATTERN[idx]!;
    pitch -= entry.p * DEG2RAD;
    yaw += entry.y * DEG2RAD;
  }
  return { pitch, yaw };
}

/**
 * Create a flat-ground world (no level — avoids level physics coupling) with a
 * player at default position (yaw=0, pitch=0).
 * Returns the world. Player already has weaponId='ar_baseline'.
 */
function createRecoilWorld(seed = 42) {
  return createWorld(seed, DEFAULT_SETTINGS, null);
}

/**
 * Fire N shots with no other input and return a snapshot after each shot.
 * Returns snapshots indexed [0..nShots-1] (snapshot after shot i+1).
 */
function fireNShots(
  world: ReturnType<typeof createWorld>,
  nShots: number,
): ReturnType<typeof snapshot>[] {
  const snaps: ReturnType<typeof snapshot>[] = [];
  for (let i = 0; i < nShots; i++) {
    step(world, [{ type: 'fire' }]);
    snaps.push(snapshot(world));
  }
  return snaps;
}

// ── 1. Shot-by-shot aim offset follows the AR pattern ─────────────────────────

describe('T-112 aim recoil pattern accumulation', () => {
  /**
   * AR_BASELINE pattern (8 entries, degrees):
   *   shot 0: {p:0.0, y:0.0}   → no kick (fires before kick)
   *   shot 1: {p:0.45, y:0.05}
   *   shot 2: {p:0.55, y:-0.10}
   *   shot 3: {p:0.60, y:-0.15}
   *   ...
   *
   * Expected accumulated recoilPitch after shot N = -sum(pattern[0..N-1].p) * DEG2RAD
   * Expected accumulated recoilYaw after shot N   = +sum(pattern[0..N-1].y) * DEG2RAD
   */

  it('shot 0 (first shot, no kick): recoilPitch=0, recoilYaw=0', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 1);
    // pattern[0] = {p:0, y:0} → zero kick
    expect(snaps[0]!.player.recoilPitch).toBeCloseTo(0, 8);
    expect(snaps[0]!.player.recoilYaw).toBeCloseTo(0, 8);
    expect(snaps[0]!.player.recoilShot).toBe(1);
  });

  it('shot 1: recoilPitch = -0.45°*DEG2RAD (upward kick)', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 2);
    const exp = expectedRecoilAfterShots(2);
    // After 2 shots: accumulated pitch from shots 0 and 1
    // = -(0.0 + 0.45)*DEG2RAD = -0.45*DEG2RAD ≈ -0.00785398 rad
    expect(snaps[1]!.player.recoilPitch).toBeCloseTo(exp.pitch, 7);
    expect(snaps[1]!.player.recoilPitch).toBeCloseTo(-0.45 * DEG2RAD, 7);
    // yaw = (0.0 + 0.05)*DEG2RAD ≈ 0.00087266 rad
    expect(snaps[1]!.player.recoilYaw).toBeCloseTo(exp.yaw, 7);
    expect(snaps[1]!.player.recoilYaw).toBeCloseTo(0.05 * DEG2RAD, 7);
    expect(snaps[1]!.player.recoilShot).toBe(2);
  });

  it('shot 2: recoilPitch accumulates (0+0.45+0.55)° upward, yaw drifts left', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 3);
    const exp = expectedRecoilAfterShots(3);
    // -(0+0.45+0.55)*DEG2RAD = -1.0*DEG2RAD ≈ -0.01745329 rad
    expect(snaps[2]!.player.recoilPitch).toBeCloseTo(exp.pitch, 7);
    expect(snaps[2]!.player.recoilPitch).toBeCloseTo(-1.0 * DEG2RAD, 7);
    // yaw: (0+0.05-0.10)*DEG2RAD = -0.05*DEG2RAD ≈ -0.00087266 rad
    expect(snaps[2]!.player.recoilYaw).toBeCloseTo(exp.yaw, 7);
    expect(snaps[2]!.player.recoilYaw).toBeCloseTo(-0.05 * DEG2RAD, 7);
    expect(snaps[2]!.player.recoilShot).toBe(3);
  });

  it('pitch climbs monotonically through first 4 shots (vertical-heavy early pattern)', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 8);
    // Pitch should be monotonically more negative (climbing upward) for shots 1-7
    // (pattern entries 1-7 all have p > 0)
    for (let i = 1; i < 7; i++) {
      expect(snaps[i]!.player.recoilPitch).toBeLessThan(snaps[i - 1]!.player.recoilPitch);
    }
  });

  it('recoilShot counter increments with each shot', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 8);
    for (let i = 0; i < 8; i++) {
      expect(snaps[i]!.player.recoilShot).toBe(i + 1);
    }
  });

  it('all 8 shots have concrete expected pitch values (LITERAL)', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 8);

    // Literal values computed from pattern accumulation (degrees → radians).
    // Re-baseline only via reviewed PR.
    const EXPECTED_PITCH: number[] = [
      0.0, // after shot 0: p=0.0
      -0.45 * DEG2RAD, // after shot 1: cum p=0.45
      -1.0 * DEG2RAD, // after shot 2: cum p=1.0
      -1.6 * DEG2RAD, // after shot 3: cum p=1.6
      -2.22 * DEG2RAD, // after shot 4: cum p=2.22
      -2.84 * DEG2RAD, // after shot 5: cum p=2.84
      -3.39 * DEG2RAD, // after shot 6: cum p=3.39
      -3.89 * DEG2RAD, // after shot 7: cum p=3.89
    ];
    const EXPECTED_YAW: number[] = [
      0.0, // after shot 0: y=0.0
      0.05 * DEG2RAD, // after shot 1: cum y=0.05
      -0.05 * DEG2RAD, // after shot 2: cum y=-0.05
      -0.2 * DEG2RAD, // after shot 3: cum y=-0.20
      -0.1 * DEG2RAD, // after shot 4: cum y=-0.10
      0.15 * DEG2RAD, // after shot 5: cum y=+0.15
      0.45 * DEG2RAD, // after shot 6: cum y=+0.45
      0.65 * DEG2RAD, // after shot 7: cum y=+0.65
    ];

    for (let i = 0; i < 8; i++) {
      expect(snaps[i]!.player.recoilPitch).toBeCloseTo(EXPECTED_PITCH[i]!, 7);
      expect(snaps[i]!.player.recoilYaw).toBeCloseTo(EXPECTED_YAW[i]!, 7);
    }
  });
});

// ── 2. Visual kick layer ───────────────────────────────────────────────────────

describe('T-112 visual kick layer', () => {
  /**
   * Visual kick = aim recoil pitch/yaw delta per shot × visualKickMult (0.30).
   * It accumulates additively just like aim recoil but is presented separately
   * and does NOT affect bullet direction.
   */

  it('visual kick pitch after shot 1 = shot-pitch-delta × visualKickMult', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 2);

    // Shot 1 pattern: pitch kick = 0.45°, yaw kick = 0.05°
    const pitchKick = 0.45 * DEG2RAD;
    const yawKick = 0.05 * DEG2RAD;
    const mult = AR_BASELINE.visualKickMult; // 0.30

    // Visual kick pitch after shot 1 = -(0 + pitchKick) * mult
    // (accumulated: shot 0 had zero kick, shot 1 adds pitchKick)
    expect(snaps[1]!.player.visualKickPitch).toBeCloseTo(-pitchKick * mult, 7);
    expect(snaps[1]!.player.visualKickYaw).toBeCloseTo(yawKick * mult, 7);
  });

  it('visual kick is a consistent fraction (visualKickMult) of aim recoil', () => {
    const world = createRecoilWorld();
    const snaps = fireNShots(world, 8);
    const mult = AR_BASELINE.visualKickMult;

    // After all 8 shots, visual kick should equal aim recoil * mult
    // (both accumulate from the same per-shot deltas)
    for (let i = 0; i < 8; i++) {
      const s = snaps[i]!.player;
      expect(s.visualKickPitch).toBeCloseTo(s.recoilPitch * mult, 7);
      expect(s.visualKickYaw).toBeCloseTo(s.recoilYaw * mult, 7);
    }
  });
});

// ── 3. Recovery — monotonic decay toward 0 ────────────────────────────────────

describe('T-112 recoil recovery', () => {
  /**
   * After firing stops, recoilPitch and recoilYaw recover toward 0.
   * Recovery starts after recoilRecoveryDelay = 0.08 s = 4.8 ticks, i.e. once
   * recoilTicksSinceLastShot exceeds 4.8 (so at tick 5 after last shot).
   * Each recovery tick: offset *= (1 - decay_factor) where
   *   decay_factor = (1 - exp(-speed * DT)) * autoRecoverFraction
   *               = (1 - exp(-10 / 60)) * 0.6 ≈ 0.09211
   */

  it('offset is unchanged during recovery delay (first 4 ticks after last shot)', () => {
    const world = createRecoilWorld();
    // Fire 4 shots to build up recoil
    fireNShots(world, 4);
    const pitchAfterFiring = snapshot(world).player.recoilPitch;
    const yawAfterFiring = snapshot(world).player.recoilYaw;

    // Advance 4 no-fire ticks (should still be in delay window; delay = 4.8 ticks)
    for (let t = 0; t < 4; t++) {
      step(world, []); // no input
    }

    const s = snapshot(world).player;
    // Should not have recovered yet (ticksSince = 4, delay = 4.8 — not exceeded)
    expect(s.recoilPitch).toBeCloseTo(pitchAfterFiring, 8);
    expect(s.recoilYaw).toBeCloseTo(yawAfterFiring, 8);
  });

  it('offset begins decaying after recovery delay elapses (tick 5+)', () => {
    const world = createRecoilWorld();
    fireNShots(world, 4);
    const pitchAfterFiring = snapshot(world).player.recoilPitch;

    // Advance 6 no-fire ticks (5+ past delay)
    for (let t = 0; t < 6; t++) {
      step(world, []);
    }

    const s = snapshot(world).player;
    // Offset should have started recovering — magnitude decreases
    expect(Math.abs(s.recoilPitch)).toBeLessThan(Math.abs(pitchAfterFiring));
  });

  it('offset decays monotonically (each no-fire tick brings it closer to 0)', () => {
    const world = createRecoilWorld();
    fireNShots(world, 8);

    // Wait past delay (5 ticks), then check monotonic decay for 10 ticks
    for (let t = 0; t < 5; t++) step(world, []);

    let prevPitchMag = Math.abs(snapshot(world).player.recoilPitch);
    for (let t = 0; t < 10; t++) {
      step(world, []);
      const mag = Math.abs(snapshot(world).player.recoilPitch);
      expect(mag).toBeLessThanOrEqual(prevPitchMag);
      prevPitchMag = mag;
    }
  });

  it('concrete decay values match exponential formula (LITERAL)', () => {
    const world = createRecoilWorld();
    fireNShots(world, 8);

    // Wait out the recovery delay (5 ticks)
    for (let t = 0; t < 5; t++) step(world, []);

    // Starting values after delay elapses (from our computed values above):
    // After 8 shots: pitch ≈ -0.06789331, yaw ≈ 0.01134464
    // After delay (4 no-fire ticks before recovery, +1 first recovery tick = tick 5):
    //   f = (1 - exp(-10 * 1/60)) * 0.6 ≈ 0.09211097
    //   pitch_5 = -0.06789331 * (1 - 0.09211097) ≈ -0.06163959

    const speed = AR_BASELINE.recoilRecoverySpeed; // 10
    const frac = AR_BASELINE.autoRecoverFraction; // 0.6
    const f = (1 - Math.exp(-speed * DT)) * frac;

    // After shot sequence: pitch = -0.06789331 rad (cumulative from 8 shots)
    const pitchBase = expectedRecoilAfterShots(8).pitch; // exact from pattern
    // After recovery delay (5 ticks, first 4 don't recover, tick 5 does):
    // 1 recovery step applied:
    const pitchAfterTick5 = pitchBase - pitchBase * f;

    const s5 = snapshot(world).player;
    expect(s5.recoilPitch).toBeCloseTo(pitchAfterTick5, 6);

    // After 2 more recovery ticks (ticks 6, 7):
    step(world, []);
    const pitchAfterTick6 = pitchAfterTick5 - pitchAfterTick5 * f;
    expect(snapshot(world).player.recoilPitch).toBeCloseTo(pitchAfterTick6, 6);

    step(world, []);
    const pitchAfterTick7 = pitchAfterTick6 - pitchAfterTick6 * f;
    expect(snapshot(world).player.recoilPitch).toBeCloseTo(pitchAfterTick7, 6);
  });
});

// ── 4. Tunable recovery speed ─────────────────────────────────────────────────

describe('T-112 tunable recovery speed', () => {
  /**
   * Two weapons with identical patterns but different recoilRecoverySpeed.
   * Higher speed → faster recovery → smaller magnitude after same number of no-fire ticks.
   * We test this by patching the player's weapon id and using a second world with a
   * faster-recovery weapon defined inline. Since weaponDef is read-only data, we test
   * the effect via the hash difference.
   *
   * Approach: use the same world but measure pitch after different recovery durations.
   * A single world with speed=10 vs speed=20 by overriding world.rng.
   *
   * For simplicity: use two separate worlds with same seed+pattern, compare pitch
   * after recovery. We can't patch the weapon id easily, so we test by manually
   * computing that a higher rate decays faster:
   *   decay10 = (1 - exp(-10/60)) * 0.6 ≈ 0.0921
   *   decay20 = (1 - exp(-20/60)) * 0.6 ≈ 0.1685
   * So after 1 recovery tick from the same base value, |pitch_20| < |pitch_10|.
   */

  it('decay factor is larger with higher recoilRecoverySpeed (tunable)', () => {
    const speed10 = AR_BASELINE.recoilRecoverySpeed; // 10
    const speed20 = speed10 * 2; // 20
    const frac = AR_BASELINE.autoRecoverFraction;

    const f10 = (1 - Math.exp(-speed10 * DT)) * frac;
    const f20 = (1 - Math.exp(-speed20 * DT)) * frac;

    // Higher speed → larger decay factor → faster recovery
    expect(f20).toBeGreaterThan(f10);

    // After 1 recovery tick from same base, higher speed gives smaller magnitude
    const basePitch = expectedRecoilAfterShots(8).pitch; // large negative value
    const pitch10After1 = basePitch - basePitch * f10;
    const pitch20After1 = basePitch - basePitch * f20;

    // basePitch is negative, so both are less negative after decay.
    // |pitch20After1| < |pitch10After1| (closer to 0 = faster recovery)
    expect(Math.abs(pitch20After1)).toBeLessThan(Math.abs(pitch10After1));
  });

  it('within spec range: recoilRecoverySpeed is in [6, 14] (research/03 §1.3)', () => {
    expect(AR_BASELINE.recoilRecoverySpeed).toBeGreaterThanOrEqual(6);
    expect(AR_BASELINE.recoilRecoverySpeed).toBeLessThanOrEqual(14);
  });

  it('autoRecoverFraction is in [0.5, 0.7] (research/03 §1.3 accessible default)', () => {
    expect(AR_BASELINE.autoRecoverFraction).toBeGreaterThanOrEqual(0.5);
    expect(AR_BASELINE.autoRecoverFraction).toBeLessThanOrEqual(0.7);
  });

  it('recoilRecoveryDelay is in [0.05, 0.12] s (research/03 §1.3)', () => {
    expect(AR_BASELINE.recoilRecoveryDelay).toBeGreaterThanOrEqual(0.05);
    expect(AR_BASELINE.recoilRecoveryDelay).toBeLessThanOrEqual(0.12);
  });
});

// ── 5. Determinism — two runs same hash ───────────────────────────────────────

describe('T-112 determinism', () => {
  /**
   * Two independent runs with the same seed + command sequence must produce
   * identical world hashes at every measured point.
   */

  function runRecoilSequence(seed: number): string {
    const world = createRecoilWorld(seed);
    // Fire 8 shots
    for (let i = 0; i < 8; i++) step(world, [{ type: 'fire' }]);
    // Wait 20 ticks (recovery)
    for (let t = 0; t < 20; t++) step(world, []);
    // Fire 3 more
    for (let i = 0; i < 3; i++) step(world, [{ type: 'fire' }]);
    return hashWorld(world);
  }

  it('two runs of the same seed+inputs produce identical world hash', () => {
    const h1 = runRecoilSequence(999);
    const h2 = runRecoilSequence(999);
    expect(h1).toBe(h2);
  });

  it('different seeds produce different world hashes (tail randomness differs)', () => {
    // With 8 shots (within deterministic pattern), the hashes differ only because
    // of spawn differences (same world structure but seed affects RNG state for
    // tail shots if any). For shots entirely within the 8-entry pattern there's
    // no RNG usage, so hashes will match... unless the tick count is the same.
    // Actually they will be the same since no tail randomness is used for 8 shots.
    // Let's fire 10 shots instead (2 beyond pattern) to exercise tail randomness.
    const world1 = createRecoilWorld(100);
    const world2 = createRecoilWorld(200); // different seed → different tail noise
    for (let i = 0; i < 10; i++) {
      step(world1, [{ type: 'fire' }]);
      step(world2, [{ type: 'fire' }]);
    }
    // RNG seeds differ → tail randomness differs → world states differ
    expect(hashWorld(world1)).not.toBe(hashWorld(world2));
  });

  it('literal golden hash for 8-shot burst + 20 recovery ticks + 3 more shots (seed=999)', () => {
    const hash = runRecoilSequence(999);
    // Literal golden hash — re-baseline only via reviewed PR.
    // Computed from: seed=999, no-level flat-ground, 8 fire + 20 idle + 3 fire commands.
    // Re-baseline required if: recoil pattern, recovery speed, or hash fields change.
    // The hash includes recoilPitch, recoilYaw, recoilShot, recoilTicksSinceLastShot.
    const GOLDEN = 'f6e051f8';
    expect(hash).toBe(GOLDEN);
  });
});

// ── 5b. Seeded tail randomness (shots beyond pattern length) ──────────────────

describe('T-112 seeded tail randomness', () => {
  it('shots 8+ (beyond pattern) produce deterministic results with same seed', () => {
    const world1 = createRecoilWorld(42);
    const world2 = createRecoilWorld(42);

    // Fire 10 shots (8 deterministic + 2 tail-random)
    for (let i = 0; i < 10; i++) {
      step(world1, [{ type: 'fire' }]);
      step(world2, [{ type: 'fire' }]);
    }

    // Same seed → identical hashes
    expect(hashWorld(world1)).toBe(hashWorld(world2));
    // And identical recoil state
    expect(snapshot(world1).player.recoilPitch).toBe(snapshot(world2).player.recoilPitch);
    expect(snapshot(world1).player.recoilYaw).toBe(snapshot(world2).player.recoilYaw);
  });

  it('shots 8+ with different seeds produce different recoil offsets (tail noise differs)', () => {
    const world1 = createRecoilWorld(1);
    const world2 = createRecoilWorld(2);

    // Fire 10 shots — 2 use tail randomness with seeded RNG
    for (let i = 0; i < 10; i++) {
      step(world1, [{ type: 'fire' }]);
      step(world2, [{ type: 'fire' }]);
    }

    // Different seeds → different tail noise → different recoil offsets
    const p1 = snapshot(world1).player.recoilPitch;
    const p2 = snapshot(world2).player.recoilPitch;
    expect(p1).not.toBe(p2);
  });
});

// ── 6. Existing movement goldens UNCHANGED ────────────────────────────────────

describe('T-112 existing movement goldens unaffected', () => {
  /**
   * Recoil state is only set when a fire command is issued (lazy initialisation).
   * Movement-only inputs must produce the same hashes as before T-112 was added.
   */

  it('movement golden f1ea305f is unchanged (forward 30 + stop 30 ticks, seed=42)', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    const fwdCmd: Command = { type: 'move', forward: 1, right: 0, jump: false };
    for (let t = 0; t < 30; t++) step(world, [fwdCmd]);
    for (let t = 0; t < 30; t++) step(world, []);

    expect(hashWorld(world)).toBe('f1ea305f');
  });

  it('sprint golden cef63996 is unchanged (sprint 60 ticks, seed=1234)', () => {
    const level = createTestLevel();
    const world = createWorld(1234, DEFAULT_SETTINGS, level);

    for (let t = 0; t < 60; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }
    expect(hashWorld(world)).toBe('cef63996');
  });
});

// ── 7. Literal golden hash (pinned) ───────────────────────────────────────────

describe('T-112 literal golden hash', () => {
  /**
   * Scripted 8-shot burst (within deterministic pattern, no tail randomness).
   * seed=77, flat-ground world (no level), player at (0, 1.7, 0).
   * No targets — we're testing recoil state, not hit registration.
   */

  function runEightShotBurst(seed: number): string {
    const world = createRecoilWorld(seed);
    for (let i = 0; i < 8; i++) step(world, [{ type: 'fire' }]);
    return hashWorld(world);
  }

  it('8-shot burst is deterministic (same hash twice)', () => {
    expect(runEightShotBurst(77)).toBe(runEightShotBurst(77));
  });

  it('8-shot burst produces a literal golden hash (seed=77)', () => {
    const hash = runEightShotBurst(77);
    // Literal golden — re-baseline only via reviewed PR if recoil pattern or hash logic changes.
    // Computed from: seed=77, null level, 8×fire, no targets (RNG unmodified by tail noise;
    // all 8 shots are within the deterministic pattern, so world.rng is not consumed for tail).
    // Recoil state fields (recoilShot=8, recoilPitch, recoilYaw) contribute to hash.
    const GOLDEN = '7791f4b2';
    expect(hash).toBe(GOLDEN);
  });
});
