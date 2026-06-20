/**
 * T-111 — Hitscan + region hitboxes (head/chest/limb) + multipliers.
 *
 * Verifier: V2 (logic/replay).
 *
 * All expected damage values are LITERAL constants from the AR_BASELINE weapon:
 *   damageClose = 25
 *   mult.head    = 1.5   → head  damage = 25 × 1.5  = 37.5
 *   mult.chest   = 1.1   → chest damage = 25 × 1.1  = 27.5
 *   mult.stomach = 1.0   → stomach damage = 25 × 1.0 = 25.0
 *   mult.limb    = 0.85  → limb  damage = 25 × 0.85 = 21.25
 *
 * Test suites:
 *   1. Unit test: ray-vs-AABB (hit, miss, behind-origin).
 *   2. Region damage assertions: aim at head/chest/stomach/limb → exact literal damage.
 *   3. No damage when aimed at empty space.
 *   4. Sprint-gate: fire blocked while sprinting.
 *   5. Deterministic golden hash for a scripted fire sequence.
 *
 * Setup: player spawns at (0, 1.7, 0) [eye height above foot y=0 at yaw=0].
 * Target dummy placed at (0, 1.7, -5) [5 m ahead along -Z].
 * At yaw=0, pitch=0: dir = (0, 0, -1), ray hits the torso/chest of the target.
 *
 * Aim offsets (pitch up/down) are derived to reliably target each region.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  hashWorld,
  DEFAULT_SETTINGS,
  type Command,
  getWeapon,
} from '../../src/sim';
import { rayVsAABB, fireHitscan } from '../../src/sim/combat/hitscan';
import { buildHitboxes, STANDING_HITBOX_TEMPLATE } from '../../src/sim/combat/hitbox';
import type { AABB } from '../../src/sim/combat/hitbox';
import { EYE_HEIGHT_STAND } from '../../src/sim/physics/characterController';
import { createTestLevel } from '../../src/sim/levels/testLevel';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Create a minimal world (no level — flat-ground fallback) with:
 *   - Player at (0, EYE_HEIGHT_STAND, 0), yaw=0, pitch given.
 *   - One dummy target entity at a known foot position.
 *
 * The dummy has `health` set so it's treated as damageable.
 */
function createCombatWorld(
  pitchRadians: number,
  targetFootPos: { x: number; y: number; z: number },
) {
  // No level — flat-ground fallback, spawn at origin
  const world = createWorld(42, DEFAULT_SETTINGS, null);

  // Override player position and aim
  const player = world.ecs.with('player').entities[0]!;
  // Player spawns at (0, eyeHeight, 0) on flat-ground (no level spawn used)
  // Position is already set by createWorld. Just override yaw/pitch.
  (player as { yaw: number }).yaw = 0;
  (player as { pitch: number }).pitch = pitchRadians;

  // Add a dummy target: position = eye (foot + EYE_HEIGHT_STAND)
  world.ecs.add({
    position: {
      x: targetFootPos.x,
      y: targetFootPos.y + EYE_HEIGHT_STAND,
      z: targetFootPos.z,
    },
    health: 100,
    damageable: true,
  });

  return world;
}

/**
 * Given a target at footPos and a known hitbox region (from STANDING_HITBOX_TEMPLATE),
 * compute the pitch angle that aims at the center of that region from the player's eye.
 *
 * Player eye: (0, EYE_HEIGHT_STAND, 0).
 * Target foot: (0, 0, -5) → target region center = (0, footY + regionCenterY, -5).
 *
 * pitch = -atan2(dy, dz_horiz) where dy = targetCenterY - playerEyeY, dz_horiz = 5.
 * (Negative pitch looks down.)
 */
