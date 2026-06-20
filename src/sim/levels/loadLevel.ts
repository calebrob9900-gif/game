/**
 * parseLevel(json) — validates the shape of a raw JSON object and returns a
 * typed LevelDescriptor. Rejects malformed input with clear error messages.
 *
 * Pure function: no fs, no DOM, no three. The caller is responsible for
 * reading/fetching the JSON and passing the parsed object here.
 *
 * Compatible with *.level.json files that may contain extra "comment" fields
 * for documentation — those are ignored during parsing.
 */

import type { BoxCollider, LevelDescriptor, SpawnPoint } from './levelDescriptor';
import { validateLevel } from './levelDescriptor';

// ── Internal helpers ──────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertField(obj: Record<string, unknown>, key: string, context: string): unknown {
  if (!(key in obj)) {
    throw new Error(`parseLevel: missing field "${key}" in ${context}`);
  }
  return obj[key];
}

function parseNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw new Error(`parseLevel: "${label}" must be a finite number, got ${JSON.stringify(v)}`);
  }
  return v;
}

function parseString(v: unknown, label: string): string {
  if (typeof v !== 'string') {
    throw new Error(`parseLevel: "${label}" must be a string, got ${JSON.stringify(v)}`);
  }
  return v;
}

function parseVec3(v: unknown, label: string): { x: number; y: number; z: number } {
  if (!isObject(v)) {
    throw new Error(
      `parseLevel: "${label}" must be an object with x/y/z, got ${JSON.stringify(v)}`,
    );
  }
  return {
    x: parseNumber(assertField(v, 'x', label), `${label}.x`),
    y: parseNumber(assertField(v, 'y', label), `${label}.y`),
    z: parseNumber(assertField(v, 'z', label), `${label}.z`),
  };
}

function parseCollider(v: unknown, index: number): BoxCollider {
  const label = `colliders[${index}]`;
  if (!isObject(v)) {
    throw new Error(`parseLevel: ${label} must be an object`);
  }
  const center = parseVec3(assertField(v, 'center', label), `${label}.center`);
  const half = parseVec3(assertField(v, 'half', label), `${label}.half`);
  return { center, half };
}

function parseSpawn(v: unknown, index: number): SpawnPoint {
  const label = `spawns[${index}]`;
  if (!isObject(v)) {
    throw new Error(`parseLevel: ${label} must be an object`);
  }
  const position = parseVec3(assertField(v, 'position', label), `${label}.position`);
  const yaw = parseNumber(assertField(v, 'yaw', label), `${label}.yaw`);
  // Optional team field
  const teamRaw = v['team'];
  const team: string | undefined =
    teamRaw !== undefined ? parseString(teamRaw, `${label}.team`) : undefined;
  return team !== undefined ? { position, yaw, team } : { position, yaw };
}

function parseBounds(v: unknown): {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
} {
  if (!isObject(v)) {
    throw new Error(`parseLevel: "bounds" must be an object with min/max`);
  }
  const min = parseVec3(assertField(v, 'min', 'bounds'), 'bounds.min');
  const max = parseVec3(assertField(v, 'max', 'bounds'), 'bounds.max');
  if (min.x >= max.x || min.y >= max.y || min.z >= max.z) {
    throw new Error(
      `parseLevel: bounds.min must be strictly less than bounds.max on all axes` +
        ` (min=${JSON.stringify(min)}, max=${JSON.stringify(max)})`,
    );
  }
  return { min, max };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse and validate a raw JSON object into a typed LevelDescriptor.
 *
 * Throws with a descriptive message if the input is malformed.
 * On success, also runs validateLevel() and throws if structural invariants
 * are not met (e.g., no colliders, no spawns, non-positive half-extents).
 *
 * The caller is responsible for JSON.parse(); pass the already-parsed value.
 */
export function parseLevel(json: unknown): LevelDescriptor {
  if (!isObject(json)) {
    throw new Error(`parseLevel: expected an object, got ${typeof json}`);
  }

  const name = parseString(assertField(json, 'name', 'root'), 'name');
  const bounds = parseBounds(assertField(json, 'bounds', 'root'));

  // Parse colliders array
  const collidersRaw = assertField(json, 'colliders', 'root');
  if (!Array.isArray(collidersRaw)) {
    throw new Error(`parseLevel: "colliders" must be an array`);
  }
  const colliders: BoxCollider[] = collidersRaw.map((item, i) => parseCollider(item, i));

  // Parse spawns array
  const spawnsRaw = assertField(json, 'spawns', 'root');
  if (!Array.isArray(spawnsRaw)) {
    throw new Error(`parseLevel: "spawns" must be an array`);
  }
  const spawns: SpawnPoint[] = spawnsRaw.map((item, i) => parseSpawn(item, i));

  const descriptor: LevelDescriptor = { name, bounds, colliders, spawns };

  // Run structural validation; throw the first error if any exist.
  const errors = validateLevel(descriptor);
  if (errors.length > 0) {
    throw new Error(`parseLevel validation failed:\n  ${errors.join('\n  ')}`);
  }

  return descriptor;
}
