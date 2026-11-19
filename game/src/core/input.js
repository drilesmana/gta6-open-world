// Keyboard and mouse: raw key state, one-frame "pressed" edges, pointer-lock look deltas and
// wheel zoom. Every system reads input through this module so rebinding lives in one place.
// Use physical key codes so the movement cluster stays in the same place across keyboard layouts.

import { clamp } from './util.js';

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
  enter: ['KeyF'],
  interact: ['KeyE'],
  reload: ['KeyR'],
  horn: ['KeyH'],
  radio: ['KeyQ'],
  pause: ['Escape'],
  confirm: ['Enter'],
  map: ['KeyM'],
  recenter: ['KeyC'],
  // Debug: toggle third-person camera distance presets.
  debugZoom: ['KeyZ'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, leftPressed: false, right: false, wheel: 0 };
    // Look sensitivity in radians of camera turn per pixel of mouse travel.
    this.look = 0.0024;
    this.locked = false;
    this.enabled = true;
    // Set by the game: the browser drops the pointer lock on its own when the player hits Esc
    // or alt-tabs, and the frame loop pauses on it rather than letting the city run blind.
    this.onLockLost = null;
    // The tab going away also parks the run: a switch to another window should not leave Rafi
    // standing in the road while cruisers keep arriving.
    this.onHidden = null;
    // Same for the window simply losing focus to another app: keys stick on blur otherwise.
    this.onBlur = null;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.releaseAll();
      this.onHidden?.();
    });

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (Object.values(KEYS).some((codes) => codes.includes(e.code))) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Losing the window to another app drops every held key and parks the run, like a hidden tab.
    addEventListener('blur', () => {
      this.releaseAll();
      this.onBlur?.();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
      if (!this.locked) canvas.requestPointerLock?.()?.catch(() => {});
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) this.onLockLost?.();
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // A pointer-lock glitch can deliver a huge jump; cap it so the camera does not snap round.
      this.mouse.dx += clamp(e.movementX, -220, 220);
      this.mouse.dy += clamp(e.movementY, -220, 220);
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.mouse.wheel += e.deltaY;
    }, { passive: true });
  }

  down(action) {
    return (KEYS[action] ?? []).some((code) => this.keys.has(code));
  }

  hit(action) {
    return (KEYS[action] ?? []).some((code) => this.pressed.has(code));
  }

  // Called at the end of every frame, after every system has read this frame's edges.
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    this.mouse.wheel = 0;
  }

  releaseAll() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.left = false;
    this.mouse.right = false;
    this.endFrame();
  }
}