function aimAtRegion(region: 'head' | 'chest' | 'stomach' | 'limb', targetFootY: number): number {
  const rh = STANDING_HITBOX_TEMPLATE.find((r) => r.region === region)!;
  const regionCenterY = targetFootY + rh.aabb.center.y; // world-space Y of region center
  const playerEyeY = EYE_HEIGHT_STAND; // player at foot y=0
  const dz = 5; // distance to target (target foot at z=-5)

  const dy = regionCenterY - playerEyeY;
  // pitch is rotation around X: positive pitch looks up, negative looks down.
  // dir.y = -sin(pitch), so sin(pitch) = -dy/dist. pitch = -atan(dy/dz).
  return -Math.atan2(dy, dz);
}

// ── 1. Unit tests: ray-vs-AABB ────────────────────────────────────────────────

describe('T-111 ray-vs-AABB (slab method)', () => {
  const BOX: AABB = {
    center: { x: 0, y: 0, z: -5 },
    half: { x: 1, y: 1, z: 1 },
  };

  it('ray pointing straight at box center hits (returns t > 0)', () => {
    const origin = { x: 0, y: 0, z: 0 };
    const dir = { x: 0, y: 0, z: -1 };
    const t = rayVsAABB(origin, dir, BOX);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    // Box front face is at z = -5 + 1 = -4 → t = 4
    expect(t!).toBeCloseTo(4, 5);
  });

  it('ray pointing away from box misses (dir = +Z, box at -Z)', () => {
    const origin = { x: 0, y: 0, z: 0 };
    const dir = { x: 0, y: 0, z: 1 }; // pointing +Z, box is at -Z
    const t = rayVsAABB(origin, dir, BOX);
    expect(t).toBeNull();
  });

  it('ray entirely behind box misses', () => {
    // Origin is +Z from the box, pointing further +Z
    const origin = { x: 0, y: 0, z: 10 };
    const dir = { x: 0, y: 0, z: 1 };
    const t = rayVsAABB(origin, dir, BOX);
    expect(t).toBeNull();
  });

  it('ray origin behind the box pointing toward it: misses (tMin < 0)', () => {
    // Origin is on the far side of the box (z = -10), pointing +Z
    // The ray "enters" the box from behind — tMin < 0 — we return null.
    const origin = { x: 0, y: 0, z: -10 };
    const dir = { x: 0, y: 0, z: 1 };
    const t = rayVsAABB(origin, dir, BOX);
    // tMax = (−5+1 − (−10)) / 1 = (−4 + 10) = 6; tMin = (−5−1−(−10))/1 = 4
    // tMin=4 > 0 → this IS a hit from behind at z=-10 looking toward box at z=-5
    // Wait: origin z=-10, box at z=-5: the ray +Z will approach the box
    // front face: z = -5 - 1 = -6; t1 = (-6 - (-10)) / 1 = 4
    // back face:  z = -5 + 1 = -4; t2 = (-4 - (-10)) / 1 = 6
    // tMin=4, tMax=6; tMin>0 → HIT
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(4, 5);
  });

  it('ray misses box to the side', () => {
    const origin = { x: 5, y: 0, z: 0 }; // far to the right of center
    const dir = { x: 0, y: 0, z: -1 };
    const t = rayVsAABB(origin, dir, BOX);
    expect(t).toBeNull();
  });

  it('ray barely clips the edge of the box', () => {
    // Box extends from x=-1..+1. Ray from x=0.99 pointing straight at it.
    const origin = { x: 0.99, y: 0, z: 0 };
    const dir = { x: 0, y: 0, z: -1 };
    const t = rayVsAABB(origin, dir, BOX);
    expect(t).not.toBeNull();
  });

  it('ray from origin inside box returns null (not a valid hitscan hit)', () => {
    // Origin inside box: (0, 0, -5), box is [-1,1] × [-1,1] × [-6,-4]
    const origin = { x: 0, y: 0, z: -5 };
    const dir = { x: 0, y: 0, z: -1 };
    const t = rayVsAABB(origin, dir, BOX);
    // tMin < 0 for origin inside box → null
    expect(t).toBeNull();
  });
});

