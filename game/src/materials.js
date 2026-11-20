// Velora Heat — shared materials. Created once and reused by every module so
// the game keeps one material per surface instead of one per mesh.

import * as THREE from 'three';
import { CONFIG } from './config.js';

// Build the full material dictionary. Call once at startup and pass the result
// to every module that builds meshes.
export function makeMaterials() {
  const p = CONFIG.palette;

  // Helper: a standard PBR material with a flat colour.
  function std(color, roughness, metalness) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: roughness === undefined ? 0.85 : roughness,
      metalness: metalness === undefined ? 0.0 : metalness,
    });
  }

  const mats = {
    // Streets and pavements.
    asphalt: std(p.asphalt, 0.95, 0.0),
    roadLine: new THREE.MeshBasicMaterial({ color: 0xf2ead2 }),
    sidewalk: std(p.sidewalk, 0.95, 0.0),
    kerb: std(p.kerb, 0.9, 0.0),
    crosswalk: new THREE.MeshBasicMaterial({ color: 0xd8d2c4 }),

    // Buildings. Walls are tinted per building at build time by cloning.
    buildingWallCream: std(0xe8dcc0, 0.9, 0.0),
    buildingWallTerra: std(0xc97e5a, 0.9, 0.0),
    buildingWallTeal: std(0x4d8a86, 0.9, 0.0),
    buildingWallSand: std(0xd9b380, 0.9, 0.0),
    buildingWallSlate: std(0x5a6672, 0.9, 0.0),
    buildingGlass: new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.15,
      metalness: 0.6,
    }),
    roof: std(0x4a4440, 0.95, 0.0),
    garageDoor: std(0x3d6b8e, 0.6, 0.3),
    garageSign: new THREE.MeshBasicMaterial({ color: p.gold }),

    // Street furniture.
    lampPole: std(0x2a2e33, 0.5, 0.7),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffe6a8 }),
    benchWood: std(0x7a5230, 0.9, 0.0),
    planter: std(0x5d6b4f, 0.95, 0.0),
    treeTrunk: std(0x6b4a2f, 0.95, 0.0),
    treeLeaf: std(0x4e7a3a, 0.9, 0.0),
    hydrant: std(0xc23b2a, 0.6, 0.2),

    // Cars. Paint is glossy, glass is dark and reflective, tyres matte.
    carRed: std(0xb03030, 0.25, 0.4),
    carBlue: std(0x2f5fb0, 0.25, 0.4),
    carYellow: std(0xe0a52a, 0.25, 0.4),
    carWhite: std(0xe8e6df, 0.25, 0.4),
    carBlack: std(0x1c1e22, 0.25, 0.4),
    carTeal: std(p.teal, 0.25, 0.4),
    carGold: new THREE.MeshStandardMaterial({
      color: p.gold,
      roughness: 0.15,
      metalness: 0.9,
    }),
    carPolice: std(0xe8e8e8, 0.25, 0.4),
    carPoliceBlue: std(0x1c4ed8, 0.25, 0.4),
    tyre: std(0x17181a, 0.95, 0.0),
    wheelHub: std(0x9aa0a6, 0.35, 0.8),
    carWindow: new THREE.MeshStandardMaterial({
      color: 0x10161f,
      roughness: 0.1,
      metalness: 0.7,
    }),
    headlight: new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
    taillight: new THREE.MeshBasicMaterial({ color: 0xd42a1e }),
    policeLightRed: new THREE.MeshBasicMaterial({ color: 0xff2a1e }),
    policeLightBlue: new THREE.MeshBasicMaterial({ color: 0x2a5bff }),

    // People.
    skinA: std(0xc98d64, 0.7, 0.0),
    skinB: std(0x8a5a38, 0.7, 0.0),
    skinC: std(0xe8b98d, 0.7, 0.0),
    shirtCoral: std(p.coral, 0.85, 0.0),
    shirtTeal: std(p.teal, 0.85, 0.0),
    shirtCream: std(p.cream, 0.85, 0.0),
    shirtNavy: std(0x2a3a55, 0.85, 0.0),
    shirtGold: std(p.gold, 0.85, 0.0),
    pantsDark: std(0x2e3440, 0.9, 0.0),
    pantsBlue: std(0x3a4a6b, 0.9, 0.0),

    // Player outfit: Dario wears a coral shirt and dark trousers.
    playerShirt: std(p.coral, 0.85, 0.0),
    playerPants: std(0x232830, 0.9, 0.0),
    playerHair: std(0x1e1a16, 0.9, 0.0),

    // Ground far outside the city, and the sea at the bay edge.
    ground: std(0x7d7466, 1.0, 0.0),
    sand: std(0xdcc49a, 1.0, 0.0),
    sea: new THREE.MeshStandardMaterial({
      color: 0x2a6f8f,
      roughness: 0.25,
      metalness: 0.1,
    }),
  };

  return mats;
}

// The car paint colours the vehicle factory can use, keyed by name.
export const CAR_PAINTS = [
  'carRed',
  'carBlue',
  'carYellow',
  'carWhite',
  'carBlack',
  'carTeal',
];
