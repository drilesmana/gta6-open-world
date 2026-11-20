// police.js — Velora Heat (chunk 2)
// Wanted system + pursuit cars. Built from the spec contract only:
// createPolice(scene, city, makeCar) holds the wanted level (0–5 stars), an
// escape meter, and a list of pursuit cars. It spawns police cars when wanted
// rises, has them chase the player, and lowers wanted when the player stays
// out of the search area long enough. Exposes raiseWanted, lowerWanted, the
// current wanted level, the escape progress, and an update function.
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

export function createPolice(scene, city, makeCar) {
  const THREE = three();
  const rawSpawns = (city && (city.carSpawns || city.carSpawnPoints || city.spawns)) || [];
  const carSpawns = rawSpawns.map(pointXZ).filter(Boolean);

  const escapeTime = cfgNum(['wanted.escapeTime', 'wanted.escapeSeconds', 'police.escapeTime'], 12);
  const searchRadius = cfgNum(['wanted.searchRadius', 'police.searchRadius'], 70);
  const chaseTop = cfgNum(['police.topSpeed', 'police.chaseSpeed'], 46);
  const spawnDist = cfgNum(['police.spawnDistance', 'police.spawnDist'], 90);
  const maxPursuit = 5;

  const police = {
    wanted: 0, // 0–5 stars
    escapeMeter: 0, // seconds hidden from the search area
    pursuit: [], // live pursuit cars: { group, speed, sirenPhase }
    _hiddenTime: 0,

    get wantedLevel() {
      return police.wanted;
    },

    get escapeProgress() {
      if (police.wanted === 0) return 0;
      return clamp(police.escapeMeter / escapeTime, 0, 1);
    },

    // Alias used by the HUD-facing code in main.js.
    get cars() {
      return police.pursuit;
    },

    raiseWanted(amount) {
      const n = amount === undefined ? 1 : amount;
      police.wanted = clamp(police.wanted + n, 0, 5);
      police.escapeMeter = 0;
      police._hiddenTime = 0;
      police.syncPursuit();
      return police.wanted;
    },

    lowerWanted(amount) {
      const n = amount === undefined ? 1 : amount;
      police.wanted = clamp(police.wanted - n, 0, 5);
      police.escapeMeter = 0;
      police._hiddenTime = 0;
      police.syncPursuit();
      return police.wanted;
    },

    setWanted(n) {
      police.wanted = clamp(Math.round(n) || 0, 0, 5);
      police.escapeMeter = 0;
      police._hiddenTime = 0;
      police.syncPursuit();
      return police.wanted;
    },

    clearWanted() {
      return police.setWanted(0);
    },

    reset() {
      police.clearWanted();
    },

    // How many pursuit cars the current wanted level calls for.
    desiredCount() {
      return Math.min(police.wanted, maxPursuit);
    },

    spawnPursuitCar(playerPos) {
      const group = makeCar('white', 'police', undefined);
      // Spawn on a road / car spawn near the player but not on top of them.
      let x = 0;
      let z = 0;
      if (playerPos) {
        const angle = Math.random() * Math.PI * 2;
        const d = spawnDist + rand(0, 40);
        x = playerPos.x + Math.cos(angle) * d;
        z = playerPos.z + Math.sin(angle) * d;
      } else if (carSpawns.length) {
        const s = pick(carSpawns);
        x = s.x;
        z = s.z;
      }
      group.position.set(x, 0, z);
      group.rotation.y = Math.random() * Math.PI * 2;
      scene.add(group);
      const rec = { group, speed: 0, sirenPhase: Math.random() * Math.PI * 2 };
      police.pursuit.push(rec);
      return rec;
    },

    despawnPursuitCar(rec) {
      const i = police.pursuit.indexOf(rec);
      if (i !== -1) police.pursuit.splice(i, 1);
      scene.remove(rec.group);
    },

    // Add or remove pursuit cars until the count matches the wanted level.
    syncPursuit(playerPos) {
      const want = police.desiredCount();
      while (police.pursuit.length < want) police.spawnPursuitCar(playerPos);
      while (police.pursuit.length > want) {
        police.despawnPursuitCar(police.pursuit[police.pursuit.length - 1]);
      }
    },

    // target: player position ({x,z} / Vector3) or the player object.
    // dt: seconds since last frame.
    update(dt, target) {
      const pos = target && target.position ? target.position : target;
      const px = pos ? (pos.x || 0) : 0;
      const pz = pos ? (pos.z || 0) : 0;

      if (police.wanted === 0) {
        police.escapeMeter = 0;
        police._hiddenTime = 0;
        if (police.pursuit.length) police.syncPursuit();
        return;
      }

      // Flash the light bars: red and blue alternate.
      const flash = Math.sin(performance.now() / 140) > 0;
      for (const rec of police.pursuit) {
        const bar = rec.group.userData.lightBar;
        if (bar) {
          bar.redMat.emissiveIntensity = flash ? 2.2 : 0.15;
          bar.blueMat.emissiveIntensity = flash ? 0.15 : 2.2;
          if (bar.redSprite) bar.redSprite.material.opacity = flash ? 0.85 : 0.1;
          if (bar.blueSprite) bar.blueSprite.material.opacity = flash ? 0.1 : 0.85;
        }
      }

      // Nearest pursuit car decides whether the player is "seen".
      let nearest = Infinity;
      for (const rec of police.pursuit) {
        const d = Math.sqrt(dist2(rec.group.position.x, rec.group.position.z, px, pz));
        if (d < nearest) nearest = d;
      }

      if (nearest > searchRadius) {
        police._hiddenTime += dt;
        police.escapeMeter = police._hiddenTime;
        if (police._hiddenTime >= escapeTime) {
          police.lowerWanted(1);
        }
      } else {
        police._hiddenTime = 0;
        police.escapeMeter = 0;
      }

      // Chase: steer toward the player, accelerate, and nudge them when close.
      for (const rec of police.pursuit) {
        const g = rec.group;
        const dx = px - g.position.x;
        const dz = pz - g.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const desiredHeading = Math.atan2(dx, dz);
        let diff = desiredHeading - g.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turnRate = 2.4;
        g.rotation.y += clamp(diff, -turnRate * dt, turnRate * dt);

        // Close in fast when far, ease off to avoid orbiting when on top.
        const targetSpeed = d > 12 ? chaseTop : Math.min(chaseTop, 18);
        rec.speed += clamp(targetSpeed - rec.speed, -14 * dt, 9 * dt);
        if (rec.speed < 0) rec.speed = 0;

        const fx = Math.sin(g.rotation.y);
        const fz = Math.cos(g.rotation.y);
        g.position.x += fx * rec.speed * dt;
        g.position.z += fz * rec.speed * dt;

        const wheels = g.userData.wheels || [];
        const spin = (rec.speed * dt) / (g.userData.wheelRadius || 0.36);
        for (const wheel of wheels) wheel.rotation.x += spin;

        // A pursuit car that lost the player far away re-joins from a spawn.
        if (d > 320) {
          const angle = Math.random() * Math.PI * 2;
          g.position.set(px + Math.cos(angle) * spawnDist, 0, pz + Math.sin(angle) * spawnDist);
          rec.speed = chaseTop * 0.5;
        }
      }
    },
  };

  return police;
}
