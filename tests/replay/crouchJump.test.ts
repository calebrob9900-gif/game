/**
 * T-104 — Crouch + jump (gravity ~18–25 m/s²).
 *
 * Verifier: V2 (logic/replay). All expected values are LITERAL constants computed
 * from a single authoritative run and pinned as golden hashes.
 *
 * Three test suites:
 *   1. Jump apex height  — deterministic apex, replay-stable.
 *   2. Crouch stance+speed — eye height drops to EYE_HEIGHT_CROUCH, speed ×0.45.
 *   3. Crouch under overhang — crouched capsule fits under a 1.5 m ceiling that
 *      would block standing.
 *
 * Params from research/03 §7.3 / §7.4:
 *   gravity 18–25 m/s² (chosen 20), jump apex ~1.0 m: sqrt(2*20*1)≈6.3 m/s,
 *   crouch speed ×0.4–0.5 (chosen 0.45), crouch capsule height ~1.2 m,
 *   crouch eye height ~1.0 m.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  snapshot,
  hashWorld,
  DEFAULT_SETTINGS,
  EYE_HEIGHT_STAND,
  EYE_HEIGHT_CROUCH,
  CROUCH_SPEED_MULT,
  type Command,
} from '../../src/sim';
import { createTestLevel } from '../../src/sim/levels/testLevel';
import type { LevelDescriptor } from '../../src/sim/levels/levelDescriptor';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Run a jump scenario on the test level.
 * Player spawns at foot (−5, 0, 0), yaw=0.
 *
 * First tick: apply jump command. Then run for totalTicks, recording max eye-y.
 */
function runJumpApex(
  seed: number,
  totalTicks: number,
): { maxEyeY: number; finalHash: string; landedAgain: boolean } {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);

  let maxEyeY = snapshot(world).player.position.y;
  let landedAgain = false;
  let wasAirborne = false;

  // Tick 0: jump
  step(world, [{ type: 'move', forward: 0, right: 0, jump: true }]);
  let s = snapshot(world);
  if (s.player.position.y > maxEyeY) maxEyeY = s.player.position.y;
  if (!s.player.onGround) wasAirborne = true;

  // Remaining ticks: no input (let gravity pull back down)
  for (let t = 1; t < totalTicks; t++) {
    step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]);
    s = snapshot(world);
    if (s.player.position.y > maxEyeY) maxEyeY = s.player.position.y;
    if (wasAirborne && s.player.onGround) landedAgain = true;
  }

  return { maxEyeY, finalHash: hashWorld(world), landedAgain };
}

/**
 * Run N ticks of forward movement with optional crouch, return Z distance and hash.
 * Player spawns at foot (−5, 0, 0), yaw=0 → wishZ = −1 per tick.
 */
function runCrouchDistance(
  seed: number,
  totalTicks: number,
  crouch: boolean,
): { z: number; finalHash: string } {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);

  for (let t = 0; t < totalTicks; t++) {
    const cmd: Command = {
      type: 'move',
      forward: 1,
      right: 0,
      jump: false,
      crouch,
    };
    step(world, [cmd]);
  }

  const s = snapshot(world);
  return { z: s.player.position.z, finalHash: hashWorld(world) };
}

/**
 * Create a level with a low ceiling (1.5 m) to test "crouch under overhang".
 * The overhang blocks standing (capsule height 1.8 m) but not crouching (1.2 m).
 *
 * Layout:
 *   - Ground: flat at y=0.
 *   - Low ceiling: a floor placed at y=1.5, thickness 0.5 m
 *     (center y=1.75, half y=0.25). Player crouched can pass under (clearance 1.5 m
 *     > crouched capsule 1.2 m). Standing capsule (1.8 m) cannot (1.8 > 1.5).
 */
function createLowCeilingLevel(): LevelDescriptor {
  return {
    name: 'low_ceiling_test',
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
      // Low ceiling: bottom face at y=1.5
      // center y = 1.5 + 0.25 = 1.75, half y = 0.25
      {
        center: { x: 0, y: 1.75, z: 0 },
        half: { x: 20, y: 0.25, z: 20 },
      },
    ],
    spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
  };
}

