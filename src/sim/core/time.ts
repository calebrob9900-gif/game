/**
 * Fixed-timestep constants for the deterministic simulation.
 * Render interpolates between ticks; the sim itself is time-pure and only
 * ever advances by exactly DT (see docs/ARCHITECTURE.md §2).
 */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Clamp accumulated frame time to avoid the "spiral of death". */
export const MAX_FRAME_TIME = 0.25;

/**
 * Frame-rate-independent exponential decay factor in [0, 1).
 * Use `value += (target - value) * decay(lambda, dt)` instead of a raw per-frame lerp.
 */
export function decay(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}
