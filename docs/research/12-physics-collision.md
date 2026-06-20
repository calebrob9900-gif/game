# 12 — Physics & Collision for a Three.js FPS (2025–2026)

> Deep-dive companion to `10-architecture.md`. Focus: static level collision + FPS
> player-vs-level movement in the browser, with concrete APIs and a recommendation
> for a small wave-survival arena. (Some vendor doc pages 403'd the fetcher; API
> details recovered from GitHub raw source + search extracts; canonical URLs cited.)

## TL;DR recommendation
- **Player-vs-level core:** start with **three-mesh-bvh** — a kinematic **capsule** resolved against one merged, position-only level mesh (BVH). Lightweight, no WASM, triangle-accurate, easy to debug, deterministic-enough for an arcade arena. This is what the official three.js `games_fps` example and the three-mesh-bvh `characterMovement` demo both do (capsule pushed out of triangles + manual gravity + substeps).
- **Add Rapier** (`@dimforge/rapier3d-compat`) **only when you want true dynamics**: ragdolls, knockback, bouncing/rolling debris, stacking, many interacting dynamic bodies. BVH (static character) + Rapier (dynamic bodies) compose well — a community-endorsed pattern.
- **Avoid** cannon-es for concave level collision (no trimesh-vs-trimesh; weak/slow trimesh) and **Ammo.js** (heavy, legacy Bullet 2.82, awkward manual-memory WASM API) unless you specifically need Bullet features.

> Note: `10-architecture.md` recommends Rapier as the primary engine (for its
> deterministic Node build → headless tests + netcode-readiness). These aren't in
> conflict: **use Rapier as the simulation/physics authority for determinism, and/or
> three-mesh-bvh for fast static-level capsule movement + hitscan rays.** Decide in
> the architecture spike (see TASKS) by prototyping both character controllers.

