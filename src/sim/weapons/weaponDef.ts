/**
 * WeaponDef — single source of truth for all weapon parameters.
 *
 * Fields match research/03 §8.2 exactly. No three/DOM imports.
 * This is pure data + functions; deterministic; no Math.random / Date.now.
 *
 * Usage:
 *   - `fireInterval(def)` derives the inter-shot interval in seconds from rpm.
 *   - `validateWeapon(def)` returns a list of validation errors (empty = valid).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Weapon class grouping (affects defaults and balance). */
export type WeaponClass = 'rifle' | 'smg' | 'lmg' | 'shotgun' | 'sniper' | 'pistol' | 'launcher';

/** Fire mode semantics. */
export type FireMode = 'auto' | 'semi' | 'burst' | 'pump' | 'bolt';

/** Hit detection model for this weapon. */
export type HitType = 'hitscan' | 'projectile';

/**
 * One step in the damage falloff curve (stepwise brackets, research/03 §5.4).
 * Entries must be sorted ascending by range.
 */
export interface FalloffEntry {
  /** Range threshold in meters. */
  readonly range: number;
  /** Damage value at (and up to) this range. */
  readonly dmg: number;
}

/** Per-region damage multipliers (head > chest > stomach > limb). */
export interface DamageMult {
  readonly head: number;
  readonly chest: number;
  readonly stomach: number;
  readonly limb: number;
}

/** Spread cone state (all values are cone half-angles in degrees). */
export interface SpreadParams {
  /** Hip-fire while standing still (first-shot accuracy base). */
  readonly hipStand: number;
  /** ADS while standing still. */
  readonly ads: number;
  /** Added spread while walking. */
  readonly walkAdd: number;
  /** Added spread while sprinting (before sprint-to-fire reset). */
  readonly sprintAdd: number;
  /** Added spread while airborne. */
  readonly jumpAdd: number;
  /** Bloom added per consecutive shot fired. */
  readonly perShotAdd: number;
  /** Exponential bloom decay rate (1/s). */
  readonly decay: number;
  /** Maximum spread clamp (degrees). */
  readonly max: number;
}

/**
 * One recoil pattern entry — the aim offset (in degrees) applied to the gun's
 * point-of-aim for shot i (0-indexed). pitch positive = up, yaw positive = right.
 */
export interface RecoilPatternEntry {
  readonly p: number; // pitch kick (degrees)
  readonly y: number; // yaw kick (degrees)
}

/**
 * Projectile travel parameters (only used when hitType === 'projectile').
 * For hitscan weapons this field is null.
 */
export interface ProjectileParams {
  readonly speed: number; // m/s
  readonly gravity: number; // m/s² downward (positive)
  readonly lifetime: number; // seconds before despawn
}

/**
 * WeaponDef — complete, self-contained data block for one weapon.
 * Matches research/03 §8.2 field-for-field.
 */
export interface WeaponDef {
  /** Unique string key used as the registry key. */
  readonly id: string;
  /** Weapon class (used for default tuning and UI grouping). */
  readonly class: WeaponClass;
  /** How the trigger behaves. */
  readonly fireMode: FireMode;

  // ── Fire rate ──────────────────────────────────────────────────────────────
  /** Rounds per minute. Use `fireInterval(def)` for the derived interval. */
  readonly rpm: number;

  // ── Damage ────────────────────────────────────────────────────────────────
  /** Damage at close range (within first falloff bracket). */
  readonly damageClose: number;
  /**
   * Stepwise damage falloff curve.
   * Entries must be sorted ascending by range.
   * Final entry's dmg is the minimum ("beyond" damage).
   */
  readonly falloff: readonly FalloffEntry[];
  /** Per-region multipliers. */
  readonly mult: DamageMult;

  // ── Magazine / reload ──────────────────────────────────────────────────────
  readonly magSize: number;
  readonly reserve: number;
  readonly reloadTime: number; // seconds
  readonly drawTime: number; // seconds (first equip)
  readonly swapTime: number; // seconds (weapon switch lockout)

