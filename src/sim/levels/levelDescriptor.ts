/**
 * Level descriptor types for the authoritative simulation.
 *
 * Collision is represented as axis-aligned box (AABB) primitives derived from
 * the level designer's layout. This keeps the sim free of three/WASM and fully
 * deterministic (see docs/decisions/0001-character-controller.md).
 *
 * Visual detail (high-poly GLB) is a presentation concern and references the
 * same descriptor by asset path.
 */

import type { Vec3 } from '../core/vec';

/** One axis-aligned box collider. center+half in world space (meters). */
export interface BoxCollider {
  /** Center of the box in world space. */
  readonly center: Vec3;
  /** Half-extents on each axis (always positive). */
  readonly half: Vec3;
}

/** A spawn point with a facing direction (yaw in radians). */
export interface SpawnPoint {
  readonly position: Vec3;
  /** Yaw angle in radians (0 = facing -Z). */
  readonly yaw: number;
}

/**
 * Typed level descriptor — the authoritative data for the sim.
 * Loaded from *.level.json or created programmatically for tests.
 */
export interface LevelDescriptor {
  /** Human-readable name, used in logging and test assertions. */
  readonly name: string;
  /** World bounds (for culling / out-of-bounds detection). */
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  /** All static box colliders in the level. */
  readonly colliders: readonly BoxCollider[];
  /** Valid player/bot spawn locations. */
  readonly spawns: readonly SpawnPoint[];
}

/**
 * Validate that a LevelDescriptor has at least one collider and one spawn.
 * Throws on invalid input (useful in tests and level loading).
 */
export function validateLevel(desc: LevelDescriptor): void {
  if (desc.colliders.length === 0) {
    throw new Error(`Level "${desc.name}": must have at least one collider`);
  }
  if (desc.spawns.length === 0) {
    throw new Error(`Level "${desc.name}": must have at least one spawn point`);
  }
  for (const c of desc.colliders) {
    if (c.half.x <= 0 || c.half.y <= 0 || c.half.z <= 0) {
      throw new Error(`Level "${desc.name}": collider half-extents must be positive`);
    }
  }
}
