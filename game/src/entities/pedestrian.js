// Pedestrians: locals walking the block sidewalks and the promenade in their own clothes. They
// chat, look around, bolt from gunfire and squeal away from a wild car, and go down when hit.
// Sidewalk actors are transient and are intentionally rebuilt rather than restored from a save.

import * as U from '../core/util.js';

const THREE = globalThis.THREE;

const SKINS = [0x8d5a3b, 0xb87a52, 0xd7a077, 0x6f4630, 0xe3b995];
const SHIRTS = [0xf2e6cb, 0x5fa8a0, 0xd96b4f, 0x7f8fc2, 0xe8b34a, 0xc25b86, 0xf5f1e4, 0x4c5866];
const PANTS = [0x2f3a44, 0x6b6252, 0x8a9099, 0xc8b89a, 0x3a4a3e];

const shirtMats = SHIRTS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
const pantMats = PANTS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const skinMats = SKINS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));

const torsoGeo = new THREE.CapsuleGeometry(0.22, 0.44, 3, 8);
const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
const legGeo = new THREE.CapsuleGeometry(0.09, 0.4, 3, 6);
const armGeo = new THREE.CapsuleGeometry(0.07, 0.34, 3, 6);

export class Ped {
  constructor(scene, x, z) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const skin = U.pick(skinMats);
    const shirt = U.pick(shirtMats);
    const pant = U.pick(pantMats);

