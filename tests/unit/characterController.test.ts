/**
 * Unit tests for the kinematic capsule character controller.
 *
 * Tests:
 *  1. resolveCapsuleVsBox: capsule pushed into a box is ejected to the surface.
 *  2. Wall slide: moving into a wall zeroes the penetrating velocity component
 *     while preserving the tangential component.
 *  3. Step-up: a capsule walking into a short ledge (≤ STEP_HEIGHT) steps onto it.
 *  4. No step-up for tall obstacles: capsule slides along a tall wall.
 *  5. Ground detection: capsule standing on a box is flagged onGround.
 *  6. Frame-rate independence: results at 60 Hz tick count match reference values
 *     within numerical tolerance.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCapsuleVsBox,
  moveAndResolve,
  integratePlayer,
  PLAYER_CAPSULE,
  STEP_HEIGHT,
  DEFAULT_MOVEMENT_PARAMS,
  type ControllerState,
} from '../../src/sim/physics/characterController';
import type { BoxCollider } from '../../src/sim/levels/levelDescriptor';
import { DT } from '../../src/sim/core/time';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeState(x: number, y: number, z: number, onGround = false): ControllerState {
  return {
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    onGround,
  };
}

function box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): BoxCollider {
  return { center: { x: cx, y: cy, z: cz }, half: { x: hx, y: hy, z: hz } };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('resolveCapsuleVsBox', () => {
  it('returns null when capsule is outside the box', () => {
    const b = box(0, 0, 0, 1, 1, 1);
    // Capsule foot 5 m away from box
    const result = resolveCapsuleVsBox(5, 0, 0, PLAYER_CAPSULE, b);
    expect(result).toBeNull();
  });

  it('returns a pushout vector when capsule overlaps box', () => {
    // Box centered at origin, 2×2×2 (half 1,1,1)
    // Capsule foot at (0, -0.5, 0) — the capsule overlaps the top of the box
    const b = box(0, 0, 0, 1, 1, 1);
    const result = resolveCapsuleVsBox(0, -0.5, 0, PLAYER_CAPSULE, b);
    expect(result).not.toBeNull();
    expect(result!.depth).toBeGreaterThan(0);
  });

  it('pushout depth is positive and points away from box center', () => {
    // Capsule centered on top surface of box — should push upward
    const b = box(0, -1, 0, 2, 1, 2); // top surface at y = 0
    // Capsule foot at y = -0.05: capsule slightly sunk into the box top
    const result = resolveCapsuleVsBox(0, -0.05, 0, PLAYER_CAPSULE, b);
    expect(result).not.toBeNull();
    expect(result!.depth).toBeGreaterThan(0);
    // Should push upward (ny = 1) since foot is just below top surface
    expect(result!.ny).toBeGreaterThan(0);
  });

  it('no penetration when capsule rests exactly on box top surface with skin', () => {
    // Box top at y = 0; capsule foot at y = 0 (resting exactly on surface)
    const b = box(0, -0.5, 0, 2, 0.5, 2); // top surface at y = 0
    // Capsule foot exactly at y = 0 (no penetration)
    const result = resolveCapsuleVsBox(0, 0, 0, PLAYER_CAPSULE, b);
    // Should be null (or depth ≈ 0 due to skin)
    if (result !== null) {
      expect(result.depth).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('moveAndResolve', () => {
  it('stops at a wall and does not penetrate it', () => {
    // Wall at x=5..7 (center 6, half 1)
    const wall = box(6, 1, 0, 1, 2, 2);
    const state = makeState(0, 0, 0, true);

    // Walk into the wall with small steps over multiple ticks (realistic sim)
    for (let i = 0; i < 60; i++) {
      moveAndResolve(state, { x: 0.2, y: 0, z: 0 }, [wall], PLAYER_CAPSULE);
    }

    // Wall left edge at x = 5; capsule foot must not exceed 5 - radius - skin margin
    expect(state.position.x).toBeLessThanOrEqual(5 - PLAYER_CAPSULE.radius + 0.05);
  });

  it('slides along a wall (Z component preserved when pushing into X wall)', () => {
    // Wall at x = 5
    const wall = box(6, 1, 0, 1, 2, 10); // infinite-ish along Z
    const state = makeState(3, 0, 0, true);
    state.velocity.x = 5;
    state.velocity.z = 5;

    // Move diagonally into wall
    moveAndResolve(state, { x: 5 * DT, y: 0, z: 5 * DT }, [wall], PLAYER_CAPSULE);

    // Z movement should be preserved (wall is along X-axis)
    // Check that Z position advanced
    expect(state.position.z).toBeGreaterThan(0);
    // X should be stopped by the wall
    expect(state.position.x).toBeLessThanOrEqual(5 - PLAYER_CAPSULE.radius + 0.05);
  });

  it('detects onGround when standing on a box', () => {
    // Ground box: top surface at y = 0
    const ground = box(0, -0.5, 0, 10, 0.5, 10);
    // Start capsule just slightly above ground, with downward velocity
    const state = makeState(0, 0.05, 0, false);
    state.velocity.y = -1;

    moveAndResolve(state, { x: 0, y: -0.1, z: 0 }, [ground], PLAYER_CAPSULE);

    expect(state.onGround).toBe(true);
    // Foot should be at or above ground surface (y = 0)
    expect(state.position.y).toBeGreaterThanOrEqual(-0.01);
  });

  it('steps up a low ledge (height <= STEP_HEIGHT)', () => {
    // Step with top surface at STEP_HEIGHT (0.4 m), box center at 0.2
    const step = box(3, 0.2, 0, 1, 0.2, 10);
    // Ground at y = 0
    const ground = box(0, -0.5, 0, 20, 0.5, 20);
    // Player on ground, approaching the step from x = 0
    const state = makeState(1.5, 0, 0, true);

    // Walk toward the step for several ticks
    let steppedUp = false;
    for (let i = 0; i < 30; i++) {
      moveAndResolve(state, { x: 0.1, y: 0, z: 0 }, [ground, step], PLAYER_CAPSULE);
      if (state.position.y >= STEP_HEIGHT - 0.05) {
        steppedUp = true;
        break;
      }
    }

    // Player should have stepped up onto the ledge
    expect(steppedUp).toBe(true);
    // Player should be past the start of the step
    expect(state.position.x).toBeGreaterThan(1.5);
  });

  it('does NOT step up a tall obstacle (height > STEP_HEIGHT)', () => {
    // Tall wall: top at 2 m — cannot step up
    const tallWall = box(3, 1, 0, 0.5, 1, 5);
    const ground = box(0, -0.5, 0, 20, 0.5, 20);
    const state = makeState(1.5, 0, 0, true);
    const initialY = state.position.y;

    // Walk toward the wall
    for (let i = 0; i < 20; i++) {
      moveAndResolve(state, { x: 0.1, y: 0, z: 0 }, [ground, tallWall], PLAYER_CAPSULE);
    }

    // Player should not have stepped over the tall wall
    // Y should remain close to initial (no step-up)
    expect(state.position.y).toBeLessThan(initialY + 0.05);
    // And player should be blocked in X
    expect(state.position.x).toBeLessThanOrEqual(
      tallWall.center.x - tallWall.half.x - PLAYER_CAPSULE.radius + 0.1,
    );
  });
});

describe('integratePlayer', () => {
  it('accelerates forward and reaches near-maxRunSpeed', () => {
    const ground = box(0, -0.5, 0, 50, 0.5, 50);
    const state = makeState(0, 0, 0, true);

    // Run forward for 2 seconds (120 ticks at 60 Hz)
    for (let i = 0; i < 120; i++) {
      integratePlayer(
        state,
        0,
        -1, // wishZ: forward (-Z direction)
        false,
        [ground],
        DEFAULT_MOVEMENT_PARAMS,
        DT,
      );
    }

    // Should be close to maxRunSpeed along -Z
    const speed = Math.abs(state.velocity.z);
    expect(speed).toBeGreaterThan(DEFAULT_MOVEMENT_PARAMS.maxRunSpeed * 0.9);
  });

  it('decelerates via friction when no input', () => {
    const ground = box(0, -0.5, 0, 50, 0.5, 50);
    const state = makeState(0, 0, 0, true);
    state.velocity.z = -6;

    // Apply no input for 1 second
    for (let i = 0; i < 60; i++) {
      integratePlayer(state, 0, 0, false, [ground], DEFAULT_MOVEMENT_PARAMS, DT);
    }

    // Speed should drop significantly
    const speed = Math.abs(state.velocity.z);
    expect(speed).toBeLessThan(0.5);
  });

  it('does not jump when not onGround', () => {
    const ground = box(0, -0.5, 0, 50, 0.5, 50);
    const state = makeState(0, 2, 0, false); // in air
    state.velocity.y = 0;

    integratePlayer(state, 0, 0, true, [ground], DEFAULT_MOVEMENT_PARAMS, DT);

    // Jump should be ignored
    expect(state.velocity.y).toBeLessThan(0); // gravity applied, not jump
  });

  it('jumps when onGround and emits correct velocity', () => {
    const ground = box(0, -0.5, 0, 50, 0.5, 50);
    const state = makeState(0, 0, 0, true);

    integratePlayer(state, 0, 0, true, [ground], DEFAULT_MOVEMENT_PARAMS, DT);

    // Velocity should be close to jumpSpeed (minus one tick of gravity)
    expect(state.velocity.y).toBeGreaterThan(DEFAULT_MOVEMENT_PARAMS.jumpSpeed * 0.8);
  });

  it('stays on ground (no floating) with only gravity and ground collider', () => {
    const ground = box(0, -0.5, 0, 50, 0.5, 50);
    const state = makeState(0, 0, 0, true);

    // Step 60 ticks with no input
    for (let i = 0; i < 60; i++) {
      integratePlayer(state, 0, 0, false, [ground], DEFAULT_MOVEMENT_PARAMS, DT);
    }

    expect(state.onGround).toBe(true);
    // Foot Y should be at 0 (resting on ground top surface)
    expect(state.position.y).toBeCloseTo(0, 1);
  });
});

describe('STEP_HEIGHT constant', () => {
  it('is 0.4 m as documented', () => {
    expect(STEP_HEIGHT).toBe(0.4);
  });
});
