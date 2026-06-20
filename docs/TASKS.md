# NEON BREACH — Task Backlog (the checklist `/goal` executes)

> Serves `docs/GAME_DESIGN.md`. The build works through this top-to-bottom.
> **Legend:** `[ ]` todo · `[x]` done (append commit SHA) · `[!]` blocked/infeasible (state why).
> Each task lists acceptance criteria + the verifier that proves it (`VERIFICATION.md`).
> A task is done only when `scripts/verify.sh` is green **and** its acceptance criteria pass
> **and** a `reviewer` subagent approves **and** it's committed+pushed.
> Don't start a phase until the previous phase's **EXIT GATE** passes.
> Verifiers: V1 static · V2 logic/replay · V3 E2E · V4 visual · V5 perf.
> Scope = **go big**, assets = **free/CC0 only**, opponents = **bots** (online MP = Phase 8, deferred).

---

## PHASE 0 — Foundation & verification harness

- [ ] T-001 Init `package.json`, Vite, TypeScript (strict), `index.html` + `src/app/main.ts` — acceptance: `pnpm dev` serves, `pnpm build` bundles. [V1]
- [ ] T-002 ESLint + Prettier + `tsc --noEmit` + **import-boundary rule** (`presentation`→`sim` only) — acceptance: a `three` import in `src/sim` fails lint. [V1]
- [ ] T-003 Deps: three, @dimforge/rapier3d-compat, miniplex, howler, recast-navigation-js, yuka; dev: vitest, fast-check, @playwright/test, lighthouse, memlab. Vendor three or allowlist CDN. — acceptance: install clean; app imports three error-free. [V1]
- [ ] T-004 Real `scripts/verify.sh` chaining V1–V5 (each a step, aggregate exit), wired to pnpm scripts. — acceptance: exits 0 on the scaffold; prints per-verifier summary. [V1–V5]
- [ ] T-005 `.github/workflows/ci.yml`: install→verify on PR/push; required `ci-passed` aggregator; Pages deploy on green. — acceptance: CI green on scaffold. [V1]
- [ ] T-006 Confirm `.claude/` machinery committed (agents, settings, SessionStart hook works). — acceptance: hook runs; agents valid. [V1]
- [ ] T-007 `perf-budgets.json` (p95 ≤16.6ms, draw calls <100, bundle/asset/memory budgets). — acceptance: parses; V5 reads it. [V5]
- [ ] T-010 Fixed-timestep loop (60Hz) + interpolated render + frame-time clamp. — acceptance: replay: same inputs ⇒ identical tick count + hash twice. [V2]
- [ ] T-011 Seeded PRNG in sim; ban `Math.random()`/`Date.now()` in `src/sim` (lint). — acceptance: lint blocks it; reproducible. [V1][V2]
- [ ] T-012 miniplex ECS + ordered SystemRunner + typed event bus. — acceptance: unit tests for queries + order. [V2]
- [ ] T-013 `hashWorld(state)` over gameplay state. — acceptance: stable, changes on change, unit-tested. [V2]
- [ ] T-014 Command/input types + buffer applied at tick boundaries. — acceptance: deterministic replay. [V2]
- [ ] T-015 Sim/presentation split + read-only snapshot + `RenderSync` interpolation. — acceptance: import-boundary green. [V1]
- [ ] T-016 Instrumentation contract (`__GAME_READY__/__GAME_STATE__/__perf/__pushCommand/__stepTo/?seed/?scenario`), stripped from prod. — acceptance: present dev/test, absent prod. [V1][V3]
- [ ] T-017 Renderer bootstrap: WebGPU + WebGL2 fallback; lit "hello scene". — acceptance: E2E loads, `__GAME_READY__`, no console errors, non-blank frame. [V3]
- [ ] T-018 First visual baseline (frozen frame) committed. — acceptance: V4 matches in pinned image. [V4]
- [ ] T-019 Perf probe + Lighthouse CI wired. — acceptance: V5 runs, passes initial budgets. [V5]

