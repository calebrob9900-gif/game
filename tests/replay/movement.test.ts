/**
 * T-102 — Ground movement: accel + friction (counter-strafe), per-weapon move mult.
 *
 * Verifier: V2 (logic/replay). Tests in this file are strictly non-tautological:
 * all expected values were computed by running the sim once and hardcoding literals.
 *
 * Three test suites:
 *   1. Position-curve replay  — pinned positions at specific ticks + literal golden hash.
 *   2. Counter-strafe braking — friction stops player fast; reverse input flips velocity sign.
 *   3. Per-weapon move mult   — moveMult 0.75 reaches strictly shorter distance; both
 *                               deterministic (literal golden hashes).
 *
 * Params from research/03 §7.1:
 *   maxRunSpeed 6 m/s, groundAccel 60 m/s² (within 50–90 range), friction 8 (1/s, within 6–10).
 *   Per-weapon mults: knife/empty 1.0, AR 0.85, LMG/sniper 0.75.
 *   Frame-rate-independent: friction via `1 - exp(-lambda*dt)`.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  snapshot,
  hashWorld,
  DEFAULT_SETTINGS,
  DEFAULT_MOVEMENT_PARAMS,
  type Command,
} from '../../src/sim';
import { createTestLevel } from '../../src/sim/levels/testLevel';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Run a fixed input sequence on the test level and return positions at specific ticks.
 * The player spawns at (-5, 0, 0) (foot) with yaw=0 in the test level.
 */
function runWithPositions(
  seed: number,
  tickCommands: Record<number, Command[]>,
  totalTicks: number,
): { positions: Record<number, { x: number; y: number; z: number }>; hash: string } {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);
  const positions: Record<number, { x: number; y: number; z: number }> = {};

  for (let t = 0; t < totalTicks; t++) {
    step(world, tickCommands[t] ?? []);
    const s = snapshot(world);
    positions[t + 1] = { ...s.player.position };
  }

  return { positions, hash: hashWorld(world) };
}

/**
 * Run a scenario with an optional per-entity moveMult applied before stepping.
 * Returns the final Z position (eye height) and world hash after totalTicks.
 */
function runWithMoveMult(
  seed: number,
  moveMult: number,
  totalTicks: number,
): { z: number; hash: string } {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);

  // Always set an explicit moveMult (including 1.0) so the golden hash for the
  // 1.0 case pins the explicit-1.0 path, not the field-absent path.
  const playerEnt = world.ecs.with('player').entities[0] as { moveMult?: number };
  playerEnt.moveMult = moveMult;

  for (let t = 0; t < totalTicks; t++) {
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
  }

  return { z: snapshot(world).player.position.z, hash: hashWorld(world) };
}

// ── 1. Position-curve replay ───────────────────────────────────────────────────

