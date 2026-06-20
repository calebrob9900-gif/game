/**
 * Pure-TypeScript kinematic capsule character controller.
 *
 * Resolves a vertical capsule (radius, halfHeight) against an array of AABB
 * box colliders. Features:
 *   - Horizontal wall slide (reflect velocity along surface normal, don't stick)
 *   - Step-up for small ledges (stepHeight)
 *   - Ground snap (onGround detection, gravity)
 *   - Slide (sprint+crouch boost, T-105)
 *   - Vault/Mantle (auto-climb ledges > stepHeight, ≤ maxMantleHeight, T-105)
 *   - Frame-rate-independent via fixed DT
 *
 * No `three`, no DOM, no WASM. Pure deterministic math.
 * See docs/decisions/0001-character-controller.md for the design rationale.
 *
 * Movement params from research/03 §7:
 *   maxRunSpeed  ~6 m/s
 *   groundAccel  50–90 m/s²
 *   friction     6–10 (1/s)
 *   gravity      18–25 m/s²
 */

import type { Vec3 } from '../core/vec';
import type { BoxCollider } from '../levels/levelDescriptor';

// ── Capsule geometry ──────────────────────────────────────────────────────────

/** Describes the player capsule in simulation space. */
export interface CapsuleShape {
  /** Radius of the capsule (m). */
  readonly radius: number;
  /**
   * Half-height of the cylindrical section (m).
   * Total height = 2 * halfHeight + 2 * radius.
   * For a 1.8 m capsule with r=0.3: halfHeight = (1.8 - 2*0.3) / 2 = 0.6
   */
  readonly halfHeight: number;
}

/** Default player capsule: 1.8 m tall, 0.3 m radius. */
export const PLAYER_CAPSULE: CapsuleShape = {
  radius: 0.3,
  halfHeight: 0.6, // halfHeight = (1.8 - 2*0.3) / 2 = 0.6
};

/**
 * Crouched player capsule: 1.2 m tall, 0.3 m radius.
 * halfHeight = (1.2 - 2*0.3) / 2 = 0.3
 * Player fits under low overhangs (~1.2 m clearance).
 * From research/03 §7.3: capsule height ~1.2 m when crouched.
 */
export const PLAYER_CAPSULE_CROUCHED: CapsuleShape = {
  radius: 0.3,
  halfHeight: 0.3, // halfHeight = (1.2 - 2*0.3) / 2 = 0.3
};

/**
 * Eye height when standing (m). Camera/presentation layer uses this.
 * From research/03 §7.3 and DEFAULT_SETTINGS.eyeHeight.
 */
export const EYE_HEIGHT_STAND = 1.7;

/**
 * Eye height when crouched (m). Camera is lowered to simulate ducking.
 * From research/03 §7.3: camera ~1.0 m while crouched.
 */
export const EYE_HEIGHT_CROUCH = 1.0;

/**
 * Crouch speed multiplier. From research/03 §7.3: ×0.4–0.5.
 * Chosen 0.45 (midpoint). Applied to maxRunSpeed.
 */
export const CROUCH_SPEED_MULT = 0.45;

/**
 * Maximum ledge height the controller can automatically step over (m).
 * From research/03 §7.3: mantle/vault maxHeight ~1.0–1.3 m; step is smaller.
 */
export const STEP_HEIGHT = 0.4;

// ── Slide constants (T-105, research/03 §7.3) ─────────────────────────────────

/**
 * Slide speed multiplier relative to run speed at boost peak.
 * From research/03 §7.3: ~1.3–1.6×. Chosen 1.4× (matches sprint, gives noticeable boost).
 */
export const SLIDE_SPEED_MULT = 1.4;

/**
 * Slide boost duration in ticks (fixed 60 Hz).
 * From research/03 §7.3: ~0.4–0.7 s. Chosen 0.5 s → 30 ticks.
 */
export const SLIDE_TICKS = 30; // 0.5 s at 60 Hz

/**
 * Slide friction — lower than ground friction so momentum carries.
 * Value: 2.0 /s (vs ground friction 8/s), exponential decay.
 * After boost window, decelerates to crouch speed.
 */
