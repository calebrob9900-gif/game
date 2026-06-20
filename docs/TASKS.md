# NEON BREACH — Task Backlog (the checklist `/goal` executes)

> The ordered, machine-checkable backlog. The build works through this top-to-bottom.
> **Legend:** `[ ]` todo · `[x]` done (append commit SHA) · `[!]` blocked/infeasible (state why).
> **Each task lists acceptance criteria + which verifier proves it** (`VERIFICATION.md`).
> A task is done only when `scripts/verify.sh` is green **and** its acceptance criteria pass
> **and** a `reviewer` subagent approves the diff **and** it's committed+pushed (`VERIFICATION.md §3`).
> Do not start a phase until the previous phase's **EXIT GATE** passes.
> Verifier tags: V1 static · V2 logic/replay · V3 E2E · V4 visual · V5 perf.

---

## PHASE 0 — Foundation & verification harness

### Epic 0.A — Project scaffolding
- [ ] T-001 Init `package.json`, Vite, TypeScript (strict), entry `index.html` + `src/app/main.ts` — acceptance: `pnpm dev` serves; `pnpm build` produces a bundle. [V1]
- [ ] T-002 ESLint + Prettier + `tsc --noEmit`; add the **import-boundary lint rule** (`presentation`→`sim` only) — acceptance: lints clean; a deliberate `three` import inside `src/sim` fails lint. [V1]
- [ ] T-003 Add deps: three, @dimforge/rapier3d-compat, miniplex, howler, recast-navigation-js, yuka; dev: vitest, fast-check, @playwright/test, lighthouse, memlab. Vendor Three.js or allowlist CDN. — acceptance: `pnpm install` clean; app imports three and renders nothing-errors-free. [V1]
- [ ] T-004 `scripts/verify.sh` real implementation chaining V1–V5 (each its own step, aggregate exit). Stub V3/V4/V5 to pass on the empty app initially, wired to real commands. — acceptance: `bash scripts/verify.sh` exits 0 and prints a per-verifier summary. [V1–V5]
- [ ] T-005 `.github/workflows/ci.yml`: install→verify on PR/push; single required `ci-passed` aggregator; Pages deploy on green. — acceptance: workflow file validates; CI green on the scaffold. [V1]
- [ ] T-006 `.claude/` machinery present & committed: `agents/{game-feature-builder,verifier,reviewer,asset-fetcher}.md`, `settings.json` SessionStart hook (gated on `CLAUDE_CODE_REMOTE`, reinstalls deps). — acceptance: files exist, valid; hook script runs without error. [V1]
- [ ] T-007 `perf-budgets.json` with initial budgets (p95 ≤16.6ms, draw calls <100, bundle/asset sizes, memory soak). — acceptance: file parses; V5 reads it. [V5]

### Epic 0.B — Deterministic engine core
- [ ] T-010 Fixed-timestep loop (60Hz accumulator) decoupled from interpolated render; frame-time clamp. — acceptance: replay test: same inputs ⇒ identical tick count + state hash across two runs. [V2]
- [ ] T-011 Seeded PRNG in sim state; ban `Math.random()`/`Date.now()` in `src/sim` (lint). — acceptance: lint blocks `Math.random` in sim; PRNG reproducible. [V1][V2]
- [ ] T-012 miniplex ECS world + `System`/`SystemRunner` (ordered) + typed event bus. — acceptance: unit tests for entity add/remove/query + system order. [V2]
- [ ] T-013 `hashWorld(state)` (positions/vel/health/ammo/rng cursor). — acceptance: stable hash; changes when state changes; unit-tested. [V2]
- [ ] T-014 Command/input types + buffer (`Move/Look/Fire/Reload/Switch`) applied at tick boundaries. — acceptance: commands replay deterministically. [V2]
- [ ] T-015 Sim/presentation split skeleton + read-only snapshot + `RenderSync` interpolation. — acceptance: presentation reads snapshot; import-boundary lint green. [V1]

