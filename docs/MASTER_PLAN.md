# NEON BREACH — Master Plan

> The single source of truth for building a browser-based, headline-quality first-person
> shooter the right way. This document defines **what** we are building, **why**, the
> **tech**, the **roadmap**, and the **quality bar**. It is paired with:
> - `docs/TASKS.md` — the machine-checkable backlog the build executes against (the checklist `/goal` knocks off).
> - `docs/VERIFICATION.md` — how every build is objectively verified + the competitor rubric.
> - `docs/ARCHITECTURE.md` — the code architecture and source tree.
> - `docs/COMPETITORS.md` — the scoreable comparison vs headline shooters.
> - `docs/WORKFLOW.md` — how `/goal` + subagents + verification drive the whole build.
> - `docs/GOAL.md` — the exact goal prompt to start the build, and its completion condition.
> - `docs/research/01..14` — the underlying research (cited).

---

## 1. North Star

**Build the best-feeling first-person shooter that runs in a browser tab — a single-player,
round-based survival FPS with AAA-grade *game feel*, verified objectively against headline
shooters.**

We optimize for the dimensions the web can actually win (gunplay, movement, feedback/juice,
audio, performance — ~56–62% of the quality rubric in `research/01`) and are deliberate and
honest about the dimensions it cannot match 1:1 (photoreal AAA art, mocap, server-scale
netcode/anti-cheat). "Realistic as the headline shooters" is interpreted as **feel-and-systems
parity** plus the **highest visual fidelity the medium allows (WebGPU, console-quality
stylized realism)** — not pixel-for-pixel parity with a native 2026 flagship, which is not
physically reproducible in a single web app (see §3).

---

## 2. The honest ceiling (read this first)

From `research/01` and `research/02`:

- **Winnable on the web:** gunplay feel, movement, feedback/juice (VFX), audio, performance,
  AI believability, art *direction*. These are where we aim for parity with the best.
- **Bounded by the medium (aim high, accept a gap):** raw visual fidelity. WebGPU (cross-browser
  stable as of ~March 2026) credibly reaches **console-quality stylized realism (~late-PS4 era)**
  at 60fps in a tab, but not 1:1 with a native AAA flagship — constrained by ~2–4GB memory
  (far less on iOS), single-threaded JS, and download-size limits.
- **Out of scope for v1 (deliberate):** scaled server-authoritative multiplayer with anti-cheat.
  We architect so it can be added later without a rewrite (see `research/08`), but v1 ships
  single-player.

We will **not** claim "exact Call of Duty." We *will* produce a measurable, defensible score
against the headline-shooter rubric and push every winnable category to the top of the web class.

---

## 3. What we are building (v1 game definition)

**Title:** NEON BREACH
**Genre:** Single-player, round-based **wave-survival** FPS (CoD-Zombies / Killing-Floor lineage —
the mode that best fits a single-file→web build with no netcode; see `research/01`, `research/11`).
**Core loop:** Drop into an arena → survive escalating waves of AI that hunt you and **use cover
and shoot back** → earn score/currency on kills → spend between waves on weapons/ammo/upgrades →
survive as long as possible; leaderboard by wave + score.
**Player fantasy:** Precise, weighty, responsive gunplay; smart enemies; satisfying feedback.
**Platforms:** Desktop browsers first (Chrome/Edge/Firefox/Safari 26+), keyboard + mouse.
Mobile/touch is a non-goal for v1 (perf + controls).

### v1 feature set (the definition of "done enough to be great")
- Tight FPS controller: accel/friction movement, sprint, crouch, jump, slide, auto-mantle.
- Data-driven weapons (≥5: AR, SMG, shotgun, sniper, pistol) with two-layer recoil, first-shot
  accuracy + bloom, ADS (correct sens scaling), reload, ammo/reserve, weapon switching.
- Full combat juice: hitmarkers, headshots, trauma screenshake, hitstop, muzzle flash, tracers,
  impact decals/particles, layered spatial audio.
