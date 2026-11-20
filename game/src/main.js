// main.js — Velora Heat orchestrator.
// Imports every module, builds the renderer/scene/camera, wires the
// systems together, runs the animation loop, and manages the game flow:
// title screen, mission brief, play, mission complete, story finish,
// and save on progress. Owns one shared game state object.
// No network requests. Zero console errors by construction (every
// cross-chunk call is defensive: unknown shapes fall back, never throw).

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand, randInt, pick, clamp } from './util.js';
import { makeMaterials } from './materials.js';
import { setupLighting } from './lighting.js';
import { createSky } from './sky.js';
import { createCity } from './city.js';
import { makePerson } from './characters.js';
import { makeCar } from './vehicles.js';
import { createPlayer } from './player.js';
import { createDriving } from './driving.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { createVfx } from './vfx.js';
import { saveGame, loadGame } from './save.js';

// ---- Defensive helpers (cross-chunk shapes are unknown) ----

// Try several dotted paths on an object, return the first defined value.
function tun(obj, paths, fallback) {
  if (!obj) return fallback;
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur === null || cur === undefined || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return fallback;
}

// Call the first method that exists on obj (tries several names).
// Never throws; returns true when a method ran.
function safeCall(obj, names, ...args) {
  if (!obj) return false;
  for (const name of names) {
    if (typeof obj[name] === 'function') {
      try { obj[name](...args); } catch (e) { /* ignore */ }
      return true;
    }
  }
  return false;
}

// Normalise a position to {x, z}.
function pos2(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return { x: p[0], z: p[1] };
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, z: p.y };
  return null;
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---- Error collection (the playtest reads window.__gameErrors) ----
const gameErrors = [];
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    gameErrors.push(String(event.message || event.error || 'error'));
  });
  window.addEventListener('unhandledrejection', (event) => {
    gameErrors.push('unhandled: ' + String(event.reason || 'rejection'));
  });
}

// ---- DOM: canvas + minimap canvas (defensive lookup, fallback create) ----
function findCanvas() {
  if (typeof document === 'undefined') return null;
  const byId = document.getElementById('game-canvas') || document.getElementById('game');
  if (byId && byId.tagName === 'CANVAS') return byId;
  const first = document.querySelector('canvas');
  if (first) return first;
  const c = document.createElement('canvas');
  c.id = 'game-canvas';
  document.body.appendChild(c);
  return c;
}

function findMinimapCanvas() {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('minimap') || document.querySelector('canvas#minimap');
  if (el) return el;
  const c = document.createElement('canvas');
  c.id = 'minimap';
  c.width = 160;
  c.height = 160;
  document.body.appendChild(c);
  return c;
}

// ---- Renderer / scene / camera ----
const canvas = findCanvas();
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
renderer.setSize(typeof window !== 'undefined' ? window.innerWidth : 1280, typeof window !== 'undefined' ? window.innerHeight : 720);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ('ACESFilmicToneMapping' in THREE) renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2c98a);

