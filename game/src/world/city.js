// Marisol Bay: a sun-bleached coastal grid of pastel towers, low shop rows, a park, a beach and
// a container pier. Everything is generated from a fixed seed so the map, the save file and the
// minimap always agree. The builder returns the collision boxes, the road graph the traffic and
// police drive, the mission anchors and a baked minimap.
// Keep geometry generation independent of the current player or the saved position may no longer be traversable.

import * as U from '../core/util.js';
import * as TEX from './textures.js';
import { buildProps } from './props.js';

const THREE = globalThis.THREE;

export const CITY = {
  seed: 0x5a17c0de,
  cells: 6,
  cell: 52,
  roadHalf: 8,
  blockHalf: 18,
  sidewalks: 150,
};

CITY.extent = CITY.cells * CITY.cell;
CITY.limit = CITY.extent / 2;

export const BLOCK_TYPES = {
  shops: 'Low-rise shop rows with awnings and signs.',
  towers: 'Downtown towers with spires and lit crowns.',
  park: 'Green space with trees and a fountain.',
  lot: 'Open asphalt parking with bay stripes.',
};

const PALETTES = [
  { name: 'coral', wall: '#e8a487', accent: '#c85f4b', roof: '#a3766a' },
  { name: 'mint', wall: '#a8d3c2', accent: '#3f8f7c', roof: '#8a9c8e' },
  { name: 'cream', wall: '#f0e2c4', accent: '#d9a441', roof: '#b0a08a' },
  { name: 'lilac', wall: '#cfc0da', accent: '#7d5f95', roof: '#94879f' },
  { name: 'sky', wall: '#b6cfe0', accent: '#487e9e', roof: '#8899a5' },
  { name: 'sand', wall: '#e6d3b0', accent: '#b9803f', roof: '#a99a7f' },
  { name: 'rose', wall: '#e9bdbd', accent: '#b05f6d', roof: '#9c8185' },
];

const SIGNS = [
  ['LAUNDRY', '#f2e6cf', '#2b6e8a'],
  ['TACOS', '#e04f3c', '#fff3dc'],
  ['BODEGA', '#2f7f61', '#fdf3d9'],
  ['NEON', '#251d33', '#f27bd8'],
  ['CASH', '#f5c518', '#2a2318'],
  ['DINER', '#f4efe3', '#c8412f'],
  ['SURF', '#2b8fa5', '#f6f0dd'],
  ['MOTEL', '#c93f5a', '#fff0d6'],
];

