// Velora Heat — gradient sky dome, low sun disc, drifting clouds.
import * as THREE from '../vendor/three.min.js';
import { CONFIG } from './config.js';
import { rand } from './util.js';

export function createSky(scene) {
  // Gradient dome: warm orange at the horizon, deep blue up top.
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2e4a7a');
  grad.addColorStop(0.45, '#7a9cc4');
  grad.addColorStop(0.7, '#f2a56b');
  grad.addColorStop(0.85, '#ff9e5e');
  grad.addColorStop(1.0, '#ffc46b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);

  // Sun disc low over the sea, matching the lighting direction.
  const elev = (CONFIG.sunElevation * Math.PI) / 180;
  const azim = (CONFIG.sunAzimuth * Math.PI) / 180;
  const sunPos = new THREE.Vector3(
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.cos(azim),
  ).multiplyScalar(820);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff0b0, fog: false }),
  );
  sunDisc.position.copy(sunPos);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(80, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffb36b, fog: false, transparent: true, opacity: 0.35,
    }),
  );
  sunGlow.position.copy(sunPos).multiplyScalar(0.999);
  sunGlow.lookAt(0, 0, 0);
  scene.add(sunGlow);

  // A few soft drifting clouds made of flattened white blobs.
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xfff4e0, transparent: true, opacity: 0.85, fog: false,
  });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(rand(0, 3));
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(14, 26), 8, 6), cloudMat);
      puff.position.set(rand(-30, 30), rand(-4, 4), rand(-10, 10));
      puff.scale.y = 0.45;
      group.add(puff);
    }
    group.position.set(rand(-500, 500), rand(150, 260), rand(-500, 500));
    group.userData.speed = rand(1.5, 4);
    scene.add(group);
    clouds.push(group);
  }

  function update(dt) {
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 560) cloud.position.x = -560;
    }
  }

  return { update };
}
