/**
 * Deterministic, seeded PRNG for the simulation (sfc32 core, splitmix32 seeding).
 *
 * The sim NEVER calls Math.random()/Date.now() (enforced by ESLint in src/sim).
 * State is a plain serializable object so it round-trips through save/replay and
 * contributes to hashWorld(). Mutating calls advance the cursor in place.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Expand a 32-bit seed into four well-mixed words via splitmix32. */
export function createRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  return { a: next(), b: next(), c: next(), d: next() };
}

export function cloneRng(st: RngState): RngState {
  return { a: st.a, b: st.b, c: st.c, d: st.d };
}

/** Next unsigned 32-bit integer (sfc32). Advances the cursor. */
export function rngNextU32(st: RngState): number {
  const t = (st.a + st.b + st.d) | 0;
  st.d = (st.d + 1) | 0;
  st.a = st.b ^ (st.b >>> 9);
  st.b = (st.c + (st.c << 3)) | 0;
  st.c = (st.c << 21) | (st.c >>> 11);
  st.c = (st.c + t) | 0;
  return t >>> 0;
}

/** Float in [0, 1). */
export function rngNextFloat(st: RngState): number {
  return rngNextU32(st) / 4294967296;
}

/** Float in [min, max). */
export function rngRange(st: RngState, min: number, max: number): number {
  return min + (max - min) * rngNextFloat(st);
}

/** Integer in [min, max] inclusive. */
export function rngInt(st: RngState, min: number, max: number): number {
  return min + Math.floor(rngNextFloat(st) * (max - min + 1));
}