### Epic 0.C — Test instrumentation + first render
- [ ] T-016 Instrumentation contract (`__GAME_READY__`, `__GAME_STATE__`, `__perf`, `__pushCommand`, `__stepTo`, `?seed/?scenario`), stripped from prod builds. — acceptance: present in dev/test build, absent in prod build. [V1][V3]
- [ ] T-017 Renderer bootstrap: WebGPURenderer with automatic WebGL2 fallback; render a lit "hello cube". — acceptance: E2E loads, `__GAME_READY__` true, no console errors, non-blank first frame. [V3]
- [ ] T-018 First visual baseline (frozen frame via `__stepTo`, fixed seed/camera) committed. — acceptance: V4 snapshot matches baseline in the pinned Playwright image. [V4]
- [ ] T-019 First perf probe run wired (`__perf`) + Lighthouse CI on the scaffold. — acceptance: V5 runs, reports numbers, passes initial budgets. [V5]

**PHASE 0 EXIT GATE:** `verify.sh` green (V1–V5) on a real-but-minimal app; CI green; deployed to Pages; one replay test + one visual baseline + one perf run all passing.

---

## PHASE 1 — Core FPS vertical slice (the feel)

### Epic 1.A — Player controller & movement (`research/03`, `research/12`)
- [ ] T-101 Physics spike: prototype Rapier `KinematicCharacterController` vs three-mesh-bvh capsule; pick one; document decision. — acceptance: decision recorded in ARCHITECTURE; chosen controller moves a capsule against a test level deterministically. [V2]
- [ ] T-102 Ground movement: finite accel + high friction (enables counter-strafe), per-weapon move multipliers. — acceptance: replay test reproduces position curve; values match `research/03`. [V2]
- [ ] T-103 Sprint + tac-sprint + sprint-to-fire delay (100–250ms). — acceptance: E2E: firing blocked during sprint-out window. [V3]
- [ ] T-104 Crouch (stance height/speed/spread) + jump (gravity ~18–25 m/s²) + slide + auto-mantle (~1.0–1.3m). — acceptance: E2E mantle over a 1.2m ledge; replay-stable. [V2][V3]
- [ ] T-105 Pointer-lock look: raw mouse (no accel/smoothing), sensitivity as DPI/cm-360/eDPI. — acceptance: input→yaw/pitch deterministic given a movement sequence. [V2]

### Epic 1.B — Weapon system & gunplay (`research/03`)
- [ ] T-110 Data-driven weapon schema (single source of truth: mag/reserve/rate/dmg/head/recoil/spread/ADS/reload). — acceptance: schema validated; 1 weapon (AR) loads from data. [V1][V2]
- [ ] T-111 Hitscan firing + bone/region hitboxes (head/chest/stomach/limb) + headshot ×1.4–1.6, limb ×0.8–0.9. — acceptance: replay: shot at head vs limb yields correct damage. [V2]
- [ ] T-112 Two-layer recoil: fixed per-weapon aim pattern (+ light random tail) that moves bullets; separate visual/camera kick that fully recovers (~100–150ms). — acceptance: replay: N-round burst reproduces the pattern; tunable autoRecoverFraction. [V2]
- [ ] T-113 Accuracy: first-shot-accurate; bloom from movement/jump/consecutive fire; reset on stop; dynamic crosshair maps to live cone. — acceptance: replay of spread states; E2E crosshair gap changes with movement. [V2][V3]
- [ ] T-114 ADS: FOV lerp (150–300ms) + viewmodel to aim socket + **correct ADS sensitivity scaling** (`tan(adsFov/2)/tan(baseFov/2)`). — acceptance: unit test of the scaling math; E2E ADS toggles FOV. [V2][V3]
- [ ] T-115 Reload (timed, from reserve, reload-cancel) + ammo/reserve + weapon switch (swap lockout). — acceptance: E2E: empty→reload refills from reserve; switch blocks fire during swap. [V3]
- [ ] T-116 Damage & TTK tuning to readable target (~0.35–0.7s AR), damage falloff steps. — acceptance: replay TTK within target band at set ranges. [V2]

