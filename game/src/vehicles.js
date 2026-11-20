// vehicles.js — Velora Heat (chunk 2)
// Low-poly cars. Built from the spec contract only:
// makeCar(colour, kind, materials) returns a car group with body, cabin, wheels
// and lights. Kinds: sedan, hatch, truck, police, gold (the Aurelio GT).
// Also exports the list of available car colours.
// THREE comes from the global loaded by index.html (./vendor/three.min.js).

function three() {
  const T = globalThis.THREE;
  if (!T) throw new Error('THREE global is not loaded — index.html must load ./vendor/three.min.js before main.js');
  return T;
}

export const CAR_COLOURS = [
  'red', 'coral', 'gold', 'teal', 'cream',
  'blue', 'white', 'black', 'silver', 'green',
];
// Lower-case alias — chunk 3 only knows the spec, which names no identifier,
// so both spellings point at the same list.
export const carColours = CAR_COLOURS;

const PAINT_HEX = {
  red: 0xb03030,
  coral: 0xd96a5f,
  gold: 0xe0a83c,
  teal: 0x3f7d7a,
  cream: 0xe8e0d0,
  blue: 0x3a5a8a,
  white: 0xe8e8e8,
  black: 0x1c1c20,
  silver: 0x9aa0a8,
  green: 0x4a7a4a,
};

function cap(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

// Shared radial glow texture for the police light-bar halos.
let glowTextureCache = null;
function makeGlowTexture() {
  if (glowTextureCache) return glowTextureCache;
  const THREE = three();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowTextureCache = new THREE.CanvasTexture(canvas);
  return glowTextureCache;
}

function mat(materials, keys, color, opts) {
  if (materials) {
    for (const k of keys) {
      if (materials[k]) return materials[k];
    }
  }
  const THREE = three();
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.1,
    ...(opts || {}),
  });
}

function paintMat(materials, colour) {
  const name = String(colour || 'silver').toLowerCase();
  const hex = PAINT_HEX[name] !== undefined ? PAINT_HEX[name] : 0x9aa0a8;
  return mat(
    materials,
    ['carPaint' + cap(name), 'car' + cap(name), 'paint' + cap(name), name],
    hex,
    { metalness: 0.55, roughness: 0.35 },
  );
}

// Dimensions per kind: length (z), width (x), body height, cabin height.
const KINDS = {
  sedan: { length: 4.3, width: 1.9, bodyH: 0.62, cabinH: 0.55, wheels: 0.36 },
  hatch: { length: 3.7, width: 1.8, bodyH: 0.6, cabinH: 0.55, wheels: 0.33 },
  truck: { length: 5.8, width: 2.1, bodyH: 0.8, cabinH: 0.7, wheels: 0.42 },
  police: { length: 4.3, width: 1.9, bodyH: 0.62, cabinH: 0.55, wheels: 0.36 },
  gold: { length: 4.5, width: 2.0, bodyH: 0.5, cabinH: 0.48, wheels: 0.38 },
};

