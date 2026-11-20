import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, damp } from './util.js';

// Arcade driving for Velora Heat. The car keeps a velocity vector separate
// from its heading, so the handbrake can break lateral grip and the car
// drifts instead of just turning. Engine force acts along the heading,
// lateral velocity is killed by grip (weak while handbraking), and off-road
// ground drags the car down. No building collision data exists in the city
// object, so the car is clamped to the city bounds and slowed off-road.

function tun(keys, fallback) {
  const c = CONFIG || {};
  for (const k of keys) {
    const parts = k.split('.');
    let v = c;
    let ok = true;
    for (const p of parts) {
      if (v && typeof v === 'object' && p in v) v = v[p];
      else { ok = false; break; }
    }
    if (ok && typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function toXZ(v) {
  if (!v) return null;
  if (Array.isArray(v)) {
    if (v.length >= 3) return { x: v[0], z: v[2] };
    if (v.length >= 2) return { x: v[0], z: v[1] };
    return null;
  }
  if (typeof v === 'object' && typeof v.x === 'number' && typeof v.z === 'number') {
    return { x: v.x, z: v.z };
  }
  return null;
}

function normRoads(city) {
  const c = city || {};
  const raw = c.roads || c.roadSegments || c.segments || c.network || c.roadsList || [];
  const out = [];
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (!s) continue;
      const a = toXZ(s.start || s.a || s.from || s.p0);
      const b = toXZ(s.end || s.b || s.to || s.p1);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, dx: dx / len, dz: dz / len, len });
    }
  }
  return out;
}

function distToSegment(px, pz, s) {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const wx = px - s.ax;
  const wz = pz - s.az;
  const t = clamp((wx * vx + wz * vz) / (s.len * s.len), 0, 1);
  const cx = s.ax + vx * t;
  const cz = s.az + vz * t;
  return Math.hypot(px - cx, pz - cz);
}

