import { CommandBuffer, createWorld, snapshot, step, type Command, type SimWorld } from '../sim';
import { createTestLevel } from '../sim/levels/testLevel';
import { createMantleTestLevel } from '../sim/levels/mantleTestLevel';
import { GameRenderer } from '../presentation/rendering/renderer';
import { RenderSync } from '../presentation/view/renderSync';
import { Hud, injectHudStyles } from '../presentation/ui/hud';
import {
  Hitmarker,
  injectHitmarkerStyles,
  type HitmarkerVariant,
} from '../presentation/ui/hitmarker';
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

  // T-120: hitmarker_test scenario — three target bots at known positions so the
  // E2E test can fire with precise aim and verify all hitmarker variants.
  //
  // All bots placed 3 m in front (z=-3) but at different x offsets so they can
  // be targeted individually by rotating yaw. Player default: eye at (0,1.7,0).
  //
  //   Bot A x=0,  z=-3, health=100: chest hit (no head, not lethal) → 'normal'
  //   Bot B x=3,  z=-3, health=100: head hit (not lethal)            → 'head'
  //   Bot C x=-3, z=-3, health=25:  body hit (lethal: 25*1.0=25 dmg) → 'kill'
  //
  // Aim angles (from player eye at (0,1.7,0), yaw measured from -Z axis):
  //   Bot A: yaw=0 (straight), pitch=atan2(1.7-1.4, 3)≈0.0997 rad (chest center)
  //   Bot B: yaw=π/4≈0.785 rad (right), pitch≈-0.00589 rad (head center up)
  //   Bot C: yaw=-π/4≈-0.785 rad (left), pitch≈atan2(1.7-0.925, 4.243)≈0.181 rad
  if (scenario === 'hitmarker_test') {
    // Bot A — body hit (chest, non-lethal, health=100)
    world.ecs.add({
      position: { x: 0, y: 1.7, z: -3 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 100,
      damageable: true,
    });
    // Bot B — headshot (non-lethal, health=100)
    world.ecs.add({
      position: { x: 3, y: 1.7, z: -3 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 100,
      damageable: true,
    });
    // Bot C — kill shot (lethal: stomach hit=25*1.0=25, exactly kills health=25)
    world.ecs.add({
      position: { x: -3, y: 1.7, z: -3 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 25,
      damageable: true,
    });
  }

  const commands = new CommandBuffer();
  const renderSync = new RenderSync();
  const probe = new FrameProbe();
  const renderer = new GameRenderer(canvas);

  // HUD overlay — lives in DOM outside #game canvas so V4 visual baseline is unaffected.
  injectHudStyles();
  const hud = new Hud(document.body);

  // Hitmarker overlay — DOM outside #game canvas (T-120).
  injectHitmarkerStyles();
  const hitmarker = new Hitmarker(document.body);

  // Subscribe to sim 'hit' events; determine variant and show hitmarker.
  // kill > head > normal: if the hit is lethal, always use kill variant.
  world.events.on('hit', (evt) => {
    let variant: HitmarkerVariant;
    if (evt.lethal) {
      variant = 'kill';
    } else if (evt.region === 'head') {
      variant = 'head';
    } else {
      variant = 'normal';
    }
    hitmarker.show(variant);
    // T-120: expose for test instrumentation (stripped from production builds
    // via the same DEV / test guard used by installInstrumentation).
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      window.__lastHitmarker = variant;
    }
  });

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