- Smart enemies: Behavior-Tree + utility AI, navmesh movement, perception/awareness states,
  cover use, flanking, ranged fire with line-of-sight, fair difficulty scaling; ≥4 archetypes.
- Wave director with intensity pacing (build→peak→fade→relax), spawn rules, between-wave economy.
- ≥3 maps built from modular CC0 kits (greybox→art pass), data-driven level descriptors.
- Real assets: Mixamo-animated enemy characters, first-person weapon viewmodels, PBR materials,
  HDRI lighting, KTX2/meshopt-optimized.
- Rendering: WebGPU (WebGL2 fallback), PBR + IBL + CSM shadows + post stack (bloom, GTAO, TAA,
  tonemap, color grade), GPU particles.
- HUD/menus: main menu, settings (sensitivity, graphics, audio, keybinds), pause, game-over,
  save of best run.
- Audio: spatial weapon/footstep/impact/enemy/ambient SFX + dynamic music + mix/ducking.
- Performance: 60fps desktop within budgets (`research/02`, `VERIFICATION.md`).

---

## 4. Tech stack (locked decisions)

Decisions synthesized from the research; rationale + source in parentheses.

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | Type safety, tooling, refactorability (`research/10`) |
| Bundler/dev | **Vite** | Fast dev/HMR, standard, CI-friendly (`research/07`) |
| Renderer | **Three.js — WebGPURenderer + TSL, WebGL2 fallback** | Largest ecosystem, WebGPU draw-call headroom, low-level control (`research/02`) |
| ECS | **miniplex** (escalate hot systems to **bitECS** if profiling demands) | Best DX, plain-object entities, FPS-scale (`research/10`) |
| Physics | **Rapier** (`@dimforge/rapier3d-compat`) deterministic build; **three-mesh-bvh** as the static-level/char-controller option — decided in the architecture spike | Deterministic Node build → headless tests + netcode-ready; BVH lighter for static-level capsule + hitscan (`research/10`, `research/12`) |
| Character controller | **Kinematic capsule** (Rapier `KinematicCharacterController` or three-mesh-bvh shapecast) | Crisp designed movement (`research/12`) |
| AI nav | **recast-navigation-js** (navmesh + crowd); **Yuka** for fast-start perception/steering | Mature WASM Recast/Detour; crowd fixes clumping (`research/04`) |
| AI decisions | **Behavior Tree + Blackboard + utility scorer** (hand-rolled BT core) | Proven AAA pattern, debuggable (`research/04`) |
| Audio | **Howler.js** + thin raw Web Audio layer (occlusion/reverb/ducking) | Cross-browser, HRTF spatial, pooling (`research/06`) |
| Assets | **GLB + meshopt + KTX2**; CC0 kits (Kenney/Quaternius/KayKit), Poly Haven/ambientCG textures/HDRIs, **Mixamo** anims | Commercial-safe, web-optimized (`research/05`, `research/13`, `research/14`) |
| Testing | **Vitest + fast-check** (logic/replay), **Playwright** (E2E + visual), perf probes + Lighthouse CI | Objective, automatable verification (`research/07`) |
| CI/CD | **GitHub Actions** → build/lint/test/perf gate → **GitHub Pages** deploy | One required `ci-passed` gate (`research/07`, `research/09`) |
| Multiplayer (deferred) | architect for it: pure `simulate(state, command, dt)`; later WebSocket→WebTransport + Colyseus | Pre-pay architecture, defer cost (`research/08`) |

**Determinism is foundational:** fixed-timestep simulation, seeded RNG, a hard
**simulation/presentation split** (the `sim` layer imports no Three.js/DOM/WebAudio), and a
`hashWorld()` for state assertions. This is what makes gameplay, performance, and visuals
**reproducible and machine-verifiable** rather than "feels right" (`research/07`, `research/10`).