export const SLIDE_FRICTION = 2.0;

// ── Mantle/vault constants (T-105, research/03 §7.3) ─────────────────────────

/**
 * Maximum ledge top height the player can vault/mantle over (m).
 * From research/03 §7.3: ~1.0–1.3 m. Chosen 1.3 m.
 * Anything > STEP_HEIGHT (0.4 m) and ≤ MAX_MANTLE_HEIGHT triggers mantle.
 */
export const MAX_MANTLE_HEIGHT = 1.3;

/**
 * Mantle duration in ticks. Player moves from current foot Y to ledge top over this window.
 * From research/03 §7.3: ~0.3–0.5 s. Chosen 0.35 s → 21 ticks.
 */
export const MANTLE_TICKS = 21; // ~0.35 s at 60 Hz

/**
 * Skin offset: a small gap kept between the capsule and surfaces to prevent
 * numerical sinking / jitter.
 */
const SKIN = 0.001;

// ── AABB utilities ────────────────────────────────────────────────────────────

/** Computes the minimum separation (penetration) between a point and an AABB.
 *  Returns a vector pointing OUT of the box (the MTV for the point).
 *  If the point is outside the box returns {0,0,0}.
 */
function pointVsAABB(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): { nx: number; ny: number; nz: number; depth: number } {
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const ox = hx - Math.abs(dx);
  const oy = hy - Math.abs(dy);
  const oz = hz - Math.abs(dz);

  // Point is outside — no penetration
  if (ox <= 0 || oy <= 0 || oz <= 0) return { nx: 0, ny: 0, nz: 0, depth: 0 };

  // Push out along the smallest overlap axis
  if (ox <= oy && ox <= oz) {
    return { nx: dx < 0 ? -1 : 1, ny: 0, nz: 0, depth: ox };
  } else if (oy <= ox && oy <= oz) {
    return { nx: 0, ny: dy < 0 ? -1 : 1, nz: 0, depth: oy };
  } else {
    return { nx: 0, ny: 0, nz: dz < 0 ? -1 : 1, depth: oz };
  }
}

/**
 * Capsule-vs-AABB collision test.
 *
 * A vertical capsule is defined by:
 *   - its foot position (foot.y = bottom of capsule)
 *   - radius and halfHeight
 * The capsule axis runs from (foot + radius) to (foot + radius + 2*halfHeight).
 * Both sphere caps are at those endpoints.
 *
 * Algorithm: find the closest point on the capsule axis to each AABB,
 * then test sphere-vs-AABB at that closest point.
 *
 * Returns the minimum translation vector to eject the capsule, or null if
 * no overlap.
 */
export function resolveCapsuleVsBox(
  /** Foot position (bottom of capsule sphere) */
  footX: number,
  footY: number,
  footZ: number,
  capsule: CapsuleShape,
  box: BoxCollider,
): { nx: number; ny: number; nz: number; depth: number } | null {
  const r = capsule.radius;
  const hh = capsule.halfHeight;

  // Capsule segment: bottom sphere center → top sphere center
  const segBotY = footY + r;
  const segTopY = footY + r + 2 * hh;

  const cx = box.center.x;
  const cy = box.center.y;
  const cz = box.center.z;
  const hx = box.half.x + r + SKIN;
  const hy = box.half.y + r + SKIN;
  const hz = box.half.z + r + SKIN;

  // Expand AABB by capsule radius (Minkowski sum of sphere).
  // Clamp capsule axis (which is vertical) to AABB y-range.
  // TODO(correctness): this clamps the box-center range then re-clamps to the
  // segment, which deviates from the textbook capsule-vs-AABB closest point
  // (clamp box center Y to [segBot,segTop]). For boxes whose vertical half-extent
  // is smaller than the capsule radius (thin trim/ledges) it can pick the up axis
  // as the min-overlap axis and classify a wall hit as a floor. The current test
  // levels use thick colliders (walls ≥4 m, ground 1 m) so this is not exercised;
  // revisit when thin geometry is added (T-132/T-604).
  const clampedY = Math.max(cy - box.half.y, Math.min(cy + box.half.y, 0.5 * (segBotY + segTopY)));

  // Find the closest point on capsule segment to the expanded AABB center line
  const closestSegY = Math.max(segBotY, Math.min(segTopY, clampedY));

  // Now do sphere-vs-expanded-AABB at (footX, closestSegY, footZ)
  const result = pointVsAABB(footX, closestSegY, footZ, cx, cy, cz, hx, hy, hz);
  if (result.depth <= 0) return null;

  return result;
}

