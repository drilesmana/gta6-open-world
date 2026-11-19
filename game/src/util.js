// Velora Heat — small math and collision helpers shared by every system.
// No dependencies, no allocations in the hot paths where it matters.
export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent exponential smoothing.
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

// Shortest signed angle difference, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * t;
}

// Wrap any angle into [-PI, PI]. Several systems re-implemented this inline;
// it belongs in the shared library so they can agree on one version.
export function wrapAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Smoothstep: 0 below a, 1 above b, an S-curve between (for fades and blends).
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function rand(a = 1, b) {
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}

export function randi(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Deterministic RNG for city generation so the layout is stable.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// ---- collision: circle vs a list of axis-aligned boxes ----
// Each box is { minX, maxX, minZ, maxZ }. Returns true when a push happened.
export function collideCircle(pos, radius, boxes) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - b.minX;
      const pr = b.maxX - pos.x;
      const pt = pos.z - b.minZ;
      const pb = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.minX - radius;
      else if (m === pr) pos.x = b.maxX + radius;
      else if (m === pt) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return hit;
}

export function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// Nearest street coordinate to a value, and the index of that street.
export function nearestStreet(v, streets) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < streets.length; i++) {
    const d = Math.abs(streets[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, coord: streets[best], dist: bestD };
}