export function buildCity(scene) {
  const rng = U.makeRng(CITY.seed);
  const colliders = [];
  const roadNodes = [];
  const roadEdges = [];
  const missionSpots = {};
  const lotAnchors = [];

  const addBox = (minX, minZ, maxX, maxZ, height = 3) => {
    const box = { minX, minZ, maxX, maxZ, height };
    colliders.push(box);
    return box;
  };

  // --- ground -----------------------------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x8d8377, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  const roadTex = TEX.roadTexture();
  const walkTex = TEX.sidewalkTexture();
  // The ribbons are unit planes scaled to their length, so each needs its own repeat or the
  // asphalt smears into one soft grey band.
  const tiled = (tex, rx, ry) => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return t;
  };
  const roadMatX = new THREE.MeshStandardMaterial({ map: tiled(roadTex, 1, 26), roughness: 0.95 });
  const roadMatZ = new THREE.MeshStandardMaterial({ map: tiled(roadTex, 26, 1), roughness: 0.95 });
  const walkMatTile = new THREE.MeshStandardMaterial({ map: tiled(walkTex, 5, 5), roughness: 0.9 });

  // --- road ribbons and intersection slabs ------------------------------------------------
  const roadGeom = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i <= CITY.cells; i++) {
    const p = -CITY.limit + i * CITY.cell;
    for (const axis of ['x', 'z']) {
      const len = CITY.extent + CITY.cell;
      const m = new THREE.Mesh(roadGeom, axis === 'x' ? roadMatZ : roadMatX);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(CITY.roadHalf * 2, len, 1);
      if (axis === 'x') m.position.set(p, 0, 0);
      else { m.rotation.z = Math.PI / 2; m.position.set(0, 0, p); }
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // --- crosswalks on the intersection aprons --------------------------------------------
  const crossTex = TEX.crosswalkTexture();
  const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.95, transparent: true });
  const crossGeom = new THREE.PlaneGeometry(1, 1);
  for (let i = 1; i < CITY.cells; i++) {
    for (let j = 1; j < CITY.cells; j++) {
      const px = -CITY.limit + i * CITY.cell;
      const pz = -CITY.limit + j * CITY.cell;
      for (const side of [-1, 1]) {
        for (const axis of [0, 1]) {
          const m = new THREE.Mesh(crossGeom, crossMat);
          m.rotation.x = -Math.PI / 2;
          if (axis === 0) {
            m.scale.set(CITY.roadHalf * 1.8, 4, 1);
            m.position.set(px, 0.045, pz + side * (CITY.roadHalf + 2.2));
            m.rotation.z = Math.PI / 2;
          } else {
            m.scale.set(CITY.roadHalf * 1.8, 4, 1);
            m.position.set(px + side * (CITY.roadHalf + 2.2), 0.045, pz);
          }
          scene.add(m);
        }
      }
    }
  }

  // --- blocks: sidewalk pad, buildings, or a park / lot -----------------------------------
  const walkMat = walkMatTile;
  const blockGeom = new THREE.PlaneGeometry(1, 1);
  const buildingGeom = new THREE.BoxGeometry(1, 1, 1);

  const facadeMats = PALETTES.map((p) =>
    new THREE.MeshStandardMaterial({ map: TEX.facadeTexture(p, 7), roughness: 0.82 }));
  const facadeMatsLow = PALETTES.map((p) =>
    new THREE.MeshStandardMaterial({ map: TEX.facadeTexture(p, 3, true), roughness: 0.85 }));
  const roofMats = PALETTES.map((p) =>
    new THREE.MeshStandardMaterial({ map: TEX.roofTexture(p.roof), roughness: 0.95 }));
  const signMats = SIGNS.map(([text, bg, fg]) =>
    new THREE.MeshStandardMaterial({ map: TEX.signTexture(text, bg, fg), emissive: 0x222222, roughness: 0.6 }));

  const skylineSlabs = [];
  const beachFront = [];

  // Landmarks are placed before the blocks so the block that holds one can keep its footprint
  // clear: a garage with a tower grown through it is not a garage.
  const beachZ = CITY.limit + 12;
  const anchors = {
    garage: { x: -CITY.limit + 70, z: -CITY.limit + 70 },
    tower: { x: CITY.limit - 60, z: -CITY.limit + 60 },
    cafe: { x: 44, z: beachZ + 4 },
    market: { x: CITY.limit - 70, z: 60 },
    radio: { x: CITY.limit - 40, z: -CITY.limit + 30 },
  };
  const blockOf = (p) => `${Math.floor((p.x + CITY.limit) / CITY.cell)},${Math.floor((p.z + CITY.limit) / CITY.cell)}`;
  const reserved = new Set([blockOf(anchors.garage), blockOf(anchors.market), blockOf(anchors.radio)]);

  for (let bx = 0; bx < CITY.cells; bx++) {
    for (let bz = 0; bz < CITY.cells; bz++) {
      const cx = -CITY.limit + (bx + 0.5) * CITY.cell;
      const cz = -CITY.limit + (bz + 0.5) * CITY.cell;
      const mid = Math.hypot(bx - 2.5, bz - 2.5);
      const downtown = mid < 1.9;
      const beachside = bz >= CITY.cells - 1;
      const kind = mid > 3.2 ? (rng() < 0.32 ? 'lot' : 'shops')
        : mid > 2.2 ? (rng() < 0.16 ? 'park' : 'shops')
        : downtown ? 'towers'
        : (rng() < 0.2 ? 'lot' : 'shops');

      // Sidewalk pad under the block.
      const pad = new THREE.Mesh(blockGeom, walkMat);
      pad.rotation.x = -Math.PI / 2;
      pad.scale.set(CITY.blockHalf * 2 + 8, CITY.blockHalf * 2 + 8, 1);
      pad.position.set(cx, 0.01, cz);
      pad.receiveShadow = true;
      scene.add(pad);

      if (kind === 'park') {
        buildPark(scene, cx, cz, addBox, rng, beachside);
        continue;
      }
      if (kind === 'lot') {
        buildLot(scene, cx, cz, addBox, rng);
        lotAnchors.push({ x: cx, z: cz });
        continue;
      }
      if (reserved.has(`${bx},${bz}`)) continue;

      const count = kind === 'towers' ? 2 : U.randInt(rng, 2, 4);
      const along = kind === 'towers' ? 'z' : 'x';
      for (let k = 0; k < count; k++) {
        const span = CITY.blockHalf * 2;
        const slice = span / count;
        const off = -CITY.blockHalf + slice * (k + 0.5);
        const w = kind === 'towers' ? U.rand(rng, 10, 15) : U.rand(rng, 5, 7.5);
        const d = kind === 'towers' ? U.rand(rng, 10, 15) : U.rand(rng, 8, 13);
        const x = along === 'z' ? cx + off : cx + U.rand(rng, -2, 2);
        const z = along === 'z' ? cz + U.rand(rng, -2, 2) : cz + off;
        // The beach café's block keeps a gap at the waterfront for the café itself.
        if (bz >= CITY.cells - 1 && Math.abs(x - anchors.cafe.x) < 13) continue;
        const height = kind === 'towers'
          ? U.rand(rng, 26, 62) + (1.9 - mid) * 22
          : U.rand(rng, 6, beachside ? 9 : 14);

        addBuilding(scene, x, z, w, d, height, {
          addBox, rng, facadeMats, facadeMatsLow, roofMats, signMats, kind, skylineSlabs, beachFront,
        });
      }
    }
  }

  // --- beach, promenade, pier, ocean -------------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.extent + 160, 90),
    new THREE.MeshStandardMaterial({ map: TEX.sandTexture(), roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, beachZ + 40);
  sand.receiveShadow = true;
  scene.add(sand);

  const promenade = new THREE.Mesh(blockGeom, walkMat);
  promenade.rotation.x = -Math.PI / 2;
  promenade.scale.set(CITY.extent + 160, 10, 1);
  promenade.position.set(0, 0.03, beachZ - 4);
  scene.add(promenade);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 700, 1, 1),
    new THREE.MeshStandardMaterial({ map: TEX.waterTexture(), roughness: 0.18, metalness: 0.35, color: 0x9fe6ee }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.35, beachZ + 150);
  scene.add(water);

  // A wooden pier reaching into the bay, with a container yard on the far west.
  buildPier(scene, addBox, rng);
  missionSpots.pier = { x: -40, z: beachZ + 46 };
  // Beach cafés and kiosks, clear of the pier and the story café.
  for (let i = -2; i <= 2; i++) {
    const x = i * 62 + U.rand(rng, -8, 8);
    if (Math.abs(x - missionSpots.pier.x) < 22 || Math.abs(x - anchors.cafe.x) < 15) continue;
    addBuilding(scene, x, beachZ + 6, U.rand(rng, 8, 12), 8, U.rand(rng, 4, 6), {
      addBox, rng, facadeMats, facadeMatsLow, roofMats, signMats, kind: 'shops', skylineSlabs, beachFront,
    });
  }

  // Palms along the promenade and a few on the sand.
  buildProps(scene, { rng, colliders, beachZ, promenade, CITY });

  // The story's landmarks sit on the anchors chosen before the blocks were built.
  Object.assign(missionSpots, anchors);

  buildLandmarks(scene, missionSpots, addBox);
  crownSkyline(scene, skylineSlabs, beachFront, rng);

  // --- city boundary walls (invisible) ----------------------------------------------------
  const L = CITY.limit + 26;
  addBox(-L - 8, -L - 8, -L, L + 8, 8);
  addBox(L, -L - 8, L + 8, L + 8, 8);
  addBox(-L, -L - 8, L, -L, 8);

  // --- road graph -------------------------------------------------------------------------
  for (let i = 0; i <= CITY.cells; i++) {
    for (let j = 0; j <= CITY.cells; j++) {
      roadNodes.push({ i, j, x: -CITY.limit + i * CITY.cell, z: -CITY.limit + j * CITY.cell });
    }
  }
  for (let i = 0; i <= CITY.cells; i++) {
    for (let j = 0; j <= CITY.cells; j++) {
      const n = roadNodes[i * (CITY.cells + 1) + j];
      if (i < CITY.cells) roadEdges.push([n, roadNodes[(i + 1) * (CITY.cells + 1) + j]]);
      if (j < CITY.cells) roadEdges.push([n, roadNodes[i * (CITY.cells + 1) + j + 1]]);
    }
  }

  const minimap = bakeMinimap(roadNodes);

  return { limit: CITY.limit, maxZ: CITY.limit + 78, colliders, roadNodes, roadEdges, missionSpots, lotAnchors, minimap };
}

