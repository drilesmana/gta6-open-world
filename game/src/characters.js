// Velora Heat — character factory.
// A person is a small articulated figure: torso, head with hair/cap, arms and
// legs on named pivots so walk and punch animations read. Material zones
// (skin, shirt, pants) vary per pedestrian; the player has a fixed look.
// Collision stays a capsule proxy, separate from the visual group.
import { createMaterials } from './materials.js';
import { PALETTE } from './config.js';
import { pick } from './util.js';

let GEO = null;
function geo() {
  if (GEO) return GEO;
  const torso = new THREE.CapsuleGeometry(0.26, 0.5, 4, 8);
  const head = new THREE.SphereGeometry(0.21, 12, 10);
  const limb = new THREE.CapsuleGeometry(0.09, 0.5, 4, 6);
  const hair = new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  GEO = { torso, head, limb, hair };
  return GEO;
}

export function makePerson(opts = {}) {
  const mats = createMaterials();
  const g = geo();
  const isPlayer = !!opts.player;
  const skin = mats.skin[opts.skin ?? (isPlayer ? 1 : Math.floor(Math.random() * mats.skin.length))];
  const shirt = mats.shirt[opts.shirt ?? (isPlayer ? 0 : Math.floor(Math.random() * mats.shirt.length))];
  const pants = mats.pants[opts.pants ?? Math.floor(Math.random() * mats.pants.length)];

  const root = new THREE.Group();
  root.name = opts.player ? 'player' : 'pedestrian';

  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);

  const torso = new THREE.Mesh(g.torso, shirt);
  torso.position.y = 0.32;
  torso.castShadow = isPlayer;
  hips.add(torso);

  const headG = new THREE.Group();
  headG.position.y = 0.78;
  const head = new THREE.Mesh(g.head, skin);
  head.castShadow = isPlayer;
  headG.add(head);
  const hair = new THREE.Mesh(g.hair, mats.hair);
  hair.position.y = 0.03;
  headG.add(hair);
  if (isPlayer) {
    // The player's gold cap: the silhouette cue that marks the hero.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.23, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.6 }),
    );
    cap.position.y = 0.16;
    headG.add(cap);
    const brim = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.03, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.6 }),
    );
    brim.position.set(0, 0.13, 0.22);
    headG.add(brim);
  }
  hips.add(headG);

  function limbPair(side) {
    const arm = new THREE.Group();
    arm.position.set(0.32 * side, 0.58, 0);
    const armMesh = new THREE.Mesh(g.limb, shirt);
    armMesh.position.y = -0.28;
    armMesh.castShadow = isPlayer;
    arm.add(armMesh);
    hips.add(arm);

    const leg = new THREE.Group();
    leg.position.set(0.14 * side, 0.02, 0);
    const legMesh = new THREE.Mesh(g.limb, pants);
    legMesh.position.y = -0.46;
    legMesh.castShadow = isPlayer;
    leg.add(legMesh);
    root.add(leg);
    return { arm, leg };
  }
  const left = limbPair(-1);
  const right = limbPair(1);

  // Contact blob under the feet.
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mats.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  root.add(blob);

  const rig = {
    root, hips, head: headG,
    armL: left.arm, armR: right.arm, legL: left.leg, legR: right.leg,
    walkPhase: Math.random() * Math.PI * 2,
    // Procedural walk: limbs swing in opposition, hips bob, arms counter-swing.
    walk(dt, speed01) {
      this.walkPhase += dt * (4 + speed01 * 7);
      const s = Math.sin(this.walkPhase) * (0.25 + speed01 * 0.55);
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      this.armL.rotation.x = -s * 0.8;
      this.armR.rotation.x = s * 0.8;
      this.hips.position.y = 0.98 + Math.abs(Math.cos(this.walkPhase)) * 0.05 * speed01;
      // Lean into a sprint: the faster the walk, the more the torso tips forward.
      this.hips.rotation.x = speed01 * 0.14;
    },
    idle(dt, t) {
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      this.armL.rotation.x = Math.sin(t * 1.4) * 0.06;
      this.armR.rotation.x = -Math.sin(t * 1.4) * 0.06;
      this.hips.position.y = 0.98 + Math.sin(t * 1.8) * 0.012;
      this.hips.rotation.x = 0;
    },
    // Punch: right arm snaps forward, torso twists.
    punch(progress) {
      // progress 0..1 across the punch.
      const reach = Math.sin(progress * Math.PI);
      this.armR.rotation.x = -1.5 * reach;
      this.hips.rotation.y = -0.35 * reach;
      this.armL.rotation.x = 0.3 * reach;
    },
    resetPunch() {
      this.armR.rotation.x = 0;
      this.hips.rotation.y = 0;
    },
  };
  return rig;
}
