// Velora Heat — small pure helpers. No Three.js import here, so any module can
// use these without pulling in the renderer.

// A random number in [min, max).
export function rand(min, max) {
  return min + Math.random() * (max - min);
}

// A random integer in [min, max] inclusive.
export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

// One random item from an array.
export function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Bound a number into [min, max].
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// Blend two numbers: 0 returns a, 1 returns b.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Move a number toward a target at a rate, frame-rate independent. rate is the
// fraction of the remaining distance closed per second.
export function damp(current, target, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return lerp(current, target, t);
}

// Shortest signed angle from a to b, in (-PI, PI].
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Wrap an angle into (-PI, PI].
export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