// Skyline character: spires and lit crowns on the tall towers, balconies and awnings on the
// waterfront hotels. Purely visual, no collision, so the frame cost is a few dozen small meshes.
function crownSkyline(scene, slabs, beachFront, rng) {
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfc9be, roughness: 0.5, metalness: 0.6 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55 });
  for (const s of slabs) {
    if (s.height < 40) continue;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 6 + rng() * 6, 4), steel);
    mast.position.set(s.x, s.height + 3.5, s.z);
    scene.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), beaconMat);
    beacon.position.set(s.x, s.height + 7, s.z);
    scene.add(beacon);
    // A lit band under the crown: the downtown reads at dusk and in the haze.
    const band = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.3, 0.22, s.d + 0.3), neonMat);
    band.position.set(s.x, s.height - 1.1, s.z);
    scene.add(band);
  }

  const rail = new THREE.MeshStandardMaterial({ color: 0xf2e7d6, roughness: 0.85 });
  const awning = new THREE.MeshStandardMaterial({ color: 0xd96b4f, roughness: 0.8 });
  for (const b of beachFront) {
    for (let f = 1; f <= Math.floor(b.height / 3.2); f++) {
      const y = f * 3.2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w + 1.1, 0.14, 1.5), rail);
      slab.position.set(b.x, y, b.z + b.d / 2 + 0.6);
      slab.castShadow = true;
      scene.add(slab);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(b.w + 1.1, 0.5, 0.1), rail);
      lip.position.set(b.x, y + 0.3, b.z + b.d / 2 + 1.32);
      scene.add(lip);
    }
    const shade = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.8, 0.12, 1.6), awning);
    shade.position.set(b.x, 2.9, b.z + b.d / 2 + 0.8);
    shade.castShadow = true;
    scene.add(shade);
  }
}

