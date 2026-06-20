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
# V3 behavioral E2E + V4 visual + V5 runtime perf — ONE Playwright invocation with
# ONE shared webServer. (Starting a separate vite dev server per step was flaky in
# the CI Playwright container: the 3rd server start timed out. A single shared
# webServer for all browser projects is robust and faster.)
step "V3+V4+V5 browser (e2e/visual/perf)" $PM test:browser
# V5 — load/bundle budget (browser-free: vite build + JS size check)
step "V5 load budget" $PM test:budget

echo "================================"
if [ "$fail" -ne 0 ]; then echo "VERIFY: FAIL"; exit 1; fi
echo "VERIFY: ALL GREEN (V1–V5)"
exit 0
