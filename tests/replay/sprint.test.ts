/**
 * T-103 — Sprint + tactical sprint + sprint-to-fire delay.
 *
 * Verifier: V2 (logic/replay). All expected values are LITERAL constants computed
 * from a single authoritative run and pinned as golden hashes.
 *
 * Three test suites:
 *   1. Sprint distance  — sprint ×1.4 and tac-sprint ×1.7 of base walk distance over 60 ticks.
 *                         Concrete literal distances + golden hashes.
 *   2. Sprint-out timer — canFire=false immediately after sprint release, countdown is
 *                         deterministic; canFire=true after the window elapses.
 *                         Sprint: 9 ticks (≈0.15 s), tac-sprint: 15 ticks (≈0.25 s) at 60 Hz.
 *   3. canFire gate     — canFire=false while sprinting; true when walking (no sprint input).
 *
 * Params from research/03 §7.2 / §2.2:
 *   sprint ×1.3–1.5 (chosen 1.4), tac-sprint ×1.6–1.8 (chosen 1.7),
 *   sprint-out 100–250 ms (chosen 0.15 s sprint / 0.25 s tac-sprint).
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  snapshot,
  hashWorld,
  DEFAULT_SETTINGS,
  SPRINT_MULT,
  TAC_SPRINT_MULT,
  SPRINT_OUT_TICKS,
  TAC_SPRINT_OUT_TICKS,
  type Command,
} from '../../src/sim';
import { createTestLevel } from '../../src/sim/levels/testLevel';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Run a fixed sprint/walk scenario on the test level.
 * Player spawns at (-5, 0, 0) foot / yaw=0 in the test level.
 * forward=1 at yaw=0 → wishZ = -1 (moves in -Z).
 */
function runSprintDistance(
  useSprintFlag: boolean,
  useTacSprintFlag: boolean,
  totalTicks: number,
): { z: number; hash: string; canFire: boolean; isSprinting: boolean } {
  const level = createTestLevel();
  const world = createWorld(1234, DEFAULT_SETTINGS, level);
  for (let t = 0; t < totalTicks; t++) {
    const cmd: Command = {
      type: 'move',
      forward: 1,
      right: 0,
      jump: false,
      sprint: useSprintFlag,
      tacSprint: useTacSprintFlag,
    };
    step(world, [cmd]);
  }
  const s = snapshot(world);
  return {
    z: s.player.position.z,
    hash: hashWorld(world),
    canFire: s.player.canFire,
    isSprinting: s.player.isSprinting,
  };
}

/**
 * Run a sprint-out scenario:
 *   - Sprint for `sprintTicks` ticks.
 *   - Release sprint on the next tick (forward still held, no sprint key).
 *   - Advance `extraTicks` more ticks.
 * Returns state right after release and after extra ticks.
 */
function runSprintOut(
  sprintTicks: number,
  extraTicks: number,
  useTacSprint: boolean,
): {
  tickAfterRelease: number;
  canFireAfterRelease: boolean;
  sprintOutUntilTick: number;
  tickAfterExtra: number;
  canFireAfterExtra: boolean;
  hashAtEnd: string;
} {
  const level = createTestLevel();
  const world = createWorld(5678, DEFAULT_SETTINGS, level);

  // Sprint for sprintTicks
  for (let t = 0; t < sprintTicks; t++) {
    const cmd: Command = {
      type: 'move',
      forward: 1,
      right: 0,
      jump: false,
      sprint: !useTacSprint,
      tacSprint: useTacSprint,
    };
    step(world, [cmd]);
  }

  // Release sprint — forward still held, no sprint key
  step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
  const snapAfterRelease = snapshot(world);

  // Advance extraTicks more with no sprint
  for (let t = 0; t < extraTicks; t++) {
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
  }
  const snapFinal = snapshot(world);

  return {
    tickAfterRelease: snapAfterRelease.tick,
    canFireAfterRelease: snapAfterRelease.player.canFire,
    sprintOutUntilTick: snapAfterRelease.player.sprintOutUntilTick,
    tickAfterExtra: snapFinal.tick,
    canFireAfterExtra: snapFinal.player.canFire,
    hashAtEnd: hashWorld(world),
  };
}

