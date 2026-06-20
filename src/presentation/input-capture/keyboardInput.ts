import type { MoveCommand } from '../../sim';

/**
 * Live keyboard movement capture (presentation only).
 *
 * Tracks held movement keys and produces a MoveCommand for the current tick.
 * This mirrors the exact command contract the deterministic test harness uses
 * (window.__pushCommand): the sim never sees the DOM, only folded Commands —
 * so live human input and replay input travel the identical code path.
 *
 * Bindings (standard FPS):
 *   W / S          → forward +1 / −1
 *   A / D          → strafe  −1 / +1   (right = +1)
 *   Space          → jump
 *   Shift (L or R) → sprint
 *   Ctrl (L) / C   → crouch
 *
 * Call sample() once per fixed sim tick and push the result into the buffer.
 */
const MOVEMENT_CODES = new Set<string>([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'KeyC',
]);

export class KeyboardInput {
  private readonly held = new Set<string>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!MOVEMENT_CODES.has(e.code)) return;
    this.held.add(e.code);
    e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!MOVEMENT_CODES.has(e.code)) return;
    this.held.delete(e.code);
    e.preventDefault();
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  /** MoveCommand reflecting the keys held right now (forward = −Z basis). */
  sample(): MoveCommand {
    const h = this.held;
    const forward = (h.has('KeyW') ? 1 : 0) + (h.has('KeyS') ? -1 : 0);
    const right = (h.has('KeyD') ? 1 : 0) + (h.has('KeyA') ? -1 : 0);
    return {
      type: 'move',
      forward,
      right,
      jump: h.has('Space'),
      sprint: h.has('ShiftLeft') || h.has('ShiftRight'),
      crouch: h.has('ControlLeft') || h.has('KeyC'),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }
}