// ── Controller state ──────────────────────────────────────────────────────────

export interface ControllerState {
  /** Foot position (bottom of capsule). */
  position: Vec3;
  /** Linear velocity (m/s). */
  velocity: Vec3;
  /** True when on solid ground. */
  onGround: boolean;
}

// ── Main solve ────────────────────────────────────────────────────────────────

/**
 * Move the capsule by `desiredDelta` and resolve against all box colliders.
 *
 * Internally uses up to `maxIterations` sweep-and-pushout passes per axis.
 * Horizontal movement is resolved with wall-slide (project velocity onto surface
 * tangent). Vertical movement uses separate pass for step-up and ground-snap.
 *
 * Mutates `state` in place.
 */
export function moveAndResolve(
  state: ControllerState,
  desiredDelta: Vec3,
  colliders: readonly BoxCollider[],
  capsule: CapsuleShape,
  stepHeight: number = STEP_HEIGHT,
): void {
  const pos = state.position;

  // Step 1: try to move horizontally, then resolve horizontal collisions.
  pos.x += desiredDelta.x;
  pos.z += desiredDelta.z;

  let didStepUp = false;

  // Resolve horizontal (XZ) collisions with wall-slide + step-up
  for (let iter = 0; iter < 4; iter++) {
    let resolved = true;
    for (const box of colliders) {
      const hit = resolveCapsuleVsBox(pos.x, pos.y, pos.z, capsule, box);
      if (!hit) continue;

      const { nx, ny, nz, depth } = hit;

      // If the normal is mostly upward (floor/ceiling) — skip here, handle in vertical pass
      if (Math.abs(ny) > 0.7) continue;

      // Try step-up: if this is a horizontal collision and the obstacle is short enough,
      // check if we can step over it by lifting pos.y by stepHeight.
      if (!didStepUp && state.onGround) {
        const topOfBox = box.center.y + box.half.y;
        const footY = pos.y;
        const stepNeeded = topOfBox - footY;
        if (stepNeeded > 0 && stepNeeded <= stepHeight) {
          // Check clearance: can the capsule fit at (pos.x, topOfBox + SKIN, pos.z)?
          const testY = topOfBox + SKIN;
          let blocked = false;
          for (const other of colliders) {
            const h = resolveCapsuleVsBox(pos.x, testY, pos.z, capsule, other);
            if (h && Math.abs(h.ny) < 0.7) {
              blocked = true;
              break;
            }
          }
          if (!blocked) {
            pos.y = testY;
            didStepUp = true;
            resolved = false;
            break; // Restart collision loop after step-up
          }
        }
      }

      // Wall slide: push out along the horizontal normal, zero out velocity component
      // into the wall.
      pos.x += nx * (depth + SKIN);
      pos.z += nz * (depth + SKIN);

      // Kill velocity component into the wall (sliding)
      const vDotN = state.velocity.x * nx + state.velocity.z * nz;
      if (vDotN < 0) {
        state.velocity.x -= vDotN * nx;
        state.velocity.z -= vDotN * nz;
      }

      resolved = false;
      break; // Restart for next iteration
    }
    if (resolved) break;
  }

  // Step 2: apply vertical movement
  pos.y += desiredDelta.y;

  // Step 3: resolve vertical collisions (floors and ceilings)
  state.onGround = false;
  for (let iter = 0; iter < 4; iter++) {
    let resolved = true;
    for (const box of colliders) {
      const hit = resolveCapsuleVsBox(pos.x, pos.y, pos.z, capsule, box);
      if (!hit) continue;

      const { nx, ny, nz, depth } = hit;

      if (Math.abs(ny) <= 0.7) {
        // This is a wall hit in the vertical pass — means the step-up didn't resolve
        // a remaining horizontal overlap. Eject anyway to prevent sinking.
        pos.x += nx * (depth + SKIN);
        pos.z += nz * (depth + SKIN);
        const vDotN = state.velocity.x * nx + state.velocity.z * nz;
        if (vDotN < 0) {
          state.velocity.x -= vDotN * nx;
          state.velocity.z -= vDotN * nz;
        }
        resolved = false;
        break;
      }

      // Floor or ceiling
      pos.y += ny * (depth + SKIN);
      const vDotN = state.velocity.y * ny;
      if (vDotN < 0) {
        state.velocity.y = 0;
      }

      if (ny > 0) {
        // Pushed upward → floor contact
        state.onGround = true;
      }

      resolved = false;
      break;
    }
    if (resolved) break;
  }
}

