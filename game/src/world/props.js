// Street furniture: palms, curbside lights with warm bulbs, benches, hydrants, bins, bus
// shelters, traffic signals and beach umbrellas. Static, cheap, shared geometry, with thin
// collision boxes so the player and cars feel the street.
// Decorative geometry may be shared even when object transforms and collision bounds differ.

import * as U from '../core/util.js';
import * as TEX from './textures.js';

const THREE = globalThis.THREE;

const GEO = {};
function geom(key, make) {
  if (!GEO[key]) GEO[key] = make();
  return GEO[key];
}

const MAT = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x8d6f4f, roughness: 0.95 }),
  frond: new THREE.MeshStandardMaterial({ color: 0x5d9b4b, roughness: 0.9, side: THREE.DoubleSide }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6f7a78, roughness: 0.6, metalness: 0.5 }),
  bulb: new THREE.MeshBasicMaterial({ color: 0xfff0c4 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9c7a55, roughness: 0.95 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc9503c, roughness: 0.8 }),
  canvasRed: new THREE.MeshStandardMaterial({ color: 0xe0634c, roughness: 0.9, side: THREE.DoubleSide }),
  canvasCream: new THREE.MeshStandardMaterial({ color: 0xf2e6cb, roughness: 0.9, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({ color: 0xa8d5dd, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x37413f, roughness: 0.7 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe2792f, roughness: 0.85 }),
  crate: new THREE.MeshStandardMaterial({ color: 0xa9855a, roughness: 0.95 }),
};

export function palm(scene, x, z, scale = 1, lean = 0) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(geom('trunk', () => new THREE.CylinderGeometry(0.22, 0.42, 7, 6)), MAT.trunk);
  trunk.position.y = 3.5;
  trunk.castShadow = true;
  group.add(trunk);

  const crown = new THREE.Group();
  crown.position.y = 7;
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(geom('frond', () => new THREE.PlaneGeometry(4.6, 1.5, 4, 1)), MAT.frond);
    frond.position.set(Math.cos((i / 7) * Math.PI * 2) * 1.9, 0.15, Math.sin((i / 7) * Math.PI * 2) * 1.9);
    frond.rotation.set(-0.5 + Math.random() * 0.2, -((i / 7) * Math.PI * 2) + Math.PI / 2, 0.35);
    frond.castShadow = true;
    crown.add(frond);
  }
  const nuts = new THREE.Mesh(geom('nuts', () => new THREE.SphereGeometry(0.35, 6, 5)), MAT.trunk);
  crown.add(nuts);
  group.add(crown);

  group.position.set(x, 0, z);
  group.rotation.z = lean;
  group.scale.setScalar(scale);
  scene.add(group);
  return group;
}

function streetlight(scene, x, z, rot) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(geom('pole', () => new THREE.CylinderGeometry(0.12, 0.18, 6.4, 6)), MAT.metal);
  pole.position.y = 3.2;
  pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(geom('arm', () => new THREE.BoxGeometry(0.14, 0.14, 1.9)), MAT.metal);
  arm.position.set(0, 6.3, 0.9);
  g.add(arm);
  const head = new THREE.Mesh(geom('head', () => new THREE.BoxGeometry(0.5, 0.16, 0.8)), MAT.dark);
  head.position.set(0, 6.2, 1.8);
  g.add(head);
  const bulb = new THREE.Mesh(geom('bulb', () => new THREE.SphereGeometry(0.16, 6, 4)), MAT.bulb);
  bulb.position.set(0, 6.1, 1.8);
  g.add(bulb);
  // Daytime bulbs use bright geometry; point lights here would shade every city mesh.
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

