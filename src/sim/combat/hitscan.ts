/**
 * Hitscan ray casting for the combat system.
 *
 * Implements:
 *   - `rayVsAABB`      : deterministic slab-method ray-vs-AABB intersection.
 *   - `raycastHitboxes`: tests a ray against a set of region hitboxes; returns
 *                        the nearest hit region + distance or null.
 *   - `fireHitscan`    : builds a ray from the shooter's eye along yaw/pitch,
 *                        tests against all damageable target entities' hitboxes,
 *                        returns { targetId, region, distance } for the nearest hit
 *                        or null if no hit.
 *
 * Determinism rules (non-negotiable):
 *   - No Math.random / Date.now / performance.now.
 *   - No three / DOM imports.
 *   - Pure functions of (world state + weapon def). Fixed DT from core/time.
 *
 * Research basis: docs/research/03 §4.1 (hitscan model), §4.2 (hitboxes).
 */

import type { Vec3 } from '../core/vec';
import type { SimWorld } from '../world';
import type { WeaponDef } from '../weapons/weaponDef';
import { buildHitboxes, type AABB, type HitRegion, type RegionHitbox } from './hitbox';
import { EYE_HEIGHT_STAND } from '../physics/characterController';

// ── Ray-vs-AABB (slab method) ─────────────────────────────────────────────────

const EPSILON = 1e-8;

/**
 * Slab-method ray-vs-AABB intersection (3D).
 *
 * Returns the parametric distance `t` along the ray at the first intersection
 * point (entry). Returns null if:
 *   - No intersection with the AABB.
 *   - The AABB is entirely behind the ray origin (tMax < 0).
 *   - The ray origin is inside the AABB (tMin < 0; we do NOT report this as a
 *     hit — the shooter cannot be inside a hitbox).
 *
 * `origin`  : ray origin in world space.
 * `dir`     : ray direction (need not be normalised, but length scales `t`).
 *             Normalise before calling if you want `t` = metres.
 * `aabb`    : axis-aligned bounding box (center + half-extents).
 *
 * Reference: "An Efficient and Robust Ray-Box Intersection Algorithm"
 *            (Amy Williams et al., 2003).
 */
export function rayVsAABB(origin: Vec3, dir: Vec3, aabb: AABB): number | null {
  const { center: c, half: h } = aabb;

  const minX = c.x - h.x;
  const maxX = c.x + h.x;
  const minY = c.y - h.y;
  const maxY = c.y + h.y;
  const minZ = c.z - h.z;
  const maxZ = c.z + h.z;

  let tMin = -Infinity;
  let tMax = Infinity;

  // X slab
  if (Math.abs(dir.x) < EPSILON) {
    // Ray is parallel to X slabs — check if origin is inside
    if (origin.x < minX || origin.x > maxX) return null;
  } else {
    const invDx = 1 / dir.x;
    let t1 = (minX - origin.x) * invDx;
    let t2 = (maxX - origin.x) * invDx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = t1 > tMin ? t1 : tMin;
    tMax = t2 < tMax ? t2 : tMax;
    if (tMin > tMax) return null;
  }

  // Y slab
  if (Math.abs(dir.y) < EPSILON) {
    if (origin.y < minY || origin.y > maxY) return null;
  } else {
    const invDy = 1 / dir.y;
    let t1 = (minY - origin.y) * invDy;
    let t2 = (maxY - origin.y) * invDy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = t1 > tMin ? t1 : tMin;
    tMax = t2 < tMax ? t2 : tMax;
    if (tMin > tMax) return null;
  }

  // Z slab
  if (Math.abs(dir.z) < EPSILON) {
    if (origin.z < minZ || origin.z > maxZ) return null;
  } else {
    const invDz = 1 / dir.z;
    let t1 = (minZ - origin.z) * invDz;
    let t2 = (maxZ - origin.z) * invDz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = t1 > tMin ? t1 : tMin;
    tMax = t2 < tMax ? t2 : tMax;
    if (tMin > tMax) return null;
  }

  // The ray misses if both intersections are behind the origin
  if (tMax < 0) return null;

  // Entry is behind origin (shooter inside AABB) — not a valid hitscan hit
  if (tMin < 0) return null;

  return tMin;
}

