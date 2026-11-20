// Velora Heat — gradient sky dome, low sun disc, drifting clouds.
import * as THREE from '../vendor/three.min.js';
import { CONFIG } from './config.js';
import { rand } from './util.js';

export function createSky(scene) {
  // Gradient dome: warm orange at the horizon, deep blue up top.
  // Built as a function so setMode can swap the whole sky (sunset vs golden).
  function paintGradient(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const goldenStops = [
    [0.0, '#2e4a7a'], [0.45, '#7a9cc4'], [0.7, '#f2a56b'], [0.85, '#ff9e5e'], [1.0, '#ffc46b'],
  ];
  const sunsetStops = [
    [0.0, '#1c2340'], [0.4, '#5a3a6a'], [0.65, '#c65a6a'], [0.85, '#ff7a4a'], [1.0, '#ffb35e'],
  ];
  const goldenTex = paintGradient(goldenStops);
  const sunsetTex = paintGradient(sunsetStops);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: goldenTex, side: THREE.BackSide, fog: false }),
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

  // Swap the whole sky between golden hour and sunset: dome gradient, sun
  // disc/glow colour and size, and cloud tint. Called from __velora
  // setSunset/setGolden (main.js); the dome covers scene.background, so
  // changing only the background colour would never be visible.
  function setMode(mode) {
    if (mode === 'sunset') {
      dome.material.map = sunsetTex;
      sunDisc.material.color.set(0xffd27a);
      sunDisc.scale.setScalar(1.35);
      sunGlow.material.color.set(0xff7a4a);
      sunGlow.material.opacity = 0.5;
      sunGlow.scale.setScalar(1.3);
      cloudMat.color.set(0xffd0b0);
    } else {
      dome.material.map = goldenTex;
      sunDisc.material.color.set(0xfff0b0);
      sunDisc.scale.setScalar(1);
      sunGlow.material.color.set(0xffb36b);
      sunGlow.material.opacity = 0.35;
      sunGlow.scale.setScalar(1);
      cloudMat.color.set(0xfff4e0);
    }
    dome.material.needsUpdate = true;
  }

  return { update, setMode };
}
