// driving.js — Velora Heat (chunk 2)
// Driving controller: steering, acceleration, braking, reverse, handbrake,
// speed in m/s, and a chase camera behind the car. Built from the spec
// contract only: createDriving(player, city) — city is used for its bounds
// (road network / size) and the player for enter/exit behaviour.
// THREE comes from the global loaded by index.html (./vendor/three.min.js).

import { CONFIG } from './config.js';
import { clamp, damp } from './util.js';

function three() {
  const T = globalThis.THREE;
  if (!T) throw new Error('THREE global is not loaded — index.html must load ./vendor/three.min.js before main.js');
  return T;
}

function cfgNum(paths, fallback) {
  for (const path of paths) {
    let v = CONFIG;
    for (const key of path.split('.')) {
      if (v === undefined || v === null) break;
      v = v[key];
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

// Top speed (m/s) fallback per car kind when CONFIG has no per-kind table.
const KIND_TOP_SPEED = { sedan: 42, hatch: 36, truck: 28, police: 48, gold: 55 };
const KIND_ACCEL = { sedan: 12, hatch: 11, truck: 8, police: 14, gold: 16 };

export function createDriving(player, city) {
  const THREE = three();

  const citySize = cfgNum(['city.size', 'citySize', 'city.width'], 400);
  const halfCity = citySize / 2 - 6; // keep the car inside the built city
  const defaultAccel = cfgNum(['car.acceleration', 'car.accel', 'carAcceleration'], 12);
  const defaultTop = cfgNum(['car.topSpeed', 'carTopSpeed', 'car.maxSpeed'], 42);
  const brakeForce = cfgNum(['car.braking', 'car.brakeForce', 'brakeForce'], 22);
  const reverseTop = cfgNum(['car.reverseTopSpeed', 'car.reverseSpeed'], 10);

  const driving = {
    player,
    city: city || null,
    car: null, // the driven car group (or null on foot)
    speed: 0, // m/s, forward positive
    steering: 0, // -1..1, smoothed
    _camPos: new THREE.Vector3(0, 4, -10),
    _camLook: new THREE.Vector3(0, 1, 0),

    get isDriving() {
      return driving.car !== null && player.driving;
    },

    getSpeedKmh() {
      return Math.abs(driving.speed) * 3.6;
    },

    topSpeedFor(car) {
      const kind = car && car.userData ? car.userData.kind : 'sedan';
      const fromConfig = cfgNum(
        ['car.topSpeeds.' + kind, 'car.topSpeed.' + kind, 'cars.' + kind + '.topSpeed'],
        NaN,
      );
      if (Number.isFinite(fromConfig)) return fromConfig;
      if (KIND_TOP_SPEED[kind] !== undefined) return KIND_TOP_SPEED[kind];
      return defaultTop;
    },

    accelFor(car) {
      const kind = car && car.userData ? car.userData.kind : 'sedan';
      const fromConfig = cfgNum(
        ['car.acceleration.' + kind, 'car.accel.' + kind, 'cars.' + kind + '.acceleration'],
        NaN,
      );
      if (Number.isFinite(fromConfig)) return fromConfig;
      if (KIND_ACCEL[kind] !== undefined) return KIND_ACCEL[kind];
      return defaultAccel;
    },

    enterCar(car) {
      if (!car) return false;
      driving.car = car;
      driving.speed = 0;
      driving.steering = 0;
      player.enterCar(car);
      return true;
    },

    exitCar() {
      if (!driving.car) return false;
      driving.car = null;
      driving.speed = 0;
      driving.steering = 0;
      player.exitCar();
      return true;
    },

    // keys: same aliases as player.update, plus handbrake: space / handbrake.
    update(dt, keys, camera) {
      if (!driving.car || !player.driving) return;
      const car = driving.car;
      const k = keys || {};
      const fwd = k.forward || k.up || k.w || k.KeyW || k.ArrowUp || false;
      const back = k.back || k.down || k.s || k.KeyS || k.ArrowDown || false;
      const left = k.left || k.a || k.KeyA || k.ArrowLeft || false;
      const right = k.right || k.d || k.KeyD || k.ArrowRight || false;
      const handbrake = k.handbrake || k.space || k.Space || false;

      const top = driving.topSpeedFor(car);
      const accel = driving.accelFor(car);

      // Steering: full lock at low speed, less at high speed; smoothed.
      const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
      const steerAuthority = clamp(1 - Math.abs(driving.speed) / (top * 1.6), 0.35, 1);
      driving.steering = damp(driving.steering, steerTarget * steerAuthority, 8, dt);

      if (fwd) {
        driving.speed += accel * dt;
      } else if (back) {
        // Brake while moving forward, reverse once stopped.
        if (driving.speed > 0.5) driving.speed -= brakeForce * dt;
        else driving.speed -= accel * 0.6 * dt;
      } else {
        // Coast: drag + rolling resistance.
        driving.speed = damp(driving.speed, 0, 0.6, dt);
      }
      if (handbrake) {
        driving.speed = damp(driving.speed, 0, 5, dt);
      }
      driving.speed = clamp(driving.speed, -reverseTop, top);

      // Yaw: turning scales with speed; reverse flips the steering sense.
      const dir = driving.speed >= 0 ? 1 : -1;
      const turnRate = 1.9 * clamp(Math.abs(driving.speed) / 8, 0, 1);
      car.rotation.y += driving.steering * turnRate * dir * dt;

      // Advance along the car's facing (+Z at rotation.y = 0).
      const fx = Math.sin(car.rotation.y);
      const fz = Math.cos(car.rotation.y);
      car.position.x += fx * driving.speed * dt;
      car.position.z += fz * driving.speed * dt;

      // Stay inside the city: soft wall — stop and nudge back in.
      if (Math.abs(car.position.x) > halfCity || Math.abs(car.position.z) > halfCity) {
        car.position.x = clamp(car.position.x, -halfCity, halfCity);
        car.position.z = clamp(car.position.z, -halfCity, halfCity);
        driving.speed *= 0.4;
      }

      // Spin the wheels; steer the front pair.
      const wheels = car.userData.wheels || [];
      const spin = (driving.speed * dt) / (car.userData.wheelRadius || 0.36);
      for (const wheel of wheels) {
        wheel.rotation.x += spin;
        if (wheel.userData.steer) wheel.rotation.y = driving.steering * 0.42;
      }

      if (camera) driving.updateCamera(camera, dt);
    },

    // Chase camera: behind and above the car, looking ahead of it.
    updateCamera(camera, dt) {
      if (!camera || !driving.car) return;
      const car = driving.car;
      const fx = Math.sin(car.rotation.y);
      const fz = Math.cos(car.rotation.y);
      const back = 9.5 + Math.abs(driving.speed) * 0.06;
      const tx = car.position.x - fx * back;
      const tz = car.position.z - fz * back;
      const ty = 3.8;
      const rate = 5;
      driving._camPos.x = damp(driving._camPos.x, tx, rate, dt);
      driving._camPos.y = damp(driving._camPos.y, ty, rate, dt);
      driving._camPos.z = damp(driving._camPos.z, tz, rate, dt);
      camera.position.copy(driving._camPos);
      driving._camLook.set(
        car.position.x + fx * 7,
        1.2,
        car.position.z + fz * 7,
      );
      camera.lookAt(driving._camLook);
    },
  };

  return driving;
}