// findNearestCar(position, cars, maxDist): the car group closest to the
// position within maxDist metres, or null. main.js uses it for the "press E
// to steal" prompt. cars is any array of objects with a .position.
export function findNearestCar(position, cars, maxDist = 4) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars || []) {
    if (!car || !car.position) continue;
    const d = Math.hypot(car.position.x - position.x, car.position.z - position.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// createDriving(player, city): returns the driving controller. It reads the
// player object (for enter/exit state) and the city object (for roads and
// bounds). Exposes car, speed (signed m/s along the heading), steering,
// update(dt, camera, input) and enterCar/exitCar. input is
// { forward, back, left, right, handbrake }.
export function createDriving(player, city) {
  const roads = normRoads(city);
  const roadHalf = tun(['city.roadWidth', 'roadWidth', 'city.road_width'], 9) / 2;
  const halfSize = tun(['city.halfSize', 'city.half', 'cityHalfSize'], null)
    ?? tun(['city.size', 'citySize', 'city.width'], 240) / 2;
  const topSpeed = tun(['car.topSpeed', 'car.top', 'topSpeed', 'speeds.carTop'], 38);
  const accel = tun(['car.acceleration', 'car.accel', 'acceleration', 'speeds.carAccel'], 16);
  const brakeDecel = tun(['car.brake', 'car.brakeDecel', 'brakeDecel'], 26);
  const reverseTop = tun(['car.reverseSpeed', 'car.reverse', 'reverseSpeed'], 9);

  const driving = {
    player,
    city,
    roads,
    car: null,
    speed: 0,
    steering: 0,
    vel: new THREE.Vector3(),
    _fwd: new THREE.Vector3(),
    _rgt: new THREE.Vector3(),
    _camTarget: new THREE.Vector3(),
    _camLook: new THREE.Vector3(),

    enterCar(car) {
      if (!car) return;
      this.car = car;
      this.vel.set(0, 0, 0);
      this.speed = 0;
      this.steering = 0;
      player.enterCar(car);
    },

    exitCar() {
      if (!this.car) return;
      this.car = null;
      this.vel.set(0, 0, 0);
      this.speed = 0;
      this.steering = 0;
      player.exitCar();
    },

    update(dt, camera, input) {
      const car = this.car;
      if (!car || !player.driving) return;
      const inp = input || {};
      const wheelbase = 2.6;

      // Steering: left is positive (heading grows, counter-clockwise from above).
      const steerIn = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
      const maxSteer = 0.55;
      this.steering = damp(this.steering, steerIn * maxSteer, 8, dt);

      const heading = car.rotation.y;
      this._fwd.set(Math.sin(heading), 0, Math.cos(heading));
      this._rgt.set(Math.cos(heading), 0, -Math.sin(heading));
      let vF = this.vel.dot(this._fwd);
      let vR = this.vel.dot(this._rgt);

      // Engine / brake / reverse.
      if (inp.forward) vF += accel * dt;
      if (inp.back) {
        if (vF > 0.5) vF -= brakeDecel * dt;
        else vF -= accel * 0.55 * dt;
      }
      // Handbrake: hard decel plus a drift window (grip collapses).
      const handbrake = !!inp.handbrake;
      if (handbrake) {
        vF -= Math.sign(vF) * Math.min(Math.abs(vF), brakeDecel * dt);
        vF *= Math.max(0, 1 - 0.4 * dt);
      }
      // Drag + rolling resistance.
      vF -= vF * 0.55 * dt;
      vF = clamp(vF, -reverseTop, topSpeed);
      // Off-road: extra drag when far from any road centre line.
      let offroad = roads.length === 0;
      if (!offroad) {
        let best = Infinity;
        for (const s of roads) {
          const d = distToSegment(car.position.x, car.position.z, s);
          if (d < best) best = d;
          if (best <= roadHalf + 2) break;
        }
        offroad = best > roadHalf + 2;
      }
      if (offroad) vF *= Math.max(0, 1 - 1.4 * dt);
      // Lateral grip: kills sideways slide fast, slowly while handbraking.
      const grip = handbrake ? 1.4 : 9;
      vR *= Math.exp(-grip * dt);

      this.vel.copy(this._fwd).multiplyScalar(vF).addScaledVector(this._rgt, vR);
      car.position.x += this.vel.x * dt;
      car.position.z += this.vel.z * dt;

      // Heading follows steering, scaled by forward speed; handbrake lets
      // the nose swing further so the drift reads.
      const turn = this.steering * (vF / wheelbase) * (handbrake ? 1.7 : 1.0);
      car.rotation.y += turn * dt;
      this.speed = vF;

      // City bounds: clamp and kill outward velocity.
      if (Math.abs(car.position.x) > halfSize) {
        car.position.x = Math.sign(car.position.x) * halfSize;
        if (Math.sign(this.vel.x) === Math.sign(car.position.x)) this.vel.x = 0;
      }
      if (Math.abs(car.position.z) > halfSize) {
        car.position.z = Math.sign(car.position.z) * halfSize;
        if (Math.sign(this.vel.z) === Math.sign(car.position.z)) this.vel.z = 0;
      }

      // Wheels: spin with speed, fronts steer. Body leans into turns.
      const w = car.userData && car.userData.wheels;
      if (w) {
        const spin = (vF / (car.userData.wheelRadius || 0.36)) * dt;
        for (const key of ['frontL', 'frontR', 'rearL', 'rearR']) {
          const pivot = w[key];
          if (!pivot) continue;
          if (pivot.userData.tyre) pivot.userData.tyre.rotation.x += spin;
        }
        if (w.frontL) w.frontL.rotation.y = this.steering;
        if (w.frontR) w.frontR.rotation.y = this.steering;
      }
      if (car.userData && car.userData.body) {
        car.userData.body.rotation.z = damp(
          car.userData.body.rotation.z,
          -this.steering * clamp(Math.abs(vF) / topSpeed, 0, 1) * 0.09,
          8,
          dt,
        );
      }

      // Chase camera: behind the car, a touch higher and further back at speed.
      const back = 7 + clamp(Math.abs(vF) / topSpeed, 0, 1) * 2.5;
      this._camTarget.set(
        car.position.x - this._fwd.x * back,
        car.position.y + 3.2,
        car.position.z - this._fwd.z * back,
      );
      camera.position.lerp(this._camTarget, Math.min(1, 6 * dt));
      this._camLook.set(
        car.position.x + this._fwd.x * 5,
        car.position.y + 1.2,
        car.position.z + this._fwd.z * 5,
      );
      camera.lookAt(this._camLook);
    },
  };

  return driving;
}
