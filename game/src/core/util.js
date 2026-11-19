// Small maths and random helpers shared by every system: a seeded generator so the city is the
// same on every load (the save file relies on it), clamps, angles, and cheapest-path helpers.
// Keep seeded randomness separate from live AI choices: scenery anchors must survive a reload.

export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
// Move a value toward a target at a fixed rate (units a second), never overshooting.
export const approach = (a, b, step) => (a < b ? Math.min(b, a + step) : Math.max(b, a - step));
// Angle-damping along the short arc: a body turning toward a heading never spins the long way
// round when the two headings sit either side of the PI seam.
export const dampAngle = (a, b, rate, dt) => wrapAngle(a + angleTo(a, b) * (1 - Math.exp(-rate * dt)));
// Both accept either (min, max) or (rng, min, max) so builders can stay seed-driven. The city
// passes its seeded generator in first; gameplay code usually takes the plain two-argument form.
// A reversed pair is swapped rather than producing a negative span.
export const rand = (a, b, c) => {
  const rng = typeof a === 'function' ? a : Math.random;
  let lo = typeof a === 'function' ? b : a;
  let hi = typeof a === 'function' ? c : b;
  if (lo > hi) [lo, hi] = [hi, lo];
  return lo + rng() * (hi - lo);
};
export const randInt = (a, b, c) => {
  const rng = typeof a === 'function' ? a : Math.random;
  let lo = typeof a === 'function' ? b : a;
  let hi = typeof a === 'function' ? c : b;
  if (lo > hi) [lo, hi] = [hi, lo];
  return Math.floor(lo + rng() * (hi - lo + 1));
};
export const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];
// A coin flip, and a random sign, both off the seeded generator when one is given.
export const coin = (rng = Math.random) => rng() < 0.5;
export const randSign = (rng = Math.random) => (rng() < 0.5 ? -1 : 1);
// A weighted coin flip, so spawners read as "sometimes" instead of a bare comparison.
export const chance = (p, rng = Math.random) => rng() < p;

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Shortest signed turn from `from` to `to`, always inside [-PI, PI].
export const angleTo = (from, to) => wrapAngle(to - from);

// True when two headings point within `width` radians of each other.
export const facing = (a, b, width = 0.6) => Math.abs(angleTo(a, b)) < width;

export const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
export const heading = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

// Angle between two vectors, unsigned and inside [0, PI].
export const angleBetween = (ax, az, bx, bz) => {
  const dot = ax * bx + az * bz;
  const magA = Math.hypot(ax, az);
  const magB = Math.hypot(bx, bz);
  if (magA === 0 || magB === 0) return 0;
  return Math.acos(U.clamp(dot / (magA * magB), -1, 1));
};

export function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 ? clamp(((px - ax) * dx + (pz - az) * dz) / length2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function money(n) {
  return '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');
}

export function shuffle(list, rng = Math.random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Axis-aligned box test used by every collision query: keeps the city walls honest.
export function insideBox(x, z, box, pad = 0) {
  return x > box.minX - pad && x < box.maxX + pad && z > box.minZ - pad && z < box.maxZ + pad;
}

// Push a circle out of the nearest face of a box and report the surface normal.
export function resolveCircleBox(x, z, radius, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  let dx = x - cx;
  let dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, push: radius - d };
  }
  // Centre is inside the box: escape through the closest face.
  const left = x - box.minX;
  const rightDb = box.maxX - x;
  const top = z - box.minZ;
  const bottomDb = box.maxZ - z;
  const m = Math.min(left, rightDb, top, bottomDb);
  if (m === left) return { nx: -1, nz: 0, push: left + radius };
  if (m === rightDb) return { nx: 1, nz: 0, push: rightDb + radius };
  if (m === top) return { nx: 0, nz: -1, push: top + radius };
  return { nx: 0, nz: 1, push: bottomDb + radius };
}