**EXIT GATE P0:** `verify.sh` green (V1–V5) on a minimal real app; CI green; deployed to Pages; one replay test + one visual baseline + one perf run pass.

---

## PHASE 1 — Core first-person feel (movement + gunplay)

- [ ] T-101 Physics/controller spike: Rapier `KinematicCharacterController` vs three-mesh-bvh; pick + document. — acceptance: capsule moves deterministically vs a test level. [V2]
- [ ] T-102 Ground movement: accel + friction (counter-strafe), per-weapon move mult. — acceptance: replay reproduces position curve; params per `research/03`. [V2]
- [ ] T-103 Sprint + **tactical sprint** + sprint-to-fire delay. — acceptance: E2E: fire blocked during sprint-out window. [V3]
- [ ] T-104 Crouch + jump (gravity ~18–25 m/s²). — acceptance: replay-stable heights. [V2]
- [ ] T-105 **Slide** (momentum, duration, slow-down) + **vault/mantle** (auto over ~1–1.3 m). — acceptance: E2E slide over distance + mantle a ledge; replay-stable. [V2][V3]
- [ ] T-106 Pointer-lock look: raw mouse (no accel), sensitivity DPI/cm-360/eDPI. — acceptance: input→yaw/pitch deterministic. [V2]
- [ ] T-110 Data-driven weapon schema (single source of truth). — acceptance: schema validated; AR loads from data. [V1][V2]
- [ ] T-111 Hitscan + region hitboxes (head/chest/limb) + multipliers (head ×1.4–1.6, limb ×0.8–0.9). — acceptance: replay damage by region. [V2]
- [ ] T-112 Two-layer recoil (fixed pattern moves bullets + recovering visual kick). — acceptance: replay N-round pattern; tunable recovery. [V2]
- [ ] T-113 Accuracy: first-shot accurate + movement/stance/fire bloom; dynamic crosshair. — acceptance: replay spread states; E2E crosshair bloom. [V2][V3]
- [ ] T-114 ADS: FOV lerp + viewmodel to sights + correct ADS sens scaling. — acceptance: unit test scaling math; E2E ADS FOV. [V2][V3]
- [ ] T-115 Reload (timed, reserve, cancel) + ammo + weapon switch (swap lockout). — acceptance: E2E flows. [V3]
- [ ] T-116 Damage & TTK tuning (fast readable ~0.25–0.6s) + falloff. — acceptance: replay TTK in band. [V2]
- [ ] T-120 Juice: hitmarkers (normal/head/kill). — acceptance: E2E class changes on headshot. [V3]
- [ ] T-121 Trauma screenshake + 30–80ms hitstop. — acceptance: deterministic; visible in state. [V2][V3]
- [ ] T-122 Pooled muzzle flash + tracers + impact decals + particles. — acceptance: V5 no GC spikes sustained fire; visual baseline. [V4][V5]
- [ ] T-123 FP viewmodel: idle sway + bob + ADS pose + fire kick (frame-rate independent). — acceptance: visual baselines; deterministic poses. [V4]
- [ ] T-130 HUD core: health, ammo/reserve, dynamic crosshair. — acceptance: E2E reads `__GAME_STATE__` matches HUD. [V3]
- [ ] T-131 Audio core: Howler + spatial listener; weapon fire (layered), footsteps, impacts; AudioContext unlock. — acceptance: E2E fire schedules audio; no errors. [V3]
- [ ] T-132 Greybox urban test map (CC0 kit) + `*.level.json` (bounds/cover/spawns). — acceptance: loads; collider present; spawns valid. [V2][V3]
- [ ] T-133 Shootable bot stub (placeholder target with health). — acceptance: replay: shots kill it; respawns. [V2]

**EXIT GATE P1:** a player can move (full kit) and shoot in FP and it feels good; gunplay/movement match `research/03`; ≥1 firefight replay test; verify.sh green; record P1 rubric self-score.

---

## PHASE 2 — Combat AI & bots (opponents that play like people)

