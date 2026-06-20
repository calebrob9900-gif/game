import { describe, it, expect } from 'vitest';
import { World, SystemRunner, defineSystem } from '../../src/sim';

interface E {
  pos?: { x: number };
  tag?: string;
}

describe('ECS (miniplex) + SystemRunner', () => {
  it('queries entities by component with a stable (deterministic) iteration order', () => {
    const world = new World<E>();
    world.add({ pos: { x: 1 } });
    world.add({ tag: 'a' });
    world.add({ pos: { x: 2 }, tag: 'b' });
    const xs = world.with('pos').entities.map((e) => e.pos?.x);
    expect(xs).toHaveLength(2);
    // membership (order is archetype-defined, not insertion order — that's fine)
    expect([...xs].sort()).toEqual([1, 2]);
    // determinism contract: querying again yields the IDENTICAL order
    expect(world.with('pos').entities.map((e) => e.pos?.x)).toEqual(xs);
  });

  it('runs systems in stable registration order', () => {
    const log: string[] = [];
    const runner = new SystemRunner<World<E>>()
      .add(defineSystem('input', () => log.push('input')))
      .add(defineSystem('physics', () => log.push('physics')))
      .add(defineSystem('render-sync', () => log.push('render-sync')));
    expect(runner.order).toEqual(['input', 'physics', 'render-sync']);
    const world = new World<E>();
    runner.run(world);
    runner.run(world);
    expect(log).toEqual(['input', 'physics', 'render-sync', 'input', 'physics', 'render-sync']);
  });
});
