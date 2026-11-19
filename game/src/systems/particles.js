// One pooled particle cloud for the whole game: sparks off a bumper, dust under a sliding car,
// smoke from a dying engine, and the orange bloom of a blast. Points with per-particle colour
// and size, recycled through a fixed ring so nothing allocates mid-chase.
// All effects share a capacity so a large collision cannot allocate one mesh per spark.

import * as U from '../core/util.js';

const THREE = globalThis.THREE;
const MAX = 520;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -500;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float a = smoothstep(0.5, 0.06, length(d));
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Scorch decals, reused in a small ring. One material each: they fade on their own clocks.
    this.decals = [];
    const decalGeo = new THREE.CircleGeometry(1, 14);
    for (let i = 0; i < 8; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x2a2420, transparent: true, opacity: 0.55, depthWrite: false });
      const d = new THREE.Mesh(decalGeo, material);
      d.rotation.x = -Math.PI / 2;
      d.position.y = 0.055;
      d.visible = false;
      scene.add(d);
      this.decals.push(d);
    }
    this.decalCursor = 0;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, gravity = 9, drag = 2.2) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    // The ring recycles: a blast over a full pool overwrites the oldest ember rather than growing.
    if (this.cursor === 0) this.pos[0] = -500;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    const c = this.scratchColor ?? (this.scratchColor = new THREE.Color());
    c.set(color);
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  sparks(x, y, z, n, color = 0xffd27a) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = U.rand(2, 7);
      this.spawn(x, y, z, Math.sin(a) * sp, U.rand(1, 5), Math.cos(a) * sp, color, U.rand(0.035, 0.085), U.rand(0.25, 0.6));
    }
  }

  dust(x, z) {
    this.spawn(x, 0.12, z, U.rand(-0.6, 0.6), U.rand(0.2, 0.8), U.rand(-0.6, 0.6), 0xd8c8ac, 0.16, 0.7, 0.4, 1.6);
  }

  // Rubber off a locked rear tyre: grey, low and heavier than grit dust.
  tireSmoke(x, z) {
    this.spawn(x + U.rand(-0.4, 0.4), 0.25, z + U.rand(-0.4, 0.4),
      U.rand(-0.5, 0.5), U.rand(0.4, 1.0), U.rand(-0.5, 0.5), 0xbdb6ab, U.rand(0.14, 0.26), U.rand(0.5, 1.0), 0.6, 1.2);
  }

  // A short puff at the muzzle so a shot reads from any camera angle.
  muzzle(x, y, z) {
    this.spawn(x, y, z, U.rand(-0.6, 0.6), U.rand(0.1, 0.5), U.rand(-0.6, 0.6), 0xffd9a0, 0.09, 0.18, 1.2, 3.4);
  }

  smoke(x, y, z, dark = false) {
    this.spawn(x, y, z, U.rand(-0.35, 0.35), U.rand(0.6, 1.4), U.rand(-0.35, 0.35),
      dark ? 0x4a4744 : 0xb9b3aa, U.rand(0.16, 0.32), U.rand(0.7, 1.5), -0.4, 0.8);
  }

  burst(x, y, z, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = U.rand(0.2, 1);
      const sp = U.rand(3, 13);
      this.spawn(x, y, z, Math.sin(a) * sp * (1 - up * 0.5), up * 9, Math.cos(a) * sp * (1 - up * 0.5),
        color, U.rand(0.05, 0.16), U.rand(0.4, 1.1), 7, 1.4);
    }
  }

  scorch(x, z) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.position.set(x, 0.055, z);
    d.scale.setScalar(U.rand(1.8, 2.6));
    d.visible = true;
    // Each mark carries its own age so the oldest burns off instead of stacking forever.
    d.userData.age = 0;
    d.material.opacity = 0.55;
  }

  update(dt) {
    for (const d of this.decals) {
      if (!d.visible) continue;
      d.userData.age = (d.userData.age ?? 0) + dt;
      const left = 1 - d.userData.age / 40;
      if (left <= 0) { d.visible = false; continue; }
      d.material.opacity = 0.55 * Math.min(1, left * 2);
    }
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -500;
        continue;
      }
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 2] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp - this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.04) {
        this.pos[i * 3 + 1] = 0.04;
        this.vel[i * 3 + 1] *= -0.25;
      }
      const fade = this.life[i] / this.maxLife[i];
      this.size[i] = Math.max(0.01, this.size[i] * (0.995 - (1 - fade) * 0.04));
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.psize.needsUpdate = true;
  }
}