- [ ] T-201 Behavior Tree core (selector/sequence/decorator/leaf) + Blackboard. — acceptance: unit tests for eval order. [V2]
- [ ] T-202 Utility scorer (target/cover/push-vs-retreat). — acceptance: unit: picks best option. [V2]
- [ ] T-203 Navmesh (recast-navigation-js) from level collision + Crowd (separation). — acceptance: agents path around cover, no clumping. [V3]
- [ ] T-204 Perception: vision cones + LOS + hearing (wired to SFX) + awareness states + LKP. — acceptance: replay detection only within cone+LOS / on sound; investigates LKP. [V2]
- [ ] T-210 **Bot-as-player controller**: bots drive the SAME movement/aim/fire systems as the player (not a separate hack). — acceptance: a bot moves/aims/fires via player command API; replay-stable. [V2]
- [ ] T-211 Combat behaviors: move-to-cover, peek-fire, ranged LOS-gated fire, reload, retreat-when-low. — acceptance: E2E: bot uses cover + peeks. [V3]
- [ ] T-212 Flanking + squad coordinator (shared knowledge, roles, bounding overwatch). — acceptance: replay: 2+ bots take different routes to flank. [V2]
- [ ] T-213 Grenade use (flush a camper). — acceptance: replay throw. [V2]
- [ ] T-214 Fair difficulty scaling (reaction time + converging aim cone; never aimbot). — acceptance: replay: accuracy scales by setting, not perfect. [V2]
- [ ] T-215 AI LOD + time-slicing (perception/plan 5–10Hz, staggered, path-replan cap) ≤3–5ms/frame for 10–16 bots. — acceptance: V5 frame budget with 12 bots. [V5]

**EXIT GATE P2:** bots path, take cover, flank, and fight using the real player systems; AI replay tests green; V5 holds with 12 bots; AI rubric ≥3.5.

---

## PHASE 3 — Game modes & match flow (playable competitive game vs bots)

- [ ] T-301 Team system (assignment, team colors, friendly-fire config). — acceptance: unit: balanced teams; FF respected. [V2]
- [ ] T-302 Spawn system: team/zone spawns, spawn protection, anti-spawn-camp selection; S&D no-respawn support. — acceptance: replay: spawns avoid enemies; protection works. [V2]
- [ ] T-303 Match lifecycle: warmup→live→end→results; score/time limits; restart. — acceptance: E2E: a match runs start→results. [V3]
- [ ] T-304 Scoreboard (Tab) + killfeed + end-of-match results screen. — acceptance: E2E shows kills/scores. [V3]
- [ ] T-310 **Mode: Free-for-all** (logic, scoring, win condition). — acceptance: E2E: FFA vs bots reaches a winner. [V3]
- [ ] T-311 **Mode: Team Deathmatch** (team score race). — acceptance: E2E: TDM vs bots ends on score limit. [V3]
- [ ] T-312 **Mode: Domination/Hardpoint** (capture/hold points, ticket/score accrual, contest logic). — acceptance: E2E: capturing a point accrues score. [V3]
- [ ] T-313 **Mode: Search & Destroy** (round-based, no respawn, bomb plant/defuse, attack/defend, first-to-N rounds, round timers). — acceptance: E2E: plant→defuse and plant→detonate both resolve rounds correctly. [V2][V3]
- [ ] T-314 Mode-objective bot AI: bots understand each mode (chase kills / push+hold points / plant or defuse / play the round) + rotate. — acceptance: replay per mode: bots pursue the objective, not just kills. [V2]
- [ ] T-315 Per-mode HUD (objective state, team scores, round, timer, bomb status). — acceptance: E2E HUD reflects mode state. [V3]
- [ ] T-316 Preset **class/loadout select** screen + spawn with chosen loadout (primary/secondary/lethal/tactical). — acceptance: E2E: pick class → spawn with its weapons. [V3]

