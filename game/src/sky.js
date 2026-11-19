// Velora Heat — sky dome, sun and clouds.
// A gradient sky dome (cookbook recipe) is cheaper than a cubemap and reads
// golden-hour by construction: warm horizon, dusky blue top, sun disc + halo.
// Authored in display space; ACES tone mapping brightens it slightly.
import { PALETTE } from './config.js';

export function createSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color(PALETTE.skyTop) },
    uMid: { value: new THREE.Color(PALETTE.skyMid) },
    uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    uSunColor: { value: new THREE.Color(PALETTE.sun) },
    // Low western sun, matching the directional light.
    uSunDir: { value: new THREE.Vector3(-0.55, 0.24, 0.42).normalize() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTop, uMid, uHorizon, uSunColor, uSunDir;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.45, 0.72, h));
          col = mix(col, uTop, smoothstep(0.7, 1.0, h));
          float d = clamp(dot(normalize(vDir), normalize(uSunDir)), 0.0, 1.0);
          col += uSunColor * (pow(d, 900.0) * 1.4 + pow(d, 10.0) * 0.32 + pow(d, 2.0) * 0.1);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // A few soft clouds: flattened white blobs drifting slowly, far above the city.
  // Two extra puffs over the marina and the north end so the sky reads
  // full from the beach and the rooftops alike.
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffe8d0, roughness: 1, transparent: true, opacity: 0.85,
    emissive: 0xff9a5e, emissiveIntensity: 0.25,
  });
  const cloudGeo = new THREE.SphereGeometry(1, 12, 8);
  const clouds = new THREE.Group();
  const spots = [
    [-260, 150, -320, 42, 9, 18], [180, 170, -360, 55, 11, 22], [320, 140, 120, 48, 10, 20],
    [-80, 180, 300, 60, 12, 24], [40, 160, -240, 36, 8, 16], [-340, 150, 60, 50, 10, 20],
    [140, 165, 320, 52, 10, 21], [-180, 175, -180, 44, 9, 19],
  ];
  for (const [x, y, z, sx, sy, sz] of spots) {
    const puff = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set((i - 1.5) * sx * 0.42, (i % 2) * 2.5, (i % 3 - 1) * 4);
      m.scale.set(sx * (0.5 + 0.14 * i), sy, sz * 0.5);
      puff.add(m);
    }
    puff.position.set(x, y, z);
    clouds.add(puff);
  }
  scene.add(clouds);
  return { sky, clouds, uniforms };
}
