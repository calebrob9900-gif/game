/**
 * T-133 — Shootable bot stub (placeholder target with health).
 *
 * Verifier: V2 (logic/replay).
 *
 * Bot facts from AR_BASELINE (research/03 §5.3):
 *   damageClose = 25, chest mult = 1.1 → chest shot = 27.5 dmg
 *   100 HP bot: ceil(100/27.5) = 4 chest shots to kill
 *   head shot = 37.5 dmg → ceil(100/37.5) = 3 head shots to kill
 *
 * RESPAWN_TICKS = 5 × TICK_RATE = 300 ticks (5 seconds at 60 Hz).
 *
 * All golden hashes are LITERAL constants. Re-baseline only via reviewed PR.
 * Existing golden hashes (afa4eefa, e36f9491, 0a417d3f, f1ea305f, cef63996,
 * b9debaa4, 2be1af91, and others) are verified to be unchanged by the test
 * "existing goldens unaffected" in hitscan.test.ts and movement.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  hashWorld,
  snapshot,
  DEFAULT_SETTINGS,
  spawnBot,
  RESPAWN_TICKS,
  type Command,
} from '../../src/sim';
import { STANDING_HITBOX_TEMPLATE } from '../../src/sim/combat/hitbox';
import { EYE_HEIGHT_STAND } from '../../src/sim/physics/characterController';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Compute pitch to aim at the center of a hitbox region for a target
 * at foot position (0, 0, -5) from a player eye at (0, 1.7, 0).
 */
function aimAtRegion(region: 'head' | 'chest' | 'stomach' | 'limb'): number {
  const rh = STANDING_HITBOX_TEMPLATE.find((r) => r.region === region)!;
  const regionCenterY = rh.aabb.center.y; // footY=0 for this target
  const playerEyeY = EYE_HEIGHT_STAND;
  const dz = 5; // target foot at z=-5, player at z=0
  const dy = regionCenterY - playerEyeY;
  return -Math.atan2(dy, dz);
}

/**
 * Build a world with:
 *   - Player at (0, 1.7, 0), yaw=0, pitch aimed at `region` of the bot.
 *   - One bot at foot position (0, 0, -5).
 */
function createBotWorld(region: 'head' | 'chest' | 'stomach' | 'limb' = 'chest') {
  const world = createWorld(42, DEFAULT_SETTINGS, null);

  // Aim player at the chosen region of the bot
  const player = world.ecs.with('player').entities[0]!;
  (player as { yaw: number }).yaw = 0;
  (player as { pitch: number }).pitch = aimAtRegion(region);

  // Spawn a bot at foot position (0, 0, -5)
  const botFootPos = { x: 0, y: 0, z: -5 };
  spawnBot(world, botFootPos);

  return world;
}

// ── 1. Bot spawn ───────────────────────────────────────────────────────────────

describe('T-133 bot spawn', () => {
  it('spawnBot adds a bot entity with health=100 and damageable=true', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    spawnBot(world, { x: 0, y: 0, z: -5 });

    const bot = world.ecs.entities.find((e) => e.bot);
    expect(bot).toBeDefined();
    expect(bot!.health).toBe(100);
    expect(bot!.damageable).toBe(true);
    expect(bot!.maxHealth).toBe(100);
    expect(bot!.spawnPos).toBeDefined();
    expect(bot!.spawnPos!.z).toBeCloseTo(-5, 5);
  });

  it('spawnBot eye position = footPos.y + EYE_HEIGHT_STAND', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    spawnBot(world, { x: 3, y: 0, z: -5 });

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.position!.y).toBeCloseTo(EYE_HEIGHT_STAND, 5);
  });

  it('snapshot includes bots array (empty by default)', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    const snap = snapshot(world);
    expect(snap.bots).toEqual([]);
  });

  it('snapshot includes bot state after spawnBot', () => {
    const world = createWorld(42, DEFAULT_SETTINGS, null);
    spawnBot(world, { x: 0, y: 0, z: -5 });

    const snap = snapshot(world);
    expect(snap.bots).toHaveLength(1);
    expect(snap.bots[0]!.health).toBe(100);
    expect(snap.bots[0]!.alive).toBe(true);
  });
});

// ── 2. Chest shots kill bot (4 shots) ─────────────────────────────────────────

