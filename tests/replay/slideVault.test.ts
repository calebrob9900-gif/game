/**
 * T-105 — Slide (momentum, duration, slow-down) + Vault/Mantle (auto over ~1–1.3 m).
 *
 * Verifier: V2 (logic/replay). All expected values are LITERAL constants computed
 * from a single authoritative run and pinned as golden hashes.
 *
 * Test suites:
 *   1. Slide — sprint+crouch on a level gives a forward boost (> normal crouch-walk
 *      distance in the boost window), then decelerates. Literal golden hash.
 *   2. Mantle — walk into a 1.0 m ledge → player ends up ON TOP of the ledge
 *      (foot y ≈ ledge top). A non-mantling controller cannot climb a 1.0 m ledge
 *      (> STEP_HEIGHT 0.4 m). Concrete y assertion + literal golden hash.
 *
 * Params from research/03 §7.3:
 *   Slide: ~1.3–1.6× for ~0.4–0.7 s (chosen 1.4×, 0.5 s / 30 ticks at 60 Hz).
 *   Mantle: maxMantleHeight ~1.0–1.3 m (chosen 1.3 m), mantle time ~0.3–0.5 s
 *           (chosen ~0.35 s / 21 ticks at 60 Hz).
 */

import { describe, it, expect } from 'vitest';
import {
  createWorld,
  step,
  snapshot,
  hashWorld,
  DEFAULT_SETTINGS,
  SLIDE_SPEED_MULT,
  SLIDE_TICKS,
  MANTLE_TICKS,
  EYE_HEIGHT_CROUCH,
  type Command,
} from '../../src/sim';
import { createTestLevel } from '../../src/sim/levels/testLevel';
import { createMantleTestLevel } from '../../src/sim/levels/mantleTestLevel';
import { STEP_HEIGHT, MAX_MANTLE_HEIGHT } from '../../src/sim/physics/characterController';
import type { LevelDescriptor } from '../../src/sim/levels/levelDescriptor';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Run a slide scenario: sprint for sprintTicks, then crouch (triggering slide).
 * Return final position z, and hash.
 */
function runSlide(
  seed: number,
  sprintTicks: number,
  slideTicks: number,
): { z: number; finalHash: string; wasSliding: boolean; eyeHeight: number } {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);

  // Sprint forward for sprintTicks
  for (let t = 0; t < sprintTicks; t++) {
    const cmd: Command = { type: 'move', forward: 1, right: 0, jump: false, sprint: true };
    step(world, [cmd]);
  }

  // Now trigger slide: sprint+crouch (slide-triggering tick)
  step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true, crouch: true }]);

  // Continue with crouch for slideTicks more (remaining in slide window)
  for (let t = 0; t < slideTicks - 1; t++) {
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false, crouch: true }]);
  }

  const s = snapshot(world);
  return {
    z: s.player.position.z,
    finalHash: hashWorld(world),
    wasSliding: s.player.isSliding,
    eyeHeight: s.player.eyeHeight,
  };
}

/**
 * Run crouch-walk (no slide): same number of ticks total, but never sprint.
 * Used to verify slide travels FURTHER than pure crouch-walk.
 */
function runCrouchWalk(seed: number, totalTicks: number): { z: number } {
  const level = createTestLevel();
  const world = createWorld(seed, DEFAULT_SETTINGS, level);

  for (let t = 0; t < totalTicks; t++) {
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false, crouch: true }]);
  }

  const s = snapshot(world);
  return { z: s.player.position.z };
}

// ── 1. Slide boost: travels further than crouch-walk ──────────────────────────