const camera = new THREE.PerspectiveCamera(
  60,
  (typeof window !== 'undefined' ? window.innerWidth : 1280) / (typeof window !== 'undefined' ? window.innerHeight : 720),
  0.1,
  1200,
);
camera.position.set(0, 24, 40);
camera.lookAt(0, 0, 0);

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ---- World ----
const materials = makeMaterials();
const sun = setupLighting(scene);
// Keep shadows affordable on software rendering: 1024 is plenty for a
// stylised city and much faster than a 2048 shadow map in SwiftShader.
try {
  if (sun && sun.shadow) {
    sun.shadow.mapSize.set(1024, 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
} catch (e) { /* ignore */ }
const sky = createSky(scene);
const city = createCity(scene, materials);

// ---- Shared game state ----
const startMoney = tun(CONFIG, ['missions.startMoney', 'startingMoney', 'startMoney'], 50);
const startHealth = tun(CONFIG, ['missions.startHealth', 'startingHealth', 'startHealth'], 100);
const saved = loadGame();

const state = {
  player: null,
  car: null,
  wanted: 0,
  money: saved && typeof saved.money === 'number' ? saved.money : startMoney,
  health: saved && typeof saved.health === 'number' ? saved.health : startHealth,
  mission: null,
  finished: false,
  best: saved && typeof saved.best === 'number' ? saved.best : 0,
  city,
  traffic: null,
  pedestrians: null,
  police: null,
  driving: null,
  goldCar: null,
};

// ---- Actors and systems ----
const player = createPlayer(scene, materials);
state.player = player;

const driving = createDriving(player, city);
state.driving = driving;

const traffic = createTraffic(scene, city, makeCar);
state.traffic = traffic;

const pedestrians = createPedestrians(scene, city, makePerson);
state.pedestrians = pedestrians;

const police = createPolice(scene, city, makeCar);
state.police = police;
// Give police/traffic/pedestrians the player when they accept one.
safeCall(police, ['setPlayer', 'setTarget'], player);
safeCall(traffic, ['setPlayer', 'setTarget'], player);
safeCall(pedestrians, ['setPlayer', 'setTarget'], player);

const audio = createAudio();
const vfx = createVfx(scene);
const missions = createMissions(state);
state.mission = missions;

// Restore a saved mission (replay from the start when the story is done).
if (saved && !saved.finished && typeof saved.mission === 'number' && saved.mission > 0 && saved.mission < missions.missions.length) {
  missions.index = saved.mission;
  missions.current = missions.missions[saved.mission];
  missions.target = missions.current.target;
  missions.stage = 0;
  missions.started = false;
}

const hud = createHud();
const minimap = createMinimap(findMinimapCanvas(), state);

// ---- Parked cars (stealable) + the gold Aurelio GT ----
const enterable = [];
// City half-size derives from the block grid (blocks * blockSize / 2).
const half = (tun(CONFIG, ['city.blocks'], 5) * tun(CONFIG, ['city.blockSize'], 80)) / 2;
const startPos = pos2(tun(city, ['playerStart', 'playerSpawn', 'start'], null)) || { x: 0, z: 0 };
// Nia's garage (busted respawn point) has an explicit spot in CONFIG.
const garagePos = {
  x: tun(CONFIG, ['garage.x'], startPos.x),
  z: tun(CONFIG, ['garage.z'], startPos.z),
};

function placeCar(group, x, z, heading) {
  group.position.set(x, 0, z);
  group.rotation.y = heading || 0;
  scene.add(group);
  return group;
}

function spawnParkedCars() {
  const colours = ['red', 'blue', 'teal', 'cream', 'coral'];
  const kinds = ['sedan', 'hatch', 'sedan', 'truck'];
  const spots = [
    { x: startPos.x + 14, z: startPos.z + 6 },
    { x: startPos.x - 10, z: startPos.z + 18 },
    { x: startPos.x + 26, z: startPos.z - 12 },
    { x: startPos.x - 22, z: startPos.z - 8 },
  ];
  for (let i = 0; i < spots.length; i++) {
    try {
      const car = makeCar(pick(colours), kinds[i % kinds.length], materials);
      placeCar(car, spots[i].x + rand(-2, 2), spots[i].z + rand(-2, 2), rand(0, Math.PI * 2));
      car.userData.parked = true;
      enterable.push(car);
    } catch (e) { /* a bad parked car must not stop the game */ }
  }
}

function spawnGoldCar() {
  // Uptown, away from the start: prefer a real car-spawn point.
  let spot = null;
  const spawns = tun(city, ['carSpawns', 'carSpawnPoints', 'spawns'], null);
  if (Array.isArray(spawns) && spawns.length > 0) {
    let best = null;
    let bestD = -1;
    for (const s of spawns) {
      const p = pos2(s);
      if (!p) continue;
      const d = dist2(p, startPos);
      if (d > bestD) { bestD = d; best = p; }
    }
    if (best) spot = best;
  }
  if (!spot) spot = { x: half * 0.55, z: -half * 0.55 };
  try {
    const gold = makeCar('gold', 'gold', materials);
    placeCar(gold, spot.x, spot.z, rand(0, Math.PI * 2));
    gold.userData.gold = true;
    gold.userData.parked = true;
    state.goldCar = gold;
    enterable.push(gold);
  } catch (e) { /* gold car missing: mission 4 falls back to its target point */ }
}

spawnParkedCars();
spawnGoldCar();

// ---- Input ----
const input = {
  keys: new Set(),
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
  handbrake: false,
  isDown(code) { return this.keys.has(code); },
};

function refreshInput() {
  const k = input.keys;
  input.forward = k.has('KeyW') || k.has('ArrowUp');
  input.back = k.has('KeyS') || k.has('ArrowDown');
  input.left = k.has('KeyA') || k.has('ArrowLeft');
  input.right = k.has('KeyD') || k.has('ArrowRight');
  input.run = k.has('ShiftLeft') || k.has('ShiftRight');
  input.handbrake = k.has('Space');
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    input.keys.add(event.code);
    refreshInput();
    if (event.code === 'KeyE') onInteract();
    if (event.code === 'Enter') advanceScreen();
    // A movement key is a clear "I want to play" gesture: jump straight
    // to play from the title/brief screens so the player starts moving
    // at once (the mission brief still shows between missions, and the
    // current objective is always on the HUD plus a banner here).
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      if (phase === 'title' || phase === 'brief') {
        phase = 'play';
        hud.showGame();
        hud.setObjective(missions.current ? missions.current.objective : '');
        if (missions.current) hud.showMessage(missions.current.title + ': ' + missions.current.objective, 4000);
      }
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
    refreshInput();
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    refreshInput();
  });
  document.addEventListener('click', () => advanceScreen());
}

