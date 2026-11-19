// Cars: the mesh builder, the arcade handling model and per-car damage. Handling is a light
// two-axis model (forward thrust, lateral grip) so slides and handbrake turns feel right, and
// every car can be driven by the player, the traffic brain or a police pursuit.
// The driver flag selects an input source; it does not change the geometry or underlying traction model.

import * as U from '../core/util.js';

const THREE = globalThis.THREE;

// Handling: max in metres a second, accel in metres a second squared — brisk enough that pulling
// away from a standstill reads as a launch rather than a crawl.
export const SPECS = {
  kancil: { name: 'Lumba 500', max: 25, accel: 12, grip: 6.5, turn: 2.1, mass: 0.8, health: 60, value: 90 },
  sedan: { name: 'Seruni', max: 34, accel: 15, grip: 7.5, turn: 1.9, mass: 1, health: 100, value: 150 },
  coupe: { name: 'Bayu GT', max: 41, accel: 21, grip: 8, turn: 1.7, mass: 1, health: 90, value: 220 },
  van: { name: 'Kotak', max: 22, accel: 10, grip: 6, turn: 1.5, mass: 1.6, health: 140, value: 130 },
  pickup: { name: 'Angkut', max: 27, accel: 12, grip: 5.6, turn: 1.6, mass: 1.4, health: 120, value: 140 },
  taxi: { name: 'Teksi', max: 31, accel: 13, grip: 7, turn: 1.9, mass: 1, health: 90, value: 160 },
  police: { name: 'Patroli', max: 33, accel: 17, grip: 8, turn: 1.9, mass: 1.2, health: 130, value: 0 },
};

const PAINT = [0xe8b34a, 0x5fa8a0, 0xd96b4f, 0xe6e0d2, 0x7f8fc2, 0xc25b86, 0x8ab54f, 0x4c5866, 0xf2c9a0, 0xa9d3d5];
const MATS = new Map();
const mat = (color, opts = {}) => {
  const key = color + JSON.stringify(opts);
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.35, ...opts }));
  return MATS.get(key);
};

const GEO = {
  body: new THREE.BoxGeometry(1, 1, 1),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10),
  hub: new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8),
  light: new THREE.BoxGeometry(0.32, 0.16, 0.08),
};

