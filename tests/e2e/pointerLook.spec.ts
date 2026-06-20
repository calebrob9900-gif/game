/**
 * T-106 E2E — Pointer-lock look: input→yaw/pitch determinism.
 *
 * Proves that pushing LookCommands via __pushCommand and advancing via __stepTo
 * produces the exact expected yaw change in __GAME_STATE__().player.yaw.
 * Uses the Source-style formula from research/03 §3.3 directly.
 */
import { test, expect } from '@playwright/test';

const SOURCE_YAW_CONST = 0.022;
const DEG_TO_RAD = Math.PI / 180;

test('T-106: LookCommand produces deterministic yaw change matching Source formula', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  const initial = await page.evaluate(() => window.__GAME_STATE__!());
  expect(initial.player.yaw).toBeCloseTo(0, 10);
  expect(initial.player.pitch).toBeCloseTo(0, 10);

  // ── Push a LookCommand with a known dyaw and verify exact change ───────────
  // Simulate what mouseToAngles(100, 0, 2.0) would produce:
  //   dyaw = 100 * 2.0 * 0.022 * (PI/180) = 0.07679448708775051
  const movementX = 100;
  const sens = 2.0;
  const expectedDyaw = movementX * sens * SOURCE_YAW_CONST * DEG_TO_RAD;

  const afterLook = await page.evaluate(
    ({ dyaw }: { dyaw: number }) => {
      const tick = window.__GAME_STATE__!().tick;
      window.__pushCommand!({ type: 'look', dyaw, dpitch: 0 });
      window.__stepTo!(tick + 1);
      return window.__GAME_STATE__!();
    },
    { dyaw: expectedDyaw },
  );

  // yaw should have changed by exactly expectedDyaw (wrapped through atan2)
  // For this small angle, no wrapping occurs
  expect(afterLook.player.yaw).toBeCloseTo(expectedDyaw, 10);

  // ── Same command repeated ⇒ same result (determinism) ─────────────────────
  const worldA = await page.evaluate(
    ({ dyaw }: { dyaw: number }) => {
      // Reset by using a fresh page state isn't possible, so just record
      // the current yaw and apply another identical delta
      const before = window.__GAME_STATE__!().player.yaw;
      const tick = window.__GAME_STATE__!().tick;
      window.__pushCommand!({ type: 'look', dyaw, dpitch: 0 });
      window.__stepTo!(tick + 1);
      const after = window.__GAME_STATE__!().player.yaw;
      return { before, after, delta: after - before };
    },
    { dyaw: expectedDyaw },
  );

  // The delta should be exactly expectedDyaw (small angle, no wrapping)
  expect(worldA.delta).toBeCloseTo(expectedDyaw, 10);

  // ── Pitch clamp: large downward input stays within ±89° ───────────────────
  const afterBigPitch = await page.evaluate(() => {
    const tick = window.__GAME_STATE__!().tick;
    // Large pitch that would exceed the ±89° clamp
    window.__pushCommand!({ type: 'look', dyaw: 0, dpitch: Math.PI });
    window.__stepTo!(tick + 1);
    return window.__GAME_STATE__!().player.pitch;
  });
  const PITCH_LIMIT = Math.PI / 2 - 0.01;
  expect(afterBigPitch).toBeLessThanOrEqual(PITCH_LIMIT + 1e-10);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('T-106: yaw accumulates correctly across multiple LookCommands', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  // Apply 5 look commands each with a known dyaw
  const dyaw = 0.1; // small angle, ~5.7 degrees
  const TICKS = 5;

  const result = await page.evaluate(
    ({ dyaw, ticks }: { dyaw: number; ticks: number }) => {
      const start = window.__GAME_STATE__!();
      for (let i = 0; i < ticks; i++) {
        const tick = window.__GAME_STATE__!().tick;
        window.__pushCommand!({ type: 'look', dyaw, dpitch: 0 });
        window.__stepTo!(tick + 1);
      }
      const end = window.__GAME_STATE__!();
      return {
        initialYaw: start.player.yaw,
        finalYaw: end.player.yaw,
        ticks: end.tick - start.tick,
      };
    },
    { dyaw, ticks: TICKS },
  );

  expect(result.ticks).toBe(TICKS);
  // Total yaw = initialYaw + 5 * dyaw (for small angles, no wrapping)
  const expectedFinalYaw = result.initialYaw + TICKS * dyaw;
  expect(result.finalYaw).toBeCloseTo(expectedFinalYaw, 10);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});
