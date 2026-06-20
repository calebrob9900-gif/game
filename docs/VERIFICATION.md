# NEON BREACH — Verification & Quality Gates

> How every build is **objectively** verified, and how a task is proven "done" with no human
> judgment in the loop. Synthesizes `research/07` (tooling/verification) and `research/01`
> (competitor rubric). This is the backbone that makes `/goal` trustworthy.

## 1. Principle: prove it, don't vibe it

Determinism (see `ARCHITECTURE.md`) lets us assert on **state**, not feelings. Every quality
claim maps to a command that exits `0` or non-zero. `scripts/verify.sh` runs all of them; a build
is **verified iff `verify.sh` exits 0**. CI runs the identical script as the merge gate, so local
and CI answers match.

## 2. The five verifiers

| ID | Name | Tooling | Asserts |
|---|---|---|---|
| **V1** | Static | eslint, prettier --check, `tsc --noEmit` | Lint clean, formatted, type-correct, sim/presentation import boundary respected |
| **V2** | Logic / replay | Vitest + fast-check + **deterministic replay** | Unit logic; `(seed+recorded inputs) ⇒ expected world hash`; property tests |
| **V3** | Behavioral E2E | Playwright (real game, headed/headless) | Drives input via `__pushCommand`, asserts `__GAME_STATE__` (e.g., "fire 30 rounds → enemy dead, ammo 0"); fails on console errors / blank first frame |
| **V4** | Visual | Playwright `toHaveScreenshot` on `__stepTo`-frozen, fixed-seed, fixed-camera frames | No unintended visual regressions; `maxDiffPixelRatio ≈ 0.01` |
| **V5** | Performance | rAF FPS/p95-frame probe (`__perf`), CDP/LoAF, memlab, Lighthouse CI | Meets `perf-budgets.json`; no leaks; load/asset budgets |

`scripts/verify.sh` chains them and exits non-zero on the first failure (or runs all and
aggregates). `pnpm verify` is the alias. CI calls the same script.

### V3/V4 require the instrumentation contract
`__GAME_READY__`, `__GAME_STATE__`, `__perf`, `__pushCommand`, `__stepTo`, `?seed/?scenario`
(see `ARCHITECTURE.md §6`). These are **test-only** and stripped from production bundles.

### Record-and-replay (the keystone gameplay test)
Store `{seed, settings, inputs[]}`; replay headlessly through `sim` (no rendering); assert the
final `hashWorld()`. Fast (ms), zero flakiness. A changed hash = a deliberate behavior change
requiring a reviewed re-baseline. Every gameplay feature ships with at least one replay test.

### Visual stability rules
Baselines generated **inside the same pinned Playwright Docker image** CI uses; deterministic
frozen frames only; `maxDiffPixelRatio` to absorb GPU/AA noise; baselines **committed and
reviewed like code**, never auto-updated in CI; matrix by browser (WebKit highest value for
WebGL), never by OS. Linux CI uses SwiftShader → treat V5 GPU numbers as **relative regression**
signals (or run on a GPU runner), not absolute.

## 3. Machine-checkable Definition of Done (DoD)

A task in `TASKS.md` is **done** iff:
1. `scripts/verify.sh` exits `0` (all five verifiers), **and**
2. the task's own acceptance criteria (a command + threshold, listed in `TASKS.md`) pass, **and**
3. the change has been committed **and pushed**, **and**
4. the `reviewer` subagent's adversarial review found no blocking issue (see §5).

Only then is the checkbox flipped to `[x]` with the commit SHA appended.

## 4. Escalating verification gates (defense in depth)

From `research/09`, four layers, weakest→strongest:
1. **One-prompt sanity** — the builder states what it did.
2. **`/goal` condition** — the goal evaluator (reads transcript only) checks reported progress.
3. **Deterministic gate** — `scripts/verify.sh` exit code (the real arbiter; the agent must paste
   its output so the transcript-only evaluator can see the result).
4. **Adversarial second opinion** — a fresh `reviewer` subagent / `/code-review` reviews the diff
   so the builder never grades its own work.

Guardrail: if a Stop hook blocks ~8 consecutive times it auto-overrides — so the build is
designed to make committed progress every turn and to be **safely re-run** (`WORKFLOW.md`).

## 5. Adversarial review
After `verify.sh` is green for a task, spawn a `reviewer` subagent (definition in
`.claude/agents/reviewer.md`) to review the diff for correctness, scope, determinism-rule
violations (no `Math.random()`/`three` in `sim`), perf foot-guns, and test quality. Blocking
findings must be fixed before the box is checked.

## 6. Competitor rubric (compare to headline shooters)

Scored **1–5** per criterion, weighted (sums to 1.00); weighted total out of 5.00. Reference
columns: **AAA bar = 5.0**, **Best Web FPS (≈Krunker) ≈ 3.7** (`research/01`). Re-scored at each
phase exit and recorded in `COMPETITORS.md`.

| # | Criterion | Weight |
|---|---|---|
| 1 | Gunplay feel | 0.18 |
| 2 | Movement model | 0.14 |
| 3 | Feedback / juice (VFX) | 0.12 |
| 4 | Audio | 0.12 |
| 5 | Performance (fps/pacing/responsiveness) | 0.12 |
| 6 | Enemy AI | 0.10 |
| 7 | Visual fidelity (incl. art direction) | 0.10 |
| 8 | Content & variety | 0.06 |
| 9 | Polish & UX | 0.06 |

**v1 ship target:** weighted total **> 3.7 (beat best web FPS)** with **feel pillars (1–4) each
≥ 4.0**, and no criterion below 3.0. Fidelity (7) is scored against the *web* ceiling, not native.

### Scoring discipline
Self-scoring is a starting point; each phase-exit score must be justified with concrete evidence
(which acceptance tests pass, perf numbers, a captured gameplay clip/screenshots) and sanity-
checked by the `reviewer` subagent. Scores never go up without evidence.

## 7. Performance budgets (`perf-budgets.json`)
Initial targets (desktop, tune in Phase 0; from `research/02`):
- Frame: 60 fps target, **p95 frame time ≤ 16.6 ms**; never below 50 fps sustained.
- Draw calls: **< 100** typical (InstancedMesh/BatchedMesh/atlases).
- On-screen triangles: budget per scene; LODs beyond.
- Textures: **KTX2/Basis** only for large maps; VRAM budget enforced; mind iOS memory wall.
- Load: Lighthouse budget on bundle + asset size; initial load time target.
- Memory: no growth across a 5-minute soak (memlab) — fail on leaks.

## 8. CI gate
GitHub Actions runs `verify.sh` on PR + push; a single required **`ci-passed`** aggregator check
gates merges (merge queue via `merge_group`). Failures surface specific artifacts (Playwright
trace, shrunk fast-check seed, visual diff image, perf report) so an agent can iterate without a
human. Pages deploy runs on green `main`/build branch.