describe('T-102 position-curve replay', () => {
  /**
   * Scenario: seed=42, testLevel, forward=1 (wishZ=-1 at yaw=0) for ticks 1–30,
   * then no input for ticks 31–60.
   *
   * Physics:
   *   - groundAccel=60, DT=1/60 → accelFactor = min(1, 1.0) = 1.0: velocity snaps to
   *     target in 1 tick. With friction applied before accel, the result is exactly
   *     maxRunSpeed (6 m/s) each tick while input is held.
   *   - Each moving tick advances Z by exactly -6/60 = -0.1 m.
   *   - After input released, friction (8/s) decays velocity exponentially:
   *     frictionFactor = 1 - exp(-8 * 1/60) ≈ 0.1248 per tick.
   *
   * All expected values are literal constants computed from a single authoritative run.
   */
  it('positions at specific ticks match the position curve (LITERAL expected values)', () => {
    const fwdCmd: Command = { type: 'move', forward: 1, right: 0, jump: false };
    const tickCommands: Record<number, Command[]> = {};
    for (let t = 0; t < 30; t++) tickCommands[t] = [fwdCmd];

    const { positions } = runWithPositions(42, tickCommands, 60);

    // During acceleration phase (ticks 1–30): each tick advances Z by -0.1 m.
    // Player starts at foot z=0, eye z=eyeHeight (1.7). Moving in -Z direction.
    // Positions below are eye-space (player.position.z = foot.z + eyeHeight is NOT used here;
    // the snapshot position IS the entity position which is eye-level in world.ts).
    // At yaw=0, forward=1: wishX=0, wishZ=-1. So each tick moves z by -0.1.
    // Tick 5: z = 0 + 5*(-0.1) = -0.5
    expect(positions[5]!.z).toBeCloseTo(-0.5, 4);
    // Tick 10: z = -1.0
    expect(positions[10]!.z).toBeCloseTo(-1.0, 4);
    // Tick 15: z = -1.5
    expect(positions[15]!.z).toBeCloseTo(-1.5, 4);
    // Tick 20: z = -2.0
    expect(positions[20]!.z).toBeCloseTo(-2.0, 4);
    // Tick 25: z = -2.5
    expect(positions[25]!.z).toBeCloseTo(-2.5, 4);
    // Tick 30 (last moving tick): z = -3.0
    expect(positions[30]!.z).toBeCloseTo(-3.0, 4);

    // After input released, friction decays velocity. Tick 35 is 5 ticks into decay.
    // Approximate: speed decays by (1 - exp(-8/60)) ≈ 12.48% per tick.
    // After 5 no-input ticks from z=-3.0, speed has decayed:
    // v0=6, v5 ≈ 6 * exp(-8*5/60) ≈ 6 * 0.5134 ≈ 3.08
    // distance = integral ≈ -3.0 + (-0.334) ≈ -3.34 (approximate)
    // Exact value (computed from authoritative run): pinned to 5 decimals so a
    // friction change is actually caught here (not just by the golden hash).
    expect(positions[35]!.z).toBeCloseTo(-3.3411485, 5);
  });

  it('position-curve scenario is deterministic (literal golden hash)', () => {
    const fwdCmd: Command = { type: 'move', forward: 1, right: 0, jump: false };
    const tickCommands: Record<number, Command[]> = {};
    for (let t = 0; t < 30; t++) tickCommands[t] = [fwdCmd];

    const run1 = runWithPositions(42, tickCommands, 60);
    const run2 = runWithPositions(42, tickCommands, 60);

    // Both runs must match each other
    expect(run1.hash).toBe(run2.hash);

    // Literal golden hash — changing this requires a deliberate, reviewed re-baseline.
    // Computed from: seed=42, testLevel, forward 30 ticks + stop 30 ticks.
    const GOLDEN = 'f1ea305f';
    expect(run1.hash).toBe(GOLDEN);
  });
});

// ── 2. Counter-strafe braking ─────────────────────────────────────────────────

