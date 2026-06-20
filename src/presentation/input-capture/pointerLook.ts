/**
 * Pointer Lock look capture — presentation layer only.
 *
 * Requests pointer lock on canvas click, reads raw movementX/movementY from
 * mousemove events (NO smoothing, NO averaging, NO acceleration), converts via
 * mouseToAngles (from sim/input/sensitivity), and pushes LookCommands into the
 * provided CommandBuffer each event.
 *
 * Pitch clamping is handled by world.step() in the sim (±89°).
 * This module contains NO sim logic — it only bridges DOM events to commands.
 *
 * References: docs/research/03-gunplay.md §3.3
 */
import { mouseToAngles } from '../../sim/input/sensitivity';
import type { CommandBuffer } from '../../sim/input/commands';

/** Sensitivity configuration for the pointer lock capture. */
export interface PointerLookConfig {
  /**
   * In-game sensitivity (Source-style, dimensionless).
   * Default: 2.0 — a mid-range value corresponding to ~800 eDPI at 400 DPI,
   * which is ~40 cm/360 (within the ~28–50 cm/360 pro range from research/03 §3.3).
   */
  sens?: number;
  /**
   * Mouse DPI setting (informational; used for eDPI/cm360 display only).
   * Does not affect the raw movement conversion — raw counts are passed directly.
   */
  dpi?: number;
  /** Invert Y axis (default: false). */
  invertY?: boolean;
}

const DEFAULT_SENS = 2.0;

/**
 * PointerLook — attaches Pointer Lock input capture to a canvas element.
 *
 * Usage:
 *   const look = new PointerLook(canvas, commandBuffer, { sens: 2.0 });
 *   // Later: look.dispose();
 */
export class PointerLook {
  private readonly canvas: HTMLCanvasElement;
  private readonly commands: CommandBuffer;
  private sens: number;
  private invertY: boolean;
  private locked = false;

  private readonly onClickBound: () => void;
  private readonly onMouseMoveBound: (e: MouseEvent) => void;
  private readonly onLockChangeBound: () => void;
  private readonly onLockErrorBound: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement, commands: CommandBuffer, config?: PointerLookConfig) {
    this.canvas = canvas;
    this.commands = commands;
    this.sens = config?.sens ?? DEFAULT_SENS;
    this.invertY = config?.invertY ?? false;

    this.onClickBound = this.onClick.bind(this);
    this.onMouseMoveBound = this.onMouseMove.bind(this);
    this.onLockChangeBound = this.onLockChange.bind(this);
    this.onLockErrorBound = this.onLockError.bind(this);

    canvas.addEventListener('click', this.onClickBound);
    document.addEventListener('mousemove', this.onMouseMoveBound);
    document.addEventListener('pointerlockchange', this.onLockChangeBound);
    document.addEventListener('pointerlockerror', this.onLockErrorBound);
  }

  /** Current sensitivity. */
  get sensitivity(): number {
    return this.sens;
  }

  /** Update sensitivity at runtime (e.g. from settings). */
  setSensitivity(sens: number): void {
    this.sens = sens;
  }

  /** Set invert Y at runtime. */
  setInvertY(invert: boolean): void {
    this.invertY = invert;
  }

  /** True when pointer is currently locked. */
  get isLocked(): boolean {
    return this.locked;
  }

  /** Remove all event listeners. */
  dispose(): void {
    this.canvas.removeEventListener('click', this.onClickBound);
    document.removeEventListener('mousemove', this.onMouseMoveBound);
    document.removeEventListener('pointerlockchange', this.onLockChangeBound);
    document.removeEventListener('pointerlockerror', this.onLockErrorBound);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  private onClick(): void {
    if (!this.locked) {
      this.canvas.requestPointerLock();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked) return;
    // Raw movementX/Y — no smoothing, no averaging, no acceleration.
    const { movementX, movementY } = e;
    if (movementX === 0 && movementY === 0) return;

    const { dyaw, dpitch } = mouseToAngles(movementX, movementY, this.sens, {
      invertY: this.invertY,
    });
    this.commands.push({ type: 'look', dyaw, dpitch });
  }

  private onLockChange(): void {
    this.locked = document.pointerLockElement === this.canvas;
  }

  private onLockError(e: Event): void {
    console.warn('[PointerLook] pointer lock error', e);
  }
}
