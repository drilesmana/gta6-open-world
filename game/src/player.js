// player.js — Velora Heat (chunk 2)
// Dario on foot: walk / run / turn, third-person camera follow, enter/exit car.
// Built from the spec contract only: createPlayer(scene, materials) returns a
// player object exposing its position and whether it is driving.
// THREE comes from the global loaded by index.html (./vendor/three.min.js).

import { CONFIG } from './config.js';
import { clamp, damp } from './util.js';
import { makePerson } from './characters.js';

function three() {
  const T = globalThis.THREE;
  if (!T) throw new Error('THREE global is not loaded — index.html must load ./vendor/three.min.js before main.js');
  return T;
}

// Read a tuning number from CONFIG by trying several likely key paths, so the
// player works whatever exact key names chunk 1 chose. Last resort: default.
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

export function createPlayer(scene, materials) {
  const THREE = three();

  const walkSpeed = cfgNum(['player.walkSpeed', 'player.walk', 'walkSpeed'], 4.0);
  const runSpeed = cfgNum(['player.runSpeed', 'player.run', 'runSpeed'], 7.5);
  const turnSpeed = cfgNum(['player.turnSpeed', 'player.turn', 'turnSpeed'], 2.6);
  const accel = cfgNum(['player.acceleration', 'player.accel', 'acceleration'], 14);

  const mesh = makePerson('dario', materials);
  mesh.position.set(0, 0, 0);
  scene.add(mesh);

  const player = {
    mesh,
    // Position is the mesh position itself, so main.js / police / missions
    // always read the live value.
    position: mesh.position,
    driving: false,
    car: null,
    heading: 0,
    speed: 0,
    walkPhase: 0,
    // Camera follow state (smoothed).
    _camPos: new THREE.Vector3(0, 4, 8),
    _camLook: new THREE.Vector3(0, 1.2, 0),

    setPosition(x, z, heading) {
      mesh.position.set(x, 0, z);
      if (heading !== undefined) {
        player.heading = heading;
        mesh.rotation.y = heading;
      }
      player._camPos.set(x, 4, z + 8);
      player._camLook.set(x, 1.2, z);
    },

    teleport(x, z) {
      player.setPosition(x, z, player.heading);
    },

    enterCar(car) {
      player.driving = true;
      player.car = car || null;
      player.speed = 0;
      mesh.visible = false;
    },

    exitCar() {
      if (!player.car) {
        player.driving = false;
        mesh.visible = true;
        return player;
      }
      // Step out on the left side of the car, facing away from it.
      const car = player.car;
      const ry = car.rotation.y;
      const leftX = Math.cos(ry);
      const leftZ = -Math.sin(ry);
      const x = car.position.x + leftX * 2.2;
      const z = car.position.z + leftZ * 2.2;
      player.car = null;
      player.driving = false;
      mesh.visible = true;
      player.setPosition(x, z, ry + Math.PI / 2);
      return player;
    },

    // keys accepts several aliases so main.js can pass whatever it tracks:
    // forward: up / w / forward — back: down / s / back
    // left: left / a — right: right / d — run: shift / run
    update(dt, keys) {
      if (player.driving) return;
      const k = keys || {};
      const fwd = k.forward || k.up || k.w || k.KeyW || k.ArrowUp || false;
      const back = k.back || k.down || k.s || k.KeyS || k.ArrowDown || false;
      const left = k.left || k.a || k.KeyA || k.ArrowLeft || false;
      const right = k.right || k.d || k.KeyD || k.ArrowRight || false;
      const run = k.run || k.shift || k.ShiftLeft || k.ShiftRight || false;

      if (left) player.heading += turnSpeed * dt;
      if (right) player.heading -= turnSpeed * dt;

      const target = (fwd ? 1 : 0) - (back ? 0.55 : 0);
      const maxSpeed = run ? runSpeed : walkSpeed;
      player.speed = damp(player.speed, target * maxSpeed, accel * 0.25, dt);
      if (Math.abs(player.speed) < 0.02) player.speed = 0;

      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      mesh.position.x += fx * player.speed * dt;
      mesh.position.z += fz * player.speed * dt;
      mesh.rotation.y = player.heading;

      // Walk swing scales with speed; idle fades it out.
      player.walkPhase += Math.abs(player.speed) * dt * 2.4;
      const swingAmount = clamp(Math.abs(player.speed) / walkSpeed, 0, 1);
      if (mesh.userData.applyWalk) mesh.userData.applyWalk(player.walkPhase, swingAmount);
    },

    // Third-person camera behind the player. Call every frame while on foot.
    updateCamera(camera, dt) {
      if (!camera || player.driving) return;
      const back = 6.5;
      const height = 3.4;
      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      const tx = mesh.position.x - fx * back;
      const tz = mesh.position.z - fz * back;
      const ty = height;
      const rate = 6;
      player._camPos.x = damp(player._camPos.x, tx, rate, dt);
      player._camPos.y = damp(player._camPos.y, ty, rate, dt);
      player._camPos.z = damp(player._camPos.z, tz, rate, dt);
      camera.position.copy(player._camPos);
      player._camLook.set(mesh.position.x, 1.4, mesh.position.z);
      camera.lookAt(player._camLook);
    },
  };

  return player;
}
