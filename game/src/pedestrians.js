// pedestrians.js — Velora Heat (chunk 2)
// Sidewalk walkers: they stroll between waypoints and cross roads on their
// way. Built from the spec contract only: createPedestrians(scene, city,
// makePerson) — city supplies the sidewalk waypoints. Exposes the live
// pedestrians and an update function.
// THREE comes from the global loaded by index.html (./vendor/three.min.js).

import { CONFIG } from './config.js';
import { rand, pick, clamp } from './util.js';

function three() {
  const T = globalThis.THREE;
  if (!T) throw new Error('THREE global is not loaded — index.html must load ./vendor/three.min.js before main.js');
  return T;
}

function cfgNum(paths, fallback) {
  for (const path of paths) {
    let v = CONFIG;
    for (const key of path.split('.')) {
      if (v === undefined || v === null) break;
      v = v[key];
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function pointXZ(p) {
  if (!p) return null;
  if (Array.isArray(p)) return { x: p[0] || 0, z: p[2] !== undefined ? p[2] : p[1] || 0 };
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, z: p.y };
  return null;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

const VARIANTS = ['walker', 'commuter', 'tourist', 'local', 'runner', 'elder', 'student', 'vendor'];

export function createPedestrians(scene, city, makePerson) {
  const THREE = three();
  // r15: city.js returns the waypoint list as `sidewalks` — include it, or
  // no walker ever spawns (the old key list matched nothing).
  const rawWaypoints = (city && (city.sidewalkWaypoints || city.sidewalks || city.waypoints || city.pedestrianWaypoints)) || [];
  const waypoints = rawWaypoints.map(pointXZ).filter(Boolean);
  const count = cfgNum(['pedestrians.count', 'pedestrianCount', 'pedestrians.walkers'], 14);
  const walkMin = cfgNum(['pedestrians.minSpeed', 'pedestrian.walkMin'], 0.9);
  const walkMax = cfgNum(['pedestrians.maxSpeed', 'pedestrian.walkMax'], 1.7);
  const despawnDist = cfgNum(['pedestrians.despawnDistance', 'pedestrian.despawnDist'], 200);

  const peds = {
    pedestrians: [], // live records: { group, target, speed, phase, idle }
    waypoints,

    spawnPedestrian(at) {
      if (!waypoints.length) return null;
      const group = makePerson(pick(VARIANTS), undefined);
      const start = at || pick(waypoints);
      group.position.set(start.x, 0, start.z);
      const rec = {
        group,
        target: pick(waypoints),
        speed: rand(walkMin, walkMax),
        phase: Math.random() * Math.PI * 2,
        idle: 0,
      };
      scene.add(group);
      peds.pedestrians.push(rec);
      return rec;
    },

    nearestPedestrianTo(x, z, maxDist) {
      let best = null;
      let bestD = maxDist * maxDist;
      for (const rec of peds.pedestrians) {
        const d = dist2(rec.group.position.x, rec.group.position.z, x, z);
        if (d < bestD) {
          bestD = d;
          best = rec;
        }
      }
      return best;
    },

    update(dt, playerPos) {
      const px = playerPos ? (playerPos.x || 0) : 0;
      const pz = playerPos ? (playerPos.z || 0) : 0;

      for (const rec of peds.pedestrians) {
        if (rec.idle > 0) {
          rec.idle -= dt;
          if (rec.group.userData.applyWalk) rec.group.userData.applyWalk(rec.phase, 0);
          continue;
        }
        const g = rec.group;
        const dx = rec.target.x - g.position.x;
        const dz = rec.target.z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          // Arrived: sometimes pause and look around, then pick a new target.
          if (Math.random() < 0.25) rec.idle = rand(1, 4);
          rec.target = pick(waypoints);
          continue;
        }
        const step = rec.speed * dt;
        g.position.x += (dx / d) * step;
        g.position.z += (dz / d) * step;
        // Face the walking direction, turning smoothly.
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - g.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        g.rotation.y += clamp(diff, -3 * dt, 3 * dt);

        // Walk swing driven by distance covered.
        rec.phase += rec.speed * dt * 3.2;
        if (g.userData.applyWalk) g.userData.applyWalk(rec.phase, 1);
      }

      // Walkers who drifted far from the player respawn on a waypoint near
      // them, so the sidewalks around the player stay populated.
      for (const rec of peds.pedestrians) {
        if (dist2(rec.group.position.x, rec.group.position.z, px, pz) > despawnDist * despawnDist) {
          const near = waypoints.filter((w) => {
            const d = dist2(w.x, w.z, px, pz);
            return d > 40 * 40 && d < 140 * 140;
          });
          const spot = near.length ? pick(near) : pick(waypoints);
          if (spot) {
            rec.group.position.set(spot.x, 0, spot.z);
            rec.target = pick(waypoints);
            rec.idle = 0;
          }
        }
      }
    },
  };

  for (let i = 0; i < count; i++) peds.spawnPedestrian();
  return peds;
}
