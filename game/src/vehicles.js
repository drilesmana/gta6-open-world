// Velora Heat — vehicle factory.
// Authored silhouettes per role (authoring-recipes.md: hero vehicle):
// a tapered body, a glass cabin, wheels that steer and spin, headlights and
// taillights as emissive signals, bumpers, grille, and a state cue (police
// light bar, taxi sign). One collision proxy per car, kept separate from the
// visual group. Cars share geometries; paint differs per car.
import { carPaintMaterial, createMaterials } from './materials.js';
import { PALETTE } from './config.js';

let GEO = null;
function geo() {
  if (GEO) return GEO;
  // Body: a box with a sloped hood/trunk via vertex shaping — a tapered hull
  // reads as a car silhouette even before paint or glass.
  const body = new THREE.BoxGeometry(1.9, 0.62, 4.4, 1, 1, 4);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    // Taper the nose and tail down, narrow the nose slightly.
    if (z > 1.4) {
      pos.setY(i, y - 0.16);
      pos.setX(i, pos.getX(i) * 0.92);
    } else if (z < -1.4) {
      pos.setY(i, y - 0.1);
    }
  }
  body.computeVertexNormals();
  const cabin = new THREE.BoxGeometry(1.62, 0.58, 2.2, 1, 1, 2);
  const cp = cabin.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const z = cp.getZ(i);
    const y = cp.getY(i);
    if (z > 0.6) cp.setY(i, y - 0.2);
    if (z < -0.6) cp.setY(i, y - 0.14);
  }
  cabin.computeVertexNormals();
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  wheel.rotateZ(Math.PI / 2);
  const truckBed = new THREE.BoxGeometry(1.9, 0.9, 2.4);
  GEO = { body, cabin, wheel, truckBed };
  return GEO;
}

// type: 'sedan' | 'coupe' | 'taxi' | 'truck' | 'police' | 'sport'
export function makeCar(type = 'sedan', colorHex = null) {
  const mats = createMaterials();
  const g = geo();
  const root = new THREE.Group();
  root.name = `car-${type}`;

  const paintHex = colorHex ?? PALETTE.carPaint[Math.floor(Math.random() * PALETTE.carPaint.length)];
  const paint = type === 'police'
    ? new THREE.MeshStandardMaterial({ color: PALETTE.policeWhite, roughness: 0.4, metalness: 0.1 })
    : carPaintMaterial(paintHex);

  const body = new THREE.Mesh(g.body, paint);
  body.position.y = 0.62;
  body.castShadow = true;
  root.add(body);

  let cabinMat = mats.carGlass;
  let cabinScale = 1;
  if (type === 'coupe' || type === 'sport') cabinScale = 0.82;
  const cabin = new THREE.Mesh(g.cabin, cabinMat);
  cabin.position.set(0, 1.12, -0.25);
  cabin.scale.set(cabinScale, 0.92, cabinScale);
  cabin.castShadow = true;
  root.add(cabin);

  if (type === 'truck') {
    const bed = new THREE.Mesh(g.truckBed, paint);
    bed.position.set(0, 0.95, -1.4);
    bed.castShadow = true;
    root.add(bed);
    cabin.position.z = 0.9;
  }

  // Bumpers + grille + trim.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.18, 0.24), mats.trimDark);
  bumperF.position.set(0, 0.42, 2.18);
  root.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.18;
  root.add(bumperR);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.06), mats.chrome);
  grille.position.set(0, 0.62, 2.22);
  root.add(grille);

  // Headlights (warm emissive) and taillights (red emissive).
  const hlGeo = new THREE.BoxGeometry(0.42, 0.14, 0.06);
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(hlGeo, mats.headlight);
    hl.position.set(sx, 0.72, 2.21);
    root.add(hl);
    const tl = new THREE.Mesh(hlGeo, mats.taillight);
    tl.position.set(sx, 0.72, -2.21);
    root.add(tl);
  }

  // Side mirrors: small dark tabs that read at street distance.
  for (const sx of [-0.98, 0.98]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.22), mats.trimDark);
    mirror.position.set(sx, 1.02, 0.62);
    root.add(mirror);
  }

  // Wheels: steer the front pair, spin all four. One mesh per wheel keeps
  // the draw-call budget in reach (a separate hubcap would cost 4 more per car).
  const wheels = [];
  const wheelSpots = [
    { x: -0.85, z: 1.45, front: true },
    { x: 0.85, z: 1.45, front: true },
    { x: -0.85, z: -1.45, front: false },
    { x: 0.85, z: -1.45, front: false },
  ];
  for (const s of wheelSpots) {
    const pivot = new THREE.Group();
    pivot.position.set(s.x, 0.36, s.z);
    const tire = new THREE.Mesh(g.wheel, mats.tire);
    tire.castShadow = true;
    pivot.add(tire);
    pivot.userData.front = s.front;
    root.add(pivot);
    wheels.push(pivot);
  }

  // Role cues.
  let lightBar = null;
  if (type === 'police') {
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.34), mats.trimDark);
    base.position.y = 0.05;
    bar.add(base);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 3 }),
    );
    red.position.set(-0.28, 0.14, 0);
    bar.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2244ff, emissiveIntensity: 3 }),
    );
    blue.position.set(0.28, 0.14, 0);
    bar.add(blue);
    bar.position.set(0, 1.42, -0.25);
    root.add(bar);
    lightBar = { red, blue };
    // Black doors: a dark band along the body sides.
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.3, 2.0), new THREE.MeshStandardMaterial({ color: PALETTE.policeBlack, roughness: 0.5 }));
    band.position.set(0, 0.62, -0.2);
    root.add(band);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xf2b705, emissiveIntensity: 1.8 }),
    );
    sign.position.set(0, 1.5, -0.25);
    root.add(sign);
  }
  if (type === 'sport') {
    // Low spoiler, the "one-of-one" cue for the final mission's coupe.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.4), mats.trimDark);
    wing.position.set(0, 1.05, -2.05);
    root.add(wing);
    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), mats.trimDark);
    strutL.position.set(-0.6, 0.92, -2.05);
    root.add(strutL);
    const strutR = strutL.clone();
    strutR.position.x = 0.6;
    root.add(strutR);
  }

  // Contact blob: grounds the car without a shadow-map cost for every car.
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.2),
    mats.blob,
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  root.add(blob);

  return { root, wheels, lightBar, paint };
}