function bench(scene, x, z, rot) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(geom('seat', () => new THREE.BoxGeometry(2.4, 0.14, 0.7)), MAT.wood);
  seat.position.y = 0.55;
  g.add(seat);
  const back = new THREE.Mesh(geom('back', () => new THREE.BoxGeometry(2.4, 0.7, 0.12)), MAT.wood);
  back.position.set(0, 0.95, -0.3);
  g.add(back);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(geom('leg', () => new THREE.BoxGeometry(0.12, 0.55, 0.6)), MAT.metal);
    leg.position.set(s * 0.95, 0.28, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
}

// Street clutter that the player and cars can feel: a thin box per obstacle, never a full mesh hull.
function smallBox(colliders, x, z, r, height) {
  colliders.push({ minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r, height });
}

function hydrant(scene, x, z, colliders) {
  const body = new THREE.Mesh(geom('hydrant', () => new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8)), MAT.red);
  body.position.set(x, 0.4, z);
  body.castShadow = true;
  scene.add(body);
  const cap = new THREE.Mesh(geom('hydrantCap', () => new THREE.SphereGeometry(0.22, 8, 6)), MAT.red);
  cap.position.set(x, 0.82, z);
  scene.add(cap);
  if (colliders) smallBox(colliders, x, z, 0.3, 0.8);
}

function bin(scene, x, z, colliders) {
  const b = new THREE.Mesh(geom('bin', () => new THREE.CylinderGeometry(0.34, 0.3, 0.9, 8)), MAT.dark);
  b.position.set(x, 0.45, z);
  b.castShadow = true;
  scene.add(b);
  if (colliders) smallBox(colliders, x, z, 0.36, 0.9);
}

// A newspaper box and a parking meter: the sort of thing a kerb has on it.
function newsBox(scene, x, z, rot) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geom('news', () => new THREE.BoxGeometry(0.5, 0.9, 0.42)), MAT.metal);
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(geom('newsGlass', () => new THREE.PlaneGeometry(0.38, 0.3)), MAT.dark);
  glass.position.set(0, 0.72, 0.22);
  g.add(glass);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