    const torso = new THREE.Mesh(torsoGeo, shirt);
    torso.position.y = 1.2;
    torso.castShadow = true;
    this.body.add(torso);
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.68;
    head.castShadow = true;
    this.body.add(head);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.1, 0.82, 0);
    this.body.add(this.legL);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.27, 1.42, 0);
    this.body.add(this.armL);
    this.legR = new THREE.Group();
    this.legR.position.set(0.1, 0.82, 0);
    this.body.add(this.legR);
    this.armR = new THREE.Group();
    this.armR.position.set(0.27, 1.42, 0);
    this.body.add(this.armR);
    for (const [g, mat, y] of [[this.legL, pant, -0.3], [this.legR, pant, -0.3], [this.armL, skin, -0.24], [this.armR, skin, -0.24]]) {
      const limb = new THREE.Mesh(legGeo, mat);
      limb.position.y = y;
      limb.scale.set(1, g === this.armL || g === this.armR ? 0.9 : 1, 1);
      limb.castShadow = true;
      g.add(limb);
    }

    // A hat or a shoulder bag now and then, so a crowd does not read as one model tinted twice.
    if (Math.random() < 0.35) {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: U.pick([0xf2e6cb, 0x2f3a44, 0xd96b4f]), roughness: 0.9 }));
      hat.position.y = 1.84;
      this.body.add(hat);
    }
    if (Math.random() < 0.3) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14),
        new THREE.MeshStandardMaterial({ color: U.pick([0x4a3b2c, 0x2b3c58, 0x8a5a3c]), roughness: 0.85 }));
      bag.position.set(0.24, 1.02, 0.06);
      bag.rotation.z = -0.2;
      this.body.add(bag);
    }

    this.x = x;
    this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    // Everyone walks at their own pace: a small spread keeps a sidewalk from marching in step,
    // and the odd jogger gives a block a little motion at different speeds.
    this.pace = U.chance(0.14) ? U.rand(2.6, 3.2) : U.rand(1.15, 1.7);
    this.jogger = this.pace > 2.4;
    this.state = 'walk';
    this.timer = U.rand(2, 9);
    this.fleeTimer = 0;
    this.stride = Math.random() * 6;
    this.block = null;
    this.patrol = [];
    this.patrolIndex = 0;
    this.knockTimer = 0;
    this.knockDir = 0;
    this.gone = false;
    this.talkPhase = Math.random() * 6;
    this.root.position.set(x, 0, z);
    scene.add(this.root);
  }

  setRoute(points) {
    this.patrol = points;
    this.patrolIndex = 0;
  }

  flee(fromX, fromZ, seconds = 4) {
    if (this.knockTimer > 0) return;
    this.state = 'flee';
    this.fleeTimer = seconds;
    this.heading = Math.atan2(this.x - fromX, this.z - fromZ);
  }

  knock(dir, force = 5) {
    this.state = 'down';
    this.knockTimer = 1.6;
    this.knockDir = dir;
    this.x += Math.sin(dir) * 0.4;
    this.z += Math.cos(dir) * 0.4;
    this.speed = force;
  }

  update(dt, ctx) {
    if (this.gone) return;

    if (this.knockTimer > 0) {
      this.knockTimer -= dt;
      this.body.rotation.x = U.damp(this.body.rotation.x, -Math.PI / 2, 8, dt);
      this.body.position.y = U.damp(this.body.position.y, 0.25, 8, dt);
      this.x += Math.sin(this.knockDir) * this.speed * dt;
      this.z += Math.cos(this.knockDir) * this.speed * dt;
      this.speed *= Math.exp(-3 * dt);
      // A body thrown across the pavement still stops against a wall.
      for (const box of ctx.world.collidersNear(this.x, this.z, 2)) {
        const hit = U.resolveCircleBox(this.x, this.z, 0.36, box);
        if (hit) { this.x += hit.nx * hit.push; this.z += hit.nz * hit.push; }
      }
      this.root.position.set(this.x, 0, this.z);
      if (this.knockTimer <= 0) {
        this.body.rotation.x = 0;
        this.body.position.y = 0;
        // Up off the pavement and away from whatever hit them.
        this.state = 'flee';
        this.fleeTimer = U.rand(2.5, 4.5);
      }
      return;
    }

    this.timer -= dt;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      this.speed = U.damp(this.speed, 5.4, 8, dt);
      this.heading += Math.sin(performance.now() * 0.002 + this.talkPhase) * 0.03;
      if (this.fleeTimer <= 0) this.state = 'walk';
    } else if (this.state === 'walk') {
      // Follow the block route, or wander the promenade.
      if (this.patrol.length) {
        const target = this.patrol[this.patrolIndex];
        if (U.dist(this.x, this.z, target.x, target.z) < 1.4) {
          this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
        } else {
          const want = Math.atan2(target.x - this.x, target.z - this.z);
          this.heading = U.dampAngle(this.heading, want, 4, dt);
        }
        this.speed = U.damp(this.speed, this.pace, 5, dt);
      } else {
        if (this.timer <= 0) {
          this.timer = U.rand(3, 9);
          this.heading += U.rand(-2, 2);
        }
        this.speed = U.damp(this.speed, this.pace * 0.9, 4, dt);
      }

      // Sidestep the player, and turn to watch them go by at arm's length.
      const d = U.dist(this.x, this.z, ctx.player.x, ctx.player.z);
      if (d < 1.4) {
        this.heading += 0.6 * dt;
        this.speed = Math.max(this.speed, 1.9);
      } else if (d < 5 && !this.patrol.length && this.state === 'walk') {
        // Locals notice someone walking at them: a quick glance, then back to the pavement.
        const want = Math.atan2(ctx.player.x - this.x, ctx.player.z - this.z);
        this.heading = U.dampAngle(this.heading, want, 1.4, dt);
        this.speed = U.damp(this.speed, 0.6, 3, dt);
      }

      // Drifted off the kerb and into the lane: angle back toward the nearest pavement so the
      // wander does not leave a body standing in traffic.
      if (ctx.peds.roadDistance(this.x, this.z) < 6.5) {
        const lim = ctx.world.limit;
        const grid = 52;
        const nearX = -lim + Math.round((this.x + lim) / grid) * grid;
        const nearZ = -lim + Math.round((this.z + lim) / grid) * grid;
        if (Math.abs(this.x - nearX) < Math.abs(this.z - nearZ)) {
          this.heading = U.dampAngle(this.heading, nearX > this.x ? Math.PI / 2 : -Math.PI / 2, 1.6, dt);
        } else {
          this.heading = U.dampAngle(this.heading, nearZ > this.z ? 0 : Math.PI, 1.6, dt);
        }
      }

      // Cower from a fast car close by.
      const car = ctx.traffic.nearest(this.x, this.z, 5);
      if (car && car.speedKmh > 40) this.flee(car.x, car.z, 1.6);
    }

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

    for (const box of ctx.world.collidersNear(this.x, this.z, 3)) {
      const hit = U.resolveCircleBox(this.x, this.z, 0.36, box);
      if (hit) {
        this.x += hit.nx * hit.push;
        this.z += hit.nz * hit.push;
        this.heading = Math.atan2(hit.nx, hit.nz);
      }
    }

    this.x = U.clamp(this.x, -ctx.world.limit, ctx.world.limit);
    this.z = U.clamp(this.z, -ctx.world.limit, ctx.world.city.maxZ);
    this.stride += this.speed * dt * 2.6;
    const swing = Math.sin(this.stride) * Math.min(this.speed / 5, 1) * 0.7;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.6;
    this.armR.rotation.x = swing * 0.6;
    if (this.state === 'flee') {
      this.armL.rotation.x = -2.4 + Math.sin(this.stride * 1.4) * 0.3;
      this.armR.rotation.x = -2.4 + Math.cos(this.stride * 1.4) * 0.3;
    }
    this.body.position.y = Math.abs(Math.sin(this.stride)) * 0.04;

    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
  }
}

