# 09 — Agentic Workflow: Driving a Long-Running Game Build from One `/goal` Prompt

**Status:** research + orchestration design
**Date:** 2026-06-20
**Scope:** How to run a multi-day game build to completion from a single goal prompt using Claude Code's
subagents, workflows, hooks (especially the Stop hook behind `/goal`), and automatic verification —
surviving an ephemeral cloud container by committing/pushing aggressively.

All facts below are sourced from Anthropic's official docs. URLs are cited inline and collected at the
bottom. (`docs.anthropic.com` 403s for fetch; the live docs are served at `code.claude.com/docs`.)

---

## 0. TL;DR — the recommended design

1. A single human turn runs **`/goal`** with a *verifiable* completion condition. `/goal` is a thin
   wrapper around a **session-scoped prompt-based Stop hook**: after every turn a small fast model
   (Haiku) re-reads the transcript, decides yes/no on the condition, and if "no" feeds a reason back
   and starts another turn. This is the mechanism that "keeps going" with no human in the loop.
2. The condition points at a **checklist file in the repo** (`docs/PLAN.md` / `docs/TASKS.md`) and a
   **deterministic verification gate** (`scripts/verify.sh`). The goal is met only when every task is
   checked off **and** the verify script exits 0 **and** the work is committed & pushed.
3. The main session is the **orchestrator**: it reads the checklist, picks the next unchecked task,
   delegates heavy/parallel work to **subagents** (each in its own context window), runs verification,
   commits + pushes, checks the box, and lets the goal evaluator decide whether to loop again.
4. Because the cloud container is **ephemeral** (fresh VM per session, only the git clone persists),
   **commit + push after every task is non-negotiable** — it is the only durable state. A
   `SessionStart` hook re-installs deps and re-derives progress from the repo on resume.
5. Add a **second-opinion adversarial review** (a fresh verification subagent or `/code-review`) before
   any task is marked done, so the agent doing the work is not the one grading it.

---

## 1. Claude Code on the web / remote environments

Source: https://code.claude.com/docs/en/claude-code-on-the-web

**What it is.** Claude Code on the web runs tasks on Anthropic-managed cloud infrastructure at
`claude.ai/code` (research preview for Pro/Max/Team and qualifying Enterprise seats). "Sessions persist
even if you close your browser, and you can monitor them from the Claude mobile app."

**The environment is ephemeral — this is the central constraint for a multi-day build.**
- "Each session runs in a fresh Anthropic-managed VM with your repository cloned."
- "Cloud sessions start from a fresh clone of your repository. **Anything committed to the repo is
  available. Anything you've installed or configured only on your own machine is not.**"