// One building: body, parapet, roof clutter, maybe an awning sign.
function addBuilding(scene, x, z, w, d, height, ctx) {
  const { addBox, rng, facadeMats, facadeMatsLow, roofMats, signMats, kind, skylineSlabs, beachFront } = ctx;
  const idx = Math.floor(rng() * PALETTES.length);
  const mat = kind === 'towers' ? facadeMats[idx] : facadeMatsLow[idx];

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
  body.position.set(x, height / 2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, height);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), roofMats[idx]);
  roof.position.set(x, height + 0.25, z);
  roof.castShadow = true;
  scene.add(roof);

  // Parapet lip so roofs read from the street.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.9, d + 0.9),
    new THREE.MeshStandardMaterial({ color: 0xf2e7d6, roughness: 0.9 }));
  lip.position.set(x, height + 0.1, z);
  scene.add(lip);

  // Roof clutter.
  const clutter = U.randInt(rng, 1, 3);
  for (let c = 0; c < clutter; c++) {
    const s = U.rand(rng, 0.8, 2.2);
    const unit = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s),
      new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.9 }));
    unit.position.set(x + U.rand(rng, -w / 3, w / 3), height + 0.9, z + U.rand(rng, -d / 3, d / 3));
    unit.castShadow = true;
    scene.add(unit);
  }
  if (kind === 'towers' && rng() < 0.5) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a7462, roughness: 0.85 }));
    tank.position.set(x + U.rand(rng, -2, 2), height + 1.7, z + U.rand(rng, -2, 2));
    tank.castShadow = true;
    scene.add(tank);
  }

  // Shop sign on street-facing facades.
  if (kind === 'shops' && rng() < 0.55) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), signMats[Math.floor(rng() * signMats.length)]);
    const side = rng() < 0.5 ? -1 : 1;
    sign.position.set(x + side * (w / 2 + 0.08), 3.4, z);
    sign.rotation.y = side * Math.PI / 2;
    scene.add(sign);
    const face = rng() < 0.5 ? -1 : 1;
    const sign2 = sign.clone();
    sign2.position.set(x, 3.4, z + face * (d / 2 + 0.08));
    sign2.rotation.y = face > 0 ? 0 : Math.PI;
    scene.add(sign2);
  }

  // Striped awning over the shopfront.
  if (kind === 'shops' && rng() < 0.5) {
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.14, 1.9),
      new THREE.MeshStandardMaterial({ color: idx % 2 ? 0xc8583f : 0x2f7f61, roughness: 0.8 }));
    awning.position.set(x, 2.9, z + d / 2 + 0.9);
    awning.castShadow = true;
    scene.add(awning);
  }

  if (height > 34) skylineSlabs.push({ x, z, height, w, d });
  // Sea-facing shop rows get balconies: the waterfront reads as hotels, not blank boxes.
  if (kind === 'shops' && z > CITY.limit - CITY.cell) beachFront.push({ x, z, height, w, d });
}

