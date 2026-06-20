/**
 * Typed event bus for the sim. Listeners fire in stable insertion order
 * (deterministic). Presentation subscribes to react to gameplay events; the
 * sim emits but never reads back rendering state.
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<E extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof E, Listener<unknown>[]>();

  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    let arr = this.listeners.get(type);
    if (!arr) {
      arr = [];
      this.listeners.set(type, arr);
    }
    arr.push(fn as Listener<unknown>);
    return () => this.off(type, fn);
  }

  off<K extends keyof E>(type: K, fn: Listener<E[K]>): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn as Listener<unknown>);
    if (i >= 0) arr.splice(i, 1);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    // Iterate a copy so a listener may safely unsubscribe during dispatch.
    for (const fn of arr.slice()) {
      (fn as Listener<E[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