- What carries over (because it's in the clone): `CLAUDE.md`, `.claude/settings.json` (hooks),
  `.mcp.json`, `.claude/rules/`, and **`.claude/skills/`, `.claude/agents/`, `.claude/commands/`**.
- What does NOT carry over: your *user-level* `~/.claude/...` config, `claude mcp add` servers, static
  secrets (no secrets store yet — env vars are visible to anyone who can edit the environment).
- **Implication:** every agent, skill, command, hook, plan, and verification script our build relies on
  MUST be committed into the repo's `.claude/` and `docs/` — not user config.

**Session lifecycle / how long tasks persist.**
- Sessions persist across browser close and are monitorable from mobile.
- BUT: "Cloud sessions stop after a period of inactivity and the underlying environment is reclaimed."
  Resuming surfaces `Could not resume session ... its environment has expired. Creating a fresh session
  instead.` Reopening "provision[s] a fresh environment with your conversation history restored."
- The setup-script filesystem snapshot (cache) expires after **~7 days**.
- **Implication for a multi-day build:** do not assume one VM lives for days. Treat each session as
  potentially short-lived; durability comes from **git**, not the VM. Conversation history may restore,
  but the filesystem may not — so progress must be re-derivable from committed files.

**Resource limits (per session).** ~4 vCPUs, 16 GB RAM, 30 GB disk. Large builds/tests may be
terminated. For heavier workloads use Remote Control on your own hardware.

**Environment config & dependencies.**
- **Setup script** (attached to the *cloud environment*, configured in the web UI): Bash, runs as root
  on Ubuntu 24.04 *before* Claude Code launches, only when no cache snapshot exists. Keep it under ~5
  min so the snapshot can build. Non-zero exit fails the session (use `|| true` for non-critical steps).
  Its filesystem output is **cached** and reused, so installed packages persist across sessions.
- **`SessionStart` hook** (attached to the *repo* in `.claude/settings.json`): runs after Claude
  launches, **on every session including resumed**, in both local and cloud. Use it for project setup
  that should run everywhere (e.g., `npm install`). Gate cloud-only logic on `CLAUDE_CODE_REMOTE=true`.
- Pre-installed: Python/Node (20/21/22 via nvm)/Ruby/PHP/Java/Go/Rust/C++, Docker, Postgres 16, Redis,
  git, jq, ripgrep, tmux, plus **chromedriver** (relevant: lets a headless browser verify our WebGL game).
- `gh` CLI is NOT pre-installed (built-in GitHub tools cover issues/PRs/diffs/comments; install `gh` +
  `GH_TOKEN` for `gh release`/`gh workflow run`).

**Network policy.** Outbound is via a security proxy. Levels: **None / Trusted / Full / Custom**.
Default is **Trusted** = a large allowlist (package registries, GitHub, container registries, cloud
SDKs — full list in the doc). For domains outside it (e.g., a Three.js CDN, asset hosts like Kenney /
Sketchfab), use **Custom** and add them, optionally keeping the defaults. **None** breaks package
installs. Note: our games currently load Three.js from a CDN — either vendor Three.js into the repo or
allowlist the CDN domain so cloud sessions can run/verify.

**GitHub / commit-push discipline (the durability mechanism).**
- GitHub access via the Claude GitHub App or `/web-setup` (syncs local `gh` token).
- All git goes through a **GitHub proxy** that "restricts git push operations to the current working
  branch for safety" — i.e., a cloud session works on and pushes to **one branch**.
- Commits Claude makes in a web session carry a `Claude-Session: <url>` trailer; PR bodies include the
  session URL (toggle via `attribution.sessionUrl`).
- **Auto-fix PRs**: Claude can subscribe to a PR's CI failures and review comments and push fixes
  automatically (requires the GitHub App). Useful as the "outer loop" that keeps a build healthy after
  the initial run lands a PR.

**Moving between surfaces.** `claude --remote "<task>"` starts a *new* cloud session from the current
repo's GitHub remote at the current branch (**push first** — the VM clones from GitHub, not your disk).
`--remote` runs many sessions in parallel. `--teleport` / `/teleport` pulls a cloud session (and its
branch) into your terminal to continue locally. Plan-locally-execute-remotely is a recommended pattern:
build a plan in plan mode, commit it, then `claude --remote "Execute the plan in docs/PLAN.md"`.

**Limits.** Shares account rate limits; parallel sessions consume proportionally more. Org IP
allowlisting breaks cloud sessions (API call originates from Anthropic infra). `/clear` and interactive
pickers (`/model`, `/config`) are unavailable in web; `/compact`, `/context` work.

---

## 2. Subagents / the Agent (Task) tool

Source: https://code.claude.com/docs/en/sub-agents

**Core idea.** A subagent is a specialized assistant that "runs in its own context window with a custom
system prompt, specific tool access, and independent permissions." Claude delegates when a task matches
the subagent's `description`; the subagent works independently and **returns only a summary** to the
main conversation. This is the key to keeping the orchestrator's context clean across a long build.
(Note: as of v2.1.63 the `Task` tool was renamed **`Agent`**; `Task(...)` still works as an alias.)

**Built-in subagents.** `Explore` (Haiku, read-only, fast search), `Plan` (read-only, planning research),
`general-purpose` (all tools, multi-step exploration + action). Explore/Plan are one-shot and return no
agent ID (can't be resumed); `general-purpose` and custom subagents can be resumed.

**Definition (file format).** Markdown + YAML frontmatter in `.claude/agents/` (project; commit these!)
or `~/.claude/agents/` (user; does NOT reach cloud). Only `name` and `description` are required:

```markdown
---
name: game-feature-builder
description: Implements one gameplay feature end-to-end. Use proactively for build tasks.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet            # sonnet|opus|haiku|fable|<full-id>|inherit (default inherit)
permissionMode: acceptEdits
isolation: worktree      # optional: isolated git worktree copy of the repo
background: false        # true => always runs concurrently
maxTurns: 40             # cap agentic turns
skills: [game-conventions]   # preload skill content into the subagent's context
---
System prompt / instructions for the subagent go here.
```

Other frontmatter fields: `disallowedTools`, `mcpServers`, `hooks`, `memory` (`user`/`project`/`local`
persistent memory dir — `project` recommended so learnings are committed), `effort`, `color`,
`initialPrompt`. Subagents can also be defined per-session via `--agents '{...}'` JSON.

**Context isolation — what a subagent sees at startup.** Fresh, isolated context: its own system prompt
+ environment details, the delegation/task message Claude writes, CLAUDE.md + memory hierarchy, and a
git-status snapshot. It does **not** see the main conversation history or files already read.
(`Explore`/`Plan` skip CLAUDE.md and git status for speed.) If a rule must reach a subagent, restate it
in the delegation prompt.

**Isolation: worktrees.** `isolation: worktree` runs the subagent in a temporary git worktree — an
isolated copy of the repo branched (by default) from the default branch. Cleaned up automatically if the
subagent makes no changes. Use this when parallel subagents would otherwise collide on the same files.

**Parallelism & orchestration patterns.**
- *Isolate high-volume output*: "Use a subagent to run the test suite and report only the failing tests."
  Verbose logs stay in the subagent's context.
- *Parallel research/work*: spawn multiple subagents for independent investigations; Claude synthesizes.
  Best when paths don't depend on each other. Warning: each returns results into the main context, so
  many detailed returns can still bloat it.
- *Chain*: reviewer subagent → optimizer subagent, passing context between.
- *Foreground vs background*: background subagents run concurrently, with already-granted permissions,
  auto-denying anything that would prompt. (`Ctrl+B` to background; `background: true` in frontmatter.)
- *Nested subagents* (v2.1.172+): a subagent can spawn its own subagents, up to **depth 5** (fixed).
- *Restrict spawning*: `tools: Agent(worker, researcher)` allowlists which subagent types the main
  thread can spawn; omit `Agent` entirely to forbid spawning.

**Limits to respect.** Each subagent return consumes main-conversation context — fan out, but keep
returns terse ("report only failing tests / a one-line status"). For sustained parallelism beyond one
context window, use **agent teams** (each worker has its own context; enable with
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) or a **dynamic workflow** (below).

**Resume.** Subagent transcripts persist independently (`.../subagents/agent-<id>.jsonl`) and survive
main-conversation compaction; they can be resumed within the same session.

---

## 3. Dynamic workflows — orchestrating subagents at scale

Source: https://code.claude.com/docs/en/workflows

A **dynamic workflow** is a JavaScript script (Claude writes it; a runtime executes it in the
background) that orchestrates subagents at scale. Unlike turn-by-turn subagent delegation, **the script
holds the plan, the loop, the branching, and the intermediate results** — only the final answer lands in
Claude's context. Requires v2.1.154+; on by default on paid plans (toggle in `/config` on Pro).

**When to use vs. subagents/skills/teams** (from the doc's comparison):
| | Subagents | Skills | Agent teams | Workflows |
|---|---|---|---|---|
| Who decides next | Claude, turn by turn | Claude | Lead agent | The script |
| Intermediate results | Claude's context | Claude's context | Shared task list | Script variables |
| Scale | A few per turn | Same | A handful of peers | **Dozens–hundreds/run** |
| Interruption | Restarts the turn | Restarts the turn | Teammates keep running | **Resumable in the same session** |

**How to invoke.** Built-in `/deep-research`; or include `ultracode` in a prompt (or "use a workflow");
or `/effort ultracode` to let Claude plan a workflow for every substantive task. Save a good run's
script with `/workflows` → `s` into `.claude/workflows/` (commit to repo).

**Limits.** Up to **16 concurrent agents** (fewer on small machines), **1,000 agents total per run**, no
mid-run user input (only permission prompts pause it), the script itself has no filesystem/shell access
(agents do). Workflow subagents always run in `acceptEdits` and inherit your tool allowlist regardless
of session mode. **Resume only works within the same session** — exiting Claude restarts the workflow
fresh, which matters in the ephemeral cloud.

**Verdict for our build:** workflows are ideal for a *bounded parallel phase* (e.g., "generate 12
levels", "port all 5 prototypes to the shared engine", "audit every game file for a bug"), but the
*spine* of a multi-day build is better held by `/goal` + a committed checklist, because that survives
session/VM death whereas a workflow run does not.

---

## 4. The Claude Agent SDK

Source: https://code.claude.com/docs/en/agent-sdk/overview (+ headless: /en/headless)

**What it is.** "Build production AI agents with Claude Code as a library" — the same tools, agent loop,
and context management, programmable in **Python** (`pip install claude-agent-sdk`, 3.10+) and
**TypeScript** (`npm i @anthropic-ai/claude-agent-sdk`, bundles the binary). Auth via
`ANTHROPIC_API_KEY` (or Bedrock/Vertex/Foundry env flags). Note: not allowed to use claude.ai login for
third-party products — use API-key auth.

**Core API.** `query({ prompt, options })` streams messages; Claude handles the tool loop autonomously
(vs. the Client SDK where you implement the loop yourself).

```python
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition
async for message in query(
    prompt="Build the next unchecked task in docs/TASKS.md",
    options=ClaudeAgentOptions(
        allowed_tools=["Read","Edit","Write","Bash","Grep","Glob","Agent"],
        permission_mode="acceptEdits",
        agents={"verifier": AgentDefinition(
            description="Runs verify.sh and reports pass/fail only.",
            prompt="Run scripts/verify.sh; report exit code and failing items.",
            tools=["Bash","Read"])},
        hooks={...},
    )):
    ...
```

**Relevant capabilities for our build:** built-in tools (Read/Write/Edit/Bash/Glob/Grep/WebSearch/
WebFetch + **Monitor** = watch a background script and react per output line); **subagents** via
`agents={...}` (include `Agent` in `allowedTools` to auto-approve spawns; subagent messages carry
`parent_tool_use_id`); **hooks** as callback functions (`PreToolUse`, `PostToolUse`, `Stop`,
`SessionStart`, ...); **permissions** via `allowed_tools` / permission modes; **sessions** captured from
the `init` system message and resumed via `resume=session_id`. The SDK also loads filesystem config
(`.claude/skills`, `.claude/commands`, `.claude/agents`, `CLAUDE.md`) unless restricted via
`setting_sources`/`settingSources`.

**Headless / programmatic.** `claude -p "<prompt>"` runs non-interactively (no session) with
`--output-format text|json|stream-json`, `--allowedTools`, `--permission-mode`. Crucially, **`/goal`
works in `-p` mode and runs the loop to completion in a single invocation**:
`claude -p "/goal <verifiable condition>"`. This is how to drive the whole build from one command in
CI/cron/Routines, and where the Agent SDK fits if we want programmatic control instead of the CLI.

**SDK vs Managed Agents.** For *long-running, asynchronous, sandboxed* production agents without
operating our own infra, **Managed Agents** (hosted REST API) is the productionization path; the Agent
SDK runs the loop in our own process on our filesystem. A common path is prototype with the SDK, then
move to Managed Agents.

---

## 5. Skills, slash commands, hooks, and the Stop-hook "goal" loop

### Skills & slash commands
Sources: https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/commands

- **Custom commands have merged into skills.** `.claude/commands/foo.md` and
  `.claude/skills/foo/SKILL.md` both create `/foo`. New work should use skills.
- `SKILL.md` = YAML frontmatter (`name`, `description`, optional `allowed-tools`,
  `disable-model-invocation: true` to make it manual-only, `context: fork` to run in a subagent) +
  markdown body. The body loads **only when used** (progressive disclosure), so long procedures cost
  almost nothing until invoked.
- **Dynamic context injection:** a `` !`shell command` `` line in a skill is executed and its output
  inlined before Claude sees the skill — e.g., `` !`git diff HEAD` `` or `` !`cat docs/TASKS.md` ``.
  This is how a skill grounds itself in live repo state.
- `$ARGUMENTS` passes invocation args (e.g., `/build-task 7`).
- Skills/commands in the repo's `.claude/` reach cloud sessions; user-level ones don't.
- Bundled skills relevant here: **`/run`** (launch & drive the app), **`/verify`** (build+run to confirm
  a change without falling back to tests), **`/run-skill-generator`** (records a per-project launch
  recipe into `.claude/skills/run-<name>/` — run once so `/run` and `/verify` know how to start our
  WebGL game), **`/code-review`** (fresh-subagent diff review for bugs), **`/loop`**, **`/batch`**.

### Hooks
Source: https://code.claude.com/docs/en/hooks

- Configured in `settings.json` (`hooks` key), nested as event → matcher → hooks[]. Handler types:
  `command` (shell, JSON on stdin), `http`, `mcp_tool`, `prompt` (ask a model yes/no), `agent`.
- Key events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`/`PostToolUse`, **`Stop`**,
  **`SubagentStop`**, `SubagentStart`, `PreCompact`. Scopes: user/project/local/plugin/managed.
- **Output / control:** exit 0 = success (stdout JSON processed); **exit 2 = blocking error** (stderr
  becomes the reason); other non-zero = non-blocking. JSON can set `continue`, `systemMessage`,
  `hookSpecificOutput.additionalContext`, and `decision`.
- **Stop hook = forcing continuation.** For the `Stop` event, blocking (`exit 2`, or
  `{"decision":"block","reason":"..."}`) **prevents Claude from stopping and forces another turn**, with
  the reason fed back as guidance. This is the raw primitive under `/goal`. Important guardrail (from
  best-practices): **Claude Code overrides the hook and ends the turn after 8 consecutive blocks** — so
  a Stop hook can't loop forever, and `/goal`'s evaluator is what should decide completion.
- `SessionStart` hooks can write env vars to `$CLAUDE_ENV_FILE` and inject `additionalContext`. In
  cloud, only **repo-committed** hooks run; gate cloud-only setup with `CLAUDE_CODE_REMOTE`.
- Frontmatter hooks in a subagent: a `Stop` hook there is auto-converted to `SubagentStop`.

### `/goal` — keep Claude working toward a goal (the centerpiece)
Source: https://code.claude.com/docs/en/goal (requires v2.1.139+)

- `/goal <condition>` sets a **completion condition**; Claude keeps working across turns without you
  prompting each step. "After each turn, a small fast model checks whether the condition holds. If not,
  Claude starts another turn instead of returning control to you. The goal clears automatically once the
  condition is met." Setting a goal **starts a turn immediately**.
- **It is literally a wrapper around a session-scoped prompt-based Stop hook.** Each turn, the condition
  + the conversation so far are sent to the configured small fast model (defaults to **Haiku**); it
  returns yes/no + a short reason. "No" → keep working, reason becomes guidance. "Yes" → clears the goal.
- **The evaluator does NOT run commands or read files** — it judges only what Claude has surfaced in the
  transcript. So the condition must be something **Claude's own output can demonstrate** (e.g., "all
  tests in test/auth pass" works because Claude runs them and the result lands in the transcript).
- An effective condition has: **one measurable end state**, **a stated check** ("`npm test` exits 0",
  "`git status` is clean"), and **constraints that must not change**. Up to **4,000 chars**. Add a bound
  like `or stop after 20 turns` to cap runtime.
- Status: `/goal` (no args) shows condition, elapsed, turns evaluated, token spend, last reason.
  `/goal clear` (aliases stop/off/reset/none/cancel) ends it; `/clear` also clears it.
- **Resume:** a goal active when a session ends is **restored on `--resume`/`--continue`** (turn/timer/
  token baselines reset). This is what lets a goal survive across the ephemeral cloud session boundary.
- **Non-interactive:** `claude -p "/goal <condition>"` runs the loop to completion in one invocation.
- **Requirements:** workspace must be trusted; unavailable if `disableAllHooks` or `allowManagedHooksOnly`.

**`/goal` vs `/loop` vs raw Stop hook** (from the doc):
| Approach | Next turn starts when | Stops when |
|---|---|---|
| `/goal` | Previous turn finishes | A model confirms the condition is met |
| `/loop` | A time interval elapses | You stop it, or Claude decides done |
| Stop hook | Previous turn finishes | Your own script/prompt decides |

### Verification — four gates of increasing strength
Source: https://code.claude.com/docs/en/best-practices ("Give Claude a way to verify its work")
1. **In one prompt:** "run the check and iterate" — works today, no setup.
2. **Across a session:** set the check as a **`/goal` condition** — re-checked every turn.
3. **As a deterministic gate:** a **`Stop` hook script** blocks the turn until the check passes
   (overridden after 8 consecutive blocks).
4. **Second opinion:** a **verification subagent** or **dynamic workflow** where a fresh model tries to
   refute the result, so "the agent doing the work isn't the one grading it."
Always have Claude **show evidence** (test output, exit codes, screenshots), not assert success.

---

## 6. ORCHESTRATION DESIGN for this project (the deliverable)

This repo is a Three.js browser game arcade (5 prototypes + an evolving CoD-style FPS "NEON BREACH").
The goal: pick the "big build" and drive it to completion from one prompt. Here is how to wire it.

### 6.1 Durable artifacts to commit (so the ephemeral VM can't lose progress)
Everything the run depends on lives **in the repo** (cloud sessions only see the clone):

```
CLAUDE.md                         # build rules, commands, commit/verify discipline (loaded every session)
docs/PLAN.md                      # the MASTER PLAN: phases, architecture, "definition of done"
docs/TASKS.md                     # the CHECKLIST: ordered, atomic tasks with [ ]/[x] boxes + acceptance
docs/VERIFICATION.md              # how each task is proven; the meaning of a green verify.sh
scripts/verify.sh                 # ONE deterministic gate: lint + build + tests + headless smoke → exit 0/1
scripts/install_pkgs.sh           # deps install (idempotent), run by SessionStart hook
.claude/settings.json            # SessionStart hook, Stop-hook (optional), permission allowlist
.claude/agents/*.md              # builder, verifier, asset, reviewer subagents
.claude/skills/build-next-task/  # the /build-next-task skill (the per-task procedure)
.claude/skills/run-<name>/       # recorded launch recipe from /run-skill-generator
```

`docs/TASKS.md` is the single source of truth for progress. Each task is small enough to finish and
verify in one delegation, and is independently checkable. Example shape:

```markdown
## Phase 2 — Core gameplay
- [ ] T2.1 Port NEON BREACH onto the shared engine.js (no duplicated renderer setup)
      ACCEPT: shooter loads via engine.js; `scripts/verify.sh` exits 0; headless smoke screenshot non-blank
- [ ] T2.2 Add Rapier physics for player movement; remove hand-rolled gravity
      ACCEPT: movement test passes; no console errors in headless run; commit pushed
```

### 6.2 The one prompt
A single human turn (CLI, web, or `-p`) sets a `/goal` whose condition references the committed files
and the deterministic gate. Because the `/goal` evaluator only reads the transcript, the condition tells
Claude exactly what evidence to surface:

```
/goal Every task in docs/TASKS.md is checked [x] AND scripts/verify.sh has been run and printed
exit code 0 on its latest run AND `git status` shows a clean tree with all work pushed to the
build branch. Each turn: show the current `docs/TASKS.md` checklist, the verify.sh output with its
exit code, and `git log --oneline -3`. Do NOT mark a task [x] until verify.sh passes for it and a
verification subagent has confirmed its acceptance criteria. Stop after 200 turns if not complete.
```

Non-interactive equivalent for cloud/cron/Routines: `claude -p "/goal <same condition>"`.

### 6.3 The loop (what each turn does)
The main session acts as orchestrator; the `/goal` Stop-hook evaluator decides whether to go again:

1. **Re-derive state from the repo** (survives VM loss): read `docs/TASKS.md`; find the first `[ ]` task.
   (A `/build-next-task` skill inlines `` !`grep -n "\[ \]" docs/TASKS.md | head -1` `` for grounding.)
2. **Delegate the work** to the `game-feature-builder` subagent (its own context; verbose build/test
   logs stay there; it returns a terse summary). Use `isolation: worktree` only if running tasks in
   parallel that touch different files; for a serial spine, plain delegation + commit is simpler.
3. **Verify deterministically:** run `scripts/verify.sh`; the orchestrator surfaces the exit code +
   failing items into the transcript (this is the evidence the goal evaluator reads).
4. **Adversarial second opinion:** spawn a fresh `verifier`/`reviewer` subagent (or run `/code-review`)
   that sees only the diff + the task's acceptance criteria and reports gaps that affect correctness.
5. **Commit + push immediately** (the only durable state). One commit per task, descriptive message; the
   web session pushes to the single working branch (GitHub proxy restricts push to current branch).
6. **Check the box:** flip `[ ]`→`[x]` in `docs/TASKS.md`, commit that too.
7. **Return control.** The goal evaluator re-reads the transcript: if any task is still `[ ]` or
   verify.sh isn't green, it says "no" + a reason and a new turn starts on the next task. When all boxes
   are checked, verify is green, and the tree is clean/pushed → "yes", goal clears, run ends.

### 6.4 Subagents to define (`.claude/agents/`)
- **`game-feature-builder`** (tools: Read/Edit/Write/Bash/Grep/Glob; model: sonnet or opus; memory:
  project): implements one task end-to-end, runs verify before returning, reports a one-line status.
- **`verifier`** (tools: Bash, Read; small/cheap model): runs `scripts/verify.sh` + headless smoke and
  reports pass/fail + failing items ONLY (isolates verbose output).
- **`reviewer`** (tools: Read, Grep, Glob, Bash; fresh context): reviews the task diff against acceptance
  criteria; "report gaps that affect correctness, not style." (Or just use bundled `/code-review`.)
- **`asset-fetcher`** (optional; mcpServers/WebFetch; needs the asset host allowlisted under Custom
  network): pulls CC0 assets (Kenney/Sketchfab) and vendors them into the repo.
- For a bounded fan-out phase (e.g., "build 12 levels"), let Claude write a **dynamic workflow**
  (`ultracode`/`/effort ultracode`) capped at 16 concurrent / 1,000 total agents; save it to
  `.claude/workflows/`. Keep the *spine* on `/goal`, not the workflow (workflows don't resume across
  sessions; `/goal` does).

### 6.5 Surviving interruption (the ephemeral container)
- **Commit + push after every task** — restate this as an `IMPORTANT`/`YOU MUST` rule in `CLAUDE.md`,
  and optionally enforce it with a `Stop` hook or `PostToolUse` reminder. Uncommitted work dies with the
  VM; `git push` to the build branch is the checkpoint.
- **`SessionStart` hook** (repo `.claude/settings.json`) re-installs deps each session
  (`scripts/install_pkgs.sh`, gated on `CLAUDE_CODE_REMOTE`) and can inject `additionalContext`
  reminding Claude to read `docs/TASKS.md` and resume from the first unchecked task.
- **`/goal` restoration:** an active goal is restored on `--resume`/`--continue`, so if the session is
  reopened after the VM is reclaimed, the goal keeps driving — and even if it weren't, progress is fully
  re-derivable from `docs/TASKS.md` + git.
- **Setup script** (cloud env UI) installs heavy/slow toolchains that benefit from the ~7-day filesystem
  cache; the `SessionStart` hook handles fast, always-fresh project deps.
- **Network:** vendor Three.js into the repo (README already flags this as the path to offline play) or
  add the CDN + any asset domains under **Custom** network access, so cloud sessions can run/verify.
- **Branch hygiene:** one long-lived build branch (push is restricted to the current branch anyway);
  open a PR and optionally enable **Auto-fix** so CI failures/review comments are handled automatically
  as an outer loop after the run lands.

### 6.6 Why this is reliable from one prompt
- **One verifiable end state** (all boxes checked + `verify.sh` exits 0 + clean/pushed tree) that the
  Haiku evaluator can confirm purely from transcript evidence the orchestrator is told to surface.
- **Determinism where it matters** (`verify.sh`, the checklist) and **judgment where it helps** (the
  evaluator's per-turn reason, the adversarial reviewer).
- **Context stays clean** because heavy work is isolated in subagents that return summaries.
- **Durability** because the only state that matters is committed git — the VM is treated as disposable.
- **Bounded** via the `or stop after N turns` clause and the 8-consecutive-block Stop-hook cap, so a
  stuck run halts instead of burning tokens forever.

---

## 7. Open questions / things to confirm before kicking off
- Pin the Claude Code version: `/goal` needs ≥ v2.1.139, dynamic workflows ≥ v2.1.154, nested subagents
  ≥ v2.1.172. Confirm the cloud build is recent enough.
- Decide Three.js: vendor into repo (preferred for offline/cloud determinism) vs. allowlist CDN.
- Write `scripts/verify.sh` so it returns a *true* signal for a WebGL game: lint + (any) unit tests +
  a **headless chromedriver smoke run** that loads each game and fails on a console error or a blank
  first frame. Use `/run-skill-generator` once to record the launch recipe.
- Confirm secrets strategy (no cloud secrets store yet) if any asset host needs auth.
- Confirm 16 GB RAM / 30 GB disk is enough for the chosen engine/asset pipeline; else use Remote Control.

---

## 8. Sources (official Anthropic / Claude Code docs)
- Claude Code on the web: https://code.claude.com/docs/en/claude-code-on-the-web
- Get started (web): https://code.claude.com/docs/en/web-quickstart
- Remote Control: https://code.claude.com/docs/en/remote-control
- Create custom subagents: https://code.claude.com/docs/en/sub-agents
- Subagents in the SDK: https://code.claude.com/docs/en/agent-sdk/subagents
- Run agents in parallel: https://code.claude.com/docs/en/agents
- Dynamic workflows: https://code.claude.com/docs/en/workflows
- Agent teams: https://code.claude.com/docs/en/agent-teams
- Worktrees: https://code.claude.com/docs/en/worktrees
- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- Agent loop: https://code.claude.com/docs/en/agent-sdk/agent-loop
- Headless / programmatic: https://code.claude.com/docs/en/headless
- Hooks reference: https://code.claude.com/docs/en/hooks
- Hooks guide: https://code.claude.com/docs/en/hooks-guide
- Keep Claude working toward a goal (`/goal`): https://code.claude.com/docs/en/goal
- Skills: https://code.claude.com/docs/en/skills
- Commands: https://code.claude.com/docs/en/commands
- Best practices: https://code.claude.com/docs/en/best-practices
- Scheduled tasks / `/loop` / Routines: https://code.claude.com/docs/en/scheduled-tasks
- Settings reference: https://code.claude.com/docs/en/settings
- Permission modes: https://code.claude.com/docs/en/permission-modes
- Docs index (machine-readable): https://code.claude.com/docs/llms.txt
```
