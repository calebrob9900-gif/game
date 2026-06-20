import { test, expect } from '@playwright/test';

/**
 * V3 (behavioral E2E): boot the REAL game in Chromium, assert it becomes ready
 * with no console/page errors, renders frames, and that the deterministic input
 * hooks actually drive the sim (__pushCommand + __stepTo change __GAME_STATE__).
 */
test('boots, renders a non-blank frame, and responds to scripted input', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, { timeout: 30_000 });

  // Renders real frames (perf probe accumulates).
  await page.waitForFunction(() => (window.__perf?.stats().frames ?? 0) > 3, undefined, {
    timeout: 15_000,
  });

  // Initial state: player at eye height, full health.
  const initial = await page.evaluate(() => window.__GAME_STATE__!());
  expect(initial.player.health).toBe(100);
  expect(initial.player.position.y).toBeCloseTo(1.7, 1);

  // Drive forward deterministically (held input = re-issue the command each tick).
  const moved = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 40; i++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false });
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!();
  });
  expect(moved.player.position.z).toBeLessThan(-0.5);

  // Non-blank: a screenshot of the lit scene is far larger than a flat frame.
  const png = await page.locator('#game').screenshot();
  expect(png.byteLength).toBeGreaterThan(4000);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});
