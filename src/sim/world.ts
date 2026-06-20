import { World } from './core/ecs';
import { EventBus } from './core/events';
import { createRng, type RngState } from './core/rng';
import { DT, TICK_RATE } from './core/time';
import { vec3, lengthHoriz, type Vec3 } from './core/vec';
import { foldCommands, type Command } from './input/commands';
import type { LevelDescriptor } from './levels/levelDescriptor';
import {
  integratePlayer,
  PLAYER_CAPSULE,
  type ControllerState,
  type PlayerMovementParams,
} from './physics/characterController';

// ── Sprint constants (research/03 §7.2, §2.2) ─────────────────────────────────

/** Sprint speed multiplier: ×1.4 of base run speed. */
export const SPRINT_MULT = 1.4;
/** Tactical sprint speed multiplier: ×1.7 of base run speed. */
export const TAC_SPRINT_MULT = 1.7;
/**
 * Sprint-out window after sprint ends: ~0.15 s → 9 ticks at 60 Hz.
 * Firing is blocked during this window.
 */
export const SPRINT_OUT_TICKS = Math.round(0.15 * TICK_RATE); // 9
/**
 * Tac-sprint-out window after tac-sprint ends: ~0.25 s → 15 ticks at 60 Hz.
 */
export const TAC_SPRINT_OUT_TICKS = Math.round(0.25 * TICK_RATE); // 15
/**
 * Minimum forward component to allow sprint (dot product of wish direction with
 * forward axis, in normalized wish space). Requires "forward-ish" movement.
 * A value of 0.5 means the input direction must be within 60° of pure forward.
 */
const SPRINT_FORWARD_MIN = 0.5;

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
  /**
   * Per-weapon move speed multiplier. Applied in integratePlayer to scale maxRunSpeed.
   * From research/03 §7.1: knife/empty 1.0, AR 0.85, LMG/sniper 0.75.
   * Defaults to 1.0 (no penalty) when absent so existing golden hashes are unchanged.
   */
  moveMult?: number;
  /**
   * Whether the player is currently sprinting or tac-sprinting this tick.
   * Firing is forbidden while true. Set and cleared each tick by world.step().
   * Absent ⇒ not sprinting (default unchanged behaviour).
   */
  isSprinting?: boolean;
  /**
   * True when the player was tac-sprinting on the last active sprint tick.
   * Used to select the correct sprint-out window length on sprint release.
   * Absent ⇒ not tac-sprinting.
   */
  wasTacSprinting?: boolean;
  /**
   * Tick number at which the sprint-out window expires (exclusive).
   * Firing is forbidden while world.tick < sprintOutUntilTick.
   * Sprint-out durations (research/03 §7.2, §2.2):
   *   sprint:     ~0.15 s → 9 ticks at 60 Hz
   *   tac-sprint: ~0.25 s → 15 ticks at 60 Hz
   * Absent or 0 ⇒ no sprint-out window active.
   */
  sprintOutUntilTick?: number;
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

  // --- Sprint state (research/03 §7.2) ---
  // Sprint requires forward-ish movement: the forward component of the input must
  // exceed SPRINT_FORWARD_MIN. We check input.forward directly (not the wish vector,
  // which is rotated by yaw) — sprint is "I pressed W fast", not a world-space query.
  const hasForwardInput = input.forward >= SPRINT_FORWARD_MIN;
  // Tac-sprint supersedes sprint when both are pressed.
  const activeTacSprint = (input.tacSprint ?? false) && hasForwardInput;
  const activeSprint = !activeTacSprint && (input.sprint ?? false) && hasForwardInput;
  const isSprintingNow = activeSprint || activeTacSprint;

  // Only update sprint state on the entity when sprint is or was relevant.
  // This keeps p.isSprinting === undefined for entities that have NEVER had sprint
  // input, preserving all existing golden hashes (hash only folds isSprinting when
  // the field is defined — see core/hash.ts).
  const wasSprintingBefore = p.isSprinting ?? false;
  if (isSprintingNow || wasSprintingBefore || (p.sprintOutUntilTick ?? 0) > 0) {
    // Sprint-out timer: set when sprint transitions active → inactive.
    if (wasSprintingBefore && !isSprintingNow) {
      // Determine sprint-out window length using wasTacSprinting flag, which recorded
      // whether the previous active sprint tick was a tac-sprint.
      const wasTac = p.wasTacSprinting ?? false;
      const outTicks = wasTac ? TAC_SPRINT_OUT_TICKS : SPRINT_OUT_TICKS;
      // world.tick has NOT yet incremented (it increments at the end of step()).
      // The window expires at tick (world.tick + 1 + outTicks), exclusive.
      const newWindow = world.tick + 1 + outTicks;
      // Only extend (never shorten) an existing active window.
      const existing = p.sprintOutUntilTick ?? 0;
      p.sprintOutUntilTick = Math.max(existing, newWindow);
    }
    // Track which sprint mode was active (for sprint-out window selection).
    if (isSprintingNow) {
      p.wasTacSprinting = activeTacSprint;
    }
    // Write current sprint flag only when we're in the sprint branch.
    p.isSprinting = isSprintingNow;
  }

  // Compose sprint multiplier with per-weapon moveMult.
  // Sprint multipliers: ×1.4 (sprint), ×1.7 (tac-sprint). Applied on top of moveMult.
  const sprintMult = activeTacSprint ? TAC_SPRINT_MULT : activeSprint ? SPRINT_MULT : 1.0;
  const combinedMoveMult = (p.moveMult ?? 1.0) * sprintMult;

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
      // Combined sprint × per-weapon move multiplier. When not sprinting, this is
      // just p.moveMult (or 1.0), preserving existing golden hashes for non-sprint input.
      moveMult: combinedMoveMult,
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

    // Acceleration toward wish velocity (apply combined sprint × weapon moveMult)
    const targetX = wishX * s.moveSpeed * combinedMoveMult;
    const targetZ = wishZ * s.moveSpeed * combinedMoveMult;
    vel.x += (targetX - vel.x) * Math.min(1, s.accel * DT * 0.25);
    vel.z += (targetZ - vel.z) * Math.min(1, s.accel * DT * 0.25);

    // Jump — emit BEFORE mutating state (onGround still true at event time),
    // matching the capsule path so listeners observe identical world state.
    if (input.jump && p.onGround) {
      world.events.emit('jump', { tick: world.tick });
      vel.y = s.jumpSpeed;
      p.onGround = false;
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
