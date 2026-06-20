import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * V1 (static) — ESLint flat config.
 * Enforces the two NON-NEGOTIABLE architecture rules in src/sim:
 *   1. Import boundary: src/sim must not import three / DOM / audio (presentation only).
 *   2. Determinism: no Math.random() / Date.now() / performance.now() in the sim.
 */
export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-test',
      'node_modules',
      '.claude',
      'coverage',
      'playwright-report',
      'test-results',
      'blob-report',
      '.lighthouseci',
      // legacy prototype files (predate the NEON BREACH scaffold)
      'engine.js',
      'games',
      'scripts',
      '**/*-snapshots/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The deterministic, headless simulation core.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              message: 'src/sim is headless: no three imports (presentation only).',
            },
            { name: 'howler', message: 'src/sim is headless: no audio imports.' },
          ],
          patterns: [
            { group: ['three', 'three/*'], message: 'src/sim is headless: no three imports.' },
            { group: ['howler', 'howler/*'], message: 'src/sim is headless: no audio imports.' },
            {
              group: ['*/presentation/*', '**/presentation/**', '*/app/*', '**/app/**'],
              message:
                'src/sim must not depend on presentation or app (one-way: presentation -> sim).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No window in src/sim (headless determinism).' },
        { name: 'document', message: 'No document in src/sim (headless determinism).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'No Math.random() in src/sim — use the seeded PRNG (core/rng.ts).',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'No Date.now() in src/sim — the sim is time-pure (fixed timestep).',
        },
        {
          selector: "MemberExpression[object.name='performance'][property.name='now']",
          message: 'No performance.now() in src/sim — the sim is time-pure.',
        },
      ],
    },
  },
  prettier,
);
