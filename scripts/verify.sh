#!/usr/bin/env bash
# NEON BREACH — verification gate. Runs V1..V5; exits 0 only if all pass.
# This is THE arbiter of "done" (see docs/VERIFICATION.md). CI runs the same script.
# Until Phase 0 (T-001..T-004) wires the project, it exits non-fatal-but-RED so nothing
# can be falsely marked verified.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT" || exit 1

fail=0
step() {
  local name="$1"; shift
  echo "── $name"
  if "$@"; then echo "   ✓ ok"; else echo "   ✗ FAIL ($name)"; fail=1; fi
}

if [ ! -f package.json ]; then
  echo "verify.sh: project not scaffolded yet (no package.json)."
  echo "Complete Phase 0 tasks T-001..T-004 in docs/TASKS.md first."
  exit 1
fi

PM="npm run -s"
command -v pnpm >/dev/null 2>&1 && PM="pnpm -s"

echo "== NEON BREACH verify (V1–V5) =="
# V1 — static
step "V1 lint"        $PM lint
step "V1 format"      $PM format:check
step "V1 typecheck"   $PM typecheck
# V2 — logic / deterministic replay
step "V2 unit+replay" $PM test
# V3 — behavioral E2E (Playwright drives the real game, asserts __GAME_STATE__)
step "V3 e2e"         $PM test:e2e
# V4 — visual snapshots (frozen frames)
step "V4 visual"      $PM test:visual
# V5 — performance budgets + Lighthouse + memory soak
step "V5 perf"        $PM test:perf

echo "================================"
if [ "$fail" -ne 0 ]; then echo "VERIFY: FAIL"; exit 1; fi
echo "VERIFY: ALL GREEN (V1–V5)"
exit 0
