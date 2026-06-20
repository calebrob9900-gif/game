# NEON BREACH — Architecture

> Synthesizes `research/10` (architecture/ECS), `research/12` (physics/collision),
> `research/02` (rendering), `research/08` (netcode-readiness). The guiding principle:
> a **deterministic, headless-testable simulation** cleanly separated from presentation.

## 1. Core principle: simulation / presentation split

```
            input commands                 read-only snapshot + events
  ┌──────────────┐  ──────────────▶  ┌──────────────────┐  ──────────────▶  ┌──────────────┐
  │   INPUT       │                   │   SIMULATION      │                   │ PRESENTATION │
  │ (capture)     │                   │ (deterministic)   │                   │ (Three.js)   │
  └──────────────┘                   └──────────────────┘                   └──────────────┘
```

- **`src/sim/**`** imports **nothing** from `three`, the DOM, or Web Audio. It is a pure
  function of `(seed, settings, input-command stream)`. It runs unchanged under Node for tests
  and (later) on a server for multiplayer.
- **`src/presentation/**`** owns Three.js, audio, VFX, asset loading, input capture, and the
  HUD. It reads an immutable snapshot of sim state and reacts to a typed event bus. It **never**
  mutates sim state directly.
- A lint rule + CI check enforce the one-way dependency **presentation → sim** (never reverse).

Why: determinism → reproducible gameplay/perf/visual tests (record-and-replay state hashing),
framerate independence, and a netcode-ready core (the same `simulate()` runs on a server later).

## 2. Game loop (fixed timestep + interpolated render)

Canonical Gaffer "Fix Your Timestep" accumulator (`research/10`):
- Simulation runs at a **fixed 60 Hz** (`DT = 1/60`). Inputs are collected as **commands** and
  applied at tick boundaries.
- Render runs at the display's variable rate and **interpolates** between the two latest sim
  states via `alpha`.
- Clamp accumulated frame time (~0.25 s) to avoid the "spiral of death".
- Physics (`world.step()`) advances exactly once per fixed tick.

## 3. Determinism rules (non-negotiable)
- Fixed `DT`; stable system execution order.
- **Seeded PRNG** stored in sim state — no `Math.random()` / `Date.now()` anywhere in `sim`.
- Rapier built deterministically (`-deterministic`) and stepped at the fixed tick; or the
  three-mesh-bvh character math is pure.
- `hashWorld(state) → string` for assertions (positions/velocities/health/ammo/rng-cursor).
- All decay/lerp use `1 - exp(-lambda*dt)` (frame-rate independent), never raw `lerp(a,b,k)` with
  a per-frame constant.

## 4. Module breakdown

### Simulation (`src/sim/`)
- `core/` — ECS world (miniplex), fixed clock, seeded RNG, event bus, `hashWorld`, math.
- `physics/` — Rapier (or BVH) world, character controller, raycasts (hitscan), colliders.
- `input/` — command types + buffer (`MoveCmd`, `LookCmd`, `FireCmd`, `ReloadCmd`, `SwitchCmd`…).
- `weapons/` — data-driven weapon defs, fire/recoil/spread/reload state machines, damage/TTK.
- `combat/` — hit resolution, hitboxes, headshot/limb multipliers, penetration, damage events.
- `ai/` — Behavior Tree + blackboard + utility scorer, perception, navmesh queries, squad coord.
- `spawn/` — wave director (intensity pacing), spawn rules, enemy archetype factory.
- `gamestate/` — run state, score/economy, wave progression, win/lose.
- `levels/` — level descriptor loader (JSON schema), collision/spawn/cover data.
- `save/` — serialize plain-object entities + seed + tick.

### Presentation (`src/presentation/`)
- `rendering/` — renderer bootstrap (WebGPU→WebGL2 fallback), scene, cameras, lights/IBL/CSM,
  post-processing pipeline (bloom/GTAO/TAA/tonemap/LUT), materials, instancing/LOD/culling.
