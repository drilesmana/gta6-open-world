// Velora Heat — the city of Velora. A grid of roads and blocks with varied
// buildings, sidewalks, lamps, trees and street props, plus the bay at the
// south edge. Returns the road network, sidewalk waypoints, car spawn points
// and the player start so the other systems can drive on it.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, randInt, pick, clamp } from './util.js';

// A canvas texture of lit and dark windows on a pale wall. Cloned per
// building so each one can tile the windows to its own size.
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2ede2';
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 8;
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.3;
      ctx.fillStyle = lit ? '#ffd27a' : '#2c3e50';
      ctx.fillRect(c * cw + 6, r * ch + 8, cw - 12, ch - 16);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Build the city into the scene. materials is the dictionary from
// makeMaterials(). Returns the city object the gameplay systems use.
export function createCity(scene, materials) {
  const c = CONFIG.city;
  const p = CONFIG.palette;
  const group = new THREE.Group();
  scene.add(group);

  const pitch = c.blockSize + c.roadWidth; // distance between road centrelines
  const half = 2 * pitch + c.roadWidth / 2; // city half-extent
  const roadLines = [-2 * pitch, -pitch, 0, pitch, 2 * pitch];
  const blockCentres = [-1.5 * pitch, -0.5 * pitch, 0.5 * pitch, 1.5 * pitch];

  // --- Ground, sea and sand -------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, half * 2 + 260),
    materials.ground,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 320), materials.sea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.12, half + 170);
  sea.receiveShadow = true;
  group.add(sea);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 60, 16), materials.sand);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.08, half + 8);
  sand.receiveShadow = true;
  group.add(sand);

  // --- Road strips ------------------------------------------------------
  const roadGeoV = new THREE.BoxGeometry(c.roadWidth, 0.1, half * 2);
  const roadGeoH = new THREE.BoxGeometry(half * 2, 0.1, c.roadWidth);
  for (const x of roadLines) {
    const road = new THREE.Mesh(roadGeoV, materials.asphalt);
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    group.add(road);
  }
  for (const z of roadLines) {
    const road = new THREE.Mesh(roadGeoH, materials.asphalt);
    road.position.set(0, 0.02, z);
    road.receiveShadow = true;
    group.add(road);
  }

  // --- Centre dashes and crosswalks (instanced, one draw call each) -----
  const dummy = new THREE.Object3D();
  const dashPositions = [];
  for (const line of roadLines) {
    for (let d = -half + 10; d < half - 10; d += 7) {
      const nearCross = roadLines.some((r) => Math.abs(d - r) < 9);
      if (nearCross) continue;
      dashPositions.push({ x: line, z: d, rotY: 0 });
      dashPositions.push({ x: d, z: line, rotY: Math.PI / 2 });
    }
  }
  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.04, 2.6),
    materials.roadLine,
    dashPositions.length,
  );
  dashPositions.forEach((pos, i) => {
    dummy.position.set(pos.x, 0.09, pos.z);
    dummy.rotation.set(0, pos.rotY, 0);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  dashes.frustumCulled = false;
  group.add(dashes);

  const stripePositions = [];
  for (const rx of roadLines) {
    for (const rz of roadLines) {
      for (const side of [-1, 1]) {
        const cz = rz + side * (c.roadWidth / 2 + 2.2);
        for (let k = -2; k <= 2; k++) {
          stripePositions.push({ x: rx + k * 1.5, z: cz, rotY: 0 });
        }
        const cx = rx + side * (c.roadWidth / 2 + 2.2);
        for (let k = -2; k <= 2; k++) {
          stripePositions.push({ x: cx, z: rz + k * 1.5, rotY: Math.PI / 2 });
        }
      }
    }
  }
  const stripes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.65, 0.04, 3.4),
    materials.crosswalk,
    stripePositions.length,
  );
  stripePositions.forEach((pos, i) => {
    dummy.position.set(pos.x, 0.09, pos.z);
    dummy.rotation.set(0, pos.rotY, 0);
    dummy.updateMatrix();
    stripes.setMatrixAt(i, dummy.matrix);
  });
  stripes.instanceMatrix.needsUpdate = true;
  stripes.frustumCulled = false;
  group.add(stripes);

  // --- Sidewalk slabs ---------------------------------------------------
  const slabSize = c.blockSize + c.sidewalkWidth * 2;
  const slabGeo = new THREE.BoxGeometry(slabSize, 0.24, slabSize);
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const slab = new THREE.Mesh(slabGeo, materials.sidewalk);
      slab.position.set(bx, 0.12, bz);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // --- Buildings --------------------------------------------------------
  const windowTex = makeWindowTexture();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const wallTints = [
    0xe8dcc0,
    0xc97e5a,
    0x4d8a86,
    0xd9b380,
    0x5a6672,
  ];
  const garageBlockX = 0.5 * pitch; // south-centre block holds Nia's garage
  const garageBlockZ = 1.5 * pitch;
  const garage = CONFIG.garage;

  function addBuilding(x, z, w, h, d, tint) {
    const tex = windowTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 7)));
    const wall = new THREE.MeshStandardMaterial({
      map: tex,
      color: tint,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(unitBox, [
      wall, wall, materials.roof, materials.roof, wall, wall,
    ]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, 0.24 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const isGarageBlock = bx === garageBlockX && bz === garageBlockZ;
      const lot = (c.blockSize - c.buildingGap) / 2;
      for (const ox of [-lot / 2, lot / 2]) {
        for (const oz of [-lot / 2, lot / 2]) {
          // The garage takes the two south lots of its block.
          if (isGarageBlock && oz > 0) continue;
          if (Math.random() < 0.22) continue; // leave some lots empty
          const w = rand(12, lot - 2);
          const d = rand(12, lot - 2);
          const h = rand(c.minBuildingHeight, c.maxBuildingHeight);
          addBuilding(bx + ox, bz + oz, w, h, d, pick(wallTints));
        }
      }
    }
  }

  // Nia's garage: a wide low building with a door facing north, gold sign.
  const garageMesh = new THREE.Mesh(unitBox, [
    materials.buildingWallTeal,
    materials.buildingWallTeal,
    materials.roof,
    materials.roof,
    materials.buildingWallTeal,
    materials.buildingWallTeal,
  ]);
  garageMesh.scale.set(18, 7, 9);
  garageMesh.position.set(garage.x, 0.24 + 3.5, garage.z);
  garageMesh.castShadow = true;
  garageMesh.receiveShadow = true;
  group.add(garageMesh);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(garage.doorWidth, 4.6, 0.3),
    materials.garageDoor,
  );
  door.position.set(garage.x, 0.24 + 2.3, garage.z - 4.6);
  group.add(door);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.4, 0.3),
    materials.garageSign,
  );
  sign.position.set(garage.x, 0.24 + 6.2, garage.z - 4.6);
  group.add(sign);

  // --- Lamps, trees, benches, hydrants (instanced) ----------------------
  const lampSpots = [];
  for (const rx of roadLines) {
    for (const rz of roadLines) {
      lampSpots.push({ x: rx + c.roadWidth / 2 + 1.2, z: rz + c.roadWidth / 2 + 1.2 });
      lampSpots.push({ x: rx - c.roadWidth / 2 - 1.2, z: rz - c.roadWidth / 2 - 1.2 });
    }
  }
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8),
    materials.lampPole,
    lampSpots.length,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.25, 0.35),
    materials.lampGlow,
    lampSpots.length,
  );
  lampSpots.forEach((pos, i) => {
    dummy.position.set(pos.x, 0.24 + 2.6, pos.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(pos.x, 0.24 + 5.3, pos.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  poles.frustumCulled = false;
  heads.frustumCulled = false;
  poles.castShadow = true;
  group.add(poles);
  group.add(heads);

  const treeSpots = [];
  for (let i = 0; i < 16; i++) {
    const bx = pick(blockCentres);
    const bz = pick(blockCentres);
    treeSpots.push({
      x: bx + rand(-slabSize / 2 + 3, slabSize / 2 - 3),
      z: bz + rand(-slabSize / 2 + 3, slabSize / 2 - 3),
    });
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.8, 7),
    materials.treeTrunk,
    treeSpots.length,
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.5, 3.4, 8),
    materials.treeLeaf,
    treeSpots.length,
  );
  treeSpots.forEach((pos, i) => {
    dummy.position.set(pos.x, 0.24 + 0.9, pos.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(pos.x, 0.24 + 3.2, pos.z);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  trunks.frustumCulled = false;
  leaves.frustumCulled = false;
  trunks.castShadow = true;
  leaves.castShadow = true;
  group.add(trunks);
  group.add(leaves);

  const benchSpots = [];
  for (let i = 0; i < 10; i++) {
    const bx = pick(blockCentres);
    const bz = pick(blockCentres);
    benchSpots.push({
      x: bx + rand(-slabSize / 2 + 2, slabSize / 2 - 2),
      z: bz + rand(-slabSize / 2 + 2, slabSize / 2 - 2),
      rotY: pick([0, Math.PI / 2]),
    });
  }
  const benches = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.2, 0.5, 0.7),
    materials.benchWood,
    benchSpots.length,
  );
  benchSpots.forEach((pos, i) => {
    dummy.position.set(pos.x, 0.24 + 0.45, pos.z);
    dummy.rotation.set(0, pos.rotY, 0);
    dummy.updateMatrix();
    benches.setMatrixAt(i, dummy.matrix);
  });
  benches.instanceMatrix.needsUpdate = true;
  benches.frustumCulled = false;
  benches.castShadow = true;
  group.add(benches);

  // --- Road network, waypoints and spawns for the gameplay systems -----
  const roads = [];
  for (const x of roadLines) {
    roads.push({
      start: { x, z: -half },
      end: { x, z: half },
      dir: { x: 0, z: 1 },
    });
  }
  for (const z of roadLines) {
    roads.push({
      start: { x: -half, z },
      end: { x: half, z },
      dir: { x: 1, z: 0 },
    });
  }

  const sidewalks = [];
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const edge = slabSize / 2 - 1.2;
      for (let d = -edge; d <= edge; d += 8) {
        sidewalks.push({ x: bx + d, z: bz - edge });
        sidewalks.push({ x: bx + d, z: bz + edge });
        sidewalks.push({ x: bx - edge, z: bz + d });
        sidewalks.push({ x: bx + edge, z: bz + d });
      }
    }
  }

  const carSpawns = [];
  for (let i = 0; i < 12; i++) {
    const road = pick(roads);
    const t = rand(0.1, 0.9);
    carSpawns.push({
      x: road.start.x + (road.end.x - road.start.x) * t,
      z: road.start.z + (road.end.z - road.start.z) * t,
      heading: road.dir.x !== 0 ? 0 : Math.PI / 2,
    });
  }

  const playerStart = {
    x: garage.x,
    z: garage.z - 10,
    heading: Math.PI,
  };

  return {
    group,
    roads,
    sidewalks,
    carSpawns,
    playerStart,
    garage: { x: garage.x, z: garage.z },
    half,
    roadLines,
  };
}
