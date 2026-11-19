// Velora Heat — missions and story.
// Four jobs, one arc: Dario drives a fare, runs a package, loses the heat,
// then steals the Aurelio GT to clear the garage debt. Each job is a set of
// stages with a beacon marker, a HUD objective and a briefing card. The
// manager only reaches the game through the `world` object main.js hands it.
import { MISSIONS } from './config.js';
import { LANDMARKS } from './city.js';
import { createMaterials } from './materials.js';

// Where each job's giver stands (a declined job waits at its giver).
const GIVER_SPOT = {
  fare: () => LANDMARKS.promenadeFare,
  package: () => LANDMARKS.garage,
  heat: () => LANDMARKS.garage,
  score: () => LANDMARKS.garage,
};

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // next mission to offer
    this.active = null; // { def, stage, data }
    this.marker = null; // { x, z } or null
    this.waiting = false; // offered but declined; the marker sits at the giver
    this.storyDone = false;
    this.pulse = 0;
    this.beacon = this.buildBeacon(scene);
  }

  // The beacon: a light pillar, a pulsing ground ring and a floating diamond.
  buildBeacon(scene) {
    const mats = createMaterials();
    const beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.4, 26, 12, 1, true),
      mats.beacon,
    );
    pillar.position.y = 13;
    beacon.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    beacon.add(ring);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      new THREE.MeshStandardMaterial({ color: 0x201808, emissive: 0xffc46b, emissiveIntensity: 3 }),
    );
    gem.position.y = 4.2;
    beacon.add(gem);
    this.beaconRing = ring;
    this.beaconGem = gem;
    beacon.visible = false;
    scene.add(beacon);
    return beacon;
  }

  get currentDef() {
    return MISSIONS[this.index] ?? null;
  }

  offer() {
    return this.currentDef;
  }

  // Begin the offered mission. Returns its definition for the HUD.
  start(world) {
    const def = this.currentDef;
    if (!def) return null;
    this.active = { def, stage: 0, data: {} };
    this.waiting = false;
    this.setupStage(world);
    return def;
  }

  decline() {
    this.waiting = true;
    const def = this.currentDef;
    if (def) {
      const g = GIVER_SPOT[def.id]();
      this.setMarker(g.x, g.z);
    }
  }

  // Walk up to the giver and press E to start a declined mission.
  tryStartAt(x, z, world) {
    if (this.active || !this.waiting || !this.currentDef) return false;
    const g = GIVER_SPOT[this.currentDef.id]();
    if (Math.hypot(x - g.x, z - g.z) < 5) {
      this.start(world);
      return true;
    }
    return false;
  }

  setMarker(x, z) {
    this.marker = { x, z };
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
  }

  clearMarker() {
    this.marker = null;
    this.beacon.visible = false;
  }

  // Point the player at the current stage: marker, objective, flavour.
  setupStage(world) {
    const { def, stage, data } = this.active;
    const L = LANDMARKS;
    if (def.id === 'fare') {
      if (stage === 0) {
        this.setMarker(L.promenadeFare.x, L.promenadeFare.z);
        world.setObjective('Job · First Fare', 'Pick up Mrs. Alvarez at the promenade', 'Any car will do — hers is in the shop.');
      } else {
        this.setMarker(L.gallery.x, L.gallery.z);
        world.setObjective('Job · First Fare', 'Drive Mrs. Alvarez to the Calle Verde gallery', 'Smooth driving, no sirens.');
        world.subtitle('Mrs. Alvarez', '“The gallery, dear. And do mind the kerbs.”');
      }
      return;
    }
    if (def.id === 'package') {
      if (stage === 0) {
        this.setMarker(L.cafe.x, L.cafe.z);
        world.setObjective('Job · The Package', 'Pick up the package at Café Alba', 'On foot is quieter. Mostly.');
      } else {
        this.setMarker(L.garage.x, L.garage.z);
        world.setObjective('Job · The Package', 'Carry the package to the garage', 'A rival crew is on the street. Keep moving.');
        world.police.setLevel(2);
        world.subtitle('Nia', '“They heard about the parcel. Run the back streets!”');
        // A rival crew car: a gold coupe that hunts the player until delivery.
        const rival = world.traffic.makeCar('sport', 0xd9a441);
        rival.driver = 'ai';
        rival.setPose(world.player.x + 40, world.player.z - 30, 0);
        data.rival = rival;
      }
      return;
    }
    if (def.id === 'heat') {
      this.setMarker(L.safehouse.x, L.safehouse.z);
      world.setObjective('Job · Lose the Heat', 'Reach the market safehouse', 'Three stars. Break line of sight, then run.');
      world.police.setLevel(3);
      world.subtitle('Nia', '“The whole department is out. The safehouse, Dario. Go!”');
      return;
    }
    if (def.id === 'score') {
      if (stage === 0) {
        this.setMarker(L.marina.x, L.marina.z);
        world.setObjective('Job · The Big Score', 'Find the Aurelio GT at the marina', 'Sunset gold, one of one. It is parked by the water.');
        // Park the prize: a gold sport coupe by the marina.
        const prize = world.traffic.spawnParked(L.marina.x - 4, L.marina.z + 6, Math.PI / 2, 'sport', 0xd9a441);
        data.prize = prize;
        prize.isPrize = true;
      } else {
        this.setMarker(L.garage.x, L.garage.z);
        world.setObjective('Job · The Big Score', 'Bring the Aurelio GT to the garage', 'Lose the tail first if you can. The debt ends tonight.');
        world.subtitle('Sal', '“That car clears everything, Dario. Everything.”');
      }
    }
  }

  complete(world) {
    const { def, data } = this.active;
    if (data.rival) {
      world.traffic.removeCar(data.rival);
      data.rival = null;
    }
    world.addCash(def.reward);
    world.sfx.missionDone();
    world.vfx.cashBurst(world.player.x, 1.5, world.player.z);
    world.toast(`Job done · +$${def.reward}`, 'cash');
    this.active = null;
    this.clearMarker();
    this.index++;
    world.save();
    if (this.index >= MISSIONS.length) {
      this.storyDone = true;
      world.onStoryComplete();
    } else {
      // Offer the next job right away so the story keeps moving.
      world.offerNext();
    }
    return def;
  }

  // Returns 'complete' when a stage (or the mission) finishes.
  update(dt, world) {
    this.pulse += dt;
    if (this.beacon.visible) {
      const s = 1 + Math.sin(this.pulse * 3) * 0.12;
      this.beaconRing.scale.set(s, s, s);
      this.beaconGem.rotation.y += dt * 1.5;
      this.beaconGem.position.y = 4.2 + Math.sin(this.pulse * 2) * 0.35;
    }
    if (!this.active) return null;
    const { def, stage, data } = this.active;
    const p = world.player;
    const px = p.vehicle ? p.vehicle.x : p.x;
    const pz = p.vehicle ? p.vehicle.z : p.z;
    const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;
    const L = LANDMARKS;

    if (def.id === 'fare') {
      if (stage === 0 && near(L.promenadeFare.x, L.promenadeFare.z, 5)) {
        this.active.stage = 1;
        this.setupStage(world);
        world.subtitle('Mrs. Alvarez', '“Ah, there you are. The gallery, please.”');
      } else if (stage === 1 && near(L.gallery.x, L.gallery.z, 7)) {
        this.complete(world);
        return 'complete';
      }
    } else if (def.id === 'package') {
      if (stage === 0 && near(L.cafe.x, L.cafe.z, 4)) {
        this.active.stage = 1;
        this.setupStage(world);
        world.toast('Package picked up', 'cash');
      } else if (stage === 1) {
        // The rival hunts the player until the delivery lands.
        if (data.rival) world.police.drivePursuit(data.rival, dt, px, pz);
        if (near(L.garage.x, L.garage.z, 6)) {
          this.complete(world);
          return 'complete';
        }
      }
    } else if (def.id === 'heat') {
      if (near(L.safehouse.x, L.safehouse.z, 6)) {
        world.police.clear();
        this.complete(world);
        return 'complete';
      }
    } else if (def.id === 'score') {
      if (stage === 0) {
        // The stage advances when the player takes the prize car.
        if (p.vehicle && p.vehicle.isPrize) {
          this.active.stage = 1;
          this.setupStage(world);
          world.police.addCrime(25, 'grand-theft-auto');
          world.toast('The Aurelio GT is yours', 'bad');
        }
      } else if (stage === 1 && p.vehicle && p.vehicle.isPrize && near(L.garage.x, L.garage.z, 7)) {
        this.complete(world);
        return 'complete';
      }
    }
    return null;
  }

  objectiveText() {
    if (this.active) {
      const { def, stage } = this.active;
      if (def.id === 'fare') return stage === 0 ? 'Pick up Mrs. Alvarez' : 'Drive to the gallery';
      if (def.id === 'package') return stage === 0 ? 'Pick up the package' : 'Deliver to the garage';
      if (def.id === 'heat') return 'Reach the safehouse';
      if (def.id === 'score') return stage === 0 ? 'Find the Aurelio GT' : 'Deliver the Aurelio GT';
    }
    if (this.waiting && this.currentDef) return `Job waiting: ${this.currentDef.title}`;
    return 'Free roam — steal a car, take a job';
  }
}
