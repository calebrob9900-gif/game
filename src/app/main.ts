import { CommandBuffer, createWorld, snapshot, step, type Command, type SimWorld } from '../sim';
import { GameRenderer } from '../presentation/rendering/renderer';
import { RenderSync } from '../presentation/view/renderSync';
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

  const { seed } = bootParams();
  const world: SimWorld = createWorld(seed);
  const commands = new CommandBuffer();
  const renderSync = new RenderSync();
  const probe = new FrameProbe();
  const renderer = new GameRenderer(canvas);

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

  await renderer.init();
  probe.backend = renderer.backend;
  renderer.resize();
  globalThis.addEventListener?.('resize', () => renderer.resize());

  // First frame, then go live.
  renderSync.apply(renderer, 1);
  renderer.render();
  loop.start();

  document.getElementById('boot')?.classList.add('hidden');
  markReady(true);
}

main().catch((err: unknown) => {
  console.error('NEON BREACH failed to start:', err);
});
