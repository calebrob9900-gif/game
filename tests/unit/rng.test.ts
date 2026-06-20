import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRng, rngNextFloat, rngNextU32, rngRange, rngInt, cloneRng } from '../../src/sim';

describe('seeded PRNG (sfc32)', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => rngNextU32(a));
    const seqB = Array.from({ length: 100 }, () => rngNextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 50 }, () => rngNextU32(a));
    const seqB = Array.from({ length: 50 }, () => rngNextU32(b));
    expect(seqA).not.toEqual(seqB);
  });

  it('cloneRng forks an independent identical stream', () => {
    const a = createRng(7);
    rngNextU32(a);
    const b = cloneRng(a);
    expect(rngNextU32(a)).toEqual(rngNextU32(b));
  });

  it('rngNextFloat stays in [0,1) (property)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const st = createRng(seed);
        for (let i = 0; i < 200; i++) {
          const f = rngNextFloat(st);
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThan(1);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('rngRange / rngInt respect bounds (property)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const st = createRng(seed);
        for (let i = 0; i < 100; i++) {
          const r = rngRange(st, -5, 5);
          expect(r).toBeGreaterThanOrEqual(-5);
          expect(r).toBeLessThan(5);
          const n = rngInt(st, 1, 6);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(6);
          expect(Number.isInteger(n)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });
});
