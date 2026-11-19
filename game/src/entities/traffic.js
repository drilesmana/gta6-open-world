// Traffic: cars driving the grid on the right-hand lane, rolling up to a stop behind whatever is
// ahead, honking at jaywalkers, and parked cars waiting at the curb and in the lots to be stolen.
// Mission vehicles can live in this collection too, so the collision pass does not distinguish story cars.

import * as U from '../core/util.js';
import { Vehicle } from './vehicle.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'kancil', 'van', 'pickup', 'taxi', 'coupe'];
const TRAFFIC_COLORS = [0xe8b34a, 0x5fa8a0, 0xd96b4f, 0xe6e0d2, 0x7f8fc2, 0xc25b86, 0xa9d3d5, 0x8ab54f];
const CITY_LANE = 8;

export class Traffic {
  constructor(scene, world, graph) {
    this.scene = scene;
    this.world = world;
    this.graph = graph;
    this.nodes = graph.roadNodes;
    this.cells = graph.cells;
    this.all = [];
    this.parked = [];
    this.spawnTimer = 0;
    this.rush = 1;
    this.lastEdge = new Map();
  }

  spawnTrafficCar(px, pz, minDist = 30, maxDist = 120) {
    // Fifteen cars read as a diorama on a six-street grid; twenty-two keep every light busy
    // without the block behind the player turning into a car park.
    if (this.all.filter((car) => car.driver === 'ai').length >= 22) return null;
    const edge = this.pickEdgeNear(px, pz, minDist, maxDist);
    if (!edge) return null;
    const [a, b] = edge;
    const spot = this.graph.lanePoint(edge, U.rand(0.15, 0.85));
    if (this.world.blocked(spot.x, spot.z, 3)) return null;
    const v = new Vehicle(this.scene, U.pick(TRAFFIC_TYPES), U.pick(TRAFFIC_COLORS),
      spot.x, spot.z, spot.dir);
    v.driver = 'ai';
    v.ai = {
      to: b,
      from: a,
      cruise: U.rand(7, 12),
      patience: 0,
      stuck: 0,
      honk: U.rand(1, 6),
    };
    this.all.push(v);
    return v;
  }

  pickEdgeNear(px, pz, minDist, maxDist) {
    for (let i = 0; i < 26; i++) {
      const edge = this.nodes && this.randomEdge();
      if (!edge) continue;
      const mx = (edge[0].x + edge[1].x) / 2;
      const mz = (edge[0].z + edge[1].z) / 2;
      const d = U.dist(mx, mz, px, pz);
      if (d > minDist && d < maxDist) return edge;
    }
    return null;
  }

  randomEdge() {
    const ci = Math.floor(Math.random() * (this.cells + 1));
    const cj = Math.floor(Math.random() * (this.cells + 1));
    const n = this.nodeAt(ci, cj);
    if (!n) return null;
    const options = [];
    if (ci > 0) options.push([n, this.nodeAt(ci - 1, cj)]);
    if (ci < this.cells) options.push([n, this.nodeAt(ci + 1, cj)]);
    if (cj > 0) options.push([n, this.nodeAt(ci, cj - 1)]);
    if (cj < this.cells) options.push([n, this.nodeAt(ci, cj + 1)]);
    if (!options.length) return null;
    return U.pick(options);
  }

  nodeAt(i, j) {
    if (i < 0 || j < 0 || i > this.cells || j > this.cells) return null;
    return this.nodes[i * (this.cells + 1) + j];
  }

  spawnParked(x, z, heading) {
    const v = new Vehicle(this.scene, U.pick(['sedan', 'coupe', 'pickup', 'van', 'kancil']),
      U.pick(TRAFFIC_COLORS), x, z, heading);
    v.driver = null;
    v.parked = true;
    this.parked.push(v);
    this.all.push(v);
    return v;
  }

  // Seed parked cars in the lots around the map at load.
  seedParked(lots) {
    for (const lot of lots) {
      const n = U.randInt(2, 4);
      for (let i = 0; i < n; i++) {
        const x = lot.x + U.rand(-10, 10);
        const z = lot.z + U.rand(-12, 12);
        if (this.world.blocked(x, z, 2)) continue;
        this.spawnParked(x, z, U.rand(0, Math.PI * 2));
      }
    }
  }