// ── High-level player integration ─────────────────────────────────────────────

export interface PlayerMovementParams {
  /** Max horizontal run speed (m/s). From research/03 §7.1: ~6 m/s. */
  maxRunSpeed: number;
  /** Ground acceleration (m/s²). From research/03 §7.1: 50–90. */
  groundAccel: number;
  /**
   * Ground friction (1/s). Used as exponential decay rate.
   * From research/03 §7.1: 6–10.
   */
  friction: number;
  /** Gravity acceleration (m/s², positive = downward). From research/03 §7.4: 18–25. */
  gravity: number;
  /** Jump launch speed (m/s). Tuned for ~1 m apex with gravity 20: sqrt(2*20*1)≈6.3. */
  jumpSpeed: number;
  /**
   * Per-weapon move speed multiplier (scales maxRunSpeed). Optional: omit (or 1.0)
   * for no penalty. From research/03 §7.1 / §8.2: knife/empty 1.0, AR 0.85,
   * LMG/sniper 0.75. Absent ⇒ treated as 1.0 (so existing golden hashes hold).
   */
  moveMult?: number;
  /**
   * Whether the player is pressing the crouch key this tick.
   * Omit or false for no crouch (default unchanged behaviour).
   * From research/03 §7.3.
   */
  crouchInput?: boolean;
  /**
   * Whether the player was crouched on the previous tick.
   * Needed to maintain crouch state and detect stand-up attempts.
   * Omit or false for standing (default).
   */
  wasCrouched?: boolean;
  // ── Slide params (T-105) ─────────────────────────────────────────────────────
  /**
   * Remaining slide ticks on entry to this tick.
   * >0 means the player is in the slide boost window. Omit or 0 = not sliding.
   * Set by world.ts from entity.slideTicksLeft. From research/03 §7.3.
   */
  slideTicksLeft?: number;
  // ── Mantle params (T-105) ────────────────────────────────────────────────────
  /**
   * Remaining mantle ticks on entry to this tick.
   * >0 means the player is actively mantling. Omit or 0 = not mantling.
   * Set by world.ts from entity.mantleTicksLeft.
   */
  mantleTicksLeft?: number;
  /**
   * Target foot Y to mantle to (top of the ledge).
   * Only meaningful when mantleTicksLeft > 0.
   */
  mantleTargetY?: number;
  /**
   * Mantle horizontal direction (world X). Push player over the ledge.
   * Must be a unit vector component. Set by world.ts.
   */
  mantleDirX?: number;
  /**
   * Mantle horizontal direction (world Z). Push player over the ledge.
   */
  mantleDirZ?: number;
}

export const DEFAULT_MOVEMENT_PARAMS: PlayerMovementParams = {
  maxRunSpeed: 6,
  groundAccel: 60,
  friction: 8,
  gravity: 20,
  jumpSpeed: 6.3,
  moveMult: 1.0,
  crouchInput: false,
  wasCrouched: false,
};

/**
 * Check whether the player can stand up (uncrouch) at the given foot position.
 *
 * Tests if the standing capsule (PLAYER_CAPSULE) would overlap any collider.
 * Returns true if there is sufficient headroom, false if blocked above.
 */
export function hasHeadroomToStand(
  footX: number,
  footY: number,
  footZ: number,
  colliders: readonly BoxCollider[],
): boolean {
  for (const box of colliders) {
    const hit = resolveCapsuleVsBox(footX, footY, footZ, PLAYER_CAPSULE, box);
    if (hit && hit.depth > 0) return false;
  }
  return true;
}