function buildPark(scene, cx, cz, addBox, rng, beachside) {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(CITY.blockHalf * 2, CITY.blockHalf * 2),
    new THREE.MeshStandardMaterial({ map: TEX.grassTexture(), roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0.04, cz);
  scene.add(grass);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a4a, roughness: 0.85 });
  for (let i = 0; i < 7; i++) {
    const x = cx + U.rand(rng, -12, 12);
    const z = cz + U.rand(rng, -12, 12);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.2, 6), trunkMat);
    trunk.position.set(x, 1.6, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), leafMat);
    crown.position.set(x, 4.4, z);
    crown.castShadow = true;
    scene.add(crown);
    addBox(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 4);
  }

  // Path, bench and a fountain.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4, CITY.blockHalf * 2),
    new THREE.MeshStandardMaterial({ color: 0xd9cfbe, roughness: 0.9 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(cx, 0.05, cz);
  scene.add(path);

  if (!beachside) {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xefe4d2, roughness: 0.8 }));
    basin.position.set(cx, 0.35, cz);
    scene.add(basin);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x74c6d8, roughness: 0.2, metalness: 0.2 }));
    bowl.position.set(cx, 0.66, cz);
    scene.add(bowl);
    addBox(cx - 3.4, cz - 3.4, cx + 3.4, cz + 3.4, 0.7);
  }
}

