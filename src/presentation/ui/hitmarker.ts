/**
 * Hitmarker — DOM overlay near the crosshair, rendered outside #game canvas.
 *
 * Shows a brief X-flash on confirmed hits with three variants (research/03 §6.1):
 *   normal  — white X (body hit)
 *   head    — different color + larger, for headshot (region === 'head')
 *   kill    — thicker red X, for killing blow (target health → 0)
 *
 * Lifetime: ~120 ms (within the 80–150 ms spec range), scale-in then fade (CSS).
 * Pooling: a single pooled element is reused; no per-hit allocation churn.
 *
 * data-testid="hitmarker" reflects the variant via data-variant attribute.
 */

/** The three hitmarker variants. */
export type HitmarkerVariant = 'normal' | 'head' | 'kill';

/**
 * Hitmarker UI element — call show(variant) on each confirmed hit.
 * Injects CSS once. Attach styles via injectHitmarkerStyles().
 */
export class Hitmarker {
  /** The pooled DOM element (always present, hidden when inactive). */
  readonly el: HTMLDivElement;

  /** Timer ID for the current animation cycle (clearTimeout on show() re-entry). */
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Last variant shown (test instrumentation). */
  private _lastVariant: HitmarkerVariant | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hitmarker';
    this.el.setAttribute('data-testid', 'hitmarker');
    this.el.setAttribute('aria-hidden', 'true');
    // Start inactive (no variant)
    this.el.setAttribute('data-variant', '');

    // Four arms that form the X.
    for (const dir of ['tl', 'tr', 'bl', 'br'] as const) {
      const arm = document.createElement('div');
      arm.className = `hitmarker-arm hitmarker-arm--${dir}`;
      this.el.appendChild(arm);
    }

    container.appendChild(this.el);
  }

  /**
   * Show the hitmarker for this hit event.
   * Resets the lifetime timer if already animating (rapid fire).
   * Lifetime ~120 ms (research/03 §6.1 spec: 80–150 ms).
   */
  show(variant: HitmarkerVariant): void {
    this._lastVariant = variant;

    // Clear any in-progress animation timer so rapid hits restart the cycle.
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    // Remove all variant classes then add the active one.
    const el = this.el;
    el.classList.remove(
      'hitmarker--normal',
      'hitmarker--head',
      'hitmarker--kill',
      'hitmarker--active',
    );
    el.setAttribute('data-variant', variant);
    // Force a reflow so the CSS animation restarts from the beginning.
    void el.offsetWidth;
    el.classList.add(`hitmarker--${variant}`, 'hitmarker--active');

    // Remove active class after lifetime expires (CSS handles the fade).
    this._timer = setTimeout(() => {
      el.classList.remove(
        'hitmarker--active',
        'hitmarker--normal',
        'hitmarker--head',
        'hitmarker--kill',
      );
      el.setAttribute('data-variant', '');
      this._timer = null;
    }, 150); // 120 ms visible + 30 ms fade margin
  }

  /** Last variant shown — for test instrumentation (window.__lastHitmarker). */
  get lastVariant(): HitmarkerVariant | null {
    return this._lastVariant;
  }
}

/** Inject hitmarker stylesheet into <head> (idempotent). */
export function injectHitmarkerStyles(): void {
  if (document.getElementById('hitmarker-styles')) return;
  const style = document.createElement('style');
  style.id = 'hitmarker-styles';
  style.textContent = HITMARKER_CSS;
  document.head.appendChild(style);
}

/**
 * Hitmarker CSS.
 *
 * Positioned at the centre of the viewport (same anchor as crosshair).
 * Each arm is a thin rectangle rotated ±45° to form an X shape.
 *
 * Variant styles (research/03 §6.1):
 *   normal  — white,  2px thick
 *   head    — cyan/gold, 3px thick, slightly larger
 *   kill    — red,    4px thick (thicker), slightly larger
 *
 * Animation: scale-in from 0.6 then fade out over the lifetime.
 */
const HITMARKER_CSS = `
.hitmarker {
  --hm-size: 8px;
  --hm-thick: 2px;
  --hm-color: rgba(255, 255, 255, 0.95);

  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 20;

  /* Hidden when not active */
  opacity: 0;
}

/* Active: play scale-in then fade animation */
.hitmarker--active {
  animation: hitmarker-show 0.12s ease-out forwards;
}

@keyframes hitmarker-show {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(0.6); }
  20%  { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  40%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
  70%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.0); }
}

/* Variant — normal (white body hit) */
.hitmarker--normal {
  --hm-size: 8px;
  --hm-thick: 2px;
  --hm-color: rgba(255, 255, 255, 0.95);
}

/* Variant — head (headshot: distinct color, slightly larger) */
.hitmarker--head {
  --hm-size: 10px;
  --hm-thick: 3px;
  --hm-color: #ffd700;
}

/* Variant — kill (killing blow: thicker red) */
.hitmarker--kill {
  --hm-size: 12px;
  --hm-thick: 4px;
  --hm-color: #ff2222;
}

/* X arms — four rectangles rotated ±45° */
.hitmarker-arm {
  position: absolute;
  width: var(--hm-thick);
  height: var(--hm-size);
  background: var(--hm-color);
  box-shadow: 0 0 4px var(--hm-color);
  border-radius: 1px;
  top: calc(var(--hm-size) / -2);
  left: calc(var(--hm-thick) / -2);
  transform-origin: center center;
}

/* Top-left arm: rotated -45° and offset up-left */
.hitmarker-arm--tl {
  transform: rotate(-45deg) translate(-4px, calc(var(--hm-size) / -2 - 2px));
}
/* Top-right arm: rotated +45° and offset up-right */
.hitmarker-arm--tr {
  transform: rotate(45deg) translate(4px, calc(var(--hm-size) / -2 - 2px));
}
/* Bottom-left arm: rotated +45° and offset down-left */
.hitmarker-arm--bl {
  transform: rotate(45deg) translate(-4px, calc(var(--hm-size) / 2 + 2px));
}
/* Bottom-right arm: rotated -45° and offset down-right */
.hitmarker-arm--br {
  transform: rotate(-45deg) translate(4px, calc(var(--hm-size) / 2 + 2px));
}
`;
