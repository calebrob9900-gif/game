# 07 — Tooling & Automated Verification Harness

> Research date: June 2026
> Scope: Professional toolchain for a browser FPS (Three.js + TypeScript) **and** an automated, machine-checkable way to VERIFY each build's correctness, performance, and visual quality.
> Audience: build/DevOps + QA automation. The north star of this document is the **Verification Harness** (Section 5) and the **machine-checkable Definition of Done** (Section 7) — everything else exists to make those possible.

---

## 0. TL;DR — Recommended Stack

| Concern | Recommendation (June 2026) |
| --- | --- |
| Bundler / dev server | **Vite 7.x** (stable, plugin-safe; ESM-only, Node 20.19+/22.12+) or **Vite 8.0** (Rolldown/Oxc, ~10–30x faster builds, stable 2026-03-12) once plugins are verified |
| Language | **TypeScript 5.x**, `strict: true`, `moduleResolution: "bundler"`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`, `noUncheckedIndexedAccess` |
| 3D | **three** + **`@types/three`** (`~0.18x`; three.js ships NO bundled types — `@types/three` required; keep versions aligned) |
| Lint / format | **ESLint 9 flat config** + `typescript-eslint` v8 + `eslint-plugin-import-x` + **Prettier 3** (`eslint-config-prettier/flat`; Prettier owns formatting) |
| Package manager | **pnpm 10** (content-addressed store, strict isolation, catalog for version pinning; great CI caching) |
| Repo shape | **Single package to start**, structured so an `engine/` → `game/` split into a **pnpm workspace (+ Turborepo)** is cheap later |
| Unit / logic tests | **Vitest 3** (node env for pure sim, jsdom for DOM-light) + **fast-check** for property tests |
| In-browser / E2E / visual | **Playwright 1.59** (Chromium; SwiftShader software GL on Linux runners; `toHaveScreenshot` visual baselines) |
| Component-in-browser tests | **Vitest 3 Browser Mode** (Playwright provider) for HUD/UI + small WebGL units |
| Performance | rAF FPS/frame-time probe on `window`, **CDP** (`Performance`/`Tracing`/LoAF) via Playwright, **Lighthouse CI** for load budgets |
| Memory leaks | **memlab** (or CDP `HeapProfiler`) scenario tests in CI |
| CI/CD | **GitHub Actions** (lint/typecheck/unit/build/e2e/perf jobs + `ci-passed` aggregator), **GitHub Pages** deploy, required status checks + merge queue |

---

## 1. Project Tooling

### 1.1 Vite (Three.js + TypeScript)

Vite is the de-facto bundler/dev-server for Three.js + TS games: native ESM dev server with esbuild transforms, Rollup-based production builds, and first-class TS/HMR support. ([vite.dev HMR API](https://vite.dev/guide/api-hmr), [Wikipedia: Vite](https://en.wikipedia.org/wiki/Vite_(software)))

**Version (June 2026).** Vite **7.0** shipped 2025-06-24; the 7.x line is current and plugin-stable. Vite 7 is **ESM-only** and requires **Node 20.19+ or 22.12+** (Node 18 dropped). Vite **8.0** went stable **2026-03-12**, replacing esbuild+Rollup with the Rust bundler **Rolldown** + the **Oxc** compiler/minifier (claims 10–30x faster prod builds, biggest gains on 500+ module projects; most Rollup-style plugins keep working). Recommendation: **start on Vite 7.x for plugin stability, or go to Vite 8 once your plugin set is confirmed.** ([Vite 7 announcement](https://vite.dev/blog/announcing-vite7), [Vite 8 / Rolldown](https://www.infoq.com/news/2026/05/vite-v8-rust/), [Vite 7 ESM/Node note](https://progosling.com/en/dev-digest/2025-08/vite-7-esm-rolldown-node20))

Vite 7 also changed the default `build.target` to **`'baseline-widely-available'`** (features Baseline-supported ~30 months: ≈ Chrome/Edge 111, Firefox 114, Safari 16.4) — a good default for an FPS targeting modern browsers. ([Vite 7 announcement](https://vite.dev/blog/announcing-vite7))

Key configuration for a game:

- **`base`** must be set to the repo subpath for GitHub Pages (`/<repo>/`) so hashed asset URLs resolve; use `'/'` only for a `user.github.io` root repo or custom domain. ([Vite static deploy](https://vite.dev/guide/static-deploy), [Simon Willison TIL](https://til.simonwillison.net/github-actions/vite-github-pages))
- **Static game assets** (GLTF/GLB models, KTX2/basis textures, audio): **prefer importing** assets so Vite rewrites + content-hashes the URL (cache-busting that survives bundling) — `import url from './level.glb?url'`. Use `public/` only for assets you never reference in source; note `public/` files are **not** hashed, risking stale-asset bugs on deploy. Use `import.meta.glob` for bulk level/asset loading. Suffixes: `?url`, `?raw` (GLSL/JSON), `?inline`. ([Vite assets](https://vite.dev/guide/assets), [classic gltf-in-prod gotcha](https://github.com/vitejs/vite/issues/4953))
- **Asset hashing** is automatic for imported assets (content hashes → long-term caching). Keep `build.sourcemap: true` (or `'hidden'`) so crashes in minified game code symbolicate back to TS.
- **Minify**: default esbuild minify is fast and the right default; terser only to squeeze the last KB (Vite 8 uses Oxc).
- **Code splitting**: split heavy `three` into its own long-lived chunk via `manualChunks` (note `splitVendorChunkPlugin` is deprecated since Vite 5); lazy-load optional systems (level packs, post-processing) via dynamic `import()` so the initial bundle stays small (helps Lighthouse budgets in §3.4). ([Vite build options](https://vite.dev/config/build-options))
- **Shaders**: `vite-plugin-glsl` (or `?raw`) for `.glsl`/`.vert`/`.frag` imports — common in custom FPS materials/post-processing.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/<repo-name>/' : '/',
  build: {
    sourcemap: true,           // symbolicate prod crashes
    minify: 'esbuild',         // default; Vite 8 → Oxc
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
```

### 1.2 TypeScript config for games

`strict: true` is worth it even for a game — it catches null/undefined and number/vector mistakes that otherwise surface as silent NaNs in physics. Recommended `tsconfig.json` highlights:

- `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "bundler"` (Vite resolves; lets you omit file extensions and use `package.json` `exports`). ([TS handbook — modules/bundler resolution](https://www.typescriptlang.org/tsconfig/#moduleResolution))
- `"strict": true`, plus `"noUncheckedIndexedAccess": true` (array/lookup access becomes `T | undefined` — important for buffer/index-heavy game code), `"exactOptionalPropertyTypes": true`.
- `"isolatedModules": true` + `"verbatimModuleSyntax": true` + **type-only imports** (`import type { Vector3 } from 'three'`) so per-file transpilation (esbuild/Vite) is safe, type imports are fully erased, and tree-shaking of `three` subpaths works.
- `"skipLibCheck": true` to keep CI typecheck fast (don't type-check `node_modules` `.d.ts`, including the large `@types/three`).
- `"noEmit": true` — Vite emits JS; `tsc --noEmit` is used purely as the **typecheck gate** (see §7).
- Install **`@types/three`** — three.js moved its types to DefinitelyTyped at r126 and still does **not** bundle them; keep `@types/three` (`~0.18x`) aligned with your installed `three` minor. ([@types/three](https://www.npmjs.com/package/@types/three), [r126 types-on-DT note](https://discourse.threejs.org/t/with-r126-typescript-type-declaration-files-are-located-at-definitelytyped/23157))

**`noUncheckedIndexedAccess` game caveat:** it is compile-time only (zero runtime cost) but makes `arr[i]` typed `T | undefined`, which adds noise in hot per-frame loops over entity/particle arrays. Keep it on globally; in inner loops hoist to a local (`const e = entities[i]; if (!e) continue;`) rather than disabling it.

Typecheck cost is the long pole for TS in CI (it's single-threaded). Mitigate with `skipLibCheck`, `"incremental": true` + cached `*.tsbuildinfo`, and running `tsc --noEmit` as its own cached job (reported ~30s → ~3s on unchanged files). For dev-time errors in-browser use `vite-plugin-checker` (runs `tsc` in a worker, overlay) — keep it out of the prod build path. ([TS CI tweaks](https://medium.com/@ThinkingLoop/8-typescript-ci-tweaks-that-shave-off-seconds-23a4ec02305b), [skipLibCheck](https://betterstack.com/community/guides/scaling-nodejs/typescript-skiplibcheck/))

### 1.3 ESLint + Prettier

- **ESLint 9 flat config** (`eslint.config.mjs`) is the current standard; legacy `.eslintrc` is deprecated. ([eslint.org](https://eslint.org/docs/latest/use/configure/configuration-files)) Use **`typescript-eslint` v8** (unified package providing parser + plugin + `tseslint.config()` helper; configure `projectService: true` so it auto-finds the right tsconfig per file). Enable type-aware rules (`recommendedTypeChecked`) for the rules that actually catch game bugs. ([typescript-eslint v8](https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/), [getting started](https://typescript-eslint.io/getting-started/))
- **Rules that matter for games**: `@typescript-eslint/no-floating-promises` + `no-misused-promises` + `await-thenable` (async GLTF/audio loads silently swallowing errors is a real footgun); `@typescript-eslint/consistent-type-imports` (pairs with `verbatimModuleSyntax`); `import-x/no-cycle` (circular deps between engine systems break HMR + tree-shaking).
- **Use `eslint-plugin-import-x`, NOT the legacy `eslint-plugin-import`** — the legacy plugin has flat-config compatibility gaps in 2026.
- **Prettier 3** owns formatting; ESLint owns correctness. Put `eslint-config-prettier/flat` **last** in the config to disable conflicting ESLint format rules. Run `prettier --check` as a *separate* command — do NOT route Prettier through ESLint (`eslint-plugin-prettier`) in 2026.
- All run in CI as gates: `eslint . --max-warnings 0`, `prettier --check .`, `tsc --noEmit`. Enforce locally with Husky + lint-staged.

### 1.4 Package management & repo shape

- **pnpm 10** is the recommended manager in 2026: content-addressed global store (~70% less disk), strict `node_modules` (no phantom deps), fast installs, excellent CI caching via the store path, and a **catalog** feature to pin shared dependency versions (great for keeping `three`/`@types/three` aligned). Commit `pnpm-lock.yaml`; use `pnpm install --frozen-lockfile` in CI. ([pnpm vs npm vs bun 2026](https://www.pkgpulse.com/guides/pnpm-vs-npm-vs-yarn-vs-bun-2026))
- **Bun 1.x** has the fastest cold installs but couples you to its lockfile/runtime; not worth the lock-in for a browser game. **npm 10** is safest for compatibility but slower with weaker workspaces.
- **Start single-package.** A browser game ships one app; a monorepo adds overhead you don't need yet. *But* structure the source so the simulation/engine is import-isolated from rendering (see §1.5) — that makes a future **pnpm workspace** split (`packages/engine`, `apps/game`, `packages/tools`, `packages/config`) cheap if you later reuse the engine or add tooling. Pair with **Turborepo 2.x** (task graph + free remote cache; best for small/mid repos) once you actually have multiple packages; reach for **Nx** only at many-package/multi-team scale, and **Changesets** if you publish the engine. ([Turborepo vs Nx 2026](https://www.pkgpulse.com/guides/turborepo-vs-nx-monorepo-2026), [monorepo decision matrix](https://www.digitalapplied.com/blog/monorepo-strategy-2026-turborepo-nx-decision-matrix))

### 1.5 Module structure & HMR

Recommended layout (single package, workspace-ready):

```
src/
  engine/        # pure, deterministic: ECS/state, physics, fixed-step loop, seeded RNG  (NO three imports)
  render/        # three.js scene, materials, camera — reads engine state, never owns logic
  game/          # FPS rules: weapons, enemies, spawn, scoring (built on engine)
  input/         # input mapping → command buffer (replayable; see §2.3)
  ui/            # HUD/menus (DOM or three overlay)
  perf/          # FPS/frame-time probe exposed on window for the harness (§3.2)
  main.ts        # bootstrap
test/            # vitest specs (logic) + fixtures/replays
e2e/             # playwright specs (in-browser, visual, perf) + __screenshots__ baselines
```

The critical architectural rule: **keep `engine/` free of `three` and `window`** so game logic can be unit-tested headlessly and run deterministically (§2.3). Rendering is a pure read-side projection of engine state.

**HMR**: Vite HMR preserves module state across edits, great for iterating on rendering/tuning without losing the running session. The tricky part for a game: a naive reload re-runs top-level module code and can spawn a **second renderer/game loop** or wipe state. Use the HMR API correctly:
- `import.meta.hot.accept()` — mark a module self-accepting (without it Vite full-reloads, losing in-game state).
- `import.meta.hot.dispose(cb)` — **tear down the old instance's side effects**: `cancelAnimationFrame(rafId)` (avoids double-render), dispose three.js GPU resources (`renderer.dispose()`, geometry/material/texture `.dispose()`), remove listeners.
- `import.meta.hot.data` — persist plain state (player position, match state) across reloads; mutate its properties, don't reassign.

```ts
// loop.ts
let rafId = 0;
const state = import.meta.hot?.data.state ?? createInitialState();
function frame(t: number) { update(state, t); render(state); rafId = requestAnimationFrame(frame); }
rafId = requestAnimationFrame(frame);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => { cancelAnimationFrame(rafId); data.state = state; /* dispose GPU here */ });
}
```
([Vite HMR API](https://vite.dev/guide/api-hmr), [Three.js HMR pattern](https://github.com/mattdesl/webpack-three-hmr-test)) Note HMR is a dev-only convenience and is **not** part of the verification harness.

---

## 2. Testing a Browser Game

There are three test tiers, each answering a different question:

| Tier | Tool | Question it answers | Speed |
| --- | --- | --- | --- |
| **Logic / sim** | Vitest 3 (+ fast-check) | "Does the game *math/rules* behave?" | ms |
| **In-browser unit/component** | Vitest 3 Browser Mode (Playwright provider) | "Does this HUD/UI/WebGL unit render & react in a real browser?" | sub-sec |
| **E2E / visual / perf** | Playwright 1.59 | "Does the *whole game* load, accept input, look right, and run fast?" | sec |

### 2.1 Unit tests — Vitest

Vitest is the natural unit runner because it shares Vite's config/transform pipeline — no separate compiler/build step, native TS/ESM. ([vitest.dev](https://vitest.dev/)) Use the `node` environment for pure engine/sim code and `jsdom`/`happy-dom` only where DOM is touched.

- **Deterministic time**: `vi.useFakeTimers()` + `vi.advanceTimersByTime()` to drive the loop in controlled ticks instead of wall-clock. ([Vitest writing tests](https://vitest.dev/guide/learn/writing-tests.html))
- **Coverage** via `vitest --coverage` (v8 provider) as a (soft) gate.

### 2.2 Property-based tests — fast-check

For invariants that must hold over *many* inputs (e.g. "a fired projectile always deals damage in `[min,max]`", "vector normalize never NaNs", "save/load round-trips"), use **`@fast-check/vitest`**. It runs randomized inputs but is **fully reproducible**: every run uses a seed, and a failing case prints the exact minimal (shrunk) input + seed to replay. ([fast-check blog](https://fast-check.dev/blog/2025/03/28/beyond-flaky-tests-bringing-controlled-randomness-to-vitest/), [@fast-check/vitest](https://www.npmjs.com/package/@fast-check/vitest), [why property-based](https://fast-check.dev/docs/introduction/why-property-based/)) Set a fixed global seed in CI for stable runs.

### 2.3 Deterministic gameplay testing (the keystone)

This is what makes an FPS *automatable*. Make the simulation a **pure function of (initial state, input sequence, seed)** so it can be replayed and asserted headlessly.

**Three ingredients:**

1. **Fixed timestep loop** — separate deterministic fixed-rate simulation (e.g. 60 Hz) from variable-rate rendering using an accumulator; interpolate for display only. This makes the sim frame-rate-independent and reproducible and avoids the "spiral of death." ([Gaffer On Games — Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/), [André Leite — fixed timestep loop](https://andreleite.com/posts/2025/game-loop/fixed-timestep-game-loop/))
2. **Seeded RNG** — never call `Math.random()` in the engine. Inject a seeded PRNG (e.g. `seedrandom`/Mulberry32/PCG). Reset/branch the seed deterministically per tick/entity so update order doesn't perturb results. ([egregoria determinism notes](https://github.com/uriopass/egregoria/issues/90)) In tests, mock/seed RNG so outcomes are fixed. ([Modexa — flaky test patterns](https://medium.com/@Modexa/10-jest-vitest-patterns-that-reduce-flaky-tests-4105009ead56))
3. **Deterministic update order** — iterate entities in a stable order (pools/sorted ids), no `Set`/`Map`-iteration-order or floating wall-clock dependence inside the sim.

**Record & replay verification** — the most powerful automated check for gameplay:

> If gameplay is deterministic, state `T+1` is fully determined by state `T` + input. So you only need to store the **initial settings/seed** and the **per-tick input stream**; replaying must reproduce the exact final state. If it diverges, non-determinism has crept in. ([deterministic simulation testing](https://poorlydefinedbehaviour.github.io/posts/deterministic_simulation_testing/), [Games From Within — deterministic contraptions](https://gamesfromwithin.com/casey-and-the-clearly-deterministic-contraptions))

Practical harness implementation:
- Record `replays/*.json` = `{ seed, settings, inputs: Command[] }` (captured from real play sessions or hand-authored scenarios like "spawn 5 enemies, fire 3 shots, all die").
- A Vitest test loads the replay, runs the headless engine for N fixed ticks feeding the recorded commands, and asserts a **state hash / snapshot** of the final world (positions, health, score, enemy count). A changed hash = behavior change → must be intentionally re-baselined.
- This gives **fast, deterministic, headless gameplay regression tests** with zero rendering — they run in the unit tier in milliseconds.

### 2.4 In-browser E2E — Playwright

Playwright 1.59 (latest, 2026) drives the real game in a real browser, with native input events, parallel execution, traces, and an official test agent/MCP story. ([Playwright 1.59 notes](https://bug0.com/blog/whats-new-playwright-1-59), [Playwright features 2026](https://thinksys.com/qa-testing/playwright-features/))

WebGL/canvas-specific techniques (canvas pixels are **not** queryable via DOM — screenshots/state are the source of truth):

- **GPU/hardware acceleration in headless**: launch Chromium with flags like `--use-angle=gl` / `--use-gl=angle` (and on CI runners that lack a GPU, ANGLE-SwiftShader gives consistent software rendering) so WebGL renders rather than failing. Smooth WebGL targets 60fps. ([createIT — headless Chrome WebGL + Playwright](https://www.createit.com/blog/headless-chrome-testing-webgl-using-playwright/), [Promaton — testing 3D apps with Playwright on GPU](https://blog.promaton.com/testing-3d-applications-with-playwright-on-gpu-1e9cfc8b54a9))
- **Wait for readiness, never `waitForTimeout`**: expose a readiness flag (e.g. `window.__GAME_READY__`) and `await page.waitForFunction(() => window.__GAME_READY__)`; or verify the WebGL context exists before asserting. ([testdino playwright-skill — canvas & WebGL](https://github.com/testdino-hq/playwright-skill/blob/main/core/canvas-and-webgl.md))
- **Driving input deterministically**: pointer lock + `page.mouse.move(dx, dy)` for look, `page.keyboard.down('KeyW')` for movement, `canvas.click({ position })` for coordinate-based aim. For *fully* deterministic gameplay assertions prefer feeding the engine a scripted command buffer via an exposed test hook (`window.__pushCommand(...)`) rather than relying on physical input timing.
- **Reading game state**: `page.evaluate(() => window.__GAME_STATE__)` to assert score/health/enemy counts — far more robust than pixel-reading for logic.

```ts
// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
test('game boots, renders, and responds to input', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__GAME_READY__ === true);
  await page.locator('canvas').click(); // acquire pointer lock
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500); // moving forward
  await page.keyboard.up('KeyW');
  const pos = await page.evaluate(() => (window as any).__GAME_STATE__.player.position);
  expect(pos.z).toBeLessThan(0); // moved
});
```

### 2.5 Visual regression testing

Two complementary mechanisms:

- **Playwright `toHaveScreenshot()`** is the built-in visual baseline tool. Key options: `maxDiffPixelRatio` (fraction of differing pixels allowed, e.g. `0.01`), `maxDiffPixels` (absolute), and `threshold` (per-pixel YIQ color tolerance, e.g. `0.2`). Baselines are stored per **project/browser/OS** (each engine renders differently), updated with `--update-snapshots`. ([Playwright visual comparisons](https://mintlify.wiki/microsoft/playwright/advanced/visual-comparisons), [TestDino visual testing](https://testdino.com/blog/playwright-visual-testing), [TestQuality 2026 guide](https://testquality.com/playwright-visual-regression-guide/))
- **pixelmatch** can be used directly for custom canvas-frame diffs when you want full control over the comparison or to diff specific captured frames. ([Testrig — Playwright + pixelmatch](https://medium.com/@testrig/visual-regression-testing-with-playwright-and-pixelmatch-002770005019))

**Making WebGL screenshots stable** (the hard part):
- **Pin the rendering environment.** GPU/driver/font differences shift pixels; generate baselines in the **same Docker image** used in CI and run CI in that image. ([Ensono — Playwright visual testing](https://stacks.ensono.com/docs/testing/testing_in_nx/playwright_visual_testing), [oneuptime — Playwright visual testing](https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view)) Decide GPU vs ANGLE-SwiftShader and keep it identical between baseline and CI — software rendering is more reproducible across runners but slower; GPU is faster and closer to production but needs identical hardware. ([Promaton](https://blog.promaton.com/testing-3d-applications-with-playwright-on-gpu-1e9cfc8b54a9))
- **Freeze the scene before snapshotting.** Pause the loop / step to a fixed sim tick / disable particles & animation, fix the seed, and use a known camera pose. Snapshot a *deterministic* frame, not a live one.
- **Tune thresholds**: `maxDiffPixelRatio: 0.01` catches real regressions while tolerating AA/GPU noise; loosen to 1–2% only for text-heavy frames. ([TestDino](https://testdino.com/blog/playwright-visual-testing))
- Use `animations: 'disabled'` and `mask:` to hide volatile regions (FPS counter, timestamps).

Baselines live in the repo under `e2e/__screenshots__/` and are reviewed like code; updating them is a deliberate, reviewed act (see §7 "snapshot approved").

---

## 3. Performance Verification

The harness must turn "feels smooth" into numbers and **fail CI when budgets are breached**.

### 3.1 What to measure

- **Runtime frame rate / frame time** (the FPS-game-critical metric): average FPS, **1% low / p95 frame time** (worst frames matter more than average for an FPS).
- **Load performance**: bundle size, FCP/LCP/TBT (Lighthouse).
- **Memory growth** over a session (leaks).

### 3.2 Measuring FPS / frame time in automated runs

Playwright is not a load tool but exposes enough browser hooks to capture real metrics. ([Checkly — Playwright performance](https://www.checklyhq.com/docs/learn/playwright/performance/), [BrowserStack — Playwright performance testing](https://www.browserstack.com/guide/playwright-performance-testing))

**Approach A — rAF probe on `window` (primary, simplest, robust):** Instrument the game with a tiny frame-time recorder (or reuse **stats.js**) and **stash results on `window`** so the test reads them back. rAF fires once per repaint, so counting callbacks over a window gives FPS; record per-frame deltas for percentiles. (Caveat: browsers throttle rAF in hidden/backgrounded tabs, so the test must keep the page foregrounded/visible.) ([Latish Sehgal — measuring FPS with rAF](https://latish.dev/blog/2026/05/27/measuring-performance-in-frontend-using-fps/), [DevSquad — Playwright performance](https://devsquad.com/blog/playwright-performance-testing))

```ts
// in game: src/perf/probe.ts — exposes frame stats for the harness
const frames: number[] = [];
let last = performance.now();
function tick(now: number) { frames.push(now - last); last = now; requestAnimationFrame(tick); }
requestAnimationFrame(tick);
(window as any).__perf = {
  sample(ms = 3000) { /* clears + collects for ms, returns {avgFps, p95Frame, low1pct} */ },
};
```

```ts
// e2e/perf.spec.ts
test('sustains frame budget under combat load', async ({ page }) => {
  await page.goto('/?scenario=stress'); // deterministic heavy scene
  await page.waitForFunction(() => (window as any).__GAME_READY__);
  const m = await page.evaluate(() => (window as any).__perf.sample(3000));
  expect(m.avgFps).toBeGreaterThan(55);
  expect(m.p95Frame).toBeLessThan(20);   // ms — budget
});
```

**Approach B — CDP `Performance` / `Tracing` (deeper, Chromium):** open a CDP session (`context.newCDPSession(page)`), enable the `Performance` domain for engine metrics (CPU, JS heap, GC) and/or capture a `Tracing` timeline to compute frame data and long tasks offline. ([Checkly](https://www.checklyhq.com/docs/learn/playwright/performance/), [BrowserStack](https://www.browserstack.com/guide/playwright-performance-testing)) The **Long Animation Frames (LoAF)** API (Chrome 123+, read via `PerformanceObserver`) reports frames that blocked too long and *which script* caused them — excellent for pinpointing jank regressions in CI. ([Latish Sehgal](https://latish.dev/blog/2026/05/27/measuring-performance-in-frontend-using-fps/))

`playwright-performance-metrics` shows the reusable pattern of a collector reading the Performance API/web-vitals and asserting thresholds in a test. ([Valiantsin2021/playwright-performance-metrics](https://github.com/Valiantsin2021/playwright-performance-metrics))

### 3.3 Memory leak detection

Run dedicated leak scenarios in CI: drive a repeatable cycle (start match → play → end → restart) many times and assert heap doesn't grow unbounded.

- **memlab** (Meta) integrates with Puppeteer/Playwright: define a scenario (`action`/`back`), take JS heap snapshots, and it reports leaked/retained objects + detached DOM. ([memlab — integrate with E2E frameworks](https://facebook.github.io/memlab/docs/guides/integrate-with-e2e-frameworks/), [Browserless — memory leaks guide](https://www.browserless.io/blog/memory-leak-how-to-find-fix-prevent-them))
- Or use CDP `HeapProfiler` / force GC and compare `JSHeapUsedSize` before/after N cycles; look for detached objects and unbounded `usedJSHeapSize`. Also `performance.measureUserAgentSpecificMemory()` where available.
- Game-specific watch items: undisposed three.js `geometry`/`material`/`texture`/render targets, event listeners not removed on scene teardown, growing object pools.

### 3.4 Load budgets — Lighthouse CI

**Lighthouse CI (`@lhci/cli`)** runs Lighthouse in CI, enforces **performance budgets**, and **fails the build** when category scores or resource sizes exceed thresholds (asserts via `lighthouserc` and/or `budget.json`). The official `treosh/lighthouse-ci-action` plugs into GitHub Actions and fails when a URL exceeds budget. ([treosh/lighthouse-ci-action](https://github.com/treosh/lighthouse-ci-action), [LHCI guide 2026](https://unlighthouse.dev/learn-lighthouse/lighthouse-ci), [CSS-Tricks — continuous perf analysis](https://css-tricks.com/continuous-performance-analysis-with-lighthouse-ci-and-github-actions/)) Use it to guard initial bundle/transfer size and load metrics; use Approach A/B above for *runtime* FPS (Lighthouse measures load, not sustained gameplay frame rate).

```json
// budget.json (excerpt)
[{ "resourceSizes": [
  { "resourceType": "script", "budget": 600 },
  { "resourceType": "total",  "budget": 2500 }
]}]
```

### 3.5 Perf budgets enforced in CI

Every perf metric above maps to a hard assertion in a test or LHCI config. Budgets live in version control (e.g. `perf-budgets.json`) so changes are reviewed. A regression = red check = blocked merge (§7).

---

## 4. CI/CD (GitHub Actions)

> The detailed, copy-pasteable pipeline is consolidated in §6. This section states the design.

**Pipeline shape** (fan-out after a single install):

```
install (pnpm, cached store + cached Playwright browsers)
  ├─ lint        (eslint + prettier --check)
  ├─ typecheck   (tsc --noEmit)
  ├─ unit        (vitest run --coverage  → includes deterministic replay tests)
  ├─ build       (vite build)  ──► artifact: dist/
  ├─ e2e+visual  (playwright; needs build/preview)  → traces, screenshots, HTML report artifacts
  ├─ perf        (playwright FPS/mem specs + Lighthouse CI on preview)
  └─ (on main) deploy  → GitHub Pages
```

- **Separate jobs, not one mega-job** — independent required status checks (a lint failure doesn't mask a test failure) and parallelism. Add workflow-level `concurrency` with `cancel-in-progress: true` so new PR commits cancel stale runs. **Build once, share the `dist/` artifact** into `e2e` and `perf` (deterministic — the exact bytes that ship).
- **Caching** (key insight: cache the *store*, not `node_modules` — `npm ci`/pnpm wipe it anyway):
  - PM store via `actions/setup-node` `cache: pnpm`/`npm`, keyed on the lockfile.
  - **Playwright browsers** in `~/.cache/ms-playwright`, keyed on the **installed Playwright version** (a stale browser cache vs a new Playwright is a known breakage class). On cache hit run `playwright install-deps` only; on miss `playwright install --with-deps`. ([setup-node caching](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md), [version-keyed browser cache](https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/))
  - Don't bother caching the Vite build — rebuild + share artifact is safer.
- **Matrix browsers, NOT OSes.** Chromium on every PR for fast feedback; full **Chromium/Firefox/WebKit** matrix nightly/pre-release. **WebKit is the highest-value extra engine for a WebGL FPS** (Safari lags on WebGL2/WebGPU, stricter context-loss/color-space). OS rarely changes browser-engine behavior, and crucially **must NOT be matrixed for visual snapshots** (per-OS font/AA differences → false diffs). Each browser needs its own baselines. ([Playwright projects](https://playwright.dev/docs/test-projects), [cross-browser](https://thinksys.com/qa-testing/cross-browser-testing-with-playwright/))
- **Sharding + blob reports**: shard with `--shard=i/N` (`fail-fast: false`), reporter `blob` in CI, upload one blob per shard, then a `merge-reports` job downloads all and produces a single HTML report. Traces/screenshot diffs travel inside the blobs. Use `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'` to keep artifacts small. ([sharding](https://playwright.dev/docs/test-sharding))
- **WebGL-in-headless gotcha**: Chromium on Linux runners renders WebGL via **SwiftShader (software GL)** — fine for functional/visual tests but **absolute FPS is not GPU-representative**, so use perf tests for *relative* regressions or run them on a GPU/self-hosted runner. Avoid Node-side `headless-gl` (WebGL1 only; three.js dropped WebGL1 at r163) — prefer browser-based rendering tests. ([three.js headless-gl/WebGL2 thread](https://discourse.threejs.org/t/suggestions-for-unit-testing-with-headless-gl-and-webgl-2/66891))
- **Deploy**: `actions/upload-pages-artifact` (`path: dist`, since default is `_site/`) + `actions/deploy-pages`, in a **separate `deploy.yml` on `push:main`** with `pages: write` + `id-token: write` permissions, the `github-pages` environment, and `concurrency: { group: pages, cancel-in-progress: false }` (never interrupt a release). Set Pages source to "GitHub Actions" and Vite `base` to `/<repo>/`. **PR previews** (Pages has one live env) via **Netlify deploy previews** (auto PR comment) or `rossjrw/pr-preview-action` (deploys to a `gh-pages` subdir). ([deploy-pages](https://github.com/actions/deploy-pages), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact), [Netlify previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/), [pr-preview-action](https://github.com/marketplace/actions/deploy-pr-preview))

**Gating merges:** protect `main` with **required status checks** and a **merge queue** (re-validates against the latest base; requires the `merge_group` trigger). Matrix jobs create one check per value (`e2e (chromium)`…) — rather than requiring each, add a small **`ci-passed` aggregator job** (`needs: [lint, typecheck, unit, build, merge-reports, perf]`, `if: always()`, fails if any dependency failed/cancelled) and require only that one check. ([about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [troubleshooting required checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks))

---

## 5. THE VERIFICATION HARNESS (design)

This is the core deliverable: a single, scripted system that **objectively answers "is this build correct, fast, and visually right?"** — runnable locally and identically in CI.

### 5.1 Principles

1. **Everything is a script with an exit code.** Each quality dimension is a command that exits 0 (pass) / non-zero (fail). An agent or CI determines "done" purely from exit codes — no human judgment in the loop.
2. **Determinism first.** The engine is a pure function of (seed, settings, inputs). This is what lets gameplay, perf, and visuals be reproduced and asserted (§2.3). Non-determinism is the enemy of automatable verification.
3. **State over pixels where possible.** Assert on `window.__GAME_STATE__` and engine state hashes (robust); use pixels only for genuinely visual concerns.
4. **Budgets and baselines are versioned.** Perf budgets (`perf-budgets.json`), visual baselines (`__screenshots__/`), and replay fixtures (`replays/`) live in the repo and change only via reviewed PRs.
5. **Same environment for baseline and check.** Pin a Docker image (Playwright's) so visual/perf results are comparable.

### 5.2 Required game hooks (instrumentation contract)

The game must expose a small, test-only surface so the harness can observe and drive it deterministically:

| Hook | Purpose |
| --- | --- |
| `window.__GAME_READY__: boolean` | Readiness gate (replaces flaky timeouts) |
| `window.__GAME_STATE__` | Snapshot of world state (player, enemies, score, health) |
| `window.__perf.sample(ms)` | Returns `{avgFps, p95Frame, low1pct, heapUsed}` |
| `window.__pushCommand(cmd)` | Inject a scripted input command (deterministic driving) |
| `window.__stepTo(tick)` | Advance the sim to a fixed tick and pause (stable visual frames) |
| `?scenario=<name>` / `?seed=<n>` | Boot directly into a known deterministic scenario |

These are gated behind a build flag / `import.meta.env` so they're stripped from production.

### 5.3 The five verifiers (each = one exit code)

| # | Verifier | How it runs | Pass criteria |
| --- | --- | --- | --- |
| V1 | **Static** | `eslint .` + `prettier --check .` + `tsc --noEmit` | zero errors |
| V2 | **Logic & gameplay** | `vitest run` — unit + property (fast-check) + **deterministic replay** tests (load `replays/*.json`, run headless engine, assert final state hash) | all pass; state hashes match baselines |
| V3 | **Behavioral E2E** | Playwright: boot real game, drive scripted commands, assert `__GAME_STATE__` outcomes (movement, shooting, enemy death, score) | all assertions pass |
| V4 | **Visual** | Playwright `toHaveScreenshot()` of frozen, fixed-tick, fixed-seed, fixed-camera scenes vs versioned baselines | within `maxDiffPixelRatio` |
| V5 | **Performance** | Playwright perf specs (rAF probe + CDP/LoAF) on stress scenarios + Lighthouse CI on the built preview + memlab leak scenario | FPS/frame/mem/load all within `perf-budgets.json` |

A single `pnpm verify` script chains V1–V5 (or runs them as parallel CI jobs). **Build is "verified" iff all five exit 0.**

### 5.4 Local vs CI parity

`pnpm verify` runs the identical verifiers locally (so an engineer or agent can self-check before pushing) and in CI (as the merge gate). Visual/perf verifiers run inside the pinned Playwright Docker image in both places so results match.

---

## 6. CI Pipeline Outline (concrete YAML)

Action versions below reflect current majors as of mid-2026 (`checkout@v5`, `setup-node@v6`, `upload/download-artifact@v5`, `cache@v4`, `upload-pages-artifact@v3`, `deploy-pages@v5`); pin to a SHA for supply-chain hardening and verify on the Marketplace before adopting. A reusable composite/anchor for "checkout + pnpm + cached install" is assumed where elided.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push: { branches: [main] }
  merge_group:        # REQUIRED so the merge queue re-runs checks

concurrency:
  group: ci-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: pnpm }   # caches the pnpm store, keyed on lockfile
      - run: pnpm install --frozen-lockfile
      - run: pnpm eslint . --max-warnings 0
      - run: pnpm prettier --check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      # ...pnpm + cached install (as above)...
      - run: pnpm tsc --noEmit

  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      # ...install...
      - run: pnpm vitest run --coverage --reporter=github-actions   # incl. deterministic replay tests (V2)

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      # ...install...
      - run: pnpm build
      - uses: actions/upload-artifact@v5
        with: { name: dist, path: dist, retention-days: 1 }

  e2e:                                    # V3 (behavioral) + V4 (visual)
    needs: build
    timeout-minutes: 60
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.59.0-jammy   # PINNED env → stable WebGL visuals
    strategy: { fail-fast: false, matrix: { shardIndex: [1, 2, 3, 4], shardTotal: [4] } }
    steps:
      - uses: actions/checkout@v5
      # ...install...
      # Playwright browsers are baked into the container image; for non-container runs:
      #   id=pw: echo "v=$(node -p "require('@playwright/test/package.json').version")" >> $GITHUB_OUTPUT
      #   actions/cache@v4 path ~/.cache/ms-playwright key playwright-${{ runner.os }}-${{ steps.pw.outputs.v }}
      #   on hit: npx playwright install-deps ; on miss: npx playwright install --with-deps
      - uses: actions/download-artifact@v5
        with: { name: dist, path: dist }   # serve dist via playwright.config webServer
      - run: pnpm exec playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
      - uses: actions/upload-artifact@v5
        if: ${{ !cancelled() }}
        with: { name: blob-report-${{ matrix.shardIndex }}, path: blob-report, retention-days: 1 }

  merge-reports:                          # combine sharded blob reports → one HTML report
    if: ${{ !cancelled() }}
    needs: [e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      # ...install...
      - uses: actions/download-artifact@v5
        with: { path: all-blob-reports, pattern: blob-report-*, merge-multiple: true }
      - run: pnpm exec playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v5
        with: { name: html-report--attempt-${{ github.run_attempt }}, path: playwright-report, retention-days: 14 }

  perf:                                   # V5: runtime FPS/mem + load budgets
    needs: build
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.59.0-jammy
    steps:
      - uses: actions/checkout@v5
      # ...install + download dist...
      - run: pnpm exec playwright test e2e/perf.spec.ts     # rAF FPS / p95 frame / memlab leak
      - uses: treosh/lighthouse-ci-action@v12               # load/asset-size budgets
        with: { configPath: ./lighthouserc.json, uploadArtifacts: true, temporaryPublicStorage: true }

  ci-passed:                              # single required check (see §4 gating)
    if: ${{ always() }}
    needs: [lint, typecheck, unit, build, merge-reports, perf]
    runs-on: ubuntu-latest
    steps:
      - run: |
          [ "${{ contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled') }}" = "false" ]
```

```yaml
# .github/workflows/deploy.yml — Pages, production only
name: Deploy
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }   # never interrupt a release
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: pnpm }
      - uses: actions/configure-pages@v5
      - run: pnpm install --frozen-lockfile
      - run: pnpm build                                   # base: '/<repo>/' set in vite.config
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }                              # override default _site/
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Make **only `ci-passed`** a required status check on `main` (it aggregates all jobs) and enable the **merge queue**. ([branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [GH Pages starter workflow](https://github.com/actions/starter-workflows/blob/main/pages/static.yml))

---

## 7. Machine-Checkable Acceptance Criteria ("Definition of Done")

Encode acceptance criteria so an **agent can know a task is truly complete** with no human judgment — every criterion is a command + threshold.

### 7.1 The DoD contract

A change is "done" iff **`pnpm verify` exits 0**, which requires *all* of:

| Criterion | Check (exit-code) | Where defined |
| --- | --- | --- |
| Code style/correctness | `eslint .` && `prettier --check .` | `eslint.config.js`, `.prettierrc` |
| Types sound | `tsc --noEmit` | `tsconfig.json` |
| Logic correct | `vitest run` passes (incl. fast-check invariants) | `test/**` |
| Gameplay unchanged/intended | deterministic replay state-hashes match | `replays/**`, snapshot files |
| Behavior correct in-browser | Playwright E2E assertions pass | `e2e/**` |
| Looks right | `toHaveScreenshot` within `maxDiffPixelRatio` | `e2e/__screenshots__/**` |
| Fast enough | FPS/frame/mem within budget; LHCI budget met | `perf-budgets.json`, `lighthouserc.json`, `budget.json` |
| Builds & deploys | `vite build` succeeds; Pages artifact uploads | CI |

### 7.2 Per-task acceptance criteria

For a *specific* task, the agent writes **new tests that assert the feature's spec** (e.g. "shotgun fires 8 pellets" → a Vitest replay/property test; "muzzle flash renders" → a visual snapshot; "60fps with 20 enemies" → a perf spec with a budget). The task is complete when those new assertions pass *and* the whole `verify` suite stays green (no regressions). This turns natural-language acceptance criteria into executable, self-verifying checks.

### 7.3 Baseline/snapshot approval

"Visual snapshot approved" and "gameplay state-hash rebaselined" are **explicit, reviewed acts**: an intended change updates baselines via `--update-snapshots` / regenerating replay hashes, committed in the same PR and reviewed in the diff. CI treats any *un*-approved deviation as a failure. This keeps "approval" auditable rather than implicit.

### 7.4 Why this is agent-friendly

- One command (`pnpm verify`) → one boolean answer.
- Failures are specific (which verifier, which assertion, with a Playwright trace / shrunk fast-check input / visual diff image) so the agent can iterate.
- Determinism means a green run *reproduces* — no flaky "passed once" ambiguity.

---

## 8. Sources

**Tooling**
- Vite 7 announcement (ESM-only, Node 20.19+/22.12+, baseline target) — https://vite.dev/blog/announcing-vite7 ; Vite 8 / Rolldown+Oxc — https://www.infoq.com/news/2026/05/vite-v8-rust/ ; Vite 7 ESM/Node note — https://progosling.com/en/dev-digest/2025-08/vite-7-esm-rolldown-node20
- Vite assets — https://vite.dev/guide/assets ; build options — https://vite.dev/config/build-options ; static deploy — https://vite.dev/guide/static-deploy ; HMR API — https://vite.dev/guide/api-hmr ; gltf-in-prod gotcha — https://github.com/vitejs/vite/issues/4953
- TS `moduleResolution` — https://www.typescriptlang.org/tsconfig/#moduleResolution ; CI typecheck tweaks — https://medium.com/@ThinkingLoop/8-typescript-ci-tweaks-that-shave-off-seconds-23a4ec02305b ; skipLibCheck — https://betterstack.com/community/guides/scaling-nodejs/typescript-skiplibcheck/
- `@types/three` — https://www.npmjs.com/package/@types/three ; r126 types-on-DefinitelyTyped — https://discourse.threejs.org/t/with-r126-typescript-type-declaration-files-are-located-at-definitelytyped/23157
- ESLint flat config — https://eslint.org/docs/latest/use/configure/configuration-files ; typescript-eslint v8 — https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/ ; getting started (projectService) — https://typescript-eslint.io/getting-started/
- pnpm vs npm vs bun 2026 — https://www.pkgpulse.com/guides/pnpm-vs-npm-vs-yarn-vs-bun-2026 ; Turborepo vs Nx — https://www.pkgpulse.com/guides/turborepo-vs-nx-monorepo-2026 ; monorepo decision matrix — https://www.digitalapplied.com/blog/monorepo-strategy-2026-turborepo-nx-decision-matrix
- Three.js HMR pattern — https://github.com/mattdesl/webpack-three-hmr-test ; Vite HMR example — https://dev.to/omar4ur/vite-hot-module-replacement-a-complete-example-pkg

**Testing**
- Vitest — https://vitest.dev/ ; writing tests — https://vitest.dev/guide/learn/writing-tests.html
- Vitest Browser Mode vs Playwright — https://www.epicweb.dev/vitest-browser-mode-vs-playwright
- @fast-check/vitest — https://www.npmjs.com/package/@fast-check/vitest ; fast-check blog — https://fast-check.dev/blog/2025/03/28/beyond-flaky-tests-bringing-controlled-randomness-to-vitest/ ; why PBT — https://fast-check.dev/docs/introduction/why-property-based/
- Flaky test patterns (fake timers, seeded RNG) — https://medium.com/@Modexa/10-jest-vitest-patterns-that-reduce-flaky-tests-4105009ead56
- Fix Your Timestep — https://gafferongames.com/post/fix_your_timestep/ ; fixed-timestep loop — https://andreleite.com/posts/2025/game-loop/fixed-timestep-game-loop/
- Deterministic simulation testing — https://poorlydefinedbehaviour.github.io/posts/deterministic_simulation_testing/ ; deterministic contraptions — https://gamesfromwithin.com/casey-and-the-clearly-deterministic-contraptions ; determinism notes — https://github.com/uriopass/egregoria/issues/90

**Playwright / WebGL / Visual**
- Playwright 1.59 — https://bug0.com/blog/whats-new-playwright-1-59 ; features 2026 — https://thinksys.com/qa-testing/playwright-features/
- Headless Chrome WebGL + Playwright — https://www.createit.com/blog/headless-chrome-testing-webgl-using-playwright/
- Testing 3D apps with Playwright on GPU — https://blog.promaton.com/testing-3d-applications-with-playwright-on-gpu-1e9cfc8b54a9
- testdino canvas & WebGL skill — https://github.com/testdino-hq/playwright-skill/blob/main/core/canvas-and-webgl.md
- Playwright visual comparisons — https://mintlify.wiki/microsoft/playwright/advanced/visual-comparisons ; TestDino — https://testdino.com/blog/playwright-visual-testing ; TestQuality 2026 — https://testquality.com/playwright-visual-regression-guide/ ; Ensono — https://stacks.ensono.com/docs/testing/testing_in_nx/playwright_visual_testing ; oneuptime — https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view ; Playwright + pixelmatch — https://medium.com/@testrig/visual-regression-testing-with-playwright-and-pixelmatch-002770005019

**Performance / Memory**
- Measuring FPS with rAF — https://latish.dev/blog/2026/05/27/measuring-performance-in-frontend-using-fps/
- Playwright performance (Checkly) — https://www.checklyhq.com/docs/learn/playwright/performance/ ; BrowserStack — https://www.browserstack.com/guide/playwright-performance-testing ; DevSquad — https://devsquad.com/blog/playwright-performance-testing
- playwright-performance-metrics — https://github.com/Valiantsin2021/playwright-performance-metrics
- memlab E2E integration — https://facebook.github.io/memlab/docs/guides/integrate-with-e2e-frameworks/ ; Browserless memory leaks — https://www.browserless.io/blog/memory-leak-how-to-find-fix-prevent-them
- Lighthouse CI action — https://github.com/treosh/lighthouse-ci-action ; LHCI guide — https://unlighthouse.dev/learn-lighthouse/lighthouse-ci ; CSS-Tricks — https://css-tricks.com/continuous-performance-analysis-with-lighthouse-ci-and-github-actions/

**CI/CD**
- Playwright CI — https://playwright.dev/docs/ci (raw: https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/ci.md) ; sharding/blob/merge — https://playwright.dev/docs/test-sharding (raw: https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-sharding-js.md) ; projects/browsers — https://playwright.dev/docs/test-projects ; cross-browser cost — https://thinksys.com/qa-testing/cross-browser-testing-with-playwright/
- setup-node caching (store, not node_modules) — https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md ; version-keyed Playwright browser cache — https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/ ; stale-browser-cache breakage — https://github.com/microsoft/playwright/issues/15998 ; GH caching — https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows
- WebGL2 headless / headless-gl limits (three.js dropped WebGL1 at r163) — https://discourse.threejs.org/t/suggestions-for-unit-testing-with-headless-gl-and-webgl-2/66891 ; stackgl/headless-gl — https://github.com/stackgl/headless-gl
- Protected branches — https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches ; merge queue — https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue ; troubleshooting required checks — https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks ; status checks — https://docs.github.com/articles/about-status-checks
- GH Pages: deploy-pages — https://github.com/actions/deploy-pages ; upload-pages-artifact — https://github.com/actions/upload-pages-artifact ; Pages starter workflow — https://github.com/actions/starter-workflows/blob/main/pages/static.yml ; configuring publishing source — https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- PR previews: Netlify deploy previews — https://docs.netlify.com/deploy/deploy-types/deploy-previews/ ; pr-preview-action — https://github.com/marketplace/actions/deploy-pr-preview
- Vite → GitHub Pages — https://vite.dev/guide/static-deploy ; Simon Willison TIL — https://til.simonwillison.net/github-actions/vite-github-pages
- Vitest coverage gating in CI — https://github.com/davelosert/vitest-coverage-report-action ; Vitest reporters — https://vitest.dev/config/reporters

> Note: Several official docs (vite.dev, playwright.dev, npmjs.com, threejs.org forum, and some Medium/blog hosts) returned HTTP 403 to the automated fetcher during this research session; their content is corroborated here via search excerpts, the canonical raw Markdown/starter-workflow files, and reputable secondary sources cited above. Action and library versions reflect the current majors as of mid-2026 — verify exact pins against the Marketplace/official docs before locking them in.