describe('T-102 counter-strafe braking', () => {
  /**
   * Counter-strafe is enabled by:
   *   a) High friction (8 /s, within spec range 6–10): rapidly decelerates the player
   *      when input is released.
   *   b) High groundAccel (60 m/s², accelFactor=1.0 at 60 Hz): velocity reversal is near-
   *      instantaneous when the opposite key is pressed.
   *
   * These tests prove both properties hold. They would fail if:
   *   - friction were reduced below ~2 (player would coast far past zero)
   *   - groundAccel*dt were much less than 1 (velocity wouldn't flip in 1 tick)
   */

  it('friction (no input) reduces speed below 1 m/s within 14 ticks from max speed', () => {
    // Build to max speed in +X direction (right=1 at yaw=0 → wishX=1)
    const level = createTestLevel();
    const world = createWorld(100, DEFAULT_SETTINGS, level);

    for (let t = 0; t < 30; t++) {
      step(world, [{ type: 'move', forward: 0, right: 1, jump: false }]);
    }

    const velAtMaxSpeed = snapshot(world).player.velocity;
    const speedAtMax = Math.sqrt(velAtMaxSpeed.x ** 2 + velAtMaxSpeed.z ** 2);

    // Confirm we reached max speed (6 m/s)
    expect(speedAtMax).toBeCloseTo(6.0, 4);

    // Release input — friction only
    let ticksBelowOne = -1;
    for (let t = 0; t < 30; t++) {
      step(world, []); // no input
      const vel = snapshot(world).player.velocity;
      const spd = Math.sqrt(vel.x ** 2 + vel.z ** 2);
      if (spd < 1.0 && ticksBelowOne === -1) {
        ticksBelowOne = t + 1;
      }
    }

    // With friction=8 /s (within the 6–10 spec range), speed drops below 1 m/s
    // in EXACTLY 14 ticks (≈0.23 s) from 6 m/s. Pinned exactly so a friction
    // change in either direction fails this assertion (not gameable by any
    // positive friction the way `>0 && <=14` was).
    expect(ticksBelowOne).toBe(14);
  });

  it('friction params match research/03 §7.1 (6–10 /s range)', () => {
    // Verify DEFAULT_MOVEMENT_PARAMS.friction is in the spec-mandated range.
    expect(DEFAULT_MOVEMENT_PARAMS.friction).toBeGreaterThanOrEqual(6);
    expect(DEFAULT_MOVEMENT_PARAMS.friction).toBeLessThanOrEqual(10);
  });

  it('groundAccel params match research/03 §7.1 (50–90 m/s² range)', () => {
    expect(DEFAULT_MOVEMENT_PARAMS.groundAccel).toBeGreaterThanOrEqual(50);
    expect(DEFAULT_MOVEMENT_PARAMS.groundAccel).toBeLessThanOrEqual(90);
  });

  it('maxRunSpeed matches research/03 §7.1 (~6 m/s)', () => {
    expect(DEFAULT_MOVEMENT_PARAMS.maxRunSpeed).toBeGreaterThanOrEqual(5.0);
    expect(DEFAULT_MOVEMENT_PARAMS.maxRunSpeed).toBeLessThanOrEqual(7.0);
  });

  it('velocity sign reverses in ≤1 tick when opposite input issued (counter-strafe)', () => {
    // At 60 Hz with groundAccel=60: accelFactor = min(1, 60*(1/60)) = 1.0.
    // Friction reduces velocity then acceleration snaps to target in one step.
    // Result: velocity direction flips in exactly 1 tick — ideal counter-strafe.

    const level = createTestLevel();
    const world = createWorld(100, DEFAULT_SETTINGS, level);

    // Build to max +X speed
    for (let t = 0; t < 30; t++) {
      step(world, [{ type: 'move', forward: 0, right: 1, jump: false }]);
    }

    const vxBefore = snapshot(world).player.velocity.x;
    expect(vxBefore).toBeCloseTo(6.0, 4); // moving at max speed in +X

    // Issue one tick of -X input
    step(world, [{ type: 'move', forward: 0, right: -1, jump: false }]);
    const vxAfter = snapshot(world).player.velocity.x;

    // Velocity must have reversed sign: from positive to negative
    expect(vxBefore).toBeGreaterThan(0);
    expect(vxAfter).toBeLessThan(0);
    // The counter-strafe magnitude should approach -maxRunSpeed
    expect(vxAfter).toBeCloseTo(-6.0, 4);
  });

  it('counter-strafe scenario is deterministic (literal golden hash)', () => {
    // seed=100, testLevel: 30 ticks right + 20 ticks no-input
    const level1 = createTestLevel();
    const world1 = createWorld(100, DEFAULT_SETTINGS, level1);
    for (let t = 0; t < 30; t++) {
      step(world1, [{ type: 'move', forward: 0, right: 1, jump: false }]);
    }
    for (let t = 0; t < 20; t++) step(world1, []);

    const level2 = createTestLevel();
    const world2 = createWorld(100, DEFAULT_SETTINGS, level2);
    for (let t = 0; t < 30; t++) {
      step(world2, [{ type: 'move', forward: 0, right: 1, jump: false }]);
    }
    for (let t = 0; t < 20; t++) step(world2, []);

    expect(hashWorld(world1)).toBe(hashWorld(world2));

    // Literal golden hash. Re-baseline only via reviewed PR.
    const GOLDEN = '15fd117c';
    expect(hashWorld(world1)).toBe(GOLDEN);
  });
});

// ── 3. Per-weapon move multiplier ─────────────────────────────────────────────