// ── raycastHitboxes ───────────────────────────────────────────────────────────

/** Result of testing a ray against a single target's hitboxes. */
export interface RayHitResult {
  region: HitRegion;
  /** Parametric distance along the ray (t) at the hit point. */
  distance: number;
}

/**
 * Test a ray against a set of region hitboxes.
 *
 * Tests all hitboxes and returns the nearest hit (smallest `t`).
 * Returns null if the ray misses all boxes.
 *
 * `origin` and `dir` should be in the same world-space coordinate system as
 * the hitbox AABBs. `dir` should be a unit vector so `distance` = metres.
 */
export function raycastHitboxes(
  origin: Vec3,
  dir: Vec3,
  hitboxes: readonly RegionHitbox[],
): RayHitResult | null {
  let nearest: RayHitResult | null = null;

  for (const rh of hitboxes) {
    const t = rayVsAABB(origin, dir, rh.aabb);
    if (t !== null && (nearest === null || t < nearest.distance)) {
      nearest = { region: rh.region, distance: t };
    }
  }

  return nearest;
}

// ── fireHitscan ───────────────────────────────────────────────────────────────

/** Result of a hitscan fire against a specific target entity. */
export interface HitscanHit {
  /** Index of the hit entity in world.ecs.entities array. */
  targetIndex: number;
  /** Hit body region. */
  region: HitRegion;
  /** Distance in metres from shooter's eye to hit point. */
  distance: number;
}

/**
 * Cast a hitscan ray from the shooter's eye in the direction of their yaw/pitch.
 *
 * The ray origin is the shooter's eye position (entity.position is stored as
 * the eye position — see world.ts).
 *
 * Direction is derived from yaw (rotation around Y axis) and pitch (rotation
 * around X axis):
 *   dir.x =  cos(pitch) * sin(yaw)
 *   dir.y = -sin(pitch)
 *   dir.z = -cos(pitch) * cos(yaw)   (forward = −Z in this convention)
 *
 * Tests all entities that have `health` defined and are NOT the player.
 * Returns the nearest hit, or null if none.
 *
 * @param world   - The simulation world (read-only usage).
 * @param shooter - The shooting entity (player). Must have position, yaw, pitch.
 * @param _weapon - The weapon being fired (reserved for future falloff/penPower).
 */
export function fireHitscan(
  world: SimWorld,
  shooter: { position: Vec3; yaw: number; pitch: number; player?: boolean },
  _weapon: WeaponDef,
): HitscanHit | null {
  const yaw = shooter.yaw ?? 0;
  const pitch = shooter.pitch ?? 0;

  // Build normalised direction vector from yaw + pitch
  const cosPitch = Math.cos(pitch);
  const dir: Vec3 = {
    x: cosPitch * Math.sin(yaw),
    y: -Math.sin(pitch),
    z: -cosPitch * Math.cos(yaw),
  };

  // Eye origin (entity.position is already the eye position in this sim)
  const origin: Vec3 = shooter.position;

  let nearest: HitscanHit | null = null;

  const entities = world.ecs.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;

    // Skip self (the shooter) and non-damageable entities
    if (e === shooter) continue;
    if (e.health === undefined) continue;
    if (e.position === undefined) continue;

    // Build hitboxes for this target.
    // Entity.position is stored as the eye position, so foot = eye - eyeHeight.
    // For targets we use EYE_HEIGHT_STAND for simplicity (all standing targets).
    const footPos: Vec3 = {
      x: e.position.x,
      y: e.position.y - EYE_HEIGHT_STAND,
      z: e.position.z,
    };

    const hitboxes = buildHitboxes(footPos);
    const result = raycastHitboxes(origin, dir, hitboxes);

    if (result !== null) {
      if (nearest === null || result.distance < nearest.distance) {
        nearest = {
          targetIndex: i,
          region: result.region,
          distance: result.distance,
        };
      }
    }
  }

  return nearest;
}
