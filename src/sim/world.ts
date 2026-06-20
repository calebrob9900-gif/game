import { World } from './core/ecs';
import { EventBus } from './core/events';
import { createRng, type RngState } from './core/rng';
import { DT, TICK_RATE } from './core/time';
import { vec3, lengthHoriz, type Vec3 } from './core/vec';
import { foldCommands, type Command } from './input/commands';
import type { LevelDescriptor } from './levels/levelDescriptor';
import {
  integratePlayer,
  detectMantle,
  EYE_HEIGHT_STAND,
  EYE_HEIGHT_CROUCH,
  CROUCH_SPEED_MULT,
  SLIDE_SPEED_MULT,
  SLIDE_TICKS,
  MANTLE_TICKS,
  type ControllerState,
  type PlayerMovementParams,
} from './physics/characterController';
import { getWeapon } from './weapons/weapons';
import { fireHitscan } from './combat/hitscan';
import type { HitRegion } from './combat/hitbox';

// --- bot stub (T-133) ---
/**
 * Respawn delay in ticks after bot death (deterministic, tick-based).
 * 5 seconds × 60 ticks/s = 300 ticks.
 */
export const RESPAWN_TICKS = 5 * TICK_RATE; // 300
// --- end bot stub constants ---

// ── Re-export crouch/slide/mantle constants so tests can import from sim ───────
export {
  EYE_HEIGHT_STAND,
  EYE_HEIGHT_CROUCH,
  CROUCH_SPEED_MULT,
  SLIDE_SPEED_MULT,
  SLIDE_TICKS,
  MANTLE_TICKS,
};
// RESPAWN_TICKS is declared at the top of this file (before the Entity interface).

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
  /**
   * Whether the player is currently crouched.
   * True when crouch input is held AND on ground (or blocked from standing).
   * Absent ⇒ not crouched (default). Only set once crouch input is received.
   * From research/03 §7.3.
   */
  isCrouched?: boolean;
  /**
   * Current weapon id (must exist in WEAPON_REGISTRY).
   * Defaults to 'ar_baseline' for the player entity.
   * Used by the combat/fire system in world.step().
   */
  weaponId?: string;
  /**
   * Whether this entity can receive damage (is a valid hitscan target).
   * Entities with health defined are damageable; this flag is optional and
   * only needs to be set to make intent explicit in tests / bot setup.
   * The fire system tests `health !== undefined` as the actual gate.
   */
  damageable?: boolean;
  // ── Slide state (T-105, research/03 §7.3) ────────────────────────────────────
  /**
   * Whether the player is currently sliding.
   * True during the slide boost window (slideTicksLeft > 0).
   * Absent ⇒ not sliding (default). Only set when slide input is first received.
   */
  isSliding?: boolean;
  /**
   * Remaining ticks in the slide boost window (counts down from SLIDE_TICKS to 0).
   * Absent or 0 ⇒ not sliding. Slide triggered by sprint+crouch on ground.
   */
  slideTicksLeft?: number;
  // ── Mantle state (T-105, research/03 §7.3) ───────────────────────────────────
  /**
   * Whether the player is currently mantling a ledge.
   * True while mantleTicksLeft > 0.
   * Absent ⇒ not mantling (default).
   */
  isMantling?: boolean;
  /**
   * Remaining ticks in the mantle animation (counts down from MANTLE_TICKS to 0).
   * Absent or 0 ⇒ not mantling.
   */
  mantleTicksLeft?: number;
  /**
   * Target foot Y to mantle to (the ledge top surface Y).
   * Only meaningful when mantleTicksLeft > 0.
   */
  mantleTargetY?: number;
  /**
   * Mantle forward direction X component (normalized world space).
   * Set when mantle is triggered, cleared when done.
   */
  mantleDirX?: number;
  /**
   * Mantle forward direction Z component (normalized world space).
   */
  mantleDirZ?: number;

  // --- bot stub (T-133) ---
  /**
   * Marks this entity as a bot placeholder target.
   * Absent ⇒ not a bot. Does NOT conflict with the player flag.
   */
  bot?: true;
  /**
   * Maximum health for this entity (used to restore health on respawn).
   * Absent ⇒ defaults to 100 if the entity is a bot.
   */
  maxHealth?: number;
  /**
   * Tick number at which this bot should respawn (if dead).
   * Only meaningful when health ≤ 0 (dead state).
   * 0 or absent ⇒ no pending respawn.
   */
  respawnAtTick?: number;
  /**
   * Spawn position for this bot (foot position in world space).
   * Stored so the bot can respawn at the same location.
   */
  spawnPos?: Vec3;
  // --- end bot stub fields ---
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
  /**
   * Emitted when a hitscan shot registers a hit on a target.
   * Payload includes:
   *   targetIndex — index in world.ecs.entities
   *   region      — the body region that was struck
   *   amount      — damage applied (damageClose × mult[region])
   */
  hit: {
    targetIndex: number;
    region: HitRegion;
    amount: number;
  };
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
    // Position stored as eye position (foot + eyeHeight); see world.ts comment
    position: vec3(spawnPos.x, spawnPos.y + settings.eyeHeight, spawnPos.z),
    velocity: vec3(0, 0, 0),
    yaw: spawnYaw,
    pitch: 0,
    onGround: true,
    health: 100,
    // Default weapon for the player (T-111: hitscan fire system)
    weaponId: 'ar_baseline',
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

