/**
 * Hitbox definitions for damageable entities.
 *
 * Each entity has a set of axis-aligned bounding boxes (AABBs) representing
 * different body regions, positioned relative to the entity's foot position
 * (Entity.position.y = eye position, but hitboxes are built from the foot
 * which = eye - eyeHeight).
 *
 * Region layout (from foot, in meters, research/03 §4.2):
 *   head    : top ~0.15 m of the body  — small, high reward
 *   chest   : upper-mid torso          — large, main target
 *   stomach : lower torso              — same width as chest
 *   limb    : arms/legs represented as
 *             two boxes flanking the torso (left/right)
 *
 * These are simplified "capsule-shaped" box regions for a standing humanoid
 * ~1.8 m tall:
 *
 *   y=1.65–1.80  head    (center: y=1.725, half: {x:0.10, y:0.075, z:0.10})
 *   y=1.15–1.65  chest   (center: y=1.40,  half: {x:0.20, y:0.25,  z:0.15})
 *   y=0.70–1.15  stomach (center: y=0.925, half: {x:0.18, y:0.225, z:0.15})
 *   y=0.00–0.70  limb (legs, wide) + arms flanking torso (simplified as two boxes)
 *                (center: y=0.35,  half: {x:0.25, y:0.35,  z:0.15})
 *
 * No three/DOM imports. Pure data.
 */

import type { Vec3 } from '../core/vec';

// ── Types ──────────────────────────────────────────────────────────────────────

/** The four damageable body regions (research/03 §5.3). */
export type HitRegion = 'head' | 'chest' | 'stomach' | 'limb';

/** Axis-aligned bounding box: center + half-extents. */
export interface AABB {
  readonly center: Vec3;
  readonly half: Vec3;
}

/** One hitbox region with its AABB and region label. */
export interface RegionHitbox {
  readonly region: HitRegion;
  readonly aabb: AABB;
}

// ── Entity hitbox definition (relative to foot position) ─────────────────────

/**
 * Hitbox template relative to foot position (y=0 is foot).
 * Based on a ~1.8 m tall humanoid capsule (research/03 §4.2).
 *
 * Regions are tested from smallest (head) to largest (limb) for
 * priority: head hit wins over torso if the ray enters both.
 */
export const STANDING_HITBOX_TEMPLATE: readonly RegionHitbox[] = [
  // Head — small box at top, tight to visible head
  {
    region: 'head',
    aabb: {
      center: { x: 0, y: 1.725, z: 0 },
      half: { x: 0.1, y: 0.075, z: 0.1 },
    },
  },
  // Chest — upper torso
  {
    region: 'chest',
    aabb: {
      center: { x: 0, y: 1.4, z: 0 },
      half: { x: 0.2, y: 0.25, z: 0.15 },
    },
  },
  // Stomach — lower torso
  {
    region: 'stomach',
    aabb: {
      center: { x: 0, y: 0.925, z: 0 },
      half: { x: 0.18, y: 0.225, z: 0.15 },
    },
  },
  // Limb — legs and arms, wider box enclosing limbs
  {
    region: 'limb',
    aabb: {
      center: { x: 0, y: 0.35, z: 0 },
      half: { x: 0.25, y: 0.35, z: 0.15 },
    },
  },
] as const;

/**
 * Build the world-space hitboxes for a target entity.
 *
 * `footPos` is the entity's foot position in world space
 * (= entity eye position − EYE_HEIGHT_STAND for a standing entity).
 *
 * Returns an array of RegionHitbox with centers translated to world space.
 */
export function buildHitboxes(footPos: Vec3): RegionHitbox[] {
  return STANDING_HITBOX_TEMPLATE.map((rh) => ({
    region: rh.region,
    aabb: {
      center: {
        x: footPos.x + rh.aabb.center.x,
        y: footPos.y + rh.aabb.center.y,
        z: footPos.z + rh.aabb.center.z,
      },
      half: rh.aabb.half,
    },
  }));
}
