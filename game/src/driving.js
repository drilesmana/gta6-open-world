// Velora Heat — arcade car physics.
// A bicycle-model car with speed-sensitive steering, handbrake drift and
// building collision on two circles (front/rear). The same class drives the
// player's car, traffic and police — only the input source differs.
import { CAR, CITY_HALF, WATER_START } from './config.js';
import { makeCar } from './vehicles.js';
import { clamp, damp, collideCircle } from './util.js';

let nextId = 1;

export class Car {
  constructor(type = 'sedan', colorHex = null) {
    const built = makeCar(type, colorHex);
    this.root = built.root;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    this.type = type;
    this.id = nextId++;
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.driver = null; // 'player' | 'ai' | null (parked)
    this.health = 100;
    this.parked = false;
    this.impact = 0; // 0..1, set on a hard hit for VFX/sound
    this.smoke = 0; // grows as health drops
    this._fx = { x: 0, z: 0 };
    this._rx = { x: 0, z: 0 };
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  setPose(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.syncVisual();
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // input: { throttle: -1..1, steer: -1..1, handbrake: bool }
  // Returns the impact strength of any building hit this frame (0 when none).
  update(dt, input, colliders) {
    const speed01 = clamp(Math.abs(this.speed) / CAR.maxSpeed, 0, 1);
    const steerTarget = input.steer * CAR.steerMax * (1 - speed01 * 0.55);
    this.steer = damp(this.steer, steerTarget, CAR.steerSpeed * 2.2, dt);

    // Longitudinal: throttle, brake, drag, handbrake.
    if (input.throttle > 0) {
      this.speed += input.throttle * CAR.accel * (1 - speed01 * 0.75) * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed += input.throttle * CAR.brake * dt;
      else this.speed += input.throttle * CAR.accel * 0.6 * dt;
    }
    this.speed -= this.speed * CAR.drag * dt * (input.handbrake ? 2.2 : 1);
    if (input.handbrake && Math.abs(this.speed) > 1) this.speed -= Math.sign(this.speed) * 9 * dt;
    this.speed = clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);

    // Yaw from the bicycle model; grip falls off with the handbrake (drift).
    const grip = input.handbrake ? CAR.handbrakeGrip : CAR.grip;
    const yawRate = (this.speed / CAR.wheelBase) * Math.tan(this.steer) * clamp(grip / CAR.grip, 0.25, 1);
    this.heading += yawRate * dt;

    const f = this.forward();
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;

    // City bounds: walls of the world, sand is drivable, water is not.
    this.x = clamp(this.x, -CITY_HALF, CITY_HALF);
    this.z = clamp(this.z, -CITY_HALF, WATER_START - 2);

    // Building collision on two circles; a hard hit bounces and sparks.
    this.impact = 0;
    const fx = this.x + f.x * 1.6;
    const fz = this.z + f.z * 1.6;
    const rx = this.x - f.x * 1.6;
    const rz = this.z - f.z * 1.6;
    this._fx.x = fx; this._fx.z = fz;
    this._rx.x = rx; this._rx.z = rz;
    const beforeSpeed = this.speed;
    if (collideCircle(this._fx, 1.05, colliders) || collideCircle(this._rx, 1.05, colliders)) {
      // Rebuild position from the corrected circles.
      this.x = (this._fx.x + this._rx.x) / 2;
      this.z = (this._fx.z + this._rx.z) / 2;
      if (Math.abs(beforeSpeed) > 6) {
        this.impact = clamp(Math.abs(beforeSpeed) / CAR.maxSpeed, 0.2, 1);
        this.speed *= -0.28;
        this.health -= this.impact * 14;
      } else {
        this.speed *= 0.55;
      }
    }

    // Smoke when battered.
    this.smoke = clamp((100 - this.health) / 60, 0, 1);
    this.syncVisual(dt);
    return this.impact;
  }

  syncVisual(dt = 0) {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    // Wheel spin is scaled by dt so it stays frame-rate independent;
    // setPose calls this with no dt and spins nothing.
    const spin = this.speed * 0.09 * Math.min(dt * 60, 2);
    for (const w of this.wheels) {
      if (w.userData.front) w.rotation.y = this.steer;
      const tire = w.children[0];
      if (tire) tire.rotation.x += spin;
    }
  }
}
