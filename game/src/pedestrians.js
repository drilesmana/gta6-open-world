// Velora Heat — pedestrians.
// People walk the sidewalks on the street grid, turn at intersections, and
// flee when scared: a punch nearby, a speeding car, or a police chase.
// A fleeing ped raises the alarm — stealing a car in front of one is a crime.
import { PEDS, STREETS, CITY_HALF } from './config.js';
import { makePerson } from './characters.js';
import { clamp, rand, pick, dist2 } from './util.js';

const WALK_OFFSET = 8.4; // sidewalk line, just off the road edge

// Local damp (same formula as util's, kept here to avoid a circular import).
function dampLocal(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

export class Pedestrians {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  spawnInitial(playerX, playerZ) {
    for (let i = 0; i < PEDS.count; i++) this.spawn(playerX, playerZ);
  }

  spawn(px, pz) {
    const rig = makePerson({});
    const ped = {
      rig,
      x: 0, z: 0, heading: 0,
      speed: rand(PEDS.walkMin, PEDS.walkMax),
      axis: Math.random() < 0.5 ? 'x' : 'z',
      dir: Math.random() < 0.5 ? 1 : -1,
      street: pick(STREETS),
      fleeing: 0,
      fleeX: 0, fleeZ: 0,
      knockX: 0, knockZ: 0,
    };
    // A punch knocks the ped sideways; fleeing sends them running.
    ped.knock = (dx, dz) => {
      ped.knockX = dx * 7;
      ped.knockZ = dz * 7;
    };
    ped.flee = (seconds = 4) => {
      ped.fleeing = Math.max(ped.fleeing, seconds);
    };
    // Start on a sidewalk near a random street, not on top of the player.
    let x;
    let z;
    let tries = 0;
    do {
      if (ped.axis === 'z') {
        x = ped.street + WALK_OFFSET * (Math.random() < 0.5 ? 1 : -1);
        z = rand(-CITY_HALF + 10, CITY_HALF - 10);
      } else {
        x = rand(-CITY_HALF + 10, CITY_HALF - 10);
        z = ped.street + WALK_OFFSET * (Math.random() < 0.5 ? 1 : -1);
      }
      tries++;
    } while (dist2(x, z, px, pz) < 30 * 30 && tries < 8);
    ped.x = x;
    ped.z = z;
    ped.heading = ped.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    rig.root.position.set(x, 0, z);
    rig.root.rotation.y = ped.heading;
    this.scene.add(rig.root);
    this.list.push(ped);
    return ped;
  }

  remove(ped) {
    this.scene.remove(ped.rig.root);
    this.list = this.list.filter((p) => p !== ped);
  }

  clear() {
    for (const ped of this.list) this.scene.remove(ped.rig.root);
    this.list = [];
  }

  knock(ped, dx, dz) {
    ped.knock(dx, dz);
  }

  flee(ped, seconds = 4) {
    ped.flee(seconds);
  }

  // The nearest ped within maxDist (used for punch + witness checks).
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const p of this.list) {
      const d = dist2(x, z, p.x, p.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  update(dt, player, playerCar, policeCars) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ped = this.list[i];
      if (dist2(ped.x, ped.z, player.x, player.z) > PEDS.despawnDist * PEDS.despawnDist) {
        this.remove(ped);
        this.spawn(player.x, player.z);
        continue;
      }
      this.scareCheck(ped, playerCar, policeCars);
      this.stepPed(ped, dt);
    }
    while (this.list.length < PEDS.count) this.spawn(player.x, player.z);
  }

  // Scare check: a fast car close by, or police nearby with sirens.
  scareCheck(ped, playerCar, policeCars) {
    let scareX = 0;
    let scareZ = 0;
    let scared = false;
    if (playerCar) {
      const d = dist2(ped.x, ped.z, playerCar.x, playerCar.z);
      if (d < 36 && Math.abs(playerCar.speed) > 10) {
        scared = true;
        scareX = ped.x - playerCar.x;
        scareZ = ped.z - playerCar.z;
      }
    }
    if (!scared && policeCars) {
      for (const pc of policeCars) {
        if (dist2(ped.x, ped.z, pc.x, pc.z) < 100) {
          scared = true;
          scareX = ped.x - pc.x;
          scareZ = ped.z - pc.z;
          break;
        }
      }
    }
    if (scared) {
      if (ped.fleeing <= 0) {
        ped.fleeX = scareX;
        ped.fleeZ = scareZ;
      }
      ped.fleeing = Math.max(ped.fleeing, 2.5);
    }
  }

  // Move one ped for a frame: knockback, fleeing, or a sidewalk stroll.
  stepPed(ped, dt) {
    // Knockback decays.
    ped.x += ped.knockX * dt;
    ped.z += ped.knockZ * dt;
    ped.knockX = dampLocal(ped.knockX, 0, 6, dt);
    ped.knockZ = dampLocal(ped.knockZ, 0, 6, dt);

    let speed = ped.speed;
    let targetHeading = ped.heading;
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      speed = PEDS.fleeSpeed;
      const l = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
      targetHeading = Math.atan2(ped.fleeX / l, ped.fleeZ / l);
    } else {
      // Walk along the sidewalk; turn at intersections sometimes.
      const along = ped.axis === 'z' ? ped.z : ped.x;
      const nearest = STREETS.reduce((b, s) => (Math.abs(s - along) < Math.abs(b - along) ? s : b), STREETS[0]);
      if (Math.abs(nearest - along) < 1.5 && Math.random() < 0.25) {
        if (Math.random() < 0.5) {
          ped.axis = ped.axis === 'z' ? 'x' : 'z';
          ped.street = nearest;
          ped.dir = Math.random() < 0.5 ? 1 : -1;
        } else {
          ped.dir *= -1;
        }
      }
      targetHeading = ped.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      // Stay on the sidewalk line.
      const across = ped.axis === 'z' ? ped.x : ped.z;
      const lane = ped.street + WALK_OFFSET * Math.sign(across - ped.street || 1);
      const pull = clamp((lane - across) * 0.5, -0.6, 0.6);
      targetHeading += ped.axis === 'z' ? pull * ped.dir : -pull * ped.dir;
    }
    let dh = targetHeading - ped.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    ped.heading += clamp(dh, -5 * dt, 5 * dt);
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    ped.x = clamp(ped.x, -CITY_HALF, CITY_HALF);
    ped.z = clamp(ped.z, -CITY_HALF, 200);
    ped.rig.root.position.set(ped.x, 0, ped.z);
    ped.rig.root.rotation.y = ped.heading;
    const speed01 = clamp(speed / PEDS.fleeSpeed, 0.15, 1);
    if (speed > 0.2) ped.rig.walk(dt, speed01);
    else ped.rig.idle(dt, performance.now() / 1000);
  }
}
