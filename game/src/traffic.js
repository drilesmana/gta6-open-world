// traffic.js — Velora Heat (chunk 2)
// AI traffic: cars follow the road network, stop for each other, and despawn
// far from the player. Built from the spec contract only:
// createTraffic(scene, city, makeCar) — city supplies the road network
// (segments with start, end, direction). Exposes the live traffic cars and
// an update function, plus nearestCarTo / removeCar so the player can steal
// a car (carjack). THREE comes from the global loaded by index.html.

import { CONFIG } from './config.js';
import { rand, randInt, pick, clamp } from './util.js';
import { CAR_COLOURS } from './vehicles.js';

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

// Pull x/z out of whatever shape a point comes in (Vector3, {x,z}, [x,z]).
function pointXZ(p) {
  if (!p) return null;
  if (Array.isArray(p)) return { x: p[0] || 0, z: p[2] !== undefined ? p[2] : p[1] || 0 };
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, z: p.y };
  return null;
}

// Normalise the city's road list into { start, end, dir, length } segments.
function normalizeRoads(city) {
  const raw = (city && (city.roads || city.roadNetwork || city.segments || city.roadSegments)) || [];
  const out = [];
  for (const seg of raw) {
    if (!seg) continue;
    const start = pointXZ(seg.start || seg.from || seg.a);
    const end = pointXZ(seg.end || seg.to || seg.b);
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    out.push({ start, end, dir: { x: dx / len, z: dz / len }, length: len });
  }
  return out;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function createTraffic(scene, city, makeCar) {
  const THREE = three();
  const roads = normalizeRoads(city);
  const count = cfgNum(['traffic.count', 'trafficCount', 'traffic.cars'], 12);
  const cruiseMin = cfgNum(['traffic.minSpeed', 'traffic.cruiseMin'], 8);
  const cruiseMax = cfgNum(['traffic.maxSpeed', 'traffic.cruiseMax'], 14);
  const despawnDist = cfgNum(['traffic.despawnDistance', 'traffic.despawnDist'], 240);

  const traffic = {
    cars: [], // live records: { group, segment, t, speed, cruise, lateral }
    roads,

    spawnCar(segment, t) {
      const seg = segment || (roads.length ? pick(roads) : null);
      if (!seg) return null;
      const kind = pick(['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'truck']);
      const group = makeCar(pick(CAR_COLOURS), kind, undefined);
      const rec = {
        group,
        segment: seg,
        t: t !== undefined ? t : Math.random(),
        speed: 0,
        cruise: rand(cruiseMin, cruiseMax),
        lateral: rand(-1.6, 1.6),
        length: group.userData.length || 4.3,
      };
      traffic.placeOnRoad(rec);
      scene.add(group);
      traffic.cars.push(rec);
      return rec;
    },

    placeOnRoad(rec) {
      const seg = rec.segment;
      const along = seg.start.x + seg.dir.x * seg.length * rec.t;
      const alongZ = seg.start.z + seg.dir.z * seg.length * rec.t;
      // Lateral offset is perpendicular to the road direction.
      const px = -seg.dir.z;
      const pz = seg.dir.x;
      rec.group.position.set(along + px * rec.lateral, 0, alongZ + pz * rec.lateral);
      rec.group.rotation.y = Math.atan2(seg.dir.x, seg.dir.z);
    },

    // The car ahead on the same segment, if any, and the gap to it in metres.
    carAhead(rec) {
      let best = null;
      let bestGap = Infinity;
      for (const other of traffic.cars) {
        if (other === rec || other.segment !== rec.segment) continue;
        const gap = (other.t - rec.t) * rec.segment.length;
        if (gap > 0 && gap < bestGap) {
          bestGap = gap;
          best = other;
        }
      }
      return { car: best, gap: bestGap };
    },

    // Next segment whose start is near this segment's end; null if none.
    nextSegment(seg) {
      const near = [];
      for (const other of roads) {
        if (other === seg) continue;
        if (dist2(other.start.x, other.start.z, seg.end.x, seg.end.z) < 36) near.push(other);
      }
      if (near.length) return pick(near);
      return null;
    },

    nearestCarTo(x, z, maxDist) {
      let best = null;
      let bestD = maxDist * maxDist;
      for (const rec of traffic.cars) {
        const d = dist2(rec.group.position.x, rec.group.position.z, x, z);
        if (d < bestD) {
          bestD = d;
          best = rec;
        }
      }
      return best;
    },

    // Take a car out of traffic (player steals it). Returns the car group.
    removeCar(rec) {
      const i = traffic.cars.indexOf(rec);
      if (i === -1) return null;
      traffic.cars.splice(i, 1);
      scene.remove(rec.group);
      return rec.group;
    },

    update(dt, playerPos) {
      const px = playerPos ? (playerPos.x || 0) : 0;
      const pz = playerPos ? (playerPos.z || 0) : 0;

      for (const rec of traffic.cars) {
        // Stop for the car ahead: brake when the gap closes under ~10 m.
        let target = rec.cruise;
        const ahead = traffic.carAhead(rec);
        if (ahead.car && ahead.gap < 12) {
          target = ahead.gap < 6 ? 0 : ahead.car.speed * 0.8;
        }
        rec.speed += clamp(target - rec.speed, -8 * dt, 5 * dt);
        if (rec.speed < 0) rec.speed = 0;

        rec.t += (rec.speed * dt) / rec.segment.length;
        if (rec.t >= 1) {
          const next = traffic.nextSegment(rec.segment);
          if (next) {
            rec.segment = next;
            rec.t = 0;
          } else {
            // Dead end: turn around and drive back along the same road.
            const tmp = rec.segment.start;
            rec.segment = {
              start: rec.segment.end,
              end: tmp,
              dir: { x: -rec.segment.dir.x, z: -rec.segment.dir.z },
              length: rec.segment.length,
            };
            rec.t = 0;
          }
        }
        traffic.placeOnRoad(rec);

        // Spin the wheels.
        const wheels = rec.group.userData.wheels || [];
        const spin = (rec.speed * dt) / (rec.group.userData.wheelRadius || 0.36);
        for (const wheel of wheels) wheel.rotation.x += spin;
      }

      // Despawn far away, respawn on a road near the player to keep the
      // streets alive around them.
      for (const rec of traffic.cars) {
        if (dist2(rec.group.position.x, rec.group.position.z, px, pz) > despawnDist * despawnDist) {
          const nearRoads = roads.filter((seg) => {
            const mx = (seg.start.x + seg.end.x) / 2;
            const mz = (seg.start.z + seg.end.z) / 2;
            const d = dist2(mx, mz, px, pz);
            return d > 60 * 60 && d < 160 * 160;
          });
          const seg = nearRoads.length ? pick(nearRoads) : pick(roads);
          if (seg) {
            rec.segment = seg;
            rec.t = Math.random();
            rec.cruise = rand(cruiseMin, cruiseMax);
            traffic.placeOnRoad(rec);
          }
        }
      }
    },
  };

  for (let i = 0; i < count; i++) traffic.spawnCar();
  return traffic;
}