function buildLot(scene, cx, cz, addBox, rng) {
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(CITY.blockHalf * 2, CITY.blockHalf * 2),
    new THREE.MeshStandardMaterial({ map: TEX.roadTexture(), roughness: 1 }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(cx, 0.04, cz);
  scene.add(asphalt);

  // Bay stripes.
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf0ead8 });
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5), stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(cx + i * 9 + 4, 0.06, cz + j * 9);
      scene.add(s);
    }
  }

  // Lot walls / planters on two sides so it reads as a lot.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb9, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.6), wallMat);
    wall.position.set(cx + side * 8, 0.55, cz - CITY.blockHalf + 2);
    wall.castShadow = true;
    scene.add(wall);
    addBox(wall.position.x - 1.5, wall.position.z - 0.3, wall.position.x + 1.5, wall.position.z + 0.3, 1.1);
  }
  if (rng() < 0.4) {
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.9 }));
    booth.position.set(cx + 12, 1.3, cz + 12);
    booth.castShadow = true;
    scene.add(booth);
    addBox(cx + 10.7, cz + 10.9, cx + 13.3, cz + 13.1, 2.6);
  }
}

function buildPier(scene, addBox, rng) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 58), wood);
  deck.position.set(-40, -0.24, CITY.limit + 60);
  deck.receiveShadow = true;
  scene.add(deck);

  for (let i = -1; i <= 1; i++) {
    for (let j = 0; j < 7; j++) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 6), wood);
      pile.position.set(-40 + i * 12, -2, CITY.limit + 34 + j * 8);
      scene.add(pile);
    }
  }

  // Container stacks on the west end: the city's freight corner.
  const colors = [0xb5462f, 0x2f6f8f, 0x3f8f5f, 0xd3a13c, 0x8a4b8f];
  for (let i = 0; i < 10; i++) {
    const x = -CITY.limit + 12 + U.rand(rng, 0, 18);
    const z = CITY.limit + 22 + U.rand(rng, 0, 20);
    const h = U.rand(rng, 3, 6);
    const box = new THREE.Mesh(new THREE.BoxGeometry(12, h, 5),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.85 }));
    box.position.set(x, h / 2, z);
    box.castShadow = true;
    scene.add(box);
    addBox(x - 6, z - 2.5, x + 6, z + 2.5, h);
  }

  // Pier shed.
  const shed = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 10),
    new THREE.MeshStandardMaterial({ map: TEX.facadeTexture(PALETTES[6], 2, false), roughness: 0.9 }));
  shed.position.set(-40, 2.5, CITY.limit + 84);
  shed.castShadow = true;
  scene.add(shed);
  addBox(-47, CITY.limit + 79, -33, CITY.limit + 89, 5);
}

