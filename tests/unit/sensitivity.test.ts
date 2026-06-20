/**
 * T-106 — V2 unit tests for src/sim/input/sensitivity.ts
 *
 * Acceptance criteria:
 * - mouseToAngles is deterministic and linear.
 * - Same input ⇒ same output (determinism).
 * - Concrete expected dyaw for a given movementX + sens.
 * - cm360/eDPI return known values for known dpi/sens.
 * - NO acceleration: 2× movement ⇒ exactly 2× angle.
 */
import { describe, it, expect } from 'vitest';
import { mouseToAngles, cm360, eDPI, SOURCE_YAW_CONST } from '../../src/sim/input/sensitivity';

const DEG_TO_RAD = Math.PI / 180;

describe('mouseToAngles', () => {
  it('is deterministic — same inputs always produce the same output', () => {
    const a = mouseToAngles(100, 50, 1.5);
    const b = mouseToAngles(100, 50, 1.5);
    expect(a.dyaw).toBe(b.dyaw);
    expect(a.dpitch).toBe(b.dpitch);
  });

  it('produces the exact yaw delta using Source formula (sens=1.0, movementX=100)', () => {
    // Expected: 100 * 1.0 * 0.022 * (Math.PI/180)
    const expected = 100 * 1.0 * SOURCE_YAW_CONST * DEG_TO_RAD;
    // = 0.03839724354387525
    const { dyaw } = mouseToAngles(100, 0, 1.0);
    // 0.038397243543875254 loses precision; compare via toBeCloseTo
    expect(dyaw).toBeCloseTo(0.03839724354387525, 12);
    expect(dyaw).toBe(expected);
  });

  it('produces the exact pitch delta using Source formula (sens=1.0, movementY=50)', () => {
    // Expected: 50 * 1.0 * 0.022 * (Math.PI/180)
    const expected = 50 * 1.0 * SOURCE_YAW_CONST * DEG_TO_RAD;
    const { dpitch } = mouseToAngles(0, 50, 1.0);
    expect(dpitch).toBe(expected);
  });

  it('is linear — 2× movement produces exactly 2× angle (no acceleration)', () => {
    const a = mouseToAngles(100, 50, 2.0);
    const b = mouseToAngles(200, 100, 2.0);
    // Strict equality: floating point should be exact because it's purely linear.
    expect(b.dyaw).toBe(2 * a.dyaw);
    expect(b.dpitch).toBe(2 * a.dpitch);
  });

  it('scales linearly with sensitivity — sens=2 is exactly 2× sens=1', () => {
    const a = mouseToAngles(50, 30, 1.0);
    const b = mouseToAngles(50, 30, 2.0);
    expect(b.dyaw).toBe(2 * a.dyaw);
    expect(b.dpitch).toBe(2 * a.dpitch);
  });

  it('returns zero for zero movement', () => {
    const { dyaw, dpitch } = mouseToAngles(0, 0, 2.0);
    expect(dyaw).toBe(0);
    expect(dpitch).toBe(0);
  });

  it('invertY=false: positive movementY gives positive dpitch (look down)', () => {
    const { dpitch } = mouseToAngles(0, 10, 1.0, { invertY: false });
    expect(dpitch).toBeGreaterThan(0);
  });

  it('invertY=true: positive movementY gives negative dpitch (look up)', () => {
    const { dpitch } = mouseToAngles(0, 10, 1.0, { invertY: true });
    expect(dpitch).toBeLessThan(0);
  });

  it('invertY negates dpitch exactly', () => {
    const normal = mouseToAngles(0, 25, 1.5);
    const inverted = mouseToAngles(0, 25, 1.5, { invertY: true });
    expect(inverted.dpitch).toBe(-normal.dpitch);
    // dyaw is unchanged by invertY
    expect(inverted.dyaw).toBe(normal.dyaw);
  });

  it('dyaw is not affected by invertY', () => {
    const a = mouseToAngles(42, 0, 2.0);
    const b = mouseToAngles(42, 0, 2.0, { invertY: true });
    expect(b.dyaw).toBe(a.dyaw);
  });

  it('sens=2.5, movementX=10: exact dyaw matches formula', () => {
    // 10 * 2.5 * 0.022 * (PI/180) = 0.009599310885968812
    const expected = 10 * 2.5 * SOURCE_YAW_CONST * DEG_TO_RAD;
    const { dyaw } = mouseToAngles(10, 0, 2.5);
    expect(dyaw).toBe(expected);
    expect(dyaw).toBeCloseTo(0.009599310885968812, 14);
  });
});

describe('cm360', () => {
  it('returns the correct cm/360 for 400 DPI, sens=2.0', () => {
    // degsPerCount = 2.0 * 0.022 = 0.044
    // countsPerCm = 400 / 2.54 ≈ 157.4803...
    // cm360 = 360 / 0.044 / 157.4803... ≈ 51.9545...
    const result = cm360(400, 2.0);
    expect(result).toBeCloseTo(51.9545, 3);
  });

  it('returns the correct cm/360 for 800 DPI, sens=1.0 (same eDPI as above)', () => {
    // Same eDPI (800) so same cm/360
    const result = cm360(800, 1.0);
    expect(result).toBeCloseTo(51.9545, 3);
  });

  it('400 DPI sens=2.0 equals 800 DPI sens=1.0 (same eDPI → same cm/360)', () => {
    expect(cm360(400, 2.0)).toBe(cm360(800, 1.0));
  });

  it('higher DPI with same sens → lower cm/360 (more sensitive)', () => {
    expect(cm360(1600, 2.0)).toBeLessThan(cm360(400, 2.0));
  });

  it('higher sens with same DPI → lower cm/360 (more sensitive)', () => {
    expect(cm360(400, 4.0)).toBeLessThan(cm360(400, 2.0));
  });

  it('is deterministic', () => {
    expect(cm360(800, 2.5)).toBe(cm360(800, 2.5));
  });
});

describe('eDPI', () => {
  it('eDPI(400, 2.0) = 800', () => {
    expect(eDPI(400, 2.0)).toBe(800);
  });

  it('eDPI(800, 1.0) = 800', () => {
    expect(eDPI(800, 1.0)).toBe(800);
  });

  it('eDPI(1600, 0.5) = 800', () => {
    expect(eDPI(1600, 0.5)).toBe(800);
  });

  it('scales linearly with DPI', () => {
    expect(eDPI(400, 1.0) * 2).toBe(eDPI(800, 1.0));
  });

  it('scales linearly with sens', () => {
    expect(eDPI(400, 1.0) * 3).toBe(eDPI(400, 3.0));
  });

  it('is deterministic', () => {
    expect(eDPI(600, 2.5)).toBe(eDPI(600, 2.5));
  });
});

describe('mouseToAngles — replay / linearity stress', () => {
  it('accumulating many small moves = one large move (no drift)', () => {
    // Simulate what happens when mouse events arrive in small increments.
    // Sum of N small events should equal one big event.
    const N = 100;
    const totalX = 200;
    const totalY = 150;
    const sens = 1.8;
    const chunkX = totalX / N;
    const chunkY = totalY / N;

    let sumDyaw = 0;
    let sumDpitch = 0;
    for (let i = 0; i < N; i++) {
      const { dyaw, dpitch } = mouseToAngles(chunkX, chunkY, sens);
      sumDyaw += dyaw;
      sumDpitch += dpitch;
    }

    const single = mouseToAngles(totalX, totalY, sens);
    // Allow tiny floating-point accumulation error
    expect(sumDyaw).toBeCloseTo(single.dyaw, 10);
    expect(sumDpitch).toBeCloseTo(single.dpitch, 10);
  });
});
