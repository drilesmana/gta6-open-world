// Velora Heat — golden-hour light rig. One warm directional sun with shadows,
// a cool sky fill from above, and a soft ambient lift. The main loop can move
// the sun each frame; this module only builds the rig.

import * as THREE from 'three';
import { CONFIG } from './config.js';

// Add the lights to the scene and return the sun light so the caller can move
// it (for example to keep its shadow frustum centred on the player).
export function setupLighting(scene) {
  const p = CONFIG.palette;
  const r = CONFIG.render;

  // Warm low sun, the key light. Shadows on, frustum fitted to the city.
  const sun = new THREE.DirectionalLight(p.sun, 2.8);
  sun.position.set(90, 110, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(r.shadowMapSize, r.shadowMapSize);
  const cam = sun.shadow.camera;
  cam.near = 10;
  cam.far = 420;
  cam.left = -r.shadowExtent;
  cam.right = r.shadowExtent;
  cam.top = r.shadowExtent;
  cam.bottom = -r.shadowExtent;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // Cool sky from above, warm bounce from the ground.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, p.sunGround, 0.9);
  scene.add(hemi);

  // A small warm ambient lift so shadowed faces never go fully black.
  const ambient = new THREE.AmbientLight(0xffe0b3, 0.25);
  scene.add(ambient);

  return sun;
}
