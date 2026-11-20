import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, pick, clamp } from './util.js';

// Police and the wanted system for Velora Heat. Wanted runs 0 to 5 stars.
// Raising wanted spawns pursuit cars (one per star, up to three); they steer
// straight at the player and cut across blocks, light bars flashing. The
// player is busted if a pursuit car stays glued to them for over two and a
// half seconds. Wanted falls when the player stays out of the search area
// long enough: the escape meter fills while every pursuit car is far away,
// and a full meter drops one star.

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

// createPolice(scene, city, makeCar): returns the police system. It exposes
// wanted (0–5), escapeProgress (0–1), pursuit (live pursuit car entries),
// busted (bool), onBusted (callback or null), raiseWanted(n),
// lowerWanted(n), and update(dt, playerPos, playerSpeed, playerDriving).
// Each pursuit entry is { group, speed, heading }.
export function createPolice(scene, city, makeCar) {
  const roads = normRoads(city);
  const maxPursuit = 3;
  const pursuitSpeed = tun(['police.speed', 'police.pursuitSpeed', 'policeSpeed'], 32);
  const searchRadius = tun(['police.searchRadius', 'wanted.searchRadius', 'searchRadius'], 55);
  const escapeTime = tun(['wanted.escapeTime', 'police.escapeTime', 'escapeTime'], 8);
  const bustedTime = tun(['police.bustedTime', 'wanted.bustedTime', 'bustedTime'], 2.5);
  const bustedDist = tun(['police.bustedDistance', 'wanted.bustedDistance', 'bustedDistance'], 3.5);

  const police = {
    scene,
    city,
    roads,
    wanted: 0,
    escapeProgress: 0,
    pursuit: [],
    busted: false,
    onBusted: null,
    _bustedTimer: 0,
    _flashPhase: 0,

    raiseWanted(n = 1) {
      this.wanted = clamp(this.wanted + n, 0, 5);
      this.escapeProgress = 0;
      this._syncPursuit();
    },

    lowerWanted(n = 1) {
      this.wanted = clamp(this.wanted - n, 0, 5);
      this.escapeProgress = 0;
      this._syncPursuit();
    },

    _spawnCar(playerPos) {
      const group = makeCar('white', 'police', null);
      // Spawn on a road near the player when possible, else at an offset.
      let x = playerPos.x + rand(-45, 45);
      let z = playerPos.z + rand(-45, 45);
      if (roads.length) {
        const near = roads.filter((s) => {
          const mx = (s.ax + s.bx) / 2;
          const mz = (s.az + s.bz) / 2;
          return Math.hypot(mx - playerPos.x, mz - playerPos.z) < 70;
        });
        const seg = near.length ? pick(near) : pick(roads);
        const t = rand(0, seg.len);
        x = seg.ax + seg.dx * t;
        z = seg.az + seg.dz * t;
      }
      group.position.set(x, 0, z);
      group.rotation.y = Math.atan2(playerPos.x - x, playerPos.z - z);
      scene.add(group);
      return { group, speed: 0, heading: group.rotation.y };
    },

    _syncPursuit(playerPos) {
      const want = this.wanted === 0 ? 0 : Math.min(this.wanted, maxPursuit);
      const pos = playerPos || { x: 0, z: 0 };
      while (this.pursuit.length < want) {
        this.pursuit.push(this._spawnCar(pos));
      }
      while (this.pursuit.length > want) {
        const entry = this.pursuit.pop();
        scene.remove(entry.group);
      }
    },

    update(dt, playerPos, playerSpeed, playerDriving) {
      if (this.busted) return;
      if (this.wanted === 0) {
        this.escapeProgress = 0;
        this._bustedTimer = 0;
        if (this.pursuit.length) this._syncPursuit(playerPos);
        return;
      }
      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;
      this._flashPhase += dt * 9;
      const flashOn = Math.sin(this._flashPhase) > 0;

      let nearest = Infinity;
      let touching = false;
      for (const entry of this.pursuit) {
        const g = entry.group;
        // Steer toward the player, cutting across blocks.
        const dx = px - g.position.x;
        const dz = pz - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < nearest) nearest = dist;
        const wantHeading = Math.atan2(dx, dz);
        let dh = wantHeading - entry.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const turnRate = 2.4;
        entry.heading += clamp(dh, -turnRate * dt, turnRate * dt);
        g.rotation.y = entry.heading;
        // Close in fast, ease off to a tailing speed when very close, and
        // stop dead once on top of the player so the car stays glued while
        // the busted timer runs (otherwise it would drive straight past).
        const targetSpeed = dist < bustedDist ? 0
          : dist < 6 ? 6
          : pursuitSpeed + this.wanted * 1.5;
        entry.speed += clamp(targetSpeed - entry.speed, -20 * dt, 12 * dt);
        g.position.x += Math.sin(entry.heading) * entry.speed * dt;
        g.position.z += Math.cos(entry.heading) * entry.speed * dt;
        // Flash the light bar: red and blue alternate.
        const bar = g.userData && g.userData.lightBar;
        if (bar) {
          if (bar.red && bar.red.material) bar.red.material.emissiveIntensity = flashOn ? 2.2 : 0.25;
          if (bar.blue && bar.blue.material) bar.blue.material.emissiveIntensity = flashOn ? 0.25 : 2.2;
        }
        // Spin the wheels.
        const w = g.userData && g.userData.wheels;
        if (w) {
          const spin = (entry.speed / (g.userData.wheelRadius || 0.36)) * dt;
          for (const key of ['frontL', 'frontR', 'rearL', 'rearR']) {
            const pivot = w[key];
            if (pivot && pivot.userData.tyre) pivot.userData.tyre.rotation.x += spin;
          }
        }
        if (dist < bustedDist) touching = true;
      }

      // Busted: a pursuit car glued to the player for over bustedTime.
      if (touching) {
        this._bustedTimer += dt;
        if (this._bustedTimer >= bustedTime) {
          this.busted = true;
          if (typeof this.onBusted === 'function') this.onBusted();
        }
      } else {
        this._bustedTimer = Math.max(0, this._bustedTimer - dt * 2);
      }

      // Escape: every pursuit car far away fills the meter; one car close
      // drains it. A full meter drops one wanted star.
      if (nearest > searchRadius) {
        this.escapeProgress += dt / escapeTime;
        if (this.escapeProgress >= 1) {
          this.escapeProgress = 0;
          this.lowerWanted(1);
        }
      } else {
        this.escapeProgress = Math.max(0, this.escapeProgress - dt / (escapeTime * 0.5));
      }
    },
  };

  return police;
}
