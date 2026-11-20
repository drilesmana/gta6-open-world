// Velora Heat — the sky: a gradient dome, a low golden sun disc, and a few
// slow clouds drifting over the bay. Pure backdrop, no gameplay logic.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, randInt } from './util.js';

// Build a vertical gradient texture on a canvas: warm cream at the horizon
// rising into soft blue at the top.
function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#7fb2e8');
  grad.addColorStop(0.45, '#a8c8e8');
  grad.addColorStop(0.72, '#ffd9a3');
  grad.addColorStop(1.0, '#ffcf8e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Add the sky to the scene. Returns an object with an update function that
// advances the clouds; call it every frame with the delta time in seconds.
export function createSky(scene) {
  const p = CONFIG.palette;

  // Dome: a huge sphere seen from the inside, gradient texture, no lighting.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(760, 24, 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      fog: false,
    }),
  );
  dome.position.y = 0;
  scene.add(dome);

  // Low sun disc in the direction of the key light, warm and unlit.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }),
  );
  sunDisc.position.set(420, 190, 260);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // A soft halo around the sun disc.
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(62, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffe0a0,
      transparent: true,
      opacity: 0.28,
      fog: false,
    }),
  );
  halo.position.copy(sunDisc.position).multiplyScalar(0.999);
  halo.lookAt(0, 0, 0);
  scene.add(halo);

  // Clouds: flat clusters of white spheres, drifting slowly on the wind.
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    fog: false,
  });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const group = new THREE.Group();
    const puffs = randInt(3, 5);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(9, 18), 10, 8), cloudMat);
      puff.position.set(rand(-22, 22), rand(-2, 3), rand(-8, 8));
      puff.scale.y = 0.45;
      group.add(puff);
    }
    group.position.set(rand(-520, 520), rand(120, 210), rand(-520, 520));
    group.userData.drift = rand(1.2, 2.6);
    scene.add(group);
    clouds.push(group);
  }

  function update(dt) {
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 560) cloud.position.x = -560;
    }
  }

  return { update, dome, sunDisc, clouds };
}
