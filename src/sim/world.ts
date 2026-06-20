import { World } from './core/ecs';
import { EventBus } from './core/events';
import { createRng, type RngState } from './core/rng';
import { DT } from './core/time';
import { addScaled, vec3, lengthHoriz, type Vec3 } from './core/vec';
import { foldCommands, type Command } from './input/commands';

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
  /** Eye height / ground clamp (m). */
  eyeHeight: number;
}

export const DEFAULT_SETTINGS: SimSettings = {
  gravity: 20,
  moveSpeed: 7,
  accel: 60,
  friction: 8,
  jumpSpeed: 7,
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
}

export function createWorld(seed: number, settings: SimSettings = DEFAULT_SETTINGS): SimWorld {
  const ecs = new World<Entity>();
  ecs.add({
    player: true,
    position: vec3(0, settings.eyeHeight, 0),
    velocity: vec3(0, 0, 0),
    yaw: 0,
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

  const vel = p.velocity;

  // --- friction (horizontal) ---
  const speed = lengthHoriz(vel);
  if (speed > 0) {
    const drop = speed * s.friction * DT;
    const newSpeed = Math.max(0, speed - drop);
    const scale = newSpeed / speed;
    vel.x *= scale;
    vel.z *= scale;
  }

  // --- acceleration toward wish velocity (capped at moveSpeed) ---
  const targetX = wishX * s.moveSpeed;
  const targetZ = wishZ * s.moveSpeed;
  vel.x += (targetX - vel.x) * Math.min(1, s.accel * DT * 0.25);
  vel.z += (targetZ - vel.z) * Math.min(1, s.accel * DT * 0.25);

  // --- jump ---
  if (input.jump && p.onGround) {
    vel.y = s.jumpSpeed;
    p.onGround = false;
    world.events.emit('jump', { tick: world.tick });
  }

  // --- gravity + integrate ---
  vel.y -= s.gravity * DT;
  addScaled(p.position, vel, DT);

  // --- ground collision (flat plane at eyeHeight) ---
  if (p.position.y <= s.eyeHeight) {
    p.position.y = s.eyeHeight;
    if (vel.y < 0) vel.y = 0;
    p.onGround = true;
  }

  world.tick += 1;
  world.events.emit('tick', { tick: world.tick });
}
