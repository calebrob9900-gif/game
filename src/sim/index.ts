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

// Physics / character controller
export {
  moveAndResolve,
  integratePlayer,
  resolveCapsuleVsBox,
  PLAYER_CAPSULE,
  STEP_HEIGHT,
  DEFAULT_MOVEMENT_PARAMS,
} from './physics/characterController';
export type {
  CapsuleShape,
  ControllerState,
  PlayerMovementParams,
} from './physics/characterController';
