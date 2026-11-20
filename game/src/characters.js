// characters.js — Velora Heat (chunk 2)
// Low-poly people for pedestrians and the player. Built from the spec contract
// only: makePerson(variant, materials) returns a person group (body, head, legs,
// arms) whose walk swing the pedestrian / player systems drive via
// group.userData.applyWalk(phase, amount).
// THREE comes from the global loaded by index.html (./vendor/three.min.js).

function three() {
  const T = globalThis.THREE;
  if (!T) throw new Error('THREE global is not loaded — index.html must load ./vendor/three.min.js before main.js');
  return T;
}

// Fallback material when the shared dictionary has no matching key.
function mat(materials, keys, color, opts) {
  if (materials) {
    for (const k of keys) {
      if (materials[k]) return materials[k];
    }
  }
  const THREE = three();
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.0,
    ...(opts || {}),
  });
}

// Skin tones and shirt colours cycled for crowd variety.
const SKINS = [0xc9997a, 0xa9745a, 0xd9a986, 0x8a5a3d, 0xe8b98f];
const SHIRTS = [0xe8e0d0, 0xd96a5f, 0x3f7d7a, 0xe0a83c, 0x5a6b8a, 0x7a9a5a, 0xc96a9a, 0x8a5a7a];
const PANTS = [0x2e3440, 0x4a3a30, 0x3a4a5a, 0x5a5a5a, 0x2a3a2a];

// Deterministic small hash so a variant name always maps to the same look.
function hashName(name) {
  let h = 0;
  const s = String(name || 'walker');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function makePerson(variant, materials) {
  const THREE = three();
  const h = hashName(variant);
  const name = String(variant || 'walker').toLowerCase();

  // Dario, the player: coral jacket, dark trousers, taller stance.
  // Nia: teal top. Everyone else cycles the crowd palette by name hash.
  let shirt = SHIRTS[h % SHIRTS.length];
  let pants = PANTS[(h >> 3) % PANTS.length];
  let skin = SKINS[(h >> 5) % SKINS.length];
  let scale = 1;
  if (name === 'dario') {
    shirt = 0xd96a5f; // coral jacket
    pants = 0x2e3440;
    skin = 0xc9997a;
    scale = 1.02;
  } else if (name === 'nia') {
    shirt = 0x3f7d7a; // teal top
    pants = 0x2e3440;
    skin = 0xd9a986;
    scale = 0.96;
  }

  const skinMat = mat(materials, ['skin', 'personSkin'], skin);
  const shirtMat = mat(materials, ['shirt', 'personShirt', 'cloth'], shirt);
  const pantsMat = mat(materials, ['pants', 'personPants', 'clothDark'], pants);
  const hairMat = mat(materials, ['hair', 'personHair'], 0x241a12, { roughness: 0.95 });

  const group = new THREE.Group();
  group.name = 'person-' + name;

  // Legs pivot at the hip so the swing rotates around the top of the leg.
  function limb(w, len, material, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const geo = new THREE.BoxGeometry(w, len, w * 0.9);
    geo.translate(0, -len / 2, 0); // hang below the pivot
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }

  const leftLeg = limb(0.17, 0.52, pantsMat, -0.11, 0.78);
  const rightLeg = limb(0.17, 0.52, pantsMat, 0.11, 0.78);
  const leftArm = limb(0.12, 0.5, shirtMat, -0.29, 1.32);
  const rightArm = limb(0.12, 0.5, shirtMat, 0.29, 1.32);

  const bodyGeo = new THREE.BoxGeometry(0.46, 0.58, 0.26);
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 1.07;
  body.castShadow = true;

  const headGeo = new THREE.BoxGeometry(0.27, 0.28, 0.26);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.52;
  head.castShadow = true;

  const hairGeo = new THREE.BoxGeometry(0.29, 0.1, 0.28);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.68;
  hair.castShadow = true;

  group.add(leftLeg, rightLeg, leftArm, rightArm, body, head, hair);
  group.scale.setScalar(scale);

  // Walk swing: phase advances with distance walked; amount 0..1 fades it in/out.
  // Legs swing opposite, arms counter-swing. Called by pedestrians / player.
  function applyWalk(phase, amount) {
    const a = amount === undefined ? 1 : amount;
    const swing = Math.sin(phase) * 0.55 * a;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.8;
    rightArm.rotation.x = swing * 0.8;
  }

  group.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm };
  group.userData.body = body;
  group.userData.head = head;
  group.userData.applyWalk = applyWalk;
  group.userData.variant = name;
  group.userData.walkPhase = 0;

  return group;
}