export function makeCar(colour, kind, materials) {
  const THREE = three();
  const k = KINDS[kind] || KINDS.sedan;
  const kindName = KINDS[kind] ? kind : 'sedan';
  const colourName = String(colour || 'silver').toLowerCase();

  const group = new THREE.Group();
  group.name = 'car-' + kindName + '-' + colourName;

  const paint = kindName === 'police'
    ? mat(materials, ['carPaintWhite', 'carWhite', 'white'], 0xe8e8e8, { metalness: 0.5, roughness: 0.35 })
    : kindName === 'gold'
      ? mat(materials, ['carPaintGold', 'carGold', 'gold'], 0xe0a83c, { metalness: 0.75, roughness: 0.25 })
      : paintMat(materials, colourName);
  const glass = mat(materials, ['window', 'glass', 'carGlass', 'buildingGlass'], 0x1a2a33, { metalness: 0.4, roughness: 0.15 });
  const tyre = mat(materials, ['tyre', 'tire', 'carTyre'], 0x141414, { roughness: 0.95 });
  const metal = mat(materials, ['metal', 'chrome'], 0xb8bcc0, { metalness: 0.9, roughness: 0.25 });
  const lightFront = mat(materials, ['headlight', 'lamp'], 0xfff2c0, { emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  const lightRear = mat(materials, ['taillight'], 0xc02020, { emissive: 0x900000, emissiveIntensity: 0.8 });

  const L = k.length;
  const W = k.width;

  // Main body: lower slab + hood/trunk shaping via a second slab.
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, k.bodyH, L), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // Cabin / windshield block.
  const cabinLen = kindName === 'truck' ? L * 0.28 : L * 0.48;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, k.cabinH, cabinLen), glass);
  cabin.position.set(0, 0.55 + k.bodyH / 2 + k.cabinH / 2 - 0.06, kindName === 'truck' ? L * 0.28 : -L * 0.04);
  cabin.castShadow = true;
  group.add(cabin);

  // Truck bed: open cargo box behind the cab.
  if (kindName === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.35, L * 0.5), paint);
    bed.position.set(0, 0.55 + k.bodyH / 2 + 0.1, -L * 0.22);
    bed.castShadow = true;
    group.add(bed);
  }

  // Wheels: cylinders with axis along X. Front pair steers (userData tracks it).
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(k.wheels, k.wheels, 0.24, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wx = W / 2 - 0.08;
  const wz = L / 2 - 0.85;
  const positions = [
    [-wx, wz, 'front-left'], [wx, wz, 'front-right'],
    [-wx, -wz, 'rear-left'], [wx, -wz, 'rear-right'],
  ];
  for (const [x, z, label] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.position.set(x, k.wheels, z);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(k.wheels * 0.45, k.wheels * 0.45, 0.26, 10), metal);
    hub.geometry.rotateZ(Math.PI / 2);
    wheel.add(hub);
    wheel.userData.steer = label.startsWith('front');
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights (front, +Z) and taillights (rear, -Z). Car faces +Z.
  const lampGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  for (const x of [-W / 2 + 0.32, W / 2 - 0.32]) {
    const hl = new THREE.Mesh(lampGeo, lightFront);
    hl.position.set(x, 0.62, L / 2 + 0.01);
    group.add(hl);
    const tl = new THREE.Mesh(lampGeo, lightRear);
    tl.position.set(x, 0.62, -L / 2 - 0.01);
    group.add(tl);
  }

  // Shaped-car details: chrome bumpers, dark grille, side mirrors and a
  // painted roof panel so the car reads as designed, not a bare box.
  const bumperGeo = new THREE.BoxGeometry(W * 0.96, 0.12, 0.16);
  for (const z of [L / 2 + 0.02, -L / 2 - 0.02]) {
    const bumper = new THREE.Mesh(bumperGeo, metal);
    bumper.position.set(0, 0.42, z);
    group.add(bumper);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.12, 0.06), tyre);
  grille.position.set(0, 0.6, L / 2 + 0.01);
  group.add(grille);
  const mirrorGeo = new THREE.BoxGeometry(0.1, 0.08, 0.22);
  for (const x of [-(W / 2 + 0.08), W / 2 + 0.08]) {
    const mirror = new THREE.Mesh(mirrorGeo, paint);
    mirror.position.set(x, 0.98, L * 0.18);
    group.add(mirror);
  }
  const roofPanel = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.78, 0.06, cabinLen * 0.92), paint,
  );
  roofPanel.position.set(0, 0.55 + k.bodyH / 2 + k.cabinH - 0.03, kindName === 'truck' ? L * 0.28 : -L * 0.04);
  group.add(roofPanel);

  // Police light bar: red left, blue right, flashed by the police system.
  let lightBar = null;
  if (kindName === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.3), metal);
    barBase.position.set(0, 0.55 + k.bodyH / 2 + k.cabinH + 0.02, -L * 0.04);
    group.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0xd02020, emissiveIntensity: 1 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2040d0, emissive: 0x2040d0, emissiveIntensity: 1 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.26), redMat);
    red.position.set(-0.22, 0.55 + k.bodyH / 2 + k.cabinH + 0.08, -L * 0.04);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.26), blueMat);
    blue.position.set(0.22, 0.55 + k.bodyH / 2 + k.cabinH + 0.08, -L * 0.04);
    group.add(red, blue);
    // Additive glow halos so the flash reads at distance, not just on the bar.
    const glowTex = makeGlowTexture();
    const barY = 0.55 + k.bodyH / 2 + k.cabinH + 0.1;
    function glowSprite(color, x) {
      const m = new THREE.SpriteMaterial({
        map: glowTex, color, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Sprite(m);
      s.position.set(x, barY, -L * 0.04);
      s.scale.setScalar(1.6);
      group.add(s);
      return s;
    }
    const redSprite = glowSprite(0xff2020, -0.22);
    const blueSprite = glowSprite(0x2050ff, 0.22);
    lightBar = { red, blue, redMat, blueMat, redSprite, blueSprite };
    // Black-and-white doors: dark stripe along the body.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.2, L * 0.7), mat(materials, ['policeStripe'], 0x1c1c20, { roughness: 0.6 }));
    stripe.position.y = 0.55;
    group.add(stripe);
  }

  // Gold Aurelio GT: low spoiler and gold trim.
  if (kindName === 'gold') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.06, 0.3), metal);
    spoiler.position.set(0, 0.95, -L / 2 + 0.15);
    group.add(spoiler);
  }

  group.userData.kind = kindName;
  group.userData.colour = colourName;
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  group.userData.length = L;
  group.userData.width = W;
  group.userData.wheelRadius = k.wheels;
  // Facing: +Z at rotation.y = 0. Forward vector is (sin ry, 0, cos ry).
  group.userData.forward = { x: 0, z: 1 };

  return group;
}