describe('T-102 per-weapon move multiplier', () => {
  /**
   * moveMult scales maxRunSpeed per entity (research/03 §7.1 + §8.2):
   *   knife/empty: 1.0 (no penalty)
   *   AR:          0.85
   *   LMG/sniper:  0.75
   *
   * The multiplier is stored on Entity.moveMult and read by world.step() before
   * calling integratePlayer(). Default is 1.0 so existing behaviour is unchanged.
   *
   * Test: same seed + inputs, moveMult 1.0 vs 0.75 → 0.75 run must travel strictly
   * shorter distance. Both must be deterministic (literal golden hashes).
   */

  it('DEFAULT_MOVEMENT_PARAMS.moveMult defaults to 1.0', () => {
    expect(DEFAULT_MOVEMENT_PARAMS.moveMult).toBe(1.0);
  });

  it('moveMult=0.75 travels strictly shorter Z distance than moveMult=1.0', () => {
    const r100 = runWithMoveMult(500, 1.0, 60);
    const r75 = runWithMoveMult(500, 0.75, 60);

    // moveMult=1.0: 60 ticks * 6 m/s * (1/60) s/tick = -6.0 m in Z
    expect(r100.z).toBeCloseTo(-6.0, 4);
    // moveMult=0.75: effective speed = 6*0.75 = 4.5 m/s → -4.5 m in Z
    expect(r75.z).toBeCloseTo(-4.5, 4);

    // The 0.75 run must be strictly shorter — this would fail if moveMult weren't applied
    const dist100 = Math.abs(r100.z);
    const dist75 = Math.abs(r75.z);
    expect(dist75).toBeLessThan(dist100);
    // The ratio must be ≤ 0.85 (research/03 §7.1: LMG/sniper at 0.75× AR)
    expect(dist75).toBeLessThan(dist100 * 0.85);
    // Exact ratio: dist75/dist100 = 0.75 (pure speed scaling)
    expect(dist75 / dist100).toBeCloseTo(0.75, 4);
  });

  it('moveMult=0.85 (AR) distance is between moveMult=1.0 and moveMult=0.75', () => {
    const r100 = runWithMoveMult(500, 1.0, 60);
    const r85 = runWithMoveMult(500, 0.85, 60);
    const r75 = runWithMoveMult(500, 0.75, 60);

    expect(Math.abs(r85.z)).toBeCloseTo(Math.abs(r100.z) * 0.85, 4);
    expect(Math.abs(r85.z)).toBeLessThan(Math.abs(r100.z));
    expect(Math.abs(r85.z)).toBeGreaterThan(Math.abs(r75.z));
  });

  it('moveMult=1.0 is deterministic (literal golden hash)', () => {
    const r1 = runWithMoveMult(500, 1.0, 60);
    const r2 = runWithMoveMult(500, 1.0, 60);
    expect(r1.hash).toBe(r2.hash);

    // Literal golden hash for moveMult=1.0, seed=500, testLevel, forward 60 ticks.
    // Re-baseline only via reviewed PR.
    const GOLDEN_100 = '31a3a3a9';
    expect(r1.hash).toBe(GOLDEN_100);
  });

  it('moveMult=0.75 is deterministic (literal golden hash)', () => {
    const r1 = runWithMoveMult(500, 0.75, 60);
    const r2 = runWithMoveMult(500, 0.75, 60);
    expect(r1.hash).toBe(r2.hash);

    // Literal golden hash for moveMult=0.75, seed=500, testLevel, forward 60 ticks.
    // Re-baseline only via reviewed PR.
    const GOLDEN_75 = '93681d27';
    expect(r1.hash).toBe(GOLDEN_75);
  });

  it('moveMult=1.0 and moveMult=0.75 produce different hashes', () => {
    const r100 = runWithMoveMult(500, 1.0, 60);
    const r75 = runWithMoveMult(500, 0.75, 60);
    expect(r100.hash).not.toBe(r75.hash);
  });

  it('entity with no moveMult set behaves identically to moveMult=1.0', () => {
    // Verify that DEFAULT (no moveMult on entity) ≡ moveMult=1.0
    const level1 = createTestLevel();
    const world1 = createWorld(500, DEFAULT_SETTINGS, level1);
    // Do NOT set moveMult — should default to 1.0

    const level2 = createTestLevel();
    const world2 = createWorld(500, DEFAULT_SETTINGS, level2);
    const playerEnt = world2.ecs.with('player').entities[0] as { moveMult?: number };
    playerEnt.moveMult = 1.0; // Explicit 1.0

    for (let t = 0; t < 60; t++) {
      const cmd: Command[] = [{ type: 'move', forward: 1, right: 0, jump: false }];
      step(world1, cmd);
      step(world2, cmd);
    }

    expect(hashWorld(world1)).toBe(hashWorld(world2));
  });
});
