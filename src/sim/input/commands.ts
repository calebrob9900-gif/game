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
}

export interface LookCommand {
  readonly type: 'look';
  /** Yaw delta (radians) this tick. */
  readonly dyaw: number;
  /** Pitch delta (radians) this tick. */
  readonly dpitch: number;
}

export type Command = MoveCommand | LookCommand;

/** Per-tick aggregate of the commands applied on a single tick. */
export interface TickInput {
  forward: number;
  right: number;
  jump: boolean;
  /** True when the sprint key is held this tick. */
  sprint: boolean;
  /** True when the tactical-sprint key is held this tick. */
  tacSprint: boolean;
  dyaw: number;
  dpitch: number;
}

export function emptyTickInput(): TickInput {
  return { forward: 0, right: 0, jump: false, sprint: false, tacSprint: false, dyaw: 0, dpitch: 0 };
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
    } else {
      input.dyaw += cmd.dyaw;
      input.dpitch += cmd.dpitch;
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
