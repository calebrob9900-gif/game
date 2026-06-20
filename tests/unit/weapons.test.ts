/**
 * T-110 — Data-driven weapon schema tests (V2).
 *
 * Verifier: V2 (logic/unit).
 * Tests:
 *   1. validateWeapon returns [] for the AR baseline (valid def).
 *   2. validateWeapon returns errors for a deliberately broken def (rpm=0).
 *   3. AR loads from registry with concrete expected field values.
 *   4. ttkBody(AR) ≈ 0.30 s  (4 STK, (4-1)/(600/60)=0.30).
 *   5. fireInterval(AR) === 0.1 s.
 */

import { describe, it, expect } from 'vitest';
import {
  AR_BASELINE,
  WEAPON_REGISTRY,
  getWeapon,
  ttkBody,
  fireInterval,
  validateWeapon,
} from '../../src/sim';
import type { WeaponDef } from '../../src/sim';

// ── 1. Validation: valid AR ────────────────────────────────────────────────────

describe('validateWeapon — AR_BASELINE (valid)', () => {
  it('returns an empty array for the AR baseline def', () => {
    const errors = validateWeapon(AR_BASELINE);
    expect(errors).toEqual([]);
  });
});

// ── 2. Validation: broken def ─────────────────────────────────────────────────

describe('validateWeapon — broken defs', () => {
  /**
   * Build a broken def from AR_BASELINE with specific fields overridden.
   * We use `as unknown as WeaponDef` to force invalid values past TypeScript.
   */
  function brokenDef(overrides: Record<string, unknown>): WeaponDef {
    return { ...AR_BASELINE, ...overrides } as unknown as WeaponDef;
  }

  it('reports an error when rpm === 0', () => {
    const errors = validateWeapon(brokenDef({ rpm: 0 }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('rpm'))).toBe(true);
  });

  it('reports an error when rpm is negative', () => {
    const errors = validateWeapon(brokenDef({ rpm: -100 }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('rpm'))).toBe(true);
  });

  it('reports an error when magSize === 0', () => {
    const errors = validateWeapon(brokenDef({ magSize: 0 }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('magSize'))).toBe(true);
  });

  it('reports an error when mult.head === 0', () => {
    const errors = validateWeapon(
      brokenDef({ mult: { head: 0, chest: 1.1, stomach: 1.0, limb: 0.85 } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('mult.head'))).toBe(true);
  });

  it('reports an error when falloff is not sorted ascending by range', () => {
    const errors = validateWeapon(
      brokenDef({
        falloff: [
          { range: 45, dmg: 16 },
          { range: 18, dmg: 25 }, // reversed order
        ],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('falloff'))).toBe(true);
  });

  it('reports an error when recoilPattern is empty', () => {
    const errors = validateWeapon(brokenDef({ recoilPattern: [] }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('recoilPattern'))).toBe(true);
  });

  it('reports an error when hitType is projectile but projectile params are null', () => {
    const errors = validateWeapon(brokenDef({ hitType: 'projectile', projectile: null }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('projectile'))).toBe(true);
  });

  it('reports multiple errors at once for a badly broken def', () => {
    // rpm=0 AND magSize=0 — should get at least 2 errors
    const errors = validateWeapon(brokenDef({ rpm: 0, magSize: 0 }));
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 3. AR loads from registry with concrete expected values ────────────────────

describe('AR_BASELINE — concrete field values', () => {
  it('is found in WEAPON_REGISTRY by id', () => {
    expect(WEAPON_REGISTRY.has('ar_baseline')).toBe(true);
    expect(WEAPON_REGISTRY.get('ar_baseline')).toBe(AR_BASELINE);
  });

  it('getWeapon("ar_baseline") returns the same object', () => {
    expect(getWeapon('ar_baseline')).toBe(AR_BASELINE);
  });

  it('getWeapon throws for unknown ids', () => {
    expect(() => getWeapon('not_a_real_weapon')).toThrow();
  });

  // Concrete expected values from research/03 §5.3 + §8.2
  it('damageClose === 25', () => {
    expect(AR_BASELINE.damageClose).toBe(25);
  });

  it('mult.head === 1.5', () => {
    expect(AR_BASELINE.mult.head).toBe(1.5);
  });

  it('mult.chest === 1.1', () => {
    expect(AR_BASELINE.mult.chest).toBe(1.1);
  });

  it('mult.stomach === 1.0', () => {
    expect(AR_BASELINE.mult.stomach).toBe(1.0);
  });

  it('mult.limb === 0.85', () => {
    expect(AR_BASELINE.mult.limb).toBe(0.85);
  });

  it('rpm === 600', () => {
    expect(AR_BASELINE.rpm).toBe(600);
  });

  it('magSize === 30', () => {
    expect(AR_BASELINE.magSize).toBe(30);
  });

  it('reserve === 120', () => {
    expect(AR_BASELINE.reserve).toBe(120);
  });

  it('reloadTime === 2.1', () => {
    expect(AR_BASELINE.reloadTime).toBeCloseTo(2.1);
  });

  it('class === "rifle"', () => {
    expect(AR_BASELINE.class).toBe('rifle');
  });

  it('fireMode === "auto"', () => {
    expect(AR_BASELINE.fireMode).toBe('auto');
  });

  it('hitType === "hitscan"', () => {
    expect(AR_BASELINE.hitType).toBe('hitscan');
  });

  it('projectile === null (hitscan weapon)', () => {
    expect(AR_BASELINE.projectile).toBeNull();
  });

  it('penPower === 2.0 (rifle pen power per research/03 §4.3)', () => {
    expect(AR_BASELINE.penPower).toBe(2.0);
  });

  it('moveMult === 0.85 (AR move penalty per research/03 §7.1)', () => {
    expect(AR_BASELINE.moveMult).toBe(0.85);
  });

  it('firstShotAccurate === true', () => {
    expect(AR_BASELINE.firstShotAccurate).toBe(true);
  });

  it('falloff has exactly 2 entries, sorted ascending', () => {
    expect(AR_BASELINE.falloff).toHaveLength(2);
    expect(AR_BASELINE.falloff[0]!.range).toBe(18);
    expect(AR_BASELINE.falloff[0]!.dmg).toBe(25);
    expect(AR_BASELINE.falloff[1]!.range).toBe(45);
    expect(AR_BASELINE.falloff[1]!.dmg).toBe(16);
  });

  it('recoilPattern has 8 entries (deterministic shots per research/03 §1.2)', () => {
    expect(AR_BASELINE.recoilPattern).toHaveLength(8);
  });

  it('recoilPattern[0] is {p:0, y:0} (no kick on first shot)', () => {
    expect(AR_BASELINE.recoilPattern[0]).toEqual({ p: 0.0, y: 0.0 });
  });

  it('spread.hipStand === 2.0 (research/03 §2.2 + §8.2)', () => {
    expect(AR_BASELINE.spread.hipStand).toBe(2.0);
  });

  it('spread.ads === 0.05', () => {
    expect(AR_BASELINE.spread.ads).toBe(0.05);
  });

  it('spread.decay === 8', () => {
    expect(AR_BASELINE.spread.decay).toBe(8);
  });

  it('adsTime === 0.24', () => {
    expect(AR_BASELINE.adsTime).toBeCloseTo(0.24);
  });

  it('adsFovScale === 0.80', () => {
    expect(AR_BASELINE.adsFovScale).toBe(0.8);
  });
});

// ── 4. TTK for AR is in the research band ─────────────────────────────────────

describe('ttkBody — AR TTK in research band', () => {
  /**
   * research/03 §5.3: AR TTK body ~0.30 s
   *   STK = ceil(100/25) = 4
   *   TTK = (4-1)/(600/60) = 3/10 = 0.30 s
   */
  it('ttkBody(AR_BASELINE) === 0.30 s (2 decimal places)', () => {
    expect(ttkBody(AR_BASELINE)).toBeCloseTo(0.3, 2);
  });

  it('STK for AR is 4 shots (ceil(100/25))', () => {
    const stk = Math.ceil(100 / AR_BASELINE.damageClose);
    expect(stk).toBe(4);
  });

  it('TTK math: (STK-1)/(rpm/60) === 0.30', () => {
    const stk = Math.ceil(100 / AR_BASELINE.damageClose); // 4
    const rps = AR_BASELINE.rpm / 60; // 10
    const ttk = (stk - 1) / rps; // 0.30
    expect(ttk).toBeCloseTo(0.3, 10); // exact
  });
});

// ── 5. fireInterval ────────────────────────────────────────────────────────────

describe('fireInterval', () => {
  it('fireInterval(AR_BASELINE) === 0.1 s (60/600)', () => {
    expect(fireInterval(AR_BASELINE)).toBe(0.1);
  });

  it('fireInterval is derivable as 60/rpm', () => {
    expect(fireInterval(AR_BASELINE)).toBe(60 / AR_BASELINE.rpm);
  });

  it('fireInterval for a hypothetical 120 rpm weapon is 0.5', () => {
    const mockDef = { ...AR_BASELINE, rpm: 120 } as WeaponDef;
    expect(fireInterval(mockDef)).toBeCloseTo(0.5, 10);
  });
});
