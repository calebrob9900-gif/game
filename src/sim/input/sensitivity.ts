/**
 * Sensitivity math for raw mouse input → yaw/pitch deltas.
 *
 * Pure deterministic functions — no DOM, no Math.random(), no Date.now().
 * Source-style yaw constant (sens × 0.022 degrees per count).
 * References: docs/research/03-gunplay.md §3.3
 *
 * Formula from research/03 §3.3:
 *   yawDelta(deg)   = movementX × (sens × 0.022)
 *   pitchDelta(deg) = movementY × (sens × 0.022) × (invertY ? -1 : 1)
 *
 * No acceleration, no smoothing — 1:1 raw input to angle.
 */

/** Options for mouseToAngles conversion. */
export interface SensitivityOptions {
  /** Invert the pitch axis (default: false — mouse up = look up). */
  invertY?: boolean;
}

/** Result of mouseToAngles: both deltas in radians. */
export interface AngleDelta {
  /** Yaw rotation delta in radians (positive = turn right). */
  dyaw: number;
  /** Pitch rotation delta in radians (positive = look down without invert). */
  dpitch: number;
}

/**
 * The Source-engine yaw constant: degrees of rotation per mouse count per unit sensitivity.
 * Reference: CS/Source "cl_yawspeed" / raw mouse formula: deg = movementX × sens × YAW_CONST
 * Value 0.022 is the established constant from Source games (research/03 §3.3).
 */
export const SOURCE_YAW_CONST = 0.022;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert raw mouse deltas to yaw/pitch angle deltas in radians.
 *
 * Uses Source-style formula: degrees = movement × sens × SOURCE_YAW_CONST
 * Then converts to radians. No acceleration, no smoothing.
 *
 * @param movementX  Raw mouse X delta (pixels/counts), from Pointer Lock movementX.
 * @param movementY  Raw mouse Y delta (pixels/counts), from Pointer Lock movementY.
 * @param sens       In-game sensitivity (dimensionless multiplier, Source-style ~1–5).
 * @param opts       Optional: invertY.
 * @returns          { dyaw, dpitch } in radians.
 */
export function mouseToAngles(
  movementX: number,
  movementY: number,
  sens: number,
  opts?: SensitivityOptions,
): AngleDelta {
  const scale = sens * SOURCE_YAW_CONST * DEG_TO_RAD;
  const dyaw = movementX * scale;
  // Mouse Y down = positive movementY = look down (pitch increases).
  // With invertY=true, mouse Y down = look up.
  const pitchSign = opts?.invertY ? -1 : 1;
  const dpitch = movementY * scale * pitchSign;
  return { dyaw, dpitch };
}

/**
 * Compute cm/360: centimetres of mouse travel for one full 360° rotation.
 *
 * Formula: cm/360 = 360 / (degsPerCount) / (DPI / 2.54)
 *   where degsPerCount = sens × SOURCE_YAW_CONST
 *
 * @param dpi   Mouse DPI setting.
 * @param sens  In-game sensitivity.
 * @returns     cm/360 value.
 */
export function cm360(dpi: number, sens: number): number {
  const degsPerCount = sens * SOURCE_YAW_CONST;
  const countsPerCm = dpi / 2.54;
  return 360 / degsPerCount / countsPerCm;
}

/**
 * Compute eDPI (effective DPI): a single number expressing the combined effect
 * of DPI and in-game sensitivity for comparison across setups.
 *
 * eDPI = DPI × sens
 *
 * @param dpi   Mouse DPI setting.
 * @param sens  In-game sensitivity.
 * @returns     eDPI value.
 */
export function eDPI(dpi: number, sens: number): number {
  return dpi * sens;
}