// ── 1. Jump apex height ────────────────────────────────────────────────────────

describe('T-104 jump apex height', () => {
  /**
   * Jump apex: v₀ = jumpSpeed = 6.3 m/s, g = 20 m/s².
   * Continuous: apex = v₀² / (2g) = 6.3² / 40 = 39.69 / 40 = 0.992 m above foot.
   * Eye height at apex = footYAtApex + EYE_HEIGHT_STAND.
   *
   * With discrete integration (Euler forward, DT=1/60):
   *   After jump: vel.y = 6.3; then vel.y -= 20 * (1/60) = 6.3 - 0.3333 = 5.9667
   *   Apex is reached when vel.y first goes negative.
   *   Eye position starts at EYE_HEIGHT_STAND (1.7 m) because foot starts at 0.
   *   At apex: eye_y = footY_at_apex + EYE_HEIGHT_STAND.
   *
   * The exact discrete apex value is pinned as a literal.
   */

  it('exports correct constants matching research/03 §7.3–7.4', () => {
    expect(EYE_HEIGHT_STAND).toBe(1.7);
    expect(EYE_HEIGHT_CROUCH).toBe(1.0);
    expect(CROUCH_SPEED_MULT).toBe(0.45);
    // Gravity must be in spec range 18–25 m/s²
    expect(DEFAULT_SETTINGS.gravity).toBeGreaterThanOrEqual(18);
    expect(DEFAULT_SETTINGS.gravity).toBeLessThanOrEqual(25);
    // Jump speed tuned for ~1 m apex: sqrt(2 * g * 1) with g=20 → ~6.32
    expect(DEFAULT_SETTINGS.jumpSpeed).toBeGreaterThan(5.5);
    expect(DEFAULT_SETTINGS.jumpSpeed).toBeLessThan(7.5);
  });

  it('jump apex height is deterministic and ~1 m above foot (LITERAL expected value)', () => {
    const r = runJumpApex(1234, 90);

    // Player lands again after the jump
    expect(r.landedAgain).toBe(true);

    // Apex eye height: foot starts at 0, apex footY ≈ 0.94 m (discrete Euler), eye = foot + 1.7.
    // Continuous apex = v²/(2g) = 6.3²/40 = 0.992 m. Discrete integration is slightly lower.
    // Within the 0.9–1.1 m range required by research/03 §7.4.
    expect(r.maxEyeY).toBeGreaterThan(EYE_HEIGHT_STAND + 0.9); // > 2.6 (at least 0.9 m clearance)
    expect(r.maxEyeY).toBeLessThan(EYE_HEIGHT_STAND + 1.1); // < 2.8 (at most 1.1 m clearance)

    // LITERAL golden: pinned to 3 decimal places so any physics change breaks this.
    // Actual discrete-integration apex with gravity=20, jumpSpeed=6.3, DT=1/60.
    expect(r.maxEyeY).toBeCloseTo(2.64, 3);
  });

  it('jump apex is replay-stable (LITERAL golden hash)', () => {
    const r1 = runJumpApex(1234, 90);
    const r2 = runJumpApex(1234, 90);
    expect(r1.finalHash).toBe(r2.finalHash);
    expect(r1.maxEyeY).toBe(r2.maxEyeY);

    // Literal golden hash — re-baseline only via reviewed PR.
    // seed=1234, testLevel, jump tick 0, 90 ticks total.
    const GOLDEN_JUMP = 'c3d42d0c';
    expect(r1.finalHash).toBe(GOLDEN_JUMP);
  });

  it('two independent jump runs produce identical max heights', () => {
    const r1 = runJumpApex(777, 90);
    const r2 = runJumpApex(777, 90);
    expect(r1.maxEyeY).toBe(r2.maxEyeY);
    expect(r1.finalHash).toBe(r2.finalHash);
  });
});

// ── 2. Crouch stance and speed ─────────────────────────────────────────────────

