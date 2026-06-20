import { defineConfig } from 'vitest/config';

// V2 (logic / deterministic replay) runs here. Pure-Node environment: the sim
// must never touch the DOM or three, so unit + replay tests run headless.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/replay/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
