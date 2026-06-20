import type { Command, Snapshot } from '../sim';
import type { PerfStats } from './perf';

/**
 * Test-instrumentation contract (docs/ARCHITECTURE.md §6). Present in dev/test
 * builds only — gated on import.meta.env.DEV so a production `vite build` tree-
 * shakes it out. Lets Playwright (V3/V4/V5) observe and drive the game
 * deterministically without reading pixels.
 */
export interface Instrumentation {
  getSnapshot(): Snapshot;
  pushCommand(cmd: Command): void;
  stepTo(tick: number): Snapshot;
  perf(): { sample: (ms?: number) => PerfStats; stats: () => PerfStats };
}

declare global {
  interface Window {
    __GAME_READY__?: boolean;
    __GAME_STATE__?: () => Snapshot;
    __perf?: { sample: (ms?: number) => PerfStats; stats: () => PerfStats };
    __pushCommand?: (cmd: Command) => void;
    __stepTo?: (tick: number) => Snapshot;
    /** Audio instrumentation: total sounds scheduled (dev/test only). */
    __audio?: { scheduled: () => number };
    /**
     * Add a damageable dummy target entity in front of the player
     * at the given distance in metres (dev/test only, for audio E2E).
     */
    __addTarget?: (distanceM: number) => void;
    /** Last hitmarker variant shown ('normal' | 'head' | 'kill'). T-120. */
    __lastHitmarker?: string | null;
  }
}

/** Returns a `markReady` setter the bootstrap calls once the first frame renders. */
export function installInstrumentation(api: Instrumentation): (ready: boolean) => void {
  // Present in dev AND in test builds (`vite build --mode test`, served via
  // `vite preview` for E2E/visual/perf), but STRIPPED from the real production
  // build (mode 'production') so the hooks never ship.
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    return () => {};
  }
  const w = window;
  w.__GAME_READY__ = false;
  w.__GAME_STATE__ = () => api.getSnapshot();
  w.__pushCommand = (cmd: Command) => api.pushCommand(cmd);
  w.__stepTo = (tick: number) => api.stepTo(tick);
  w.__perf = api.perf();
  // T-120: initialised null; set to last hitmarker variant by the event handler in main.ts.
  w.__lastHitmarker = null;
  return (ready: boolean) => {
    w.__GAME_READY__ = ready;
  };
}
