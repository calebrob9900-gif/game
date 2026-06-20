/**
 * Input commands — the ONLY way input enters the sim. They are buffered and
 * applied at fixed-tick boundaries so the sim stays a pure function of
 * (seed, settings, command stream) and replays deterministically.
 */
export interface MoveCommand {
  readonly type: 'move';
  /** -1..1 desired ground move on the forward/back axis. */
  readonly forward: number;
  /** -1..1 desired ground move on the strafe axis. */
  readonly right: number;
  readonly jump: boolean;
  /**
   * Sprint input. Requires forward-ish movement. Grants ×1.4 of base run speed.
   * Forbids firing while active. Optional (defaults false) so existing literals stay valid.
   * From research/03 §7.2.
   */
  readonly sprint?: boolean;
  /**
   * Tactical sprint input. Grants ×1.7 of base run speed with a longer sprint-out window.
   * Optional (defaults false). From research/03 §7.2.
   */
  readonly tacSprint?: boolean;
  /**
   * Crouch input. When held and on ground: speed ×0.45, lower stance (eyeHeight ~1.0,
   * capsule height ~1.2 m). Mutually exclusive with sprint — crouch wins if both held.
   * Optional (defaults false) so existing literals stay valid. From research/03 §7.3.
   */
  readonly crouch?: boolean;
}

export interface LookCommand {
  readonly type: 'look';
  /** Yaw delta (radians) this tick. */
  readonly dyaw: number;
  /** Pitch delta (radians) this tick. */
  readonly dpitch: number;
}

/**
 * Fire command — trigger the player's current weapon (hitscan or projectile).
 * Processed in world.step() inside the "// --- combat/fire ---" section.
 * Firing is only executed when canFire is true (no sprint / sprint-out window).
 */
export interface FireCommand {
  readonly type: 'fire';
}

export type Command = MoveCommand | LookCommand | FireCommand;

/** Per-tick aggregate of the commands applied on a single tick. */
export interface TickInput {
  forward: number;
  right: number;
  jump: boolean;
  /** True when the sprint key is held this tick. */
  sprint: boolean;
  /** True when the tactical-sprint key is held this tick. */
  tacSprint: boolean;
  /**
   * True when the crouch key is held this tick. Mutually exclusive with sprint
   * (crouch wins). Optional source field; defaults false when absent.
   */
  crouch: boolean;
  dyaw: number;
  dpitch: number;
  /**
   * True when a FireCommand was issued this tick.
   * Processed in world.step() under the "// --- combat/fire ---" section.
   */
  fire: boolean;
}

export function emptyTickInput(): TickInput {
  return {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    tacSprint: false,
    crouch: false,
    dyaw: 0,
    dpitch: 0,
    fire: false,
  };
}

/** Fold a list of commands into a single tick's input. */
export function foldCommands(commands: readonly Command[]): TickInput {
  const input = emptyTickInput();
  for (const cmd of commands) {
    if (cmd.type === 'move') {
      input.forward = clamp(cmd.forward, -1, 1);
      input.right = clamp(cmd.right, -1, 1);
      input.jump = input.jump || cmd.jump;
      input.sprint = input.sprint || (cmd.sprint ?? false);
      input.tacSprint = input.tacSprint || (cmd.tacSprint ?? false);
      input.crouch = input.crouch || (cmd.crouch ?? false);
    } else if (cmd.type === 'look') {
      input.dyaw += cmd.dyaw;
      input.dpitch += cmd.dpitch;
    } else if (cmd.type === 'fire') {
      input.fire = true;
    }
  }
  return input;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Buffers commands pushed between ticks; drained once per tick boundary.
 */
export class CommandBuffer {
  private queued: Command[] = [];

  push(cmd: Command): void {
    this.queued.push(cmd);
  }

  drain(): Command[] {
    const out = this.queued;
    this.queued = [];
    return out;
  }

  get size(): number {
    return this.queued.length;
  }
}