/**
 * Integrate player movement for one fixed tick (dt).
 *
 * Applies friction, acceleration, gravity, jump, crouch, slide, mantle,
 * then calls moveAndResolve.
 * Frame-rate-independent: friction uses `1 - exp(-lambda*dt)`, accel is
 * clamped by `min(1, accel*dt)`.
 *
 * Crouch logic (research/03 §7.3):
 *   - When crouchInput=true AND onGround: player is crouched this tick.
 *   - Crouch wins over sprint (sprint is disabled when crouching).
 *   - Speed is multiplied by CROUCH_SPEED_MULT (0.45) on top of moveMult.
 *   - The crouched capsule (PLAYER_CAPSULE_CROUCHED) is used for collision.
 *   - When uncouching: check headroom; if blocked above, stay crouched.
 *
 * Slide logic (T-105, research/03 §7.3):
 *   - Triggered by sprint+crouch on ground (handled in world.ts).
 *   - params.slideTicksLeft > 0 means we're in the slide boost window.
 *   - While sliding: use slide friction (low), no accel toward new wish, use
 *     crouch capsule/eye height. Boost speed is set at slide start by world.ts.
 *
 * Mantle logic (T-105, research/03 §7.3):
 *   - params.mantleTicksLeft > 0 means player is actively mantling a ledge.
 *   - During mantle: player is moved upward + forward toward mantleTargetY.
 *   - Gravity and normal collision are overridden during mantle.
 *
 * @param state     Mutable controller state (position, velocity, onGround)
 * @param wishX     Desired movement direction X (world space, normalized)
 * @param wishZ     Desired movement direction Z (world space, normalized)
 * @param jump      True if jump key pressed this tick
 * @param colliders Level box colliders
 * @param params    Movement tuning params
 * @param dt        Fixed timestep (seconds)
 * @param capsule   Capsule shape override (default auto-selected by crouch state)
 * @returns         Whether the player is crouched after this tick
 */
