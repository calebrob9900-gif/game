# 10 — Architecture for a Browser FPS (TypeScript / Three.js)

> Research date: **June 2026**. Audience: engine architects building a scalable browser FPS.
> Scope: ECS vs OOP, game-loop design, module breakdown, physics engine choice + integration,
> determinism/testability, and a proposed source tree.
>
> Current repo context: prototypes are plain Three.js (r137 via CDN globals) with a tiny shared
> `engine.js`. This document proposes the architecture for the polished "big build," which should
> migrate to a bundled TypeScript project (Vite + npm packages) rather than CDN script tags.

---

## TL;DR — Recommendations

- **ECS:** Use **miniplex** as the primary entity manager for gameplay (best DX, plain-object
  entities, great TS + optional React bindings). Keep **bitECS** in your back pocket *only* if
  profiling later shows you need raw iteration throughput on hot systems (it is ~3x faster on
  packed iteration but far more boilerplate and id-based). Do **not** start with becsy
  (multithreaded, niche, lowest adoption).
- **Game loop:** **Fixed timestep** for the simulation (60 Hz / `dt = 1/60`) with an
  **accumulator**, **decoupled** from a variable-rate render that **interpolates** between the two
  most recent sim states using an `alpha` factor. Clamp the accumulator to avoid the "spiral of
  death."
- **Physics:** Use **Rapier** (`@dimforge/rapier3d`) — fastest WASM engine, first-class
  **kinematic character controller** (autostep, slopes, snap-to-ground), good raycast/shapecast
  API, and a **cross-platform-deterministic build** (`@dimforge/rapier3d-deterministic`) that is
  decisive for testing + future netcode. Jolt is the runner-up (more features); Cannon-es only for
  throwaway prototypes.
- **Structure:** Hard split between **simulation** (deterministic, headless-runnable, no Three.js)
  and **presentation** (Three.js renderer, audio, HUD). Communicate via an **event/message bus**
  and a read-only snapshot of sim state.
- **Determinism/testability:** Seeded RNG, fixed dt, deterministic Rapier build, input-driven sim,
  and a "no DOM/WebGL imports in the sim package" rule. This lets the whole sim run under Node/Vitest
  headlessly and replay from recorded inputs.

---

## 1. Architecture pattern: ECS vs OOP / scene-graph

### The decision

