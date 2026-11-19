// Velora Heat — event-driven VFX, pooled and cheap (technical-art.md).
// One Points cloud for sparks/dust (a single draw call), one pool of fading
// skid-mark planes, and one pool of expanding impact rings. Nothing allocates
// per frame except the pooled buffers' updates.
import { rand } from './util.js';

const MAX_PARTICLES = 420;

export class Vfx {
  constructor(scene) {
    this.scene = scene;
    // Particle pool: positions + velocities + life, rendered as Points.
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.35, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX_PARTICLES; i++) this.pos[i * 3 + 1] = -100;

    // Skid marks: fading dark planes, pooled.
    this.skids = [];
    const skidGeo = new THREE.PlaneGeometry(0.35, 1.6);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({
        color: 0x141210, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.skids.push({ mesh: m, life: 0 });
    }
    this.skidHead = 0;

    // Impact rings: expanding flat rings, pooled.
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.4, 0.55, 24);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1 });
    }
    this.ringHead = 0;
  }

  spawn(x, y, z, n, color, speed = 4, up = 3, life = 0.7, gravity = 6) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX_PARTICLES;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.9);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
      this.grav[i] = gravity;
    }
  }

  sparks(x, y, z) { this.spawn(x, y, z, 18, 0xffc46b, 6, 4, 0.5, 9); }
  dust(x, y, z, n = 6) { this.spawn(x, y, z, n, 0xcbb894, 1.6, 1.2, 0.9, -0.5); }
  cashBurst(x, y, z) {
    this.spawn(x, y, z, 26, 0x8fce6a, 4, 5, 0.9, 7);
    // A gold ring under the burst so the payout reads as a celebration, not just sparks.
    this.ring(x, 0.15, z, 0x8fce6a, 0.8);
  }
  smoke(x, y, z, n = 10) { this.spawn(x, y, z, n, 0x555550, 1.2, 2.2, 1.4, -1); }

  skid(x, y, z, yaw) {
    const s = this.skids[this.skidHead];
    this.skidHead = (this.skidHead + 1) % this.skids.length;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.z = -yaw;
    s.mesh.visible = true;
    s.mesh.material.opacity = 0.55;
    s.life = 4;
  }

  ring(x, y, z, color = 0xffc46b, max = 1) {
    const r = this.rings[this.ringHead];
    this.ringHead = (this.ringHead + 1) % this.rings.length;
    r.mesh.position.set(x, y, z);
    r.mesh.material.color.setHex(color);
    r.mesh.visible = true;
    r.life = r.max = max;
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -100;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) {
        this.pos[i * 3 + 1] = 0.05;
        this.vel[i * 3 + 1] *= -0.3;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const s of this.skids) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 4) * 0.55;
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life -= dt;
      const p = 1 - Math.max(0, r.life) / r.max;
      const sc = 1 + p * 7;
      r.mesh.scale.set(sc, sc, sc);
      r.mesh.material.opacity = (1 - p) * 0.8;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}
