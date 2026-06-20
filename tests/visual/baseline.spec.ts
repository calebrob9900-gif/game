import { test, expect } from '@playwright/test';

/**
 * V4 (visual): a deterministic frozen frame compared to a committed baseline.
 * Fixed seed + __stepTo freezes the sim at a known tick with a fixed camera, so
 * the only variation is GPU/AA noise, absorbed by maxDiffPixelRatio.
 * Baselines are generated in this same headless SwiftShader environment and
 * reviewed/committed like code (never auto-updated in CI).
 */
test('hello scene baseline (frozen, fixed seed)', async ({ page }) => {
  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, { timeout: 30_000 });

  // Freeze the sim at a deterministic tick with the default forward-facing camera.
  await page.evaluate(() => window.__stepTo!(2));

  await expect(page.locator('#game')).toHaveScreenshot('hello-scene.png', {
    maxDiffPixelRatio: 0.03,
    animations: 'disabled',
  });
});