  // Cars nose-in at the curb around the blocks: something to steal when the player is far from
  // a lot, and life on the street.
  seedCurb(nodes) {
    let placed = 0;
    for (const n of nodes) {
      if (placed >= 18) break;
      if (Math.random() < 0.55) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = n.x + side * (CITY_LANE + 1.2);
      const z = n.z + (Math.random() < 0.5 ? -6 : 6);
      if (this.world.blocked(x, z, 2.2)) continue;
      this.spawnParked(x, z, Math.random() < 0.5 ? 0 : Math.PI);
      placed++;
    }
  }

  update(dt, ctx) {
    // A pursuit pulls more cars onto the street: the bay feels busier while it is hunting you.
    this.rush = 1 + Math.min(ctx.wanted.level, 4) * 0.25;
    this.spawnTimer -= dt * this.rush;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = U.rand(1.0, 2.4);
      this.spawnTrafficCar(ctx.player.x, ctx.player.z, 40, 125);
    }

    for (let i = this.all.length - 1; i >= 0; i--) {
      const car = this.all[i];
      if (car.dead) {
        // Let wrecks sit for a while then clear them.
        car.wreckTimer = (car.wreckTimer ?? 0) + dt;
        if (car.wreckTimer > 26) {
          car.dispose(this.scene);
          this.all.splice(i, 1);
        }
        continue;
      }
      if ((car.driver === 'ai' || car.driver === 'flee') && car.ai) this.driveAI(car, dt, ctx);
      else if (!car.driver) {
        // Parked: a nudge from a crash sets it rolling.
        if (car.burning || Math.abs(car.vx) + Math.abs(car.vz) > 0.2) car.update(dt, this.world, { brake: true });
      }
      if (U.dist(car.x, car.z, ctx.player.x, ctx.player.z) > 210 && car.driver === 'ai') {
        car.dispose(this.scene);
        this.all.splice(i, 1);
      } else if (car.parked && !car.driver && !car.deed && this.all.length > 44
        && U.dist(car.x, car.z, ctx.player.x, ctx.player.z) > 120) {
        // Parked cars seeded across the whole map are trimmed once the player is far away and the
        // street is already busy, so a long session does not accumulate them.
        car.dispose(this.scene);
        this.all.splice(i, 1);
      }
    }
  }

  driveAI(car, dt, ctx) {
    const ai = car.ai;
    if (!ai.to) ai.to = this.world.game.roads.nearestNode(car.x, car.z);
    if (!ai.to) return;
    const laneHeading = ai.from ? Math.atan2(ai.to.x - ai.from.x, ai.to.z - ai.from.z) : car.heading;
    const tx = ai.to.x + Math.cos(laneHeading) * 3.6;
    const tz = ai.to.z - Math.sin(laneHeading) * 3.6;
    const d = U.dist(car.x, car.z, tx, tz);
    const want = Math.atan2(tx - car.x, tz - car.z);
    const diff = U.wrapAngle(want - car.heading);
    const steer = U.clamp(diff * 2.1, -1, 1);
    // Flick the indicator the way the car is committed to turn, and cancel it on a straight.
    car.indicator = d < 18 && Math.abs(diff) > 0.25 ? Math.sign(diff) : 0;

    // Stop for anything in the lane ahead: cars, the player, cops.
    let blocked = false;
    let playerBlocking = false;
    const aheadX = car.x + Math.sin(car.heading) * 6;
    const aheadZ = car.z + Math.cos(car.heading) * 6;
    for (const other of this.all) {
      if (other === car || other.dead) continue;
      if (U.dist(other.x, other.z, aheadX, aheadZ) < 3.6) { blocked = true; break; }
    }
    // People crossing the lane: the driver eases off rather than running them down.
    const walker = ctx.peds.nearest(aheadX, aheadZ, 3.4);
    if (walker && walker.state !== 'down') {
      blocked = true;
      if (car.speedKmh > 26) car.vx *= 0.9;
    }
    if (U.dist(ctx.player.x, ctx.player.z, aheadX, aheadZ) < 3.2) { blocked = true; playerBlocking = true; }

    // A pedestrian standing in the road gets the horn, sooner than a queue does.
    if (playerBlocking) {
      ai.honk -= dt * 2.5;
      if (ai.honk <= 0) {
        ai.honk = U.rand(1.2, 3);
        if (U.dist(car.x, car.z, ctx.player.x, ctx.player.z) < 26) ctx.audio.horn(car.x, car.z);
      }
    }

    // Walk the light: nobody drives through a red if a crossing car is near.
    const playerInCar = ctx.player.vehicle;
    if (playerInCar && U.dist(playerInCar.x, playerInCar.z, aheadX, aheadZ) < 4.2) blocked = true;
    // Junction courtesy: a car already crossing the crossroads gets the right of way, so the
    // grid stops producing T-bone pileups every few streets.
    if (d < 16 && this.crossingTraffic(car, ai.to)) blocked = true;

    let throttle = 0;
    if (d < 9) {
      // Arrived: choose the next node, never doubling back.
      const n = this.chooseNext(car, ai.to);
      if (n) { ai.from = ai.to; ai.to = n; }
      throttle = 0.7;
    } else if (blocked) {
      ai.patience += dt;
      throttle = ai.patience > 1.4 ? -0.6 : 0;
      if (ai.patience > 2.2) { ai.patience = 0; blocked = false; }
    } else {
      ai.patience = 0;
      throttle = d < 24 ? 0.45 : 0.75;
    }

    if (blocked) {
      ai.honk -= dt;
      if (ai.honk <= 0) {
        ai.honk = U.rand(3, 8);
        if (U.dist(car.x, car.z, ctx.player.x, ctx.player.z) < 26) ctx.audio.horn(car.x, car.z);
      }
    }

    // Reverse out when wedged.
    if (Math.abs(car.forwardSpeed) < 0.4 && throttle > 0) {
      ai.stuck += dt;
      if (ai.stuck > 2.6) {
        ai.stuck = 0;
        const n = this.chooseNext(car, ai.to) ?? ai.from;
        ai.to = n;
        car.vx = -Math.sin(car.heading) * 2;
        car.vz = -Math.cos(car.heading) * 2;
      }
    } else ai.stuck = 0;

    car.update(dt, this.world, {
      throttle: throttle * (car.speedKmh > 50 ? 0.5 : 1),
      steer,
      brake: blocked && car.speedKmh > 20,
    });
  }

  // True when another moving car sits within reach of the crossroads on the crossing axis.
  crossingTraffic(car, node) {
    for (const other of this.all) {
      if (other === car || other.dead || !other.driver) continue;
      if (Math.abs(other.forwardSpeed) < 2) continue;
      if (U.dist(other.x, other.z, node.x, node.z) > 7) continue;
      if (U.dist(other.x, other.z, car.x, car.z) < 4.5) continue;
      // Only a crossing driver, never somebody in my own lane queue.
      const along = Math.abs(U.wrapAngle(other.heading - car.heading));
      if (along > 0.7 && along < Math.PI - 0.7) return true;
    }
    return false;
  }

  chooseNext(car, node) {
    const i = node.i;
    const j = node.j;
    const options = [];
    const push = (ii, jj) => {
      const n = this.nodeAt(ii, jj);
      if (n && n !== car.ai.from) options.push(n);
    };
    push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1);
    if (!options.length) return car.ai.from;
    // Prefer going straight.
    const straight = options.filter((n) => {
      const a = Math.atan2(n.x - node.x, n.z - node.z);
      return Math.abs(U.wrapAngle(a - car.heading)) < 0.5;
    });
    return Math.random() < 0.7 && straight.length ? U.pick(straight) : U.pick(options);
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const car of this.all) {
      if (car.dead) continue;
      const d = U.dist2(x, z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  // Count of AI-driven cars: for debug / HUD.
  get aiCount() {
    return this.all.filter((c) => c.driver === 'ai' && !c.dead).length;
  }

  remove(car) {
    const i = this.all.indexOf(car);
    if (i >= 0) this.all.splice(i, 1);
    const p = this.parked.indexOf(car);
    if (p >= 0) this.parked.splice(p, 1);
    car.dispose(this.scene);
  }
}
