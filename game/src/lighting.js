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

  // Warm directional sun with shadows. The shadow frustum stays tight
  // around the player (followed from main.js via sun.update) so the 2048
  // map reads crisp instead of smeared across the whole 640 m city.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // Follow the player: keep the tight shadow frustum centred on the action.
  // Direction is read back from the current sun position (so sunset/golden
  // moves made elsewhere are respected, not overwritten).
  sun.update = (pos) => {
    if (!pos) return;
    const dir = new THREE.Vector3().copy(sun.position).sub(sun.target.position);
    if (dir.lengthSq() < 1e-6) dir.copy(sunDir);
    dir.normalize();
    const cx = pos.x || 0;
    const cz = pos.z || 0;
    sun.target.position.set(cx, 0, cz);
    sun.target.updateMatrixWorld();
    sun.position.set(cx + dir.x * 300, dir.y * 300, cz + dir.z * 300);
  };

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
