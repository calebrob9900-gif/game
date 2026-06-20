import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * V5 runtime portion. Uses Playwright's (CI-proven) webServer rather than a
 * hand-rolled dev server. Gates GPU-INDEPENDENT signals only:
 *   - render-loop liveness (the rAF loop produces frames at all),
 *   - sim-step CPU throughput (deterministic; catches logic perf regressions).
 * Absolute software FPS (SwiftShader) is REPORTED, not gated (VERIFICATION.md §2).
 * Bundle-size load budget is checked separately by scripts/perf-budget.mjs.
 */
const here = dirname(fileURLToPath(import.meta.url));
const budgets = JSON.parse(readFileSync(join(here, '../../perf-budgets.json'), 'utf8')) as {
  ci: { minRenderFrames: number; minAvgFps: number; simBatchTicks: number; maxSimBatchMs: number };
};

test('render loop is live and sim CPU throughput is within budget', async ({ page }) => {
  await page.goto('/?seed=1337&scenario=perf');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, { timeout: 30_000 });

  // (a) Liveness: the render loop must actually produce frames.
  await page.waitForFunction(
    (min) => (window.__perf?.stats().frames ?? 0) >= min,
    budgets.ci.minRenderFrames,
    { timeout: 20_000 },
  );
  const stats = await page.evaluate(() => window.__perf!.sample(1200));
  console.log(
    `V5 runtime: backend=${stats.backend} frames=${stats.frames} ` +
      `avgFps=${stats.avgFps.toFixed(1)} p95Frame=${stats.p95Frame.toFixed(1)}ms (software — reported)`,
  );
  expect(stats.frames).toBeGreaterThanOrEqual(budgets.ci.minRenderFrames);
  expect(stats.avgFps).toBeGreaterThanOrEqual(budgets.ci.minAvgFps);

  // (b) Sim-step CPU throughput — deterministic, GPU-independent (the real gate).
  const n = budgets.ci.simBatchTicks;
  const simMs = await page.evaluate((ticks) => {
    const start = window.__GAME_STATE__!().tick;
    const t0 = performance.now();
    window.__stepTo!(start + ticks);
    return performance.now() - t0;
  }, n);
  console.log(
    `V5 runtime: sim ${n} ticks in ${simMs.toFixed(1)}ms (budget ${budgets.ci.maxSimBatchMs}ms)`,
  );
  expect(simMs).toBeLessThanOrEqual(budgets.ci.maxSimBatchMs);
});