---

## 5. Architecture (summary)

Full detail in `docs/ARCHITECTURE.md`. In brief:
- `src/sim/**` — deterministic, headless core (ECS, fixed clock, seeded RNG, events, physics
  step, weapons, AI, gamestate, levels). No rendering imports. Runs under Node for tests.
- `src/presentation/**` — Three.js rendering, audio, VFX, asset loading, input capture, HUD/UI.
  Reads a read-only snapshot of sim state via a typed event bus; never mutates sim directly.
- `src/app/` — bootstrap, game loop (fixed sim + interpolated render), store.
- `tests/` — Vitest unit + deterministic replay (golden state-hash) tests; Playwright E2E + visual.
- One-way dependency enforced by lint/CI: **presentation → sim** (never the reverse).

---

## 6. Quality bar & how we measure it

Full detail in `docs/VERIFICATION.md` + `docs/COMPETITORS.md`.
- **Five verifiers**, each one exit code, chained by `scripts/verify.sh` / `pnpm verify`:
  V1 static (eslint+prettier+tsc), V2 logic (Vitest + fast-check + deterministic replay hashes),
  V3 behavioral E2E (Playwright drives the real game, asserts `window.__GAME_STATE__`),
  V4 visual (Playwright frozen-frame snapshots), V5 performance (FPS/frame-time + Lighthouse +
  memory budgets). A build is "verified" iff **all five exit 0**.
- **Machine-checkable Definition of Done:** every task's acceptance criteria map to a command +
  threshold (`TASKS.md`). A task is done iff `verify.sh` is green **and** its own assertions pass.
- **Adversarial review:** a separate `reviewer` subagent (`/code-review`) reviews each task's diff
  so the builder never grades itself (`research/09`).
- **Competitor rubric:** scored 1–5 across 9 weighted criteria vs AAA (5.0) and best-web-FPS
  (~3.7) reference columns (`COMPETITORS.md`, `research/01`). Milestone target scores defined per
  phase; v1 exit target: **beat the best web FPS overall and approach AAA on the feel pillars.**

---

## 7. Roadmap (phases & exit criteria)

Each phase is a set of epics; each epic decomposes into checkbox tasks in `TASKS.md`. A phase is
complete only when all its tasks are checked **and** its exit gate passes.

### Phase 0 — Foundation & verification harness
Scaffolding (Vite/TS/lint), CI + Pages deploy, the 5-verifier `verify.sh`, deterministic engine
core (fixed loop, seeded RNG, miniplex, event bus, sim/presentation split, `hashWorld`), the
test-instrumentation contract (`__GAME_READY__`, `__GAME_STATE__`, `__perf`, `__pushCommand`,
`__stepTo`, `?seed/?scenario`), and a "hello cube" rendered + a passing replay test.
**Exit gate:** `verify.sh` green on an empty-but-real game; CI green; deployed to Pages.

### Phase 1 — Core FPS vertical slice (the feel)
Renderer bootstrap (WebGPU/WebGL2, PBR/IBL/tonemap/shadows); kinematic capsule controller +
movement; pointer-lock look with correct ADS sens scaling; data-driven weapon system (1 weapon
first) with two-layer recoil, bloom/first-shot accuracy, ADS, reload; full juice (hitmarkers,
screenshake, hitstop, muzzle/tracers/decals); one enemy + spawn + a basic wave loop; HUD; core
audio. Built on greybox "Arena 01".
**Exit gate:** a player can fight a wave and it *feels* good; gunplay/movement params match the
`research/03` spec; verifiers green incl. a replay test of a scripted firefight; rubric self-score
recorded.

### Phase 2 — AI & encounter depth
BT + blackboard + utility AI; navmesh (recast) + crowd; perception + awareness states + LKP;
combat behaviors (cover, peek-fire, flank, suppress, retreat, grenades); ≥4 enemy archetypes;
fair difficulty scaling; wave director with intensity pacing; player grenades + 1 killstreak.
**Exit gate:** enemies demonstrably path, take cover, flank, and shoot back with LOS; AI replay
tests pass; AI rubric criterion ≥ best-web baseline.

