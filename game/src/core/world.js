// The physical city: a uniform-grid index over every collision box the builder made, so a
// hundred thousand point queries a second stay cheap. Also owns the blast that wrecks a car and
// the crash report that shakes the camera and rings the street.
// Collision boxes are static after the city is built; actors are handled by the gameplay contact pass.

import * as U from '../core/util.js';

const CELL = 24;

export class World {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.limit = city.limit;
    this.boxes = city.colliders;
    this.grid = new Map();
    this.count = 0;
    for (const box of this.boxes) this.insert(box);
  }

  key(ix, iz) {
    return ix * 100003 + iz;
  }

  insert(box) {
    const x0 = Math.floor(box.minX / CELL);
    const x1 = Math.floor(box.maxX / CELL);
    const z0 = Math.floor(box.minZ / CELL);
    const z1 = Math.floor(box.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.grid.get(k);
        if (!list) { list = []; this.grid.set(k, list); }
        list.push(box);
        this.count++;
      }
    }
  }

  // Every box within radius of a point, deduplicated for the frame. The stamp is a generation
  // counter rather than a Set: this runs for the player, every car and every pedestrian each
  // frame, and allocating a Set per query is work the collector then has to undo.
  collidersNear(x, z, radius) {
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    const out = [];
    const gen = this.generation = (this.generation ?? 0) + 1;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.grid.get(this.key(ix, iz));
        if (!list) continue;
        for (const box of list) {
          if (box.stamp === gen) continue;
          box.stamp = gen;
          out.push(box);
        }
      }
    }
    return out;
  }

  // Point test used by the brains (spawn checks) and by line-of-sight for the wanted system.
  blocked(x, z, pad = 0) {
    if (Math.abs(x) > this.limit + 2 || z > this.city.maxZ || z < -this.limit - 2) return true;
    const list = pad > 0 ? this.collidersNear(x, z, pad) : this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return false;
    for (const box of list) {
      if (U.insideBox(x, z, box, pad)) return true;
    }
    return false;
  }

  // Sampled straight line: true when nothing solid stands between the two points. Used by the
  // blast so a wall you ducked behind actually stops the fire.
  clearSight(ax, az, bx, bz, pad = 0.2) {
    const steps = Math.max(1, Math.ceil(U.dist(ax, az, bx, bz) / 3));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked(U.lerp(ax, bx, t), U.lerp(az, bz, t), pad)) return false;
    }
    return true;
  }

  // Signed angle from point A to point B relative to a heading: positive = right, negative = left.
  relativeAngle(ax, az, bx, bz, heading) {
    const abs = Math.atan2(bx - ax, bz - az);
    return U.wrapAngle(abs - heading);
  }

  // Somewhere solid-free on a ring around a point: spawns, bail-outs and pickup drops all use it
  // so nothing materialises inside a shopfront.
  freeSpotNear(x, z, minR = 3, maxR = 14, pad = 0.9, tries = 12) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = U.rand(minR, maxR);
      const sx = x + Math.sin(a) * r;
      const sz = z + Math.cos(a) * r;
      if (this.blocked(sx, sz, pad)) continue;
      return { x: sx, z: sz };
    }
    return null;
  }

  // A car hit something hard: noise, shake, sparks, and a scare for the people on the pavement.
  onImpact(car, force) {
    const g = this.game;
    const d = U.dist(car.x, car.z, g.player.x, g.player.z);
    g.audio.crash(force, car.x, car.z);
    if (d < 26) g.shake(Math.min(0.9, force / 26));
    g.particles.sparks(car.x, 0.9, car.z, 8, 0xffd9a0);
    g.peds.scare(car.x, car.z, 6);
    if (car.driver === 'player' && force > 9) g.onPlayerCrash(force);
  }

  // Blast: hurts everything in radius with a falloff, and throws debris.
  explodeAt(x, y, z, radius, damage, cause) {
    const g = this.game;
    g.audio.explosion(x, z);
    g.particles.burst(x, y, z, 44, 0xffb347);
    g.particles.burst(x, y + 0.4, z, 18, 0x4a4340);
    // A low ring of grit off the road, so the blast reads at ground level too.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.particles.spawn(x + Math.sin(a) * 1.2, 0.25, z + Math.cos(a) * 1.2,
        Math.sin(a) * 8, 1.4, Math.cos(a) * 8, 0xd8cbb4, 0.13, 0.8, 3, 1.2);
    }
    const d = U.dist(x, z, g.player.x, g.player.z);
    if (d < radius * 6) g.shake(U.clamp(1 - d / (radius * 6), 0, 1) * 1.4);

    for (const ped of g.peds.all) {
      const dd = U.dist(x, z, ped.x, ped.z);
      if (dd < radius * 1.6) ped.knock(Math.atan2(ped.x - x, ped.z - z), 9 * (1 - dd / (radius * 1.6)));
    }
    for (const cop of g.police.cops) {
      const dd = U.dist(x, z, cop.x, cop.z);
      if (dd < radius * 1.4) {
        cop.health -= damage * (1 - dd / (radius * 1.4));
        if (cop.health <= 0) cop.die();
        else cop.knock(Math.atan2(cop.x - x, cop.z - z));
      }
    }
    for (const car of g.allCars()) {
      if (car === cause) continue;
      const dd = U.dist(x, z, car.x, car.z);
      if (dd < radius * 1.5) {
        car.damage(damage * (1 - dd / (radius * 1.5)));
        const push = Math.atan2(car.x - x, car.z - z);
        car.vx += Math.sin(push) * 9 * (1 - dd / (radius * 1.5));
        car.vz += Math.cos(push) * 9 * (1 - dd / (radius * 1.5));
        // A neighbour already on fire goes up early: blasts chain down a parked row.
        if (car.burning && car.burnTimer > 1.2) car.burnTimer = 1.2;
      }
    }
    if (!g.player.vehicle) {
      const dd = U.dist(x, z, g.player.x, g.player.z);
      if (dd < radius && this.clearSight(x, z, g.player.x, g.player.z)) {
        g.player.damage(damage * (1 - dd / radius) * 0.8, g, x, z);
      }
    }
    // Scorch the pavement for a moment.
    g.particles.scorch(x, z);
  }
}
