import * as THREE from 'three';

// Low-poly cars for Velora Heat. makeCar builds a car group facing +Z:
// body, cabin, four wheels on steerable front pivots, headlights and
// taillights. The group carries in userData the wheel pivots (so driving can
// spin and steer them), the body mesh (so driving can roll it), and the
// police light bar when the kind is police. Colours come from the shared
// materials dictionary when it has them, with local fallbacks.

export const CAR_COLOURS = [
  'coral', 'teal', 'cream', 'gold', 'red', 'blue', 'silver', 'ink', 'green', 'white',
];
export const CAR_COLORS = CAR_COLOURS;

const PAINT = {
  coral: 0xe85d4a,
  teal: 0x2a9d8f,
  cream: 0xf2e8d5,
  gold: 0xd4a017,
  red: 0xc1121f,
  blue: 0x2b5ea7,
  silver: 0xb8bcc2,
  ink: 0x23232e,
  green: 0x4a7c59,
  white: 0xe8e8e8,
};

function mat(dict, keys, color, opts = {}) {
  const d = dict || {};
  for (const k of keys) {
    const m = d[k];
    if (m && m.isMaterial) return m;
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.35,
    ...opts,
  });
}

function paintMat(dict, colour) {
  const name = PAINT[colour] !== undefined ? colour : 'silver';
  const keys = [`carPaint${name[0].toUpperCase()}${name.slice(1)}`, `car_${name}`, `paint_${name}`, name, 'carPaint'];
  return mat(dict, keys, PAINT[name], { roughness: 0.35, metalness: 0.55 });
}

function wheel(dict, radius, width) {
  // A pivot group at the axle; the tyre cylinder hangs in it so driving can
  // steer the pivot (front wheels) and spin the tyre around its axle.
  const pivot = new THREE.Group();
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 14),
    mat(dict, ['tyre', 'tire', 'wheel', 'dark'], 0x151515, { roughness: 0.9, metalness: 0.0 }),
  );
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  pivot.add(tyre);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10),
    mat(dict, ['metal', 'hubcap', 'chrome'], 0x9aa0a8, { roughness: 0.3, metalness: 0.8 }),
  );
  hub.rotation.z = Math.PI / 2;
  pivot.add(hub);
  pivot.userData.tyre = tyre;
  return pivot;
}

function lamp(dict, color, x, y, z, w = 0.22) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.1, 0.06),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 }),
  );
  m.position.set(x, y, z);
  return m;
}

// makeCar(colour, kind, materials): kind is 'sedan' | 'hatch' | 'truck' |
// 'police' | 'gold'. Returns a THREE.Group facing +Z. userData holds wheels
// {frontL, frontR, rearL, rearR}, the body mesh, the kind, and (for police)
// the lightBar {red, blue} meshes plus a flash phase.
export function makeCar(colour, kind, materials) {
  const k = ['sedan', 'hatch', 'truck', 'police', 'gold'].includes(kind) ? kind : 'sedan';
  const dict = materials || {};
  const paint = k === 'gold'
    ? mat(dict, ['carPaintGold', 'car_gold', 'gold', 'carPaint'], PAINT.gold, { roughness: 0.25, metalness: 0.85 })
    : paintMat(dict, colour);
  const glass = mat(dict, ['window', 'glass', 'buildingGlass'], 0x1a2a33, { roughness: 0.15, metalness: 0.6 });
  const trim = mat(dict, ['metal', 'chrome'], 0x8a8f96, { roughness: 0.3, metalness: 0.8 });

  const group = new THREE.Group();
  const long = k === 'truck' ? 5.2 : k === 'hatch' ? 3.6 : 4.4;
  const wide = k === 'truck' ? 2.1 : 1.9;
  const bodyH = k === 'truck' ? 1.1 : 0.62;

  // Body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(wide, bodyH, long), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  // Cabin / windshield band.
  const cabinLen = k === 'truck' ? 1.4 : long * 0.42;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.86, 0.52, cabinLen), glass);
  cabin.position.set(0, 1.12, k === 'truck' ? long / 2 - 1.0 : -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  if (k === 'truck') {
    // Flatbed with side rails behind the cab.
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.94, 0.28, long * 0.5), trim);
    bed.position.set(0, 0.95, -long * 0.2);
    bed.castShadow = true;
    group.add(bed);
  }
  // Bumpers.
  for (const z of [long / 2 + 0.02, -long / 2 - 0.02]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.98, 0.16, 0.1), trim);
    bumper.position.set(0, 0.42, z);
    group.add(bumper);
  }
  // Headlights (front, +Z) and taillights (rear, -Z).
  group.add(lamp(dict, 0xfff2c0, -wide / 2 + 0.3, 0.68, long / 2 + 0.03));
  group.add(lamp(dict, 0xfff2c0, wide / 2 - 0.3, 0.68, long / 2 + 0.03));
  group.add(lamp(dict, 0xff2a1a, -wide / 2 + 0.3, 0.68, -long / 2 - 0.03));
  group.add(lamp(dict, 0xff2a1a, wide / 2 - 0.3, 0.68, -long / 2 - 0.03));

  // Wheels: front pair steers, all four spin.
  const wheelR = k === 'truck' ? 0.44 : 0.36;
  const wheelW = 0.26;
  const frontZ = long / 2 - 0.85;
  const rearZ = -long / 2 + 0.85;
  const frontL = wheel(dict, wheelR, wheelW);
  frontL.position.set(-wide / 2, wheelR, frontZ);
  const frontR = wheel(dict, wheelR, wheelW);
  frontR.position.set(wide / 2, wheelR, frontZ);
  const rearL = wheel(dict, wheelR, wheelW);
  rearL.position.set(-wide / 2, wheelR, rearZ);
  const rearR = wheel(dict, wheelR, wheelW);
  rearR.position.set(wide / 2, wheelR, rearZ);
  group.add(frontL, frontR, rearL, rearR);

  let lightBar = null;
  if (k === 'police') {
    // Roof light bar: red on the left, blue on the right.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), trim);
    bar.position.set(0, 1.46, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.6 }),
    );
    red.position.set(-0.28, 1.46, -0.2);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 1.6 }),
    );
    blue.position.set(0.28, 1.46, -0.2);
    group.add(red, blue);
    lightBar = { red, blue, phase: 0 };
  }

  group.userData.kind = k;
  group.userData.colour = k === 'gold' ? 'gold' : colour;
  group.userData.wheels = { frontL, frontR, rearL, rearR };
  group.userData.body = body;
  group.userData.length = long;
  group.userData.width = wide;
  group.userData.wheelRadius = wheelR;
  group.userData.lightBar = lightBar;
  return group;
}
