import { describe, it, expect } from 'vitest';
import { createWorld, hashWorld, snapshot, step, type Command } from '../../src/sim';

/**
 * The keystone V2 test: a recorded scenario (seed + per-tick input stream)
 * replays to a byte-identical world. Same inputs ⇒ identical tick count + hash,
 * twice. A changed hash later = a deliberate, reviewed behavior change.
 */
interface Replay {
  seed: number;
  ticks: number;
  inputs: Record<number, Command[]>;
}

const SCENARIO: Replay = {
  seed: 2024,
  ticks: 240,
  inputs: {
    0: [{ type: 'look', dyaw: 0.6, dpitch: -0.1 }],
    5: [{ type: 'move', forward: 1, right: 0, jump: false }],
    30: [{ type: 'move', forward: 1, right: 1, jump: true }],
    90: [{ type: 'move', forward: 0, right: 0, jump: false }],
    120: [{ type: 'look', dyaw: -1.2, dpitch: 0.3 }],
    150: [{ type: 'move', forward: -1, right: 0, jump: true }],
  },
};

function runReplay(r: Replay): { ticks: number; hash: string } {
  const world = createWorld(r.seed);
  for (let t = 0; t < r.ticks; t++) {
    step(world, r.inputs[t] ?? []);
  }
  return { ticks: world.tick, hash: hashWorld(world) };
}

describe('deterministic replay', () => {
  it('reproduces identical tick count and world hash across two runs', () => {
    const a = runReplay(SCENARIO);
    const b = runReplay(SCENARIO);
    expect(a.ticks).toBe(SCENARIO.ticks);
    expect(b.ticks).toBe(SCENARIO.ticks);
    expect(a.hash).toBe(b.hash);
  });

  it('matches the committed GOLDEN world hash (re-baseline is a reviewed act)', () => {
    // Pins the exact end-state of the recorded scenario. A change here means a
    // deliberate gameplay/physics change — re-baseline only via reviewed PR.
    // Re-baselined for T-101: capsule controller replaced flat-ground clamp.
    // Old hash: 968e8e8b (flat-ground), new hash: b9debaa4 (capsule+AABB model).
    const GOLDEN = 'b9debaa4';
    expect(runReplay(SCENARIO).hash).toBe(GOLDEN);
  });

  it('produces a different hash for a different seed', () => {
    const a = runReplay(SCENARIO);
    const b = runReplay({ ...SCENARIO, seed: SCENARIO.seed + 1 });
    expect(a.hash).not.toBe(b.hash);
  });

  it('moving forward advances the player along -Z (yaw 0)', () => {
    const world = createWorld(1);
    for (let i = 0; i < 60; i++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    const s = snapshot(world);
    expect(s.player.position.z).toBeLessThan(-0.5);
    expect(s.tick).toBe(60);
  });
});
