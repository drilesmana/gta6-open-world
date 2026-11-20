// Velora Heat — minimap (chunk 3, written from the spec only).
// createMinimap(canvas, state) draws the road grid, the player arrow,
// traffic cars, police cars and the objective marker on a 2D canvas.
// The city/traffic/police shapes live in other chunks, so every read here
// is defensive: several candidate keys, plain {x, z} normalisation, and
// numeric fallbacks. Nothing here throws.

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Normalise anything position-like to {x, z} or null.
function toXZ(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return { x: num(p[0], 0), z: num(p[1], 0) };
  if (typeof p === 'object') {
    if (typeof p.x === 'number' || typeof p.z === 'number') {
      return { x: num(p.x, 0), z: num(p.z, 0) };
    }
    if (p.position) return toXZ(p.position);
    if (p.mesh && p.mesh.position) return toXZ(p.mesh.position);
    if (p.group && p.group.position) return toXZ(p.group.position);
    if (p.object && p.object.position) return toXZ(p.object.position);
  }
  return null;
}

function firstKey(obj, names) {
  if (!obj) return undefined;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}

function readRoads(city) {
  if (!city) return [];
  const raw = firstKey(city, ['roads', 'roadNetwork', 'segments', 'network', 'roadSegments', 'streets']);
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const seg of raw) {
    if (!seg) continue;
    const a = toXZ(firstKey(seg, ['start', 'from', 'a', 'p1'])) || toXZ(seg.start) || toXZ(seg);
    const b = toXZ(firstKey(seg, ['end', 'to', 'b', 'p2'])) || toXZ(seg.end);
    if (a && b) out.push({ a, b });
    else if (a && typeof seg.length === 'number') {
      // A segment given as a centre + direction/length.
      const dir = toXZ(firstKey(seg, ['direction', 'dir'])) || { x: 1, z: 0 };
      const len = num(firstKey(seg, ['length', 'len']), 40) / 2;
      out.push({ a: { x: a.x - dir.x * len, z: a.z - dir.z * len }, b: { x: a.x + dir.x * len, z: a.z + dir.z * len } });
    }
  }
  return out;
}

function readCarList(system) {
  if (!system) return [];
  if (Array.isArray(system)) return system;
  const raw = firstKey(system, ['cars', 'list', 'vehicles', 'liveCars', 'liveTraffic', 'traffic', 'items', 'pursuitCars', 'units']);
  if (Array.isArray(raw)) return raw;
  return [];
}

function readHeading(state) {
  if (typeof state.playerHeading === 'number') return state.playerHeading;
  const p = state.player;
  if (p) {
    if (typeof p.heading === 'number') return p.heading;
    if (typeof p.angle === 'number') return p.angle;
    if (typeof p.rotationY === 'number') return p.rotationY;
    const mesh = p.mesh || p.group || p.object || p.person || null;
    if (mesh && mesh.rotation && typeof mesh.rotation.y === 'number') return mesh.rotation.y;
    if (p.rotation && typeof p.rotation.y === 'number') return p.rotation.y;
  }
  const car = state.car;
  if (car) {
    if (typeof car.heading === 'number') return car.heading;
    const mesh = car.mesh || car.group || car.object || null;
    if (mesh && mesh.rotation && typeof mesh.rotation.y === 'number') return mesh.rotation.y;
  }
  return 0;
}