**EXIT GATE P3:** all four modes are playable end-to-end vs bots with teams/spawns/scoring/HUD; per-mode E2E tests green; verify.sh green; record rubric self-score (this is the first "real game" milestone).

---

## PHASE 4 — Third-person + character animation

- [ ] T-401 Player character model (Mixamo/CC0) + rig + locomotion blend (idle/walk/run/strafe/crouch/jump/slide). — acceptance: visual baselines of states; deterministic from velocity. [V4]
- [ ] T-402 Third-person camera (over-shoulder, collision avoidance, aim offset, shoulder swap). — acceptance: E2E TP camera follows + no clip through walls. [V3]
- [ ] T-403 FP↔TP seamless toggle with **identical hitboxes/gameplay** in both. — acceptance: replay: same shot resolves identically FP vs TP. [V2][V3]
- [ ] T-404 Weapon handling anims in TP (aim, fire, reload, ADS) + upper/lower body blend. — acceptance: visual baselines; reload duration matches sim. [V4]
- [ ] T-405 Bots/other players render the same animated character + team skins. — acceptance: visual baseline of an animated bot. [V4]

**EXIT GATE P4:** game fully playable in first AND third person with animated characters; hitbox parity proven; visual baselines committed; verify.sh green.

---

## PHASE 5 — Vehicles (drive + shoot in maps)

- [ ] T-501 Vehicle physics: Rapier raycast-vehicle car (suspension, steering, accel/brake). — acceptance: replay: deterministic drive over a test surface. [V2]
- [ ] T-502 Enter/exit + driver control + vehicle camera (FP/TP). — acceptance: E2E enter→drive→exit. [V3]
- [ ] T-503 Drive + shoot (driver sidearm / passenger seats fire). — acceptance: E2E shoot from vehicle. [V3]
- [ ] T-504 Vehicle health, collision damage, destruction + explosion (reuse AoE). — acceptance: replay: damage + destroy. [V2]
- [ ] T-505 Second vehicle type (bike) + vehicle spawns in `*.level.json`. — acceptance: loads in map; both drive. [V3]
- [ ] T-506 Bots use vehicles to rotate (path + enter + drive to objective). — acceptance: replay: a bot drives to an objective. [V2]
- [ ] T-507 Vehicle audio (engine, skid, impact, horn). — acceptance: E2E schedules engine audio while driving. [V3]

**EXIT GATE P5:** vehicles are drivable + combat-usable by players and bots in FP/TP; verify.sh green; perf holds with vehicles active.

---

## PHASE 6 — Content & fidelity (go big)

- [ ] T-601 Asset pipeline: Blender→glTF→`gltf-transform`/`gltfpack` (meshopt/Draco + KTX2); loaders wired. — acceptance: a test GLB loads optimized within budget. [V1][V5]
- [ ] T-602 `public/assets/LICENSES.md` ledger; CC0-only enforced. — acceptance: every asset has an entry; none NonCommercial/paid/AI-gen. [V1]
- [ ] T-603 **Weapon roster (≥10)** across classes (AR/SMG/LMG/shotgun/sniper/pistol/launcher) tuned + models/viewmodels (CC0/procedural) + anims. — acceptance: per-weapon replay (TTK/recoil) + visual baselines. [V2][V4]
- [ ] T-604 **Multiple urban maps (≥4)** greybox→art, with per-mode spawns/objectives/bombsites/hardpoints/vehicle spawns. — acceptance: each loads + valid for all supported modes; visual baseline. [V3][V4]
- [ ] T-605 Character variety + team skins (Mixamo/CC0). — acceptance: visual baselines; license ledger updated. [V4]
- [ ] T-610 Rendering fidelity: PBR materials + HDRI IBL + ACES/AgX tonemap + LUT. — acceptance: visual baselines; V5 budget. [V4][V5]
- [ ] T-611 Sun + cascaded shadow maps. — acceptance: visual baseline; budget. [V4][V5]
- [ ] T-612 Post stack: bloom + GTAO + TAA (+ selective SSR), quality toggles. — acceptance: visual baselines; toggleable; budget. [V4][V5]
- [ ] T-613 GPU particles + pooled decals at scale; instancing/BatchedMesh + LOD + culling. — acceptance: V5 draw calls <100 in a populated map. [V5]
- [ ] T-620 Audio full: layered weapons + surface footsteps + vehicles + callouts + ambience + dynamic music + mix/ducking + voice budget. — acceptance: E2E music intensifies in combat; mix doesn't clip. [V3]
- [ ] T-630 Preset class definitions (loadouts) + simple perks. — acceptance: each class spawns correctly; perks apply (tested). [V2][V3]
- [ ] T-631 Front-end: main menu + mode select + class select + pause + results. — acceptance: E2E navigates all. [V3]
- [ ] T-632 Settings: sensitivity, **FP/TP toggle**, graphics quality, audio sliders, **rebindable keys**; persisted. — acceptance: E2E change persists + takes effect. [V3]

