#!/usr/bin/env bash
# NEON BREACH — SessionStart hook.
# The cloud container is ephemeral (fresh VM each session); reinstall deps so the
# toolchain is ready, and point the agent at the next unchecked task. See docs/WORKFLOW.md.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT" || exit 0

# Only install if the project has been scaffolded (Phase 0). Be non-fatal.
if [ -f package.json ]; then
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install || true
  elif command -v npm >/dev/null 2>&1; then
    npm install || true
  fi
fi

echo "NEON BREACH session ready. Next: open docs/TASKS.md and work the first unchecked task."
echo "Run the build with the goal in docs/GOAL.md. Verify with: bash scripts/verify.sh"
exit 0
