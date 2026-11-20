import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, damp } from './util.js';
import { makePerson, swingWalk } from './characters.js';

// Dario on foot. The player owns a person mesh, a heading, a speed, and a
// third-person orbit camera. Movement is camera-relative (WASD moves against
// the camera yaw); the camera orbits with pointer deltas handed in through
// the input object. Entering a car hides the person and hands control to the
// driving controller; exiting puts the person back beside the car.

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

function angleDamp(current, target, rate, dt) {
  // Shortest-arc damping for headings so the player never spins the long way.
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, rate * dt);
}

// createPlayer(scene, materials): returns the player object. It exposes
// position (a THREE.Vector3, the same object as the mesh position), driving
// (bool), currentCar, speed, heading, and update(dt, camera, input).
// input is { forward, back, left, right, run, lookDX, lookDY }.
export function createPlayer(scene, materials) {
  const group = makePerson('dario', materials);
  scene.add(group);

  const walkSpeed = tun(['player.walkSpeed', 'player.walk', 'walkSpeed', 'speeds.walk'], 4.2);
  const runSpeed = tun(['player.runSpeed', 'player.run', 'runSpeed', 'speeds.run'], 7.4);
  const camDist = tun(['camera.distance', 'camera.dist', 'cameraDistance'], 7.5);

  const player = {
    group,
    position: group.position,
    heading: 0,
    speed: 0,
    driving: false,
    currentCar: null,
    camYaw: 0,
    camPitch: 0.32,
    camDist,
    walkSpeed,
    runSpeed,
    walkPhase: 0,
    _camPos: new THREE.Vector3(),
    _look: new THREE.Vector3(),

    update(dt, camera, input) {
      const inp = input || {};
      if (this.driving) {
        // Riding: stay glued to the car; the driving controller owns motion
        // and the camera while driving.
        if (this.currentCar) {
          this.position.copy(this.currentCar.position);
          this.heading = this.currentCar.rotation.y;
        }
        return;
      }
      // Orbit the camera with pointer deltas.
      this.camYaw -= (inp.lookDX || 0) * 0.0032;
      this.camPitch = clamp(this.camPitch + (inp.lookDY || 0) * 0.0022, -0.15, 0.9);

      // Camera-relative move direction.
      const f = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);
      const s = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      let mx = 0;
      let mz = 0;
      if (f !== 0 || s !== 0) {
        // Forward on screen is -Z rotated by camYaw; right is +X rotated.
        mx = -sin * f + cos * s;
        mz = -cos * f - sin * s;
        const len = Math.hypot(mx, mz);
        mx /= len;
        mz /= len;
      }
      const target = (f !== 0 || s !== 0) ? (inp.run ? this.runSpeed : this.walkSpeed) : 0;
      this.speed = damp(this.speed, target, 10, dt);
      if (this.speed > 0.05) {
        this.position.x += mx * this.speed * dt;
        this.position.z += mz * this.speed * dt;
        const wantHeading = Math.atan2(mx, mz);
        this.heading = angleDamp(this.heading, wantHeading, 12, dt);
        this.walkPhase += this.speed * dt * 1.6;
      }
      group.rotation.y = this.heading;
      swingWalk(group, this.walkPhase, this.speed > 0.1 ? 0.55 : 0);

      // Third-person camera: behind and above, looking at the head.
      const cx = this.position.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
      const cz = this.position.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
      const cy = this.position.y + 1.6 + Math.sin(this.camPitch) * this.camDist;
      this._camPos.set(cx, cy, cz);
      camera.position.lerp(this._camPos, Math.min(1, 14 * dt));
      this._look.set(this.position.x, this.position.y + 1.4, this.position.z);
      camera.lookAt(this._look);
    },

    enterCar(car) {
      this.driving = true;
      this.currentCar = car || null;
      group.visible = false;
      if (car) this.position.copy(car.position);
    },

    exitCar() {
      const car = this.currentCar;
      if (car) {
        // Step out to the driver's side (car's left, -X in local space).
        const side = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y);
        this.position.set(
          car.position.x + side.x * 1.6,
          car.position.y,
          car.position.z + side.z * 1.6,
        );
        this.heading = car.rotation.y;
        group.rotation.y = this.heading;
      }
      this.driving = false;
      this.currentCar = null;
      group.visible = true;
    },
  };

  return player;
}
