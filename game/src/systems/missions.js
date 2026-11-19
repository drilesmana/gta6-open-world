// The three jobs and the repeatable courier gig: briefs, stages, markers, timers, the rival who
// runs with the case, and the rules for winning and losing each one. Nothing here draws; it sets
// state the HUD and the rest of the game read.
// A saved chapter indexes the next briefing; transient targets, pins and timers are not serialized.

import * as U from '../core/util.js';
import { Vehicle } from '../entities/vehicle.js';

export const STORY = [
  {
    id: 'parcel',
    chapter: 1,
    tab: 'Chapter One',
    title: 'Hot Parcel',
    brief: 'Bima left a parcel at the beach café and a note that says not to be late. Take the car, '
      + 'pick it up, and run it down to the pier. The crew on the containers will be watching, so keep '
      + 'your foot in it. Three minutes, Rafi.',
    reward: 450,
    target: 'cafe',
    end: 'pier',
  },
  {
    id: 'courier',
    chapter: 2,
    tab: 'Chapter Two',
    title: 'The Courier',
    brief: 'A coupe took the case off the promenade. It is heading east through Market Row. Ram it '
      + 'until it stops, take the case back, and bring it to the garage. Two minutes before it is '
      + 'gone for good.',
    reward: 900,
    target: 'market',
    end: 'garage',
  },
  {
    id: 'sunset',
    chapter: 3,
    tab: 'Chapter Three',
    title: 'Sunset Run',
    brief: 'The deed is in a Bayu GT parked on the pier. Take the car and drive it home with the whole '
      + 'department on you. Three stars the moment you touch it, and the garage door has to close '
      + 'behind you. Two and a half minutes.',
    reward: 1500,
    target: 'pier',
    end: 'garage',
  },
];

const GIG_SPOTS = ['cafe', 'market', 'radio', 'tower', 'garage'];

