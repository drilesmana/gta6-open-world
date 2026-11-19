// Loose cash: briefcases dropped around the bay that Rafi can pick up on foot. A small reward
// for wandering, and the green squares the minimap shows. They respawn a while after a pickup so
// the city keeps something to find. Saves reference discovery slots, never serialized meshes.
// Keep case order stable across patches or saved discovery indices will refer to a different location.

import * as U from '../core/util.js';

const THREE = globalThis.THREE;
const SPOTS = 9;
const RESPAWN = 55;

const caseGeo = new THREE.BoxGeometry(0.5, 0.32, 0.36);
const caseMat = new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.55, metalness: 0.25 });
const strapMat = new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.6 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0x9be07a, transparent: true, opacity: 0.28 });

export class Collectibles {
  constructor(game) {
    this.game = game;
    this.list = [];
    for (let i = 0; i < SPOTS; i++) this.spawnOne(i / SPOTS);
  }

  // Build one case mesh at a walkable spot on a sidewalk ring around the map centre.
  make() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(caseGeo, caseMat);
    body.position.y = 0.16;
    body.castShadow = true;
    g.add(body);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.38), strapMat);
    strap.position.y = 0.17;
    g.add(strap);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    g.add(glow);
    return g;
  }

  // Distance to the nearest lane centre line on the 52 m grid, so a case is not dropped on asphalt.
  roadDistance(x, z) {
    const lim = this.game.world.limit;
    const off = (v) => Math.abs(((v + lim) % 52 + 52) % 52);
    return Math.min(Math.min(off(x), 52 - off(x)), Math.min(off(z), 52 - off(z)));
  }

  spawnOne(slot) {
    const lim = this.game.world.limit - 16;
    let x = 0;
    let z = 0;
    let clear = false;
    for (let i = 0; i < 40; i++) {
      const a = (slot + Math.random()) * Math.PI * 2;
      const r = U.rand(24, lim);
      x = Math.sin(a) * r;
      z = Math.cos(a) * r * 0.9;
      if (this.game.world.blocked(x, z, 1.2)) continue;
      // Walkable ground, not the middle of a lane: traffic would flatten a case left in the road.
      if (this.roadDistance(x, z) > 9) { clear = true; break; }
    }
    // Forty blocked tries leave the case inside a wall; the promenade always has a spot.
    if (!clear) {
      x = U.rand(-60, 60);
      z = this.game.world.city.maxZ - 20;
    }
    const mesh = this.make();
    mesh.position.set(x, 0, z);
    this.game.scene.add(mesh);
    this.list.push({ x, z, mesh, taken: false, timer: 0, phase: Math.random() * 6 });
  }

  update(dt, ctx) {
    for (const c of this.list) {
      if (c.taken) {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.taken = false;
          c.mesh.visible = true;
        }
        continue;
      }
      c.phase += dt;
      c.mesh.rotation.y = c.phase * 0.8;
      c.mesh.position.y = Math.sin(c.phase * 2) * 0.06 + 0.04;
      // The pool under the case breathes, so a dropped briefcase catches the eye down a street.
      const glow = c.mesh.children[2];
      if (glow) glow.scale.setScalar(0.9 + Math.sin(c.phase * 2.6) * 0.14);
      if (U.dist(c.x, c.z, ctx.player.x, ctx.player.z) < 1.5 && !ctx.player.vehicle) {
        c.taken = true;
        c.timer = RESPAWN;
        c.mesh.visible = false;
        this.game.collectCase(c);
      }
    }
  }

  reset() {
    for (const c of this.list) {
      c.taken = false;
      c.timer = 0;
      c.mesh.visible = true;
    }
  }
}