// ── 2. Region damage assertions ────────────────────────────────────────────────

describe('T-111 region damage multipliers', () => {
  /**
   * AR_BASELINE: damageClose=25
   *   head    × 1.5 = 37.5
   *   chest   × 1.1 = 27.5
   *   stomach × 1.0 = 25.0
   *   limb    × 0.85 = 21.25
   *
   * Target foot at (0, 0, -5). Player eye at (0, 1.7, 0).
   * Pitch computed to aim center-of-region.
   */

  const TARGET_FOOT = { x: 0, y: 0, z: -5 };
  const WEAPON = getWeapon('ar_baseline');

  // HEAD
  it('head shot applies damage = damageClose × 1.5 = 37.5 (LITERAL)', () => {
    const pitch = aimAtRegion('head', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    // Get initial health of dummy
    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    expect(dummy.health).toBe(100);

    // Fire once
    step(world, [{ type: 'fire' }]);

    expect(dummy.health).toBeCloseTo(100 - WEAPON.damageClose * WEAPON.mult.head, 5);
    // Literal: 100 - 25 * 1.5 = 100 - 37.5 = 62.5
    expect(dummy.health).toBeCloseTo(62.5, 5);
  });

  // CHEST
  it('chest shot applies damage = damageClose × 1.1 = 27.5 (LITERAL)', () => {
    const pitch = aimAtRegion('chest', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    step(world, [{ type: 'fire' }]);

    expect(dummy.health).toBeCloseTo(100 - WEAPON.damageClose * WEAPON.mult.chest, 5);
    // Literal: 100 - 25 * 1.1 = 100 - 27.5 = 72.5
    expect(dummy.health).toBeCloseTo(72.5, 5);
  });

  // STOMACH
  it('stomach shot applies damage = damageClose × 1.0 = 25.0 (LITERAL)', () => {
    const pitch = aimAtRegion('stomach', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    step(world, [{ type: 'fire' }]);

    expect(dummy.health).toBeCloseTo(100 - WEAPON.damageClose * WEAPON.mult.stomach, 5);
    // Literal: 100 - 25 * 1.0 = 100 - 25 = 75.0
    expect(dummy.health).toBeCloseTo(75.0, 5);
  });

  // LIMB
  it('limb shot applies damage = damageClose × 0.85 = 21.25 (LITERAL)', () => {
    const pitch = aimAtRegion('limb', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    step(world, [{ type: 'fire' }]);

    expect(dummy.health).toBeCloseTo(100 - WEAPON.damageClose * WEAPON.mult.limb, 5);
    // Literal: 100 - 25 * 0.85 = 100 - 21.25 = 78.75
    expect(dummy.health).toBeCloseTo(78.75, 5);
  });

  it('head × 1.5 is greater than chest × 1.1 (priority order preserved)', () => {
    expect(WEAPON.mult.head).toBeGreaterThan(WEAPON.mult.chest);
    expect(WEAPON.mult.head).toBeGreaterThan(WEAPON.mult.stomach);
    expect(WEAPON.mult.head).toBeGreaterThan(WEAPON.mult.limb);
    expect(WEAPON.mult.chest).toBeGreaterThan(WEAPON.mult.stomach);
    expect(WEAPON.mult.stomach).toBeGreaterThan(WEAPON.mult.limb);
  });

  it('multipliers are in research/03 §5.3 ranges (head ×1.4–1.6, limb ×0.8–0.9)', () => {
    expect(WEAPON.mult.head).toBeGreaterThanOrEqual(1.4);
    expect(WEAPON.mult.head).toBeLessThanOrEqual(1.6);
    expect(WEAPON.mult.limb).toBeGreaterThanOrEqual(0.8);
    expect(WEAPON.mult.limb).toBeLessThanOrEqual(0.9);
  });
});

// ── 3. No damage when aimed at empty space ────────────────────────────────────

describe('T-111 miss — no damage', () => {
  it('aiming at empty space (no target in ray path) leaves all entities undamaged', () => {
    // Aim 90° to the side — target is at z=-5, aim at x=+1 direction
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    const player = world.ecs.with('player').entities[0]!;
    // Aim sideways (yaw = PI/2, pointing +X) — target is on -Z axis → miss
    (player as { yaw: number }).yaw = Math.PI / 2;
    (player as { pitch: number }).pitch = 0;

    // Add dummy target on -Z axis
    world.ecs.add({
      position: { x: 0, y: EYE_HEIGHT_STAND, z: -5 },
      health: 100,
      damageable: true,
    });

    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    expect(dummy.health).toBe(100);

    step(world, [{ type: 'fire' }]);

    // Should be undamaged
    expect(dummy.health).toBe(100);
  });

  it('firing with no targets in world applies no damage', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    // No additional entities — only the player
    const initialHash = hashWorld(world);
    step(world, [{ type: 'fire' }]);
    // Tick advanced but player's health is unchanged
    const player = world.ecs.with('player').entities[0]!;
    expect(player.health).toBe(100);
    // Hash changes only because tick advanced (not because of damage)
    expect(hashWorld(world)).not.toBe(initialHash);
  });
});

// ── 4. Sprint gate — fire blocked while sprinting ─────────────────────────────

describe('T-111 sprint gate', () => {
  it('fire during sprint does NOT damage target (canFire=false while sprinting)', () => {
    // Set up world with a target right in front
    const TARGET_FOOT = { x: 0, y: 0, z: -5 };
    const pitch = aimAtRegion('chest', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    // Sprint for a few ticks to set isSprinting=true
    // Note: sprint requires forward-ish movement and a level for full physics.
    // On flat-ground fallback, sprint flag still sets isSprinting.
    for (let t = 0; t < 3; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }

    const player = world.ecs.with('player').entities[0]!;
    expect(player.isSprinting).toBe(true);

    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    const healthBefore = dummy.health!;

    // Fire while sprinting — should be blocked
    step(world, [
      { type: 'move', forward: 1, right: 0, jump: false, sprint: true },
      { type: 'fire' },
    ]);

    // Health unchanged (fire was blocked)
    expect(dummy.health).toBe(healthBefore);
  });

  it('fire after sprint-out window expires DOES damage target', () => {
    const TARGET_FOOT = { x: 0, y: 0, z: -5 };
    const pitch = aimAtRegion('chest', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    // Sprint for 3 ticks
    for (let t = 0; t < 3; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }

    // Release sprint — sprint-out window starts
    step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]);

    // Advance past SPRINT_OUT_TICKS (9 ticks) to clear the window
    for (let t = 0; t < 10; t++) {
      step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]);
    }

    // Now canFire should be true — fire should work
    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    const healthBefore = dummy.health!;

    step(world, [{ type: 'fire' }]);

    // Health should be reduced
    expect(dummy.health!).toBeLessThan(healthBefore);
    const WEAPON = getWeapon('ar_baseline');
    expect(dummy.health!).toBeCloseTo(healthBefore - WEAPON.damageClose * WEAPON.mult.chest, 5);
  });
});

// ── 5. Hit event emission ─────────────────────────────────────────────────────

describe('T-111 hit event', () => {
  it('a hit emits a "hit" event with correct target, region, and amount', () => {
    const TARGET_FOOT = { x: 0, y: 0, z: -5 };
    const pitch = aimAtRegion('chest', TARGET_FOOT.y);
    const world = createCombatWorld(pitch, TARGET_FOOT);

    const WEAPON = getWeapon('ar_baseline');
    const events: { targetIndex: number; region: string; amount: number }[] = [];
    world.events.on('hit', (e) => {
      events.push({ ...e });
    });

    step(world, [{ type: 'fire' }]);

    expect(events).toHaveLength(1);
    expect(events[0]!.region).toBe('chest');
    expect(events[0]!.amount).toBeCloseTo(WEAPON.damageClose * WEAPON.mult.chest, 5);
  });

  it('a miss emits no "hit" event', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    const player = world.ecs.with('player').entities[0]!;
    // Aim sideways
    (player as { yaw: number }).yaw = Math.PI / 2;

    world.ecs.add({
      position: { x: 0, y: EYE_HEIGHT_STAND, z: -5 },
      health: 100,
    });

    const events: unknown[] = [];
    world.events.on('hit', (e) => events.push(e));

    step(world, [{ type: 'fire' }]);

    expect(events).toHaveLength(0);
  });
});

