import { test, expect } from '@playwright/test';

/**
 * T-103 E2E — Sprint + tactical sprint + sprint-to-fire delay.
 *
 * Acceptance criterion (V3): fire blocked during sprint-out window.
 *
 * Drives sprint via __pushCommand with sprint/tacSprint fields and asserts
 * __GAME_STATE__().player.canFire via __stepTo for deterministic tick control.
 */

test('T-103: canFire is false while sprinting and during sprint-out window', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  // ── 1. canFire=true before any sprint ──────────────────────────────────────
  const initial = await page.evaluate(() => window.__GAME_STATE__!());
  expect(initial.player.canFire).toBe(true);
  expect(initial.player.isSprinting).toBe(false);

  // ── 2. canFire=false while sprinting ──────────────────────────────────────
  // Push 10 sprint ticks deterministically.
  const afterSprint = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 10; i++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false, sprint: true });
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!();
  });
  expect(afterSprint.player.isSprinting).toBe(true);
  expect(afterSprint.player.canFire).toBe(false);
  // Player must have moved further than a walk would (sprint ×1.4)
  expect(Math.abs(afterSprint.player.position.z - initial.player.position.z)).toBeGreaterThan(0.1);

  // ── 3. canFire=false immediately after sprint release (sprint-out window) ──
  // Release sprint: push one tick with no sprint keys.
  const afterRelease = await page.evaluate(() => {
    const tick = window.__GAME_STATE__!().tick;
    window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false });
    window.__stepTo!(tick + 1);
    return window.__GAME_STATE__!();
  });
  // isSprinting must be false now
  expect(afterRelease.player.isSprinting).toBe(false);
  // But canFire must still be false (in sprint-out window)
  expect(afterRelease.player.canFire).toBe(false);
  // sprintOutUntilTick must be set (> current tick)
  expect(afterRelease.player.sprintOutUntilTick).toBeGreaterThan(afterRelease.tick);

  // ── 4. canFire=true after sprint-out window elapses ────────────────────────
  // Advance past the sprint-out window. Sprint-out = 9 ticks at 60 Hz.
  // We'll step exactly to sprintOutUntilTick to be precise.
  const sprintOutUntilTick = afterRelease.player.sprintOutUntilTick;

  const afterWindow = await page.evaluate((targetTick: number) => {
    // Step one tick at a time to sprintOutUntilTick, pushing walk commands.
    const current = window.__GAME_STATE__!().tick;
    for (let t = current; t < targetTick; t++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false });
      window.__stepTo!(t + 1);
    }
    return window.__GAME_STATE__!();
  }, sprintOutUntilTick);

  // At sprintOutUntilTick exactly, the window has expired.
  expect(afterWindow.tick).toBe(sprintOutUntilTick);
  expect(afterWindow.player.isSprinting).toBe(false);
  expect(afterWindow.player.canFire).toBe(true);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('T-103: canFire is false during tac-sprint and longer sprint-out window', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?seed=1337');
  await page.waitForFunction(() => window.__GAME_READY__ === true, undefined, {
    timeout: 30_000,
  });

  // ── 1. Tac-sprint for 10 ticks ──────────────────────────────────────────────
  const afterTacSprint = await page.evaluate(() => {
    const start = window.__GAME_STATE__!().tick;
    for (let i = 0; i < 10; i++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false, tacSprint: true });
      window.__stepTo!(start + i + 1);
    }
    return window.__GAME_STATE__!();
  });
  expect(afterTacSprint.player.isSprinting).toBe(true);
  expect(afterTacSprint.player.canFire).toBe(false);
  // Player must have moved further than sprint (tac-sprint ×1.7 vs sprint ×1.4)
  expect(Math.abs(afterTacSprint.player.position.z - 0)).toBeGreaterThan(0.1);

  // ── 2. Release tac-sprint — sprint-out window must be 15 ticks ──────────────
  const afterRelease = await page.evaluate(() => {
    const tick = window.__GAME_STATE__!().tick;
    window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false });
    window.__stepTo!(tick + 1);
    return window.__GAME_STATE__!();
  });
  expect(afterRelease.player.isSprinting).toBe(false);
  expect(afterRelease.player.canFire).toBe(false);

  // Tac-sprint-out window should be tick+1+15 = afterTacSprint.tick+1+15
  // = 10 + 1 + 15 = 26 (relative to the 10-tick sprint that ends at tick 10)
  const expectedSprintOutUntilTick = afterTacSprint.tick + 1 + 15; // TAC_SPRINT_OUT_TICKS = 15
  expect(afterRelease.player.sprintOutUntilTick).toBe(expectedSprintOutUntilTick);

  // ── 3. canFire=true after tac-sprint-out window ──────────────────────────────
  const sprintOutUntilTick = afterRelease.player.sprintOutUntilTick;
  const afterWindow = await page.evaluate((targetTick: number) => {
    const current = window.__GAME_STATE__!().tick;
    for (let t = current; t < targetTick; t++) {
      window.__pushCommand!({ type: 'move', forward: 1, right: 0, jump: false });
      window.__stepTo!(t + 1);
    }
    return window.__GAME_STATE__!();
  }, sprintOutUntilTick);

  expect(afterWindow.tick).toBe(sprintOutUntilTick);
  expect(afterWindow.player.canFire).toBe(true);

  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});