// ---- Enter / exit car ----
function playerPos() {
  const p = tun(player, ['position', 'pos'], null) || player;
  return pos2(p);
}

function isDriving() {
  if (player) {
    const d = tun(player, ['driving'], null);
    if (typeof d === 'boolean') return d;
    if (tun(player, ['currentCar', 'car'], null)) return true;
  }
  return !!state.car;
}

function currentCar() {
  if (player) {
    const c = tun(player, ['currentCar', 'car'], null);
    if (c) return c;
  }
  return state.car;
}

function nearestEnterable(maxDist) {
  const p = playerPos();
  if (!p) return null;
  let best = null;
  let bestD = maxDist;
  const trafficCars = tun(traffic, ['cars', 'list', 'live'], null);
  const candidates = enterable.slice();
  if (Array.isArray(trafficCars)) {
    for (const car of trafficCars) candidates.push(car);
  }
  for (const car of candidates) {
    const cp = pos2(tun(car, ['position', 'pos'], null) || car);
    if (!cp) continue;
    const d = dist2(p, cp);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  if (!car) return false;
  // Bind the car in BOTH systems: the player tracks it (currentCar /
  // driving flag) and the driving system moves it (its own car ref).
  // Calling only one leaves the car unmoved — the driving system never
  // sees the car. Neither call may throw; fall back to plain assignment.
  safeCall(player, ['enterCar'], car);
  safeCall(driving, ['enterCar'], car);
  try { if (!tun(player, ['currentCar'], null)) player.currentCar = car; } catch (e) { /* ignore */ }
  try { if (!tun(player, ['driving'], null)) player.driving = true; } catch (e) { /* ignore */ }
  state.car = car;
  // Remove a stolen traffic car from the traffic list so two systems
  // never drive the same car.
  const trafficCars = tun(traffic, ['cars', 'list', 'live'], null);
  if (Array.isArray(trafficCars)) {
    const i = trafficCars.indexOf(car);
    if (i >= 0) trafficCars.splice(i, 1);
  }
  safeCall(traffic, ['removeCar', 'despawn', 'remove'], car);
  const ei = enterable.indexOf(car);
  if (ei >= 0) enterable.splice(ei, 1);
  safeCall(audio, ['playClick', 'click', 'playInterface', 'interface'], null);
  return true;
}

function exitCar() {
  const car = currentCar();
  // Release the car in BOTH systems.
  safeCall(player, ['exitCar'], null);
  safeCall(driving, ['exitCar'], null);
  try { player.currentCar = null; } catch (e) { /* ignore */ }
  try { player.driving = false; } catch (e) { /* ignore */ }
  state.car = null;
  if (car) {
    const cp = pos2(tun(car, ['position', 'pos'], null) || car);
    if (cp) {
      // Park the car where it stopped and make it stealable again.
      if (enterable.indexOf(car) < 0) enterable.push(car);
    }
  }
  return true;
}

function onInteract() {
  if (phase !== 'play') return;
  if (isDriving()) exitCar();
  else {
    const car = nearestEnterable(5);
    if (car) {
      enterCar(car);
      hud.showMessage(car === state.goldCar ? 'Gold Aurelio GT — get it to the garage!' : 'Car stolen. Drive!');
    }
  }
}

// ---- Game flow ----
let phase = 'title'; // title -> brief -> play -> finished
let bustedFlag = false;
let lastWanted = 0;

function advanceScreen() {
  if (phase === 'title') {
    phase = 'brief';
    const m = missions.current;
    hud.showBrief(m ? m.title : 'Velora Heat', m ? m.brief : 'Save Nia\u2019s garage.');
    safeCall(audio, ['playClick', 'click', 'playInterface', 'interface'], null);
  } else if (phase === 'brief') {
    phase = 'play';
    hud.showGame();
    hud.setObjective(missions.current ? missions.current.objective : '');
    safeCall(audio, ['playClick', 'click', 'playInterface', 'interface'], null);
  } else if (phase === 'finished') {
    // Replay from the start.
    resetRun();
  }
}

function resetRun() {
  missions.index = 0;
  missions.current = missions.missions[0];
  missions.target = missions.current.target;
  missions.stage = 0;
  missions.started = false;
  missions.finished = false;
  missions.storyComplete = false;
  state.finished = false;
  state.money = startMoney;
  state.health = startHealth;
  state.wanted = 0;
  phase = 'title';
  hud.showTitle();
}

function onMissionComplete(done) {
  state.best = Math.max(state.best, state.money);
  safeCall(audio, ['playSuccess', 'success', 'playMissionSuccess', 'missionSuccess'], null);
  safeCall(vfx, ['spawnSparks', 'sparks', 'spawn'], null);
  if (missions.finished) {
    phase = 'finished';
    state.finished = true;
    hud.showFinish({ money: state.money, missions: missions.missions.length });
    hud.showMessage('Story complete — Nia\u2019s garage is safe!');
  } else {
    hud.showMessage('Mission complete: ' + done.title + ' +$' + done.reward);
    phase = 'brief';
    const m = missions.current;
    hud.showBrief(m ? m.title : '', m ? m.brief : '');
  }
  // Save last, after state.finished is set, so a finished story is
  // recorded as finished.
  saveGame(state);
}

function onBusted() {
  state.health = clamp(state.health - 25, 0, 100);
  state.wanted = 0;
  safeCall(police, ['lowerWanted'], 0);
  safeCall(audio, ['playCrash', 'crash'], null);
  // Respawn at the garage.
  try {
    if (player && player.position && typeof player.position.set === 'function') {
      player.position.set(garagePos.x, 0, garagePos.z);
    }
  } catch (e) { /* ignore */ }
  if (isDriving()) exitCar();
  hud.showMessage('Busted! The police impounded the car. -25 HP.');
  if (state.health <= 0) {
    state.health = startHealth;
    state.money = Math.max(0, state.money - 50);
    hud.showMessage('You woke up at the garage. -$50 hospital bill.');
  }
  saveGame(state);
}

// ---- HUD / minimap sync ----
function readSpeed() {
  const s = tun(driving, ['speed'], null);
  if (typeof s === 'number') return s;
  const ps = tun(player, ['speed'], null);
  if (typeof ps === 'number') return ps;
  return 0;
}

function readWanted() {
  const w = tun(police, ['wanted'], null);
  if (typeof w === 'number') return w;
  return typeof state.wanted === 'number' ? state.wanted : 0;
}

function syncHud() {
  hud.setHealth(state.health);
  hud.setMoney(state.money);
  hud.setWanted(state.wanted);
  hud.setSpeed(readSpeed());
  hud.setObjective(missions.current ? missions.current.objective : 'Story complete');
  try { minimap.update(); } catch (e) { /* minimap must never break the loop */ }
}

// ---- Main loop ----
const clock = new THREE.Clock();
let firstFrame = true;

function loop() {
  requestAnimationFrame(loop);
  // Clamp the frame delta so a hitch never teleports the game, but keep
  // it generous (0.25 s) so the game still advances at a usable rate on
  // very slow renderers (software WebGL can run near 1 fps).
  const dt = Math.min(clock.getDelta(), 0.25);

  if (phase === 'play') {
    // Player + driving (driving last so its chase camera wins while driving).
    try { safeCall(player, ['update'], dt, camera, input); } catch (e) { gameErrors.push('player.update: ' + e.message); }
    if (!player || typeof player.update !== 'function') {
      // Fallback: if the player has no update, at least keep the camera sane.
      camera.lookAt(playerPos() ? new THREE.Vector3(playerPos().x, 2, playerPos().z) : new THREE.Vector3(0, 0, 0));
    }
    try { safeCall(driving, ['update'], dt, camera, input); } catch (e) { gameErrors.push('driving.update: ' + e.message); }

    // World systems. Extra args are ignored when a system only wants dt.
    try { safeCall(traffic, ['update'], dt, player); } catch (e) { gameErrors.push('traffic.update: ' + e.message); }
    try { safeCall(pedestrians, ['update'], dt, player); } catch (e) { gameErrors.push('pedestrians.update: ' + e.message); }
    try { safeCall(police, ['update'], dt, player); } catch (e) { gameErrors.push('police.update: ' + e.message); }

    // Wanted sync (police is the source of truth).
    state.wanted = readWanted();
    if (state.wanted >= 1 && lastWanted < 1) safeCall(audio, ['playSiren', 'siren'], null);
    if (state.wanted <= 0 && lastWanted >= 1) safeCall(audio, ['stopSiren', 'stop'], null);
    lastWanted = state.wanted;

    // Busted (edge-triggered).
    const busted = tun(police, ['busted'], null);
    const isBusted = busted === true || (typeof busted === 'number' && busted > 0);
    if (isBusted && !bustedFlag) {
      bustedFlag = true;
      onBusted();
    } else if (!isBusted) {
      bustedFlag = false;
    }

    // Missions.
    const done = missions.update(dt);
    if (done) onMissionComplete(done);

    // Sun follows the player so shadows stay near the action.
    try {
      const p = playerPos();
      if (sun && p) {
        sun.position.set(p.x + 60, 90, p.z + 40);
        if (sun.target) {
          sun.target.position.set(p.x, 0, p.z);
          sun.target.updateMatrixWorld();
        }
      }
    } catch (e) { /* ignore */ }

    syncHud();
  }

  // Sky always drifts (even on the title screen, the city looks alive).
  try { safeCall(sky, ['update'], dt); } catch (e) { /* ignore */ }
  try { safeCall(vfx, ['update'], dt); } catch (e) { /* ignore */ }

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    // Expose the game for the playtest once the first frame has rendered.
    if (typeof window !== 'undefined') window.__gameReady = true;
  }
}

