import type { Snapshot } from '../../sim/snapshot';
import { AR_BASELINE } from '../../sim/weapons/weapons';

/**
 * HUD — heads-up display overlay rendered as DOM elements over the canvas.
 *
 * Shows: health (number + bar), ammo / reserve, and a centre crosshair.
 *
 * The HUD container sits OUTSIDE #game (the canvas element) so the V4 visual
 * baseline (which screenshots #game) is unaffected.
 *
 * Ammo is a placeholder using AR_BASELINE (magSize 30 / reserve 120) until
 * weapon state is wired up in T-115.
 *
 * Performance: update() compares values before touching the DOM, so per-frame
 * allocations are zero when nothing changes.
 */

// Static AR placeholder values (T-115 will replace with live weapon state).
const AR_MAG = AR_BASELINE.magSize; // 30
const AR_RESERVE = AR_BASELINE.reserve; // 120

export class Hud {
  /** Root container element, positioned over the canvas. */
  readonly el: HTMLDivElement;

  private readonly healthNum: HTMLSpanElement;
  private readonly healthBar: HTMLDivElement;
  private readonly ammoEl: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;

  // Cached values to avoid unnecessary DOM writes.
  private _health = -1;

  /** Gap (px) between each crosshair arm and the centre. Set via setCrosshairGap(). */
  private _crosshairGap = 4;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.setAttribute('aria-hidden', 'true');

    // ── Health ──────────────────────────────────────────────────────────────
    const healthWrap = document.createElement('div');
    healthWrap.className = 'hud-health-wrap';

    this.healthNum = document.createElement('span');
    this.healthNum.className = 'hud-health-num';
    this.healthNum.setAttribute('data-testid', 'hud-health');

    const healthBarOuter = document.createElement('div');
    healthBarOuter.className = 'hud-health-bar-outer';

    this.healthBar = document.createElement('div');
    this.healthBar.className = 'hud-health-bar';
    this.healthBar.setAttribute('data-testid', 'hud-health-bar');

    healthBarOuter.appendChild(this.healthBar);
    healthWrap.appendChild(this.healthNum);
    healthWrap.appendChild(healthBarOuter);

    // ── Ammo ─────────────────────────────────────────────────────────────────
    this.ammoEl = document.createElement('div');
    this.ammoEl.className = 'hud-ammo';
    this.ammoEl.setAttribute('data-testid', 'hud-ammo');
    // Static placeholder until T-115 wires up live weapon state.
    this.ammoEl.textContent = `${AR_MAG} / ${AR_RESERVE}`;

    // ── Crosshair ─────────────────────────────────────────────────────────────
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';
    this.crosshair.setAttribute('data-testid', 'hud-crosshair');

    // Four arms: top, bottom, left, right.
    const arms = ['top', 'bottom', 'left', 'right'] as const;
    for (const dir of arms) {
      const arm = document.createElement('div');
      arm.className = `hud-crosshair-arm hud-crosshair-${dir}`;
      this.crosshair.appendChild(arm);
    }

    this.el.appendChild(healthWrap);
    this.el.appendChild(this.ammoEl);
    this.el.appendChild(this.crosshair);

    container.appendChild(this.el);

    this._applyCrosshairGap();
  }

  /**
   * Refresh HUD from the latest snapshot. Called each rendered frame.
   * Only writes to the DOM when values change (no per-frame allocation).
   */
  update(snap: Snapshot): void {
    const hp = snap.player.health;
    if (hp !== this._health) {
      this._health = hp;
      const clamped = Math.max(0, Math.min(100, hp));
      this.healthNum.textContent = String(Math.round(clamped));
      this.healthBar.style.width = `${clamped}%`;
    }
  }

  /**
   * Set the crosshair gap (px between each arm and the centre).
   * Called by T-113 (dynamic spread) to expand/contract the crosshair.
   */
  setCrosshairGap(px: number): void {
    this._crosshairGap = px;
    this._applyCrosshairGap();
  }

  private _applyCrosshairGap(): void {
    const g = this._crosshairGap;
    const el = this.crosshair;
    el.style.setProperty('--ch-gap', `${g}px`);
  }
}

/** Inject HUD stylesheet into <head> (idempotent — only added once). */
export function injectHudStyles(): void {
  if (document.getElementById('hud-styles')) return;
  const style = document.createElement('style');
  style.id = 'hud-styles';
  style.textContent = HUD_CSS;
  document.head.appendChild(style);
}

const HUD_CSS = `
#hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  font-family: system-ui, monospace, sans-serif;
  color: #38e1ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  user-select: none;
}

/* ── Health (bottom-left) ────────────────────────────────────────────── */
.hud-health-wrap {
  position: absolute;
  bottom: 28px;
  left: 28px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hud-health-num {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: #38e1ff;
  text-shadow: 0 0 8px #38e1ff88;
}

.hud-health-bar-outer {
  width: 120px;
  height: 4px;
  background: rgba(56, 225, 255, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.hud-health-bar {
  height: 100%;
  background: #38e1ff;
  box-shadow: 0 0 6px #38e1ffaa;
  transition: width 0.1s linear;
  border-radius: 2px;
}

/* ── Ammo (bottom-right) ────────────────────────────────────────────── */
.hud-ammo {
  position: absolute;
  bottom: 28px;
  right: 28px;
  font-size: 26px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
}

/* ── Crosshair (centre) ─────────────────────────────────────────────── */
.hud-crosshair {
  --ch-gap: 4px;
  --ch-len: 10px;
  --ch-thick: 2px;
  --ch-color: rgba(255, 255, 255, 0.92);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0;
  height: 0;
}

.hud-crosshair-arm {
  position: absolute;
  background: var(--ch-color);
  box-shadow: 0 0 4px rgba(56, 225, 255, 0.5);
}

/* Vertical arms */
.hud-crosshair-top,
.hud-crosshair-bottom {
  width: var(--ch-thick);
  height: var(--ch-len);
  left: calc(var(--ch-thick) / -2);
}
.hud-crosshair-top {
  bottom: var(--ch-gap);
}
.hud-crosshair-bottom {
  top: var(--ch-gap);
}

/* Horizontal arms */
.hud-crosshair-left,
.hud-crosshair-right {
  height: var(--ch-thick);
  width: var(--ch-len);
  top: calc(var(--ch-thick) / -2);
}
.hud-crosshair-left {
  right: var(--ch-gap);
}
.hud-crosshair-right {
  left: var(--ch-gap);
}
`;
