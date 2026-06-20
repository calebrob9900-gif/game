/**
 * Replay / determinism tests for the capsule character controller vs the test level.
 *
 * Proves:
 *   1. Walk into a wall → capsule stays outside the wall AABB (no penetration).
 *   2. Walk toward the low step → capsule steps up onto it (y advances).
 *   3. Two runs with identical seed + inputs produce byte-identical world hashes.
 *   4. Position does not penetrate any collider (AABB test on all colliders).
 *
 * These are V2 "replay" tests: deterministic, headless, no rendering.
 */
import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  hashWorld,
  snapshot,
  DEFAULT_SETTINGS,
  type Command,
} from '../../src/sim';
import { createTestLevel } from '../../src/sim/levels/testLevel';
import {
  PLAYER_CAPSULE,
  STEP_HEIGHT,
  moveAndResolve,
  type ControllerState,
} from '../../src/sim/physics/characterController';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns true if the capsule (foot position) penetrates the given box. */
function penetratesBox(
  footX: number,
  footY: number,
  footZ: number,
  boxCx: number,
  boxCy: number,
  boxCz: number,
  boxHx: number,
  boxHy: number,
  boxHz: number,
): boolean {
  const r = PLAYER_CAPSULE.radius;
  // Expanded AABB by radius
  const minX = boxCx - boxHx - r;
  const maxX = boxCx + boxHx + r;
  const minZ = boxCz - boxHz - r;
  const maxZ = boxCz + boxHz + r;

  const segBotY = footY + r;
  const segTopY = footY + r + 2 * PLAYER_CAPSULE.halfHeight;
  const clampedY = Math.max(boxCy - boxHy, Math.min(boxCy + boxHy, (segBotY + segTopY) * 0.5));
  const closestY = Math.max(segBotY, Math.min(segTopY, clampedY));
  const minY = boxCy - boxHy - r;
  const maxY = boxCy + boxHy + r;

  return (
    footX > minX &&
    footX < maxX &&
    closestY > minY &&
    closestY < maxY &&
    footZ > minZ &&
    footZ < maxZ
  );
}

function runScenario(seed: number, tickCommands: Record<number, Command[]>, ticks: number) {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);
  for (let t = 0; t < ticks; t++) {
    step(world, tickCommands[t] ?? []);
  }
  return { world, snap: snapshot(world), hash: hashWorld(world) };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('capsule vs test level — wall collision', () => {
  it('player walking into north wall stays outside the wall AABB', () => {
    const level = createTestLevel();
    // North wall: center z=-19, half z=1 → inner surface at z = -18
    // Index 1 in createTestLevel; use non-null assertion (indices are known)
    const northWall = level.colliders[1]!;

    const world = createWorld(42, DEFAULT_SETTINGS, level);
    // Spawn is at x=-5, y=0 (foot); run forward (toward -Z, i.e. north wall) for 6 seconds
    for (let t = 0; t < 360; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }

    const s = snapshot(world);
    const footX = s.player.position.x;
    const footY = s.player.position.y - DEFAULT_SETTINGS.eyeHeight;
    const footZ = s.player.position.z;

    // Player should NOT penetrate the north wall
    const penetrates = penetratesBox(
      footX,
      footY,
      footZ,
      northWall.center.x,
      northWall.center.y,
      northWall.center.z,
      northWall.half.x,
      northWall.half.y,
      northWall.half.z,
    );
    expect(penetrates).toBe(false);

    // Player should have advanced significantly in -Z
    expect(footZ).toBeLessThan(-5);
  });

  it('player walking into west wall stays outside the wall AABB', () => {
    const level = createTestLevel();
    const westWall = level.colliders[3]!; // [3] west wall: center x=-19, half x=1 (inner face x=-18)

    const world = createWorld(42, DEFAULT_SETTINGS, level);
    // Face west (yaw = -PI/2 → move in -X) and run for 6 seconds
    for (let t = 0; t < 360; t++) {
      step(world, [
        { type: 'look', dyaw: t === 0 ? -Math.PI / 2 : 0, dpitch: 0 },
        { type: 'move', forward: 1, right: 0, jump: false },
      ]);
    }

    const s = snapshot(world);
    const footX = s.player.position.x;
    const footY = s.player.position.y - DEFAULT_SETTINGS.eyeHeight;
    const footZ = s.player.position.z;

    // The player must actually have travelled west and reached the wall, otherwise
    // "no penetration" is vacuously true. Spawn x=-5; west wall inner face x=-18,
    // capsule (r=0.3) stops at x≈-18.3.
    expect(footX).toBeLessThan(-15);
    expect(footX).toBeGreaterThan(-18.4); // did not pass through the wall

    const penetrates = penetratesBox(
      footX,
      footY,
      footZ,
      westWall.center.x,
      westWall.center.y,
      westWall.center.z,
      westWall.half.x,
      westWall.half.y,
      westWall.half.z,
    );
    expect(penetrates).toBe(false);
  });
});

