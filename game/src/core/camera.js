// The camera: a third-person shoulder rig that swings with the mouse, pulls in when a wall is
// behind the player, sits higher and further back behind a car, and carries a little shake when
// something loud happens nearby.
// The rig follows the active body (car or courier), so entering a car never creates a second camera.

import * as U from './util.js';

const THREE = globalThis.THREE;

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = Math.PI;
    this.pitch = -0.12;
    this.dist = 7;
    this.height = 1.7;
    this.shake = 0;
    this.roll = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.smoothYaw = Math.PI;
    this.zoom = 1;
    // Seconds left of hand-steered look after the mouse last moved. While it runs the driving
    // rig stops easing back behind the car, so a quick look over the shoulder is not fought.
    this.freeLook = 0;
    this.clearance = 1;
  }

  setYaw(y) {
    this.yaw = y;
    this.smoothYaw = y;
  }

  // C: swing the boom back behind the player (or the bonnet of the car).
  recenter(heading) {
    this.yaw = heading + Math.PI;
    this.pitch = -0.12;
    this.freeLook = 0;
    this.shake = 0;
    this.zoom = 1;
  }

  addShake(v) {
    this.shake = Math.min(1.6, this.shake + v);
  }

  update(dt, input, target, driving) {
    const looked = input.mouse.dx !== 0 || input.mouse.dy !== 0;
    const look = input.look ?? 0.0024;
    if (!driving) {
      this.yaw -= input.mouse.dx * look;
      this.pitch = U.clamp(this.pitch - input.mouse.dy * look * 0.92, -0.85, 0.55);
    } else {
      this.yaw -= input.mouse.dx * look * 0.75;
      this.pitch = U.clamp(this.pitch - input.mouse.dy * look * 0.67, -0.55, 0.4);
    }
    // The wheel pulls the camera in or pushes it out.
    if (input.mouse.wheel) this.zoom = U.clamp(this.zoom + input.mouse.wheel * 0.0014, 0.62, 1.85);
    // Debug zoom preset: Z cycles through close / normal / far.
    if (input.hit('debugZoom')) {
      const presets = [0.62, 1, 1.85];
      const idx = presets.indexOf(Math.round(this.zoom * 100) / 100);
      this.zoom = presets[(idx + 1) % presets.length];
    }
    // Behind a moving car the rig eases back toward the bonnet line, but the player keeps the
    // helm for a moment after moving the mouse themselves. With nobody steering the pitch, it
    // settles back to a level view rather than staying cranked at the sky.
    this.freeLook = looked ? 1.1 : Math.max(0, this.freeLook - dt);
    if (this.freeLook <= 0) {
      this.pitch = U.damp(this.pitch, driving ? -0.1 : -0.12, 1.6, dt);
      if (driving) {
        const want = target.heading + Math.PI;
        this.yaw = U.dampAngle(this.yaw, want, 1.1, dt);
      }
    }

    // A little width opens up at speed: the frame breathes on a straight and settles at rest.
    const pace = Math.min(Math.abs(target.forwardSpeed ?? 0) / 34, 1);
    const wantFov = 62 + (driving ? pace * 6 : pace * 2);
    this.camera.fov = U.damp(this.camera.fov, wantFov, 3, dt);
    this.camera.updateProjectionMatrix();

    const wantDist = (driving ? 9.4 : 6.4) * this.zoom;
    this.dist = U.damp(this.dist, wantDist, 4, dt);
    const wantHeight = driving ? 2.4 : 1.62;
    this.height = U.damp(this.height, wantHeight, 4, dt);

    // Lead the frame a little in the direction of travel.
    const speed = target.forwardSpeed ?? target.speed ?? 0;
    const lead = U.clamp(speed * 0.16, -2.6, 3.2);
    const focusX = target.x + Math.sin(target.heading) * lead;
    const focusY = this.height;
    const focusZ = target.z + Math.cos(target.heading) * lead;

    const cp = Math.cos(this.pitch);
    let ox = Math.sin(this.yaw) * cp * this.dist;
    let oz = Math.cos(this.yaw) * cp * this.dist;
    let oy = -Math.sin(this.pitch) * this.dist + 0.9;

    // March the boom in until it clears the buildings behind the player, and ease the result so
    // the camera slides in and back out instead of popping.
    let allowed = 1;
    for (let s = 0.25; s <= 1; s += 0.15) {
      if (this.world.blocked(focusX + ox * s, focusZ + oz * s, 0.4)) { allowed = Math.max(0.25, s - 0.18); break; }
    }
    this.clearance = U.damp(this.clearance ?? 1, allowed, allowed < this.clearance ? 14 : 5, dt);
    allowed = this.clearance;
    ox *= allowed;
    oz *= allowed;
    oy *= allowed;

    // Over-the-shoulder framing on foot: the body sits a little left of centre so the street
    // ahead stays readable while a target is in view.
    if (!driving) {
      const bias = 0.95 * this.zoom;
      ox += Math.cos(this.yaw) * bias;
      oz -= Math.sin(this.yaw) * bias;
    }

    const jitter = this.shake * 0.25;
    this.pos.set(
      focusX + ox + U.rand(-jitter, jitter),
      Math.max(0.7, focusY + oy + U.rand(-jitter, jitter)),
      focusZ + oz + U.rand(-jitter, jitter),
    );
    this.camera.position.copy(this.pos);
    this.look.set(focusX, focusY + 0.35, focusZ);
    this.camera.lookAt(this.look);

    this.roll = U.damp(this.roll, U.clamp(-input.mouse.dx * 0.001, -0.035, 0.035), 6, dt);
    this.camera.rotateZ(this.roll + U.rand(-jitter, jitter) * 0.2);
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }
}