describe('T-104 crouch stance and speed', () => {
  /**
   * Crouch lowers eye height and reduces speed.
   * eye height: EYE_HEIGHT_STAND (1.7) → EYE_HEIGHT_CROUCH (1.0).
   * speed: ×CROUCH_SPEED_MULT (0.45) of base walk.
   *
   * Over 60 ticks:
   *   Walk: −6.0 m in Z (same as T-102).
   *   Crouch: −6.0 × 0.45 = −2.7 m in Z.
   */

  it('crouch lowers eye height to EYE_HEIGHT_CROUCH (LITERAL value)', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Apply crouch for 5 ticks
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 0, right: 0, jump: false, crouch: true }]);
    }

    const s = snapshot(world);
    // Eye height must match EYE_HEIGHT_CROUCH exactly
    expect(s.player.isCrouched).toBe(true);
    expect(s.player.eyeHeight).toBe(EYE_HEIGHT_CROUCH);
    expect(s.player.eyeHeight).toBe(1.0);
    // position.y is foot + eyeHeight. Foot rests on ground collider surface,
    // which is slightly above y=0 due to skin offset. position.y ≈ 1.002.
    expect(s.player.position.y).toBeCloseTo(EYE_HEIGHT_CROUCH, 1);
    expect(s.player.position.y).toBeGreaterThan(EYE_HEIGHT_CROUCH - 0.01);
    expect(s.player.position.y).toBeLessThan(EYE_HEIGHT_CROUCH + 0.01);
  });

  it('standing (no crouch) has eye height EYE_HEIGHT_STAND', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);
    step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]);
    const s = snapshot(world);
    expect(s.player.isCrouched).toBe(false);
    expect(s.player.eyeHeight).toBe(EYE_HEIGHT_STAND);
    expect(s.player.eyeHeight).toBe(1.7);
  });

  it('crouch reduces speed to ×0.45 of walk (LITERAL distances)', () => {
    const walk = runCrouchDistance(999, 60, false);
    const crouch = runCrouchDistance(999, 60, true);

    // Walk: −6.0 m in Z (maxRunSpeed=6, DT=1/60 → −0.1 m/tick × 60)
    expect(Math.abs(walk.z)).toBeCloseTo(6.0, 4);

    // Crouch: 6.0 × 0.45 = 2.7 m
    expect(Math.abs(crouch.z)).toBeCloseTo(2.7, 4);

    // Ratio must be CROUCH_SPEED_MULT
    expect(Math.abs(crouch.z) / Math.abs(walk.z)).toBeCloseTo(CROUCH_SPEED_MULT, 4);

    // Crouch must be strictly shorter
    expect(Math.abs(crouch.z)).toBeLessThan(Math.abs(walk.z));
  });

  it('crouch distance over 60 ticks is deterministic (LITERAL golden hash)', () => {
    const r1 = runCrouchDistance(999, 60, true);
    const r2 = runCrouchDistance(999, 60, true);
    expect(r1.finalHash).toBe(r2.finalHash);
    expect(r1.z).toBe(r2.z);

    // Literal golden hash — re-baseline only via reviewed PR.
    // seed=999, testLevel, crouch+forward 60 ticks.
    const GOLDEN_CROUCH = '27ccb767';
    expect(r1.finalHash).toBe(GOLDEN_CROUCH);
  });

  it('walk distance over 60 ticks is deterministic (LITERAL golden hash)', () => {
    const r1 = runCrouchDistance(999, 60, false);
    const r2 = runCrouchDistance(999, 60, false);
    expect(r1.finalHash).toBe(r2.finalHash);

    // Literal golden hash — re-baseline only via reviewed PR.
    // seed=999, testLevel, walk (no crouch) 60 ticks.
    const GOLDEN_WALK = '6400c9f5';
    expect(r1.finalHash).toBe(GOLDEN_WALK);
  });

  it('crouch and walk produce different hashes', () => {
    const walk = runCrouchDistance(999, 60, false);
    const crouch = runCrouchDistance(999, 60, true);
    expect(walk.finalHash).not.toBe(crouch.finalHash);
  });

  it('crouch wins over sprint (both held → crouch speed applied)', () => {
    const level = createTestLevel();
    const world = createWorld(123, DEFAULT_SETTINGS, level);

    // Hold both crouch and sprint for 60 ticks
    for (let t = 0; t < 60; t++) {
      step(world, [
        { type: 'move', forward: 1, right: 0, jump: false, crouch: true, sprint: true },
      ]);
    }

    const s = snapshot(world);
    // Must be crouched (crouch wins)
    expect(s.player.isCrouched).toBe(true);
    // Speed should be crouch speed, not sprint speed
    // Crouch: 6 × 0.45 = 2.7 m total; sprint: 6 × 1.4 = 8.4 m total
    expect(Math.abs(s.player.position.z)).toBeCloseTo(2.7, 4);
    // Must NOT be sprinting
    expect(s.player.isSprinting).toBe(false);
  });

  it('un-crouching restores eye height when there is headroom', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Crouch for 5 ticks
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 0, right: 0, jump: false, crouch: true }]);
    }
    expect(snapshot(world).player.isCrouched).toBe(true);

    // Release crouch — plenty of headroom in test level
    step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]);
    const s = snapshot(world);
    expect(s.player.isCrouched).toBe(false);
    expect(s.player.eyeHeight).toBe(EYE_HEIGHT_STAND);
  });

  it('existing non-crouch commands do not affect isCrouched (backward compat)', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);
    for (let t = 0; t < 10; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    const s = snapshot(world);
    // No crouch input → isCrouched must be false, eyeHeight must be stand value
    expect(s.player.isCrouched).toBe(false);
    expect(s.player.eyeHeight).toBe(EYE_HEIGHT_STAND);
  });
});