function box(w, h, d, m, x, y, z, parent) {
  const mesh = new THREE.Mesh(GEO.body, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Builds a car body from the type: dimensions, roof shape, lights and trim.
export function buildCarMesh(type, color, plate) {
  const g = new THREE.Group();
  const paint = mat(color);
  const dark = mat(0x2a2f33, { roughness: 0.5 });
  const glass = mat(0x9fd3dd, { roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.62 });
  const chrome = mat(0xd7d9d2, { roughness: 0.25, metalness: 0.8 });

  if (type === 'van') {
    box(2.1, 1.3, 4.8, paint, 0, 1.05, 0, g);
    box(2.0, 0.9, 1.5, paint, 0, 1.95, -1.1, g);
    box(1.9, 0.7, 0.1, glass, 0, 1.9, -1.86, g);
    box(2.05, 0.55, 1.0, glass, 0, 1.95, -1.1, g);
  } else if (type === 'pickup') {
    box(2.0, 0.65, 4.6, paint, 0, 0.85, 0, g);
    box(1.9, 0.75, 1.7, paint, 0, 1.5, -0.5, g);
    box(1.8, 0.5, 0.1, glass, 0, 1.55, -1.32, g);
    box(1.9, 0.35, 0.1, dark, 0, 1.3, 2.3, g);
  } else {
    const low = type === 'coupe' ? 0.72 : 0.78;
    box(1.95, low, type === 'coupe' ? 4.5 : 4.3, paint, 0, 0.82, 0, g);
    box(type === 'coupe' ? 1.7 : 1.8, 0.62, type === 'coupe' ? 2.0 : 2.2, paint, 0, 1.4, -0.25, g);
    box(type === 'coupe' ? 1.6 : 1.7, 0.5, 0.1, glass, 0, 1.42, -1.28, g);
    box(0.1, 0.42, 1.9, glass, 0.86, 1.42, -0.25, g);
    box(0.1, 0.42, 1.9, glass, -0.86, 1.42, -0.25, g);
    box(1.7, 0.3, 0.1, dark, 0, 0.62, 2.1, g);
  }

  if (type === 'police') {
    const bar = box(1.1, 0.2, 0.35, mat(0x1a1d20), 0, 1.62, -0.1, g);
    const red = box(0.5, 0.16, 0.3, mat(0xff2f2f, { emissive: 0xff0000, emissiveIntensity: 1.4 }), -0.3, 1.63, -0.1, g);
    const blue = box(0.5, 0.16, 0.3, mat(0x2f6bff, { emissive: 0x0033ff, emissiveIntensity: 1.4 }), 0.3, 1.63, -0.1, g);
    g.userData.bar = { bar, red, blue };
    // A coloured pool of light on the asphalt under the bar: the siren reads from a distance.
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.6, 18),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.16, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    g.add(glow);
    g.userData.glow = glow;
    // Door stripe.
    box(0.04, 0.34, 2.6, mat(0xf2f0e6), 0.99, 0.95, 0, g);
    box(0.04, 0.34, 2.6, mat(0xf2f0e6), -0.99, 0.95, 0, g);
  }
  if (type === 'taxi') {
    box(0.9, 0.24, 0.4, mat(0xf5d34a, { emissive: 0x6b5a10, emissiveIntensity: 0.6 }), 0, 1.86, -0.2, g);
    box(0.05, 0.2, 1.8, mat(0x1a1d20), 0.99, 1.0, 0, g);
  }

  // Lights and bumpers.
  const head = mat(0xfff3c9, { emissive: 0xfff0b0, emissiveIntensity: 1.1 });
  // Own material per lamp, so one car's brake lights do not light the street and the turn
  // indicators can blink one side at a time.
  const tails = [];
  const tailMats = [];
  for (const s of [-1, 1]) {
    const tMat = new THREE.MeshStandardMaterial({ color: 0xd8342a, emissive: 0xb02015, emissiveIntensity: 0.55, roughness: 0.42 });
    const h = new THREE.Mesh(GEO.light, head);
    h.position.set(s * 0.62, 0.8, type === 'van' ? 2.42 : 2.16);
    g.add(h);
    const t = new THREE.Mesh(GEO.light, tMat);
    t.position.set(s * 0.62, 0.8, type === 'van' ? -2.42 : -2.16);
    g.add(t);
    tails.push(t);
    tailMats.push(tMat);
  }
  g.userData.tails = tails;
  g.userData.tailMats = tailMats;
  g.userData.tailMat = tailMats[0];
  // Reversing lamps: white, and dark until reverse is selected.
  const reverseMat = new THREE.MeshStandardMaterial({ color: 0xe8e6dc, emissive: 0xffffff, emissiveIntensity: 0.08, roughness: 0.5 });
  const reverse = new THREE.Mesh(GEO.light, reverseMat);
  reverse.position.set(0, 0.86, type === 'van' ? -2.42 : -2.16);
  reverse.scale.set(0.7, 1, 1);
  g.add(reverse);
  g.userData.reverseMat = reverseMat;
  box(2.0, 0.2, 0.18, chrome, 0, 0.52, type === 'van' ? 2.4 : 2.16, g);

  // Wheels: groups so they can steer and spin.
  g.userData.wheels = [];
  const wx = type === 'van' ? 0.98 : 0.92;
  const wz = type === 'van' ? 1.6 : type === 'pickup' ? 1.5 : 1.4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hub = new THREE.Group();
      hub.position.set(sx * wx, 0.4, sz * wz);
      const tyre = new THREE.Mesh(GEO.wheel, dark);
      tyre.rotation.z = Math.PI / 2;
      tyre.castShadow = true;
      hub.add(tyre);
      const cap = new THREE.Mesh(GEO.hub, chrome);
      cap.rotation.z = Math.PI / 2;
      hub.add(cap);
      hub.userData.front = sz > 0;
      g.add(hub);
      g.userData.wheels.push(hub);
    }
  }

  // Plate.
  if (plate) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.2),
      new THREE.MeshStandardMaterial({ map: makePlate(plate), roughness: 0.7 }));
    p.position.set(0, 0.6, -2.22);
    p.rotation.y = Math.PI;
    g.add(p);
  }

  g.userData.type = type;
  return g;
}

const plateCache = new Map();
function makePlate(text) {
  if (plateCache.has(text)) return plateCache.get(text);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4efe0';
  ctx.fillRect(0, 0, 128, 40);
  ctx.strokeStyle = '#20303a';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 36);
  ctx.fillStyle = '#20303a';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 29);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  plateCache.set(text, t);
  return t;
}

let plateCounter = 0;
export function nextPlate() {
  plateCounter++;
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const a = letters[(plateCounter * 7) % letters.length];
  const b = letters[(plateCounter * 13) % letters.length];
  return `MB ${a}${b} ${100 + ((plateCounter * 37) % 899)}`;
}