export function createMinimap(canvas, state) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  let frame = 0;

  function worldHalf() {
    const cfg = state.config || state.CONFIG || null;
    if (cfg) {
      // citySize is the FULL width (640 -> +/-320), halfSize keys are
      // already halved; never mix the two up.
      const full = firstKey(cfg, ['citySize', 'city_size', 'worldSize', 'mapSize', 'size']);
      if (typeof full === 'number' && full > 0) return full / 2;
      const hv = firstKey(cfg, ['halfSize', 'cityHalf', 'cityHalfSize']);
      if (typeof hv === 'number' && hv > 0) return hv;
      if (cfg.city && typeof cfg.city.size === 'number') return cfg.city.size / 2;
    }
    const city = state.city;
    if (city) {
      const v = firstKey(city, ['halfSize', 'size', 'worldSize']);
      if (typeof v === 'number' && v > 0) return v > 1000 ? v / 2 : v;
    }
    return 220;
  }

  function objectivePoint() {
    const m = state.missions && typeof state.missions.current === 'function'
      ? state.missions.current()
      : (state.missions && state.missions.current) || state.currentMission || null;
    if (m) {
      const t = m.target || m.targetPoint || m.destination || m.point || null;
      const p = toXZ(t);
      if (p) return p;
      if (typeof m.targetX === 'number') return { x: m.targetX, z: num(m.targetZ, 0) };
    }
    if (state.objectiveTarget) return toXZ(state.objectiveTarget);
    return null;
  }

  function draw(now) {
    if (!ctx || !canvas) return;
    const w = canvas.width || 160;
    const h = canvas.height || 160;
    const half = worldHalf();
    const scale = Math.min(w, h) / (half * 2.2);
    const cx = w / 2;
    const cy = h / 2;
    const px = (x) => cx + x * scale;
    const py = (z) => cy + z * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(18, 22, 26, 0.82)';
    ctx.fillRect(0, 0, w, h);

    // City blocks backdrop.
    ctx.strokeStyle = 'rgba(120, 130, 140, 0.25)';
    ctx.lineWidth = 1;

    // Roads.
    const roads = readRoads(state.city);
    ctx.strokeStyle = '#8d97a3';
    ctx.lineWidth = Math.max(2, 5 * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (roads.length > 0) {
      for (const seg of roads) {
        ctx.moveTo(px(seg.a.x), py(seg.a.z));
        ctx.lineTo(px(seg.b.x), py(seg.b.z));
      }
    } else {
      // Fallback grid when the city object exposes no road list.
      const step = 40;
      for (let g = -half; g <= half; g += step) {
        ctx.moveTo(px(g), py(-half));
        ctx.lineTo(px(g), py(half));
        ctx.moveTo(px(-half), py(g));
        ctx.lineTo(px(half), py(g));
      }
    }
    ctx.stroke();

    // Objective marker (pulsing gold ring).
    const obj = objectivePoint();
    if (obj && !state.finished) {
      const pulse = 1 + 0.25 * Math.sin(now / 280);
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(obj.x), py(obj.z), 7 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f5b942';
      ctx.beginPath();
      ctx.arc(px(obj.x), py(obj.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Traffic cars (pale dots).
    for (const car of readCarList(state.traffic)) {
      const p = toXZ(car);
      if (!p) continue;
      ctx.fillStyle = '#d8dee6';
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police cars (flashing red/blue).
    const policeList = readCarList(state.police);
    const flash = Math.floor(now / 350) % 2 === 0;
    for (const car of policeList) {
      const p = toXZ(car);
      if (!p) continue;
      ctx.fillStyle = flash ? '#ff5a4e' : '#4e8cff';
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow.
    const pp = toXZ(state.player) || toXZ(state.car);
    if (pp) {
      const heading = readHeading(state);
      ctx.save();
      ctx.translate(px(pp.x), py(pp.z));
      // Canvas y grows downward while world -z is "north": rotate so the
      // arrow points along the player's facing.
      ctx.rotate(-heading + Math.PI);
      ctx.fillStyle = '#2a9d8f';
      ctx.strokeStyle = '#fdf6e3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Border.
    ctx.strokeStyle = 'rgba(245, 185, 66, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  return {
    update(_dt) {
      frame += 1;
      // Redraw every other frame: cheap enough to stay live, light enough
      // to never cost a frame on a tight machine.
      if (frame % 2 === 0) return;
      try {
        draw(typeof performance !== 'undefined' ? performance.now() : Date.now());
      } catch (_err) {
        // A minimap failure must never break the game loop.
      }
    },
    draw() {
      draw(typeof performance !== 'undefined' ? performance.now() : Date.now());
    },
  };
}