describe('T-133 chest shots kill bot (4 shots)', () => {
  /**
   * AR_BASELINE chest: damageClose=25, mult.chest=1.1 → 27.5 per shot.
   * 100 HP / 27.5 = 3.636... → 4 shots to kill.
   * Shots: 100 → 72.5 → 45 → 17.5 → 0 (dead, clamped).
   */

  it('3 chest shots deal 82.5 damage (not dead yet)', () => {
    const world = createBotWorld('chest');
    for (let i = 0; i < 3; i++) step(world, [{ type: 'fire' } as Command]);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.health).toBeCloseTo(17.5, 5); // 100 - 3 × 27.5
    expect(bot.damageable).toBe(true); // still alive
  });

  it('4 chest shots kill the bot (health=0, damageable=false)', () => {
    const world = createBotWorld('chest');
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.health).toBe(0);
    expect(bot.damageable).toBe(false); // dead → removed from damageable set
  });

  it('bot is dead after 4 chest shots — snapshot alive=false', () => {
    const world = createBotWorld('chest');
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    const snap = snapshot(world);
    expect(snap.bots).toHaveLength(1);
    expect(snap.bots[0]!.alive).toBe(false);
    expect(snap.bots[0]!.health).toBe(0);
  });

  it('shots after death do NOT re-damage the dead bot (damageable=false)', () => {
    const world = createBotWorld('chest');
    // Kill the bot
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.health).toBe(0);

    // Fire more shots — should not change health (bot is not damageable)
    step(world, [{ type: 'fire' } as Command]);
    step(world, [{ type: 'fire' } as Command]);
    expect(bot.health).toBe(0); // still 0, not going below
  });
});

// ── 3. Head shots kill bot (3 shots) ──────────────────────────────────────────

describe('T-133 head shots kill bot (3 shots)', () => {
  /**
   * AR_BASELINE head: damageClose=25, mult.head=1.5 → 37.5 per shot.
   * 100 HP / 37.5 = 2.666... → 3 shots to kill.
   * Shots: 100 → 62.5 → 25 → 0 (dead).
   */

  it('3 accurate head shots kill the bot (recoil recovers between shots)', () => {
    // With two-layer recoil (T-112), consecutive shots climb off the small head
    // box — so we tap-fire, letting recoil fully recover between shots, the
    // correct CoD-style way to land 3 headshots. 3 × 37.5 = 112.5 ≥ 100 HP.
    const world = createBotWorld('head');
    for (let i = 0; i < 3; i++) {
      step(world, [{ type: 'fire' } as Command]);
      for (let t = 0; t < 60; t++) step(world, []); // recover recoil (< RESPAWN_TICKS)
    }

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.health).toBe(0);
    expect(bot.damageable).toBe(false);
  });

  it('2 head shots leave bot alive (health=25)', () => {
    const world = createBotWorld('head');
    for (let i = 0; i < 2; i++) step(world, [{ type: 'fire' } as Command]);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.health).toBeCloseTo(25, 5); // 100 - 2 × 37.5
    expect(bot.damageable).toBe(true);
  });
});

// ── 4. Respawn after RESPAWN_TICKS ────────────────────────────────────────────

describe('T-133 bot respawn after RESPAWN_TICKS idle ticks', () => {
  /**
   * After death, bot respawns at full health at its spawn position
   * exactly RESPAWN_TICKS (300 ticks) after the death tick.
   *
   * Sequence:
   *   Tick 0–3: fire 4 chest shots → bot dead at tick 4
   *   Bot's respawnAtTick = 4 + RESPAWN_TICKS = 304
   *   Ticks 4–303: idle (bot dead)
   *   Tick 304: bot alive again, health=100
   */

  it('bot remains dead during the respawn window (< RESPAWN_TICKS ticks)', () => {
    const world = createBotWorld('chest');
    // Kill the bot
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.damageable).toBe(false);

    // Run RESPAWN_TICKS - 1 idle ticks (bot should still be dead)
    for (let i = 0; i < RESPAWN_TICKS - 1; i++) step(world, []);

    expect(bot.damageable).toBe(false);
    expect(bot.health).toBe(0);
  });

  it('bot respawns at full health after exactly RESPAWN_TICKS ticks', () => {
    const world = createBotWorld('chest');
    // Kill at tick 4 (after 4 fire steps)
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    expect(bot.damageable).toBe(false);
    // world.tick = 4 now; respawnAtTick was set to 4 + 300 = 304

    // Advance RESPAWN_TICKS more ticks
    for (let i = 0; i < RESPAWN_TICKS; i++) step(world, []);

    // world.tick = 304; the RESPAWN_TICKS-th idle step triggers respawn check
    // at currentTickAfterIncrement = 304 >= respawnAtTick 304
    expect(bot.damageable).toBe(true); // alive
    expect(bot.health).toBe(100); // full health
    expect(bot.respawnAtTick).toBe(0); // cleared
  });

  it('bot respawns at its original spawn position', () => {
    const world = createBotWorld('chest');
    // Kill the bot
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    // Advance RESPAWN_TICKS ticks
    for (let i = 0; i < RESPAWN_TICKS; i++) step(world, []);

    const bot = world.ecs.entities.find((e) => e.bot)!;
    // Bot spawn foot pos was (0, 0, -5) → eye pos = (0, EYE_HEIGHT_STAND, -5)
    expect(bot.position!.x).toBeCloseTo(0, 5);
    expect(bot.position!.y).toBeCloseTo(EYE_HEIGHT_STAND, 5);
    expect(bot.position!.z).toBeCloseTo(-5, 5);
  });

  it('snapshot shows bot alive=true after respawn', () => {
    const world = createBotWorld('chest');
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);
    for (let i = 0; i < RESPAWN_TICKS; i++) step(world, []);

    const snap = snapshot(world);
    expect(snap.bots[0]!.alive).toBe(true);
    expect(snap.bots[0]!.health).toBe(100);
  });
});

