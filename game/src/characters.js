import * as THREE from 'three';

// Low-poly people for Velora Heat. A person is a small group: torso, head, two
// legs pivoted at the hip and two arms pivoted at the shoulder, so the walk
// swing can rotate the limbs around their joints. The pedestrian system and
// the player drive the swing with swingWalk(); the root group's position is
// owned by whoever spawns the person, and the swing only touches the inner
// rig so it never fights the owner's positioning.

function mat(dict, keys, color, opts = {}) {
  const d = dict || {};
  for (const k of keys) {
    const m = d[k];
    if (m && m.isMaterial) return m;
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.0,
    ...opts,
  });
}

const SKIN = [0xd9a066, 0xc98d5a, 0x8a5a3b, 0xe8b98a];
const HAIR = [0x2a1c12, 0x111111, 0x5a3a1a, 0x777777];
const SHIRTS = {
  dario: 0xe85d4a,
  nia: 0x2a9d8f,
  police: 0x1f2a44,
  pedestrian: 0xdddddd,
};
const PED_SHIRTS = [0xe9c46a, 0xf4a261, 0x2a9d8f, 0x8ab17d, 0xe07a5f, 0x6d9dc5, 0xbc6c25, 0x90a955];
const PANTS = {
  dario: 0x23232e,
  nia: 0x3a3a4a,
  police: 0x141824,
  pedestrian: 0x4a4a55,
};

function limb(width, length, material, pivotY) {
  // A pivot group at the joint; the visible box hangs below it so rotating
  // the pivot swings the limb around the joint instead of its centre.
  const pivot = new THREE.Group();
  pivot.position.y = pivotY;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, width), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

// makePerson(variant, materials): variant is 'dario' | 'nia' | 'police' |
// 'pedestrian'. Returns a THREE.Group with the person. The group carries in
// userData: variant, the four limb pivots (legL, legR, armL, armR), the rig
// group that bobs while walking, and the person's height.
export function makePerson(variant, materials) {
  const v = SHIRTS[variant] !== undefined ? variant : 'pedestrian';
  const skin = mat(materials, ['skin', 'personSkin'], SKIN[Math.floor(Math.random() * SKIN.length)]);
  const hair = mat(materials, ['hair', 'personHair'], HAIR[Math.floor(Math.random() * HAIR.length)]);
  const shirtColor = v === 'pedestrian'
    ? PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)]
    : SHIRTS[v];
  const shirt = mat(materials, ['shirt', 'cloth', 'clothing'], shirtColor);
  const pants = mat(materials, ['pants', 'trousers', 'cloth'], PANTS[v]);
  const shoe = mat(materials, ['shoe', 'tyre', 'dark'], 0x1a1a1a);

  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  // Torso.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  rig.add(torso);

  // Head + hair cap.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  rig.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.3), hair);
  cap.position.y = 1.83;
  rig.add(cap);
  if (v === 'police') {
    // Flat police cap brim.
    const brim = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.04, 0.4),
      mat(materials, ['policeCap', 'dark'], 0x10131f),
    );
    brim.position.y = 1.8;
    rig.add(brim);
  }

  // Legs pivoted at the hip (y ~0.92), arms pivoted at the shoulder (y ~1.42).
  const legL = limb(0.16, 0.88, pants, 0.92);
  legL.position.x = -0.12;
  const legR = limb(0.16, 0.88, pants, 0.92);
  legR.position.x = 0.12;
  const armL = limb(0.12, 0.62, shirt, 1.42);
  armL.position.x = -0.3;
  const armR = limb(0.12, 0.62, shirt, 1.42);
  armR.position.x = 0.3;
  // Shoes at the bottom of each leg.
  for (const leg of [legL, legR]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.3), shoe);
    foot.position.set(0, -0.9, 0.05);
    leg.add(foot);
  }
  rig.add(legL, legR, armL, armR);

  group.userData.variant = v;
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.rig = rig;
  group.userData.height = 1.88;
  group.userData.baseY = 0;
  return group;
}

// swingWalk(person, phase, amp): drive the walk cycle. phase advances with
// distance walked; amp is the swing size in radians (0 = standing still).
// Legs counter-swing, arms swing opposite to the legs, and the rig bobs a
// touch so the walk reads as a walk instead of a slide.
export function swingWalk(person, phase, amp = 0.55) {
  const u = person.userData;
  if (!u.legL || !u.legR || !u.armL || !u.armR) return;
  const s = Math.sin(phase);
  u.legL.rotation.x = s * amp;
  u.legR.rotation.x = -s * amp;
  u.armL.rotation.x = -s * amp * 0.7;
  u.armR.rotation.x = s * amp * 0.7;
  if (u.rig) {
    u.rig.position.y = Math.abs(Math.cos(phase)) * 0.035 * Math.min(amp / 0.55, 1);
  }
}