// ── 3. Crouch under a low overhang ─────────────────────────────────────────────

describe('T-104 crouch under low overhang', () => {
  /**
   * A ceiling at y=1.5 m (bottom face). Standing capsule (1.8 m) cannot fit.
   * Crouched capsule (1.2 m) can fit. Player spawns at foot y=0.
   *
   * Test: attempt to stand under the low ceiling → stay crouched (headroom blocked).
   */

  it('crouched player stays crouched when headroom is blocked above', () => {
    const level = createLowCeilingLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Crouch for 5 ticks to enter crouch state
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 0, right: 0, jump: false, crouch: true }]);
    }
    expect(snapshot(world).player.isCrouched).toBe(true);
    expect(snapshot(world).player.eyeHeight).toBe(EYE_HEIGHT_CROUCH);

    // Release crouch key — but ceiling is above, should stay crouched
    step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]);
    const s = snapshot(world);
    expect(s.player.isCrouched).toBe(true); // still crouched!
    expect(s.player.eyeHeight).toBe(EYE_HEIGHT_CROUCH);
  });

  it('crouched player can move under low ceiling without clipping', () => {
    const level = createLowCeilingLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Crouch and walk
    for (let t = 0; t < 30; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, crouch: true }]);
    }

    const s = snapshot(world);
    // Player must have moved (crouched motion is valid)
    expect(Math.abs(s.player.position.z)).toBeGreaterThan(0.5);
    // Must still be crouched (ceiling overhead)
    expect(s.player.isCrouched).toBe(true);
    // Eye position must be below the ceiling (1.5 m) with some margin
    // eye_y = footY + EYE_HEIGHT_CROUCH (1.0). footY ≈ 0. eye_y ≈ 1.0 < 1.5. ✓
    expect(s.player.position.y).toBeLessThan(1.5);
  });

  it('under low ceiling overhang scenario is deterministic (LITERAL golden hash)', () => {
    const runIt = () => {
      const level = createLowCeilingLevel();
      const world = createWorld(42, DEFAULT_SETTINGS, level);
      for (let t = 0; t < 5; t++) {
        step(world, [{ type: 'move', forward: 0, right: 0, jump: false, crouch: true }]);
      }
      step(world, [{ type: 'move', forward: 0, right: 0, jump: false }]); // try to stand
      return hashWorld(world);
    };

    const h1 = runIt();
    const h2 = runIt();
    expect(h1).toBe(h2);

    // Literal golden hash — re-baseline only via reviewed PR.
    // seed=42, lowCeilingLevel, crouch 5 ticks + 1 tick release.
    const GOLDEN_OVERHANG = 'ef297340';
    expect(h1).toBe(GOLDEN_OVERHANG);
  });
});