## The dominant pattern (2025–2026)
Represent the player as a **kinematic capsule**; represent the static level as one merged collision mesh. Each frame:
1. Move the capsule by velocity·dt.
2. Query the level (BVH shapecast / Rapier controller / Octree).
3. Push the capsule out of penetration along contact normals (slide, don't stop dead).
4. Derive **on-ground** from the vertical pushout (`normal.y` above a threshold = walkable).
5. Apply **gravity manually** (kinematic controllers do not auto-gravity).
6. Run a few **substeps** per frame to prevent tunneling at high speed.

**Kinematic, not dynamic, for the player** — you want crisp designed movement (instant accel/stop, fixed jump height) that a dynamic rigid body fights against. Kinematic bodies ignore forces but can still push dynamic objects.

**Separate collision mesh from render mesh** — visual level can be high-poly with normal maps; collision mesh should be simplified, watertight, position-only. Cuts build time and per-frame query cost.

## Option A — three-mesh-bvh (recommended core)
Repo: https://github.com/gkjohnson/three-mesh-bvh

```js
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast, StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// build ONE merged collision mesh for the static level (one-time cost)
const gen = new StaticGeometryGenerator(environment);
gen.attributes = ['position'];                 // collision needs only positions
const merged = gen.generate();
merged.boundsTree = new MeshBVH(merged);
const collider = new THREE.Mesh(merged);
```
Player = a `Line3` segment + radius; each frame `boundsTree.shapecast({ intersectsBounds, intersectsTriangle })` finds triangles within `radius` and pushes the capsule out by penetration depth. Ground check: `onGround = deltaVector.y > Math.abs(dt * velocity.y * 0.25)`. Bullets/hitscan = `raycastFirst` against the same BVH (+ enemy bounding capsules). README perf: ~500 rays vs 80k-poly model at 60fps; query cost ~log(triangles).
- Live demo: https://gkjohnson.github.io/three-mesh-bvh/example/bundle/characterMovement.html
- R3F-ready controller built on it: **BVHEcctrl** — https://github.com/pmndrs/BVHEcctrl

## Option B — Rapier (`@dimforge/rapier3d`)
Repo: https://github.com/dimforge/rapier.js · Docs: https://rapier.rs · 2025 review: https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/

- **Bundling:** prefer **`@dimforge/rapier3d-compat`** (WASM embedded as base64, ~1.9 MB, Vite-friendly) with an explicit `await RAPIER.init()` before use. Plain `@dimforge/rapier3d` (~1.4 MB, separate `.wasm`) needs a WASM-configured bundler.
- **Colliders** (`ColliderDesc`): `cuboid(hx,hy,hz)`, `ball(r)`, `capsule(halfH,r)` (player), `cylinder`, `trimesh(verts,indices)` (static level, attach to a `fixed()` body — never dynamic trimesh), `convexHull(points)` (dynamic props), `heightfield(...)`.
- **Bodies** (`RigidBodyDesc`): `fixed()` (level), `dynamic()` (props), `kinematicPositionBased()` (player).
- **KinematicCharacterController:**
```js
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const world = new RAPIER.World({ x:0, y:-9.81, z:0 });
const cc = world.createCharacterController(0.1);   // skin offset
cc.enableAutostep(0.7, 0.3, true);                 // stairs
cc.enableSnapToGround(0.7);                         // stick to floor on slopes/steps
cc.setApplyImpulsesToDynamicBodies(true);
// each frame: fold gravity into desired movement yourself, then:
cc.computeColliderMovement(characterCollider, desiredMovement);
const m = cc.computedMovement();                    // collision-resolved delta -> setNextKinematicTranslation
```
Slides along geometry, auto stair-step, ground snap, slope limits; `computedGrounded()` for ground state. Working three.js example: https://github.com/doppl3r/kinematic-character-controller-example · R3F wrapper: https://github.com/pmndrs/react-three-rapier

## Option C — official three.js games_fps (Octree + Capsule, no engine)
Live: https://threejs.org/examples/games_fps.html · Source: https://github.com/mrdoob/three.js/blob/dev/examples/games_fps.html
Uses `Octree.fromGraphNode(gltf.scene)` + `Capsule` + `worldOctree.capsuleIntersect()` (reflect velocity along normal, translate out by depth) + manual gravity + `STEPS_PER_FRAME` substeps. Same algorithm as Option A with a built-in Octree instead of a BVH; BVH is generally faster on large meshes.

## cannon-es / Ammo.js (for completeness)
- **cannon-es** (https://github.com/pmndrs/cannon-es): pure-JS, lightweight, great for primitive-shape worlds; **but trimesh-vs-trimesh does not collide** and trimesh is weak/slow → not for concave level collision. Maintenance slowed (~2022). R3F: `@react-three/cannon`.
- **Ammo.js** (https://github.com/kripken/ammo.js): full Bullet (soft bodies, robust concave `btBvhTriangleMeshShape`, vehicles) but legacy Bullet 2.82-era, heavy, awkward manual-memory API, under-maintained. Most new web projects pick Rapier.

## Decisions for NEON BREACH
- **Player controller:** capsule, kinematic. Prototype both (three-mesh-bvh shapecast vs Rapier `KinematicCharacterController`) in the architecture spike; pick by feel + determinism needs. Default lean: three-mesh-bvh for movement + hitscan, Rapier for any dynamic reactions.
- **Level collision:** one simplified, position-only, watertight collision mesh, built once (off critical path / worker if large). Keep separate from the render mesh.
- **Bullets:** hitscan via BVH `raycastFirst` (+ enemy hitboxes); projectiles (grenades) via Rapier dynamic bodies if/when added.
- **Substep** fast motion; treat `normal.y > ~0.15` as ground.

### Sources
three-mesh-bvh repo + characterMovement.js; rapier.rs JS user guides (colliders, character_controller, rigid_bodies) + rapier.js testbed `characterController.ts` + CHANGELOG; three.js `games_fps.html`; cannon-es repo + Trimesh docs + trimesh-vs-trimesh issue; ammo.js repo; threejs discourse threads on BVH vs Rapier and cheap FPS collision; Codrops Three.js optimization (2025).
