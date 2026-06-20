import { CommandBuffer, createWorld, snapshot, step, type Command, type SimWorld } from '../sim';
import { createTestLevel } from '../sim/levels/testLevel';
import { createMantleTestLevel } from '../sim/levels/mantleTestLevel';
import { GameRenderer } from '../presentation/rendering/renderer';
import { RenderSync } from '../presentation/view/renderSync';
import { Hud, injectHudStyles } from '../presentation/ui/hud';
import { PointerLook } from '../presentation/input-capture/pointerLook';
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

  // Wire pointer-lock look capture: click canvas → lock, raw mouse → LookCommands.
  const pointerLook = new PointerLook(canvas, commands, { sens: 2.0 });

  await renderer.init();
  probe.backend = renderer.backend;
  renderer.resize();
  globalThis.addEventListener?.('resize', () => renderer.resize());
  // Expose pointer lock instance for settings (e.g. sensitivity change).
  (canvas as unknown as { _pointerLook?: PointerLook })._pointerLook = pointerLook;

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
