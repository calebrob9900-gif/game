/**
 * T-132 — Greybox urban test map + *.level.json loader.
 *
 * Verifier: V2 (logic/replay). Tests here are strictly deterministic:
 *  - parseLevel correctly loads the JSON and validateLevel returns []
 *  - Every spawn is inside map bounds and does not penetrate any collider
 *  - A player created in this level settles on the ground after 60 idle ticks
 *  - A scripted run produces a stable pinned golden hash
 *
 * Import boundary: no three/DOM/Math.random/Date.now in this test or the
 * sim files it exercises.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  hashWorld,
  snapshot,
  DEFAULT_SETTINGS,
  parseLevel,
  validateLevel,
  PLAYER_CAPSULE,
  type BoxCollider,
} from '../../src/sim';
import urbanRaw from '../../levels/urban01.level.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if a player foot position (x, y, z) penetrates the given
 * box collider. Mirrors the check in capsulePhysics.test.ts.
 */
function penetratesBox(footX: number, footY: number, footZ: number, col: BoxCollider): boolean {
  const r = PLAYER_CAPSULE.radius;
  const { center: c, half: h } = col;

  const minX = c.x - h.x - r;
  const maxX = c.x + h.x + r;
  const minZ = c.z - h.z - r;
  const maxZ = c.z + h.z + r;

  const segBotY = footY + r;
  const segTopY = footY + r + 2 * PLAYER_CAPSULE.halfHeight;
  const clampedY = Math.max(c.y - h.y, Math.min(c.y + h.y, (segBotY + segTopY) * 0.5));
  const closestY = Math.max(segBotY, Math.min(segTopY, clampedY));
  const minY = c.y - h.y - r;
  const maxY = c.y + h.y + r;

  return (
    footX > minX &&
    footX < maxX &&
    closestY > minY &&
    closestY < maxY &&
    footZ > minZ &&
    footZ < maxZ
  );
}

// ── Parse + validate ──────────────────────────────────────────────────────────

describe('T-132 urban01 level: load and validate', () => {
  it('parseLevel(urbanRaw) succeeds and validateLevel returns []', () => {
    const level = parseLevel(urbanRaw);
    expect(level.name).toBe('urban01');

    const errors = validateLevel(level);
    expect(errors).toEqual([]);
  });

  it('collider count is within expected range (20–40)', () => {
    const level = parseLevel(urbanRaw);
    expect(level.colliders.length).toBeGreaterThanOrEqual(20);
    expect(level.colliders.length).toBeLessThanOrEqual(40);
  });

  it('all collider half-extents are strictly positive', () => {
    const level = parseLevel(urbanRaw);
    for (const col of level.colliders) {
      expect(col.half.x).toBeGreaterThan(0);
      expect(col.half.y).toBeGreaterThan(0);
      expect(col.half.z).toBeGreaterThan(0);
    }
  });

  it('spawn count covers at least 2 teams + neutral spawns', () => {
    const level = parseLevel(urbanRaw);
    // At least 2 alpha, 2 bravo, 1 neutral
    expect(level.spawns.length).toBeGreaterThanOrEqual(5);
  });
});

// ── Spawn validity ────────────────────────────────────────────────────────────

describe('T-132 urban01 level: spawn validity', () => {
  it('every spawn is inside the level bounds', () => {
    const level = parseLevel(urbanRaw);
    const { min, max } = level.bounds;
    for (const spawn of level.spawns) {
      const { x, y, z } = spawn.position;
      expect(x).toBeGreaterThanOrEqual(min.x);
      expect(x).toBeLessThanOrEqual(max.x);
      expect(y).toBeGreaterThanOrEqual(min.y);
      expect(y).toBeLessThanOrEqual(max.y);
      expect(z).toBeGreaterThanOrEqual(min.z);
      expect(z).toBeLessThanOrEqual(max.z);
    }
  });

  it('no spawn penetrates any non-ground collider', () => {
    const level = parseLevel(urbanRaw);
    // Skip the ground plane (index 0) — spawns are intentionally on it.
    // A spawn at y=0 touching the ground top surface is valid (standing on it).
    const nonGroundColliders = level.colliders.slice(1);

    for (const spawn of level.spawns) {
      const { x, y, z } = spawn.position;
      for (const col of nonGroundColliders) {
        const pen = penetratesBox(x, y, z, col);
        if (pen) {
          // Provide a useful failure message
          throw new Error(
            `Spawn (${x},${y},${z}) team="${spawn.team ?? 'none'}" penetrates collider` +
              ` center=(${col.center.x},${col.center.y},${col.center.z})` +
              ` half=(${col.half.x},${col.half.y},${col.half.z})`,
          );
        }
        expect(pen).toBe(false);
      }
    }
  });

  it('spawns have expected team labels', () => {
    const level = parseLevel(urbanRaw);
    const teams = level.spawns.map((s) => s.team ?? 'none');
    expect(teams).toContain('alpha');
    expect(teams).toContain('bravo');
  });
});

