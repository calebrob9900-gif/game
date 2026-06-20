import { describe, it, expect } from 'vitest';
import { CommandBuffer, foldCommands, type Command } from '../../src/sim';

describe('command buffer + fold', () => {
  it('buffers and drains once', () => {
    const buf = new CommandBuffer();
    buf.push({ type: 'move', forward: 1, right: 0, jump: false });
    buf.push({ type: 'look', dyaw: 0.1, dpitch: 0 });
    expect(buf.size).toBe(2);
    const drained = buf.drain();
    expect(drained).toHaveLength(2);
    expect(buf.size).toBe(0);
    expect(buf.drain()).toHaveLength(0);
  });

  it('folds: last move wins, look deltas accumulate, jump latches', () => {
    const cmds: Command[] = [
      { type: 'move', forward: 1, right: 0, jump: false },
      { type: 'look', dyaw: 0.1, dpitch: 0.2 },
      { type: 'move', forward: 0, right: 1, jump: true },
      { type: 'look', dyaw: -0.05, dpitch: 0 },
    ];
    const input = foldCommands(cmds);
    expect(input.forward).toBe(0);
    expect(input.right).toBe(1);
    expect(input.jump).toBe(true);
    expect(input.dyaw).toBeCloseTo(0.05, 6);
    expect(input.dpitch).toBeCloseTo(0.2, 6);
  });

  it('clamps move axes to [-1,1]', () => {
    const input = foldCommands([{ type: 'move', forward: 5, right: -9, jump: false }]);
    expect(input.forward).toBe(1);
    expect(input.right).toBe(-1);
  });
});
