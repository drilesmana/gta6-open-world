import * as THREE from 'three';

// Particle effects for Velora Heat: tyre smoke, sparks and a small muzzle
// flash. One pool of sprites is reused so nothing is allocated per frame.
// The soft round sprite texture is a DataTexture computed in code, so the
// module loads in Node (no canvas, no DOM) as well as in the browser.

const POOL = 90;

function softTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = Math.max(0, 1 - r);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

// createVfx(scene): returns the effects object with spawn functions
// smoke(pos, count), sparks(pos, count), flash(pos), an update(dt) that
// fades particles out, and alive (how many particles are currently lit).
export function createVfx(scene) {
  const tex = softTexture();
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      color: 0xffffff,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.set(1, 1, 1);
    scene.add(sprite);
    pool.push({
      sprite,
      material,
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      size0: 1,
      size1: 1,
      grav: 0,
      active: false,
    });
  }

  function spawn(pos, opts) {
    let p = null;
    for (const cand of pool) {
      if (!cand.active) {
        p = cand;
        break;
      }
    }
    if (!p) return;
    p.active = true;
    p.sprite.visible = true;
    p.sprite.position.set(pos.x, pos.y, pos.z);
    p.vel.set(
      (Math.random() - 0.5) * (opts.spread || 1),
      (opts.up || 0) + (Math.random() - 0.5) * (opts.spread || 1) * 0.6,
      (Math.random() - 0.5) * (opts.spread || 1),
    );
    p.life = opts.life;
    p.maxLife = opts.life;
    p.size0 = opts.size0;
    p.size1 = opts.size1;
    p.grav = opts.grav || 0;
    p.material.color.setHex(opts.color);
    p.material.opacity = opts.opacity ?? 0.85;
    p.sprite.scale.set(opts.size0, opts.size0, 1);
  }

  const vfx = {
    pool,
    alive: 0,

    smoke(pos, count = 6) {
      for (let i = 0; i < count; i++) {
        spawn(pos, {
          color: 0x9a9a9a,
          life: 0.7 + Math.random() * 0.4,
          size0: 0.5,
          size1: 1.7,
          spread: 0.8,
          up: 1.1,
          grav: 0.6,
          opacity: 0.5,
        });
      }
    },

    sparks(pos, count = 10) {
      for (let i = 0; i < count; i++) {
        spawn(pos, {
          color: Math.random() < 0.5 ? 0xffb020 : 0xff7a1a,
          life: 0.25 + Math.random() * 0.25,
          size0: 0.22,
          size1: 0.1,
          spread: 6,
          up: 2.5,
          grav: -9,
          opacity: 0.95,
        });
      }
    },

    flash(pos) {
      spawn(pos, {
        color: 0xfff3b0,
        life: 0.16,
        size0: 0.6,
        size1: 2.4,
        spread: 0.2,
        up: 0,
        grav: 0,
        opacity: 1,
      });
    },

    update(dt) {
      let alive = 0;
      for (const p of pool) {
        if (!p.active) continue;
        alive++;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          p.sprite.visible = false;
          p.material.opacity = 0;
          continue;
        }
        p.vel.y += p.grav * dt;
        p.sprite.position.x += p.vel.x * dt;
        p.sprite.position.y += p.vel.y * dt;
        p.sprite.position.z += p.vel.z * dt;
        const t = 1 - p.life / p.maxLife;
        const size = p.size0 + (p.size1 - p.size0) * t;
        p.sprite.scale.set(size, size, 1);
        p.material.opacity = (p.life / p.maxLife) * 0.85;
      }
      this.alive = alive;
    },
  };

  return vfx;
}
