// Marisol Bay PD: cruisers that roll in on the wanted level and officers who bail out to chase on
// foot, shooting when they have a clear line. Heat is released when the player breaks line of
// sight for long enough, so a good run through the alleys ends the chase.
// The wanted meter controls dispatch; the cruiser and officer controllers own movement and line of sight.

import * as U from '../core/util.js';
import { Vehicle } from './vehicle.js';

const THREE = globalThis.THREE;

const navy = new THREE.MeshStandardMaterial({ color: 0x2b3c58, roughness: 0.8 });
const skinMats = [0x8d5a3b, 0xb87a52, 0xd7a077, 0xe3b995].map((c) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
const capMat = new THREE.MeshStandardMaterial({ color: 0x1c2740, roughness: 0.7 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.4, metalness: 0.6 });

// Shared limb geometry: a cruiser can put eight officers on the street, and rebuilding the same
// capsule for each one is wasted memory the garbage collector then has to walk.
const GEO = {
  torso: new THREE.CapsuleGeometry(0.24, 0.46, 3, 8),
  head: new THREE.SphereGeometry(0.17, 10, 8),
  cap: new THREE.CylinderGeometry(0.2, 0.19, 0.1, 10),
  brim: new THREE.BoxGeometry(0.28, 0.03, 0.16),
  limb: new THREE.CapsuleGeometry(0.1, 0.44, 3, 6),
  arm: new THREE.CapsuleGeometry(0.08, 0.36, 3, 6),
  gun: new THREE.BoxGeometry(0.08, 0.1, 0.26),
};

class Cop {
  constructor(scene, x, z) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const skin = U.pick(skinMats);

    const torso = new THREE.Mesh(GEO.torso, navy);
    torso.position.y = 1.2;
    torso.castShadow = true;
    this.body.add(torso);
    const head = new THREE.Mesh(GEO.head, skin);
    head.position.y = 1.68;
    this.body.add(head);
    const cap = new THREE.Mesh(GEO.cap, capMat);
    cap.position.y = 1.82;
    this.body.add(cap);
    const brim = new THREE.Mesh(GEO.brim, capMat);
    brim.position.set(0, 1.78, 0.16);
    this.body.add(brim);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.11, 0.82, 0);
    this.body.add(this.legL);
    this.legR = new THREE.Group();
    this.legR.position.set(0.11, 0.82, 0);
    this.body.add(this.legR);
    for (const leg of [this.legL, this.legR]) {
      const limb = new THREE.Mesh(GEO.limb, navy);
      limb.position.y = -0.32;
      limb.castShadow = true;
      leg.add(limb);
    }
    this.armR = new THREE.Group();
    this.armR.position.set(0.3, 1.42, 0);
    this.body.add(this.armR);
    const arm = new THREE.Mesh(GEO.arm, navy);
    arm.position.y = -0.26;
    this.armR.add(arm);
    const gun = new THREE.Mesh(GEO.gun, gunMat);
    gun.position.set(0, -0.48, 0.12);
    this.armR.add(gun);

    this.x = x;
    this.z = z;
    this.heading = 0;
    this.health = 42;
    this.dead = false;
    this.stride = Math.random() * 6;
    this.fireTimer = U.rand(0.6, 1.6);
    this.knockTimer = 0;
    this.shouted = false;
    this.speed = 0;
    this.root.position.set(x, 0, z);
    scene.add(this.root);
  }

  knock(dir) {
    this.health -= 14;
    this.knockTimer = 0.8;
    this.x += Math.sin(dir) * 0.5;
    this.z += Math.cos(dir) * 0.5;
    // A punched officer stumbles sideways before steadying.
    this.stumble = dir + (Math.random() < 0.5 ? 1.2 : -1.2);
    if (this.health <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.root.rotation.x = -Math.PI / 2;
    this.root.position.y = 0.25;
  }

  update(dt, ctx) {
    if (this.dead) {
      this.knockTimer = Math.max(0, this.knockTimer - dt);
      return;
    }
    if (this.knockTimer > 0) {
      this.knockTimer -= dt;
      this.root.rotation.z = Math.sin(this.knockTimer * 30) * 0.2;
      if (this.stumble !== undefined) {
        this.x += Math.sin(this.stumble) * 1.6 * dt;
        this.z += Math.cos(this.stumble) * 1.6 * dt;
      }
      this.root.position.set(this.x, 0, this.z);
      return;
    }
    const p = ctx.player;
    const d = U.dist(this.x, this.z, p.x, p.z);
    const want = Math.atan2(p.x - this.x, p.z - this.z);
    this.heading = U.dampAngle(this.heading, want, 7, dt);

    // First sight of the player: a shout, once per officer, so a chase opens with a voice.
    if (!this.shouted && d < 15) {
      this.shouted = true;
      if (ctx.wanted.level > 0) ctx.hud?.say('PATROLI', 'Freeze! Hands where I can see them.', 3);
    }

    if (d > 3.4) {
      this.speed = U.damp(this.speed, d > 12 ? 5.6 : 3.4, 8, dt);
      // Officers weave a little as they close, instead of stacking on one line of approach.
      this.weave = (this.weave ?? Math.random() * 6) + dt * 1.7;
      const side = Math.sin(this.weave) * 0.22;
      this.x += Math.sin(this.heading + side) * this.speed * dt;
      this.z += Math.cos(this.heading + side) * this.speed * dt;
    } else {
      this.speed = U.damp(this.speed, 0, 8, dt);
    }

    for (const box of ctx.world.collidersNear(this.x, this.z, 3)) {
      const hit = U.resolveCircleBox(this.x, this.z, 0.38, box);
      if (hit) { this.x += hit.nx * hit.push; this.z += hit.nz * hit.push; }
    }

    this.fireTimer -= dt;
    // No shooting through a wall: the officer needs a clear line to the body.
    if (this.fireTimer <= 0 && d < 22 && d > 2.6 && ctx.wanted.level > 0
      && ctx.world.clearSight(this.x, this.z, p.x, p.z, 0.15)) {
      this.fireTimer = U.rand(1.1, 2.2);
      ctx.audio.gunshot(this.x, this.z);
      const spread = (Math.random() - 0.5) * 0.14;
      ctx.fireBullet(
        { x: this.x + Math.sin(this.heading) * 0.6, y: 1.4, z: this.z + Math.cos(this.heading) * 0.6 },
        this.heading + spread, 90, 'police',
      );
    }

    this.stride += this.speed * dt * 2.4;
    const swing = Math.sin(this.stride) * Math.min(this.speed / 5, 1) * 0.7;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    this.body.position.y = Math.abs(Math.sin(this.stride)) * 0.04;
  }
}