function buildLandmarks(scene, spots, addBox) {
  // Radio tower on the hill in the north-east.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xd94f3a, roughness: 0.7 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xded6c8, roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9bda9, roughness: 0.9 }));
  base.position.set(spots.radio.x, 1, spots.radio.z);
  scene.add(base);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 46, 5), legMat);
    leg.position.set(spots.radio.x + Math.cos(a) * 3.4, 23, spots.radio.z + Math.sin(a) * 3.4);
    leg.rotation.z = Math.cos(a) * 0.05;
    leg.rotation.x = Math.sin(a) * 0.05;
    leg.castShadow = true;
    scene.add(leg);
  }
  for (let i = 1; i <= 8; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6 - i * 0.35, 0.12, 4, 12), towerMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(spots.radio.x, i * 5, spots.radio.z);
    scene.add(ring);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 12, 5), towerMat);
  mast.position.set(spots.radio.x, 50, spots.radio.z);
  scene.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
  beacon.position.set(spots.radio.x, 56, spots.radio.z);
  scene.add(beacon);
  addBox(spots.radio.x - 4, spots.radio.z - 4, spots.radio.x + 4, spots.radio.z + 4, 4);

  // Garage: the crew's home base, a wide roll-up door under a low roof.
  const g = spots.garage;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 16),
    new THREE.MeshStandardMaterial({ map: TEX.facadeTexture(PALETTES[2], 2, false), roughness: 0.9 }));
  shell.position.set(g.x, 3.5, g.z);
  shell.castShadow = true;
  scene.add(shell);
  addBox(g.x - 12, g.z - 8, g.x + 12, g.z + 8, 7);
  const door = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x9aa2a6, roughness: 0.6, metalness: 0.4 }));
  door.position.set(g.x, 2.5, g.z + 8.2);
  scene.add(door);
  addBox(g.x - 8, g.z + 7.4, g.x + 8, g.z + 8.6, 2);

  // A big painted sign over the door.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.4),
    new THREE.MeshStandardMaterial({ map: TEX.signTexture('TIGA SAUDARA', '#f3e6cc', '#9c3f2c'), roughness: 0.8 }));
  sign.position.set(g.x, 6.2, g.z + 8.3);
  scene.add(sign);

  // Beach café: striped awning, chalkboard, string lights.
  const c = spots.cafe;
  const cafe = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 9),
    new THREE.MeshStandardMaterial({ map: TEX.facadeTexture(PALETTES[0], 1, true), roughness: 0.9 }));
  cafe.position.set(c.x, 2, c.z);
  cafe.castShadow = true;
  scene.add(cafe);
  addBox(c.x - 6, c.z - 4.5, c.x + 6, c.z + 4.5, 4);

  // Market hall near the east gate.
  const m = spots.market;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 14),
    new THREE.MeshStandardMaterial({ map: TEX.facadeTexture(PALETTES[5], 2, true), roughness: 0.9 }));
  hall.position.set(m.x, 3, m.z);
  hall.castShadow = true;
  scene.add(hall);
  addBox(m.x - 10, m.z - 7, m.x + 10, m.z + 7, 6);
}

// Minimap base: roads in grey, the bay in blue, blocks in warm cream. Drawn once.
function bakeMinimap(nodes) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const pad = 24;
  const scale = (size - pad * 2) / 500;
  const toPx = (v) => pad + (v + 250) * scale;

  ctx.fillStyle = '#22313a';
  ctx.fillRect(0, 0, size, size);

  // Bay.
  ctx.fillStyle = '#1d6f86';
  ctx.fillRect(0, toPx(CITY.limit + 6), size, size);

  // Blocks.
  for (let bx = 0; bx < CITY.cells; bx++) {
    for (let bz = 0; bz < CITY.cells; bz++) {
      const x = -CITY.limit + bx * CITY.cell;
      const z = -CITY.limit + bz * CITY.cell;
      ctx.fillStyle = '#c9bda8';
      ctx.fillRect(toPx(x + CITY.roadHalf), toPx(z + CITY.roadHalf),
        (CITY.cell - CITY.roadHalf * 2) * scale, (CITY.cell - CITY.roadHalf * 2) * scale);
    }
  }

  // Roads.
  ctx.strokeStyle = '#5c6b73';
  ctx.lineWidth = CITY.roadHalf * 2 * scale;
  for (const n of nodes) {
    if (n.i < CITY.cells) {
      const b = nodes[(n.i + 1) * (CITY.cells + 1) + n.j];
      ctx.beginPath();
      ctx.moveTo(toPx(n.x), toPx(n.z));
      ctx.lineTo(toPx(b.x), toPx(b.z));
      ctx.stroke();
    }
    if (n.j < CITY.cells) {
      const b = nodes[n.i * (CITY.cells + 1) + n.j + 1];
      ctx.beginPath();
      ctx.moveTo(toPx(n.x), toPx(n.z));
      ctx.lineTo(toPx(b.x), toPx(b.z));
      ctx.stroke();
    }
  }

  // Promenade.
  ctx.fillStyle = '#d9cfbc';
  ctx.fillRect(0, toPx(CITY.limit + 4), size, 6 * scale);
  // The pier deck, drawn from the same constants the mesh uses.
  ctx.fillStyle = '#af9069';
  ctx.fillRect(toPx(-53), toPx(CITY.limit + 31), 26 * scale, 58 * scale);
  return c;
}