  // ── Accuracy (spread cone) ─────────────────────────────────────────────────
  readonly spread: SpreadParams;
  /**
   * When true, the first shot from a standing-still hipfire position is pinpoint
   * (spread is not sampled — the ray goes straight). CS2 / Valorant model.
   */
  readonly firstShotAccurate: boolean;

  // ── Recoil ────────────────────────────────────────────────────────────────
  /**
   * Per-shot aim offset pattern (degrees). Index = shot number (0-indexed).
   * Shots beyond the array length repeat the last entry ± recoilTailRandom.
   */
  readonly recoilPattern: readonly RecoilPatternEntry[];
  /**
   * After the pattern ends, add ±this value (degrees) per axis as random noise
   * (Valorant-style tail randomness). Requires the seeded PRNG to remain deterministic.
   */
  readonly recoilTailRandom: number;
  /** Grace period (s) after last shot before aim auto-recovery begins. */
  readonly recoilRecoveryDelay: number;
  /** Exponential aim recovery speed (1/s). */
  readonly recoilRecoverySpeed: number;
  /**
   * Fraction of accumulated aim offset automatically recovered (0 = full-skill CS2,
   * 1 = full auto-assist). Recommended 0.5–0.7 for accessibility.
   */
  readonly autoRecoverFraction: number;
  /**
   * Fraction of aim recoil applied as additional visual (camera) punch. Does not
   * affect bullet direction. Recommended 0.25–0.40.
   */
  readonly visualKickMult: number;

  // ── ADS / handling ────────────────────────────────────────────────────────
  /** Time (s) to transition into ADS. */
  readonly adsTime: number;
  /** ADS FOV = base FOV * adsFovScale (< 1 = zoomed in). */
  readonly adsFovScale: number;
  /** Move speed multiplier while ADS. */
  readonly adsMoveMult: number;
  /** Aim recoil multiplier while ADS. */
  readonly adsRecoilMult: number;
  /** Spread multiplier while ADS (near-zero for most weapons). */
  readonly adsSpreadMult: number;

  // ── Hit model ─────────────────────────────────────────────────────────────
  /** Whether bullets are instant hitscan rays or simulated projectiles. */
  readonly hitType: HitType;
  /**
   * Projectile travel params. null when hitType === 'hitscan'.
   */
  readonly projectile: ProjectileParams | null;
  /**
   * Penetration power (CS2 model: rifles 2.0, pistols/SMG/shotgun 1.0, sniper 2.5).
   * Used together with surface material penetration values in the combat system.
   */
  readonly penPower: number;

  // ── Movement ──────────────────────────────────────────────────────────────
  /**
   * Move speed multiplier while this weapon is held (per research/03 §7.1):
   * knife/empty ~1.0, AR ~0.85, LMG/sniper ~0.75.
   */
  readonly moveMult: number;

  // ── Feel ──────────────────────────────────────────────────────────────────
  /**
   * Trauma added to the screenshake accumulator on each shot fired (research/03 §6.3).
   * Recommended 0.05–0.10 for primary weapons.
   */
  readonly shakeOnFire: number;
  /**
   * Show a tracer every N shots (e.g. 2 = every other shot). Allows readability
   * tuning without affecting gameplay.
   */
  readonly tracerEvery: number;
}

// ── Derived helpers ───────────────────────────────────────────────────────────

/**
 * Derive inter-shot interval in seconds from rpm.
 *   fireInterval(600 rpm) === 0.1 s
 */