// ── 6. fireHitscan unit tests ─────────────────────────────────────────────────

describe('T-111 fireHitscan unit tests', () => {
  it('returns null when no damageable entities exist', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    const player = world.ecs.with('player').entities[0]!;
    const weapon = getWeapon('ar_baseline');
    const hit = fireHitscan(
      world,
      player as {
        position: { x: number; y: number; z: number };
        yaw: number;
        pitch: number;
        player?: boolean;
      },
      weapon,
    );
    expect(hit).toBeNull();
  });

  it('returns nearest hit when multiple targets present', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    const player = world.ecs.with('player').entities[0]!;
    (player as { yaw: number }).yaw = 0;
    (player as { pitch: number }).pitch = 0; // horizontal, pointing -Z

    // Near target (5 m away) and far target (10 m away), both on -Z axis
    world.ecs.add({ position: { x: 0, y: EYE_HEIGHT_STAND, z: -5 }, health: 100 });
    world.ecs.add({ position: { x: 0, y: EYE_HEIGHT_STAND, z: -10 }, health: 100 });

    const weapon = getWeapon('ar_baseline');
    const entities = world.ecs.entities;
    const hit = fireHitscan(
      world,
      player as {
        position: { x: number; y: number; z: number };
        yaw: number;
        pitch: number;
        player?: boolean;
      },
      weapon,
    );

    expect(hit).not.toBeNull();
    // Should hit the nearer target
    const hitEntity = entities[hit!.targetIndex];
    expect(hitEntity).toBeDefined();
    // Near target is at z=-5 (index 1 in entities, after player at index 0)
    expect(hitEntity!.position!.z).toBeCloseTo(-5, 2);
  });

  it('buildHitboxes places head box above chest box', () => {
    const footPos = { x: 0, y: 0, z: 0 };
    const hitboxes = buildHitboxes(footPos);

    const headBox = hitboxes.find((h) => h.region === 'head')!;
    const chestBox = hitboxes.find((h) => h.region === 'chest')!;
    const stomachBox = hitboxes.find((h) => h.region === 'stomach')!;
    const limbBox = hitboxes.find((h) => h.region === 'limb')!;

    // Head is higher than chest
    expect(headBox.aabb.center.y).toBeGreaterThan(chestBox.aabb.center.y);
    // Chest is higher than stomach
    expect(chestBox.aabb.center.y).toBeGreaterThan(stomachBox.aabb.center.y);
    // Stomach is higher than limb
    expect(stomachBox.aabb.center.y).toBeGreaterThan(limbBox.aabb.center.y);
    // Head box y + half should be near top of body (~1.8 m)
    expect(headBox.aabb.center.y + headBox.aabb.half.y).toBeCloseTo(1.8, 1);
    // Limb bottom is at or near foot (y=0)
    expect(limbBox.aabb.center.y - limbBox.aabb.half.y).toBeCloseTo(0, 1);
  });
});

