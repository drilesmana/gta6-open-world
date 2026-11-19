// Bullets and their tracers. A bullet is a short segment swept along its line each frame; it
// stops on a wall, a person or a car, and leaves a streak of light behind it for a few frames.
// The cap also bounds the number of world sweeps after a burst; tracer life is independent of hit resolution.

import * as U from '../core/util.js';

const THREE = globalThis.THREE;
const MAX = 64;

export class Bullets {
  constructor(scene, game) {
    this.game = game;
    this.list = [];
    this.posBuf = new Float32Array(MAX * 6);
    this.colBuf = new Float32Array(MAX * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posBuf, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colBuf, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.warm = new THREE.Color(0xffd9a0);
    this.cool = new THREE.Color(0xffeec2);
  }

  fire(origin, heading, speed, owner) {
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    this.list.push({
      x: origin.x, y: origin.y, z: origin.z, dx, dz, speed,
      life: 0.85, owner, trail: 1.6,
    });
    if (this.list.length > MAX) this.list.shift();
    this.game.particles.sparks(origin.x, origin.y, origin.z, 2, 0xffe0a8);
    this.game.particles.muzzle(origin.x, origin.y, origin.z);
  }

  // Count of live bullets: exposed for debug overlay.
  get count() {
    return this.list.length;
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      if (b.life <= 0) { this.list.splice(i, 1); continue; }
      const step = b.speed * dt;
      const nx = b.x + b.dx * step;
      const nz = b.z + b.dz * step;
      let hit = false;

      let wallHit = false;
      const samples = Math.max(1, Math.ceil(step / 0.4));
      for (let sample = 1; sample <= samples; sample++) {
        if (g.world.blocked(b.x + b.dx * step * sample / samples, b.z + b.dz * step * sample / samples, 0.05)) {
          wallHit = true;
          break;
        }
      }
      if (wallHit) {
        g.particles.sparks(nx, b.y, nz, 4, 0xe8dcc0);
        hit = true;
      }

      if (!hit && b.owner === 'player') {
        for (const cop of g.police.cops) {
          if (cop.dead) continue;
          if (U.segmentDistance(cop.x, cop.z, b.x, b.z, nx, nz) < 0.8) {
            cop.health -= 26;
            cop.knock(Math.atan2(cop.x - b.x, cop.z - b.z));
            g.particles.sparks(nx, 1.3, nz, 5, 0xd8402f);
            if (cop.health <= 0) { cop.die(); g.onCopDown(); }
            hit = true;
            break;
          }
        }
      }
      if (!hit && b.owner === 'police') {
        if (!g.player.vehicle && g.player.invuln <= 0 && U.segmentDistance(g.player.x, g.player.z, b.x, b.z, nx, nz) < 0.55) {
          g.player.damage(U.rand(7, 12), g, b.x, b.z);
          g.particles.sparks(nx, 1.3, nz, 4, 0xd8402f);
          hit = true;
        } else if (g.player.vehicle && U.segmentDistance(g.player.vehicle.x, g.player.vehicle.z, b.x, b.z, nx, nz) < 1.5) {
          // A cruiser firing at a fleeing car should be pitting the paint, not shooting past it.
          g.player.vehicle.damage(U.rand(2, 5));
          g.particles.sparks(nx, 1.1, nz, 3, 0xffcf80);
          hit = true;
        }
      }
      if (!hit) {
        for (const ped of g.peds.all) {
          if (U.segmentDistance(ped.x, ped.z, b.x, b.z, nx, nz) < 0.6) {
            ped.knock(Math.atan2(ped.x - b.x, ped.z - b.z), 7);
            g.particles.sparks(nx, 1.2, nz, 4, 0xe1b49a);
            if (b.owner === 'player') g.wanted.addCrime(3);
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const car of g.allCars()) {
          if (car.dead) continue;
          // A cruiser shooting past its own colleagues should not wing them.
          if (b.owner === 'police' && car.driver === 'police') continue;
          if (U.segmentDistance(car.x, car.z, b.x, b.z, nx, nz) < 1.5) {
            car.damage(b.owner === 'player' ? 4 : 3);
            g.particles.sparks(nx, 1.0, nz, 4, 0xffcf80);
            hit = true;
            break;
          }
        }
      }

      if (hit) { this.list.splice(i, 1); continue; }
      b.x = nx;
      b.z = nz;
    }
  }

  // Draw each bullet as a short streak fading to black at the tail.
  render() {
    let n = 0;
    for (const b of this.list) {
      if (n >= MAX) break;
      const len = 1.1;
      const tx = b.x - b.dx * len;
      const tz = b.z - b.dz * len;
      this.posBuf[n * 6] = b.x;
      this.posBuf[n * 6 + 1] = b.y;
      this.posBuf[n * 6 + 2] = b.z;
      this.posBuf[n * 6 + 3] = tx;
      this.posBuf[n * 6 + 4] = b.y;
      this.posBuf[n * 6 + 5] = tz;
      const bright = (b.owner === 'player' ? this.warm : this.cool);
      this.colBuf[n * 6] = bright.r;
      this.colBuf[n * 6 + 1] = bright.g;
      this.colBuf[n * 6 + 2] = bright.b;
      this.colBuf[n * 6 + 3] = bright.r * 0.1;
      this.colBuf[n * 6 + 4] = bright.g * 0.1;
      this.colBuf[n * 6 + 5] = bright.b * 0.1;
      n++;
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.lines.geometry.setDrawRange(0, 0);
  }
}
