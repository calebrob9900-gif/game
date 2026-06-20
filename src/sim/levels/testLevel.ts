/**
 * Programmatic test level for physics/controller replay tests.
 *
 * Layout (top-down, X right, Z into page, Y up):
 *
 *   ┌───────────────────────────────────────┐
 *   │  ground plane (0,0,0) 40×40           │
 *   │                                        │
 *   │  North wall (z = -18)                  │
 *   │  South wall (z = +18)                  │
 *   │  West wall  (x = -18)                  │
 *   │  East wall  (x = +18)                  │
 *   │                                        │
 *   │  Low step/ledge  — center (5,0.2,-3)  │
 *   │    height 0.4 m  (stepable)            │
 *   │                                        │
 *   │  High platform   — center (10,1,-5)   │
 *   │    height 2 m    (not stepable)        │
 *   │                                        │
 *   │  Spawn at (-5, 0, 0)  yaw=0           │
 *   └───────────────────────────────────────┘
 *
 * All dimensions in meters. Player capsule height 1.8 m, radius 0.3 m.
 * Eye height (camera) = 1.7 m above foot.
 */
import type { LevelDescriptor } from './levelDescriptor';

export function createTestLevel(): LevelDescriptor {
  return {
    name: 'test_level',
    bounds: {
      min: { x: -20, y: -1, z: -20 },
      max: { x: 20, y: 10, z: 20 },
    },
    colliders: [
      // Ground plane — 40×40 m, 1 m thick, top surface at y=0
      {
        center: { x: 0, y: -0.5, z: 0 },
        half: { x: 20, y: 0.5, z: 20 },
      },
      // North wall
      {
        center: { x: 0, y: 2, z: -19 },
        half: { x: 20, y: 4, z: 1 },
      },
      // South wall
      {
        center: { x: 0, y: 2, z: 19 },
        half: { x: 20, y: 4, z: 1 },
      },
      // West wall
      {
        center: { x: -19, y: 2, z: 0 },
        half: { x: 1, y: 4, z: 20 },
      },
      // East wall
      {
        center: { x: 19, y: 2, z: 0 },
        half: { x: 1, y: 4, z: 20 },
      },
      // Low step/ledge — 0.4 m tall (within stepHeight 0.4 m → steppable)
      // Top surface at y = 0.4; box center at y = 0.2
      {
        center: { x: 5, y: 0.2, z: -3 },
        half: { x: 1.5, y: 0.2, z: 1.5 },
      },
      // High platform — 2 m tall (above stepHeight → not steppable, acts as wall)
      // Top surface at y = 2.0; box center at y = 1.0
      {
        center: { x: 10, y: 1, z: -5 },
        half: { x: 2, y: 1, z: 2 },
      },
    ],
    spawns: [
      // Primary spawn: open ground, west side
      { position: { x: -5, y: 0, z: 0 }, yaw: 0 },
      // Secondary spawn: facing the low step
      { position: { x: 2, y: 0, z: -3 }, yaw: 0 },
    ],
  };
}