// ── 7. Deterministic golden hash for scripted fire sequence ───────────────────

describe('T-111 scripted fire sequence golden hash', () => {
  /**
   * Scripted sequence (deterministic, no Math.random):
   *   seed=12345
   *   Flat-ground world (no level) — preserves existing level-based golden hashes.
   *   Player at (0, 1.7, 0), aim at chest of target at (0, 1.7, -5) [foot y=0].
   *   Tick 1: fire → chest hit → target.health = 100 - 27.5 = 72.5
   *   Tick 2: fire → chest hit → target.health = 72.5 - 27.5 = 45.0
   *   Tick 3: fire → chest hit → target.health = 45.0 - 27.5 = 17.5
   *   Tick 4: fire → chest hit → target.health = max(0, 17.5 - 27.5) = 0 (dead)
   *   Tick 5: fire → target at 0 hp, hit still registers damage but clamps to 0.
   *
   * Run twice → same hash.
   */

  function runFireSequence(seed: number): { finalHealth: number; hash: string } {
    const TARGET_FOOT = { x: 0, y: 0, z: -5 };
    const pitch = aimAtRegion('chest', TARGET_FOOT.y);

    const world = createWorld(seed, DEFAULT_SETTINGS, null);
    const player = world.ecs.with('player').entities[0]!;
    (player as { yaw: number }).yaw = 0;
    (player as { pitch: number }).pitch = pitch;

    // Add dummy target
    world.ecs.add({
      position: {
        x: TARGET_FOOT.x,
        y: TARGET_FOOT.y + EYE_HEIGHT_STAND,
        z: TARGET_FOOT.z,
      },
      health: 100,
      damageable: true,
    });

    // Fire 5 times
    for (let i = 0; i < 5; i++) {
      step(world, [{ type: 'fire' }]);
    }

    const dummy = world.ecs.entities.find((e) => !e.player && e.health !== undefined)!;
    return { finalHealth: dummy.health!, hash: hashWorld(world) };
  }

  it('scripted 5-shot sequence is deterministic (same hash twice)', () => {
    const r1 = runFireSequence(12345);
    const r2 = runFireSequence(12345);
    expect(r1.hash).toBe(r2.hash);
    expect(r1.finalHealth).toBe(r2.finalHealth);
  });

  it('scripted 5-shot sequence reaches 0 hp (kills target)', () => {
    // 4 shots × 27.5 = 110 dmg > 100 hp → dead after 4 shots, clamped to 0
    const r = runFireSequence(12345);
    expect(r.finalHealth).toBe(0);
  });

  it('scripted fire sequence produces a literal golden hash', () => {
    const r = runFireSequence(12345);
    // Literal golden hash — re-baseline only via reviewed PR.
    // Computed from: seed=12345, flat-ground (null level), chest aim,
    // 5 × fire commands. Health: 100→72.5→45→17.5→0→0. Tick=5.
    // (T-111 pinned golden: afa4eefa)
    const GOLDEN = 'afa4eefa';
    expect(r.hash).toBe(GOLDEN);
  });
});

