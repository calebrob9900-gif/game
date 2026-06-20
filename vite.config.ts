import { defineConfig } from 'vite';

// GitHub Pages serves this repo under /game/. Use that base only in CI/build,
// '/' locally so the dev server and Playwright work at the root.
const base = process.env.GITHUB_ACTIONS ? '/game/' : '/';

export default defineConfig({
  base,
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
});