**EXIT GATE P6:** content-complete (≥10 weapons, ≥4 maps, characters, all modes, vehicles, classes, menus); visual baselines committed; fidelity+content rubric targets hit; verify.sh green.

---

## PHASE 7 — Polish, performance, balance, ship

- [ ] T-701 Performance pass to budgets across all maps/modes/vehicles (draw calls <100, p95 ≤16.6ms). — acceptance: V5 green everywhere under combat load. [V5]
- [ ] T-702 Memory soak (5-min match) leak-free (memlab). — acceptance: V5 soak passes. [V5]
- [ ] T-703 Balance pass (TTK, weapon/class balance, mode pacing, bot difficulty) via replay metrics. — acceptance: documented targets met. [V2]
- [ ] T-704 Accessibility + UX polish (FOV slider, colorblind-safe HUD, reduce-shake, subtitles/callout text, aim-assist option). — acceptance: E2E options present + effective. [V3]
- [ ] T-705 Full test coverage sweep: every system has replay/E2E; visual baselines for all key states; flaky-test audit. — acceptance: coverage thresholds; V2/V3/V4 green. [V2][V3][V4]
- [ ] T-706 Final competitor scoring with evidence in `COMPETITORS.md`. — acceptance: weighted total > 3.7; feel pillars ≥4.0; none <3.0; justified. [—]
- [ ] T-707 Production deploy (Pages) + live smoke test. — acceptance: live build loads + a full match vs bots plays. [V3]
- [ ] T-708 `README.md` (play/dev/contribute) + final docs pass. — acceptance: accurate; links valid. [V1]

**v1 SHIP GATE:** all Phase 0–7 tasks `[x]`; all five verifiers green; perf budgets met; `COMPETITORS.md` v1 target met; deployed. Matches `GAME_DESIGN.md §7`.

---

## PHASE 8 — Online multiplayer (deferred; `research/08`)
> Not required for v1. Only the determinism/sim-split rules must already hold (they do from P0).
- [ ] T-801 `Transport` interface + local loopback "fake network" (validate netcode w/o a server).
- [ ] T-802 Authoritative Node server running the existing `simulate()` (30Hz sim / 20Hz snapshot).
- [ ] T-803 Client prediction + server reconciliation + entity interpolation.
- [ ] T-804 Lag compensation (server hitbox rewind, ~1s ring buffer).
- [ ] T-805 Snapshot/delta compression + bandwidth budget.
- [ ] T-806 Matchmaking/rooms (Colyseus) + hosting; fill empty slots with the existing bots.
- [ ] T-807 WebTransport upgrade behind the Transport interface.
- [ ] T-808 Server-authority anti-cheat hardening.

---

## Progress
- P0: 0/19 · P1: 0/22 · P2: 0/10 · P3: 0/14 · P4: 0/5 · P5: 0/7 · P6: 0/16 · P7: 0/8 · P8: 0/8 (deferred)
- Update counts as boxes flip. v1 is done when **P0–P7 are fully `[x]`** and the v1 ship gate passes (`GOAL.md`).
