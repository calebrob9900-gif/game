import { test, expect } from '@playwright/test';

/**
 * T-105 E2E — Slide + Vault/Mantle.
 *
 * Acceptance criterion (V3):
 *   - E2E slide over distance: sprint+crouch via __pushCommand → player slides
 *     further than a normal crouch-walk; isSliding=true in __GAME_STATE__.
 *   - E2E mantle a ledge: walk into a 1.0 m ledge → player ends up ON TOP
 *     (foot y ≈ 1.0), which STEP_HEIGHT=0.4 m alone cannot achieve.
 *
 * Uses ?scenario=test for slide (testLevel, flat ground, sprint possible) and
 * ?scenario=mantle_test for the mantle (mantleTestLevel with a 1.0 m ledge).
 *
 * All interaction via __pushCommand + __stepTo for deterministic tick control.
 */

// ── Slide E2E ─────────────────────────────────────────────────────────────────

test('T-105: slide travels further than crouch-walk and sets isSliding flag', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  // Use ?scenario=test to load the test level (activates capsule controller + slide/mantle)
  await page.goto('/?seed=1234&scenario=test');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  const initial = await page.evaluate(() => window.__GAME_STATE__!());
  expect(initial.player.isSliding).toBe(false);
  expect(initial.player.isCrouched).toBe(false);

  // ── Sprint 5 ticks to build sprint speed ────────────────────────────────────
  const afterSprint = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 5; i++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false, sprint: true });
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!();
  });
  expect(afterSprint.player.isSprinting).toBe(true);

  // ── Trigger slide: sprint+crouch ─────────────────────────────────────────────
  const afterSlideTrigger = await page.evaluate(() => {
    const tick = window.__GAME_STATE__!().tick;
    window.__pushCommand!({
      type: 'move',
      forward: 1,
      right: 0,
      jump: false,
      sprint: true,
      crouch: true,
    });
    window.__stepTo!(tick + 1);
    return window.__GAME_STATE__!();
  });

  // isSliding must be true immediately after trigger
  expect(afterSlideTrigger.player.isSliding).toBe(true);
  expect(afterSlideTrigger.player.slideTicksLeft).toBeGreaterThan(0);
  // Must use crouch eye height while sliding
  expect(afterSlideTrigger.player.eyeHeight).toBe(1.0);

  // ── Slide for 10 more ticks (stay in boost window) ──────────────────────────
  const afterSlide = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 10; i++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false, crouch: true });
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!();
  });

  // Slide distance vs what a crouch-walk would cover over same ticks:
  // Slide: ~8.4 m/s (1.4× run speed) for 10+ ticks → moves ~1.4 m
  // Crouch-walk: ~2.7 m/s (0.45× run speed) for same ticks → ~0.45 m
  // The difference should be clear.
  const slideDistance = Math.abs(afterSlide.player.position.z - initial.player.position.z);

  // Now run a crouch-walk for the same total ticks on a fresh world
  // We can't run two worlds in E2E, but we can verify the slide distance exceeds
  // what a plain crouch-walk would achieve: 16 ticks × 6 m/s × 0.45 = 0.72 m
  // (actually more like 16/60 × 2.7 ≈ 0.72 m). Slide should be >> this.
  const totalTicks = 16; // 5 sprint + 1 trigger + 10 slide
  const maxCrouchWalkDist = totalTicks * (6 * 0.45) * (1 / 60); // ~0.72 m
  expect(slideDistance).toBeGreaterThan(maxCrouchWalkDist * 1.5); // slide ≫ crouch-walk

  // Slide must be positive (moved forward)
  expect(slideDistance).toBeGreaterThan(0.5);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

// ── Mantle E2E ───────────────────────────────────────────────────────────────

test('T-105: player auto-mantles a 1.0 m ledge and ends up on top', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  // Use ?scenario=mantle_test to load the 1.0 m ledge level
  await page.goto('/?seed=42&scenario=mantle_test');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  const initial = await page.evaluate(() => window.__GAME_STATE__!());
  expect(initial.player.isMantling).toBe(false);

  // Initial foot y (spawn at foot y=0, eye y=1.7)
  const initialFootY = initial.player.position.y - initial.player.eyeHeight;
  expect(initialFootY).toBeCloseTo(0, 1); // foot starts near y=0

  // ── Walk 80 ticks forward toward the 1.0 m ledge at z=-5 ────────────────────
  const afterMantle = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 80; i++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false });
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!();
  });

  // Player must have moved forward
  expect(afterMantle.player.position.z).toBeLessThan(-1.0);

  // Foot y after mantling should be ≈ 1.0 (top of the ledge)
  const finalFootY = afterMantle.player.position.y - afterMantle.player.eyeHeight;

  // CRITICAL assertion: foot y > STEP_HEIGHT (0.4 m) proves mantle occurred,
  // not just step-up. A 1.0 m ledge is unreachable by step-up alone.
  expect(finalFootY).toBeGreaterThan(0.4); // above max step-up height

  // Foot y should be close to 1.0 m (top of the ledge)
  expect(finalFootY).toBeGreaterThanOrEqual(0.9);
  expect(finalFootY).toBeLessThanOrEqual(1.15);

  // Verify isMantling was true at some point (checked via the flag - we can't inspect
  // intermediate states, but the final position proves the mantle happened)
  // The isMantling flag should be false after mantle completes (no longer mantling)
  expect(afterMantle.player.isMantling).toBe(false);
  expect(afterMantle.player.mantleTicksLeft).toBe(0);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('T-105: isSliding=false and isMantling=false initially (no regression to existing behaviour)', async ({
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

  const s = await page.evaluate(() => window.__GAME_STATE__!());
  // New fields must be present and false by default
  expect(s.player.isSliding).toBe(false);
  expect(s.player.slideTicksLeft).toBe(0);
  expect(s.player.isMantling).toBe(false);
  expect(s.player.mantleTicksLeft).toBe(0);
  // canFire still works as before
  expect(s.player.canFire).toBe(true);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});
