// Velora Heat — lighting rig and environment map.
// Readable stack (authoring-recipes.md): warm low key sun with real shadows,
// hemisphere fill so gameplay objects stay legible, and a small PMREM environment
// baked from a hand-built scene so car paint and glass have something to reflect.
// The shadow camera follows the player so its 2048 map stays dense where it matters.
import { PALETTE } from './config.js';

export function createLighting(scene, renderer) {
  // Sun: low western golden-hour key light.
  const sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.0);
  sun.position.set(-140, 62, 108);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);
  scene.add(sun.target);

  // Warm hemisphere fill: sky bounce above, warm ground bounce below.
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.85);
  scene.add(hemi);

  // Cool eastern fill: a faint, shadowless lift from the opposite side of
  // the sun, so the shaded faces of buildings keep a little modelling
  // instead of going flat and dead.
  const fill = new THREE.DirectionalLight(0x8fa8cc, 0.35);
  fill.position.set(120, 40, -80);
  scene.add(fill);
  scene.add(fill.target);

  // Small PMREM environment, baked from a tiny authored scene (no HDR file,
  // no RoomEnvironment import): a warm sky gradient, a bright sun card and a
  // cool ground card, so PBR paint and glass read instead of going flat grey.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const grad = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide,
    }),
  );
  const pos = grad.geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x8fa8cc);
  const mid = new THREE.Color(0xffc98f);
  const bot = new THREE.Color(0x5a4030);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    if (y > 0.25) tmp.copy(mid).lerp(top, (y - 0.25) / 0.75);
    else if (y > -0.15) tmp.copy(bot).lerp(mid, (y + 0.15) / 0.4);
    else tmp.copy(bot);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  grad.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  envScene.add(grad);
  const sunCard = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
  );
  sunCard.position.set(-30, 14, 22);
  sunCard.lookAt(0, 0, 0);
  envScene.add(sunCard);
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  return {
    sun,
    hemi,
    // Keep the shadow frustum centred on the focus point (the player).
    follow(x, z) {
      sun.position.set(x - 140, 62, z + 108);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    },
  };
}
