import { World } from 'miniplex';

/**
 * ECS = miniplex World of plain-object entities + an ordered SystemRunner.
 * Systems run in a fixed, stable order every tick — order is part of the
 * determinism contract (see docs/ARCHITECTURE.md §3).
 */
export { World };

export interface System<W> {
  readonly name: string;
  run(world: W): void;
}

export class SystemRunner<W> {
  private readonly systems: System<W>[] = [];

  add(system: System<W>): this {
    this.systems.push(system);
    return this;
  }

  /** The system execution order, for assertions/tests. */
  get order(): string[] {
    return this.systems.map((s) => s.name);
  }

  run(world: W): void {
    for (const system of this.systems) {
      system.run(world);
    }
  }
}

/** Convenience to define a system inline. */
export function defineSystem<W>(name: string, run: (world: W) => void): System<W> {
  return { name, run };
}