export class Missions {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.completed = [];
    this.marker = null;
    this.target = null;
    this.timer = 0;
    this.coolDown = 0;
    this.gig = null;
    this.gigCool = 25;
    this.carry = null;
  }

  get storyReady() {
    const next = STORY[this.game.progress.chapter] ?? null;
    return next && !this.active ? next : null;
  }

  briefFor(job) {
    this.game.showBrief(job);
  }

  // A story job starts: marker at its first target, objective on the HUD.
  begin(job) {
    const g = this.game;
    this.active = { id: job.id, job, stage: 0, data: {} };
    this.timer = 0;
    const spot = g.city.missionSpots[job.target];
    this.marker = { x: spot.x, z: spot.z + 6, label: job.id === 'parcel' ? 'The café' : job.id === 'courier' ? 'Market Row' : 'The pier' };
    g.hud.setObjective(`Chapter ${job.chapter}: ${job.title}`, this.stageText(0), 'Follow the gold marker');
    g.hud.say('BIMA', 'Go on then. Don\'t make me come looking.', 4);
    g.audio.missionStart();
    g.save();
    if (job.id === 'courier') this.spawnCourier();
    if (job.id === 'sunset') this.spawnDeedCar();
  }

  stageText(stage) {
    const job = this.active?.job;
    if (!job) return '';
    // Courier gigs carry one line for the whole run; without it the HUD objective would be
    // rewritten empty every frame and vanish.
    if (job.id === 'gig') {
      return this.active.gigDrop ? this.active.gigDrop : 'Run the packet across the bay.';
    }
    if (stage === 0) {
      if (job.id === 'parcel') return 'Pick up the parcel at the beach café.';
      if (job.id === 'courier') return 'Reach Market Row and find the coupe.';
      return 'Steal the Bayu GT parked on the pier.';
    }
    if (stage === 1) {
      if (job.id === 'parcel') return 'Run the parcel to the pier.';
      if (job.id === 'courier') return 'Ram the coupe until it stops.';
      return 'Drive the deed car to the garage.';
    }
    if (stage === 2) return job.id === 'courier' ? 'Grab the case off the road.' : 'Take the case to the garage.';
    if (stage === 3) return 'Take the case to the garage.';
    return '';
  }

  spawnCourier() {
    const spot = this.game.city.missionSpots.market;
    const node = this.game.roads.nearestNode(spot.x, spot.z);
    const car = new Vehicle(this.game.scene, 'coupe', 0x2f3a44, node.x + 3.6, node.z + 12, 0);
    car.driver = 'waiting';
    car.ai = { to: this.game.roads.nodeAt(node.i, node.j + 1) ?? node, from: node, stuck: 0, honk: 2, patience: 0 };
    car.health = 150;
    car.spec = { ...car.spec, max: 33, accel: 13 };
    this.game.traffic.all.push(car);
    this.active.data.car = car;
    this.active.data.escaped = 0;
    this.target = { x: car.x, z: car.z };
  }

  spawnDeedCar() {
    const spot = this.game.city.missionSpots.pier;
    const car = new Vehicle(this.game.scene, 'coupe', 0xe8b34a, spot.x + 6, spot.z + 8, Math.PI);
    car.driver = null;
    car.parked = true;
    car.deed = true;
    this.game.traffic.all.push(car);
    this.active.data.car = car;
    this.marker = { x: car.x, z: car.z, label: 'The deed car' };
  }

  farNode(x, z) {
    const nodes = this.game.city.roadNodes;
    let best = nodes[0];
    let bd = -1;
    for (const n of nodes) {
      const d = U.dist(n.x, n.z, x, z);
      if (d > bd && d < 170) { bd = d; best = n; }
    }
    return best;
  }

  // E next to the marker.
  interact() {
    const g = this.game;
    if (!this.active) {
      const job = this.storyReady;
      if (job && this.marker && U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 7) {
        this.briefFor(job);
        return;
      }
      if (this.gig && U.dist(g.player.x, g.player.z, this.gig.x, this.gig.z) < 6) {
        this.runGig();
      }
      return;
    }
    const job = this.active.job;
    const near = this.marker && U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 8;

    if (job.id === 'gig' && near) return this.win();

    if (this.active.stage === 0 && near) {
      if (job.id === 'parcel') {
        this.active.stage = 1;
        this.timer = 170;
        this.carry = this.buildCrate();
        g.wanted.pin(2);
        const pier = g.city.missionSpots.pier;
        this.marker = { x: pier.x, z: pier.z, label: 'The pier drop' };
        g.hud.setObjective('Hot Parcel', 'Run the parcel to the pier.', 'The crew is watching — keep moving');
        g.hud.say('BIMA', 'They clocked you already. Move!', 4);
        g.audio.missionStart();
        return;
      }
      if (job.id === 'courier') {
        this.active.stage = 1;
        this.active.data.car.driver = 'flee';
        this.timer = 120;
        g.wanted.pin(1);
        g.hud.setObjective('The Courier', 'Ram the coupe until it stops.', 'Take the case back');
        g.hud.say('BIMA', 'He is running east. Put him in the wall.', 4);
        return;
      }
      if (job.id === 'sunset') {
        g.hud.say('RAFI', 'Door is open. Get in.', 3);
        return;
      }
    }
    if (this.active.stage === 1 && job.id === 'parcel' && near) return this.win();
    // The recovered case must reach home; picking it up never completes the job.
  }

  buildCrate() {
    const THREE = globalThis.THREE;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.4, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 }),
    );
    box.position.set(0, 1.02, 0.34);
    this.game.player.body.add(box);
    return box;
  }

  onEnterVehicle(car) {
    const job = this.active;
    if (!job) return;
    if (job.job.id === 'sunset' && job.stage === 0 && car === job.data.car) {
      job.stage = 1;
      this.timer = 150;
      this.game.wanted.pin(3);
      const home = this.game.city.missionSpots.garage;
      this.marker = { x: home.x, z: home.z + 12, label: 'The garage' };
      this.game.hud.setObjective('Sunset Run', 'Drive the deed car to the garage.', 'Three stars until you are home');
      this.game.hud.say('BIMA', 'That is half the department. Do not stop.', 4);
    }
  }

  update(dt) {
    const g = this.game;
    this.gigCool = Math.max(0, this.gigCool - dt);
    if (this.active) {
      const job = this.active.job;
      if (this.timer > 0) {
        this.timer -= dt;
        const urgent = this.timer < 15;
        g.hud.setObjective(this.active.stage === 1 ? `Chapter ${job.chapter}: ${job.title}` : job.title,
          this.stageText(this.active.stage), urgent ? 'Seconds left · move' : `Time left ${Math.ceil(this.timer)}s`, urgent);
        if (this.timer <= 0) return this.fail('Out of time.');
      }

      if (job.id === 'courier') {
        const car = this.active.data.car;
        if (car && this.active.stage < 2) {
          this.target = { x: car.x, z: car.z };
          this.active.data.escaped = U.dist(car.x, car.z, g.player.x, g.player.z) > 230
            ? this.active.data.escaped + dt : 0;
          if (this.active.data.escaped > 6) return this.fail('The coupe got away.');
          // Shoved into a lot or wedged on a kerb, the coupe would sit there forever: after a few
          // seconds stopped mid-chase it is lifted back onto the nearest road.
          if (this.active.stage === 1 && car.speedKmh < 1.5) {
            this.active.data.carStuck = (this.active.data.carStuck ?? 0) + dt;
            if (this.active.data.carStuck > 3) {
              this.active.data.carStuck = 0;
              const node = g.roads.nearestNode(car.x, car.z);
              if (node) {
                car.x = node.x + 3.6;
                car.z = node.z;
                car.vx = car.vz = 0;
                car.heading = Math.random() * Math.PI * 2;
                g.particles.sparks(car.x, 0.6, car.z, 6, 0xbcd8ff);
              }
            }
          } else this.active.data.carStuck = 0;
          if (this.active.stage === 1 && car.health <= 40) {
            car.ai = null;
            car.driver = null;
            car.vx *= 0.2;
            car.vz *= 0.2;
            this.active.stage = 2;
            this.target = null;
            const caseSpot = { x: car.x + 1.6, z: car.z + 1.6 };
            this.marker = { x: caseSpot.x, z: caseSpot.z, label: 'The case' };
            this.active.data.case = this.spawnCase(caseSpot.x, caseSpot.z);
            g.hud.setObjective('The Courier', 'Grab the case off the road.', 'Then get it to the garage');
            g.audio.pickup();
          }
        }
        if (this.active.stage === 2) {
          const c = this.active.data.case;
          if (c && U.dist(g.player.x, g.player.z, c.position.x, c.position.z) < 2.4) {
            g.scene.remove(c);
            this.active.data.case = null;
            const home = g.city.missionSpots.garage;
            this.marker = { x: home.x, z: home.z + 12, label: 'The garage' };
            this.active.stage = 3;
            g.hud.setObjective('The Courier', 'Take the case to the garage.', '');
            g.audio.cash();
          }
        }
        if (this.active.stage === 3 && U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 10) return this.win();
      }

      if (job.id === 'sunset') {
        const car = this.active.data.car;
        if (car && car.dead) return this.fail('The deed car is wrecked.');
        if (this.active.stage === 1 && U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 12 && g.player.vehicle === car) {
          if (car.speedKmh < 34) return this.win();
        }
      }

      if (job.id === 'parcel') {
        if (this.carry) this.carry.rotation.z = Math.sin(performance.now() * 0.004) * 0.05;
        if (this.active.stage === 1 && this.marker && U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 8) {
          g.hud.setPrompt('<b>E</b> hand over the parcel');
        }
      }

      if (job.id === 'gig' && this.marker) this.carry?.rotation.set(0, 0, Math.sin(performance.now() * 0.004) * 0.05);

      // Marker prompts for pickups.
      if (this.marker && this.active.stage < 3 && U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 7
        && !(job.id === 'sunset' && this.active.stage === 0 && g.player.vehicle)) {
        const verb = job.id === 'parcel' && this.active.stage === 0 ? 'take the parcel'
          : job.id === 'parcel' ? 'hand over the parcel'
            : job.id === 'gig' ? 'drop the packet'
              : job.id === 'sunset' ? 'take the car' : 'look around';
        g.hud.setPrompt(`<b>E</b> ${verb}`);
      }
      return;
    }

    // Idle: offer the next story job through a marker at the garage, and a gig now and then.
    const next = this.storyReady;
    if (next) {
      g.hud.setObjective(`Chapter ${next.chapter}: ${next.title}`, 'Meet Bima at Tiga Saudara garage.', 'Gold diamond on your map · E to talk');
      const a = g.city.missionSpots.garage;
      this.marker = { x: a.x + 6, z: a.z + 14, label: next.title };
      if (U.dist(g.player.x, g.player.z, this.marker.x, this.marker.z) < 7) {
        g.hud.setPrompt(`<b>E</b> start "${next.title}"`);
      }
    } else {
      this.marker = null;
    }

    if (this.gigCool <= 0 && !this.gig && !this.active && this.game.progress.chapter > 0) {
      const spot = g.city.missionSpots[U.pick(GIG_SPOTS)];
      this.gig = { x: spot.x + U.rand(-6, 6), z: spot.z + U.rand(-6, 6) };
      this.gigCool = 60;
    }
    if (this.gig && U.dist(g.player.x, g.player.z, this.gig.x, this.gig.z) < 6) {
      g.hud.setPrompt('<b>E</b> take a courier run ($160)');
    }
  }

  // A courier gig: the packet is in hand at the moment you take it, and the drop is across town.
  runGig() {
    const g = this.game;
    const spot = g.city.missionSpots[U.pick(GIG_SPOTS.filter((s) => s !== 'garage'))];
    this.active = { id: 'gig', gig: true, job: { id: 'gig', title: 'Courier Run', chapter: 0, reward: 160 }, stage: 1, data: {} };
    this.marker = { x: spot.x, z: spot.z, label: 'Drop' };
    this.active.gigDrop = 'Run the packet across the bay.';
    this.timer = 110;
    this.carry = this.buildCrate();
    g.hud.setObjective('Courier Run', 'Run the packet across the bay.', 'A hundred and ten seconds');
    g.hud.say('DISPATCH', 'Packet is sealed. Drop is on your map. Go.', 3.5);
    g.audio.ui();
    g.wanted.addCrime(6);
  }

  spawnCase(x, z) {
    const THREE = globalThis.THREE;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.5, metalness: 0.4 }),
    );
    mesh.position.set(x, 0.3, z);
    mesh.rotation.y = Math.random();
    this.game.scene.add(mesh);
    this.game.particles.sparks(x, 0.4, z, 8, 0xffd27a);
    return mesh;
  }

  win() {
    const g = this.game;
    const job = this.active.job;
    const bonus = Math.round((this.timer > 0 ? this.timer : 0) * 2);
    const total = job.reward + bonus;
    g.cash += total;
    g.hud.setMoney(g.cash);
    g.hud.toast(`+$${total.toLocaleString('en-US')}${bonus ? ` (${bonus} time bonus)` : ''}`, 'cash');
    g.audio.missionDone();
    g.progress.stats.jobsDone++;
    g.player.heal(45);
    g.player.reserve = Math.min(96, g.player.reserve + 24);
    g.progress.stats.earned += total;
    if (this.carry) { g.player.body.remove(this.carry); this.carry = null; }
    if (this.active.data.case) g.scene.remove(this.active.data.case);
    if (this.active.id !== 'gig') {
      g.progress.chapter = Math.max(g.progress.chapter, job.chapter);
      if (job.chapter >= 3 && !g.progress.finished) g.finishStory();
    }
    g.wanted.unpin();
    g.wanted.clear();
    this.marker = null;
    this.target = null;
    this.active = null;
    this.timer = 0;
    this.gig = null;
    this.gigCool = 40;
    g.hud.clearObjective();
    g.save();
    g.hud.say('BIMA', g.progress.finished ? 'Garage is ours again. Go get a beer.' : 'Clean. Come by the garage.', 5);
  }

  fail(reason) {
    const g = this.game;
    const dead = g.state === 'dead';
    g.audio.fail();
    g.hud.toast(`Job failed: ${reason}`, 'bad');
    if (this.carry) { g.player.body.remove(this.carry); this.carry = null; }
    if (this.active?.data?.case) g.scene.remove(this.active.data.case);
    const id = this.active?.id;
    const job = this.active?.job;
    // Dying mid-job already parks the retry on the death screen; a briefing stacked under the
    // "Busted" card would just be hidden by it.
    if (id && id !== 'gig' && job) g.pendingRetry = job;
    g.wanted.unpin();
    g.wanted.clear();
    this.cleanup();
    g.hud.clearObjective();
    if (id && id !== 'gig' && !dead) g.showBrief(job, true);
  }

  cleanup() {
    if (this.carry) this.game.player.body.remove(this.carry);
    if (this.active?.data?.case) this.game.scene.remove(this.active.data.case);
    const car = this.active?.data?.car;
    if (car && car !== this.game.player.vehicle) this.game.traffic.remove(car);
    this.active = null;
    this.carry = this.marker = this.target = this.gig = null;
    this.timer = 0;
    this.game.wanted.unpin();
  }
}
