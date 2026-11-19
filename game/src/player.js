// Velora Heat — the player on foot.
// WASD moves relative to the camera, Shift sprints, mouse click (or J) punches.
// The character rig swings its limbs while walking and snaps its arm out on a
// punch. Combat is a short-range arc check: peds in front of the player take
// the hit, get knocked back and flee — and anyone who sees it tells the law.
import { PLAYER, CITY_HALF, WATER_START } from './config.js';
import { makePerson } from './characters.js';
import { clamp, damp, collideCircle } from './util.js';

export class Player {
  constructor(scene) {
    this.rig = makePerson({ player: true });
    scene.add(this.rig.root);
    this.x = 0;
    this.z = 0;
    this.heading = 0; // facing, radians
    this.vx = 0;
    this.vz = 0;
    this.health = PLAYER.health;
    this.vehicle = null; // Car when driving, else null
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.onGround = true;
    this.hurtFlash = 0;
  }

  setPosition(x, z, heading = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.syncVisual();
  }

  // input: { f, b, l, r, run, punch, camYaw } — camYaw steers movement.
  // peds: pedestrian manager (for punch hits). onCrime(amount, reason) callback.
  update(dt, input, colliders, peds, onCrime) {
    if (this.vehicle) return; // driving is the car's job
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // Movement relative to the camera yaw.
    const sin = Math.sin(input.camYaw);
    const cos = Math.cos(input.camYaw);
    let mx = 0;
    let mz = 0;
    if (input.f) { mx += sin; mz += cos; }
    if (input.b) { mx -= sin; mz -= cos; }
    if (input.l) { mx -= cos; mz += sin; }
    if (input.r) { mx += cos; mz -= sin; }
    const len = Math.hypot(mx, mz);
    const target = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.vx = damp(this.vx, mx * target, 12, dt);
      this.vz = damp(this.vz, mz * target, 12, dt);
      const want = Math.atan2(mx, mz);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += clamp(d, -9 * dt, 9 * dt);
    } else {
      this.vx = damp(this.vx, 0, 14, dt);
      this.vz = damp(this.vz, 0, 14, dt);
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.x = clamp(this.x, -CITY_HALF, CITY_HALF);
    this.z = clamp(this.z, -CITY_HALF, WATER_START - 1);
    const pos = { x: this.x, z: this.z };
    collideCircle(pos, PLAYER.radius, colliders);
    this.x = pos.x;
    this.z = pos.z;

    // Punch.
    if (input.punch && this.punchCooldown <= 0) this.startPunch();
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const p = 1 - this.punchTimer / 0.32;
      this.rig.punch(p);
      if (!this.punchHitDone && p > 0.3) {
        this.punchHitDone = true;
        this.resolvePunch(peds, onCrime);
      }
    } else {
      this.rig.resetPunch();
    }

    // Walk / idle animation.
    const speed01 = clamp(Math.hypot(this.vx, this.vz) / PLAYER.runSpeed, 0, 1);
    if (speed01 > 0.05) this.rig.walk(dt, speed01);
    else this.rig.idle(dt, performance.now() / 1000);
    this.syncVisual();
  }

  startPunch() {
    this.punchTimer = 0.32;
    this.punchCooldown = PLAYER.punchCooldown;
    this.punchHitDone = false;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = PLAYER.comboWindow;
  }

  resolvePunch(peds, onCrime) {
    if (!peds) return;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // A combo punch lands harder: each chained hit adds 25% knockback.
    const power = 1 + 0.25 * Math.max(0, this.combo - 1);
    let hitAny = false;
    for (const ped of peds.list) {
      if (ped.fleeing > 2) continue;
      const dx = ped.x - this.x;
      const dz = ped.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.punchRange + 0.4) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < Math.cos(PLAYER.punchArc)) continue;
      // Connect: knockback + flee + a little damage.
      ped.knock((dx / (d || 1)) * power, (dz / (d || 1)) * power);
      ped.flee(4);
      hitAny = true;
    }
    if (hitAny && onCrime) onCrime(8, 'assault');
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.5;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.health, this.health + amount);
  }

  syncVisual() {
    this.rig.root.position.set(this.x, 0, this.z);
    this.rig.root.rotation.y = this.heading;
  }
}
