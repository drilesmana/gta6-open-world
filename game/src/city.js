// Velora Heat — the city of Velora Bay.
// The street grid is baked into one 2048 ground texture (a single draw
// call); buildings are boxes whose facades are UV-scaled to real-world size
// so the windows never stretch; palms, lamps and rooftop props are instanced
// meshes. Collision is a flat list of axis-aligned boxes.
import {
  BLOCK, BLOCKS, STREETS, PITCH, CITY_HALF, BEACH_START, WATER_START, WATER_END, PALETTE,
} from './config.js';
import { createMaterials, billboardTexture } from './materials.js';
import { mulberry32, pick, rand } from './util.js';

const WORLD_MIN = -600;
const WORLD_SIZE = 1200; // the ground plane spans x -600..600, z -420..780
const TEX = 2048; // ground texture resolution

function w2px(v) {
  return ((v - WORLD_MIN) / WORLD_SIZE) * TEX;
}
function wz2py(z) {
  // Canvas rows grow downward; the plane is centred at z = 180, so its z
  // range is [-420, 780] and canvas row 0 is world z = -420.
  return ((z - (180 - WORLD_SIZE / 2)) / WORLD_SIZE) * TEX;
}

// Bake the whole street grid into one canvas: asphalt, sidewalks, dashes,
// crosswalks, beach. Soft at distance; the 3D props carry the detail.
function paintGround() {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  const ctx = c.getContext('2d');
  // Warm concrete beyond the city edge.
  ctx.fillStyle = '#8f8678';
  ctx.fillRect(0, 0, TEX, TEX);
  // City base slab.
  ctx.fillStyle = '#bfae90';
  ctx.fillRect(w2px(-196), wz2py(-196), w2px(196) - w2px(-196), wz2py(196) - wz2py(-196));
  // One sidewalk slab per block, with a darker edge.
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      const x = w2px(bx - BLOCK / 2);
      const y = wz2py(bz - BLOCK / 2);
      const s = (BLOCK / WORLD_SIZE) * TEX;
      ctx.fillStyle = '#c2b193';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(90,74,58,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  }
  // Asphalt strips along every street.
  ctx.fillStyle = '#35383d';
  for (const s of STREETS) {
    const w = (12 / WORLD_SIZE) * TEX;
    ctx.fillRect(w2px(s - 6), wz2py(-196), w, wz2py(196) - wz2py(-196));
    ctx.fillRect(w2px(-196), wz2py(s - 6), w2px(196) - w2px(-196), w);
  }
  // Gold centre dashes.
  ctx.fillStyle = '#d9a441';
  for (const s of STREETS) {
    for (let v = -196; v < 196; v += 13) {
      ctx.fillRect(w2px(s) - 1, wz2py(v), 2, ((5 / WORLD_SIZE) * TEX));
      ctx.fillRect(w2px(v), wz2py(s) - 1, ((5 / WORLD_SIZE) * TEX), 2);
    }
  }
  // Crosswalk stripes at every intersection.
  ctx.fillStyle = 'rgba(240,236,220,0.85)';
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      for (let k = -2; k <= 2; k++) {
        const stripe = (2.2 / WORLD_SIZE) * TEX;
        const gap = (2.6 / WORLD_SIZE) * TEX;
        ctx.fillRect(w2px(sx + k * gap) - stripe / 2, wz2py(sz - 5.4), stripe, ((2.2 / WORLD_SIZE) * TEX));
        ctx.fillRect(w2px(sx - 5.4), wz2py(sz + k * gap) - stripe / 2, ((2.2 / WORLD_SIZE) * TEX), stripe);
      }
    }
  }
  // Beach sand south of the promenade, with a little speckle.
  ctx.fillStyle = '#e8cf9e';
  ctx.fillRect(w2px(-196), wz2py(BEACH_START), w2px(196) - w2px(-196), wz2py(WATER_START) - wz2py(BEACH_START));
  ctx.fillStyle = '#d9bd85';
  for (let i = 0; i < 260; i++) {
    ctx.fillRect(w2px(-196 + Math.random() * 392), wz2py(BEACH_START + Math.random() * 44), 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The water shimmer: a small repeating canvas, scrolled by the game loop.
function paintWater() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2e7f8f';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,220,160,0.35)';
  ctx.lineWidth = 2;
  for (let y = 8; y < 256; y += 22) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A box whose side faces tile the facade texture at real-world scale
// (one tile = 16 m wide, 24 m tall), so windows never stretch.
function facadeBox(w, h, d, material) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each).
  for (let f = 0; f < 6; f++) {
    const faceW = (f === 0 || f === 1) ? d : w;
    const isSide = f !== 2 && f !== 3;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (isSide) uv.setXY(i, uv.getX(i) * (faceW / 16), uv.getY(i) * (h / 24));
      else uv.setXY(i, uv.getX(i) * (faceW / 16), uv.getY(i) * (faceW / 16));
    }
  }
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Fill one instanced mesh from a list of {x, y, z} spots.
function scatterInstanced(geo, mat, spots, { scale = [1, 1, 1], rotY = null, shadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(spots.length, 1));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  spots.forEach((p, i) => {
    if (rotY) e.set(0, rotY(p, i), 0);
    else e.set(0, 0, 0);
    q.setFromEuler(e);
    m4.compose(
      new THREE.Vector3(p.x, p.y ?? 0, p.z),
      q,
      new THREE.Vector3(p.sx ?? scale[0], p.sy ?? scale[1], p.sz ?? scale[2]),
    );
    mesh.setMatrixAt(i, m4);
  });
  mesh.count = spots.length;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

export const LANDMARKS = {
  // Markers sit where the player can actually stand: in front of the garage
  // door and on the street by the market, never inside a building.
  garage: { x: -52, z: 174, name: "Nia's Garage" },
  promenadeFare: { x: -26, z: 176, name: 'Promenade' },
  gallery: { x: 104, z: -26, name: 'Calle Verde Gallery' },
  cafe: { x: 52, z: 176, name: 'Café Alba' },
  marina: { x: 130, z: 208, name: 'Marina' },
  safehouse: { x: -130, z: -78, name: 'Market Safehouse' },
  market: { x: -104, z: -104, name: 'Mercado' },
  park: { x: 52, z: -104, name: 'Palmera Park' },
};

export function buildCity(scene) {
  const mats = createMaterials();
  const rng = mulberry32(20261120);
  const group = new THREE.Group();
  const colliders = [];

  // ---- ground: one baked plane ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshStandardMaterial({ map: paintGround(), roughness: 0.96 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 180);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- water: big plane south of the beach ----
  const waterTex = paintWater();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, WATER_END - WATER_START + 40),
    new THREE.MeshStandardMaterial({
      map: waterTex, roughness: 0.18, metalness: 0.25,
      emissive: 0x0e3a44, emissiveIntensity: 0.4,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  // Extend south past the horizon, never north onto the beach.
  water.position.set(0, 0.1, (WATER_START + WATER_END + 40) / 2);
  group.add(water);

  // ---- buildings ----
  const roofSpots = [];
  const acSpots = [];
  const antSpots = [];
  const plasterMats = mats.plaster;
  const garageBlock = new Set(['-52,156']); // the garage is built separately

  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      if (garageBlock.has(`${bx},${bz}`)) continue;
      const roll = rng();
      if (roll < 0.1) continue; // park: palms + benches instead, added below
      if (roll < 0.17) {
        // Parking lot: a flat asphalt patch, no building.
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), mats.asphaltPlain);
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(bx, 0.06, bz);
        lot.receiveShadow = true;
        group.add(lot);
        continue;
      }
      const twin = rng() < 0.22;
      const footprints = twin
        ? [{ dx: -9, dz: 0, w: 18, d: 30 }, { dx: 10, dz: 0, w: 16, d: 30 }]
        : [{ dx: 0, dz: 0, w: 30, d: 30 }];
      for (const s of footprints) {
        const h = 9 + rng() * rng() * 32;
        const b = facadeBox(s.w, h, s.d, pick(plasterMats));
        b.position.set(bx + s.dx, h / 2, bz + s.dz);
        group.add(b);
        colliders.push({
          minX: bx + s.dx - s.w / 2, maxX: bx + s.dx + s.w / 2,
          minZ: bz + s.dz - s.d / 2, maxZ: bz + s.dz + s.d / 2,
        });
        roofSpots.push({ x: bx + s.dx, y: h + 0.1, z: bz + s.dz, sx: s.w + 0.8, sy: 1, sz: s.d + 0.8 });
        if (rng() < 0.7) acSpots.push({ x: bx + s.dx + rand(-6, 6), y: h + 0.6, z: bz + s.dz + rand(-6, 6) });
        if (rng() < 0.5) antSpots.push({ x: bx + s.dx + rand(-8, 8), y: h + 2.5, z: bz + s.dz + rand(-8, 8) });
      }
    }
  }

  // The garage: a low wide block with a roller door and a sign.
  const garage = facadeBox(34, 7, 26, plasterMats[5]);
  garage.position.set(-52, 3.5, 156);
  group.add(garage);
  colliders.push({ minX: -69, maxX: -35, minZ: 143, maxZ: 169 });
  roofSpots.push({ x: -52, y: 7.1, z: 156, sx: 34.8, sy: 1, sz: 26.8 });

  // Rooftop slabs, AC units, antennas — one instanced mesh each.
  group.add(scatterInstanced(new THREE.BoxGeometry(1, 0.5, 1), mats.roof, roofSpots));
  group.add(scatterInstanced(new THREE.BoxGeometry(1.6, 0.9, 1.2), mats.trimDark, acSpots));
  group.add(scatterInstanced(new THREE.CylinderGeometry(0.09, 0.14, 5, 5), mats.trimDark, antSpots));

  // ---- palms along the streets, the beach and the park ----
  const palmSpots = [];
  for (const s of STREETS) {
    for (let v = -170; v <= 170; v += 52) {
      if (rng() < 0.55) palmSpots.push({ x: s + 9.5, z: v + rand(-6, 6) });
      if (rng() < 0.55) palmSpots.push({ x: v + rand(-6, 6), z: s + 9.5 });
    }
  }
  for (let x = -180; x <= 180; x += 26) {
    if (rng() < 0.7) palmSpots.push({ x: x + rand(-4, 4), z: 200 + rand(0, 24) });
  }
  for (let i = 0; i < 14; i++) palmSpots.push({ x: 52 + rand(-16, 16), z: -104 + rand(-16, 16) });

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 7);
  trunkGeo.translate(0, 3.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, palmSpots.length);
  const leafGeo = new THREE.ConeGeometry(2.6, 1.6, 6);
  leafGeo.translate(0, 0.4, 0);
  const leaves = new THREE.InstancedMesh(leafGeo, mats.palmLeaf, palmSpots.length * 5);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.1));
  let li = 0;
  palmSpots.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 0, p.z), tilt, sc.set(1, 0.9 + rng() * 0.3, 1));
    trunks.setMatrixAt(i, m4);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rng() * 0.4;
      const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, a, 0, 'YXZ'));
      m4.compose(new THREE.Vector3(p.x + Math.sin(a) * 1.1, 7.2, p.z + Math.cos(a) * 1.1), qq, sc.set(1, 1, 1));
      leaves.setMatrixAt(li++, m4);
    }
  });
  trunks.castShadow = true;
  leaves.castShadow = true;
  group.add(trunks);
  group.add(leaves);

  // ---- street lamps (pole + glowing head) ----
  const lampSpots = [];
  for (const s of STREETS) {
    for (let v = -156; v <= 156; v += 52) {
      if (rng() < 0.8) lampSpots.push({ x: s - 5.6, z: v });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
  poleGeo.translate(0, 3.25, 0);
  group.add(scatterInstanced(poleGeo, mats.lampPole, lampSpots));
  const headSpots = lampSpots.map((p) => ({ x: p.x, y: 6.5, z: p.z }));
  group.add(scatterInstanced(new THREE.SphereGeometry(0.32, 8, 6), mats.lampGlow, headSpots));

  // ---- benches in the park and on the promenade ----
  const benchSpots = [];
  for (let i = 0; i < 8; i++) benchSpots.push({ x: 52 + rand(-15, 15), y: 0.55, z: -104 + rand(-15, 15) });
  for (let x = -150; x <= 150; x += 52) benchSpots.push({ x, y: 0.55, z: 186 });
  const benches = scatterInstanced(new THREE.BoxGeometry(2.2, 0.12, 0.6), mats.benchWood, benchSpots, { shadow: true });
  group.add(benches);

  // ---- billboards: original canvas art on building faces ----
  const boards = [
    { text: ['VELORA', 'BAY • EST. 1962'], bg: '#e2604a', fg: '#f6ecd6', x: -78, y: 16, z: -25.4, ry: 0 },
    { text: ['SOL', 'CAFÉ ALBA'], bg: '#2f8f8a', fg: '#f6ecd6', x: 130.5, y: 14, z: 52, ry: Math.PI / 2 },
    { text: ['GARAGE', "NIA'S"], bg: '#f2b705', fg: '#23190c', x: -52, y: 5.2, z: 142.4, ry: Math.PI },
    { text: ['MARINA', 'BOATS • SUNSET'], bg: '#2b3a55', fg: '#ffd27a', x: 78, y: 18, z: 182.5, ry: Math.PI },
  ];
  for (const b of boards) {
    const tex = billboardTexture(b.text, b.bg, b.fg);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 7),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }),
    );
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.y = b.ry;
    group.add(mesh);
  }

  // ---- beach umbrellas ----
  const umbSpots = [];
  for (let i = 0; i < 8; i++) umbSpots.push({ x: -160 + i * 44 + rand(-8, 8), z: 210 + rand(0, 16) });
  group.add(scatterInstanced(
    new THREE.ConeGeometry(2.2, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0xe2604a, roughness: 0.85 }),
    umbSpots.map((p) => ({ ...p, y: 2.6 })),
  ));
  group.add(scatterInstanced(
    new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5),
    mats.trunk,
    umbSpots.map((p) => ({ ...p, y: 1.2 })),
  ));

  scene.add(group);
  return { group, colliders, waterTex };
}
