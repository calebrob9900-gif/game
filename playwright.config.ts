import { defineConfig } from '@playwright/test';

// V3 (behavioral E2E) + V4 (visual) run real Chromium against the Vite dev
// server (instrumentation present in dev). On Linux/CI WebGL renders via
// SwiftShader, so we pass the flags that enable software WebGL/WebGPU.
const PORT = Number(process.env.PW_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SOFTWARE_GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-features=Vulkan',
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
    launchOptions: { args: SOFTWARE_GL_ARGS },
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'e2e', testMatch: /tests\/e2e\/.*\.spec\.ts$/ },
    {
      name: 'visual',
      testMatch: /tests\/visual\/.*\.spec\.ts$/,
      use: { viewport: { width: 1280, height: 720 } },
    },
    { name: 'perf', testMatch: /tests\/perf\/.*\.spec\.ts$/ },
  ],
});
