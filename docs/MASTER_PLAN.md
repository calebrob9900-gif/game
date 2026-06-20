# NEON BREACH — Master Plan

> The plan for building a browser-based, headline-quality shooter the right way: **tech**,
> **roadmap**, and **quality bar**. The **game vision is defined authoritatively in
> `docs/GAME_DESIGN.md`** (read that first — where it and this doc disagree, GAME_DESIGN wins).
> This document is paired with:
> - `docs/GAME_DESIGN.md` — the locked creative + scope spec (what the game IS).
> - `docs/TASKS.md` — the machine-checkable backlog the build executes against (the checklist `/goal` knocks off).
> - `docs/VERIFICATION.md` — how every build is objectively verified + the competitor rubric.
> - `docs/ARCHITECTURE.md` — the code architecture and source tree.
> - `docs/COMPETITORS.md` — the scoreable comparison vs headline shooters.
> - `docs/WORKFLOW.md` — how `/goal` + subagents + verification drive the whole build.
> - `docs/GOAL.md` — the exact goal prompt to start the build, and its completion condition.
> - `docs/research/01..14` — the underlying research (cited).

---

## 1. North Star

**Build the best-feeling competitive shooter that runs in a browser tab — a CoD-style,
arcade-fast, first/third-person multi-mode shooter (FFA / TDM / Domination / Search & Destroy)
in GTA-flavored urban maps with drivable vehicles, fought against smart bots and architected for
online multiplayer later — with AAA-grade *game feel*, verified objectively against headline
shooters.** (Full spec: `docs/GAME_DESIGN.md`.)

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

**The authoritative spec is `docs/GAME_DESIGN.md`.** In brief:

**Title:** NEON BREACH — an arcade-fast **competitive shooter** with CoD-style gunplay in
**GTA-flavored urban maps**, **first/third-person switchable**, with **drivable vehicles**, across
four modes (**FFA, TDM, Domination/Hardpoint, Search & Destroy**), fought **vs smart bots** that
play like real opponents. Free/CC0 assets. **Online multiplayer is architected-for but deferred to
Phase 8.** Scope = **go big**, finished and **verified done**.
**Platforms:** desktop browsers (Chrome/Edge/Firefox/Safari 26+), keyboard + mouse.

### v1 feature set (high level — full detail in `GAME_DESIGN.md`, decomposed in `TASKS.md`)
- Tight controller with the **full arcade movement kit**: accel/friction, sprint, tac-sprint,
  slide, vault/mantle, crouch, jump.
- **First- and third-person** (switchable) with animated characters; identical hitboxes/gameplay.
- CoD-feel gunplay (two-layer recoil, first-shot accuracy + bloom, ADS, hitscan + projectile),
  large weapon roster (≥10), **preset class loadouts** (XP/unlocks deferred).
- Smart **bots** that drive the same player systems and play each mode's objective (cover, flank,
  rotate, plant/defuse/hold) with fair difficulty.
- **Four modes** with teams, spawning/respawn, scoring, scoreboard, killfeed, per-mode HUD.
- **Vehicles** (car + bike) drivable + combat-usable by players and bots.
- **Multiple urban maps** (≥4) from CC0 kits (greybox→art), data-driven descriptors.
- Full juice + spatial audio + dynamic music; WebGPU rendering (PBR/IBL/CSM/post stack); menus +
  settings (incl. FP/TP toggle + rebindable keys).
- 60fps desktop within budgets (`VERIFICATION.md`).

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
| Assets | **GLB + meshopt + KTX2**; CC0 kits (Kenney/Quaternius/KayKit), Poly Haven/ambientCG textures/HDRIs, **Mixamo** anims | Commercial-safe, web-optimized (`research/05`, `research/13`, `research/14`). **Locked v1 policy: free / CC0 only — no paid or AI-generated assets** |
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

Full task-level detail is in `docs/TASKS.md` (this is the summary; the build is sequenced so a
**playable competitive game vs bots exists by end of Phase 3**, then expands).

- **Phase 0 — Foundation & verification.** Vite/TS/lint scaffold, CI + Pages, the 5-verifier
  `verify.sh`, deterministic engine core (fixed loop, seeded RNG, miniplex, sim/presentation
  split, `hashWorld`), instrumentation contract, renderer bootstrap. *Exit:* verify.sh green on a
  minimal real app; CI green; deployed.
- **Phase 1 — Core first-person feel.** Capsule controller + **full movement kit** (sprint/
  tac-sprint/slide/mantle/crouch/jump); CoD-feel gunplay (two-layer recoil, bloom, ADS, reload);
  full juice; HUD + audio core; greybox urban map; shootable bot stub. *Exit:* moving+shooting in
  FP feels good; params match `research/03`; verify.sh green.
- **Phase 2 — Combat AI & bots.** BT + utility + navmesh/crowd + perception/awareness; bots drive
  the **same player systems**; cover/flank/peek/grenades; fair difficulty; AI LOD. *Exit:* bots
  fight like players; AI replay green; V5 holds with 12 bots.
- **Phase 3 — Game modes & match flow.** Teams/spawns/respawn/scoring/scoreboard/killfeed;
  **FFA → TDM → Domination → Search & Destroy** vs bots; mode-objective bot AI; per-mode HUD;
  preset class/loadout select. *Exit:* all four modes playable end-to-end vs bots (first real-game
  milestone).
- **Phase 4 — Third-person + character animation.** Animated player body + locomotion blend, TP
  camera, seamless FP↔TP with hitbox parity, weapon anims, animated bots. *Exit:* fully playable
  in FP and TP.
- **Phase 5 — Vehicles.** Rapier vehicle (car + bike), enter/exit, drive+shoot, vehicle combat/
  destruction, bots use vehicles, vehicle audio. *Exit:* vehicles usable by players + bots.
- **Phase 6 — Content & fidelity (go big).** Asset pipeline; **≥10 weapons**; **≥4 urban maps**;
  characters/skins; rendering post stack (PBR/IBL/CSM/bloom/GTAO/TAA); full audio + music; preset
  classes; menus/settings (incl. FP/TP toggle + keybinds). *Exit:* content-complete; baselines
  committed; fidelity/content targets hit.
- **Phase 7 — Polish, performance, balance, ship.** Perf to budgets; memory soak; balance; full
  coverage; final competitor scoring; production deploy. *Exit (v1 ship):* all P0–P7 tasks `[x]`;
  5 verifiers green; perf met; rubric **> 3.7 with feel pillars ≥ 4.0**.
- **Phase 8 — Online multiplayer (deferred).** Transport → loopback → authoritative server →
  prediction/reconciliation/interpolation/lag-comp → matchmaking → WebTransport → anti-cheat
  (`research/08`). Not required for v1; architecture pre-pays for it.

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
| Scope creep | `GAME_DESIGN.md` is the contract; online MP + create-a-class/XP are Phase 8 / deferred |
| Big scope ("go big") may not finish in one run | Sequenced for a playable game by end of P3; commit per task; re-run/`/loop` the goal; progress persists |

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
