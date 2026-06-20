# ADR 0001 — Character Controller Selection

**Date:** 2026-06-20
**Status:** Accepted
**Task:** T-101

---

## Context

NEON BREACH needs a kinematic character controller (capsule) that can resolve the player
against the static level geometry: slide along walls, step up small ledges, snap to ground,
and apply gravity. Three options were prototyped/evaluated:

### Option A — three-mesh-bvh

A capsule resolved against a merged Triangle BVH using `shapecast` pushout. Triangle-accurate,
no WASM, lightweight. Used in the official three.js `games_fps` example and the `BVHEcctrl`
controller.

**Constraint violation:** `three-mesh-bvh` depends on `three` (`THREE.BufferGeometry`,
`THREE.Mesh`, `Vector3`, etc.). Importing it anywhere inside `src/sim/**` **immediately
violates the hard architectural rule** that `src/sim` must import nothing from `three`,
the DOM, or Web Audio. The ESLint `no-restricted-imports` rule would block it at lint time.
Even extracting the math would require reimplementing the BVH from scratch, at which point
you are no longer using the library.

**Decision: DISQUALIFIED for the authoritative sim.**

(three-mesh-bvh remains available in `src/presentation` for cosmetic queries such as bullet
impact sparks against the visual mesh.)

### Option B — Rapier `KinematicCharacterController`

`@dimforge/rapier3d-compat` provides a `KinematicCharacterController` with auto-stair-step,
snap-to-ground, and slope limits. It has a deterministic Node.js WASM build, making it
viable for headless replay tests in principle.

**Concerns:**

1. **Async WASM init:** every headless test must `await RAPIER.init()` before any sim code
   runs. This complicates the synchronous `createWorld()` / `step()` contract, requires
   Vitest async test setup boilerplate, and makes the sim non-trivially harder to reason
   about.

2. **WASM determinism risk:** Rapier advertises cross-platform determinism, but it depends
   on the exact WASM binary version shipping with `@dimforge/rapier3d-compat`. Any patch
   update can silently change the physics output, breaking all golden-hash pins without a
   clear signal. This is a persistent maintenance burden.

3. **Heavyweight for the task:** the player controller only needs collision against simple
   axis-aligned box colliders derived from the level descriptor. Pulling in ~1.9 MB of
   embedded WASM for what is, structurally, a capsule-vs-AABB pushout is disproportionate.

4. **Deferred use case is a better fit:** the task description (and `ARCHITECTURE.md §5`)
   notes that Rapier is the right tool for *dynamic* reactions — ragdolls, debris, vehicles
   (T-501). Those are not authoritative gameplay state in the same way as the player
   position; they can live in `src/presentation` where WASM and async init are fine.

**Decision: DEFERRED — use in `src/presentation` for cosmetic dynamic bodies; not in sim.**

### Option C — Pure-TypeScript kinematic capsule vs AABB colliders (CHOSEN)

A self-contained, dependency-free kinematic capsule controller resolved against simplified
axis-aligned box (AABB) colliders derived from the level descriptor. All math is pure
TypeScript: `src/sim/physics/characterController.ts` + `src/sim/levels/`.

**Why this wins against the constraints:**

| Constraint | three-mesh-bvh | Rapier | Pure-TS AABB |
|---|---|---|---|
| No `three` import in `src/sim` | FAIL | pass | pass |
| Synchronous (no `await` in sim) | pass | FAIL | pass |
| Deterministic headless Node tests | pass | risky (WASM versions) | pass (pure math) |
| Bundle size | +three (huge if not tree-shaken) | +1.9 MB WASM | +0 (pure TS) |
| Fast for primitive-box levels | fast | fast | fast |
| Supports step-up, slide, snap | via shapecast | built-in | implemented here |

The level descriptor (`LevelDescriptor`) stores box colliders as `{center, half}` AABBs.
The capsule-vs-AABB algorithm (narrow-phase: find the closest point on the AABB surface to
the capsule axis, push out by `radius - distance`) handles all needed cases: wall slide
(decompose penetration into horizontal normal, apply), step-up (if horizontal push would
occur and there is clearance above, translate up to stepHeight), and ground snap
(keep `onGround` state and clamp falling velocity).

## Decision

Use a **pure-TypeScript kinematic capsule controller** (`src/sim/physics/characterController.ts`)
resolved against **AABB box colliders** from the level descriptor (`src/sim/levels/`).

- Rapier stays available for `src/presentation` cosmetic dynamics (debris, ragdolls, vehicles).
- three-mesh-bvh stays available for `src/presentation` visual queries.
- The authoritative sim physics path has zero WASM and zero `three` dependency.

## Consequences

- **Level collision is approximate** (AABBs from the descriptor, not per-triangle). This is
  intentional: it is the standard pattern for authoritative game servers (simplified collision
  vs visual mesh). Ramps and curved surfaces are approximated by multiple boxes — fine for the
  target game type.
- **Triangle-accurate hitscan** (for bullet hit detection) can use three-mesh-bvh in the
  presentation layer and server-reconcile with the simplified colliders. This is the
  industry-standard "simple auth + rich client" split.
- **Movement params** (gravity, accel, friction, speed) come from `research/03 §7`:
  maxRunSpeed ~6 m/s, groundAccel 50–90, friction 6–10, gravity 18–25 m/s².
- Two golden hashes pin the two movement paths:
  - `tests/replay/determinism.test.ts` exercises the **flat-ground fallback** path
    (`createWorld(seed)` with no level). Its golden was re-baselined `968e8e8b → b9debaa4`
    because `DEFAULT_SETTINGS.moveSpeed` (7→6) and `jumpSpeed` (7→6.3) were tuned to
    research/03 §7 — those settings feed the fallback path. (The capsule controller is NOT
    exercised by this scenario.)
  - `tests/replay/capsulePhysics.test.ts` pins the **capsule-vs-AABB** path (golden
    `2be1af91`), which IS the path used when a level is loaded.
  Both re-baselines are deliberate, reviewed behavior changes.
