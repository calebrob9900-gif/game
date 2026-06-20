#!/usr/bin/env node
/**
 * V5 (performance) gate. Two real checks:
 *   1. Production `vite build` succeeds and the bundled JS is within budget.
 *   2. Runtime frame-time probe in headless Chromium (SwiftShader) on the dev
 *      server, asserted against the looser CI budget in perf-budgets.json.
 *
 * GPU targets (frame.maxP95FrameMs, drawCalls) are the documented desktop bar;
 * Linux software-rendered numbers are a relative-regression signal (see
 * docs/VERIFICATION.md §2). Lighthouse/memlab are wired for GPU CI runners.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { chromium } from 'playwright';

const budgets = JSON.parse(readFileSync('perf-budgets.json', 'utf8'));
const PORT = 4178;
const URL = `http://127.0.0.1:${PORT}/`;
const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = httpRequest(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('dev server did not start'));
        else setTimeout(attempt, 500);
      });
      req.end();
    };
    attempt();
  });
}

async function main() {
  let fail = false;

  console.log('V5: building production bundle…');
  await run('pnpm', ['exec', 'vite', 'build']);

  let totalJs = 0;
  const assetsDir = 'dist/assets';
  if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
      if (f.endsWith('.js')) totalJs += statSync(`${assetsDir}/${f}`).size;
    }
  }
  const totalJsKb = Math.round(totalJs / 1024);
  console.log(`V5: bundled JS = ${totalJsKb} KB (budget ${budgets.load.maxTotalJsKb} KB)`);
  if (totalJsKb > budgets.load.maxTotalJsKb) {
    console.error('   ✗ JS bundle over budget');
    fail = true;
  } else {
    console.log('   ✓ bundle within budget');
  }

  console.log('V5: starting dev server for runtime probe…');
  const server = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForServer(URL);
    browser = await chromium.launch({ args: GL_ARGS });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(URL);
    await page.waitForFunction(() => window.__GAME_READY__ === true, { timeout: 30_000 });

    // (a) Render-loop liveness — proves the rAF/render loop isn't hung. Absolute
    // FPS is software-rendered (SwiftShader) so it is REPORTED, not gated on 60.
    await page.waitForTimeout(1600);
    const stats = await page.evaluate(() => window.__perf.sample(1200));
    console.log(
      `V5: render backend=${stats.backend} frames=${stats.frames} ` +
        `avgFps=${stats.avgFps.toFixed(1)} p95Frame=${stats.p95Frame.toFixed(1)}ms (software — reported)`,
    );
    if (stats.frames < budgets.ci.minRenderFrames) {
      console.error(
        `   ✗ render loop hung: ${stats.frames} < ${budgets.ci.minRenderFrames} frames`,
      );
      fail = true;
    } else if (stats.avgFps < budgets.ci.minAvgFps) {
      console.error(
        `   ✗ render loop stalled: avgFps ${stats.avgFps.toFixed(1)} < ${budgets.ci.minAvgFps}`,
      );
      fail = true;
    } else {
      console.log('   ✓ render loop live (liveness floor met)');
    }

    // (b) Sim-step CPU throughput — deterministic, GPU-independent. Catches
    // logic perf regressions (e.g. accidental O(n²)). This is the real gate.
    const batchTicks = budgets.ci.simBatchTicks;
    const simMs = await page.evaluate((n) => {
      const start = window.__GAME_STATE__().tick;
      const t0 = performance.now();
      window.__stepTo(start + n);
      return performance.now() - t0;
    }, batchTicks);
    const perTick = simMs / batchTicks;
    console.log(
      `V5: sim ${batchTicks} ticks in ${simMs.toFixed(1)}ms ` +
        `(${perTick.toFixed(3)}ms/tick, budget ${budgets.ci.maxSimBatchMs}ms total)`,
    );
    if (simMs > budgets.ci.maxSimBatchMs) {
      console.error(
        `   ✗ sim throughput over budget: ${simMs.toFixed(1)}ms > ${budgets.ci.maxSimBatchMs}ms`,
      );
      fail = true;
    } else {
      console.log('   ✓ sim CPU throughput within budget');
    }
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }

  console.log(
    `V5 GPU target: p95 ≤ ${budgets.frame.maxP95FrameMs}ms, draw calls < ${budgets.drawCalls.maxTypical} ` +
      `(CI numbers are SwiftShader — relative).`,
  );
  if (fail) {
    console.error('V5: FAIL');
    process.exit(1);
  }
  console.log('V5: PASS');
  process.exit(0);
}

main().catch((err) => {
  console.error('V5 error:', err);
  process.exit(1);
});
