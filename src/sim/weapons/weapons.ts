/**
 * Weapon registry — all weapon definitions keyed by id.
 *
 * AR values taken directly from research/03:
 *   §5.3 damage table: damageClose 25, head×1.5, chest×1.1, limb×0.85, rpm 600, STK 4, TTK ~0.30s
 *   §5.4 falloff: near 18m → 25 dmg, far 45m → 16 dmg
 *   §8.2 data block: magSize 30, reserve 120, reloadTime 2.1, drawTime 0.5, swapTime 0.4,
 *                    spread hipStand 2.0 / ads 0.05 / walkAdd 1.5 / sprintAdd 4.0 / jumpAdd 7.0 /
 *                    perShotAdd 0.15 / decay 8 / max 10,
 *                    recoilPattern (first 8 entries from §1.2), recoilTailRandom 0.35,
 *                    recoilRecoveryDelay 0.08, recoilRecoverySpeed 10, autoRecoverFraction 0.6,
 *                    visualKickMult 0.30, adsTime 0.24, adsFovScale 0.80, adsMoveMult 0.6,
 *                    adsRecoilMult 0.5, adsSpreadMult 0.03, hitType hitscan, penPower 2.0,
 *                    moveMult 0.85, shakeOnFire 0.06, tracerEvery 2
 *
 * No three/DOM imports; pure data.
 */

import type { WeaponDef } from './weaponDef';
import { fireInterval } from './weaponDef';

// ── AR baseline ───────────────────────────────────────────────────────────────

/**
 * Baseline Assault Rifle — the canonical reference weapon for tuning / testing.
 * All numbers are pinned to research/03 §5.3 + §8.2.
 *
 * TTK body = (ceil(100/25) - 1) / (600/60) = (4-1)/10 = 0.30 s
 */
export const AR_BASELINE: WeaponDef = {
  id: 'ar_baseline',
  class: 'rifle',
  fireMode: 'auto',

  // Fire rate
  rpm: 600,

  // Damage (research/03 §5.3 + §5.4)
  damageClose: 25,
  falloff: [
    { range: 18, dmg: 25 },
    { range: 45, dmg: 16 },
  ],
  mult: {
    head: 1.5,
    chest: 1.1,
    stomach: 1.0,
    limb: 0.85,
  },

  // Magazine / reload (research/03 §8.2)
  magSize: 30,
  reserve: 120,
  reloadTime: 2.1,
  drawTime: 0.5,
  swapTime: 0.4,

  // Accuracy — spread cone half-angles in degrees (research/03 §2.2 + §8.2)
  spread: {
    hipStand: 2.0,
    ads: 0.05,
    walkAdd: 1.5,
    sprintAdd: 4.0,
    jumpAdd: 7.0,
    perShotAdd: 0.15,
    decay: 8,
    max: 10,
  },
  firstShotAccurate: true,

  // Recoil — pattern from research/03 §1.2 (8 deterministic shots, then tail)
  recoilPattern: [
    { p: 0.0, y: 0.0 }, // shot 1: no kick (fires before kick applied)
    { p: 0.45, y: 0.05 },
    { p: 0.55, y: -0.1 },
    { p: 0.6, y: -0.15 },
    { p: 0.62, y: 0.1 },
    { p: 0.62, y: 0.25 }, // begins drifting right
    { p: 0.55, y: 0.3 },
    { p: 0.5, y: 0.2 },
  ],
  recoilTailRandom: 0.35,
  recoilRecoveryDelay: 0.08,
  recoilRecoverySpeed: 10,
  autoRecoverFraction: 0.6,
  visualKickMult: 0.3,

  // ADS / handling (research/03 §3.1 + §8.2)
  adsTime: 0.24,
  adsFovScale: 0.8,
  adsMoveMult: 0.6,
  adsRecoilMult: 0.5,
  adsSpreadMult: 0.03,

  // Hit model (research/03 §4.1 + §4.3)
  hitType: 'hitscan',
  projectile: null,
  penPower: 2.0,

  // Movement penalty (research/03 §7.1 + §8.2)
  moveMult: 0.85,

  // Feel (research/03 §6.3 + §6.5 + §8.2)
  shakeOnFire: 0.06,
  tracerEvery: 2,
} as const;

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Map of all weapon defs keyed by their id.
 * Add new weapon defs here; the registry is the single source of truth.
 */
export const WEAPON_REGISTRY: ReadonlyMap<string, WeaponDef> = new Map<string, WeaponDef>([
  [AR_BASELINE.id, AR_BASELINE],
]);

/**
 * Look up a weapon def by id.
 * Throws if not found (fail-fast: missing ids are a programmer error).
 */
export function getWeapon(id: string): WeaponDef {
  const def = WEAPON_REGISTRY.get(id);
  if (def === undefined) {
    throw new Error(`getWeapon: unknown weapon id "${id}"`);
  }
  return def;
}

// ── TTK helpers ───────────────────────────────────────────────────────────────

/**
 * Time-to-kill against a 100 HP target hit only in the body (no multiplier).
 *
 *   STK = ceil(100 / damageClose)
 *   TTK = (STK - 1) / (rpm / 60)
 *
 * For AR: STK=ceil(100/25)=4, TTK=(4-1)/(600/60)=0.30 s
 */
export function ttkBody(def: WeaponDef): number {
  const stk = Math.ceil(100 / def.damageClose);
  return (stk - 1) / (def.rpm / 60);
}

// Re-export fireInterval for convenience
export { fireInterval };
