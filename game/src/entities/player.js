// The player, Rafi: a courier with a coral jacket and a borrowed pistol. Builds a small rigged
// figure out of primitives, walks and sprints with a stride, punches, shoots and takes damage.
// The camera and the vehicle seat live outside this module.
// The visual rig is separate from the gameplay position, allowing the seat transition to hide just the avatar.

import * as U from '../core/util.js';

const THREE = globalThis.THREE;

const skin = new THREE.MeshStandardMaterial({ color: 0xb87a52, roughness: 0.8 });
const jacket = new THREE.MeshStandardMaterial({ color: 0xd8543f, roughness: 0.75 });
const shorts = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.85 });
const hair = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.9 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.8 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.4, metalness: 0.6 });

function part(geo, m, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    scene.add(this.root);

    this.body = new THREE.Group();
    this.root.add(this.body);

    // Torso, hips, head.
    part(new THREE.CapsuleGeometry(0.28, 0.52, 4, 10), jacket, this.body, 0, 1.24, 0);
    part(new THREE.CylinderGeometry(0.26, 0.24, 0.22, 10), shorts, this.body, 0, 0.86, 0);
    part(new THREE.SphereGeometry(0.2, 12, 10), skin, this.body, 0, 1.72, 0);
    const cap = part(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, this.body, 0, 1.75, 0);
    cap.scale.set(1, 0.8, 1);
    part(new THREE.BoxGeometry(0.3, 0.09, 0.04), new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.3 }), this.body, 0, 1.75, 0.18);
    part(new THREE.BoxGeometry(0.3, 0.32, 0.18), jacket, this.body, 0, 1.28, -0.02);

    // Arms and legs, held as pivots so they swing.
    this.armL = new THREE.Group();
    this.armL.position.set(-0.34, 1.5, 0);
    this.body.add(this.armL);
    part(new THREE.CapsuleGeometry(0.09, 0.44, 3, 6), jacket, this.armL, 0, -0.28, 0);

    this.armR = new THREE.Group();
    this.armR.position.set(0.34, 1.5, 0);
    this.body.add(this.armR);
    part(new THREE.CapsuleGeometry(0.09, 0.44, 3, 6), jacket, this.armR, 0, -0.28, 0);
    this.hand = part(new THREE.SphereGeometry(0.1, 8, 6), skin, this.armR, 0, -0.56, 0);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.82, 0);
    this.body.add(this.legL);
    part(new THREE.CapsuleGeometry(0.11, 0.5, 3, 6), skin, this.legL, 0, -0.36, 0);
    part(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoe, this.legL, 0, -0.68, 0.05);

    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.82, 0);
    this.body.add(this.legR);
    part(new THREE.CapsuleGeometry(0.11, 0.5, 3, 6), skin, this.legR, 0, -0.36, 0);
    part(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoe, this.legR, 0, -0.68, 0.05);

    // Pistol, hidden until armed.
    this.pistol = part(new THREE.BoxGeometry(0.09, 0.12, 0.3), gunMat, this.hand, 0, -0.05, 0.16);
    this.pistol.visible = false;

    this.x = x;
    this.z = z;
    this.heading = 0;
    this.radius = 0.42;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.armed = false;
    this.ammo = 0;
    this.reserve = 0;
    this.vehicle = null;
    this.dead = false;
    this.stride = 0;
    this.speed = 0;
    this.stamina = 1;
    this.tired = false;
    this.punchTimer = 0;
    this.shootTimer = 0;
    this.reloadTimer = 0;
    this.invuln = 0;
    this.wantedContrib = 0;
    this.lastDamage = 0;
    this.lastFoot = 0;
  }

  setPosition(x, z, heading = this.heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = heading;
  }

  get eyeY() {
    return 1.62;
  }

  update(dt, ctx) {
    if (this.dead) return;
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    const finishingReload = this.reloadTimer > 0 && this.reloadTimer <= dt;
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    if (finishingReload) {
      const take = Math.min(12 - this.ammo, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      ctx.hud.updateAmmo();
    }
    this.invuln = Math.max(0, this.invuln - dt);

    const input = ctx.input;
    let mx = 0;
    let mz = 0;
    if (input.down('forward')) mz += 1;
    if (input.down('back')) mz -= 1;
    if (input.down('left')) mx -= 1;
    if (input.down('right')) mx += 1;

    const sprinting = input.down('sprint') && mz > 0 && this.stamina > 0.02;
    const target = sprinting ? 8.2 : 4.6;
    const moving = mx !== 0 || mz !== 0;

    // Sprint has a tank: a long run across the city ends in a walk, which makes position matter.
    this.stamina = U.clamp(this.stamina + (sprinting ? -dt * 0.26 : dt * 0.17), 0, 1);
    this.tired = this.stamina < 0.02;

    // Camera-relative movement.
    const camYaw = ctx.cameraYaw;
    if (moving) {
      const len = Math.hypot(mx, mz) || 1;
      const dx = (-mx * Math.cos(camYaw) - mz * Math.sin(camYaw)) / len;
      const dz = (mx * Math.sin(camYaw) - mz * Math.cos(camYaw)) / len;
      const desired = Math.atan2(dx, dz);
      this.heading += U.wrapAngle(desired - this.heading) * (1 - Math.exp(-14 * dt));
      this.speed = U.damp(this.speed, target, 9, dt);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
    } else {
      this.speed = U.damp(this.speed, 0, 12, dt);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      // Standing armed: face where the camera is looking, so a shot from a standstill does not
      // swing the body round after the bullet has already left.
      if (this.armed) this.heading = U.dampAngle(this.heading, camYaw + Math.PI, 9, dt);
    }

    // Collisions with buildings, props and the map edge.
    for (const box of ctx.world.collidersNear(this.x, this.z, 3)) {
      const hit = U.resolveCircleBox(this.x, this.z, this.radius, box);
      if (hit) {
        this.x += hit.nx * hit.push;
        this.z += hit.nz * hit.push;
      }
    }
    const lim = ctx.world.limit;
    this.x = U.clamp(this.x, -lim, lim);
    this.z = U.clamp(this.z, -lim, ctx.world.city.maxZ);

    // Animation: a stride that widens with speed, a forward lean into a sprint, and a shoulder
    // kick on each shot.
    this.stride += this.speed * dt * 2.2;
    const swing = Math.sin(this.stride) * Math.min(this.speed / 8, 1) * 0.85;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.75;
    this.armR.rotation.x = this.shootTimer > 0 ? -1.5 : swing * 0.75;
    this.body.position.y = Math.abs(Math.sin(this.stride)) * Math.min(this.speed / 9, 1) * 0.06;
    this.body.rotation.z = Math.sin(this.stride) * 0.02;
    const lean = sprinting ? -0.14 : -Math.min(this.speed / 9, 1) * 0.05;
    this.body.rotation.x = U.damp(this.body.rotation.x, lean + (this.shootTimer > 0 ? 0.06 : 0), 8, dt);
    this.body.rotation.y = U.damp(this.body.rotation.y, 0, 9, dt);

    // Dust and a scuff each time a heel lands: a sprint kicks grit, a walk is quieter.
    const foot = Math.sin(this.stride);
    if (this.speed > 2.5 && Math.sign(foot) !== Math.sign(this.lastFoot)) {
      if (sprinting) ctx.particles?.dust(this.x, this.z);
      ctx.audio.footstep?.();
    }
    this.lastFoot = foot;

    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    this.pistol.visible = this.armed && !this.vehicle;

    // Combat.
    if (this.punchTimer > 0) this.armR.rotation.x = -1.9 + Math.sin((1 - this.punchTimer / 0.28) * Math.PI) * 1.6;

    if (input.mouse.leftPressed && !this.vehicle) {
      if (this.armed && this.ammo > 0) this.shoot(ctx);
      else this.punch(ctx);
    }
    if (input.hit('reload')) this.reload(ctx);
  }

  punch(ctx) {
    if (this.punchTimer > 0) return;
    this.punchTimer = 0.28;
    ctx.audio.punch();
    // A swing also swings the body a little, so it lands with weight.
    this.body.rotation.y = -0.24;
    const reach = 1.9;
    const hx = this.x + Math.sin(this.heading) * reach;
    const hz = this.z + Math.cos(this.heading) * reach;
    let hitSomething = false;
    // A swing catches everyone in a short arc, not just the nearest body.
    for (const ped of ctx.peds.all) {
      if (U.dist(ped.x, ped.z, hx, hz) < 1.5) {
        ped.knock(this.heading, 6);
        ctx.spawnSparks(ped.x, 1.2, ped.z, 5, 0xffe2a8);
        hitSomething = true;
      }
    }
    for (const cop of ctx.police.cops) {
      if (cop.dead) continue;
      if (U.dist(cop.x, cop.z, hx, hz) < 1.4) {
        cop.knock(this.heading);
        if (cop.dead) ctx.onCopDown?.();
        hitSomething = true;
      }
    }
    if (hitSomething) {
      ctx.wanted.addCrime(6);
      ctx.shake(0.25);
      ctx.peds.scare(hx, hz, 7);
    } else {
      for (const v of ctx.traffic.all) {
        if (U.dist(v.x, v.z, hx, hz) < 2.1) { v.damage(7); hitSomething = true; break; }
      }
    }
  }

  shoot(ctx) {
    if (this.shootTimer > 0 || this.reloadTimer > 0) return;
    this.shootTimer = 0.16;
    this.ammo--;
    ctx.audio.gunshot();
    const spread = (Math.random() - 0.5) * 0.06;
    const dir = ctx.cameraYaw + Math.PI + spread;
    this.heading = dir;
    const origin = { x: this.x + Math.sin(dir) * 0.7, y: 1.45, z: this.z + Math.cos(dir) * 0.7 };
    ctx.fireBullet(origin, dir, 110, 'player');
    ctx.wanted.addCrime(5);
    ctx.shake(0.35);
    // The block hears it.
    ctx.peds.scare(this.x, this.z, 26);
  }

  reload(ctx) {
    if (!this.armed || this.reloadTimer > 0 || this.ammo >= 12 || this.reserve <= 0) return;
    this.reloadTimer = 1.2;
    ctx.audio.reload();
  }

  damage(amount, ctx, fromX, fromZ) {
    if (this.dead || this.invuln > 0) return;
    let left = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, left * 0.6);
      this.armor -= absorbed;
      left -= absorbed;
    }
    this.health -= left;
    this.invuln = 0.18;
    ctx.audio.hurt();
    ctx.shake(0.6);
    ctx.damageFlash();
    if (fromX !== undefined) {
      // Turn away from the hit along the short arc, not through a full spin.
      const away = Math.atan2(this.x - fromX, this.z - fromZ);
      this.heading = U.wrapAngle(this.heading + U.angleTo(this.heading, away) * 0.55);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      ctx.onPlayerDead();
    }
  }

  heal(n) {
    this.health = Math.min(this.maxHealth, this.health + n);
  }

  // Current movement state as a string: for debug overlay.
  get moveState() {
    if (this.vehicle) return `driving:${this.vehicle.spec.name}`;
    if (this.dead) return 'dead';
    if (this.speed > 6) return 'sprint';
    if (this.speed > 1) return 'walk';
    return 'idle';
  }
}