export class Vehicle {
  constructor(scene, type, color, x, z, heading = 0) {
    this.spec = SPECS[type] ?? SPECS.sedan;
    this.type = type;
    this.group = buildCarMesh(type, color ?? PAINT[Math.floor(Math.random() * PAINT.length)], nextPlate());
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    scene.add(this.group);

    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.forwardSpeed = 0;
    this.health = this.spec.health;
    this.maxHealth = this.spec.health;
    this.radius = 1.75;
    this.dead = false;
    this.burning = false;
    this.exploded = false;
    this.burnTimer = 0;
    this.driver = null; // 'player' | 'ai' | 'police' | null
    this.ai = null;
    this.sirenOn = false;
    this.sirenPhase = 0;
    this.wheelSpin = 0;
    this.steerVisual = 0;
    // -1 left, 1 right, 0 none: the turn indicator the traffic brain asks for.
    this.indicator = 0;
    this.honkCooldown = 0;
    this.lastImpact = 0;
    this.emitter = null;
    this.world = null; // set on the first update, so the smoke timer can reach the particles
  }

  get speedKmh() {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  // Human-readable state: for debug overlay.
  get stateLabel() {
    if (this.dead) return 'wrecked';
    if (this.burning) return 'burning';
    if (this.driver === 'player') return 'player';
    if (this.driver) return this.driver;
    return 'parked';
  }

  // input: { throttle: -1..1, steer: -1..1, brake: bool, handbrake: bool }
  update(dt, world, input) {
    if (this.dead) return;
    this.world = world;
    const spec = this.spec;
    const throttle = U.clamp(input.throttle ?? 0, -1, 1);
    const steer = U.clamp(input.steer ?? 0, -1, 1);
    const brake = !!input.brake;
    const handbrake = !!input.handbrake;

    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;

    let fwd = this.vx * fwdX + this.vz * fwdZ;
    let lat = this.vx * rightX + this.vz * rightZ;

    // Engine, reverse and brakes.
    if (throttle > 0) {
      fwd += spec.accel * throttle * dt;
    } else if (throttle < 0) {
      if (fwd > 0) fwd = Math.max(0, fwd - spec.accel * 1.8 * dt * Math.abs(throttle));
      else fwd -= spec.accel * 0.9 * dt * Math.abs(throttle);
    }
    if (brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 26 * dt);
    if (handbrake) {
      fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 7 * dt);
      lat *= Math.exp(-2.2 * dt);
    }

    const top = spec.max * (this.burning ? 0.8 : 1);
    fwd = U.clamp(fwd, -top * 0.42, top);
    if (Math.abs(fwd) < 0.06) fwd = 0;

    // Drag and lateral grip: an engine braking in gear, then the tyres' own scrub.
    fwd *= Math.exp(-(throttle === 0 ? 1.15 : 0.28) * dt);
    lat *= Math.exp(-spec.grip * (handbrake ? 0.35 : 1) * dt);

    // Steering falls away with speed and needs roll.
    const speedFactor = U.clamp(Math.abs(fwd) / 9, 0, 1) * (1 - Math.min(Math.abs(fwd) / (top * 1.8), 0.45));
    const dir = fwd < 0 ? -1 : 1;
    this.heading += steer * spec.turn * speedFactor * dir * dt;
    this.heading = U.wrapAngle(this.heading);

    // Rebuild the velocity from both axes and move.
    this.vx = fwdX * fwd + rightX * lat;
    this.vz = fwdZ * fwd + rightZ * lat;
    this.forwardSpeed = fwd;

    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    this.x = nx;
    this.z = nz;

    this.collide(world, dt);

    // Visuals.
    this.group.position.set(this.x, this.burning ? U.rand(-0.03, 0.03) : 0, this.z);
    this.group.rotation.y = this.heading;

    this.wheelSpin += fwd * dt * 2.4;
    this.steerVisual = U.damp(this.steerVisual, steer * 0.5, 10, dt);
    for (const wheel of this.group.userData.wheels) {
      wheel.rotation.y = wheel.userData.front ? this.steerVisual : 0;
      wheel.children[0].rotation.x = this.wheelSpin;
      wheel.children[1].rotation.x = this.wheelSpin;
    }

    const roll = U.clamp(-steer * Math.abs(fwd) * 0.006, -0.09, 0.09);
    const pitch = U.clamp((brake ? 0.05 : 0) - throttle * 0.02, -0.05, 0.07);
    this.group.rotation.z = U.damp(this.group.rotation.z, roll, 8, dt);
    this.group.rotation.x = U.damp(this.group.rotation.x, pitch, 8, dt);

    // Siren and damage timers.
    this.honkCooldown = Math.max(0, this.honkCooldown - dt);
    // Brake lights come up under braking, reversing and a handbrake slide. A car down to its last
    // few points of health stutters them, the electrical system going with the engine.
    const tailMats = this.group.userData.tailMats;
    if (tailMats) {
      const lit = brake || handbrake || fwd < -0.4;
      const failing = this.health < this.maxHealth * 0.3 ? (Math.random() < 0.3 ? 0.35 : 1) : 1;
      // A turn indicator blinks that side hard, way past the brake glow, twice a second.
      const blinkOn = Math.floor(performance.now() / 240) % 2 === 0;
      for (let i = 0; i < tailMats.length; i++) {
        const side = i === 0 ? -1 : 1;
        const indicating = blinkOn && this.indicator === side;
        tailMats[i].emissiveIntensity = U.damp(tailMats[i].emissiveIntensity,
          indicating ? 3.2 : (lit ? 2.6 : 0.55) * failing, 12, dt);
      }
    }
    const reverseMat = this.group.userData.reverseMat;
    if (reverseMat) {
      reverseMat.emissiveIntensity = U.damp(reverseMat.emissiveIntensity, fwd < -0.4 ? 2.2 : 0.08, 12, dt);
    }
    // Handbrake smoke off the rear tyres, with the squeal that goes with it.
    if (handbrake && Math.abs(fwd) > 6 && Math.random() < 0.5) {
      world.game?.particles?.tireSmoke(this.x - fwdX * 1.4, this.z - fwdZ * 1.4);
      if (Math.abs(fwd) > 10 && Math.random() < 0.35) world.game?.audio?.screech(this.x, this.z);
    }
    if (this.sirenOn) {
      this.sirenPhase = (this.sirenPhase + dt * 3.4) % 1;
      const bar = this.group.userData.bar;
      if (bar) {
        bar.red.material.emissiveIntensity = this.sirenPhase < 0.5 ? 2.2 : 0.2;
        bar.blue.material.emissiveIntensity = this.sirenPhase < 0.5 ? 0.2 : 2.2;
      }
      const glow = this.group.userData.glow;
      if (glow) {
        glow.material.color.setHex(this.sirenPhase < 0.5 ? 0xff3a2a : 0x2f6bff);
        glow.material.opacity = this.sirenPhase < 0.5 ? 0.2 : 0.1;
      }
    }
    if (this.burning) {
      this.burnTimer += dt;
      if (this.burnTimer > 3.4 && !this.exploded) this.explode(world);
    }
  }

