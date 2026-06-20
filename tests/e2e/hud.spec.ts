import { test, expect } from '@playwright/test';

/**
 * T-130 E2E — HUD core: health, ammo/reserve, dynamic crosshair.
 *
 * Acceptance criterion [V3]: boot the game, wait __GAME_READY__, read
 * __GAME_STATE__().player.health, and assert the HUD health element's text
 * matches it. Assert the crosshair element exists. Assert the ammo element
 * shows the AR placeholder (30 / 120).
 *
 * The HUD lives in a DOM overlay outside #game (the canvas) so the V4 visual
 * baseline is unaffected.
 */
test('T-130: HUD health matches __GAME_STATE__, crosshair and ammo present', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  // Wait for HUD to be present in the DOM.
  await page.waitForSelector('[data-testid="hud-health"]', { timeout: 5_000 });

  // ── 1. Health matches __GAME_STATE__ ──────────────────────────────────────
  const simHealth = await page.evaluate(() => window.__GAME_STATE__!().player.health);
  const hudHealthText = await page.locator('[data-testid="hud-health"]').textContent();

  // sim returns 100 (full health); HUD shows Math.round(clamped) as a string.
  expect(hudHealthText?.trim()).toBe(String(Math.round(Math.max(0, Math.min(100, simHealth)))));

  // ── 2. Crosshair element is present and visible ───────────────────────────
  const crosshair = page.locator('[data-testid="hud-crosshair"]');
  await expect(crosshair).toBeAttached();

  // ── 3. Ammo shows AR placeholder (30 / 120) ───────────────────────────────
  const ammoText = await page.locator('[data-testid="hud-ammo"]').textContent();
  expect(ammoText?.trim()).toBe('30 / 120');

  // ── 4. HUD is outside #game canvas (V4 visual baseline unaffected) ─────────
  const hudInCanvas = await page.evaluate(() => {
    const game = document.getElementById('game');
    const hud = document.getElementById('hud');
    if (!game || !hud) return false;
    return game.contains(hud);
  });
  expect(hudInCanvas).toBe(false);

  // ── 5. Health stays 100 (no damage system yet) ────────────────────────────
  // Step forward 30 ticks deterministically and verify health is unchanged.
  const healthAfterTicks = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 30; i++) {
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!().player.health;
  });
  expect(healthAfterTicks).toBe(100);

  // HUD should still reflect that.
  const hudHealthAfter = await page.locator('[data-testid="hud-health"]').textContent();
  expect(hudHealthAfter?.trim()).toBe('100');

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('T-130: HUD DOM structure is correct', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  await page.waitForSelector('#hud', { timeout: 5_000 });

  // All required testid elements are present.
  await expect(page.locator('[data-testid="hud-health"]')).toBeAttached();
  await expect(page.locator('[data-testid="hud-health-bar"]')).toBeAttached();
  await expect(page.locator('[data-testid="hud-ammo"]')).toBeAttached();
  await expect(page.locator('[data-testid="hud-crosshair"]')).toBeAttached();

  // Health bar is a child of hud-health-bar-outer (structure check).
  const barParent = await page.locator('[data-testid="hud-health-bar"]').evaluate((el) => {
    return el.parentElement?.className ?? '';
  });
  expect(barParent).toContain('hud-health-bar-outer');

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});
