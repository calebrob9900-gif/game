#!/usr/bin/env node
/**
 * V5 load budget (browser-free): production `vite build` must succeed and the
 * bundled JS must stay within perf-budgets.json. The runtime FPS/sim-throughput
 * portion of V5 is tests/perf/perf.spec.ts (driven by Playwright's webServer).
 * Lighthouse (lighthouserc.json) is wired for GPU CI runners.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';

const budgets = JSON.parse(readFileSync('perf-budgets.json', 'utf8'));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

async function main() {
  console.log('V5 load: building production bundle…');
  await run('pnpm', ['exec', 'vite', 'build']);

  let totalJs = 0;
  const assetsDir = 'dist/assets';
  if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
      if (f.endsWith('.js')) totalJs += statSync(`${assetsDir}/${f}`).size;
    }
  }
  const totalJsKb = Math.round(totalJs / 1024);
  console.log(`V5 load: bundled JS = ${totalJsKb} KB (budget ${budgets.load.maxTotalJsKb} KB)`);
  if (totalJsKb > budgets.load.maxTotalJsKb) {
    console.error('   ✗ JS bundle over budget');
    process.exit(1);
  }
  console.log('   ✓ bundle within budget');
  console.log(
    `V5 GPU target: p95 ≤ ${budgets.frame.maxP95FrameMs}ms, draw calls < ${budgets.drawCalls.maxTypical} ` +
      `(runtime FPS gate is Playwright perf project; software numbers are relative).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('V5 load error:', err);
  process.exit(1);
});
