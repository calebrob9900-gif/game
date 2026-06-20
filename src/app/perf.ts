/**
 * Frame-time probe for V5. Records per-frame deltas (presentation side, so
 * performance.now() is allowed here — not in src/sim). Exposed via window.__perf.
 */
export interface PerfStats {
  frames: number;
  avgFps: number;
  p95Frame: number;
  low1pct: number;
  backend: string;
}

export class FrameProbe {
  private times: number[] = [];
  private deltas: number[] = [];
  private last = 0;
  backend = 'unknown';

  record(now: number): void {
    if (this.last > 0) {
      const d = now - this.last;
      if (d > 0) {
        this.deltas.push(d);
        this.times.push(now);
        if (this.deltas.length > 4000) {
          this.deltas.shift();
          this.times.shift();
        }
      }
    }
    this.last = now;
  }

  sample(ms = 1000): PerfStats {
    const n = this.times.length;
    const latest = n > 0 ? (this.times[n - 1] ?? 0) : 0;
    const cutoff = latest - ms;
    const window: number[] = [];
    for (let i = 0; i < n; i++) {
      if ((this.times[i] ?? 0) >= cutoff) window.push(this.deltas[i] ?? 0);
    }
    return this.compute(window);
  }

  stats(): PerfStats {
    return this.sample(1000);
  }

  private compute(deltas: number[]): PerfStats {
    if (deltas.length === 0) {
      return { frames: 0, avgFps: 0, p95Frame: 0, low1pct: 0, backend: this.backend };
    }
    const sorted = [...deltas].sort((a, b) => a - b);
    const sum = deltas.reduce((a, b) => a + b, 0);
    const mean = sum / deltas.length;
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95Frame = sorted[p95Index] ?? mean;
    // low 1%: average of the worst 1% frame times -> fps
    const worstCount = Math.max(1, Math.floor(sorted.length * 0.01));
    const worst = sorted.slice(sorted.length - worstCount);
    const worstMean = worst.reduce((a, b) => a + b, 0) / worst.length;
    return {
      frames: deltas.length,
      avgFps: 1000 / mean,
      p95Frame,
      low1pct: 1000 / worstMean,
      backend: this.backend,
    };
  }
}