// ── 1. Sprint distance ─────────────────────────────────────────────────────────

describe('T-103 sprint distance', () => {
  /**
   * Scenario: seed=1234, testLevel, 60 ticks of forward movement with sprint/tac-sprint.
   *
   * Physics:
   *   Walk: maxRunSpeed=6 m/s, DT=1/60 → z moves -0.1 m/tick → total -6.0 m in 60 ticks.
   *   Sprint: effectiveSpeed = 6 * 1.4 = 8.4 m/s → -0.14 m/tick → total -8.4 m.
   *   Tac-sprint: effectiveSpeed = 6 * 1.7 = 10.2 m/s → -0.17 m/tick → total -10.2 m.
   *
   * All expected values are LITERAL constants from a single authoritative run.
   */

  it('exports correct sprint constants matching research/03 §7.2', () => {
    // Sprint ×1.3–1.5 (chosen 1.4)
    expect(SPRINT_MULT).toBe(1.4);
    // Tac-sprint ×1.6–1.8 (chosen 1.7)
    expect(TAC_SPRINT_MULT).toBe(1.7);
    // Sprint-out: ~0.15 s at 60 Hz = 9 ticks
    expect(SPRINT_OUT_TICKS).toBe(9);
    // Tac-sprint-out: ~0.25 s at 60 Hz = 15 ticks
    expect(TAC_SPRINT_OUT_TICKS).toBe(15);
  });

  it('walk (no sprint) travels exactly -6.0 m in Z over 60 ticks', () => {
    const walk = runSprintDistance(false, false, 60);
    expect(walk.z).toBeCloseTo(-6.0, 4);
    // canFire always true when no sprint ever occurred
    expect(walk.canFire).toBe(true);
    expect(walk.isSprinting).toBe(false);
  });

  it('sprint travels ~1.4× walk distance over 60 ticks (LITERAL expected distance)', () => {
    const walk = runSprintDistance(false, false, 60);
    const sprint = runSprintDistance(true, false, 60);

    // Concrete literal: 6.0 * 1.4 = 8.4 m
    expect(Math.abs(sprint.z)).toBeCloseTo(8.4, 4);
    // Ratio vs walk must be ≈ SPRINT_MULT
    expect(Math.abs(sprint.z) / Math.abs(walk.z)).toBeCloseTo(SPRINT_MULT, 4);
    // Strictly longer
    expect(Math.abs(sprint.z)).toBeGreaterThan(Math.abs(walk.z));
    // canFire=false while still sprinting
    expect(sprint.canFire).toBe(false);
    expect(sprint.isSprinting).toBe(true);
  });

  it('tac-sprint travels ~1.7× walk distance over 60 ticks (LITERAL expected distance)', () => {
    const walk = runSprintDistance(false, false, 60);
    const tacSprint = runSprintDistance(false, true, 60);

    // Concrete literal: 6.0 * 1.7 = 10.2 m
    expect(Math.abs(tacSprint.z)).toBeCloseTo(10.2, 4);
    // Ratio vs walk must be ≈ TAC_SPRINT_MULT
    expect(Math.abs(tacSprint.z) / Math.abs(walk.z)).toBeCloseTo(TAC_SPRINT_MULT, 4);
    // Strictly longer than sprint
    const sprint = runSprintDistance(true, false, 60);
    expect(Math.abs(tacSprint.z)).toBeGreaterThan(Math.abs(sprint.z));
    // canFire=false while still tac-sprinting
    expect(tacSprint.canFire).toBe(false);
    expect(tacSprint.isSprinting).toBe(true);
  });

  it('sprint 60 ticks is deterministic (LITERAL golden hash)', () => {
    const r1 = runSprintDistance(true, false, 60);
    const r2 = runSprintDistance(true, false, 60);
    expect(r1.hash).toBe(r2.hash);

    // Literal golden — re-baseline only via reviewed PR.
    // seed=1234, testLevel, sprint=true, 60 ticks forward.
    const GOLDEN_SPRINT = 'cef63996';
    expect(r1.hash).toBe(GOLDEN_SPRINT);
  });

  it('tac-sprint 60 ticks is deterministic (LITERAL golden hash)', () => {
    const r1 = runSprintDistance(false, true, 60);
    const r2 = runSprintDistance(false, true, 60);
    expect(r1.hash).toBe(r2.hash);

    // Literal golden — re-baseline only via reviewed PR.
    // seed=1234, testLevel, tacSprint=true, 60 ticks forward.
    const GOLDEN_TAC_SPRINT = 'babe86e0';
    expect(r1.hash).toBe(GOLDEN_TAC_SPRINT);
  });

  it('sprint and tac-sprint produce different hashes from walk', () => {
    const walk = runSprintDistance(false, false, 60);
    const sprint = runSprintDistance(true, false, 60);
    const tacSprint = runSprintDistance(false, true, 60);
    expect(sprint.hash).not.toBe(walk.hash);
    expect(tacSprint.hash).not.toBe(walk.hash);
    expect(tacSprint.hash).not.toBe(sprint.hash);
  });

  it('sprint requires forward-ish input — strafe-only sprint has no effect', () => {
    // With forward=0, sprint flag should NOT activate (no forward-ish movement)
    const level = createTestLevel();
    const world1 = createWorld(999, DEFAULT_SETTINGS, level);
    const level2 = createTestLevel();
    const world2 = createWorld(999, DEFAULT_SETTINGS, level2);

    for (let t = 0; t < 30; t++) {
      // world1: strafe right with sprint=true (no forward)
      step(world1, [{ type: 'move', forward: 0, right: 1, jump: false, sprint: true }]);
      // world2: strafe right without sprint (control)
      step(world2, [{ type: 'move', forward: 0, right: 1, jump: false }]);
    }
    // Positions must be identical (sprint didn't activate)
    const s1 = snapshot(world1);
    const s2 = snapshot(world2);
    expect(s1.player.position.x).toBeCloseTo(s2.player.position.x, 4);
    expect(s1.player.position.z).toBeCloseTo(s2.player.position.z, 4);
  });
});

