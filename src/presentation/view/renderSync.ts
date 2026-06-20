import type { Snapshot } from '../../sim';
import type { GameRenderer } from '../rendering/renderer';

/**
 * RenderSync — interpolates between the two latest sim snapshots by `alpha`
 * (the fractional progress toward the next tick) so rendering is smooth and
 * decoupled from the fixed 60 Hz sim. Presentation reads snapshots only.
 */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RenderSync {
  private prev: Snapshot | null = null;
  private curr: Snapshot | null = null;

  /** Push the newest sim snapshot; the previous becomes the interpolation start. */
  push(s: Snapshot): void {
    this.prev = this.curr ?? s;
    this.curr = s;
  }

  /** Interpolate and drive the renderer camera. alpha in [0,1]. */
  apply(renderer: GameRenderer, alpha: number): void {
    const a = this.prev;
    const b = this.curr;
    if (!b) return;
    const from = a ?? b;
    const px = from.player.position.x + (b.player.position.x - from.player.position.x) * alpha;
    const py = from.player.position.y + (b.player.position.y - from.player.position.y) * alpha;
    const pz = from.player.position.z + (b.player.position.z - from.player.position.z) * alpha;
    const yaw = lerpAngle(from.player.yaw, b.player.yaw, alpha);
    const pitch = from.player.pitch + (b.player.pitch - from.player.pitch) * alpha;
    renderer.setCamera(px, py, pz, yaw, pitch);
  }
}