function trafficLight(scene, x, z, rot) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(geom('tlpole', () => new THREE.CylinderGeometry(0.1, 0.14, 4.6, 6)), MAT.metal);
  pole.position.y = 2.3;
  g.add(pole);
  const box = new THREE.Mesh(geom('tlbox', () => new THREE.BoxGeometry(0.4, 1.1, 0.3)), MAT.dark);
  box.position.set(0, 4.3, 0.1);
  g.add(box);
  const colors = [0xff3b2f, 0xffc23b, 0x4bd16a];
  colors.forEach((c, i) => {
    const lamp = new THREE.Mesh(geom('tlamp' + i, () => new THREE.SphereGeometry(0.1, 6, 5)),
      new THREE.MeshBasicMaterial({ color: c }));
    lamp.position.set(0, 4.65 - i * 0.32, 0.27);
    g.add(lamp);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

function busShelter(scene, x, z, rot) {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(geom('shelterRoof', () => new THREE.BoxGeometry(4.6, 0.16, 1.9)), MAT.metal);
  roof.position.y = 2.5;
  roof.castShadow = true;
  g.add(roof);
  for (const s of [-2, 2]) {
    const post = new THREE.Mesh(geom('shelterPost', () => new THREE.BoxGeometry(0.14, 2.5, 0.14)), MAT.metal);
    post.position.set(s, 1.25, 0.8);
    g.add(post);
  }
  const glass = new THREE.Mesh(geom('shelterGlass', () => new THREE.PlaneGeometry(4.4, 1.8)), MAT.glass);
  glass.position.set(0, 1.5, -0.9);
  g.add(glass);
  const seat = new THREE.Mesh(geom('shelterSeat', () => new THREE.BoxGeometry(3.6, 0.1, 0.5)), MAT.wood);
  seat.position.set(0, 0.6, -0.6);
  g.add(seat);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

// A roadside billboard on two posts: the city's own advertising, painted into a texture.
function billboard(scene, x, z, rot, title, sub, bg, fg) {
  const g = new THREE.Group();
  for (const s of [-3.4, 3.4]) {
    const post = new THREE.Mesh(geom('bbPost', () => new THREE.BoxGeometry(0.24, 7, 0.24)), MAT.metal);
    post.position.set(s, 3.5, 0);
    post.castShadow = true;
    g.add(post);
  }
  const panel = new THREE.Mesh(
    geom('bbPanel', () => new THREE.PlaneGeometry(9.4, 4.7, 1, 1)),
    new THREE.MeshStandardMaterial({ map: TEX.billboardTexture(title, sub, bg, fg), roughness: 0.85 }),
  );
  panel.position.set(0, 6.2, 0.16);
  panel.castShadow = true;
  g.add(panel);
  const frame = new THREE.Mesh(geom('bbFrame', () => new THREE.BoxGeometry(9.8, 5.1, 0.18)), MAT.dark);
  frame.position.set(0, 6.2, 0.06);
  g.add(frame);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.traverse((o) => { if (o.isMesh && o !== panel) o.castShadow = true; });
  scene.add(g);
}

// Work clutter: a traffic cone and a stack of crates, for corners that should read as lived-in.
function cone(scene, x, z) {
  const c = new THREE.Mesh(geom('cone', () => new THREE.ConeGeometry(0.28, 0.7, 8)), MAT.orange);
  c.position.set(x, 0.35, z);
  c.castShadow = true;
  scene.add(c);
  const base = new THREE.Mesh(geom('coneBase', () => new THREE.BoxGeometry(0.5, 0.06, 0.5)), MAT.orange);
  base.position.set(x, 0.03, z);
  scene.add(base);
}

// Exposed for mission / debug use: places a single cone at world coordinates.
export function placeCone(scene, x, z) {
  cone(scene, x, z);
}

function crate(scene, x, z, rot) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(geom('crate', () => new THREE.BoxGeometry(0.8, 0.62, 0.8)), MAT.crate);
    c.position.set(U.rand(-0.1, 0.1), 0.31 + i * 0.62, U.rand(-0.1, 0.1));
    c.rotation.y = U.rand(-0.3, 0.3);
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

function umbrella(scene, x, z, colorMat) {
  const pole = new THREE.Mesh(geom('umbPole', () => new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5)), MAT.wood);
  pole.position.set(x, 1.2, z);
  scene.add(pole);
  const canopy = new THREE.Mesh(geom('umbCanopy', () => new THREE.ConeGeometry(1.7, 0.7, 8)), colorMat);
  canopy.position.set(x, 2.5, z);
  canopy.castShadow = true;
  scene.add(canopy);
  const towel = new THREE.Mesh(geom('towel', () => new THREE.PlaneGeometry(1.6, 2.4)), MAT.canvasCream);
  towel.rotation.x = -Math.PI / 2;
  towel.position.set(x + 1.1, 0.06, z + 0.4);
  scene.add(towel);
}

export function buildProps(scene, ctx) {
  const { rng, colliders, beachZ, CITY } = ctx;
  const limit = CITY.limit;
  const cell = CITY.cell;
  const cells = CITY.cells;
  // Worried palms further apart than a person: a palm every eleven metres along the sand is a
  // fence the player has to walk around.
  for (let x = -170; x <= 170; x += 15) {
    const z = beachZ - 6 + U.rand(rng, -1.5, 1.5);
    palm(scene, x, z, U.rand(rng, 0.9, 1.3), U.rand(rng, -0.08, 0.08));
    smallBox(colliders, x, z, 0.3, 6);
  }

  // Beach umbrellas and towels.
  for (let i = 0; i < 26; i++) {
    const x = U.rand(rng, -160, 160);
    const z = beachZ + U.rand(rng, 12, 50);
    umbrella(scene, x, z, i % 3 === 0 ? MAT.canvasRed : MAT.canvasCream);
  }

  // Curbside furniture beside every block.
  for (let bx = 0; bx < cells; bx++) {
    for (let bz = 0; bz < cells; bz++) {
      const cx = -limit + (bx + 0.5) * cell;
      const cz = -limit + (bz + 0.5) * cell;
      const edge = 21;
      const side = Math.floor(rng() * 4);
      const ax = side < 2 ? cx + (side ? 1 : -1) * edge : cx + U.rand(rng, -14, 14);
      const az = side < 2 ? cz + U.rand(rng, -14, 14) : cz + (side === 2 ? -1 : 1) * edge;
      const rot = side < 2 ? Math.PI / 2 : 0;

      if (rng() < 0.6) streetlight(scene, ax, az, rot);
      if (rng() < 0.45) {
        const bx2 = side < 2 ? ax : ax + (rng() < 0.5 ? -1 : 1) * (edge - 2);
        const bz2 = side < 2 ? az + (rng() < 0.5 ? -1 : 1) * (edge - 2) : az;
        bench(scene, bx2, bz2, rot + (rng() < 0.5 ? Math.PI : 0));
        smallBox(colliders, bx2, bz2, 1.2, 0.9);
      }
      if (rng() < 0.5) hydrant(scene, ax + U.rand(rng, -3, 3), az + U.rand(rng, -3, 3), colliders);
      if (rng() < 0.5) bin(scene, ax + U.rand(rng, -2, 2), az + U.rand(rng, -2, 2), colliders);
      if (rng() < 0.3) newsBox(scene, ax + U.rand(rng, -4, 4), az + U.rand(rng, -4, 4), rot + Math.PI);
      if (rng() < 0.25) busShelter(scene, ax + U.rand(rng, -2, 2), az, rot);

      // A second pass on the opposite edge, so no corner of a block reads empty.
      if (rng() < 0.7) {
        const ox = cx - (ax - cx);
        const oz = cz - (az - cz);
        const x2 = ox + U.rand(rng, -6, 6);
        const z2 = oz + U.rand(rng, -6, 6);
        if (rng() < 0.6) streetlight(scene, x2, z2, rot + Math.PI);
        if (rng() < 0.7) palm(scene, x2 + U.rand(rng, -4, 4), z2 + U.rand(rng, -4, 4), U.rand(rng, 0.75, 1.05), U.rand(rng, -0.06, 0.06));
        if (rng() < 0.4) bin(scene, x2 + U.rand(rng, -2, 2), z2 + U.rand(rng, -2, 2), colliders);
      }
    }
  }

  // Signals on the busiest corners.
  for (const [x, z, rot] of [[-26, 26, 0], [26, -26, Math.PI], [-26, -78, Math.PI / 2], [78, 26, -Math.PI / 2]]) {
    trafficLight(scene, x, z, rot);
  }

  // Billboards on the block corners, in the bay's own voice: one for the marina, one for the
  // radio station, one for the pier's freight line. They give the long streets a skyline at eye
  // level and sit on the four-metre apron, clear of the shopfronts.
  billboard(scene, 46, 26, Math.PI / 2, 'MARISOL MARINA', 'BERTH NOW', '#2f8f8a', '#f8efdb');
  billboard(scene, -46, -26, -Math.PI / 2, 'RADIO 88', 'ALL DAY, ALL NIGHT', '#e2604a', '#2a1a14');
  billboard(scene, 26, -46, Math.PI, 'PIER 9 FREIGHT', 'WE MOVE THE BAY', '#e8b34a', '#2a2214');

  // Corner clutter: cones around a patch of road works and crates outside the market corners.
  for (const [x, z] of [[46, 18], [46, 34], [18, 46], [-46, -18]]) cone(scene, x, z);
  for (const [x, z, r] of [[46, -14, 0.4], [-6, 46, -0.6], [-70, 46, 1.1], [30, 46, 0.2]]) crate(scene, x, z, r);
}