// ── 2. Sprint-out timer ────────────────────────────────────────────────────────

describe('T-103 sprint-out timer', () => {
  /**
   * After sprint ends, firing is blocked for SPRINT_OUT_TICKS (9) ticks.
   * After tac-sprint ends, firing is blocked for TAC_SPRINT_OUT_TICKS (15) ticks.
   *
   * Scenario: seed=5678, testLevel.
   *   - Sprint for 10 ticks.
   *   - Release sprint (still moving forward).
   *   - sprintOutUntilTick = releaseTickPlusOne + outTicks.
   */

  it('sprint-out window is set correctly after sprint release', () => {
    // Sprint 10 ticks → release on tick 11 → sprintOutUntilTick = 11 + 9 = 20
    const result = runSprintOut(10, 0, false);
    expect(result.tickAfterRelease).toBe(11);
    // sprintOutUntilTick = 11 + 9 = 20 (world.tick=10 at release tick, +1+9=20)
    expect(result.sprintOutUntilTick).toBe(20);
    // canFire=false immediately after release (still in window)
    expect(result.canFireAfterRelease).toBe(false);
  });

  it('tac-sprint-out window is longer than sprint-out window', () => {
    const sprintResult = runSprintOut(10, 0, false);
    const tacResult = runSprintOut(10, 0, true);
    // Tac-sprint window: 11 + 15 = 26
    expect(tacResult.sprintOutUntilTick).toBe(26);
    // Tac-sprint window must be longer
    expect(tacResult.sprintOutUntilTick).toBeGreaterThan(sprintResult.sprintOutUntilTick);
    expect(tacResult.sprintOutUntilTick - sprintResult.sprintOutUntilTick).toBe(
      TAC_SPRINT_OUT_TICKS - SPRINT_OUT_TICKS,
    );
  });

  it('canFire=false during sprint-out window, true after expiry', () => {
    // Sprint 10 ticks, release, advance 20 more ticks (window expires at tick 20).
    // At tick 31 (11 + 20), we're past the window.
    const result = runSprintOut(10, 20, false);
    expect(result.canFireAfterRelease).toBe(false); // still in window at tick 11
    expect(result.canFireAfterExtra).toBe(true); // past window at tick 31
  });

  it('sprint-out timer counts down deterministically (LITERAL golden hash)', () => {
    const r1 = runSprintOut(10, 20, false);
    const r2 = runSprintOut(10, 20, false);
    expect(r1.hashAtEnd).toBe(r2.hashAtEnd);

    // Literal golden — re-baseline only via reviewed PR.
    // seed=5678, testLevel, sprint 10 ticks, release, walk 21 ticks.
    const GOLDEN_SPRINT_OUT = '3eb4d407';
    expect(r1.hashAtEnd).toBe(GOLDEN_SPRINT_OUT);
  });

  it('tac-sprint-out timer counts down deterministically (LITERAL golden hash)', () => {
    const r1 = runSprintOut(10, 20, true);
    const r2 = runSprintOut(10, 20, true);
    expect(r1.hashAtEnd).toBe(r2.hashAtEnd);

    // Literal golden — re-baseline only via reviewed PR.
    // seed=5678, testLevel, tacSprint 10 ticks, release, walk 21 ticks.
    const GOLDEN_TAC_SPRINT_OUT = 'e57bc736';
    expect(r1.hashAtEnd).toBe(GOLDEN_TAC_SPRINT_OUT);
  });

  it('canFire exactly at the boundary tick (one tick before window expiry is false)', () => {
    // Sprint 10 ticks → window = [11, 20). At tick 19 (window not yet expired).
    // We need exactly 8 more ticks after release (tick 11 → tick 19 = 8 extra ticks).
    const resultBefore = runSprintOut(10, 8, false);
    // tick = 11 + 8 = 19 < 20 → still blocked
    expect(resultBefore.tickAfterExtra).toBe(19);
    expect(resultBefore.canFireAfterExtra).toBe(false);

    // Exactly 9 more ticks after release (tick 11 → tick 20, equals sprintOutUntilTick=20).
    // world.tick >= sprintOutUntilTick → canFire=true
    const resultAt = runSprintOut(10, 9, false);
    expect(resultAt.tickAfterExtra).toBe(20);
    expect(resultAt.canFireAfterExtra).toBe(true);
  });
});