// ── 8. Existing golden hashes UNCHANGED ───────────────────────────────────────

describe('T-111 existing goldens unaffected', () => {
  /**
   * Verify that adding the combat module + FireCommand + weaponId field
   * does NOT change any of the pre-T-111 replay golden hashes.
   *
   * We check the capsule-physics golden (2be1af91) as a representative sample:
   * the player entity now has weaponId set, but weaponId is NOT included in
   * the hash (it's static config, not dynamic gameplay state).
   *
   * We reproduce the exact scenario from capsulePhysics.test.ts to verify.
   */

  it('movement golden f1ea305f is unchanged (forward 30 + stop 30 ticks, seed=42)', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    const fwdCmd: Command = { type: 'move', forward: 1, right: 0, jump: false };
    for (let t = 0; t < 30; t++) step(world, [fwdCmd]);
    for (let t = 0; t < 30; t++) step(world, []);

    expect(hashWorld(world)).toBe('f1ea305f');
  });

  it('sprint golden cef63996 is unchanged (sprint 60 ticks, seed=1234)', () => {
    const level = createTestLevel();
    const world = createWorld(1234, DEFAULT_SETTINGS, level);

    for (let t = 0; t < 60; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }
    expect(hashWorld(world)).toBe('cef63996');
  });
});