export function fireInterval(def: WeaponDef): number {
  return 60 / def.rpm;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a WeaponDef and return a list of human-readable error strings.
 * An empty array means the def is valid.
 *
 * Checks:
 *   - rpm > 0
 *   - magSize > 0
 *   - reserve >= 0
 *   - reloadTime > 0
 *   - drawTime > 0
 *   - swapTime > 0
 *   - all mult values > 0
 *   - falloff sorted ascending by range
 *   - recoilPattern non-empty
 *   - recoilTailRandom >= 0
 *   - recoilRecoveryDelay >= 0
 *   - recoilRecoverySpeed > 0
 *   - autoRecoverFraction in [0, 1]
 *   - visualKickMult >= 0
 *   - spread.decay > 0
 *   - spread.max > 0
 *   - penPower >= 0
 *   - moveMult > 0
 *   - shakeOnFire >= 0
 *   - tracerEvery >= 1
 *   - hitType === 'projectile' → projectile !== null
 *   - hitType === 'hitscan' → projectile === null (or warn)
 */
export function validateWeapon(def: WeaponDef): string[] {
  const errors: string[] = [];
  const tag = `[${def.id}]`;

  if (def.rpm <= 0) errors.push(`${tag} rpm must be > 0, got ${def.rpm}`);
  if (def.magSize <= 0) errors.push(`${tag} magSize must be > 0, got ${def.magSize}`);
  if (def.reserve < 0) errors.push(`${tag} reserve must be >= 0, got ${def.reserve}`);
  if (def.reloadTime <= 0) errors.push(`${tag} reloadTime must be > 0, got ${def.reloadTime}`);
  if (def.drawTime <= 0) errors.push(`${tag} drawTime must be > 0, got ${def.drawTime}`);
  if (def.swapTime <= 0) errors.push(`${tag} swapTime must be > 0, got ${def.swapTime}`);

  // Damage multipliers
  if (def.mult.head <= 0) errors.push(`${tag} mult.head must be > 0, got ${def.mult.head}`);
  if (def.mult.chest <= 0) errors.push(`${tag} mult.chest must be > 0, got ${def.mult.chest}`);
  if (def.mult.stomach <= 0)
    errors.push(`${tag} mult.stomach must be > 0, got ${def.mult.stomach}`);
  if (def.mult.limb <= 0) errors.push(`${tag} mult.limb must be > 0, got ${def.mult.limb}`);

  // Falloff must be ascending by range
  for (let i = 1; i < def.falloff.length; i++) {
    const prev = def.falloff[i - 1]!;
    const curr = def.falloff[i]!;
    if (curr.range <= prev.range) {
      errors.push(
        `${tag} falloff entries must be sorted ascending by range; ` +
          `entry ${i} (range=${curr.range}) <= entry ${i - 1} (range=${prev.range})`,
      );
    }
  }

  // Recoil
  if (def.recoilPattern.length === 0) {
    errors.push(`${tag} recoilPattern must be non-empty`);
  }
  if (def.recoilTailRandom < 0) {
    errors.push(`${tag} recoilTailRandom must be >= 0, got ${def.recoilTailRandom}`);
  }
  if (def.recoilRecoveryDelay < 0) {
    errors.push(`${tag} recoilRecoveryDelay must be >= 0, got ${def.recoilRecoveryDelay}`);
  }
  if (def.recoilRecoverySpeed <= 0) {
    errors.push(`${tag} recoilRecoverySpeed must be > 0, got ${def.recoilRecoverySpeed}`);
  }
  if (def.autoRecoverFraction < 0 || def.autoRecoverFraction > 1) {
    errors.push(`${tag} autoRecoverFraction must be in [0, 1], got ${def.autoRecoverFraction}`);
  }
  if (def.visualKickMult < 0) {
    errors.push(`${tag} visualKickMult must be >= 0, got ${def.visualKickMult}`);
  }

  // Spread
  if (def.spread.decay <= 0) {
    errors.push(`${tag} spread.decay must be > 0, got ${def.spread.decay}`);
  }
  if (def.spread.max <= 0) {
    errors.push(`${tag} spread.max must be > 0, got ${def.spread.max}`);
  }

  // Hit model
  if (def.hitType === 'projectile' && def.projectile === null) {
    errors.push(`${tag} hitType is 'projectile' but projectile params are null`);
  }

  // Other
  if (def.penPower < 0) errors.push(`${tag} penPower must be >= 0, got ${def.penPower}`);
  if (def.moveMult <= 0) errors.push(`${tag} moveMult must be > 0, got ${def.moveMult}`);
  if (def.shakeOnFire < 0) errors.push(`${tag} shakeOnFire must be >= 0, got ${def.shakeOnFire}`);
  if (def.tracerEvery < 1) errors.push(`${tag} tracerEvery must be >= 1, got ${def.tracerEvery}`);

  return errors;
}
