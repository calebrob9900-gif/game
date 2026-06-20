# NEON BREACH — Build Workflow (how one `/goal` runs the whole thing)

> How the build executes itself: the `/goal` loop, subagent orchestration, verification, and
> surviving the ephemeral cloud container. Synthesizes `research/09` (Anthropic agentic docs)
> + `research/07` (verification). Read with `GOAL.md`.

## 1. The spine: `/goal` = a session-scoped Stop hook
`/goal <condition>` installs a Stop hook. After each turn, a fast model reads the **transcript**
and decides if `<condition>` holds; if not, it injects the reason and starts another turn — no
human prompting. It is restored on `--resume`/`--continue`.

**Critical consequence:** the evaluator only sees the transcript and runs no commands. Therefore
**the agent must, every turn, paste the evidence into the transcript** — the `scripts/verify.sh`
exit/output and the current `TASKS.md` checkbox state — so completion is judgeable. The completion
condition is written to be transcript-demonstrable (`GOAL.md`).

## 2. The per-task loop (what each turn does)
1. **Read `docs/TASKS.md`**; pick the first unchecked `[ ]` task whose dependencies are met.
2. **Delegate** the task to a `game-feature-builder` subagent (isolated context) with the task's
   spec + acceptance criteria + pointers to the relevant `research/*` and `ARCHITECTURE.md`.
3. **Verify:** run `bash scripts/verify.sh`; paste the result into the transcript.
4. **Adversarial review:** spawn a `reviewer` subagent on the diff; fix blocking findings.
5. **Commit + push** (`git push -u origin <branch>`), with the task ID in the message.
6. **Check the box** in `TASKS.md` → `[x]` and append the commit SHA; commit that too.
7. **Report status** in the turn: task done, `verify.sh` exit code, % tasks complete.
8. Let the goal evaluator decide whether to loop.

Parallelize **only** independent tasks via multiple subagents with `isolation: worktree`
(collision-free repo copies), then integrate + verify on the main working tree. Bounded fan-out
(e.g., "build N levels", "create M weapon defs") is a good place to parallelize.

## 3. Surviving the ephemeral container (git is the only durable state)
Each web session is a fresh VM with just the repo clone; it's reclaimed after inactivity. So:
- **Commit + push after every task.** Never batch large uncommitted work.
- Progress is **fully re-derivable** from `docs/TASKS.md` (checkboxes) + git history — if the
  session dies, a new one resumes by reading `TASKS.md` and continuing.
- All execution machinery lives **in the repo**: `.claude/agents/*`, `.claude/settings.json`
  (hooks), `scripts/verify.sh`, and these docs. (User-level config does **not** reach the cloud.)
- A `SessionStart` hook (gated on `CLAUDE_CODE_REMOTE`) reinstalls deps (`pnpm install`) on every
  (re)start so the toolchain is ready.
- Push only to the working branch (`claude/friendly-volta-escfw0`) — the GitHub proxy restricts it.

## 4. Subagents (defined in `.claude/agents/`, committed)
- **`game-feature-builder`** — implements one task end-to-end (code + tests), respecting the
  determinism/split rules; returns a summary + the files changed.
- **`verifier`** — runs `scripts/verify.sh`, summarizes failures with the specific artifact
  (trace/seed/diff/perf) so they're actionable. (Often the orchestrator just runs verify.sh
  directly; this agent is for deeper triage.)
- **`reviewer`** — adversarial diff review (correctness, scope, determinism violations, perf,
  test quality). The builder never grades itself.
- **`asset-fetcher`** (optional) — sources/optimizes a CC0 asset per the `research/05/13/14`
  pipeline and records it in the license ledger.

## 5. If `/goal` releases before completion
The Stop hook auto-overrides after ~8 consecutive blocks (a safety valve). For a multi-day build
that just means one `/goal` run does a chunk of tasks, then stops. Because all progress is
committed and the next task is always the first unchecked box, **simply re-run the same `/goal`
prompt to continue** — it picks up exactly where it left off. Optionally use the **`/loop`** skill
to auto-re-invoke the goal on an interval. Never rely on a single run finishing everything.

## 6. Phase gates
Don't start Phase N+1 until every Phase N task is `[x]` and the phase exit gate in
`MASTER_PLAN.md §7` passes (verify.sh green + the phase's rubric/perf targets met, recorded in
`COMPETITORS.md`). The orchestrator checks this before advancing.

## 7. Honesty rules (carry through the whole build)
- Never check a box that isn't truly verified (verify.sh green + acceptance criteria + reviewer).
- Never raise a rubric score without evidence.
- State the realistic ceiling (`MASTER_PLAN.md §2`); don't claim native-AAA visual parity.
- If a task is blocked or infeasible, mark it `[!]` with a one-line reason and continue; surface
  blockers in the status report rather than faking completion.