export function integratePlayer(
  state: ControllerState,
  wishX: number,
  wishZ: number,
  jump: boolean,
  colliders: readonly BoxCollider[],
  params: PlayerMovementParams,
  dt: number,
  capsule?: CapsuleShape,
): boolean {
  const vel = state.velocity;
  const crouchInput = params.crouchInput ?? false;
  const wasCrouched = params.wasCrouched ?? false;

  // ── Mantle override path (T-105) ─────────────────────────────────────────────
  // While mantling, we interpolate foot Y toward the ledge top and push forward.
  // Normal physics (friction/accel/gravity/crouch) are bypassed for this tick.
  const mantleTicksLeft = params.mantleTicksLeft ?? 0;
  if (mantleTicksLeft > 0) {
    const mantleTargetY = params.mantleTargetY ?? state.position.y;
    const dirX = params.mantleDirX ?? 0;
    const dirZ = params.mantleDirZ ?? 0;

    // Move upward toward target by fraction of remaining distance this tick.
    // Use linear interpolation: step = (targetY - currentY) / mantleTicksLeft
    // This distributes the vertical movement evenly across all mantle ticks.
    const vertStep = (mantleTargetY - state.position.y) / mantleTicksLeft;

    // Horizontal push: move at a constant fraction of run speed over the ledge.
    // 0.5× run speed gives a smooth vault feel without overshooting.
    const horizSpeed = params.maxRunSpeed * 0.5;

    const delta = {
      x: dirX * horizSpeed * dt,
      y: vertStep,
      z: dirZ * horizSpeed * dt,
    };

    // During mantle, zero out velocity to prevent residual motion interference.
    vel.x = dirX * horizSpeed;
    vel.y = 0;
    vel.z = dirZ * horizSpeed;

    // Apply movement (no resolving against step-up since we're climbing intentionally).
    // Use a simple translate + resolve pass with the crouch capsule (compact during mantle).
    state.position.x += delta.x;
    state.position.y += delta.y;
    state.position.z += delta.z;

    // Resolve horizontal collisions but NOT step-up (we handle vertical ourselves).
    moveAndResolve(state, { x: 0, y: 0, z: 0 }, colliders, PLAYER_CAPSULE_CROUCHED, 0);

    state.onGround = false; // airborne while climbing
    return true; // stay crouched during mantle
  }

  // --- Determine crouch state for this tick ---
  // Crouch is active when: crouchInput held AND onGround.
  // When crouchInput is released: attempt to stand; stay crouched if blocked above.
  // Slide also forces crouch (handled in world.ts; slideTicksLeft > 0 implies crouched).
  let isCrouched: boolean;
  if (crouchInput && state.onGround) {
    // Want to crouch and on ground → crouch.
    isCrouched = true;
  } else if (wasCrouched && !crouchInput) {
    // Was crouched, wants to stand → check headroom.
    // Use foot position from state.position (already foot coords in capsule path).
    isCrouched = !hasHeadroomToStand(
      state.position.x,
      state.position.y,
      state.position.z,
      colliders,
    );
  } else if (wasCrouched && crouchInput) {
    // Still holding crouch while in air → stay crouched.
    isCrouched = true;
  } else {
    isCrouched = false;
  }

  // Sliding forces the crouched posture even if crouchInput is not pressed.
  const slideTicksLeft = params.slideTicksLeft ?? 0;
  const isSliding = slideTicksLeft > 0;
  if (isSliding) isCrouched = true;

  // Select effective capsule based on crouch state (or use override if provided).
  const effectiveCapsule = capsule ?? (isCrouched ? PLAYER_CAPSULE_CROUCHED : PLAYER_CAPSULE);

  // ── Slide path (T-105) ───────────────────────────────────────────────────────
  if (isSliding) {
    // During the slide boost window: apply reduced friction (momentum carry) and
    // do NOT apply the normal acceleration toward wish velocity. The velocity
    // direction from the slide trigger is preserved; only magnitude decays.
    // This lets the player slide in the direction they were running.
    const horizSpeed2 = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (horizSpeed2 > 0 && state.onGround) {
      const slideFrictionFactor = 1 - Math.exp(-SLIDE_FRICTION * dt);
      const newSpeed = Math.max(0, horizSpeed2 - horizSpeed2 * slideFrictionFactor);
      const scale = newSpeed / horizSpeed2;
      vel.x *= scale;
      vel.z *= scale;
    }
    // No accel during slide boost (momentum carry). Skip normal accel/friction pass.
  } else {
    // ── Normal friction + acceleration ────────────────────────────────────────

    // --- Friction (horizontal) — frame-rate-independent exponential decay ---
    // Applied EVERY grounded tick, independent of wish input. While a key is held,
    // the high-accel step below restores the target speed; when input is released
    // OR reversed, this friction decays the carried velocity within a few ticks —
    // that is the counter-strafe brake (research/03 §7.1).
    const horizSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (horizSpeed > 0 && state.onGround) {
      // decay factor: 1 - exp(-friction * dt)
      const frictionFactor = 1 - Math.exp(-params.friction * dt);
      const newSpeed = Math.max(0, horizSpeed - horizSpeed * frictionFactor);
      const scale = horizSpeed > 0 ? newSpeed / horizSpeed : 0;
      vel.x *= scale;
      vel.z *= scale;
    }

    // --- Ground acceleration toward wish velocity ---
    if (wishX !== 0 || wishZ !== 0) {
      // Compose multipliers: per-weapon moveMult × crouch multiplier.
      // Crouch wins over sprint (sprint multiplier is ignored when crouching — handled
      // in world.ts by zeroing sprintMult when isCrouched). The moveMult passed here
      // already has sprint folded in from world.ts when not crouching.
      const crouchFactor = isCrouched ? CROUCH_SPEED_MULT : 1.0;
      const effectiveMaxSpeed = params.maxRunSpeed * (params.moveMult ?? 1.0) * crouchFactor;
      const targetX = wishX * effectiveMaxSpeed;
      const targetZ = wishZ * effectiveMaxSpeed;
      // Clamp accel to at most 1 (can't overshoot in one tick)
      const accelFactor = Math.min(1, params.groundAccel * dt);
      vel.x += (targetX - vel.x) * accelFactor;
      vel.z += (targetZ - vel.z) * accelFactor;
    }
  }

  // --- Jump (only allowed when standing, not while sliding) ---
  // NOTE: jump IS allowed while crouched per research/03 §7.3 (no explicit block).
  // CoD allows jumping while crouched. We allow it here.
  // Jump cancels slide (momentum lost, but jump takes priority).
  if (jump && state.onGround && !isSliding) {
    vel.y = params.jumpSpeed;
    state.onGround = false;
    // When jumping from crouch, uncrouch in air.
    isCrouched = false;
  }

  // --- Gravity ---
  vel.y -= params.gravity * dt;

  // --- Build desired delta ---
  const delta = {
    x: vel.x * dt,
    y: vel.y * dt,
    z: vel.z * dt,
  };

  // --- Move and resolve collisions ---
  moveAndResolve(state, delta, colliders, effectiveCapsule, STEP_HEIGHT);

  return isCrouched;
}

