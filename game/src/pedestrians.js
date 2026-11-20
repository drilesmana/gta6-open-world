import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, randInt, pick, clamp } from './util.js';
import { makePerson, swingWalk } from './characters.js';

// Pedestrians for Velora Heat. Walkers stroll between sidewalk waypoints,
// sometimes crossing a road to the next one, and run away when a fast car
// bears down on them. Each walker is a makePerson group; the system drives
// its position, heading and walk swing.

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

function normWaypoints(city) {
  const c = city || {};
  const raw = c.sidewalkWaypoints || c.waypoints || c.pedestrianWaypoints
    || c.sidewalkPoints || c.pedWaypoints || [];
  const out = [];
  if (Array.isArray(raw)) {
    for (const w of raw) {
      const p = toXZ(w);
      if (p) out.push(p);
    }
  }
  return out;
}

function fallbackWaypoints() {
  // Sidewalk points along a 5x5 street grid, used only if the city object
  // carries no waypoints. Streets every 40 m, sidewalks 6 m off centre.
  const pts = [];
  const half = 80;
  for (let i = -2; i <= 2; i++) {
    const c = i * 40;
    for (let d = -half; d <= half; d += 14) {
      pts.push({ x: c + 6, z: d });
      pts.push({ x: c - 6, z: d });
      pts.push({ x: d, z: c + 6 });
      pts.push({ x: d, z: c - 6 });
    }
  }
  return pts;
}

// createPedestrians(scene, city, makePerson): returns the pedestrian system.
// It exposes list (the live walker entries), count, and update(dt,
// playerPos, cars). Each entry is { group, target, speed, phase, fleeing }.
// cars is an optional array of moving cars (traffic entries or car groups)
// used for the flee check.
export function createPedestrians(scene, city, makePersonFn) {
  let waypoints = normWaypoints(city);
  if (waypoints.length === 0) waypoints = fallbackWaypoints();
  const count = Math.max(1, Math.round(tun(['pedestrians.count', 'pedestrianCount', 'pedestrians.walkers'], 18)));
  const walkMin = tun(['pedestrians.walkMin', 'pedestrian.walkMin'], 0.9);
  const walkMax = tun(['pedestrians.walkMax', 'pedestrian.walkMax'], 1.7);
  const fleeSpeed = tun(['pedestrians.fleeSpeed', 'pedestrian.flee'], 5.0);
  const halfSize = tun(['city.halfSize', 'city.half', 'cityHalfSize'], null)
    ?? tun(['city.size', 'citySize', 'city.width'], 240) / 2;

  const peds = {
    scene,
    city,
    waypoints,
    list: [],
    count,

    _spawn() {
      const group = makePersonFn('pedestrian', null);
      const start = pick(waypoints);
      group.position.set(start.x, 0, start.z);
      scene.add(group);
      const target = pick(waypoints);
      return {
        group,
        target: { x: target.x, z: target.z },
        speed: rand(walkMin, walkMax),
        phase: rand(0, Math.PI * 2),
        fleeing: false,
        fleeUntil: 0,
      };
    },

    _pickTarget(entry, awayFrom) {
      if (awayFrom) {
        // A waypoint roughly away from the threat.
        let best = null;
        let bestScore = -Infinity;
        for (let i = 0; i < 6; i++) {
          const w = pick(waypoints);
          const dx = w.x - entry.group.position.x;
          const dz = w.z - entry.group.position.z;
          const away = dx * awayFrom.x + dz * awayFrom.z;
          const score = away + rand(0, 4);
          if (score > bestScore) {
            bestScore = score;
            best = w;
          }
        }
        return best ? { x: best.x, z: best.z } : pick(waypoints);
      }
      const w = pick(waypoints);
      return { x: w.x, z: w.z };
    },

    update(dt, playerPos, cars) {
      const now = (this._time = (this._time || 0) + dt);
      for (const entry of this.list) {
        const g = entry.group;
        // Flee check: a fast car closing in within ~7 m.
        let threat = null;
        for (const car of cars || []) {
          if (!car) continue;
          const pos = car.position || car.group?.position || car;
          if (!pos || typeof pos.x !== 'number') continue;
          const speed = typeof car.speed === 'number' ? car.speed : 0;
          if (speed < 6) continue;
          const dx = g.position.x - pos.x;
          const dz = g.position.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 8) continue;
          const heading = typeof car.heading === 'number'
            ? car.heading
            : (car.rotation ? car.rotation.y : 0);
          const fx = Math.sin(heading);
          const fz = Math.cos(heading);
          // Closing is positive when the pedestrian is ahead of the car in
          // the direction the car is travelling (dot of car-to-ped with
          // the car's forward vector).
          const closing = (dx * fx + dz * fz) / Math.max(dist, 0.01);
          if (closing > 0.4) {
            threat = { x: dx / Math.max(dist, 0.01), z: dz / Math.max(dist, 0.01) };
            break;
          }
        }
        if (threat) {
          entry.fleeing = true;
          entry.fleeUntil = now + 1.2;
          entry.target = this._pickTarget(entry, threat);
          entry.speed = fleeSpeed;
        } else if (entry.fleeing && now > entry.fleeUntil) {
          entry.fleeing = false;
          entry.speed = rand(walkMin, walkMax);
        }

        const dx = entry.target.x - g.position.x;
        const dz = entry.target.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.9) {
          entry.target = this._pickTarget(entry, null);
        } else {
          const nx = dx / dist;
          const nz = dz / dist;
          g.position.x += nx * entry.speed * dt;
          g.position.z += nz * entry.speed * dt;
          g.position.x = clamp(g.position.x, -halfSize, halfSize);
          g.position.z = clamp(g.position.z, -halfSize, halfSize);
          g.rotation.y = Math.atan2(nx, nz);
          entry.phase += entry.speed * dt * 1.6;
        }
        swingWalk(g, entry.phase, entry.speed > 0.1 ? 0.55 : 0);
      }
    },
  };

  for (let i = 0; i < count; i++) {
    peds.list.push(peds._spawn());
  }
  return peds;
}