- `view/` — entity→Three.js object binding + interpolation (`RenderSync`).
- `audio/` — `AudioManager` (Howler + raw WebAudio), buses, listener sync, spatial sources,
  reverb zones, ducking, voice budget.
- `vfx/` — pooled muzzle flash, tracers, impact decals, particles, screenshake, hitstop.
- `assets/` — GLTF/Draco/Meshopt/KTX2 loaders, `LoadingManager`, asset manifest + license ledger.
- `input-capture/` — Pointer Lock, raw mouse, keybinds → emit sim commands.
- `ui/` — HUD (health/ammo/crosshair/wave/score), menus, settings, pause, game-over (DOM or
  in-canvas), kept out of the render hot loop.

### App (`src/app/`)
- bootstrap, the fixed-loop driver, the UI store (Zustand-style, isolated from render loop),
  the test-instrumentation contract (§6), scenario/seed boot params.

## 5. Physics decision (spike in Phase 0/1)
Two viable paths (`research/12`); prototype both, pick by feel + determinism:
- **A. three-mesh-bvh** — merge level into one position-only mesh + `MeshBVH`; player = capsule
  resolved by `shapecast` pushout; hitscan via `raycastFirst`. Lightest, no WASM, triangle-accurate.
- **B. Rapier** (`-compat`, `await RAPIER.init()`) — `KinematicCharacterController` (autostep,
  snap-to-ground, slope limits), trimesh static level (fixed body), dynamic bodies for
  grenades/ragdolls/debris; **deterministic Node build for tests**.
- Likely hybrid: BVH for static-level character + hitscan; Rapier for dynamic reactions.
  **Determinism for headless tests is the tie-breaker** → if BVH char math is kept pure, fine;
  otherwise prefer Rapier deterministic build.

## 6. Test instrumentation contract (stripped from production builds)
The game exposes (only in test/dev builds) on `window`:
- `__GAME_READY__: boolean` — readiness gate (avoids flaky timeouts).
- `__GAME_STATE__: () => Snapshot` — assert state, not pixels.
- `__perf: { sample(ms), stats() }` — FPS/frame-time probe for V5.
- `__pushCommand(cmd)` — inject deterministic input for E2E/replay.
- `__stepTo(tick)` — advance to a fixed tick + freeze for stable visual frames (V4).
- `?seed=<n>` / `?scenario=<name>` boot params for reproducible scenarios.

## 7. Source tree (target)
```
neon-breach/
├─ index.html
├─ package.json  vite.config.ts  tsconfig.json  .eslintrc  .prettierrc
├─ scripts/verify.sh            # the 5-verifier gate
├─ public/assets/               # optimized GLB/KTX2/audio (+ LICENSES.md ledger)
├─ src/
│  ├─ sim/  (core physics input weapons combat ai spawn gamestate levels save)
│  ├─ presentation/ (rendering view audio vfx assets input-capture ui)
│  └─ app/  (bootstrap loop store instrumentation)
├─ levels/                      # *.level.json descriptors
├─ tests/
│  ├─ unit/                     # Vitest
│  ├─ replay/                   # golden (seed+inputs)→state-hash
│  ├─ e2e/                      # Playwright behavioral
│  └─ visual/                   # Playwright snapshots (+ committed baselines)
├─ perf-budgets.json
└─ .github/workflows/ci.yml
```

## 8. Level data (data-driven)
A `*.level.json` descriptor is the source of truth (`research/11`): bounds, typed cover
(hard/soft, full/half) with positions/sizes, spawn volumes (min/max distance, max-alive cap),
holdout/objective points, lights, and a reference to an optional GLB for visuals. Collision is a
separate simplified `*_collider` mesh or primitive boxes derived from the descriptor.

## 9. Networking-readiness (deferred, but free if we follow the rules)
Because the sim is `simulate(state, command, dt)` with seeded RNG and fixed ticks, adding
multiplayer later is an extension, not a rewrite: wrap the sim behind a `Transport` interface,
run it authoritatively on a server, add client prediction + reconciliation + interpolation +
lag compensation (`research/08`). Do **not** build any of this in v1 — just don't violate the
determinism/split rules.
