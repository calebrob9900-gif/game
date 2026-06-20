/**
 * Minimal pure Vec3 math for the sim. Plain {x,y,z} objects so they are
 * serializable and hashable; the sim must not import three's Vector3.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function setVec(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copyVec(out: Vec3, v: Vec3): Vec3 {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  return out;
}

export function addScaled(out: Vec3, v: Vec3, s: number): Vec3 {
  out.x += v.x * s;
  out.y += v.y * s;
  out.z += v.z * s;
  return out;
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function lengthHoriz(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Lerp two vectors into `out` (used by presentation interpolation; pure). */
export function lerpVec(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}
