// Velora Heat — wanted level and police.
// Heat (0-100) maps to 0-5 stars. Crimes add heat; when no cop can see the
// player the heat decays and the escape meter fills — one star drops when it
// fills. Police drive the street grid toward the player's street coordinates,
// ram the player's car, and bust the player on foot when they get close and
// the player is slow. Light bars flash red/blue; sirens wail when close.
import { Car } from './driving.js';
import { WANTED, STREETS, CITY_HALF } from './config.js';
import { clamp, dist2, rand, pick } from './util.js';

// Wrap an angle difference into [-PI, PI].
function wrapAngle(dh) {
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return dh;
}

// The street nearest to a coordinate (used to snap spawns onto a road).
function nearestStreet(v) {
  return STREETS.reduce((b, s) => (Math.abs(s - v) < Math.abs(b - v) ? s : b), STREETS[0]);
}

export class Police {
  constructor(scene, colliders, sfx) {
    this.scene = scene;
    this.colliders = colliders;
    this.sfx = sfx;
    this.heat = 0;
    this.level = 0;
    this.unseen = 0;
    this.escape = 0; // 0..1, fills while unseen
    this.bust = 0; // 0..1, fills when a cop is close on foot
    this.cars = [];
    this.sirenTimer = 0;
    this.flash = 0;
  }

  get stars() {
    return this.level;
  }

  addCrime(amount, _reason) {
    if (amount <= 0) return;
    this.heat = clamp(this.heat + amount, 0, 100);
    const newLevel = Math.min(WANTED.maxStars, Math.floor(this.heat / WANTED.heatPerStar));
    if (newLevel > this.level) {
      this.level = newLevel;
      this.unseen = 0;
      this.escape = 0;
    }
  }

  clear() {
    this.heat = 0;
    this.level = 0;
    this.unseen = 0;
    this.escape = 0;
    this.bust = 0;
    for (const c of this.cars) this.scene.remove(c.root);
    this.cars = [];
  }

  setLevel(level) {
    this.level = clamp(level, 0, WANTED.maxStars);
    this.heat = this.level * WANTED.heatPerStar + 5;
    this.unseen = 0;
    this.escape = 0;
  }

  spawnCar(px, pz) {
    const car = new Car('police');
    this.scene.add(car.root);
    // Spawn on a street BEHIND the player (a pursuit, not a roadblock):
    // offset opposite the player's travel direction, snapped to a street.
    const dirX = this._lastDirX ?? 0;
    const dirZ = this._lastDirZ ?? 1;
    const back = rand(120, 180);
    let x = px - dirX * back;
    let z = pz - dirZ * back;
    const sx = nearestStreet(x);
    const sz = nearestStreet(z);
    if (Math.abs(sx - x) < Math.abs(sz - z)) x = sx;
    else z = sz;
    x = clamp(x, -CITY_HALF + 10, CITY_HALF - 10);
    z = clamp(z, -CITY_HALF + 10, CITY_HALF - 10);
    car.setPose(x, z, Math.atan2(px - x, pz - z));
    car.driver = 'ai';
    car.ai = { axis: Math.abs(x - sx) < 1 ? 'z' : 'x', street: sx, dir: 1, speed: WANTED.policeSpeed };
    this.cars.push(car);
    return car;
  }