describe('T-105 slide', () => {
  /**
   * Scenario: seed=1234, testLevel.
   *   - Sprint forward 5 ticks (get to sprint speed).
   *   - Trigger slide (sprint+crouch tick).
   *   - Run for 15 more ticks in slide boost window.
   *   Total = 5 + 1 + 14 = 20 ticks.
   *
   * Slide speed = maxRunSpeed × SLIDE_SPEED_MULT = 6 × 1.4 = 8.4 m/s.
   * Compare with crouch-walk for same 20 ticks.
   *
   * Crouch-walk speed = 6 × 0.45 = 2.7 m/s.
   * Slide during boost: ~8.4 m/s decaying slowly (SLIDE_FRICTION=2.0/s).
   * Over 15 slide ticks (~0.25s), slide travels significantly more than crouch-walk.
   */

  it('exports correct slide constants matching research/03 §7.3', () => {
    expect(SLIDE_SPEED_MULT).toBe(1.4);
    expect(SLIDE_TICKS).toBe(30);
    expect(STEP_HEIGHT).toBe(0.4);
    expect(MAX_MANTLE_HEIGHT).toBe(1.3);
  });

  it('slide boost window travels further than crouch-walk over same ticks', () => {
    // Sprint 5 + slide trigger + 14 slide ticks = 20 ticks total
    const totalTicks = 20;
    const sprintTicks = 5;
    const slideTicks = 15; // 1 trigger + 14 continuation = 15 slide ticks in window

    const slide = runSlide(1234, sprintTicks, slideTicks);
    const crouchWalk = runCrouchWalk(1234, totalTicks);

    // Slide must travel FURTHER (more negative Z) than plain crouch-walk
    expect(Math.abs(slide.z)).toBeGreaterThan(Math.abs(crouchWalk.z));

    // The difference should be substantial (slide is ~3× faster than crouch-walk at boost)
    // Slide z (rough) ~ -8.4 * 15/60 = -2.1 m from slide portion alone (+ sprint portion)
    // Crouch-walk over 20 ticks ~ -2.7 * 20/60 = -0.9 m
    expect(Math.abs(slide.z)).toBeGreaterThan(Math.abs(crouchWalk.z) * 1.5);

    // Slide must be a concrete positive distance (moved forward)
    expect(Math.abs(slide.z)).toBeGreaterThan(1.0);
  });

  it('slide uses crouch eye height (lower stance)', () => {
    const result = runSlide(1234, 5, 10);
    // While slide is active (within boost window), eye height is EYE_HEIGHT_CROUCH
    expect(result.eyeHeight).toBe(EYE_HEIGHT_CROUCH);
    expect(result.eyeHeight).toBe(1.0);
  });

  it('slide deceleration: player is slower after boost window than at boost peak', () => {
    const level = createTestLevel();
    const world = createWorld(1234, DEFAULT_SETTINGS, level);

    // Sprint 5 ticks then trigger slide
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true, crouch: true }]);

    // Capture speed at slide peak (just after trigger)
    const snapPeak = snapshot(world);
    const speedPeak = Math.sqrt(snapPeak.player.velocity.x ** 2 + snapPeak.player.velocity.z ** 2);

    // Run through slide window (30 ticks) to let it decay
    for (let t = 0; t < SLIDE_TICKS; t++) {
      step(world, [{ type: 'move', forward: 0, right: 0, jump: false, crouch: true }]);
    }

    // After slide window, speed should have decayed
    const snapAfter = snapshot(world);
    const speedAfter = Math.sqrt(
      snapAfter.player.velocity.x ** 2 + snapAfter.player.velocity.z ** 2,
    );

    // Speed after boost window must be less than peak
    expect(speedAfter).toBeLessThan(speedPeak);
    // Slide should no longer be active after SLIDE_TICKS
    expect(snapAfter.player.isSliding).toBe(false);
    expect(snapAfter.player.slideTicksLeft).toBe(0);
  });

  it('slide isSliding flag is true during boost window', () => {
    const level = createTestLevel();
    const world = createWorld(1234, DEFAULT_SETTINGS, level);

    // Sprint 5 ticks
    for (let t = 0; t < 5; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
    }
    // Trigger slide
    step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true, crouch: true }]);

    const s = snapshot(world);
    expect(s.player.isSliding).toBe(true);
    expect(s.player.slideTicksLeft).toBeGreaterThan(0);
    expect(s.player.slideTicksLeft).toBeLessThanOrEqual(SLIDE_TICKS);
  });

  it('slide over 15 ticks is replay-stable (LITERAL golden hash)', () => {
    const run = () => {
      const level = createTestLevel();
      const world = createWorld(1234, DEFAULT_SETTINGS, level);
      // Sprint 5 ticks
      for (let t = 0; t < 5; t++) {
        step(world, [{ type: 'move', forward: 1, right: 0, jump: false, sprint: true }]);
      }
      // Trigger slide + 14 more ticks in boost
      for (let t = 0; t < 15; t++) {
        const isTrigger = t === 0;
        step(world, [
          {
            type: 'move',
            forward: 1,
            right: 0,
            jump: false,
            sprint: isTrigger,
            crouch: true,
          },
        ]);
      }
      return hashWorld(world);
    };

    const h1 = run();
    const h2 = run();
    expect(h1).toBe(h2);

    // Literal golden — re-baseline only via reviewed PR.
    // seed=1234, testLevel, sprint 5 + slide trigger + 14 slide ticks.
    const GOLDEN_SLIDE = 'e36f9491';
    expect(h1).toBe(GOLDEN_SLIDE);
  });

  it('no-slide scenario (no sprint before crouch) does NOT trigger slide', () => {
    const level = createTestLevel();
    const world = createWorld(1234, DEFAULT_SETTINGS, level);

    // Just crouch from a walk (no sprint) — should NOT trigger slide
    for (let t = 0; t < 10; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false, crouch: true }]);
    }

    const s = snapshot(world);
    // Should be crouched but NOT sliding
    expect(s.player.isCrouched).toBe(true);
    expect(s.player.isSliding).toBe(false);
    expect(s.player.slideTicksLeft).toBe(0);
  });
});

