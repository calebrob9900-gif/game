# NEON BREACH — documentation index

The plan to build a browser-based, headline-quality FPS the right way, and to drive the whole
build + verification from **one `/goal`**.

## Start here
1. **`GAME_DESIGN.md`** — the locked creative + scope spec (what the game IS). Read first.
2. **`MASTER_PLAN.md`** — honest scope/ceiling, tech stack, roadmap (serves GAME_DESIGN).
2. **`GOAL.md`** — the exact `/goal` prompt to start the build + the completion condition.
3. **`TASKS.md`** — the machine-checkable backlog the build executes (Phases 0–5).
4. **`WORKFLOW.md`** — how `/goal` + subagents + verify.sh drive it, and survive the ephemeral env.
5. **`VERIFICATION.md`** — the 5-verifier harness + Definition of Done + competitor rubric.
6. **`ARCHITECTURE.md`** — deterministic sim/presentation split, ECS, physics, source tree.
7. **`COMPETITORS.md`** — the scoreable comparison vs headline shooters (rubric + log).

## Research (the evidence base — all cited)
`research/01-competitors` · `02-rendering` · `03-gunplay` · `04-ai` · `05-assets` · `06-audio` ·
`07-tooling-verification` · `08-netcode` · `09-agentic-workflow` · `10-architecture` ·
`11-level-design` · `12-physics-collision` · `13-modular-kits` · `14-blender-pipeline`

## Execution machinery (in the repo, so it survives restarts)
- `../.claude/agents/` — `game-feature-builder`, `reviewer`, `verifier`, `asset-fetcher`.
- `../.claude/settings.json` + `../.claude/hooks/session-start.sh` — reinstall deps on (re)start.
- `../scripts/verify.sh` — the V1–V5 gate (the arbiter of "done"); CI runs the same script.

## The one-liner to begin (when you're ready — see GOAL.md for the full prompt)
> Execute `docs/MASTER_PLAN.md` by working through `docs/TASKS.md` in order: build each task with a
> subagent, run `scripts/verify.sh`, review the diff, commit+push, check the box — until every box
> is `[x]`, `verify.sh` is green, and `COMPETITORS.md` hits the v1 target.

> Note: `shooter.html` (and the other `*.html` prototypes + `COD_COMPARISON.md`) are the current
> single-file playable prototype that motivated this plan. NEON BREACH (this `docs/` plan) is the
> proper, verified rebuild as a real TypeScript/Three.js project under `src/`.