// ── Physics settle test ───────────────────────────────────────────────────────

describe('T-132 urban01 level: player settles on ground after 60 idle ticks', () => {
  it('player spawned in urban01 is on ground after 60 idle ticks and does not penetrate any collider', () => {
    const level = parseLevel(urbanRaw);
    const world = createWorld(1337, DEFAULT_SETTINGS, level);

    // Run 60 idle ticks (no input) — gravity settles the player on the ground
    for (let t = 0; t < 60; t++) {
      step(world, []);
    }

    const s = snapshot(world);
    expect(s.player.onGround).toBe(true);

    // The player position is eye-level; foot = eye - eyeHeight
    const footX = s.player.position.x;
    const footY = s.player.position.y - DEFAULT_SETTINGS.eyeHeight;
    const footZ = s.player.position.z;

    // Foot should be at or near ground level (y ≈ 0)
    expect(footY).toBeGreaterThanOrEqual(-0.01);
    expect(footY).toBeLessThan(0.5);

    // Must not penetrate any collider
    for (const col of level.colliders) {
      // Skip the ground plane (index 0): foot is meant to rest on it
      if (col === level.colliders[0]) continue;
      const pen = penetratesBox(footX, footY, footZ, col);
      expect(pen).toBe(false);
    }
  });
});

// ── Deterministic golden hash ─────────────────────────────────────────────────

describe('T-132 urban01 level: deterministic golden hash', () => {
  /**
   * A short scripted run on the urban01 map. Seed 1337, 60 ticks:
   *   - Ticks 0–19: idle (no input) — gravity settles player on spawn
   *   - Ticks 20–39: move forward (toward -Z from bravo side)
   *   - Ticks 40–59: strafe right
   *
   * Both runs must produce identical hashes, and the result is pinned to a
   * literal GOLDEN constant. Changing this requires a deliberate reviewed re-baseline.
   */
  function runUrbanScenario(seed: number): string {
    const level = parseLevel(urbanRaw);
    const world = createWorld(seed, DEFAULT_SETTINGS, level);
    for (let t = 0; t < 20; t++) {
      step(world, []);
    }
    for (let t = 0; t < 20; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    for (let t = 0; t < 20; t++) {
      step(world, [{ type: 'move', forward: 0, right: 1, jump: false }]);
    }
    return hashWorld(world);
  }

  it('two runs with the same seed produce identical hashes (determinism)', () => {
    const h1 = runUrbanScenario(1337);
    const h2 = runUrbanScenario(1337);
    expect(h1).toBe(h2);
  });

  it('different seeds produce different hashes', () => {
    const h1 = runUrbanScenario(1337);
    const h2 = runUrbanScenario(9999);
    expect(h1).not.toBe(h2);
  });

  it('matches stable golden hash (re-baseline is a reviewed act)', () => {
    const h1 = runUrbanScenario(1337);
    const h2 = runUrbanScenario(1337);
    expect(h1).toBe(h2);

    // Literal golden hash pinned from the first authoritative run.
    // A change here = a deliberate physics or level change → re-baseline via reviewed PR.
    const GOLDEN = '54d999ab';
    expect(h1).toBe(GOLDEN);
  });
});

// ── parseLevel error handling ─────────────────────────────────────────────────

describe('T-132 parseLevel: rejects malformed input', () => {
  it('throws on null input', () => {
    expect(() => parseLevel(null)).toThrow(/expected an object/);
  });

  it('throws on missing name', () => {
    expect(() =>
      parseLevel({
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        colliders: [{ center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
        spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
      }),
    ).toThrow(/name/);
  });

  it('throws on missing colliders field', () => {
    expect(() =>
      parseLevel({
        name: 'bad',
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
      }),
    ).toThrow(/colliders/);
  });

  it('throws on empty colliders array (validateLevel fires)', () => {
    expect(() =>
      parseLevel({
        name: 'empty',
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        colliders: [],
        spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
      }),
    ).toThrow(/at least one collider/);
  });

  it('throws on empty spawns array (validateLevel fires)', () => {
    expect(() =>
      parseLevel({
        name: 'nospawns',
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        colliders: [{ center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
        spawns: [],
      }),
    ).toThrow(/at least one spawn/);
  });

  it('throws on non-positive half extents (validateLevel fires)', () => {
    expect(() =>
      parseLevel({
        name: 'badcol',
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        colliders: [{ center: { x: 0, y: 0, z: 0 }, half: { x: 0, y: 1, z: 1 } }],
        spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
      }),
    ).toThrow(/positive/);
  });

  it('throws on bounds where min >= max', () => {
    expect(() =>
      parseLevel({
        name: 'badbounds',
        bounds: { min: { x: 5, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        colliders: [{ center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
        spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
      }),
    ).toThrow(/bounds/);
  });
});
