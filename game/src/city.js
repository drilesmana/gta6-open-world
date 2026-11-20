// Velora Heat — the coastal city: road grid, blocks, buildings, lamps, props.
// Returns { roads, sidewalks, carSpawns, playerStart }.
import * as THREE from '../vendor/three.min.js';
import { CONFIG } from './config.js';
import { rand, randInt, pick } from './util.js';

function makeWindowTexture(base, lit) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 10 + c * 28;
      const y = 12 + r * 30;
      const isLit = Math.random() < 0.3;
      ctx.fillStyle = isLit ? lit : '#22384a';
      ctx.fillRect(x, y, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, materials) {
  const half = CONFIG.citySize / 2; // 320
  const pitch = CONFIG.blockGap;    // 76
  const roadW = CONFIG.roadWidth;   // 12
  const walkW = CONFIG.sidewalkWidth;

  // Road centre lines, symmetric, spacing = pitch.
  const lines = [];
  for (let i = 0; i < 8; i++) lines.push(-266 + i * pitch);

  const group = new THREE.Group();
  scene.add(group);

  // Base ground: warm dry grass.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.citySize + 160, CONFIG.citySize + 160),
    materials.grass,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Sea to the south (coast) and a sand strip.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 260),
    new THREE.MeshStandardMaterial({ color: 0x2a7a8c, roughness: 0.25, metalness: 0.2 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.6, half + 150);
  group.add(sea);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.citySize + 160, 40),
    materials.sand,
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, half + 20);
  beach.receiveShadow = true;
  group.add(beach);

  // Roads: dark strips along every grid line, both directions.
  const roads = [];
  const roadGeoX = new THREE.BoxGeometry(CONFIG.citySize, 0.1, roadW);
  const roadGeoZ = new THREE.BoxGeometry(roadW, 0.1, CONFIG.citySize);
  for (const l of lines) {
    const rx = new THREE.Mesh(roadGeoX, materials.asphalt);
    rx.position.set(0, 0.05, l);
    rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, materials.asphalt);
    rz.position.set(l, 0.05, 0);
    rz.receiveShadow = true;
    group.add(rz);
    roads.push({
      start: new THREE.Vector3(-half, 0, l),
      end: new THREE.Vector3(half, 0, l),
      dir: 'x',
    });
    roads.push({
      start: new THREE.Vector3(l, 0, -half),
      end: new THREE.Vector3(l, 0, half),
      dir: 'z',
    });
  }

  // Sidewalks: lighter strips flanking each road, plus waypoint list.
  const sidewalks = [];
  const walkGeoX = new THREE.BoxGeometry(CONFIG.citySize, 0.12, walkW);
  const walkGeoZ = new THREE.BoxGeometry(walkW, 0.12, CONFIG.citySize);
  const off = roadW / 2 + walkW / 2;
  for (const l of lines) {
    for (const s of [-off, off]) {
      const wx = new THREE.Mesh(walkGeoX, materials.sidewalk);
      wx.position.set(0, 0.06, l + s);
      wx.receiveShadow = true;
      group.add(wx);
      const wz = new THREE.Mesh(walkGeoZ, materials.sidewalk);
      wz.position.set(l + s, 0.06, 0);
      wz.receiveShadow = true;
      group.add(wz);
    }
    // Waypoints every ~40 m along both sidewalks of this line.
    for (let t = -half + 20; t <= half - 20; t += 40) {
      sidewalks.push(new THREE.Vector3(t, 0, l - off));
      sidewalks.push(new THREE.Vector3(t, 0, l + off));
      sidewalks.push(new THREE.Vector3(l - off, 0, t));
      sidewalks.push(new THREE.Vector3(l + off, 0, t));
    }
  }

  // Building window textures (two warm variants).
  const winTexA = makeWindowTexture('#e8dcc8', '#ffd27a');
  const winTexB = makeWindowTexture('#e0b98f', '#ffcf8a');
  const wallMats = [materials.wall, materials.wallWarm, materials.wallWhite, materials.wallTeal];
  const winMats = [winTexA, winTexB].map(
    (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }),
  );

  // Blocks: between road lines, 1–3 buildings each with varied heights.
  const blockCentres = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      blockCentres.push(-228 + i * pitch, -228 + j * pitch);
    }
  }
  // Keep the garage block (centre block, near origin) mostly open.
  const garageBlock = { x: 0, z: 0 };
  for (let b = 0; b < blockCentres.length; b += 2) {
    const cx = blockCentres[b];
    const cz = blockCentres[b + 1];
    if (Math.abs(cx - garageBlock.x) < pitch / 2 && Math.abs(cz - garageBlock.z) < pitch / 2) {
      continue;
    }
    const count = randInt(1, 3);
    for (let k = 0; k < count; k++) {
      const w = rand(14, 26);
      const d = rand(14, 26);
      const h = rand(10, 42);
      const bx = cx + rand(-16, 16);
      const bz = cz + rand(-16, 16);
      const wallMat = pick(wallMats);
      const winMat = pick(winMats);
      const mats = [winMat, winMat, materials.roofFlat, materials.roofFlat, winMat, winMat];
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      building.position.set(bx, h / 2, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);
      // Flat roof cap with a small parapet look.
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        materials.roofFlat,
      );
      cap.position.set(bx, h + 0.25, bz);
      cap.castShadow = true;
      group.add(cap);
    }
  }

  // Nia's garage — a low wide building on the centre block, coral door.
  const garage = new THREE.Mesh(
    new THREE.BoxGeometry(30, 7, 18),
    [materials.wallWarm, materials.wallWarm, materials.roofFlat, materials.roofFlat, materials.wallWarm, materials.wallWarm],
  );
  garage.position.set(0, 3.5, 8);
  garage.castShadow = true;
  garage.receiveShadow = true;
  group.add(garage);
  const garageDoor = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5, 0.4),
    new THREE.MeshStandardMaterial({ color: CONFIG.palette.coral, roughness: 0.6, metalness: 0.3 }),
  );
  garageDoor.position.set(0, 2.5, -1.2);
  group.add(garageDoor);

  // Street lamps along roads, every ~76 m.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const l of lines) {
    for (let t = -half + 38; t <= half - 38; t += pitch) {
      for (const [x, z] of [[l + off + 1.5, t], [t, l + off + 1.5]]) {
        const pole = new THREE.Mesh(poleGeo, materials.lamp);
        pole.position.set(x, 3, z);
        pole.castShadow = true;
        group.add(pole);
        const head = new THREE.Mesh(headGeo, materials.lampGlow);
        head.position.set(x, 6.1, z);
        group.add(head);
      }
    }
  }

  // Props: palm-ish trees scattered on blocks, plus crates near the garage.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const leafGeo = new THREE.SphereGeometry(2.2, 8, 6);
  for (let i = 0; i < 46; i++) {
    const tx = rand(-half + 10, half - 10);
    const tz = rand(-half + 10, half - 10);
    // Keep trees off the roads.
    const onRoadX = lines.some((l) => Math.abs(tz - l) < roadW / 2 + 3);
    const onRoadZ = lines.some((l) => Math.abs(tx - l) < roadW / 2 + 3);
    if (onRoadX || onRoadZ) continue;
    const trunk = new THREE.Mesh(trunkGeo, materials.trunk);
    trunk.position.set(tx, 2.5, tz);
    trunk.castShadow = true;
    group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, materials.leaf);
    leaf.position.set(tx, 6, tz);
    leaf.scale.y = 0.6;
    leaf.castShadow = true;
    group.add(leaf);
  }
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  for (let i = 0; i < 6; i++) {
    const crate = new THREE.Mesh(crateGeo, materials.wood);
    crate.position.set(rand(14, 24), 0.8, rand(-6, 20));
    crate.rotation.y = rand(0, Math.PI);
    crate.castShadow = true;
    group.add(crate);
  }

  // Car spawn points: on roads, spread across the city.
  const carSpawns = [];
  for (const l of lines) {
    carSpawns.push(new THREE.Vector3(l, 0, rand(-200, 200)));
  }
  carSpawns.push(
    new THREE.Vector3(38, 0, -114),
    new THREE.Vector3(-114, 0, 38),
    new THREE.Vector3(190, 0, 190),
    new THREE.Vector3(-190, 0, -190),
    new THREE.Vector3(114, 0, -38),
    new THREE.Vector3(16, 0, -8),
  );

  const playerStart = new THREE.Vector3(16, 0, -8);

  return { roads, sidewalks, carSpawns, playerStart };
}
