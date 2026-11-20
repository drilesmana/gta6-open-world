import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, randInt, pick, clamp } from './util.js';
import { CAR_COLOURS } from './vehicles.js';

// City traffic for Velora Heat. AI cars drive along the road network: each
// car owns a segment and a distance along it, and at the end of a segment it
// picks a connected one. Cars stop for the car ahead on their segment (and
// for the player's car), and cars far from the player despawn and respawn on
// a road near the player so the streets always feel alive.

function tun(keys, fallback) {
  const c = CONFIG || {};
  for (const k of keys) {
    const parts = k.split('.');
    let v = c;
    let ok = true;
    for (const p of parts) {
      if (v && typeof v === 'object' && p in v) v = v[p];
      else { ok = false; break; }
    }
    if (ok && typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function toXZ(v) {
  if (!v) return null;
  if (Array.isArray(v)) {
    if (v.length >= 3) return { x: v[0], z: v[2] };
    if (v.length >= 2) return { x: v[0], z: v[1] };
    return null;
  }
  if (typeof v === 'object' && typeof v.x === 'number' && typeof v.z === 'number') {
    return { x: v.x, z: v.z };
  }
  return null;
}

function normRoads(city) {
  const c = city || {};
  const raw = c.roads || c.roadSegments || c.segments || c.network || c.roadsList || [];
  const out = [];
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (!s) continue;
      const a = toXZ(s.start || s.a || s.from || s.p0);
      const b = toXZ(s.end || s.b || s.to || s.p1);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, dx: dx / len, dz: dz / len, len });
    }
  }
  return out;
}

function fallbackGrid() {
  // A 5x5 grid of two-way streets, used only if the city object carries no
  // road network at all. Spacing 40, half-size 80.
  const segs = [];
  const half = 80;
  const step = 40;
  for (let i = -2; i <= 2; i++) {
    const c = i * step;
    segs.push({ ax: -half, az: c, bx: half, bz: c, dx: 1, dz: 0, len: half * 2 });
    segs.push({ ax: half, az: c, bx: -half, bz: c, dx: -1, dz: 0, len: half * 2 });
    segs.push({ ax: c, az: -half, bx: c, bz: half, dx: 0, dz: 1, len: half * 2 });
    segs.push({ ax: c, az: half, bx: c, bz: -half, dx: 0, dz: -1, len: half * 2 });
  }
  return segs;
}

const KINDS = ['sedan', 'sedan', 'hatch', 'hatch', 'truck'];

// createTraffic(scene, city, makeCar): returns the traffic system. It
// exposes cars (the live traffic car entries), count, and update(dt,
// playerPos, playerCar). Each entry is { group, seg, t, speed,
// targetSpeed }. playerCar is the player's car group when driving, or null.
export function createTraffic(scene, city, makeCar) {
  let roads = normRoads(city);
  if (roads.length === 0) roads = fallbackGrid();
  const count = Math.max(1, Math.round(tun(['traffic.count', 'trafficCount', 'traffic.cars'], 12)));
  const cruiseMin = tun(['traffic.speedMin', 'traffic.cruiseMin'], 7);
  const cruiseMax = tun(['traffic.speedMax', 'traffic.cruiseMax'], 12);
  const despawnDist = tun(['traffic.despawnDistance', 'traffic.despawn'], 150);
  const colours = (CAR_COLOURS && CAR_COLOURS.length) ? CAR_COLOURS : ['silver', 'red', 'blue', 'teal'];

  const traffic = {
    scene,
    city,
    roads,
    cars: [],
    count,

    _spawnEntry(nearPos) {
      let seg;
      if (nearPos) {
        // Prefer a segment whose midpoint is near the player.
        const near = roads.filter((s) => {
          const mx = (s.ax + s.bx) / 2;
          const mz = (s.az + s.bz) / 2;
          return Math.hypot(mx - nearPos.x, mz - nearPos.z) < 70;
        });
        seg = near.length ? pick(near) : pick(roads);
      } else {
        seg = pick(roads);
      }
      const group = makeCar(pick(colours), pick(KINDS), null);
      group.position.set(0, 0, 0);
      scene.add(group);
      return {
        group,
        seg,
        t: rand(0, seg.len),
        speed: rand(cruiseMin, cruiseMax),
        targetSpeed: rand(cruiseMin, cruiseMax),
      };
    },

    _place(entry) {
      const s = entry.seg;
      entry.group.position.set(s.ax + s.dx * entry.t, 0, s.az + s.dz * entry.t);
      entry.group.rotation.y = Math.atan2(s.dx, s.dz);
    },

    _nextSeg(entry) {
      const end = { x: entry.seg.bx, z: entry.seg.bz };
      const cands = roads.filter((s) => Math.hypot(s.ax - end.x, s.az - end.z) < 6);
      if (cands.length) return pick(cands);
      // Dead end: turn around and drive the same street back.
      const s = entry.seg;
      return { ax: s.bx, az: s.bz, bx: s.ax, bz: s.az, dx: -s.dx, dz: -s.dz, len: s.len };
    },

    update(dt, playerPos, playerCar) {
      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;
      for (const entry of this.cars) {
        // Stop for the car ahead on the same segment.
        let target = entry.targetSpeed;
        for (const other of this.cars) {
          if (other === entry || other.seg !== entry.seg) continue;
          const gap = other.t - entry.t;
          if (gap > 0 && gap < 9) {
            target = Math.min(target, other.speed);
            if (gap < 5) target = 0;
          }
        }
        // Stop for the player's car ahead on the same segment.
        if (playerCar && playerCar.position) {
          const dx = playerCar.position.x - entry.group.position.x;
          const dz = playerCar.position.z - entry.group.position.z;
          const ahead = dx * entry.seg.dx + dz * entry.seg.dz;
          const side = Math.abs(dx * entry.seg.dz - dz * entry.seg.dx);
          if (ahead > 0 && ahead < 10 && side < 3) target = 0;
        }
        entry.speed += clamp(target - entry.speed, -14 * dt, 8 * dt);
        if (entry.speed < 0) entry.speed = 0;
        entry.t += entry.speed * dt;
        if (entry.t >= entry.seg.len) {
          entry.seg = this._nextSeg(entry);
          entry.t = 0;
        }
        this._place(entry);
        // Spin the wheels.
        const w = entry.group.userData && entry.group.userData.wheels;
        if (w) {
          const spin = (entry.speed / (entry.group.userData.wheelRadius || 0.36)) * dt;
          for (const key of ['frontL', 'frontR', 'rearL', 'rearR']) {
            const pivot = w[key];
            if (pivot && pivot.userData.tyre) pivot.userData.tyre.rotation.x += spin;
          }
        }
        // Despawn far away, respawn near the player.
        const d = Math.hypot(entry.group.position.x - px, entry.group.position.z - pz);
        if (d > despawnDist) {
          const fresh = this._spawnEntry({ x: px, z: pz });
          scene.remove(entry.group);
          entry.group = fresh.group;
          entry.seg = fresh.seg;
          entry.t = fresh.t;
          entry.speed = fresh.speed;
          entry.targetSpeed = fresh.targetSpeed;
          this._place(entry);
        }
      }
    },
  };

  for (let i = 0; i < count; i++) {
    const entry = traffic._spawnEntry(null);
    traffic.cars.push(entry);
    traffic._place(entry);
  }
  // Pre-scatter: start each car at a different point along its street.
  for (const entry of traffic.cars) {
    entry.t = randInt(0, Math.floor(entry.seg.len));
    traffic._place(entry);
  }

  return traffic;
}
