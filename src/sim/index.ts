/** Public surface of the deterministic simulation (headless, no three/DOM). */
export {
  createWorld,
  step,
  getPlayer,
  DEFAULT_SETTINGS,
  SPRINT_MULT,
  TAC_SPRINT_MULT,
  SPRINT_OUT_TICKS,
  TAC_SPRINT_OUT_TICKS,
  EYE_HEIGHT_STAND,
  EYE_HEIGHT_CROUCH,
  CROUCH_SPEED_MULT,
  SLIDE_SPEED_MULT,
  SLIDE_TICKS,
  MANTLE_TICKS,
} from './world';
export type { SimWorld, Entity, SimSettings, GameEvents } from './world';
export { snapshot } from './snapshot';
export type { Snapshot, PlayerSnapshot } from './snapshot';
export { hashWorld } from './core/hash';
export { DT, TICK_RATE, MAX_FRAME_TIME, decay } from './core/time';
export { createRng, rngNextU32, rngNextFloat, rngRange, rngInt, cloneRng } from './core/rng';
export type { RngState } from './core/rng';
export { SystemRunner, defineSystem, World } from './core/ecs';
export type { System } from './core/ecs';
export { EventBus } from './core/events';
export { CommandBuffer, foldCommands, emptyTickInput } from './input/commands';
export type { Command, MoveCommand, LookCommand, TickInput } from './input/commands';
export * as vec from './core/vec';
export type { Vec3 } from './core/vec';

// Level descriptor
export type { LevelDescriptor, BoxCollider, SpawnPoint } from './levels/levelDescriptor';
export { validateLevel } from './levels/levelDescriptor';
export { createTestLevel } from './levels/testLevel';
export { createMantleTestLevel } from './levels/mantleTestLevel';
export { parseLevel } from './levels/loadLevel';

// Physics / character controller
export {
  moveAndResolve,
  integratePlayer,
  detectMantle,
  resolveCapsuleVsBox,
  hasHeadroomToStand,
  PLAYER_CAPSULE,
  PLAYER_CAPSULE_CROUCHED,
  STEP_HEIGHT,
  MAX_MANTLE_HEIGHT,
  SLIDE_SPEED_MULT as CONTROLLER_SLIDE_SPEED_MULT,
  SLIDE_TICKS as CONTROLLER_SLIDE_TICKS,
  MANTLE_TICKS as CONTROLLER_MANTLE_TICKS,
  DEFAULT_MOVEMENT_PARAMS,
} from './physics/characterController';
export type {
  CapsuleShape,
  ControllerState,
  PlayerMovementParams,
} from './physics/characterController';

// Weapons — data-driven weapon schema (T-110)
export type {
  WeaponDef,
  WeaponClass,
  FireMode,
  HitType,
  FalloffEntry,
  DamageMult,
  SpreadParams,
  RecoilPatternEntry,
  ProjectileParams,
} from './weapons/weaponDef';
export { fireInterval, validateWeapon } from './weapons/weaponDef';
export { AR_BASELINE, WEAPON_REGISTRY, getWeapon, ttkBody } from './weapons/weapons';