export class Peds {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.all = [];
    this.spawnTimer = 0;
  }

  spawnAround(ctx, count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.all.length >= 44) return;
      const spot = this.findSidewalk(ctx.player.x, ctx.player.z)
        ?? this.world.freeSpotNear(ctx.player.x, ctx.player.z, 26, 60, 0.9);
      if (!spot) continue;
      const ped = new Ped(this.scene, spot.x, spot.z);
      if (spot.route) ped.setRoute(spot.route);
      this.all.push(ped);
    }
  }

  // Distance to the nearest road centre line on the 52 m grid: under the road half-width the
  // point is asphalt, not sidewalk.
  roadDistance(x, z) {
    const lim = this.world.limit;
    const off = (v) => Math.abs(((v + lim) % 52 + 52) % 52);
    return Math.min(Math.min(off(x), 52 - off(x)), Math.min(off(z), 52 - off(z)));
  }

  // Pick a sidewalk point on a block ring near the player: left side or promenade.
  findSidewalk(px, pz) {
    for (let tries = 0; tries < 14; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = U.rand(26, 62);
      const x = px + Math.sin(ang) * r;
      const z = pz + Math.cos(ang) * r;
      if (Math.abs(x) > this.world.limit - 4 || z > this.world.limit + 44 || z < -this.world.limit) continue;
      if (this.world.blocked(x, z, 0.8)) continue;
      // Keep bodies off the asphalt, or they spawn mid-lane and get clipped by traffic.
      if (this.roadDistance(x, z) < 9) continue;
      // Walk a rectangle around the block the point falls in.
      const cx = Math.round((x + this.world.limit) / 52 - 0.5) * 52 - this.world.limit + 26;
      const cz = Math.round((z + this.world.limit) / 52 - 0.5) * 52 - this.world.limit + 26;
      const s = 23; // Walk outside building footprints, on the four-metre sidewalk apron.
      const route = [
        { x: cx - s, z: cz - s }, { x: cx + s, z: cz - s },
        { x: cx + s, z: cz + s }, { x: cx - s, z: cz + s },
      ];
      if (this.world.blocked(cx - s, cz - s, 0.6)) return { x, z, route: null };
      return { x, z, route };
    }
    return null;
  }

  // A car that reaches a body sends it flying: the street should not let traffic pass through.
  // Police cruisers count too, or a pursuit weaves through a crowd untouched.
  hits(ctx) {
    const cars = [...ctx.traffic.all, ...ctx.police.cruisers];
    for (const ped of this.all) {
      if (ped.knockTimer > 0) continue;
      for (const car of cars) {
        if (car.dead || car.speedKmh < 11) continue;
        if (U.dist(car.x, car.z, ped.x, ped.z) > 2.1) continue;
        ped.knock(car.heading, Math.min(11, car.speedKmh * 0.22));
        ctx.spawnSparks?.(ped.x, 1.1, ped.z, 3, 0xffe2a8);
        this.scare(ped.x, ped.z, 9);
        car.vx *= 0.94;
        car.vz *= 0.94;
        break;
      }
    }
  }

  update(dt, ctx) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.42;
      this.spawnAround(ctx, this.all.length < 18 ? 2 : 1);
    }
    this.hits(ctx);
    for (let i = this.all.length - 1; i >= 0; i--) {
      const ped = this.all[i];
      ped.update(dt, ctx);
      if (U.dist(ped.x, ped.z, ctx.player.x, ctx.player.z) > 150) {
        this.scene.remove(ped.root);
        ped.gone = true;
        this.all.splice(i, 1);
      }
    }
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const ped of this.all) {
      const d = U.dist2(x, z, ped.x, ped.z);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  }

  scare(x, z, radius) {
    for (const ped of this.all) {
      if (U.dist(ped.x, ped.z, x, z) < radius) ped.flee(x, z, U.rand(3, 6));
    }
  }

  // Count of pedestrians in each state: for debug overlay.
  get stateCounts() {
    const counts = { walk: 0, flee: 0, down: 0 };
    for (const ped of this.all) counts[ped.state] = (counts[ped.state] ?? 0) + 1;
    return counts;
  }
}