  // Grid pursuit: at each intersection, pick the turn that shortens the
  // Manhattan distance to the target; otherwise keep the street.
  drivePursuit(car, dt, tx, tz) {
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    // At intersections, snap the desired heading to the axis that closes distance.
    const along = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
    let axisHeading;
    if (along === 'x') axisHeading = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    else axisHeading = dz > 0 ? 0 : Math.PI;
    // Blend: mostly axis-aligned, some direct steering for the final approach.
    const blend = clamp(dist / 60, 0.15, 1);
    const desired = axisHeading + (wantHeading - axisHeading) * (1 - blend) * 0.4;
    const steer = clamp(wrapAngle(desired - car.heading) * 1.6, -1, 1);
    const speed = WANTED.policeSpeed + this.level * 0.7;
    const throttle = car.speed < speed ? 1 : 0;
    car.update(dt, { throttle, steer, handbrake: false }, this.colliders);
    // Flash the light bar.
    this.flash += dt * 9;
    if (car.lightBar) {
      const on = Math.sin(this.flash) > 0;
      car.lightBar.red.material.emissiveIntensity = on ? 4 : 0.4;
      car.lightBar.blue.material.emissiveIntensity = on ? 0.4 : 4;
    }
    return { dist, f: car.forward() };
  }

  // Returns 'busted' when the player is caught on foot, else null.
  update(dt, player, playerCar, vfx) {
    // Remember which way the player is travelling so new cops spawn behind.
    const heading = playerCar ? playerCar.heading : player.heading;
    this._lastDirX = Math.sin(heading);
    this._lastDirZ = Math.cos(heading);
    // Keep the fleet at the size the current level calls for.
    const want = WANTED.policePerStar[this.level];
    while (this.cars.length < want) this.spawnCar(player.x, player.z);
    while (this.cars.length > want) {
      const c = this.cars.pop();
      this.scene.remove(c.root);
    }

    // Seen check: any cop within 70 m counts as eyes on the player.
    let seen = false;
    let nearest = Infinity;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < nearest) nearest = d;
      if (d < 70) seen = true;
    }
    if (this.level > 0) {
      if (seen) {
        this.unseen = 0;
        this.escape = Math.max(0, this.escape - dt * 0.25);
      } else {
        this.unseen += dt;
        if (this.unseen > WANTED.decayDelay) {
          this.escape += dt / 8;
          if (this.escape >= 1) {
            this.escape = 0;
            this.heat = Math.max(0, this.heat - WANTED.heatPerStar);
            this.level = Math.min(WANTED.maxStars, Math.floor(this.heat / WANTED.heatPerStar));
          }
        }
      }
    }

    // Siren when a cop is near.
    this.sirenTimer -= dt;
    if (nearest < 55 && this.sirenTimer <= 0 && this.sfx) {
      this.sfx.sirenBlip();
      this.sirenTimer = 1.4;
    }

    // Bust: on foot, a slow cop close by fills the bust meter.
    let busted = false;
    if (this.level > 0 && !playerCar && nearest < 4.5 && this.cars.length > 0) {
      const nearestCar = this.cars.reduce((b, c) => {
        const d = Math.hypot(c.x - player.x, c.z - player.z);
        return d < Math.hypot(b.x - player.x, b.z - player.z) ? c : b;
      }, this.cars[0]);
      if (nearestCar && Math.abs(nearestCar.speed) < 4) {
        this.bust += dt / WANTED.bustTime;
        if (this.bust >= 1) busted = true;
      } else {
        this.bust = Math.max(0, this.bust - dt * 0.5);
      }
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.5);
    }

    // Drive the fleet; ram the player's car on contact.
    for (const c of this.cars) {
      const { dist } = this.drivePursuit(c, dt, player.x, player.z);
      if (playerCar && dist < 4.2) {
        const dx = playerCar.x - c.x;
        const dz = playerCar.z - c.z;
        const d = Math.hypot(dx, dz) || 1;
        playerCar.x += (dx / d) * 1.4;
        playerCar.z += (dz / d) * 1.4;
        if (Math.abs(c.speed) > 6) {
          playerCar.speed *= 0.82;
          playerCar.health -= WANTED.ramDamage * 0.4;
          if (vfx) vfx.sparks(playerCar.x, 0.9, playerCar.z);
          if (this.sfx) this.sfx.crash();
          c.speed *= 0.7;
        }
      }
      if (c.impact > 0.3 && vfx) vfx.sparks(c.x, 0.8, c.z);
    }
    return busted ? 'busted' : null;
  }
}