// ── 2. Mantle: climb a 1.0 m ledge ───────────────────────────────────────────

describe('T-105 mantle/vault', () => {
  /**
   * Scenario: player walks forward into a 1.0 m ledge at z=-5.
   * Spawn at (0,0,0), yaw=0. Forward = -Z direction.
   * Ledge top surface at y=1.0.
   *
   * STEP_HEIGHT = 0.4 m → ledge cannot be stepped over.
   * MAX_MANTLE_HEIGHT = 1.3 m → ledge top 1.0 m ≤ 1.3 m → mantleable.
   *
   * After mantling, foot y should be ≈ 1.0 (on top of the ledge).
   * Eye position y = foot + EYE_HEIGHT_CROUCH ≈ 2.0 (crouched during mantle).
   *
   * A controller WITHOUT mantle would stop at the wall face, unable to climb.
   * foot y would remain ≈ 0 (ground level) — which is the concrete assertion.
   */

  it('exports correct constants', () => {
    expect(STEP_HEIGHT).toBe(0.4);
    expect(MAX_MANTLE_HEIGHT).toBe(1.3);
    expect(MANTLE_TICKS).toBe(21);
  });

  it('player auto-mantles a 1.0 m ledge and lands on top', () => {
    const level = createMantleTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Walk forward toward the ledge at z=-5.
    // Spawn at z=0 (eye height 1.7, foot ~0). Need to walk ~4 m to reach ledge.
    // At normal walk speed (6 m/s), ~4 m takes ~40 ticks (0.67 s).
    // Add extra ticks to complete the mantle (MANTLE_TICKS=21 ticks).
    // Total: 80 ticks should be sufficient.
    for (let t = 0; t < 80; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }

    const s = snapshot(world);

    // Player must have moved forward significantly (not stuck at spawn)
    expect(s.player.position.z).toBeLessThan(-1.0);

    // After mantle: foot y should be ≈ 1.0 (top of the ledge).
    // Eye y = foot + eyeHeight. During mantle: eyeHeight = EYE_HEIGHT_CROUCH = 1.0.
    // After mantle completes, eye y ≈ 1.0 + 1.0 = 2.0 (crouched on ledge), OR
    // if player returned to standing: foot + 1.7 ≈ 2.7.
    // The foot y = position.y - eyeHeight, where eyeHeight depends on crouch state.
    // We check foot y directly via position.y - eyeHeight.
    const eyeH = s.player.eyeHeight;
    const footY = s.player.position.y - eyeH;

    // Foot must be approximately on top of the ledge (y ≈ 1.0)
    // Allow tolerance for the mantle settling + skin offset.
    // The critical assertion: footY must be > 0.8 (well above ground level 0.0)
    // because STEP_HEIGHT = 0.4 m (max step-up) could only get to ~0.4 m.
    expect(footY).toBeGreaterThan(0.8); // must have climbed above step-height range
    expect(footY).toBeCloseTo(1.0, 0); // ≈ 1.0 m (top of ledge), tolerance ±0.5
  });

  it('mantle climbs higher than STEP_HEIGHT limit alone', () => {
    // Without mantle, player would be blocked at the wall face (foot y ≈ 0.0).
    // With mantle, foot y ≈ 1.0 after climbing the 1.0 m ledge.
    // This is the key acceptance criterion: the player ended up ON TOP of the ledge,
    // which is impossible without mantling (1.0 m > STEP_HEIGHT 0.4 m).

    const level = createMantleTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    for (let t = 0; t < 80; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }

    const s = snapshot(world);
    const footY = s.player.position.y - s.player.eyeHeight;

    // Must be above STEP_HEIGHT (0.4 m) — proves mantle happened, not just step-up.
    expect(footY).toBeGreaterThan(STEP_HEIGHT);
    // Must be at or near ledge top (1.0 m)
    expect(footY).toBeGreaterThan(0.8);
  });

  it('player reaches ledge top y ≈ 1.0 after mantling (LITERAL concrete assertion)', () => {
    const level = createMantleTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Walk for 80 ticks (plenty to reach, trigger, and complete the mantle)
    for (let t = 0; t < 80; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }

    const s = snapshot(world);
    const footY = s.player.position.y - s.player.eyeHeight;

    // Concrete assertion: foot y must be approximately 1.0 (the ledge top).
    // Tolerance ±0.05 m (within skin offset + small settle drift).
    expect(footY).toBeGreaterThanOrEqual(0.9);
    expect(footY).toBeLessThanOrEqual(1.15);
  });

  it('mantle over 1.0 m ledge is replay-stable (LITERAL golden hash)', () => {
    const run = () => {
      const level = createMantleTestLevel();
      const world = createWorld(42, DEFAULT_SETTINGS, level);
      for (let t = 0; t < 80; t++) {
        step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
      }
      return hashWorld(world);
    };

    const h1 = run();
    const h2 = run();
    expect(h1).toBe(h2);

    // Literal golden hash — re-baseline only via reviewed PR.
    // seed=42, mantleTestLevel, forward 80 ticks.
    const GOLDEN_MANTLE = '0a417d3f';
    expect(h1).toBe(GOLDEN_MANTLE);
  });

  it('ledge > MAX_MANTLE_HEIGHT (2 m) blocks player (no mantle)', () => {
    // Create a level with a 2.0 m wall (top y=2.0 > MAX_MANTLE_HEIGHT 1.3 m).
    // Player should NOT mantle it (too high).
    const levelWithTallWall: LevelDescriptor = {
      name: 'tall_wall_test',
      bounds: { min: { x: -20, y: -1, z: -20 }, max: { x: 20, y: 10, z: 20 } },
      colliders: [
        { center: { x: 0, y: -0.5, z: 0 }, half: { x: 20, y: 0.5, z: 20 } },
        // Tall wall: top surface at y=2.0, > MAX_MANTLE_HEIGHT (1.3 m)
        { center: { x: 0, y: 1.0, z: -5 }, half: { x: 2, y: 1.0, z: 2 } },
      ],
      spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }],
    };

    const world2 = createWorld(42, DEFAULT_SETTINGS, levelWithTallWall);
    for (let t = 0; t < 80; t++) {
      step(world2, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }

    const s = snapshot(world2);
    const footY = s.player.position.y - s.player.eyeHeight;

    // Player should NOT have climbed the 2.0 m wall — must be near ground level
    expect(footY).toBeLessThan(0.5); // stays near ground, wall blocked movement
    expect(s.player.isMantling).toBe(false);
  });

  it('isMantling flag is true during mantle', () => {
    const level = createMantleTestLevel();
    const world = createWorld(42, DEFAULT_SETTINGS, level);

    // Walk until we hit the ledge and trigger mantle (arrives ~40 ticks)
    let foundMantling = false;
    for (let t = 0; t < 80; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
      const s = snapshot(world);
      if (s.player.isMantling) {
        foundMantling = true;
        // isMantling should be true, mantleTicksLeft should be positive
        expect(s.player.mantleTicksLeft).toBeGreaterThan(0);
        break;
      }
    }
    // Should have found a mantling state
    expect(foundMantling).toBe(true);
  });

  it('existing goldens are unaffected by T-105 (no slide/mantle state in non-slide scenarios)', () => {
    // Verify that scenarios without slide or mantle input produce unchanged hashes.
    // Re-run the walk scenario from T-104 (crouchJump golden '6400c9f5').
    const level = createTestLevel();
    const world = createWorld(999, DEFAULT_SETTINGS, level);
    for (let t = 0; t < 60; t++) {
      step(world, [{ type: 'move', forward: 1, right: 0, jump: false }]);
    }
    const hash = hashWorld(world);
    // Must match the T-104 walk golden (unchanged by T-105)
    expect(hash).toBe('6400c9f5');
  });
});