### Epic 1.C — Combat juice & feedback (`research/03`)
- [ ] T-120 Hitmarkers (normal/headshot/kill variants). — acceptance: E2E: hitmarker class changes on headshot. [V3]
- [ ] T-121 Trauma-based screenshake (`trauma²` + noise) + 30–80ms hitstop. — acceptance: deterministic given trauma input; visible in E2E state. [V2][V3]
- [ ] T-122 Pooled muzzle flash + tracers + impact decals + particles (no per-shot allocation). — acceptance: V5 shows no GC spikes during sustained fire; visual baseline of a shot. [V4][V5]
- [ ] T-123 Procedural viewmodel: idle sway + bob + ADS pose + fire kick (frame-rate independent). — acceptance: visual baseline frames; deterministic poses. [V4]

### Epic 1.D — First enemy, waves, HUD, audio
- [ ] T-130 One enemy archetype (chaser) with health + simple straight-line move + melee (placeholder AI). — acceptance: replay: enemy reaches player and deals damage. [V2]
- [ ] T-131 Spawn + basic wave loop (start → spawn N → all dead → next wave + heal). — acceptance: E2E: clearing a wave advances the counter. [V3]
- [ ] T-132 HUD: health, ammo/reserve, dynamic crosshair, wave, score. — acceptance: E2E reads values from `__GAME_STATE__` and they match HUD. [V3]
- [ ] T-133 Audio core: Howler + spatial listener sync; weapon fire (layered), footsteps (surface), impacts, enemy, hitmarker; AudioContext unlock on gesture. — acceptance: E2E: firing schedules audio nodes (assert via test hook); no errors. [V3]
- [ ] T-134 Greybox "Arena 01" from a modular CC0 kit + data-driven `arena01.level.json` (bounds/cover/spawns). — acceptance: level loads; collider present; spawns inside bounds. [V2][V3]

**PHASE 1 EXIT GATE:** a player can fight and clear waves and it feels good; gunplay/movement params match `research/03`; ≥1 firefight replay test green; verify.sh green; record P1 rubric self-score in `COMPETITORS.md` (feel pillars trending ≥3.5).

---

## PHASE 2 — AI & encounter depth (`research/04`, `research/11`)

### Epic 2.A — AI foundation
- [ ] T-201 Behavior Tree core (selector/sequence/decorator/leaf) + Blackboard. — acceptance: unit tests for BT evaluation order. [V2]
- [ ] T-202 Utility scorer (target/cover/push-vs-retreat selection). — acceptance: unit test: picks best-scored option. [V2]
- [ ] T-203 Navmesh via recast-navigation-js baked from level collision + Crowd (separation). — acceptance: agents path around cover; no clumping in E2E. [V3]
- [ ] T-204 Perception: vision cones (focus/normal/peripheral) + LOS raycast + hearing spheres wired to SFX events. — acceptance: replay: enemy detects player only within cone+LOS / on sound. [V2]
- [ ] T-205 Awareness state machine (Unaware→Suspicious→Alert/Search→Combat) + last-known-position investigation. — acceptance: replay transitions through states + investigates LKP. [V2]

### Epic 2.B — Combat behaviors
- [ ] T-210 Cover system: find LOS-breaking points off cover edges; move-to-cover; peek-fire. — acceptance: E2E: enemy breaks LOS behind a pillar then peeks. [V3]
- [ ] T-211 Ranged fire with LOS gating + fair accuracy model (reaction time + converging aim cone, never perfect). — acceptance: replay: blocked LOS = no hit; accuracy scales with difficulty not cheating. [V2]
- [ ] T-212 Flanking + squad coordinator (shared knowledge, role assignment, bounding overwatch). — acceptance: replay: 2+ enemies take different routes to flank. [V2]
- [ ] T-213 Suppression toward LKP + retreat-to-cover when low. — acceptance: replay behaviors trigger on thresholds. [V2]
- [ ] T-214 Enemy grenade flush (reuse arc/AoE). — acceptance: replay: enemy throws to flush a camping player. [V2]
- [ ] T-215 ≥4 enemy archetypes (chaser/fast/tank/ranged) with distinct stats + behaviors. — acceptance: each archetype's defining behavior covered by a test. [V2]
- [ ] T-216 AI LOD + time-slicing (perception/plan at 5–10Hz, staggered, path re-plan cap) within ~3–5ms/frame for 8–16 agents. — acceptance: V5: frame budget holds with 12 active agents. [V5]

