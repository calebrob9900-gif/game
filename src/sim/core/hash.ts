import type { SimWorld, Entity } from '../world';

/**
 * hashWorld(state) → stable string digest of gameplay state (FNV-1a/32).
 *
 * Quantizes floats to 1e-5 so the hash is robust to negligible cross-platform
 * float noise while still changing on any real gameplay change. Iterates
 * entities in stable insertion order. Used by replay tests to assert that
 * (seed + recorded inputs) reproduces an identical world.
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function quantize(n: number): number {
  // round to 1e-5; normalize -0 to 0
  const q = Math.round(n * 1e5) / 1e5;
  return q === 0 ? 0 : q;
}

function foldNumber(h: number, n: number): number {
  // Hash the decimal string of the quantized number for portability.
  const str = quantize(n).toString();
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  // separator so [1,23] and [12,3] differ
  h ^= 0x2c;
  return Math.imul(h, FNV_PRIME);
}

function foldStr(h: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  h ^= 0x7c;
  return Math.imul(h, FNV_PRIME);
}

function foldEntity(h: number, e: Entity): number {
  if (e.player) h = foldStr(h, 'P');
  if (e.position) {
    h = foldNumber(h, e.position.x);
    h = foldNumber(h, e.position.y);
    h = foldNumber(h, e.position.z);
  }
  if (e.velocity) {
    h = foldNumber(h, e.velocity.x);
    h = foldNumber(h, e.velocity.y);
    h = foldNumber(h, e.velocity.z);
  }
  if (e.yaw !== undefined) h = foldNumber(h, e.yaw);
  if (e.pitch !== undefined) h = foldNumber(h, e.pitch);
  if (e.onGround !== undefined) h = foldStr(h, e.onGround ? 'g' : 'a');
  if (e.health !== undefined) h = foldNumber(h, e.health);
  // Sprint state — only hashed when present so default (absent) behaviour is unchanged,
  // preserving all existing golden hashes from T-101/T-102.
  if (e.isSprinting !== undefined) h = foldStr(h, e.isSprinting ? 'S' : 's');
  if (e.wasTacSprinting !== undefined) h = foldStr(h, e.wasTacSprinting ? 'T' : 't');
  if (e.sprintOutUntilTick !== undefined && e.sprintOutUntilTick > 0)
    h = foldNumber(h, e.sprintOutUntilTick);
  return h;
}

export function hashWorld(world: SimWorld): string {
  let h = FNV_OFFSET;
  h = foldNumber(h, world.tick);
  h = foldNumber(h, world.rng.a);
  h = foldNumber(h, world.rng.b);
  h = foldNumber(h, world.rng.c);
  h = foldNumber(h, world.rng.d);
  for (const e of world.ecs.entities) {
    h = foldEntity(h, e);
    h ^= 0x9e3779b9;
    h = Math.imul(h, FNV_PRIME);
  }
  // unsigned hex
  return (h >>> 0).toString(16).padStart(8, '0');
}
