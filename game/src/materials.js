// Velora Heat — shared materials, created once and reused by every module.
import * as THREE from '../vendor/three.min.js';
import { CONFIG } from './config.js';

// Procedural speckle texture: breaks up flat colour on large flat planes
// (grass here — road boxes share one material across both orientations, so a
// repeating map would stretch; roads get dashes/crosswalks instead).
function makeNoiseTexture(base, speckles, size, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = speckles[i % speckles.length];
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeMaterials() {
  const p = CONFIG.palette;
  const std = (opts) => new THREE.MeshStandardMaterial(opts);
  const grassTex = makeNoiseTexture('#5d8a4a', ['#527c40', '#688f54', '#4a7038', '#74985f'], 256, 32);

  return {
    // Ground and street
    asphalt: std({ color: 0x33363d, roughness: 0.95, metalness: 0.0 }),
    sidewalk: std({ color: 0x9a938a, roughness: 0.9, metalness: 0.0 }),
    kerb: std({ color: 0x6f6a63, roughness: 0.85, metalness: 0.0 }),
    sand: std({ color: 0xd9c49a, roughness: 1.0, metalness: 0.0 }),
    grass: std({ map: grassTex, color: 0xffffff, roughness: 1.0, metalness: 0.0 }),

    // Buildings
    wall: std({ color: 0xe8dcc8, roughness: 0.85, metalness: 0.0 }),
    wallWarm: std({ color: 0xe0b98f, roughness: 0.85, metalness: 0.0 }),
    wallWhite: std({ color: 0xf2ede4, roughness: 0.8, metalness: 0.0 }),
    wallTeal: std({ color: 0x7fb5ac, roughness: 0.85, metalness: 0.0 }),
    glass: std({ color: 0x2a4a5e, roughness: 0.15, metalness: 0.6 }),
    glassLit: std({ color: 0xffc46b, roughness: 0.2, metalness: 0.3, emissive: 0x664411, emissiveIntensity: 0.6 }),
    roof: std({ color: 0x8a4a3a, roughness: 0.9, metalness: 0.0 }),
    roofFlat: std({ color: 0x55565c, roughness: 0.95, metalness: 0.0 }),

    // Street furniture
    lamp: std({ color: 0x2c2f36, roughness: 0.5, metalness: 0.7 }),
    lampGlow: std({ color: 0xffe9b0, emissive: 0xffc46b, emissiveIntensity: 1.4, roughness: 0.4 }),
    metal: std({ color: 0x8f959e, roughness: 0.35, metalness: 0.8 }),
    wood: std({ color: 0x7a5230, roughness: 0.9, metalness: 0.0 }),
    leaf: std({ color: 0x3f7a44, roughness: 1.0, metalness: 0.0 }),
    trunk: std({ color: 0x5a4128, roughness: 1.0, metalness: 0.0 }),

    // Cars — paint in several colours. Metalness kept low on purpose: with
    // no environment map (removed in r14 for headless speed), high metalness
    // only darkens the paint; sun + hemisphere give the sheen instead.
    paintRed: std({ color: 0xc22e2e, roughness: 0.3, metalness: 0.25 }),
    paintBlue: std({ color: 0x2e5ec2, roughness: 0.3, metalness: 0.25 }),
    paintYellow: std({ color: 0xe8b820, roughness: 0.3, metalness: 0.25 }),
    paintWhite: std({ color: 0xe8e6e0, roughness: 0.3, metalness: 0.2 }),
    paintBlack: std({ color: 0x1a1c20, roughness: 0.25, metalness: 0.3 }),
    paintTeal: std({ color: p.teal, roughness: 0.3, metalness: 0.25 }),
    paintCoral: std({ color: p.coral, roughness: 0.3, metalness: 0.25 }),
    paintGold: std({ color: p.gold, roughness: 0.2, metalness: 0.35 }),
    paintPolice: std({ color: 0xf0f0f0, roughness: 0.3, metalness: 0.2 }),
    paintPoliceBlue: std({ color: 0x1e3fae, roughness: 0.3, metalness: 0.25 }),

    // Car parts
    tyre: std({ color: 0x141518, roughness: 1.0, metalness: 0.0 }),
    window: std({ color: 0x18242e, roughness: 0.1, metalness: 0.7 }),
    headlight: std({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 1.2, roughness: 0.2 }),
    taillight: std({ color: 0xc21818, emissive: 0x881111, emissiveIntensity: 0.8, roughness: 0.3 }),
    chrome: std({ color: 0xd8dce2, roughness: 0.25, metalness: 0.6 }),

    // People
    skin: std({ color: 0xc98e6b, roughness: 0.7, metalness: 0.0 }),
    skinDark: std({ color: 0x8a5a3b, roughness: 0.7, metalness: 0.0 }),
    shirt: std({ color: 0x3e6fb0, roughness: 0.85, metalness: 0.0 }),
    shirtRed: std({ color: 0xb03e3e, roughness: 0.85, metalness: 0.0 }),
    shirtGreen: std({ color: 0x3e8a5a, roughness: 0.85, metalness: 0.0 }),
    pants: std({ color: 0x2e3440, roughness: 0.9, metalness: 0.0 }),
    hair: std({ color: 0x241a12, roughness: 0.95, metalness: 0.0 }),
  };
}
