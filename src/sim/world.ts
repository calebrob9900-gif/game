import { World } from './core/ecs';
import { EventBus } from './core/events';
import { createRng, type RngState } from './core/rng';
import { DT } from './core/time';
import { vec3, lengthHoriz, type Vec3 } from './core/vec';
import { foldCommands, type Command } from './input/commands';
import type { LevelDescriptor } from './levels/levelDescriptor';
import {
  integratePlayer,
  PLAYER_CAPSULE,
  type ControllerState,
  type PlayerMovementParams,
} from './physics/characterController';

/**
 * The simulation world. Plain-object entities (miniplex), a seeded RNG, a fixed
 * tick counter and a typed event bus. NO three / DOM / audio imports here.
 */
export interface Entity {
  player?: boolean;
  position?: Vec3;
  velocity?: Vec3;
  yaw?: number;
  pitch?: number;
  onGround?: boolean;
  health?: number;
}

export interface SimSettings {
  /** Downward gravity acceleration (m/s²). */
  gravity: number;
  /** Max ground speed (m/s). */
  moveSpeed: number;
  /** Ground acceleration (m/s²). */
  accel: number;
  /** Ground friction coefficient (per second). */
  friction: number;
  /** Jump launch velocity (m/s). */
  jumpSpeed: number;
  /** Eye height above foot position (m). Player position.y = footY + eyeHeight. */
  eyeHeight: number;
}

export const DEFAULT_SETTINGS: SimSettings = {
  gravity: 20,
  moveSpeed: 6,
  accel: 60,
  friction: 8,
  jumpSpeed: 6.3,
  eyeHeight: 1.7,
};

export interface GameEvents extends Record<string, unknown> {
  tick: { tick: number };
  jump: { tick: number };
}

export interface SimWorld {
  ecs: World<Entity>;
  rng: RngState;
  tick: number;
  events: EventBus<GameEvents>;
  settings: SimSettings;
  /** Active level descriptor. Provides collision geometry for the character controller. */
  level: LevelDescriptor | null;
}

export function createWorld(
  seed: number,
  settings: SimSettings = DEFAULT_SETTINGS,
  level: LevelDescriptor | null = null,
): SimWorld {
  const ecs = new World<Entity>();

  // Determine spawn position: use first level spawn if available, else default
  const firstSpawn = level && level.spawns.length > 0 ? level.spawns[0] : null;
  const spawnPos = firstSpawn ? firstSpawn.position : { x: 0, y: 0, z: 0 };
  const spawnYaw = firstSpawn ? firstSpawn.yaw : 0;

  ecs.add({
    player: true,
    // Position stored as foot position; eye height is an offset in presentation
    position: vec3(spawnPos.x, spawnPos.y + settings.eyeHeight, spawnPos.z),
    velocity: vec3(0, 0, 0),
    yaw: spawnYaw,
    pitch: 0,
    onGround: true,
    health: 100,
  });
  return {
    ecs,
    rng: createRng(seed),
    tick: 0,
    events: new EventBus<GameEvents>(),
    settings,
    level,
  };
}

export function getPlayer(
  world: SimWorld,
): Required<Pick<Entity, 'position' | 'velocity'>> & Entity {
  const player = world.ecs.with('player', 'position', 'velocity').entities[0];
  if (!player) throw new Error('sim: no player entity');
  return player as Required<Pick<Entity, 'position' | 'velocity'>> & Entity;
}

const PITCH_LIMIT = Math.PI / 2 - 0.01;

/**
 * Advance the sim by exactly one fixed tick, applying the commands collected for
 * this tick. Pure w.r.t. (world, commands): same inputs ⇒ identical next state.
 *
 * Physics: kinematic capsule resolved against level AABB colliders if a level
 * is loaded, otherwise falls back to a flat-ground plane at eyeHeight.
 * See docs/decisions/0001-character-controller.md.
 */
export function step(world: SimWorld, commands: readonly Command[]): void {
  const input = foldCommands(commands);
  const s = world.settings;
  const p = getPlayer(world);

  // --- look ---
  let yaw = (p.yaw ?? 0) + input.dyaw;
  // wrap yaw to [-PI, PI] for a stable, bounded hash
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  let pitch = (p.pitch ?? 0) + input.dpitch;
  pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  p.yaw = yaw;
  p.pitch = pitch;

  // --- desired horizontal move in world space (yaw basis) ---
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = -Z, right = +X in this basis
  let wishX = input.right * cos + input.forward * sin;
  let wishZ = input.right * sin - input.forward * cos;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  if (world.level) {
    // ── Capsule controller path ──────────────────────────────────────────────
    // Player position stores the EYE position. We convert to foot position for
    // the physics controller (foot = eye - eyeHeight), integrate, then convert back.
    const footY = p.position.y - s.eyeHeight;
    const ctrlState: ControllerState = {
      position: { x: p.position.x, y: footY, z: p.position.z },
      velocity: { x: p.velocity.x, y: p.velocity.y, z: p.velocity.z },
      onGround: p.onGround ?? false,
    };

    const movParams: PlayerMovementParams = {
      maxRunSpeed: s.moveSpeed,
      groundAccel: s.accel,
      friction: s.friction,
      gravity: s.gravity,
      jumpSpeed: s.jumpSpeed,
    };

    // Fire jump event BEFORE integration (so listener sees the world state)
    if (input.jump && ctrlState.onGround) {
      world.events.emit('jump', { tick: world.tick });
    }

    integratePlayer(
      ctrlState,
      wishX,
      wishZ,
      input.jump,
      world.level.colliders,
      movParams,
      DT,
      PLAYER_CAPSULE,
    );

    // Write back to entity (eye = foot + eyeHeight)
    p.position.x = ctrlState.position.x;
    p.position.y = ctrlState.position.y + s.eyeHeight;
    p.position.z = ctrlState.position.z;
    p.velocity.x = ctrlState.velocity.x;
    p.velocity.y = ctrlState.velocity.y;
    p.velocity.z = ctrlState.velocity.z;
    p.onGround = ctrlState.onGround;
  } else {
    // ── Flat-ground fallback path (no level loaded) ──────────────────────────
    const vel = p.velocity;

    // Friction (horizontal)
    const speed = lengthHoriz(vel);
    if (speed > 0) {
      const drop = speed * s.friction * DT;
      const newSpeed = Math.max(0, speed - drop);
      const scale = newSpeed / speed;
      vel.x *= scale;
      vel.z *= scale;
    }

    // Acceleration toward wish velocity
    const targetX = wishX * s.moveSpeed;
    const targetZ = wishZ * s.moveSpeed;
    vel.x += (targetX - vel.x) * Math.min(1, s.accel * DT * 0.25);
    vel.z += (targetZ - vel.z) * Math.min(1, s.accel * DT * 0.25);

    // Jump
    if (input.jump && p.onGround) {
      vel.y = s.jumpSpeed;
      p.onGround = false;
      world.events.emit('jump', { tick: world.tick });
    }

    // Gravity + integrate
    vel.y -= s.gravity * DT;
    p.position.x += vel.x * DT;
    p.position.y += vel.y * DT;
    p.position.z += vel.z * DT;

    // Ground collision (flat plane at eyeHeight)
    if (p.position.y <= s.eyeHeight) {
      p.position.y = s.eyeHeight;
      if (vel.y < 0) vel.y = 0;
      p.onGround = true;
    }
  }

  world.tick += 1;
  world.events.emit('tick', { tick: world.tick });
}