### Epic 2.C — Encounter design & player kit
- [ ] T-220 Wave director with intensity pacing (Build→Peak 3–5s→Fade→Relax 30–45s) + spawn rules (min/max distance, max-alive cap). — acceptance: replay: spawn timing/counts follow the curve. [V2]
- [ ] T-221 Between-wave economy: currency on kills, buy stations (weapons/ammo/upgrades). — acceptance: E2E: buy refills/upgrades; currency math correct. [V3]
- [ ] T-222 Player grenades (lethal + tactical) with arc + AoE/effect. — acceptance: E2E throw + damage falloff. [V3]
- [ ] T-223 One killstreak/ability (e.g., airstrike) earned by streak. — acceptance: E2E: triggers at threshold, damages enemies. [V3]
- [ ] T-224 Anti-turtle mechanics (rotate threat direction, relocate resupply). — acceptance: replay: camping a corner spawns flankers. [V2]

**PHASE 2 EXIT GATE:** enemies path, take cover, flank, and shoot back with LOS; AI replay tests green; V5 holds with 12 agents; AI rubric criterion ≥3.5 recorded.

---

## PHASE 3 — Content & fidelity (`research/02`, `05`, `13`, `14`)

### Epic 3.A — Asset pipeline
- [ ] T-301 Blender→glTF pipeline + `gltf-transform`/`gltfpack` optimize step (meshopt/Draco + KTX2) scripted; loaders wired (GLTF/Draco/Meshopt/KTX2). — acceptance: a test GLB loads optimized; size within budget. [V1][V5]
- [ ] T-302 `public/assets/LICENSES.md` per-asset license ledger; CC0-first policy enforced. — acceptance: every shipped asset has a ledger entry; no NonCommercial. [V1]
- [ ] T-303 Real animated enemy characters (Mixamo retargeted, baked clips: idle/walk/run/attack/death) replacing placeholders; invisible hitboxes drive gameplay. — acceptance: E2E gameplay unchanged; visual baseline of animated enemy. [V3][V4]
- [ ] T-304 First-person arms + weapon viewmodels (fire/reload/draw/sprint/inspect clips). — acceptance: visual baselines of each weapon state. [V4]

### Epic 3.B — Rendering fidelity (`research/02`)
- [ ] T-310 PBR materials + HDRI image-based lighting (PMREM) + ACES/AgX tonemap + LUT color grade. — acceptance: visual baselines; perf within budget. [V4][V5]
- [ ] T-311 Sun + cascaded shadow maps. — acceptance: visual baseline; V5 budget. [V4][V5]
- [ ] T-312 Post stack: bloom + GTAO + TAA (+ selective SSR). — acceptance: visual baselines; toggleable via settings; V5 budget. [V4][V5]
- [ ] T-313 GPU particles + pooled decals at scale. — acceptance: V5: no GC/draw-call blowout under heavy VFX. [V5]
- [ ] T-314 Instancing/BatchedMesh + LODs + frustum/occlusion culling for the map kit. — acceptance: V5: draw calls <100 in a populated arena. [V5]

