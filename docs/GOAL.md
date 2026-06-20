# NEON BREACH — The Goal (start the build with ONE prompt)

> This is the single `/goal` you run to execute the entire plan. **Do not run it until you're
> ready for the multi-day build to begin.** Everything it needs (plan, tasks, verification,
> workflow, `.claude/` machinery) is already in the repo.

## The goal prompt to run

Copy-paste this as your `/goal` (it's written to be **demonstrable from the transcript**, which is
all the goal evaluator can see — see `WORKFLOW.md §1`):

```
/goal Build NEON BREACH to a finished v1 per docs/GAME_DESIGN.md, executing docs/MASTER_PLAN.md and
working through docs/TASKS.md in order. The project is NOT scaffolded yet — START with Phase 0 (T-001…) to create
the real Vite+TypeScript+Three.js(WebGPU)+Rapier project, then continue through every phase. Use
ONLY free/CC0 assets (Kenney/Quaternius/KayKit, Poly Haven/ambientCG, Mixamo) — no paid or
AI-generated assets (locked v1 policy). For each unchecked task: delegate it to a
game-feature-builder subagent, then run `bash scripts/verify.sh` and paste its full output, then
have a reviewer subagent review the diff, then commit and push, then flip the task's checkbox to
[x] with the commit SHA. Honor the phase gates and the determinism / sim-presentation rules. The
goal is COMPLETE only when: (a) every checkbox in docs/TASKS.md is [x] (or [!] with a stated
reason), AND (b) the latest `bash scripts/verify.sh` shown in the transcript exited 0 with all five
verifiers passing, AND (c) docs/COMPETITORS.md shows a v1 weighted total > 3.7 with feel pillars
each >= 4.0. After each task report: which task, verify.sh exit code, and tasks remaining. Commit
+ push after every task so progress survives if the session ends.
```

## Completion condition (what "done" means)
1. **All tasks checked** — every `[ ]` in `docs/TASKS.md` is `[x]` (or `[!]` with a reason).
2. **Verifiers green** — the most recent `scripts/verify.sh` in the transcript exited 0 (V1–V5).
3. **Quality target met** — `docs/COMPETITORS.md` records a v1 weighted total **> 3.7**, feel
   pillars (gunplay/movement/juice/audio) each **≥ 4.0**, none < 3.0.

When all three hold and are visible in the transcript, the goal auto-clears.

## How to run it (recommended: run once, re-paste when it pauses)
A single `/goal` already works **many turns back-to-back on its own** (it's a Stop hook — it keeps
building task after task until a safety valve trips after ~8 consecutive turns). So:
- **Paste the `/goal` once.** Let it churn through a batch of tasks (build → verify → review →
  commit → check box).
- **When it pauses, glance at progress** (checkboxes in `docs/TASKS.md`) and **paste the same
  `/goal` again.** It resumes from the first unchecked task because all progress is committed.
- **Fresh session is fine** — the `SessionStart` hook reinstalls deps; just paste the goal again.

### Optional: unattended (only if you'll be away)
Wrap it in `/loop` with a **long** interval so runs don't overlap (a single task + verify can take
a while — don't use short intervals):
```
/loop 60m /goal <the full prompt above>
```
Each tick resumes from the first unchecked task and stops once the completion condition holds.
**You don't need `/loop`** — running the goal once and re-pasting is the simpler, safer default.
- **Watch a PR (optional).** If a PR is opened, you can subscribe to its CI and let failures
  auto-fix.
- **Trust the gate, not vibes.** Progress = checkboxes flipped + `verify.sh` green in the
  transcript + rubric rows in `COMPETITORS.md`. If those aren't moving, something's wrong.

## Before the very first run (one-time prerequisites)
These are the first tasks in `docs/TASKS.md` (Phase 0); the goal will do them, but they're called
out because nothing else works until they exist:
- `package.json` + Vite + TypeScript + deps installed.
- `scripts/verify.sh` made real (wired to the actual lint/test/build/perf commands).
- `.claude/settings.json` `SessionStart` hook active (reinstalls deps on cloud restart).
- Three.js vendored or its CDN allowlisted under the environment's network policy.

## Guardrails the build must respect (don't let it cheat)
- Never check a box without `verify.sh` green **and** the task's acceptance criteria **and** a
  reviewer pass (`VERIFICATION.md §3`).
- Never raise a `COMPETITORS.md` score without evidence.
- Never claim native-AAA visual parity; state the honest ceiling (`MASTER_PLAN.md §2`).
- Commit + push after every task; push only to the working branch.