// ── 5. RESPAWN_TICKS constant is correct ─────────────────────────────────────

describe('T-133 RESPAWN_TICKS constant', () => {
  it('RESPAWN_TICKS = 300 (5 seconds × 60 Hz)', () => {
    expect(RESPAWN_TICKS).toBe(300);
  });
});

// ── 6. Deterministic golden hash ─────────────────────────────────────────────

describe('T-133 deterministic golden hash', () => {
  /**
   * Scripted sequence:
   *   seed=7331, flat-ground (null level).
   *   Bot at foot (0, 0, -5); player aimed at bot chest.
   *   Ticks 0–3: fire 4 times → bot dead (health=0).
   *   Ticks 4–303: 300 idle ticks (respawn window).
   *   Tick 304: bot alive again at full health.
   *   Total ticks: 304.
   *
   * Run twice → same hash. Then pin the LITERAL golden.
   */

  function runBotSequence(seed: number): string {
    const world = createWorld(seed, DEFAULT_SETTINGS, null);

    // Aim player at chest
    const player = world.ecs.with('player').entities[0]!;
    (player as { yaw: number }).yaw = 0;
    (player as { pitch: number }).pitch = aimAtRegion('chest');

    // Spawn bot at foot (0, 0, -5)
    spawnBot(world, { x: 0, y: 0, z: -5 });

    // 4 fire shots → bot dead
    for (let i = 0; i < 4; i++) step(world, [{ type: 'fire' } as Command]);

    // RESPAWN_TICKS idle ticks → bot respawns on the last one
    for (let i = 0; i < RESPAWN_TICKS; i++) step(world, []);

    return hashWorld(world);
  }

  it('bot kill+respawn sequence is deterministic (same hash twice)', () => {
    const h1 = runBotSequence(7331);
    const h2 = runBotSequence(7331);
    expect(h1).toBe(h2);
  });

  it('bot kill+respawn sequence produces a literal golden hash (T-133 pinned)', () => {
    // GOLDEN hash — re-baseline only via reviewed PR.
    // Computed from: seed=7331, flat-ground (null level), chest aim,
    // 4 × fire commands → bot dead at tick 4, then 300 idle ticks → bot alive at tick 304.
    // AR chest: damageClose=25 × mult.chest=1.1 = 27.5/shot; 4 shots = 110 dmg ≥ 100 HP.
    // RESPAWN_TICKS = 300 (5 s × 60 Hz). Total = 304 ticks.
    const GOLDEN = '00012d45';
    expect(runBotSequence(7331)).toBe(GOLDEN);
  });
});

// ── 7. Existing golden hashes UNCHANGED ──────────────────────────────────────

describe('T-133 existing goldens unaffected by bot stub', () => {
  /**
   * Verify that the bot entity fields added by T-133 do NOT change any existing
   * golden hashes. Bot fields are hashed only when e.bot === true (absent for
   * non-bot entities), so the player entity hash is unchanged.
   */

  it('hitscan golden re-baselined to abe20566 by T-112 recoil (firing now offsets by recoil) (5-shot chest sequence, seed=12345)', () => {
    const TARGET_FOOT = { x: 0, y: 0, z: -5 };
    const rh = STANDING_HITBOX_TEMPLATE.find((r) => r.region === 'chest')!;
    const regionCenterY = TARGET_FOOT.y + rh.aabb.center.y;
    const playerEyeY = EYE_HEIGHT_STAND;
    const dz = 5;
    const dy = regionCenterY - playerEyeY;
    const pitch = -Math.atan2(dy, dz);

    const world = createWorld(12345, DEFAULT_SETTINGS, null);
    const player = world.ecs.with('player').entities[0]!;
    (player as { yaw: number }).yaw = 0;
    (player as { pitch: number }).pitch = pitch;

    // Add a PLAIN dummy (NOT a bot) — same as hitscan.test.ts
    world.ecs.add({
      position: { x: TARGET_FOOT.x, y: TARGET_FOOT.y + EYE_HEIGHT_STAND, z: TARGET_FOOT.z },
      health: 100,
      damageable: true,
    });

    for (let i = 0; i < 5; i++) step(world, [{ type: 'fire' } as Command]);

    expect(hashWorld(world)).toBe('abe20566');
  });
});