// ---- Start on the title screen ----
hud.setHealth(state.health);
hud.setMoney(state.money);
hud.setWanted(0);
hud.setSpeed(0);
hud.setObjective(missions.current ? missions.current.objective : '');
hud.showTitle();

// ---- Playtest hooks ----
if (typeof window !== 'undefined') {
  window.__game = {
    state,
    player,
    driving,
    traffic,
    pedestrians,
    police,
    missions,
    city,
    audio,
    vfx,
    hud,
    minimap,
    renderer,
    scene,
    camera,
    input,
    errors: gameErrors,
    phase() { return phase; },
    start() { advanceScreen(); },
    advance: advanceScreen,
    teleport(x, z) {
      try {
        if (player && player.position && typeof player.position.set === 'function') {
          player.position.set(x, 0, z);
        }
      } catch (e) { /* ignore */ }
      // When driving, move the car too so the player stays in it.
      try {
        const car = currentCar();
        if (car && car.position && typeof car.position.set === 'function') {
          car.position.set(x, 0, z);
        }
      } catch (e) { /* ignore */ }
    },
    // Aim the current car (and the player) at a heading, in radians.
    // 0 faces -z (north along the road grid). Used by the playtest
    // driver to line the car up down an open road for screenshots.
    faceCar(angle) {
      try {
        const car = currentCar();
        if (car && car.rotation) car.rotation.y = angle;
        if (player && typeof player.heading === 'number') player.heading = angle;
      } catch (e) { /* ignore */ }
    },
    // Positions of the parked (stealable) cars, for the playtest driver.
    parkedCars() {
      try {
        return enterable
          .filter(c => c && c.userData && c.userData.parked && c.position)
          .map(c => ({ x: c.position.x, z: c.position.z }));
      } catch (e) { return []; }
    },
    enterCar() {
      const car = nearestEnterable(8);
      return car ? enterCar(car) : false;
    },
    exitCar,
    setWanted(n) {
      if (n > state.wanted) safeCall(police, ['raiseWanted'], n);
      else safeCall(police, ['lowerWanted'], n);
      state.wanted = n;
    },
    completeMission() { return missions.advance(); },
    missionIndex() { return missions.index; },
    wanted() { return state.wanted; },
    money() { return state.money; },
    health() { return state.health; },
    position() { return playerPos(); },
    driving: isDriving,
    finished() { return missions.finished; },
    resetSave() {
      try { if (typeof localStorage !== 'undefined') localStorage.clear(); } catch (e) { /* ignore */ }
    },
  };
}

loop();
