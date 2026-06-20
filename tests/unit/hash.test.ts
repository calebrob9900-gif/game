import { describe, it, expect } from 'vitest';
import { createWorld, hashWorld, step } from '../../src/sim';

describe('hashWorld', () => {
  it('is stable for an unchanged world', () => {
    const w = createWorld(1);
    expect(hashWorld(w)).toBe(hashWorld(w));
  });

  it('changes when the world changes', () => {
    const w = createWorld(1);
    const before = hashWorld(w);
    step(w, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    expect(hashWorld(w)).not.toBe(before);
  });

  it('matches for two worlds advanced identically', () => {
    const a = createWorld(99);
    const b = createWorld(99);
    const cmds = [{ type: 'move', forward: 1, right: 0.5, jump: true } as const];
    for (let i = 0; i < 10; i++) {
      step(a, cmds);
      step(b, cmds);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
