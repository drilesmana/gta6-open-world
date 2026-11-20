// vfx.js — Velora Heat (chunk 2)
// Lightweight particle effects: tyre smoke, sparks, and a small muzzle flash.
// Built from the spec contract only: createVfx(scene) returns an object with
// spawn functions for each effect and an update function that fades them out.
// Sprites share one canvas-generated radial texture (no external files).
// THREE comes from the global loaded by index.html (./vendor/three.min.js).

import { rand } from './util.js';

function three() {
  const T = globalThis.THREE;
  if (!T) throw new Error('THREE global is not loaded — index.html must load ./vendor/three.min.js before main.js');
  return T;
}

function makeGlowTexture() {
  const THREE = three();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createVfx(scene) {
  const THREE = three();
  const texture = makeGlowTexture();
  const particles = []; // { sprite, vel, life, maxLife, grow, fade }

  function spawnSprite(x, y, z, color, size, opacity) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    scene.add(sprite);
    return sprite;
  }

  function addParticle(sprite, vel, life, grow) {
    particles.push({ sprite, vel, life, maxLife: life, grow });
  }

  const vfx = {
    // Soft grey puffs that rise, expand and fade — tyre smoke on handbrake
    // turns and hard launches.
    spawnSmoke(pos, amount) {
      const n = amount || 8;
      const x = pos ? (pos.x || 0) : 0;
      const y = (pos ? (pos.y || 0) : 0) + 0.3;
      const z = pos ? (pos.z || 0) : 0;
      for (let i = 0; i < n; i++) {
        const sprite = spawnSprite(
          x + rand(-0.4, 0.4), y + rand(0, 0.3), z + rand(-0.4, 0.4),
          0x9a9a9a, rand(0.6, 1.0), 0.55,
        );
        addParticle(sprite, { x: rand(-0.4, 0.4), y: rand(0.5, 1.1), z: rand(-0.4, 0.4) }, rand(0.7, 1.2), 1.6);
      }
    },

    // Bright orange flecks that fly out fast and die quickly — collisions.
    spawnSparks(pos, amount) {
      const n = amount || 10;
      const x = pos ? (pos.x || 0) : 0;
      const y = (pos ? (pos.y || 0) : 0) + 0.5;
      const z = pos ? (pos.z || 0) : 0;
      for (let i = 0; i < n; i++) {
        const sprite = spawnSprite(x, y, z, 0xffb03a, rand(0.15, 0.3), 0.95);
        addParticle(sprite, {
          x: rand(-4, 4), y: rand(1, 5), z: rand(-4, 4),
        }, rand(0.25, 0.5), -0.1);
      }
    },

    // One bright flash at a gun barrel / impact point, gone in a blink.
    spawnMuzzleFlash(pos) {
      const x = pos ? (pos.x || 0) : 0;
      const y = (pos ? (pos.y || 0) : 0) + 1.2;
      const z = pos ? (pos.z || 0) : 0;
      const sprite = spawnSprite(x, y, z, 0xffe9a0, 1.1, 1.0);
      addParticle(sprite, { x: 0, y: 0, z: 0 }, 0.12, 2.5);
    },

    // Advance every live particle: move, grow, fade, remove when dead.
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          scene.remove(p.sprite);
          p.sprite.material.dispose();
          particles.splice(i, 1);
          continue;
        }
        p.sprite.position.x += p.vel.x * dt;
        p.sprite.position.y += p.vel.y * dt;
        p.sprite.position.z += p.vel.z * dt;
        const t = p.life / p.maxLife; // 1 at birth, 0 at death
        p.sprite.material.opacity = 0.9 * t;
        const s = p.sprite.scale.x + p.grow * dt;
        p.sprite.scale.setScalar(Math.max(s, 0.05));
      }
    },

    clear() {
      for (const p of particles) {
        scene.remove(p.sprite);
        p.sprite.material.dispose();
      }
      particles.length = 0;
    },

    get count() {
      return particles.length;
    },
  };

  return vfx;
}