A 3D FPS has many entities (projectiles, enemies, pickups, particles, decals) that share
behaviour in cross-cutting ways (anything with `Health`, anything with `Velocity`,
anything `Damageable`). Classic OOP inheritance (`Entity → Character → Enemy → Grunt`) produces
brittle deep hierarchies and the "diamond"/"where do I put behaviour X" problem. **ECS** (composition
over inheritance) is the better fit for the *simulation*, while Three.js's **scene graph stays as a
pure presentation concern** — it is a transform hierarchy for rendering, not a place to hang game
logic. ([Web Game Dev — ECS](https://www.webgamedev.com/code-architecture/ecs))

Recommended hybrid:

- **Simulation = ECS.** Entities are data (Transform, Velocity, Health, Weapon, AIState…); systems
  are functions that run each fixed tick.
- **Presentation = scene graph.** A `RenderSync` system copies/interpolates ECS transforms onto
  `THREE.Object3D`s. The scene graph never owns gameplay state.

### JS/TS ECS library comparison

| Library | Model | Perf (packed iter, op/s)¹ | DX / ergonomics | TS | Notes |
|---|---|---|---|---|---|
| **bitECS** | Data-oriented, SoA typed arrays, integer entity ids | ~335k (very high) | Low-level; ids not objects; more boilerplate; manual component stores | First-class | ~5kb, zero deps, MPL-2.0, battle-tested (Mozilla Hubs, Third Room). Built-in serialization for networking/workers. ([bitECS](https://github.com/NateTheGreatt/bitECS)) |
| **miniplex** | Object-based; entities are plain JS objects, components are properties | ~109k (good) | **Highest**; `world.with(...)`/`without(...)` archetype queries; direct property mutation; optional React bindings | First-class, type-inferred | No built-in scheduler — you call systems from your own loop (a *feature* for a custom loop). MIT. ([miniplex](https://github.com/hmans/miniplex)) |
| **becsy** | Multithreaded (SharedArrayBuffer), inspired by ECSY+bitecs | ~103k | Medium; decorator-heavy | First-class | Goal: 10x ECSY single-thread, beat bitecs when *parallelizable*. Lowest adoption (~270★). Multithreading rarely pays off in a browser sim. ([becsy](https://lastolivegames.github.io/becsy/guide/introduction)) |

¹ Order-of-magnitude figures from the noctjs ECS benchmark; SoA libs (wolf-ecs/piecs/bitecs) lead
on iteration, object-based libs (miniplex/javelin) trade throughput for ergonomics.
([noctjs/ecs-benchmark](https://github.com/noctjs/ecs-benchmark),
[npm trends](https://npmtrends.com/@javelin/ecs-vs-@lastolivegames/becsy-vs-bitecs-vs-ecsy-vs-miniplex-vs-tick-knock))

### Recommendation: **miniplex**, with a clean system abstraction

For an FPS the entity counts (hundreds, not 100k) sit comfortably inside miniplex's performance
envelope, and developer velocity dominates at this stage. Plain-object entities make debugging,
serialization for save/load, and writing tests dramatically easier than bitECS's id+typed-array
model. ([miniplex 2.0](https://www.hmans.dev/posts/miniplex-2-beta/),
[Simplifying R3F with ECS](https://douges.dev/blog/simplifying-r3f-with-ecs))

**Hedge against perf risk:** miniplex has no built-in scheduler, so define your *own* tiny
`System` interface (`{ name, update(world, dt) }`) and a `SystemRunner`. Systems consume queries,
not the library directly. If a single hot system (e.g. 10k particles) ever needs SoA speed, you can
swap that *one* system to bitECS-backed storage without touching the rest. Don't pick becsy unless
you have a proven parallelizable bottleneck — browser multithreading (workers + SharedArrayBuffer)
adds COOP/COEP header friction for little gain at FPS scale.

---

## 2. Game loop: fixed timestep, decoupled render, interpolation, determinism

### The pattern (canonical: Gaffer "Fix Your Timestep!", Game Programming Patterns)

Run the **simulation at a fixed `dt`** (recommended `1/60 s`) and **render at the display refresh
rate** (variable, via `requestAnimationFrame`). An **accumulator** soaks up real elapsed time and
the sim steps in fixed chunks until caught up; the render interpolates between the previous and
current sim state by `alpha = accumulator / dt`. This gives stable physics, framerate-independent
gameplay, and determinism (same inputs ⇒ same state), which is the foundation for replay and netcode.
([Gaffer — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/),
[Game Programming Patterns — Game Loop](https://gameprogrammingpatterns.com/game-loop.html))

```ts
const FIXED_DT = 1 / 60;          // simulation step (seconds)
const MAX_FRAME = 0.25;           // clamp: never simulate > 0.25s of catch-up at once
let accumulator = 0;
let last = performance.now() / 1000;

function frame(nowMs: number) {
  const now = nowMs / 1000;
  let frameTime = now - last;
  last = now;
  if (frameTime > MAX_FRAME) frameTime = MAX_FRAME;  // avoid the "spiral of death"
  accumulator += frameTime;

  input.beginFrame();                 // sample + buffer input for this batch of ticks
  while (accumulator >= FIXED_DT) {
    sim.fixedUpdate(FIXED_DT);        // deterministic: ECS systems + Rapier.step()
    accumulator -= FIXED_DT;
  }
  const alpha = accumulator / FIXED_DT;
  presentation.render(alpha);         // interpolate transforms, draw, variable rate
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Key points:

- **Spiral of death:** if a frame is slow, the inner `while` can run many sub-steps, making the
  next frame slower still. Clamp `frameTime` (e.g. 0.25 s) so the sim "slows down" gracefully under
  load instead of locking up. ([Gaffer](https://gafferongames.com/post/fix_your_timestep/))
- **Interpolation:** store `prevTransform` and `currTransform` per renderable; render at
  `lerp(prev, curr, alpha)` (and `slerp` for rotations). This decouples smooth visuals from the
  60 Hz sim. ([Gaffer](https://gafferongames.com/post/fix_your_timestep/))
- **Input buffering:** sample input once per render frame but apply it deterministically inside each
  fixed tick (store the input frame the tick consumes). Mouse-look can be applied per render frame
  for responsiveness, but anything affecting the *sim* (firing, movement intent) must go through the
  fixed tick.
- **Seeded RNG:** never call `Math.random()` in the sim. Use a small seedable PRNG
  (e.g. `mulberry32` / `sfc32` / `xoshiro128**`) instantiated from a level seed, stored in sim state.
  Same seed + same input ⇒ identical run. ([yal.cc — deterministic netcode](https://yal.cc/preparing-your-game-for-deterministic-netcode/),
  [HN — deterministic models](https://news.ycombinator.com/item?id=11584128))

This design pays forward into **lockstep/rollback netcode**: both architectures *require* a
deterministic, input-driven, fixed-step sim. ([SnapNet — Lockstep](https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/),
[Easel — Rollback explained](https://easel.games/docs/learn/multiplayer/rollback-netcode),
[Ruoyu Sun — Deterministic networking](https://ruoyusun.com/2019/03/29/game-networking-2.html))

---

## 3. Code structure for a 3D FPS

### Core principle: Simulation ⟂ Presentation

The single most important architectural rule: **the simulation has no dependency on Three.js, the
DOM, WebAudio, or `window`.** The simulation is a pure, deterministic, fixed-step state machine
driven by input. The presentation layer *reads* sim state and renders it. They talk through an
**event/message bus** + a read-only state snapshot. This mirrors the proven "engine completely
separated from the view, single state interface" layering used in production Three.js apps.
([Three.js code organization](https://moldstud.com/articles/p-threejs-code-organization-how-to-create-a-maintainable-framework-for-your-3d-projects),
[three-fps example](https://github.com/mohsenheydari/three-fps),
[ThreeJS_FPS_2.0](https://github.com/Footprintarts/ThreeJS_FPS_2.0))

```
        Input  ─────────────▶  [ SIMULATION ]  ◀── deterministic, headless-capable
                                   │  emits events + exposes snapshot
                                   ▼
                              [ EVENT BUS ]
                                   │
                                   ▼
                            [ PRESENTATION ]  ── Three.js render, audio, HUD, VFX
```

### Module breakdown & responsibilities

**Simulation side (no Three.js):**

| Module | Responsibility |
|---|---|
| **`core`** | ECS world, `System`/`SystemRunner`, fixed-step clock, seeded RNG, event bus, component registry. The deterministic kernel. |
| **`input`** | Maps raw device events into an abstract `InputFrame` (move vector, look delta, action bitset). The sim consumes `InputFrame`, never DOM events. |
| **`physics`** | Rapier world wrapper: rigid bodies, colliders, character controller, raycasts/shapecasts. Stepped once per fixed tick. Exposes results as components. |
| **`weapons`** | Fire logic, hitscan (raycast) + projectiles, ammo/reload state, recoil pattern, damage application. Pure data + systems. |
| **`ai`** | Enemy perception, navigation/steering, behaviour (FSM/behaviour-tree), target selection. Deterministic; uses seeded RNG. |
| **`gamestate`** | Match/round state, scoring, spawn logic, win/lose, difficulty. The high-level rules. |
| **`levels`** | Level definition (geometry refs, spawn points, triggers, navmesh refs) as data; loads into the ECS world. |

**Presentation side (Three.js / browser):**

| Module | Responsibility |
|---|---|
| **`rendering`** | Three.js renderer, scene graph, cameras, lights, materials, post-processing, `RenderSync` (interpolated transform copy from ECS → `Object3D`). |
| **`audio`** | WebAudio: SFX (3D positional), music, mixing. Driven by sim events (e.g. `WeaponFired`, `EnemyHit`). |
| **`ui` / `hud`** | Crosshair, ammo/health, minimap, menus, pause, settings. Reads snapshot/events; ideally React/Zustand-isolated so it never touches the render loop. ([R3F + Zustand layering](https://dev.classmethod.jp/en/articles/nextjs-threejs-browser-fps-on-vercel/)) |
| **`assets`** | Loading + caching of GLTF/GLB (Draco), KTX2 textures, audio. `LoadingManager` for progress; loading screens. |
| **`vfx`** | Muzzle flashes, tracers, decals, particles, hit markers — driven by sim events. |

**Cross-cutting:**

| Module | Responsibility |
|---|---|
| **`events`** | Typed event bus (e.g. `EntityDamaged`, `EntityKilled`, `WeaponFired`, `LevelLoaded`). Decouples producers/consumers; sim emits, presentation listens. |
| **`config`** | Tunable data (weapon stats, movement constants, enemy stats) as data files, not hardcoded — drives content scalability. |
| **`save`** | Serialize/deserialize sim state (miniplex plain objects help here). |

### Event / message system

Use a **typed event bus** for sim→presentation signals (fire-and-forget: play this sound, spawn
this VFX) and **commands** for input→sim. Keep events *descriptive of what happened* in the sim
(`EnemyKilled { id, position, weapon }`), so the presentation can react (sound + ragdoll + score
popup) without the sim knowing those systems exist. This is the proven decoupling pattern for
keeping Three.js code out of game logic.
([Three.js code organization](https://moldstud.com/articles/p-threejs-code-organization-how-to-create-a-maintainable-framework-for-your-3d-projects))

---

## 4. Physics for a web FPS

### Comparison

| Engine | Lang / runtime | Perf | Character controller | Determinism | Maintenance | Verdict |
|---|---|---|---|---|---|---|
| **Rapier** (`@dimforge/rapier3d`) | Rust → WASM | **Highest** in browser; large gains in recent versions | **Built-in kinematic char controller** (autostep, slopes, snap-to-ground), good raycast/shapecast | **Cross-platform deterministic build** available (`-deterministic` package) | Active (Dimforge) | **Recommended** |
| **Jolt** (`jolt-physics` / JoltPhysics.js) | C++ → WASM | High; engine behind Horizon Forbidden West / Death Stranding 2 | `CharacterVirtual` (with deterministic CharacterID); R3F/Babylon integrations | Designed for deterministic client/server use | Active (jrouwe) | Strong runner-up; more features (cloth, vehicles, soft bodies) |
| **Cannon-es** | Pure JS | Lower | Manual / community controllers | Not a focus | Maintained fork of cannon.js | Prototypes/learning only |
| **Ammo.js** (Bullet) | C++ → WASM | Mid | Manual | Not a focus | Stale | Avoid for new work |

Sources: [Rapier homepage](https://rapier.rs/),
[rapier.js bindings](https://github.com/dimforge/rapier.js/),
[Rapier determinism](https://rapier.rs/docs/user_guides/rust/determinism/),
[Rapier JS character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/),
[Cannon vs Rapier perf thread](https://discourse.threejs.org/t/rapier-vs-cannon-performance/53475),
[JoltPhysics](https://github.com/jrouwe/JoltPhysics),
[JoltPhysics.js releases](https://github.com/jrouwe/JoltPhysics.js/releases),
[Web games physics overview](https://app.cinevva.com/tutorials/game-physics-libraries.html).

### Recommendation: **Rapier**

Three reasons it wins for *this* project specifically:

1. **Kinematic character controller is built in.** Rapier's controller automatically emits the
   ray-casts/shape-casts needed to slide along walls, step up stairs (autostep), handle max slope
   angles, and snap to ground. You feed it a desired translation; it returns a corrected,
   collision-resolved movement. Recommended collider shape for the player is a **capsule** (or
   cuboid/ball) for stability and performance.
   ([Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/))
2. **Determinism is a shipped feature.** `@dimforge/rapier3d-deterministic` guarantees
   cross-platform-deterministic stepping (at the cost of SIMD/parallel optimizations) on any
   IEEE-754-2008-compliant target, which includes WASM. Use the deterministic build for the sim/test
   pipeline; you may use the SIMD build for single-player perf if you don't need bit-exact replay
   yet. This directly serves Goals 2 & 6. ([Rapier determinism](https://rapier.rs/docs/user_guides/rust/determinism/))
3. **Performance.** Consistently the fastest WASM option in browser benchmarks/threads.

### Integration with Three.js (Rapier)

- **One-time:** `await RAPIER.init()` (loads WASM), create `world = new RAPIER.World(gravity)`.
- **Bodies/colliders:**
  - **Static level geometry:** fixed rigid bodies with **trimesh** (or convex-decomposed) colliders.
  - **Player:** a **kinematic position-based** rigid body + **capsule** collider, driven by
    Rapier's `KinematicCharacterController`. Each fixed tick: compute desired movement (input +
    gravity), call `controller.computeColliderMovement(collider, desired)`, read
    `controller.computedMovement()`, and `body.setNextKinematicTranslation(pos + movement)`.
  - **Projectiles/physics props:** dynamic rigid bodies; or pure raycast hitscan via
    `world.castRay(...)` / `castShape(...)` for instant weapons.
- **Stepping:** call `world.step()` **once per fixed tick** (inside `fixedUpdate`, *not* per render
  frame) so physics stays deterministic and framerate-independent.
- **Render sync:** the simulation stores Rapier body transforms as ECS `Transform` components.
  The presentation's `RenderSync` system interpolates `prev`→`curr` by `alpha` and writes onto
  `THREE.Object3D.position/quaternion`. **Three.js never reads Rapier directly** — keeps the sim
  swappable and headless-testable.
  ([Rapier kinematic char example](https://github.com/doppl3r/kinematic-character-controller-example),
  [Integrating Rapier with Three.js](https://medium.com/javascript-alliance/integrating-physics-in-three-js-with-rapier-a-complete-guide-55620630621c))

> Because Rapier is WASM, keep its world *inside* the simulation package. The deterministic build
> runs under Node, so the physics step is exercisable in headless tests too.

---

## 5. State, save/load, levels/scenes, asset streaming, scalability

### Game/UI state management

- **Sim state** lives in the ECS world (authoritative). It is the only source of truth for gameplay.
- **UI state** (menus, settings, HUD-only flags) lives in a lightweight store (**Zustand**-style),
  kept *out* of the render loop. The recommended layering for R3F-style apps is: engine fully
  separated, a single state store as the interface between engine and UI, so React re-renders never
  interfere with the game loop. ([R3F + Zustand layering](https://dev.classmethod.jp/en/articles/nextjs-threejs-browser-fps-on-vercel/))
- A small **`GameStateMachine`** (boot → menu → loading → playing → paused → results) gates which
  systems run.

### Save/load

- miniplex entities are **plain objects**, so serialization is straightforward: snapshot the world
  (filter to persistent components), plus the **RNG seed + tick count** so a save can be replayed
  deterministically. Physics state for dynamic bodies can be reconstructed from sim components.
- Keep a **schema/version** field for forward-compat as content grows.

### Level / scene management

- Represent levels as **data** (JSON/asset manifest): geometry references, spawn points, triggers,
  pickups, navmesh reference, lighting/skybox config. A `LevelLoader` reads the manifest, loads
  assets, and instantiates ECS entities. This keeps "adding a level" a *content* task, not a code
  task.
- One active level at a time for an FPS; a `SceneManager` handles teardown (dispose Three.js
  geometries/materials/textures, drop Rapier colliders, clear the ECS world) before loading the next
  to avoid GPU/WASM memory leaks.

### Asset streaming & loading screens

- **Formats:** GLB with **Draco** mesh compression and **KTX2/Basis** GPU-compressed textures —
  smaller downloads + lower VRAM. Wire `DRACOLoader` and `KTX2Loader` into `GLTFLoader`
  (`setDRACOLoader`, `setKTX2Loader` + `detectSupport(renderer)`); reuse a single `DRACOLoader`
  instance. ([GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),
  [DRACOLoader](https://threejs.org/docs/pages/DRACOLoader.html))
- **Progress / loading screen:** drive a `THREE.LoadingManager` (`onStart`/`onProgress`/`onLoad`/
  `onError`) to show a progress bar and gate the transition into `playing`.
- **Streaming/scalability:** group assets per level into a manifest; preload the current level's
  required set, lazy-load optional/cosmetic assets; cache decoded assets so revisits are instant.
- **Production:** vendor Three.js + Rapier WASM into the bundle (Vite) instead of CDN globals — the
  current prototypes load Three r137 from unpkg, which is fine for prototypes but not for a shippable,
  offline-capable build.

### Content scalability

- Weapons/enemies/levels defined by **data** (config tables) + small reusable systems, so adding a
  weapon = a stats entry + (maybe) a component flag, not new branching code.
- Component registry + typed events make new features additive.

---

## 6. Determinism & testability (headless)

**Goal:** run the entire simulation under Node/Vitest with no browser, no WebGL, no DOM — so logic
is unit/integration-testable and runs can be replayed bit-for-bit.

Rules that make this true:

1. **Package boundary = test boundary.** The `sim` package imports *nothing* from Three.js, the DOM,
   or WebAudio. Enforce with an ESLint `no-restricted-imports` rule + a CI check. Presentation depends
   on sim; never the reverse.
2. **Fixed `dt` only.** The sim never reads wall-clock time; it advances by `FIXED_DT` per tick. Tests
   advance N ticks deterministically.
3. **Seeded RNG.** All randomness from a seeded PRNG stored in sim state (seed persisted in saves).
   No `Math.random()`, no `Date.now()` in the sim.
   ([yal.cc](https://yal.cc/preparing-your-game-for-deterministic-netcode/))
4. **Input-driven.** The sim's only external input is the `InputFrame` stream. Record input frames
   to replay an entire match; a "golden" test = (seed + recorded inputs) ⇒ expected final state
   hash.
5. **Deterministic physics.** Use `@dimforge/rapier3d-deterministic`, which steps identically across
   platforms/WASM and runs under Node. ([Rapier determinism](https://rapier.rs/docs/user_guides/rust/determinism/))
6. **State hashing.** Provide `hashWorld()` (e.g. a stable hash over sorted component values) so
   tests assert state equality cheaply and replay/desync detection becomes trivial — the same
   mechanism netcode uses to detect divergence.
   ([SnapNet — Lockstep](https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/))

What this buys you: fast CI unit tests per system, full-match replay tests, deterministic bug repro,
and a sim that is **already netcode-ready** (lockstep or rollback) without re-architecting.
([Ruoyu Sun — Deterministic networking](https://ruoyusun.com/2019/03/29/game-networking-2.html),
[Easel — Rollback](https://easel.games/docs/learn/multiplayer/rollback-netcode))

> Note on floating point: bit-exact determinism across *different* CPUs is genuinely hard in general
> (compilers/transcendentals differ), which is why we lean on Rapier's deterministic build and avoid
> rolling our own float-heavy math where a tested deterministic path exists. Within a single
> platform (the browser/WASM target you ship), the above rules give reliable replay.
> ([yal.cc](https://yal.cc/preparing-your-game-for-deterministic-netcode/))

---

## 7. Proposed source-tree layout

```
game/
├─ index.html
├─ vite.config.ts
├─ package.json
├─ tsconfig.json
├─ public/
│  ├─ assets/                 # glb (draco), ktx2 textures, audio, manifests
│  └─ levels/                 # level manifests (json data)
├─ src/
│  ├─ main.ts                 # bootstrap: init WASM, build sim + presentation, start loop
│  │
│  ├─ sim/                    # ── SIMULATION (deterministic, NO three.js/DOM) ──
│  │  ├─ core/
│  │  │  ├─ world.ts          # miniplex world + component types
│  │  │  ├─ system.ts         # System interface + SystemRunner (scheduler)
│  │  │  ├─ clock.ts          # fixed-step accumulator clock
│  │  │  ├─ rng.ts            # seeded PRNG (mulberry32/sfc32)
│  │  │  ├─ events.ts         # typed event bus
│  │  │  └─ hash.ts           # hashWorld() for tests/desync detection
│  │  ├─ components/          # Transform, Velocity, Health, Weapon, AIState, Collider…
│  │  ├─ physics/             # Rapier wrapper (deterministic build), char controller, raycasts
│  │  ├─ systems/
│  │  │  ├─ movement.ts       ├─ weapons.ts      ├─ damage.ts
│  │  │  ├─ ai.ts             ├─ projectiles.ts  └─ spawn.ts
│  │  ├─ input/               # InputFrame type + command mapping (no DOM here)
│  │  ├─ weapons/             # weapon definitions/data + fire logic
│  │  ├─ ai/                  # FSM / behaviour-tree, steering
│  │  ├─ gamestate/           # match/round rules, scoring, state machine
│  │  ├─ levels/              # LevelLoader: manifest → entities
│  │  └─ save/                # snapshot/restore (+ seed + tick)
│  │
│  ├─ presentation/           # ── PRESENTATION (browser, three.js) ──
│  │  ├─ rendering/
│  │  │  ├─ renderer.ts       # WebGLRenderer, scene, cameras, lights, postFX
│  │  │  └─ renderSync.ts     # interpolate ECS Transform (prev→curr by alpha) → Object3D
│  │  ├─ audio/               # WebAudio, positional SFX, music (listens to sim events)
│  │  ├─ vfx/                 # muzzle flash, tracers, decals, particles, hit markers
│  │  ├─ assets/              # GLTF/Draco/KTX2 loaders, LoadingManager, cache
│  │  ├─ input/               # DOM/pointer-lock capture → InputFrame
│  │  ├─ ui/                  # HUD, menus, settings (React/Zustand, isolated from loop)
│  │  └─ sceneManager.ts      # load/teardown level presentation + dispose GPU resources
│  │
│  ├─ app/
│  │  ├─ loop.ts              # fixed-step loop wiring sim.fixedUpdate + presentation.render(alpha)
│  │  └─ store.ts             # UI state store (Zustand)
│  └─ shared/                 # config tables, math utils, types shared sim↔presentation
│
└─ tests/                     # Vitest (Node, headless)
   ├─ systems/                # per-system unit tests
   ├─ replays/                # (seed + recorded inputs) → expected hashWorld()
   └─ fixtures/
```

**Dependency direction (enforced):** `presentation → sim` and `app → {sim, presentation}`. Never
`sim → presentation`. Lint-enforced + CI-checked so the headless property can't silently rot.

---

## 8. Summary of decisions

| Concern | Decision |
|---|---|
| Architecture | ECS for sim (composition), Three.js scene graph for presentation only |
| ECS library | **miniplex** (DX), custom System/SystemRunner; bitECS reserved for hot-path swap |
| Game loop | Fixed 60 Hz sim + accumulator, decoupled variable render, `alpha` interpolation, clamp |
| Determinism | Fixed dt, seeded RNG, input-driven, deterministic Rapier build, state hashing |
| Physics | **Rapier** (`-deterministic` build), kinematic capsule char controller, step per fixed tick |
| Sim↔Presentation | Hard package split + typed event bus + read-only snapshot; sim has no Three.js/DOM |
| Assets | GLB+Draco, KTX2 textures, LoadingManager progress, per-level manifests, Vite-bundled |
| State/Save | ECS world authoritative; Zustand for UI; serialize plain objects + seed + tick |
| Testability | Whole sim runs under Node/Vitest; replay tests from recorded inputs |

---

## Sources

- Web Game Dev — ECS — https://www.webgamedev.com/code-architecture/ecs
- bitECS — https://github.com/NateTheGreatt/bitECS
- miniplex — https://github.com/hmans/miniplex ; 2.0 notes — https://www.hmans.dev/posts/miniplex-2-beta/
- becsy — https://lastolivegames.github.io/becsy/guide/introduction
- noctjs ECS benchmark — https://github.com/noctjs/ecs-benchmark
- npm trends (ECS libs) — https://npmtrends.com/@javelin/ecs-vs-@lastolivegames/becsy-vs-bitecs-vs-ecsy-vs-miniplex-vs-tick-knock
- Simplifying R3F with ECS — https://douges.dev/blog/simplifying-r3f-with-ecs
- Gaffer On Games — Fix Your Timestep! — https://gafferongames.com/post/fix_your_timestep/
- Game Programming Patterns — Game Loop — https://gameprogrammingpatterns.com/game-loop.html
- Rapier — https://rapier.rs/ ; JS bindings — https://github.com/dimforge/rapier.js/
- Rapier determinism — https://rapier.rs/docs/user_guides/rust/determinism/
- Rapier JS character controller — https://rapier.rs/docs/user_guides/javascript/character_controller/
- Rapier kinematic char example — https://github.com/doppl3r/kinematic-character-controller-example
- Integrating Rapier with Three.js — https://medium.com/javascript-alliance/integrating-physics-in-three-js-with-rapier-a-complete-guide-55620630621c
- Rapier vs Cannon perf thread — https://discourse.threejs.org/t/rapier-vs-cannon-performance/53475
- JoltPhysics — https://github.com/jrouwe/JoltPhysics ; JoltPhysics.js releases — https://github.com/jrouwe/JoltPhysics.js/releases
- Web games physics overview — https://app.cinevva.com/tutorials/game-physics-libraries.html
- three-fps example — https://github.com/mohsenheydari/three-fps ; ThreeJS_FPS_2.0 — https://github.com/Footprintarts/ThreeJS_FPS_2.0
- Three.js code organization — https://moldstud.com/articles/p-threejs-code-organization-how-to-create-a-maintainable-framework-for-your-3d-projects
- R3F + Zustand FPS layering — https://dev.classmethod.jp/en/articles/nextjs-threejs-browser-fps-on-vercel/
- GLTFLoader — https://threejs.org/docs/pages/GLTFLoader.html ; DRACOLoader — https://threejs.org/docs/pages/DRACOLoader.html
- Deterministic netcode prep — https://yal.cc/preparing-your-game-for-deterministic-netcode/
- SnapNet — Lockstep — https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/
- Easel — Rollback explained — https://easel.games/docs/learn/multiplayer/rollback-netcode
- Ruoyu Sun — Deterministic networking — https://ruoyusun.com/2019/03/29/game-networking-2.html
- HN — deterministic game models — https://news.ycombinator.com/item?id=11584128
</content>
</invoke>