  collide(world, dt) {
    const boxes = world.collidersNear(this.x, this.z, 12);
    for (const box of boxes) {
      const hit = U.resolveCircleBox(this.x, this.z, this.radius, box);
      if (!hit) continue;
      this.x += hit.nx * hit.push;
      this.z += hit.nz * hit.push;
      const into = this.vx * hit.nx + this.vz * hit.nz;
      if (into < 0) {
        const impact = -into;
        this.vx -= hit.nx * into * 1.35;
        this.vz -= hit.nz * into * 1.35;
        this.vx *= 0.72;
        this.vz *= 0.72;
        this.forwardSpeed *= 0.55;
        if (impact > 4 && this.lastImpact <= 0) {
          this.damage(impact * 1.9);
          this.lastImpact = 0.25;
          world.onImpact?.(this, impact);
        }
      }
    }
    this.lastImpact = Math.max(0, this.lastImpact - dt);

    // Keep inside the map.
    const lim = world.limit;
    if (Math.abs(this.x) > lim || this.z > world.city.maxZ || this.z < -lim) {
      this.x = U.clamp(this.x, -lim, lim);
      this.z = U.clamp(this.z, -lim, world.city.maxZ);
      this.vx *= 0.4;
      this.vz *= 0.4;
    }
  }

  damage(amount) {
    if (this.dead || this.burning) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.burning = true;
      this.burnTimer = 0;
    } else if (this.health < this.maxHealth * 0.35) {
      this.smoke();
    }
  }

  smoke() {
    if (this.emitter) return;
    this.emitter = setInterval(() => {
      if (this.dead) { clearInterval(this.emitter); this.emitter = null; return; }
      this.smokePuff();
    }, 160);
  }

  // Called on the smoke timer: a dark plume off the bonnet, louder as the engine fails.
  smokePuff() {
    const parts = this.world?.game?.particles;
    if (!parts) return;
    parts.smoke(this.x + U.rand(-0.3, 0.3), 0.9, this.z + U.rand(-0.3, 0.3), this.health < this.maxHealth * 0.15);
  }

  explode(world) {
    if (this.exploded) return;
    this.exploded = true;
    this.dead = true;
    this.sirenOn = false;
    this.forwardSpeed = 0;
    if (this.emitter) { clearInterval(this.emitter); this.emitter = null; }
    world.explodeAt(this.x, 0.8, this.z, 6.5, 55, this);
    this.group.visible = true;
    this.group.rotation.z = 0;
    this.group.rotation.x = 0;
    // Charred wreck: paint goes soot-black, only the lit lamps keep their colour.
    this.group.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      if (o.material.emissive && o.material.emissive.getHex() !== 0) return;
      o.material = o.material.clone();
      o.material.color.multiplyScalar(0.3);
      o.material.roughness = 0.95;
      o.castShadow = false;
    });
  }

  dispose(scene) {
    if (this.emitter) clearInterval(this.emitter);
    scene.remove(this.group);
  }
}
