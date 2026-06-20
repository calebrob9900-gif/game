import type { Vec3 } from './core/vec';
import { getPlayer, type SimWorld } from './world';
import { EYE_HEIGHT_STAND, EYE_HEIGHT_CROUCH } from './physics/characterController';

/**
 * Immutable read-only projection of sim state for presentation + tests.
 * Presentation reads ONLY this (never the live ECS), preserving the one-way
 * sim → presentation boundary.
 */
export interface PlayerSnapshot {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  health: number;
  /**
   * Whether the player is currently sprinting or tac-sprinting.
   * Added for T-103. False when not sprinting.
   */
  isSprinting: boolean;
  /**
   * Tick at which the sprint-out window expires (exclusive).
   * Zero means no window is active.
   */
  sprintOutUntilTick: number;
  /**
   * Derived gate: false while sprinting AND during the sprint-out window; true otherwise.
   * Future weapon fire systems (T-111) read this to block firing.
   * Equals: !(isSprinting || world.tick < sprintOutUntilTick)
   */
  canFire: boolean;
  /**
   * Whether the player is currently crouched.
   * Presentation uses this to lower the camera and adjust stance.
   * Added for T-104. False when not crouched.
   */
  isCrouched: boolean;
  /**
   * Current eye height above foot position (m).
   * EYE_HEIGHT_STAND (1.7) when standing, EYE_HEIGHT_CROUCH (1.0) when crouched.
   * Presentation uses this to position the camera.
   */
  eyeHeight: number;
}

export interface Snapshot {
  tick: number;
  player: PlayerSnapshot;
}

export function snapshot(world: SimWorld): Snapshot {
  const p = getPlayer(world);
  const isSprinting = p.isSprinting ?? false;
  const sprintOutUntilTick = p.sprintOutUntilTick ?? 0;
  // canFire is false while sprinting OR while the sprint-out window is active.
  const canFire = !isSprinting && world.tick >= sprintOutUntilTick;
  const isCrouched = p.isCrouched ?? false;
  const eyeHeight = isCrouched ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
  return {
    tick: world.tick,
    player: {
      position: { x: p.position.x, y: p.position.y, z: p.position.z },
      velocity: { x: p.velocity.x, y: p.velocity.y, z: p.velocity.z },
      yaw: p.yaw ?? 0,
      pitch: p.pitch ?? 0,
      onGround: p.onGround ?? false,
      health: p.health ?? 0,
      isSprinting,
      sprintOutUntilTick,
      canFire,
      isCrouched,
      eyeHeight,
    },
  };
}
