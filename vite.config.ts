import { defineConfig } from 'vite';

// GitHub Pages serves this repo under /game/. Use that base only for the real
// production build in CI; '/' otherwise (dev, and the `--mode test` bundle the
// Playwright webServer previews, which is served at the root).
export default defineConfig(({ mode }) => ({
  base: process.env.GITHUB_ACTIONS && mode !== 'test' ? '/game/' : '/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
}));
