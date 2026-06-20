import { CommandBuffer, createWorld, snapshot, step, type Command, type SimWorld } from '../sim';
import { createTestLevel } from '../sim/levels/testLevel';
import { createMantleTestLevel } from '../sim/levels/mantleTestLevel';
import { GameRenderer } from '../presentation/rendering/renderer';
import { RenderSync } from '../presentation/view/renderSync';
import { Hud, injectHudStyles } from '../presentation/ui/hud';
import { AudioManager } from '../presentation/audio/audioManager';
import { FixedLoop } from './loop';
import { FrameProbe } from './perf';
import { installInstrumentation } from './instrumentation';

/** Parse deterministic boot params (?seed=, ?scenario=). */
function bootParams(): { seed: number; scenario: string } {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    seed: Number.isFinite(seed) ? seed : 1337,
    scenario: params.get('scenario') ?? 'default',
  };
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('NEON BREACH: #game canvas missing');

  const { seed, scenario } = bootParams();
  // Load a level for deterministic E2E tests when ?scenario= is passed.
  // This activates the capsule controller path, enabling slide/mantle/crouch.
  const level =
    scenario === 'test'
      ? createTestLevel()
      : scenario === 'mantle_test'
        ? createMantleTestLevel()
        : null;
  const world: SimWorld = createWorld(seed, undefined, level);
  const commands = new CommandBuffer();
  const renderSync = new RenderSync();
  const probe = new FrameProbe();
  const renderer = new GameRenderer(canvas);

  // HUD overlay — lives in DOM outside #game canvas so V4 visual baseline is unaffected.
  injectHudStyles();
  const hud = new Hud(document.body);

  // Audio system — subscribes to sim events, updates listener from camera each frame.
  // Instantiated before the loop starts so event subscriptions are active from tick 0.
  const audioManager = new AudioManager(world.events);

  renderSync.push(snapshot(world));

  const stepSim = (): void => {
    step(world, commands.drain());
    renderSync.push(snapshot(world));
  };

  const loop = new FixedLoop({
    stepSim,
    render: (alpha) => {
      renderSync.apply(renderer, alpha);
      renderer.render();
      // Update HUD from the current sim snapshot (DOM writes only when values change).
      hud.update(snapshot(world));
      // Sync spatial listener with camera transform each frame.
      // camera.rotation uses YXZ order: yaw = rotation.y, pitch = rotation.x.
      const cam = renderer.camera;
      const cy = cam.rotation.y; // yaw
      const cp = cam.rotation.x; // pitch
      // Forward vector (yaw + pitch → -Z forward):
      //   fwdX =  cos(pitch) * sin(yaw)
      //   fwdY = -sin(pitch)
      //   fwdZ = -cos(pitch) * cos(yaw)
      const cosPitch = Math.cos(cp);
      const fwdX = cosPitch * Math.sin(cy);
      const fwdY = -Math.sin(cp);
      const fwdZ = -cosPitch * Math.cos(cy);
      audioManager.updateListener(cam.position.x, cam.position.y, cam.position.z, fwdX, fwdY, fwdZ);
    },
    onFrame: (now) => probe.record(now),
  });

  // Wire test instrumentation (dev/test only).
  const markReady = installInstrumentation({
    getSnapshot: () => snapshot(world),
    pushCommand: (cmd: Command) => commands.push(cmd),
    stepTo: (targetTick: number) => {
      // Freeze the live loop and advance the sim deterministically to a tick.
      const wasRunning = loop.isRunning;
      if (wasRunning) loop.stop();
      let guard = 0;
      while (world.tick < targetTick && guard < 100_000) {
        step(world, commands.drain());
        guard += 1;
      }
      renderSync.push(snapshot(world));
      renderSync.apply(renderer, 1);
      renderer.render();
      return snapshot(world);
    },
    perf: () => ({
      sample: (ms?: number) => probe.sample(ms),
      stats: () => probe.stats(),
    }),
  });

  // Expose audio instrumentation hook (dev/test only, stripped in production).
  // Allows E2E tests to read scheduled sound counts without reading audio state.
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    (window as Window & { __audio?: { scheduled: () => number } }).__audio = {
      scheduled: () => audioManager.getScheduledCount(),
    };

    // __addTarget: place a damageable dummy entity directly in front of the
    // player at a specified distance. For E2E audio tests — adds a hitscan
    // target without modifying sim source.
    (window as Window & { __addTarget?: (distanceM: number) => void }).__addTarget = (
      distanceM: number,
    ) => {
      const snap = snapshot(world);
      const yaw = snap.player.yaw;
      // Place target in the direction the player is facing (forward = −Z in yaw basis)
      const tx = snap.player.position.x + Math.sin(yaw) * distanceM;
      const ty = snap.player.position.y; // same eye height level
      const tz = snap.player.position.z - Math.cos(yaw) * distanceM;
      world.ecs.add({
        position: { x: tx, y: ty, z: tz },
        health: 100,
        damageable: true,
      });
    };
  }

  await renderer.init();
  probe.backend = renderer.backend;
  renderer.resize();
  globalThis.addEventListener?.('resize', () => renderer.resize());

  // First frame, then go live.
  renderSync.apply(renderer, 1);
  renderer.render();
  hud.update(snapshot(world));
  loop.start();

  document.getElementById('boot')?.classList.add('hidden');
  markReady(true);
}

main().catch((err: unknown) => {
  console.error('NEON BREACH failed to start:', err);
});
