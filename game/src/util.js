// Velora Heat — small pure helpers. No Three.js import here.
export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent approach: moves v toward target, rate per second.
export function damp(v, target, rate, dt) {
  return lerp(v, target, 1 - Math.exp(-rate * dt));
}