describe('capsule vs test level — step-up', () => {
  it('player walking toward low step eventually steps up onto it', () => {
    const level = createTestLevel();
    // Low step: center (5, 0.2, -3), half (1.5, 0.2, 1.5) → top at y=0.4
    const lowStep = level.colliders[5]!; // index 5 in createTestLevel
    const stepTop = lowStep.center.y + lowStep.half.y; // 0.4 m

    // Use moveAndResolve directly to test step-up in isolation.
    // Place the capsule at (5, 0, -5): same X as step, south of step, on the ground.
    // Step occupies x=[3.5,6.5], z=[-4.5,-1.5] (center 5,-3; half 1.5,1.5)
    // Approach from z=-5 walking in +Z toward step south face at z=-4.5
    const ground = level.colliders[0]!;
    const stepBox = level.colliders[5]!;

    const ctrlState: ControllerState = {
      position: { x: 5, y: 0, z: -5 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: true,
    };

    // Walk in +Z (toward the step south face) with small steps
    let steppedUp = false;
    for (let i = 0; i < 100; i++) {
      moveAndResolve(ctrlState, { x: 0, y: 0, z: 0.1 }, [ground, stepBox], PLAYER_CAPSULE);
      if (ctrlState.position.y >= stepTop - 0.05) {
        steppedUp = true;
        break;
      }
    }

    expect(steppedUp).toBe(true);
    expect(ctrlState.position.y).toBeGreaterThanOrEqual(stepTop - 0.05);
  });
});

describe('capsule vs test level — no collider penetration', () => {
  it('after complex movement, player never penetrates any collider', () => {
    const level = createTestLevel();
    const world = createWorld(2024, DEFAULT_SETTINGS, level);

    const inputs: Record<number, Command[]> = {
      0: [{ type: 'look', dyaw: 0.5, dpitch: 0 }],
      10: [{ type: 'move', forward: 1, right: 0, jump: false }],
      30: [{ type: 'move', forward: 1, right: 1, jump: false }],
      60: [{ type: 'move', forward: 1, right: 0, jump: true }],
      90: [{ type: 'look', dyaw: -1.5, dpitch: 0 }],
      100: [{ type: 'move', forward: 1, right: 0, jump: false }],
      150: [{ type: 'move', forward: -1, right: 1, jump: false }],
      180: [{ type: 'move', forward: 0, right: 0, jump: false }],
    };

    for (let t = 0; t < 240; t++) {
      step(world, inputs[t] ?? []);
    }

    const s = snapshot(world);
    const footX = s.player.position.x;
    const footY = s.player.position.y - DEFAULT_SETTINGS.eyeHeight;
    const footZ = s.player.position.z;

    // Check no penetration against all colliders
    for (const col of level.colliders) {
      const pen = penetratesBox(
        footX,
        footY,
        footZ,
        col.center.x,
        col.center.y,
        col.center.z,
        col.half.x,
        col.half.y,
        col.half.z,
      );
      if (pen) {
        // Provide a helpful failure message
        expect(pen).toBe(false);
      }
    }
  });
});

describe('capsule vs test level — determinism', () => {
  it('two runs with same seed and inputs produce identical world hash', () => {
    const inputs: Record<number, Command[]> = {
      0: [{ type: 'look', dyaw: 0.8, dpitch: -0.1 }],
      5: [{ type: 'move', forward: 1, right: 0, jump: false }],
      30: [{ type: 'move', forward: 1, right: 1, jump: true }],
      60: [{ type: 'move', forward: 0, right: -1, jump: false }],
      90: [{ type: 'look', dyaw: -1.0, dpitch: 0 }],
      100: [{ type: 'move', forward: 1, right: 0, jump: false }],
    };

    const r1 = runScenario(777, inputs, 180);
    const r2 = runScenario(777, inputs, 180);

    expect(r1.hash).toBe(r2.hash);
    expect(r1.snap.tick).toBe(180);
    expect(r2.snap.tick).toBe(180);
  });

  it('different seeds produce different hashes', () => {
    const inputs: Record<number, Command[]> = {
      5: [{ type: 'move', forward: 1, right: 0, jump: false }],
    };

    const r1 = runScenario(100, inputs, 60);
    const r2 = runScenario(200, inputs, 60);

    expect(r1.hash).not.toBe(r2.hash);
  });

  it('matches a stable golden hash (re-baseline is a reviewed act)', () => {
    const inputs: Record<number, Command[]> = {
      0: [{ type: 'look', dyaw: 0.6, dpitch: -0.1 }],
      5: [{ type: 'move', forward: 1, right: 0, jump: false }],
      30: [{ type: 'move', forward: 1, right: 1, jump: true }],
      90: [{ type: 'move', forward: 0, right: 0, jump: false }],
    };

    const r1 = runScenario(42, inputs, 120);
    const r2 = runScenario(42, inputs, 120);

    // Both runs must match each other.
    expect(r1.hash).toBe(r2.hash);

    // Pinned literal golden hash for the CAPSULE-vs-level path (createWorld is
    // given a level, so step() routes through the capsule controller). A change
    // here = a deliberate capsule-physics change → re-baseline only via reviewed PR.
    const GOLDEN = '2be1af91';
    expect(r1.hash).toBe(GOLDEN);
  });
});

describe('capsule vs test level — high platform blocks (not steppable)', () => {
  it('player cannot step onto the 2 m platform; capsule stays at ground level', () => {
    const level = createTestLevel();
    // [6] high platform: center (10,1,-5), half (2,1,2) → top y=2 (> STEP_HEIGHT 0.4)
    const platform = level.colliders[6]!;
    const ground = level.colliders[0]!;
    const platformTop = platform.center.y + platform.half.y; // 2.0

    // Approach the platform's south face from z=-9 walking +Z at x=10 (same X).
    const ctrlState: ControllerState = {
      position: { x: 10, y: 0, z: -9 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: true,
    };
    for (let i = 0; i < 120; i++) {
      moveAndResolve(ctrlState, { x: 0, y: 0, z: 0.1 }, [ground, platform], PLAYER_CAPSULE);
    }

    // The capsule must be blocked horizontally and NOT have climbed the platform.
    expect(ctrlState.position.y).toBeLessThan(platformTop - 1); // stayed near ground (~0)
    expect(ctrlState.position.z).toBeLessThan(platform.center.z - platform.half.z); // south of it
  });
});

describe('createTestLevel validation', () => {
  it('level has ground, walls, low step and high platform', () => {
    const level = createTestLevel();
    expect(level.name).toBe('test_level');
    expect(level.colliders.length).toBeGreaterThanOrEqual(7);
    expect(level.spawns.length).toBeGreaterThanOrEqual(1);
  });

  it('low step top surface is <= STEP_HEIGHT', () => {
    const level = createTestLevel();
    // Low step is collider index 5 in testLevel
    const lowStepCol = level.colliders[5]!;
    const stepTop = lowStepCol.center.y + lowStepCol.half.y;
    expect(stepTop).toBeLessThanOrEqual(STEP_HEIGHT);
  });

  it('high platform top surface is > STEP_HEIGHT', () => {
    const level = createTestLevel();
    // High platform is collider index 6 in testLevel
    const platform = level.colliders[6]!;
    const platformTop = platform.center.y + platform.half.y;
    expect(platformTop).toBeGreaterThan(STEP_HEIGHT);
  });
});
