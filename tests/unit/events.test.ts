import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/sim';

interface Events extends Record<string, unknown> {
  hit: { dmg: number };
}

describe('EventBus', () => {
  it('dispatches in subscription order', () => {
    const bus = new EventBus<Events>();
    const order: number[] = [];
    bus.on('hit', () => order.push(1));
    bus.on('hit', () => order.push(2));
    bus.on('hit', () => order.push(3));
    bus.emit('hit', { dmg: 10 });
    expect(order).toEqual([1, 2, 3]);
  });

  it('passes the payload and supports unsubscribe', () => {
    const bus = new EventBus<Events>();
    let total = 0;
    const off = bus.on('hit', (p) => (total += p.dmg));
    bus.emit('hit', { dmg: 5 });
    off();
    bus.emit('hit', { dmg: 5 });
    expect(total).toBe(5);
  });
});