// ── 3. canFire gate ────────────────────────────────────────────────────────────

describe('T-103 canFire gate', () => {
  /**
   * Validates the derived canFire boolean in the snapshot.
   * Presentation and future weapon systems (T-111) read only canFire.
   */

  it('canFire=true when walking with no sprint history', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);
    for (let t = 0; t < 10; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    expect(snapshot(world).player.canFire).toBe(true);
  });

  it('canFire=false while sprint is active', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }
    expect(snapshot(world).player.isSprinting).toBe(true);
    expect(snapshot(world).player.canFire).toBe(false);
  });

  it('canFire=false while tac-sprint is active', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, tacSprint: true }]);
    }
    expect(snapshot(world).player.isSprinting).toBe(true);
    expect(snapshot(world).player.canFire).toBe(false);
  });

  it('canFire=false during sprint-out window, true after', () => {
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Sprint for 5 ticks
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }
    // Release sprint — still in sprint-out window
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    expect(snapshot(world).player.canFire).toBe(false);

    // Advance past SPRINT_OUT_TICKS more ticks
    for (let t = 0; t < SPRINT_OUT_TICKS; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    expect(snapshot(world).player.canFire).toBe(true);
  });

  it('existing non-sprint commands do not affect canFire (backward compat)', () => {
    // Commands without sprint fields must produce canFire=true (no regression)
    const level = createTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);
    // Old-style command — no sprint fields
    for (let t = 0; t < 10; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    const s = snapshot(world);
    expect(s.player.canFire).toBe(true);
    expect(s.player.isSprinting).toBe(false);
    expect(s.player.sprintOutUntilTick).toBe(0);
  });
});