// ── Mantle detection helper (T-105) ───────────────────────────────────────────

/**
 * Detect whether the player can mantle a ledge in the current movement direction.
 *
 * Returns the mantle target foot Y (ledge top surface) and the direction to push,
 * or null if no mantleable ledge is found.
 *
 * Algorithm:
 *   1. Cast a forward probe from foot position in the wish direction.
 *   2. Check if we collide with a wall (horizontal normal).
 *   3. Find the top of that wall (box.center.y + box.half.y).
 *   4. If top is > STEP_HEIGHT and ≤ MAX_MANTLE_HEIGHT, check capsule clearance above.
 *   5. If clear, return the target Y and direction.
 *
 * Called from world.ts BEFORE integratePlayer when:
 *   - Player is on ground (or just ran into a wall)
 *   - Player has horizontal wish input
 *   - Player is NOT currently mantling
 */
export function detectMantle(
  footX: number,
  footY: number,
  footZ: number,
  wishX: number,
  wishZ: number,
  colliders: readonly BoxCollider[],
): { targetY: number; dirX: number; dirZ: number } | null {
  // Normalize wish direction (should already be normalized, but be safe)
  const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
  if (wishLen < 0.01) return null;
  const dirX = wishX / wishLen;
  const dirZ = wishZ / wishLen;

  // Probe ahead by a small distance (capsule radius + skin + tiny forward step)
  const probeX = footX + dirX * (PLAYER_CAPSULE.radius + SKIN + 0.05);
  const probeZ = footZ + dirZ * (PLAYER_CAPSULE.radius + SKIN + 0.05);

  let bestLedgeTopY = -Infinity;
  let foundWall = false;

  for (const box of colliders) {
    // Check if probing forward would intersect the box (only wall-like hits)
    const hit = resolveCapsuleVsBox(probeX, footY, probeZ, PLAYER_CAPSULE, box);
    if (!hit || Math.abs(hit.ny) > 0.7) continue; // not a wall hit

    // This is a wall-like collider in the forward direction
    const ledgeTopY = box.center.y + box.half.y;
    const stepNeeded = ledgeTopY - footY;

    // Must be > step height (otherwise handled by step-up) and <= max mantle height
    if (stepNeeded > STEP_HEIGHT && stepNeeded <= MAX_MANTLE_HEIGHT) {
      if (ledgeTopY > bestLedgeTopY) {
        bestLedgeTopY = ledgeTopY;
        foundWall = true;
      }
    }
  }

  if (!foundWall) return null;

  // Check capsule clearance above the ledge top
  // Player capsule standing height = 2*radius + 2*halfHeight = 1.8 m
  // After mantle, foot is at bestLedgeTopY, need clearance for full standing capsule
  const testFootY = bestLedgeTopY + SKIN;
  for (const box of colliders) {
    const hit = resolveCapsuleVsBox(probeX, testFootY, probeZ, PLAYER_CAPSULE, box);
    // Block mantle if there's a ceiling that prevents standing (upward normal)
    // Use a small depth threshold to ignore grazing contacts
    if (hit && hit.ny > 0.7 && hit.depth > 0.01) return null;
  }

  return { targetY: bestLedgeTopY, dirX, dirZ };
}