export class Police {
  constructor(scene, world, graph) {
    this.scene = scene;
    this.world = world;
    this.graph = graph;
    this.cruisers = [];
    this.cops = [];
    this.spawnTimer = 0;
    this.copTimer = 0;
    this.lastLevel = 0;
    this.deployed = new WeakSet();
  }

  get heatCount() {
    return this.cruisers.length + this.cops.length;
  }

  spawnCruiser(ctx, minDist = 90, maxDist = 190) {
    if (this.cruisers.length >= 6) return null;
    const edge = this.pickEdge(ctx.player.x, ctx.player.z, minDist, maxDist);
    if (!edge) return null;
    const [a, b] = edge;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    if (this.world.blocked(x, z, 3)) return null;
    const dir = Math.atan2(b.x - a.x, b.z - a.z);
    const v = new Vehicle(this.scene, 'police', 0x1d2b45, x, z, dir);
    v.driver = 'police';
    v.sirenOn = true;
    v.ai = { charge: 0 };
    this.cruisers.push(v);
    return v;
  }

  pickEdge(px, pz, minDist, maxDist) {
    return this.graph.edgeNear(px, pz, minDist, maxDist);
  }

  // Officers deploy around a point: out of the player's face, inside the block.
  spawnCop(ctx, nearX, nearZ) {
    if (this.cops.length >= 8) return null;
    const spot = this.world.freeSpotNear(nearX, nearZ, 9, 22, 0.8);
    if (!spot) return null;
    const cop = new Cop(this.scene, spot.x, spot.z);
    this.cops.push(cop);
    return cop;
  }

