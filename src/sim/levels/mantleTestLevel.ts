/**
 * Programmatic mantle/vault test level for T-105 replay and E2E tests.
 *
 * Layout:
 *   - Ground: flat at y=0.
 *   - 1.0 m ledge: top surface at y=1.0, positioned at z=-5 (ahead of spawn).
 *     This ledge is > STEP_HEIGHT (0.4 m) and ≤ MAX_MANTLE_HEIGHT (1.3 m),
 *     so mantle auto-triggers when player walks into it from the south.
 *   - Back wall at z=-12 to stop player after climbing.
 *   - Spawn at (0, 0, 0), yaw=0 (facing -Z = forward).
 *
 * Used to verify vault/mantle acceptance criterion:
 *   Walk into the 1.0 m ledge → player ends up ON TOP (foot y ≈ 1.0),
 *   which STEP_HEIGHT=0.4 m alone cannot achieve.
 */
import type { LevelDescriptor } from './levelDescriptor';

export function createMantleTestLevel(): LevelDescriptor {
  return {
    name: 'mantle_test_level',
    bounds: {
      min: { x: -20, y: -1, z: -20 },
      max: { x: 20, y: 10, z: 20 },
    },
    colliders: [
      // Ground plane
      {
        center: { x: 0, y: -0.5, z: 0 },
        half: { x: 20, y: 0.5, z: 20 },
      },
      // 1.0 m ledge — top surface at y=1.0 (center y=0.5, half y=0.5)
      // Width 4 m, depth 4 m. Player at z=0 facing -Z hits face at z=-3.
      {
        center: { x: 0, y: 0.5, z: -5 },
        half: { x: 2, y: 0.5, z: 2 },
      },
      // Back wall to stop player after climbing the ledge
      {
        center: { x: 0, y: 2, z: -12 },
        half: { x: 10, y: 4, z: 1 },
      },
    ],
    spawns: [
      // Spawn at origin (foot y=0), yaw=0 → facing -Z (forward = toward ledge)
      { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
    ],
  };
}
