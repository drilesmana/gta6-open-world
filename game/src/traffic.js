// Velora Heat — traffic.
// Cars drive the street grid on the right-hand lane, turn at intersections,
// and slow for the car ahead. Parked cars are stealable: entering one is the
// game's first crime. Traffic keeps its distance from the player by
// despawning far away and respawning on nearby streets.
import { Car } from './driving.js';
import { TRAFFIC, STREETS, CITY_HALF } from './config.js';
import { clamp, damp, rand, randi, pick, dist2 } from './util.js';

const LANE = 3; // right-hand lane offset from the street centre line

// A random point on the grid: a street, a position along it, a direction.
function randomStreetPoint() {
  const s = pick(STREETS);
  const v = rand(-CITY_HALF + 20, CITY_HALF - 20);
  const dir = Math.random() < 0.5 ? 1 : -1;
  if (Math.random() < 0.5) return { x: s, z: v, axis: 'z', dir };
  return { x: v, z: s, axis: 'x', dir };
}

function headingFor(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export class Traffic {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.parked = [];
    this.playerCar = null;
  }

  spawnInitial(playerX, playerZ) {
    for (let i = 0; i < TRAFFIC.count; i++) this.spawnMoving(playerX, playerZ);
    // Parked cars near the player: the first thing to steal.
    const spots = [
      { x: -23, z: 150, h: Math.PI / 2 },
      { x: 29, z: 148, h: -Math.PI / 2 },
      { x: -130, z: 29, h: 0 },
      { x: 78, z: -23, h: Math.PI },
      { x: 156, z: 130, h: Math.PI / 2 },
    ];
    for (const s of spots) this.spawnParked(s.x, s.z, s.h, pick(['sedan', 'coupe', 'sedan', 'taxi']));
  }

  makeCar(type, colorHex) {
    const car = new Car(type, colorHex);
    this.scene.add(car.root);
    this.setCarShadow(car, false); // traffic uses blob shadows, not the shadow map
    return car;
  }

  // Toggle real shadow casting for a car (the player's car casts; traffic
  // and police ride on their blob shadows to keep the shadow pass cheap).
  setCarShadow(car, on) {
    car.root.traverse((o) => {
      if (!o.isMesh) return;
      // Transparent parts (glass, blob) never cast: they would throw a solid shadow.
      if (o.material && o.material.transparent) return;
      o.castShadow = on;
    });
  }

  spawnMoving(px, pz) {
    const p = randomStreetPoint();
    // Keep some distance from the player so cars don't pop in on top of them.
    if (dist2(p.x, p.z, px, pz) < 60 * 60) {
      p.x += p.x < px ? -70 : 70;
      p.x = clamp(p.x, -CITY_HALF + 10, CITY_HALF - 10);
    }
    const car = this.makeCar(pick(['sedan', 'sedan', 'coupe', 'taxi', 'truck']));
    car.driver = 'ai';
    car.setPose(p.x, p.z, headingFor(p.axis, p.dir));
    car.ai = {
      axis: p.axis,
      dir: p.dir,
      street: p.axis === 'z' ? p.x : p.z,
      speed: rand(TRAFFIC.speedMin, TRAFFIC.speedMax),
      targetSpeed: rand(TRAFFIC.speedMin, TRAFFIC.speedMax),
    };
    car.speed = car.ai.speed;
    this.cars.push(car);
    return car;
  }

  spawnParked(x, z, heading, type = 'sedan', colorHex = null) {
    const car = this.makeCar(type, colorHex);
    car.driver = null;
    car.parked = true;
    car.setPose(x, z, heading);
    this.parked.push(car);
    return car;
  }

  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of [...this.cars, ...this.parked]) {
      if (car.driver === 'player') continue;
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  removeCar(car) {
    this.scene.remove(car.root);
    this.cars = this.cars.filter((c) => c !== car);
    this.parked = this.parked.filter((c) => c !== car);
  }

  clear() {
    for (const car of [...this.cars, ...this.parked]) this.scene.remove(car.root);
    this.cars = [];
    this.parked = [];
    this.playerCar = null;
  }

  // Drive one AI car along the grid: lane offset, intersection turns,
  // and braking for the car ahead.
  driveAI(car, dt) {
    const ai = car.ai;
    const f = car.forward();
    // Car ahead? Slow down.
    let ahead = Infinity;
    for (const other of this.cars) {
      if (other === car || other.driver === 'player') continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (along > 0 && along < TRAFFIC.followGap + 6 && side < 2.4) ahead = Math.min(ahead, along);
    }
    const wantSpeed = ahead < TRAFFIC.followGap ? 0 : ai.targetSpeed;
    const throttle = wantSpeed > car.speed ? 0.7 : (wantSpeed < car.speed - 0.5 ? -0.8 : 0);
    // Desired heading: along the current street, on the right-hand lane.
    const targetHeading = headingFor(ai.axis, ai.dir);
    const laneCoord = ai.street + LANE * ai.dir;
    const across = (ai.axis === 'z' ? car.x : car.z) - laneCoord;
    // Steer toward the heading, correcting the lane offset.
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 1.4 - across * 0.06, -1, 1);
    car.update(dt, { throttle, steer, handbrake: false }, this.colliders);

    // At an intersection, maybe turn onto the cross street.
    const alongCoord = ai.axis === 'z' ? car.z : car.x;
    const cross = ai.axis === 'z' ? car.x : car.z;
    const nearest = STREETS.reduce((b, s) => (Math.abs(s - alongCoord) < Math.abs(b - alongCoord) ? s : b), STREETS[0]);
    if (Math.abs(nearest - alongCoord) < 2.2 && Math.abs(cross - ai.street) < 8) {
      const roll = Math.random();
      if (roll < 0.3) {
        // Turn onto the cross street.
        const turn = Math.random() < 0.5 ? 1 : -1;
        ai.axis = ai.axis === 'z' ? 'x' : 'z';
        ai.street = nearest;
        ai.dir = turn;
      } else if (roll < 0.36) {
        ai.dir *= -1; // rare U-turn
      }
    }
  }

  update(dt, playerX, playerZ, vfx) {
    // Keep the fleet topped up and near the player.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (dist2(car.x, car.z, playerX, playerZ) > TRAFFIC.despawnDist * TRAFFIC.despawnDist) {
        this.removeCar(car);
        this.spawnMoving(playerX, playerZ);
      }
    }
    while (this.cars.length < TRAFFIC.count) this.spawnMoving(playerX, playerZ);

    for (const car of this.cars) {
      if (car.driver === 'player') continue;
      this.driveAI(car, dt);
      if (car.impact > 0.25 && vfx) {
        vfx.sparks(car.x, 0.8, car.z);
      }
    }
  }
}
