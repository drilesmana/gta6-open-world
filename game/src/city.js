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
  // Emissive map: black everywhere, warm where a window is lit, so lit
  // windows actually glow at dusk instead of staying flat dark rectangles.
  const eCanvas = document.createElement('canvas');
  eCanvas.width = 128;
  eCanvas.height = 256;
  const ectx = eCanvas.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 10 + c * 28;
      const y = 12 + r * 30;
      const isLit = Math.random() < 0.3;
      ctx.fillStyle = isLit ? lit : '#22384a';
      ctx.fillRect(x, y, 18, 20);
      if (isLit) {
        ectx.fillStyle = lit;
        ectx.fillRect(x, y, 18, 20);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const emissiveTex = new THREE.CanvasTexture(eCanvas);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  return { map: tex, emissive: emissiveTex };
}

// Canvas texture with big bold text (billboards, signs). bg may be null
// for a transparent sign; returns a CanvasTexture.
function makeTextTexture(text, sub, bg, fg, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (bg) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#1d2430');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 28;
  ctx.fillStyle = fg;
  let size = 84;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > 470 && size > 28) {
    size -= 6;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
  }
  ctx.fillText(text, 256, sub ? 108 : 128);
  if (sub) {
    ctx.shadowBlur = 12;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(sub, 256, 196);
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
  // r16: SEGMENTED — each strip is cut at every cross-road so the sidewalk
  // never crosses a road surface. Before, full-length strips ran across
  // every intersection and read as pavement cutting through the road.
  // Segments run block-to-block (64 m between road edges, 48 m at the city
  // edge) as two InstancedMeshes, one per direction, 144 instances each.
  const sidewalks = [];
  const off = roadW / 2 + walkW / 2;
  const segCentres = [-296, -228, -152, -76, 0, 76, 152, 228, 296];
  const segLens = [48, 64, 64, 64, 64, 64, 64, 64, 48];
  const segCount = lines.length * 2 * segCentres.length;
  {
    const dummy = new THREE.Object3D();
    const walkX = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.12, walkW), materials.sidewalk, segCount,
    );
    const walkZ = new THREE.InstancedMesh(
      new THREE.BoxGeometry(walkW, 0.12, 1), materials.sidewalk, segCount,
    );
    let xi = 0;
    let zi = 0;
    for (const l of lines) {
      for (const s of [-off, off]) {
        for (let k = 0; k < segCentres.length; k++) {
          const c = segCentres[k];
          const len = segLens[k];
          dummy.position.set(c, 0.06, l + s);
          dummy.scale.set(len, 1, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          walkX.setMatrixAt(xi++, dummy.matrix);
          dummy.position.set(l + s, 0.06, c);
          dummy.scale.set(1, 1, len);
          dummy.updateMatrix();
          walkZ.setMatrixAt(zi++, dummy.matrix);
        }
      }
    }
    walkX.receiveShadow = true;
    walkZ.receiveShadow = true;
    group.add(walkX);
    group.add(walkZ);
  }
  for (const l of lines) {
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
    (t) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffb45e, emissiveIntensity: 0.7, roughness: 0.85 }),
  );

  // Blocks: between road lines, 1–3 buildings each with varied heights.
  const blockCentres = [];
  const roofSpots = []; // {x, y, z, w, d} — for instanced rooftop props below.
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
      roofSpots.push({ x: bx, y: h + 0.5, z: bz, w, d });
    }
  }

  // Rooftop props as two InstancedMeshes (1 draw call each): AC units on
  // ~60% of roofs, antennas on ~30% — flat roofs read as finished, not bare.
  {
    const dummy = new THREE.Object3D();
    const acSpots = roofSpots.filter(() => Math.random() < 0.6);
    if (acSpots.length) {
      const ac = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.6, 0.9, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.95 }),
        acSpots.length,
      );
      acSpots.forEach((s, i) => {
        dummy.position.set(s.x + s.w * 0.22, s.y + 0.45, s.z - s.d * 0.18);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        ac.setMatrixAt(i, dummy.matrix);
      });
      ac.castShadow = true;
      group.add(ac);
    }
    const antSpots = roofSpots.filter(() => Math.random() < 0.3);
    if (antSpots.length) {
      const ant = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.05, 0.1, 3.4, 5),
        new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.7 }),
        antSpots.length,
      );
      antSpots.forEach((s, i) => {
        dummy.position.set(s.x - s.w * 0.25, s.y + 1.7, s.z + s.d * 0.2);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        ant.setMatrixAt(i, dummy.matrix);
      });
      group.add(ant);
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

  // Neon garage sign above the door (transparent canvas, unlit so it reads
  // as a lit sign at dusk) + a warm point light spilling onto the forecourt.
  const signTex = makeTextTexture("NIA'S GARAGE", null, null, '#ffb830', '#ff6b3c');
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 5.5),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true, fog: false }),
  );
  sign.position.set(0, 6.4, -1.6);
  sign.rotation.y = Math.PI;
  group.add(sign);
  const garageLight = new THREE.PointLight(0xff9a3c, 16, 24, 2);
  garageLight.position.set(0, 4.5, -5);
  group.add(garageLight);

  // Freestanding billboards near the centre roads — in-world text, lit by
  // their own emissive map so they read at sunset.
  function billboard(x, z, ry, text, sub, bg, fg, accent) {
    const tex = makeTextTexture(text, sub, bg, fg, accent);
    const face = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.6,
    });
    const side = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.5 });
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(10, 4, 0.4),
      [side, side, side, side, face, face],
    );
    panel.position.set(x, 8, z);
    panel.rotation.y = ry;
    panel.castShadow = true;
    group.add(panel);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.5, 6), side);
    pole.position.set(x, 3.25, z);
    pole.castShadow = true;
    group.add(pole);
  }
  billboard(-30, -44, 0, 'VELORA', 'HOTEL • CASINO', '#7a3a5a', '#ffd27a', '#ff6b9a');
  billboard(44, 30, Math.PI / 2, '24H TACOS', null, '#2a6a5a', '#ffe9b0', '#ffb830');

  // Street lamps along roads, every ~76 m.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampSpots = [];
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
        lampSpots.push([x, z]);
      }
    }
  }

  // Warm light pools under every lamp head (one InstancedMesh, additive):
  // the street reads as lit at golden hour instead of bare poles.
  if (lampSpots.length) {
    const pools = new THREE.InstancedMesh(
      new THREE.CircleGeometry(3.4, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffc46b, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      lampSpots.length,
    );
    const dummy = new THREE.Object3D();
    lampSpots.forEach(([x, z], i) => {
      dummy.position.set(x, 0.13, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      pools.setMatrixAt(i, dummy.matrix);
    });
    group.add(pools);
  }

  // Props: palm-ish trees scattered on blocks, plus crates near the garage.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const leafGeo = new THREE.SphereGeometry(2.2, 8, 6);
  const treeSpots = [];
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
    treeSpots.push([tx, tz]);
  }

  // Palm fronds: six drooping blades around each crown (one InstancedMesh).
  if (treeSpots.length) {
    const fronds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.06, 3.0),
      materials.leaf,
      treeSpots.length * 6,
    );
    const dummy = new THREE.Object3D();
    let fi = 0;
    for (const [tx, tz] of treeSpots) {
      for (let k = 0; k < 6; k++) {
        const yaw = (k / 6) * Math.PI * 2 + 0.3;
        dummy.position.set(tx + Math.sin(yaw) * 1.4, 6.7, tz + Math.cos(yaw) * 1.4);
        dummy.rotation.set(0, yaw, 0);
        dummy.rotateX(0.55); // droop the tip down
        dummy.updateMatrix();
        fronds.setMatrixAt(fi++, dummy.matrix);
      }
    }
    fronds.castShadow = true;
    group.add(fronds);
  }
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  for (let i = 0; i < 6; i++) {
    const crate = new THREE.Mesh(crateGeo, materials.wood);
    crate.position.set(rand(14, 24), 0.8, rand(-6, 20));
    crate.rotation.y = rand(0, Math.PI);
    crate.castShadow = true;
    group.add(crate);
  }

  // Lane dashes down the centre of every road (one InstancedMesh) + zebra
  // crossings at the four intersections around the garage block.
  // Flat planes (2 tris each), not boxes: 1264 dashes as boxes cost ~15k
  // triangles in the software renderer for zero visible difference.
  {
    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YXZ';
    const dashGeo = new THREE.PlaneGeometry(3, 0.3);
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8c98a, roughness: 0.9 });
    const dashCount = lines.length * 2 * 79;
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
    let di = 0;
    for (const l of lines) {
      for (let t = -312; t <= 312; t += 8) {
        dummy.position.set(t, 0.12, l);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(di++, dummy.matrix);
        dummy.position.set(l, 0.12, t);
        dummy.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(di++, dummy.matrix);
      }
    }
    group.add(dashes);

    const crossGeo = new THREE.PlaneGeometry(0.8, 5.5);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 });
    const crosses = [];
    for (const cx of [-38, 38]) {
      for (const cz of [-38, 38]) {
        for (const s of [-4.5, -1.5, 1.5, 4.5]) {
          crosses.push({ x: cx + s, z: cz + 8, ry: 0 });
          crosses.push({ x: cx + s, z: cz - 8, ry: 0 });
          crosses.push({ x: cx + 8, z: cz + s, ry: Math.PI / 2 });
          crosses.push({ x: cx - 8, z: cz + s, ry: Math.PI / 2 });
        }
      }
    }
    const cross = new THREE.InstancedMesh(crossGeo, crossMat, crosses.length);
    crosses.forEach((c, i) => {
      dummy.position.set(c.x, 0.12, c.z);
      dummy.rotation.set(-Math.PI / 2, c.ry, 0);
      dummy.updateMatrix();
      cross.setMatrixAt(i, dummy.matrix);
    });
    group.add(cross);
  }

  // Distant skyline silhouette ring: hazy towers beyond the city edge so
  // the horizon is never empty flat sky (inside fog range, so they read soft).
  // Faint window grid on the faces so they read as towers, not cardboard.
  {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 64;
    skyCanvas.height = 128;
    const sctx = skyCanvas.getContext('2d');
    sctx.fillStyle = '#7a5a44';
    sctx.fillRect(0, 0, 64, 128);
    sctx.fillStyle = '#93755c';
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 5; c++) {
        if (Math.random() < 0.5) sctx.fillRect(6 + c * 12, 8 + r * 12, 7, 8);
      }
    }
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const dummy = new THREE.Object3D();
    const skyline = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ map: skyTex, fog: true }),
      26,
    );
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.12;
      const r = 520 + ((i * 37) % 60);
      const w = 30 + ((i * 53) % 30);
      const h = 60 + ((i * 71) % 90);
      const d = 30 + ((i * 29) % 20);
      dummy.position.set(Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r);
      dummy.scale.set(w, h, d);
      dummy.rotation.set(0, a, 0);
      dummy.updateMatrix();
      skyline.setMatrixAt(i, dummy.matrix);
    }
    group.add(skyline);
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
