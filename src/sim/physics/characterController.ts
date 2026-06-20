/**
 * Pure-TypeScript kinematic capsule character controller.
 *
 * Resolves a vertical capsule (radius, halfHeight) against an array of AABB
 * box colliders. Features:
 *   - Horizontal wall slide (reflect velocity along surface normal, don't stick)
 *   - Step-up for small ledges (stepHeight)
 *   - Ground snap (onGround detection, gravity)
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
 * Applies friction, acceleration, gravity, jump, crouch, then calls moveAndResolve.
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

  // --- Determine crouch state for this tick ---
  // Crouch is active when: crouchInput held AND onGround.
  // When crouchInput is released: attempt to stand; stay crouched if blocked above.
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

  // Select effective capsule based on crouch state (or use override if provided).
  const effectiveCapsule = capsule ?? (isCrouched ? PLAYER_CAPSULE_CROUCHED : PLAYER_CAPSULE);

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

  // --- Jump (only allowed when standing, not while crouched — per CoD/Valorant model) ---
  // NOTE: jump IS allowed while crouched per research/03 §7.3 (no explicit block).
  // CoD allows jumping while crouched. We allow it here.
  if (jump && state.onGround) {
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
