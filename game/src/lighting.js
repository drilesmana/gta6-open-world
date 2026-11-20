// Velora Heat — golden-hour lighting: warm low sun, cool sky fill.
import * as THREE from '../vendor/three.min.js';
import { CONFIG } from './config.js';

export function setupLighting(scene) {
  const elev = (CONFIG.sunElevation * Math.PI) / 180;
  const azim = (CONFIG.sunAzimuth * Math.PI) / 180;
  const sunDir = new THREE.Vector3(
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.cos(azim),
  );

  // Warm directional sun with shadows.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Cool sky fill from above.
  const hemi = new THREE.HemisphereLight(0x8fb8d8, 0x5a4632, 0.9);
  scene.add(hemi);

  // Soft ambient so shadowed faces never go black.
  const ambient = new THREE.AmbientLight(0xffe0b8, 0.35);
  scene.add(ambient);

  // Warm haze toward the horizon.
  scene.fog = new THREE.Fog(0xf2b98a, CONFIG.fogNear, CONFIG.fogFar);

  return sun;
}
