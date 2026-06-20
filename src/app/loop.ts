import { DT, MAX_FRAME_TIME } from '../sim';

/**
 * Canonical fixed-timestep accumulator loop (Gaffer "Fix Your Timestep").
 * The sim advances in fixed DT steps; the renderer interpolates by `alpha`.
 * Frame time is clamped to avoid the spiral of death. The loop can be paused
 * so tests can drive the sim deterministically via __stepTo.
 */
export interface LoopCallbacks {
  /** Advance the sim exactly one fixed tick. */
  stepSim(): void;
  /** Render with interpolation factor alpha in [0,1). */
  render(alpha: number): void;
  /** Per-rendered-frame hook (e.g. perf probe). */
  onFrame?(nowMs: number): void;
}

export class FixedLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    const frame = (now: number): void => {
      if (!this.running) return;
      let frameTime = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
      this.accumulator += frameTime;
      while (this.accumulator >= DT) {
        this.cb.stepSim();
        this.accumulator -= DT;
      }
      const alpha = this.accumulator / DT;
      this.cb.render(alpha);
      this.cb.onFrame?.(now);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
