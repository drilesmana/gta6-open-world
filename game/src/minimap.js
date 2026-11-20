// minimap.js — Velora Heat minimap.
// Draws the road grid, the player arrow, traffic cars, police cars and
// the objective marker on a small 2D canvas, north-up.
// No Three.js import here; this module is pure 2D canvas drawing.

function read(obj, names, fallback) {
  if (!obj) return fallback;
  for (const name of names) {
    const value = obj[name];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

// Normalise a position to {x, z}. Accepts {x,z}, {x,y,z} (uses x/z),
// THREE.Vector3-like objects, or [x, z] arrays.
function pos2(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return { x: p[0], z: p[1] };
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, z: p.y };
  return null;
}

// Normalise a road list. Accepts segments shaped {start,end},
// {a,b}, {x,z} pairs, or plain arrays. Falls back to a 5x5 grid.
function normRoads(city, half) {
  const raw = city ? read(city, ['roads', 'segments', 'roadNetwork'], null) : null;
  const out = [];
  if (Array.isArray(raw)) {
    for (const seg of raw) {
      const a = pos2(read(seg, ['start', 'a', 'from'], null) || seg);
      const b = pos2(read(seg, ['end', 'b', 'to'], null) || seg);
      if (a && b) out.push({ a, b });
    }
  }
  if (out.length > 0) return out;
  const step = (half * 2) / 5;
  for (let i = 0; i <= 5; i++) {
    const c = -half + i * step;
    out.push({ a: { x: -half, z: c }, b: { x: half, z: c } });
    out.push({ a: { x: c, z: -half }, b: { x: c, z: half } });
  }
  return out;
}

// createMinimap(canvas, state): state is the shared game state object
// (fields player, car, wanted, money, health, mission, finished) plus
// the city object under state.city when main.js attaches it.
// Returns { update }.
export function createMinimap(canvas, state) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width || 160;
  const height = canvas.height || 160;
  const half = 200; // world half-size fallback; refined from city below

  function worldHalf() {
    const city = read(state, ['city'], null);
    if (city) {
      const size = read(city, ['size', 'citySize', 'halfSize'], null);
      if (typeof size === 'number' && size > 0) return size;
      const bounds = read(city, ['bounds'], null);
      if (bounds) {
        const hx = read(bounds, ['halfX', 'x'], null);
        if (typeof hx === 'number' && hx > 0) return hx;
      }
    }
    return half;
  }

  function toMap(x, z) {
    const h = worldHalf();
    const sx = width / (h * 2);
    const sz = height / (h * 2);
    return { x: width / 2 + x * sx, y: height / 2 + z * sz };
  }

  function drawDot(p, radius, colour) {
    const m = toMap(p.x, p.z);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function update() {
    if (!ctx) return;
    const city = read(state, ['city'], null);
    const h = worldHalf();

    // Background: dark ink panel.
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
    ctx.fillRect(0, 0, width, height);

    // Road grid.
    ctx.strokeStyle = 'rgba(240, 235, 220, 0.35)';
    ctx.lineWidth = 1;
    for (const seg of normRoads(city, h)) {
      const a = toMap(seg.a.x, seg.a.z);
      const b = toMap(seg.b.x, seg.b.z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Objective marker (gold ring + dot).
    const mission = read(state, ['mission'], null);
    const target = mission ? read(mission, ['target', 'targetPoint', 'point'], null) : null;
    const tp = pos2(target);
    if (tp) {
      const m = toMap(tp.x, tp.z);
      ctx.strokeStyle = '#e8b64c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e8b64c';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Traffic cars (teal dots).
    const traffic = read(state, ['traffic'], null);
    const cars = traffic ? read(traffic, ['cars', 'list', 'live'], null) : null;
    if (Array.isArray(cars)) {
      for (const car of cars) {
        const p = pos2(read(car, ['position', 'pos'], null) || car);
        if (p) drawDot(p, 2, '#2fa8a0');
      }
    }

    // Police cars (coral dots).
    const police = read(state, ['police'], null);
    const pursuit = police ? read(police, ['pursuit', 'pursuitCars', 'cars'], null) : null;
    if (Array.isArray(pursuit)) {
      for (const car of pursuit) {
        const p = pos2(read(car, ['position', 'pos'], null) || car);
        if (p) drawDot(p, 3, '#e85d4a');
      }
    }

    // Player arrow (cream), rotated by heading when known.
    const player = read(state, ['player'], null);
    const pp = player ? pos2(read(player, ['position', 'pos'], null) || player) : null;
    if (pp) {
      const m = toMap(pp.x, pp.z);
      const heading = player ? read(player, ['heading', 'angle', 'rotation'], 0) : 0;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(typeof heading === 'number' ? -heading : 0);
      ctx.fillStyle = '#f2ead8';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Border.
    ctx.strokeStyle = 'rgba(240, 235, 220, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  return { update };
}