### Phase 3 — Content & fidelity
Asset pipeline (Blender→glTF→optimize); real animated enemy characters (Mixamo) + FP viewmodels;
≥5 tuned weapons; ≥3 maps (greybox→art); full post-processing realism stack; VFX + viewmodel/enemy
animation; dynamic music + full mix; economy/upgrades; menus/settings/keybinds/save.
**Exit gate:** content-complete v1; visual baselines committed; rubric fidelity + content criteria
hit phase targets.

### Phase 4 — Polish, performance, ship
Optimize to perf budgets (instancing, LOD, culling, KTX2, draw-call <100 target); UX/accessibility
polish; balance pass; full test coverage + visual baselines + perf gates green; final competitor
scoring; production deploy.
**Exit gate (v1 ship):** all `TASKS.md` checked; all 5 verifiers green; perf budgets met; overall
rubric score **> best-web-FPS reference and ≥ target on each feel pillar.**

### Phase 5 — Multiplayer (future / optional)
Transport interface → loopback "fake net" → authoritative WS server (30Hz sim/20Hz snapshot) +
prediction/reconciliation/interpolation/lag-comp → WebTransport upgrade + anti-cheat hardening
(`research/08`). Not required for v1 ship.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Ephemeral cloud container loses work | Commit + push after **every** task; progress fully re-derivable from `TASKS.md` + git; `SessionStart` hook reinstalls deps (`research/09`, `WORKFLOW.md`) |
| "Feel" is subjective / unverifiable | Encode params from `research/03`; deterministic replay tests + debug overlay; rubric self-scoring + adversarial review |
| Visual fidelity gap vs AAA | Honest scope (§2); art direction over photoreal; WebGPU + post stack; score fidelity against the *web* ceiling, not native |
| Perf regressions | Perf budgets enforced in CI (V5); profile early; instancing/LOD/KTX2 from the start |
| Headless WebGL/visual-test flakiness | Pinned Playwright Docker image; frozen deterministic frames; `maxDiffPixelRatio`; baselines reviewed, never auto-updated (`research/07`) |
| Asset licensing | CC0-first; per-asset license ledger; never NonCommercial; Mixamo incorporated not redistributed (`research/05`, `research/13`) |
| `/goal` releases before completion (8-block override) | Each turn makes committed progress; re-run the same goal to continue; optionally `/loop` it (`WORKFLOW.md`) |
| Scope creep | v1 feature set in §3 is the contract; multiplayer + extras are Phase 5+ |

---

## 9. How this plan executes

One `/goal` invocation drives the build (see `docs/GOAL.md` for the exact prompt + completion
condition). Each turn: read `TASKS.md` → pick the next unchecked task → delegate to a
`game-feature-builder` subagent → run `scripts/verify.sh` → `reviewer` subagent reviews the diff →
fix → commit + push → check the box → report status (so the goal evaluator, which reads only the
transcript, can judge progress). Repeat until every box is checked and `verify.sh` is green.
Full mechanics, parallelization, and ephemeral-container survival in `docs/WORKFLOW.md`.

---

## 10. Document index
- `MASTER_PLAN.md` (this file) · `TASKS.md` · `VERIFICATION.md` · `ARCHITECTURE.md` ·
  `COMPETITORS.md` · `WORKFLOW.md` · `GOAL.md`
- `research/01-competitors` · `02-rendering` · `03-gunplay` · `04-ai` · `05-assets` ·
  `06-audio` · `07-tooling-verification` · `08-netcode` · `09-agentic-workflow` ·
  `10-architecture` · `11-level-design` · `12-physics-collision` · `13-modular-kits` ·
  `14-blender-pipeline`