### Epic 3.C — Content breadth
- [ ] T-320 ≥5 tuned weapons (AR/SMG/shotgun/sniper/pistol) incl. projectile path+drop for sniper/launcher. — acceptance: per-weapon replay tests; TTK/recoil match data. [V2]
- [ ] T-321 ≥3 maps (greybox→art) as data-driven descriptors; varied archetypes (arena, lanes, vertical). — acceptance: each loads, colliders+spawns valid, visual baseline. [V3][V4]
- [ ] T-322 Dynamic music (vertical layering / stingers) + full mix (buses, ducking, voice budget). — acceptance: E2E: music intensifies in combat; mix doesn't clip. [V3]
- [ ] T-323 Progression/upgrades persisted (weapon levels, perks). — acceptance: E2E: upgrade persists across waves; save/load round-trips. [V3]

### Epic 3.D — Front-end & options
- [ ] T-330 Main menu, pause, game-over (best-run save). — acceptance: E2E navigates all screens. [V3]
- [ ] T-331 Settings: sensitivity, graphics quality toggles (post-fx/shadows/resolution), audio sliders, **rebindable keys**. — acceptance: E2E: changing a setting persists + takes effect. [V3]

**PHASE 3 EXIT GATE:** content-complete v1; visual baselines committed for all weapons/enemies/maps; fidelity+content rubric criteria hit phase targets; verify.sh green.

---

## PHASE 4 — Polish, performance, ship

- [ ] T-401 Performance pass to budgets across all maps (instancing/LOD/culling/KTX2/draw-call <100, p95 ≤16.6ms). — acceptance: V5 green on every map under combat load. [V5]
- [ ] T-402 Memory soak (5-min) leak-free (memlab). — acceptance: V5 soak passes. [V5]
- [ ] T-403 Balance pass (TTK, enemy difficulty curve, economy) using replay metrics. — acceptance: difficulty curve within design targets; documented. [V2]
- [ ] T-404 Accessibility + UX polish (FOV slider, colorblind-safe HUD, reduce-shake toggle, subtitles for cues). — acceptance: E2E options present + effective. [V3]
- [ ] T-405 Full test coverage sweep: every gameplay system has a replay/E2E; visual baselines for all key states; flaky-test audit. — acceptance: coverage thresholds met; V2/V3/V4 green. [V2][V3][V4]
- [ ] T-406 Final competitor scoring with evidence; record in `COMPETITORS.md`. — acceptance: weighted total > 3.7, feel pillars ≥4.0, none <3.0, each justified. [—]
- [ ] T-407 Production deploy (Pages) + smoke test the live URL. — acceptance: live build loads + plays; CI deploy green. [V3]
- [ ] T-408 `README.md` (play + dev + contribute) + final docs pass. — acceptance: docs accurate; links valid. [V1]

**PHASE 4 / v1 SHIP GATE:** all tasks `[x]`; all 5 verifiers green; perf budgets met; `COMPETITORS.md` v1 target met; deployed.

---

## PHASE 5 — Multiplayer (future / optional; `research/08`)
> Not required for v1 ship. Only the determinism/sim-split rules from Phase 0 must already hold.
- [ ] T-501 `Transport` interface + local loopback "fake network" (build/tune ~90% of netcode, no server).
- [ ] T-502 Authoritative server (Node) running the existing `simulate()` at 30Hz sim / 20Hz snapshot.
- [ ] T-503 Client prediction + server reconciliation + entity interpolation.
- [ ] T-504 Lag compensation (server-side hitbox rewind, ~1s ring buffer).
- [ ] T-505 Snapshot/delta compression; bandwidth budget.
- [ ] T-506 Matchmaking/rooms (Colyseus) + hosting (Edgegap/Colyseus Cloud).
- [ ] T-507 WebTransport upgrade behind the Transport interface.
- [ ] T-508 Server-authority anti-cheat hardening (occlusion-aware state, behavioral checks).

---

## Progress
- Phase 0: 0/14 · Phase 1: 0/19 · Phase 2: 0/19 · Phase 3: 0/16 · Phase 4: 0/8 · Phase 5: 0/8 (deferred)
- Update these counts whenever a box is flipped. The build is **not** done until Phases 0–4 are
  fully `[x]` and the v1 ship gate passes (`GOAL.md`).