// --- bot stub (T-133) ---
/**
 * Spawn a bot placeholder target at `footPos` (foot position in world space).
 *
 * The bot entity has:
 *   - `bot: true` — marks it as a bot
 *   - `health: maxHealth` — full health at spawn
 *   - `maxHealth` — stored for respawn restoration
 *   - `damageable: true` — valid hitscan target
 *   - `position` — eye position (footPos.y + EYE_HEIGHT_STAND)
 *   - `spawnPos` — stored foot position for respawn
 *
 * Does NOT alter default createWorld behaviour; call this after createWorld.
 * Returns the spawned entity.
 */
export function spawnBot(world: SimWorld, footPos: Vec3, maxHealth = 100): Entity {
  const entity: Entity = {
    bot: true,
    health: maxHealth,
    maxHealth,
    damageable: true,
    position: vec3(footPos.x, footPos.y + EYE_HEIGHT_STAND, footPos.z),
    spawnPos: vec3(footPos.x, footPos.y, footPos.z),
  };
  world.ecs.add(entity);
  return entity;
}
// --- end bot stub factory ---

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

  // --- Crouch input (research/03 §7.3) ---
  // Crouch is determined BEFORE sprint so we can enforce "crouch wins over sprint".
  const crouchInput = input.crouch;
  const wasCrouched = p.isCrouched ?? false;

  // --- Sprint state (research/03 §7.2) ---
  // Sprint requires forward-ish movement: the forward component of the input must
  // exceed SPRINT_FORWARD_MIN. We check input.forward directly (not the wish vector,
  // which is rotated by yaw) — sprint is "I pressed W fast", not a world-space query.
  // Crouch wins over sprint: if crouch is held, sprint is suppressed entirely.
  const hasForwardInput = input.forward >= SPRINT_FORWARD_MIN;
  // Tac-sprint supersedes sprint when both are pressed. Both suppressed by crouch.
  const activeTacSprint = !crouchInput && (input.tacSprint ?? false) && hasForwardInput;
  const activeSprint =
    !crouchInput && !activeTacSprint && (input.sprint ?? false) && hasForwardInput;
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
  // Crouch multiplier is applied inside integratePlayer, NOT here, to avoid double-applying.
  const sprintMult = activeTacSprint ? TAC_SPRINT_MULT : activeSprint ? SPRINT_MULT : 1.0;
  const combinedMoveMult = (p.moveMult ?? 1.0) * sprintMult;

  if (world.level) {
    // ── Capsule controller path ──────────────────────────────────────────────
    // Player position stores the EYE position. We convert to foot position for
    // the physics controller (foot = eye - eyeHeight). Eye height depends on crouch state.
    // During slide or mantle, use crouch eye height.
    const wasSliding = (p.slideTicksLeft ?? 0) > 0;
    const wasMantling = (p.mantleTicksLeft ?? 0) > 0;
    const currentEyeHeight =
      wasCrouched || wasSliding || wasMantling ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    const footY = p.position.y - currentEyeHeight;
    const ctrlState: ControllerState = {
      position: { x: p.position.x, y: footY, z: p.position.z },
      velocity: { x: p.velocity.x, y: p.velocity.y, z: p.velocity.z },
      onGround: p.onGround ?? false,
    };

    // ── Slide state management (T-105) ───────────────────────────────────────
    // Slide is triggered when: sprint is active + crouch input pressed + on ground + moving.
    // The slide gives a speed boost of SLIDE_SPEED_MULT × maxRunSpeed for SLIDE_TICKS ticks.
    // Slide takes priority over normal sprint+crouch (crouch cancels sprint in normal cases,
    // but slide is a special transition from sprint into crouch).
    let slideTicksLeft = p.slideTicksLeft ?? 0;
    const hasHorizMove = wishX !== 0 || wishZ !== 0;
    const canStartSlide =
      (activeSprint || wasSprintingBefore) && // was or is sprinting
      crouchInput && // crouch key pressed
      ctrlState.onGround && // on the ground
      !wasMantling && // not already mantling
      slideTicksLeft === 0; // not already sliding

    if (canStartSlide && hasHorizMove) {
      // Trigger slide: set velocity to SLIDE_SPEED_MULT × run speed in current wish direction
      slideTicksLeft = SLIDE_TICKS;
      // Slide boosts velocity in the current wish direction (or current velocity direction
      // if no wish input). Use wish direction if present, else existing velocity direction.
      const slideSpeed = s.moveSpeed * (p.moveMult ?? 1.0) * SLIDE_SPEED_MULT;
      const velLen = Math.sqrt(
        ctrlState.velocity.x * ctrlState.velocity.x + ctrlState.velocity.z * ctrlState.velocity.z,
      );
      if (wishX !== 0 || wishZ !== 0) {
        const wl = Math.sqrt(wishX * wishX + wishZ * wishZ);
        ctrlState.velocity.x = (wishX / wl) * slideSpeed;
        ctrlState.velocity.z = (wishZ / wl) * slideSpeed;
      } else if (velLen > 0.01) {
        ctrlState.velocity.x = (ctrlState.velocity.x / velLen) * slideSpeed;
        ctrlState.velocity.z = (ctrlState.velocity.z / velLen) * slideSpeed;
      }
    } else if (slideTicksLeft > 0) {
      slideTicksLeft -= 1;
    }

    const isSliding = slideTicksLeft > 0;

    // ── Mantle detection (T-105) ─────────────────────────────────────────────
    // Auto-mantle: when player is on ground and moving into a wall with top
    // > STEP_HEIGHT and ≤ MAX_MANTLE_HEIGHT, and there is clearance above.
    // Mantle cannot start while sliding or already mantling.
    let mantleTicksLeft = p.mantleTicksLeft ?? 0;
    let mantleTargetY = p.mantleTargetY ?? 0;
    let mantleDirX = p.mantleDirX ?? 0;
    let mantleDirZ = p.mantleDirZ ?? 0;

    if (!isSliding && !wasMantling && ctrlState.onGround && hasHorizMove) {
      // Only probe for mantle when moving (not standing still)
      const mantle = detectMantle(
        ctrlState.position.x,
        ctrlState.position.y,
        ctrlState.position.z,
        wishX,
        wishZ,
        world.level.colliders,
      );
      if (mantle) {
        mantleTicksLeft = MANTLE_TICKS;
        mantleTargetY = mantle.targetY;
        mantleDirX = mantle.dirX;
        mantleDirZ = mantle.dirZ;
      }
    } else if (wasMantling && mantleTicksLeft > 0) {
      mantleTicksLeft -= 1;
    }

    const isMantlingNow = mantleTicksLeft > 0;

    const movParams: PlayerMovementParams = {
      maxRunSpeed: s.moveSpeed,
      groundAccel: s.accel,
      friction: s.friction,
      gravity: s.gravity,
      jumpSpeed: s.jumpSpeed,
      // Combined sprint × per-weapon move multiplier. When not sprinting, this is
      // just p.moveMult (or 1.0), preserving existing golden hashes for non-sprint input.
      moveMult: combinedMoveMult,
      // Crouch params — only passed when crouch has been activated.
      // Omitting when false preserves default behaviour.
      crouchInput,
      wasCrouched,
      // Slide params (T-105) — only passed when slide is relevant.
      ...(isSliding || wasSliding ? { slideTicksLeft } : {}),
      // Mantle params (T-105) — only passed when mantling.
      ...(isMantlingNow ? { mantleTicksLeft, mantleTargetY, mantleDirX, mantleDirZ } : {}),
    };

    // Fire jump event BEFORE integration (so listener sees the world state)
    if (input.jump && ctrlState.onGround && !isSliding && !isMantlingNow) {
      world.events.emit('jump', { tick: world.tick });
    }

    const nowCrouched = integratePlayer(
      ctrlState,
      wishX,
      wishZ,
      input.jump,
      world.level.colliders,
      movParams,
      DT,
    );

    // Write back to entity.
    // Eye height: crouched, sliding, or mantling → EYE_HEIGHT_CROUCH; else STAND.
    const nowSliding = isSliding;
    const newEyeHeight =
      nowCrouched || nowSliding || isMantlingNow ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    p.position.x = ctrlState.position.x;
    p.position.y = ctrlState.position.y + newEyeHeight;
    p.position.z = ctrlState.position.z;
    p.velocity.x = ctrlState.velocity.x;
    p.velocity.y = ctrlState.velocity.y;
    p.velocity.z = ctrlState.velocity.z;
    p.onGround = ctrlState.onGround;

    // Only store isCrouched on entity when crouch has been used (to preserve
    // existing golden hashes for scenarios without any crouch input — hash only
    // folds isCrouched when the field is defined, matching the sprint pattern).
    if (crouchInput || wasCrouched || isSliding || wasSliding) {
      p.isCrouched = nowCrouched || nowSliding; // slide keeps crouched posture
    }

    // ── Persist slide state (T-105) ──────────────────────────────────────────
    // Only set on entity when slide has been used, to preserve existing golden hashes.
    if (isSliding || wasSliding || canStartSlide) {
      p.isSliding = nowSliding;
      p.slideTicksLeft = slideTicksLeft;
    }

    // ── Persist mantle state (T-105) ─────────────────────────────────────────
    // Only set on entity when mantle has been used, to preserve existing golden hashes.
    if (isMantlingNow || wasMantling) {
      p.isMantling = isMantlingNow;
      p.mantleTicksLeft = mantleTicksLeft;
      p.mantleTargetY = mantleTargetY;
      p.mantleDirX = mantleDirX;
      p.mantleDirZ = mantleDirZ;
    }
  } else {
    // ── Flat-ground fallback path (no level loaded) ──────────────────────────
    const vel = p.velocity;

    // Flat-ground path: minimal crouch support (lowers eyeHeight for the ground plane).
    // Headroom check is not meaningful without colliders.
    const isCrouchedFlat = crouchInput && (p.onGround ?? true);

    // Friction (horizontal)
    const speed = lengthHoriz(vel);
    if (speed > 0) {
      const drop = speed * s.friction * DT;
      const newSpeed = Math.max(0, speed - drop);
      const scale = newSpeed / speed;
      vel.x *= scale;
      vel.z *= scale;
    }

    // Acceleration toward wish velocity (apply combined sprint × weapon moveMult × crouch)
    const crouchFactor = isCrouchedFlat ? CROUCH_SPEED_MULT : 1.0;
    const targetX = wishX * s.moveSpeed * combinedMoveMult * crouchFactor;
    const targetZ = wishZ * s.moveSpeed * combinedMoveMult * crouchFactor;
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

    // Eye height depends on crouch (crouching lowers it)
    const flatEyeHeight = isCrouchedFlat ? EYE_HEIGHT_CROUCH : s.eyeHeight;

    // Ground collision (flat plane at eyeHeight for standing, lower for crouch)
    if (p.position.y <= flatEyeHeight) {
      p.position.y = flatEyeHeight;
      if (vel.y < 0) vel.y = 0;
      p.onGround = true;
    }

    // Store isCrouched only when crouch has been used (same pattern as capsule path)
    if (crouchInput || wasCrouched) {
      p.isCrouched = isCrouchedFlat;
    }
  }

  // --- combat/fire -----------------------------------------------------------
  // Process a FireCommand this tick if:
  //   1. input.fire is set (a FireCommand was queued this tick)
  //   2. canFire is true (not sprinting and not in sprint-out window)
  //   3. The player has a weaponId set
  //
  // canFire derivation (mirrors snapshot.ts):
  //   isSprinting = p.isSprinting ?? false
  //   sprintOutUntilTick = p.sprintOutUntilTick ?? 0
  //   canFire = !isSprinting && world.tick >= sprintOutUntilTick
  //
  // NOTE: world.tick has NOT yet incremented at this point.
  if (input.fire) {
    const isSprinting = p.isSprinting ?? false;
    const sprintOutUntilTick = p.sprintOutUntilTick ?? 0;
    // Use world.tick + 1 for canFire check because the tick increment happens
    // below — this tick's snapshot tick will be world.tick + 1.
    const canFire = !isSprinting && world.tick + 1 > sprintOutUntilTick;

    if (canFire && p.weaponId !== undefined) {
      const weapon = getWeapon(p.weaponId);
      // Construct a typed shooter context with non-optional yaw/pitch/position
      const shooter = {
        position: p.position,
        yaw: p.yaw ?? 0,
        pitch: p.pitch ?? 0,
        player: p.player,
      };
      const hit = fireHitscan(world, shooter, weapon);

      if (hit !== null) {
        const target = world.ecs.entities[hit.targetIndex];
        if (target && target.health !== undefined) {
          // Damage = damageClose × region multiplier (research/03 §5.3)
          const multKey = hit.region; // 'head' | 'chest' | 'stomach' | 'limb'
          const mult = weapon.mult[multKey];
          const dmg = weapon.damageClose * mult;
          // Apply damage (clamp to 0)
          target.health = Math.max(0, target.health - dmg);
          // Emit hit event (presentation/effects can react to this)
          world.events.emit('hit', {
            targetIndex: hit.targetIndex,
            region: hit.region,
            amount: dmg,
          });
        }
      }
    }
  }
  // --- end combat/fire -------------------------------------------------------

  // --- bot stub (T-133) — death + respawn ------------------------------------
  // Process all bot entities:
  //   1. When health drops to ≤ 0 (just died): mark respawnAtTick and remove
  //      from the damageable set (health stays 0, damageable cleared).
  //   2. When respawnAtTick arrives: restore full health, set damageable=true,
  //      return position to spawnPos. Deterministic tick-based (no random).
  //
  // NOTE: world.tick has NOT yet incremented at this point.
  // The comparison uses world.tick + 1 (the tick we are completing).
  const currentTickAfterIncrement = world.tick + 1;
  for (const e of world.ecs.entities) {
    if (!e.bot) continue;

    if (e.health !== undefined && e.health <= 0 && e.damageable) {
      // Bot just died (health reached 0 this tick or was 0 and still damageable).
      // Mark dead: clear damageable so hitscan skips it.
      e.damageable = false;
      // Schedule respawn after RESPAWN_TICKS from the next tick.
      e.respawnAtTick = currentTickAfterIncrement + RESPAWN_TICKS;
    } else if (
      !e.damageable &&
      e.respawnAtTick !== undefined &&
      e.respawnAtTick > 0 &&
      currentTickAfterIncrement >= e.respawnAtTick
    ) {
      // Respawn: restore health and position, mark damageable again.
      const max = e.maxHealth ?? 100;
      e.health = max;
      e.damageable = true;
      e.respawnAtTick = 0;
      // Return to spawn position.
      if (e.spawnPos && e.position) {
        e.position.x = e.spawnPos.x;
        e.position.y = e.spawnPos.y + EYE_HEIGHT_STAND;
        e.position.z = e.spawnPos.z;
      }
    }
  }
  // --- end bot stub (T-133) --------------------------------------------------

  world.tick += 1;
  world.events.emit('tick', { tick: world.tick });
}