  update(dt, ctx) {
    const level = ctx.wanted.level;
    this.spawnTimer -= dt;
    this.copTimer -= dt;

    // A crime, or a star gained, brings cars in from the nearest ring at once.
    if (level > this.lastLevel) this.spawnTimer = 0;
    this.lastLevel = level;

    // While the player has been out of sight a while, or has pulled so far ahead that nobody has
    // eyes on them, the department stops throwing fresh cars into the chase: the ones already
    // rolling fall behind and the heat bleeds off (a runner who breaks contact keeps it broken).
    // Above three stars they keep coming anyway.
    const nearest = Math.min(Infinity, ...this.cruisers.map((c) => U.dist(c.x, c.z, ctx.player.x, ctx.player.z)),
      ...this.cops.map((c) => U.dist(c.x, c.z, ctx.player.x, ctx.player.z)));
    const hiding = this.heatCount > 0 && level < 3 && (ctx.wanted.unseenFor > 5 || nearest > 78);
    if (level > 0 && !hiding && this.cruisers.length < Math.min(1 + level, 5) && this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(1.2, 4.2 - level * 0.6);
      // The first car comes close so the chase starts on screen; the rest come further out.
      const near = this.cruisers.length === 0;
      const car = this.spawnCruiser(ctx, near ? 45 : 70, near ? 110 : 160);
      if (car && ctx.player.vehicle) ctx.audio.sirenFar();
    }
    if (level >= 2 && !hiding && this.cops.length < level * 2 && this.copTimer <= 0) {
      this.copTimer = 2.6;
      this.spawnCop(ctx, ctx.player.x, ctx.player.z);
    }

    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const car = this.cruisers[i];
      if (car.dead) {
        car.wreckTimer = (car.wreckTimer ?? 0) + dt;
        if (car.wreckTimer > 30) { car.dispose(this.scene); this.cruisers.splice(i, 1); }
        continue;
      }
      this.driveCruiser(car, dt, ctx);
      if (U.dist(car.x, car.z, ctx.player.x, ctx.player.z) > 230) {
        car.dispose(this.scene);
        this.cruisers.splice(i, 1);
      }
    }

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      cop.update(dt, ctx);
      if (U.dist(cop.x, cop.z, ctx.player.x, ctx.player.z) > 170) {
        this.scene.remove(cop.root);
        this.cops.splice(i, 1);
      }
    }

    if (level === 0) {
      // Lost them: give up and go home.
      this.clear();
    }
  }

  driveCruiser(car, dt, ctx) {
    const p = ctx.player;
    if (car.driver === 'player') return;
    const target = p.vehicle ?? p;
    const driving = !!p.vehicle;
    const d = U.dist(car.x, car.z, target.x, target.z);

    // Far away with a building between, a cruiser follows the street grid instead of the
    // straight line: aim at the nearest crossroads that closes the gap, and only drive at the
    // player directly once there is a clear run.
    let aimX = target.x;
    let aimZ = target.z;
    if (d > 26 && !this.clearRun(car.x, car.z, target.x, target.z)) {
      const node = this.bestNode(car.x, car.z, target.x, target.z);
      if (node) { aimX = node.x; aimZ = node.z; }
    }
    const tHeading = target.vehicle && aimX === target.x
      ? target.heading
      : U.heading(aimX, aimZ, car.x, car.z) + Math.PI;
    const lead = target.vehicle && aimX === target.x ? 1 : 0;
    const tx = aimX + Math.sin(tHeading) * Math.min(12, d * 0.4) * lead;
    const tz = aimZ + Math.cos(tHeading) * Math.min(12, d * 0.4) * lead;
    const want = Math.atan2(tx - car.x, tz - car.z);
    const diff = U.wrapAngle(want - car.heading);
    const steer = U.clamp(diff * 2.6, -1, 1);

    let throttle = 1;
    if (Math.abs(diff) > 1.5 && car.speedKmh > 34) throttle = 0.35;
    if (d < 7 && !driving) throttle = 0.15;
    if (d < 4.2) { car.vx *= 0.96; car.vz *= 0.96; }

    car.update(dt, this.world, {
      throttle,
      steer,
      brake: d < 9 && driving && car.speedKmh > 25,
      handbrake: Math.abs(diff) > 1.9 && car.speedKmh > 30,
    });

    // Wedged on a corner across town: lift it onto the nearest clear road rather than lose it.
    car.stuck = car.speedKmh < 6 && d > 34 ? (car.stuck ?? 0) + dt : 0;
    if (car.stuck > 4.5) {
      car.stuck = 0;
      const node = this.graph.edgeNear(target.x, target.z, 28, 60);
      if (node) {
        const spot = node[0];
        if (!this.world.blocked(spot.x, spot.z, 2.4)) {
          car.x = spot.x;
          car.z = spot.z;
          car.heading = U.heading(spot.x, spot.z, target.x, target.z) + Math.PI;
          car.vx = 0;
          car.vz = 0;
        }
      }
    }

    // Bail out and chase on foot when the cruiser has been slowed by a player on foot, so
    // officers step out of a braking car rather than a flat-out one.
    if (!p.vehicle && d < 16 && car.speedKmh < 24 && !this.deployed.has(car)) {
      this.deployed.add(car);
      this.spawnCop(ctx, car.x, car.z);
      this.spawnCop(ctx, car.x, car.z);
    }
  }

  // Sampled line of sight for a car: halves the corners it hangs up on.
  clearRun(ax, az, bx, bz) {
    const steps = Math.ceil(U.dist(ax, az, bx, bz) / 7);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.world.blocked(U.lerp(ax, bx, t), U.lerp(az, bz, t), 1.2)) return false;
    }
    return true;
  }

  // The crossroads nearest the cruiser that is meaningfully closer to the target than it is.
  bestNode(x, z, tx, tz) {
    let best = null;
    let bd = U.dist(x, z, tx, tz) - 6;
    for (const n of this.graph.roadNodes) {
      const here = U.dist(x, z, n.x, n.z);
      if (here > 46) continue;
      const there = U.dist(n.x, n.z, tx, tz);
      if (there < bd) { bd = there; best = n; }
    }
    return best;
  }

  clear() {
    this.lastLevel = 0;
    this.spawnTimer = this.copTimer = 0;
    const traffic = this.world.game.traffic;
    for (const car of this.cruisers) {
      if (car === this.world.game.player.vehicle) {
        // The player kept the cruiser: it becomes an ordinary stolen car, lights off, and joins
        // the traffic list so it survives the department standing down.
        car.sirenOn = false;
        car.stuck = 0;
        if (!traffic.all.includes(car)) traffic.all.push(car);
      } else car.dispose(this.scene);
    }
    this.cruisers = [];
    for (const cop of this.cops) this.scene.remove(cop.root);
    this.cops = [];
  }

  allCars() {
    return this.cruisers;
  }

  // Count of active police units (cruisers + officers): for debug / HUD.
  get heatCountTotal() {
    return this.cruisers.filter((c) => !c.dead).length + this.cops.filter((c) => !c.dead).length;
  }
}
