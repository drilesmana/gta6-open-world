// Velora Heat — main orchestrator (chunk 3, written from the spec only).
// Imports every module, builds renderer / scene / camera, lighting, sky,
// city, player, traffic, pedestrians, police, missions, HUD, minimap, audio
// and effects, runs the animation loop and manages the flow:
// title -> brief -> play -> mission complete -> story finish, saving on
// progress. Owns one shared game state object.
//
// The other chunks' exact key names are not visible from this file, so
// every cross-module read here is defensive: namespace imports, several
// candidate key/method names, numeric fallbacks, and try/catch around each
// system call. A single misbehaving system is reported (window.__velora
// .errors) instead of taking the whole game down.

import * as ConfigMod from './config.js';
import * as UtilMod from './util.js';
import * as MaterialsMod from './materials.js';
import * as LightingMod from './lighting.js';
import * as SkyMod from './sky.js';
import * as CityMod from './city.js';
import * as PlayerMod from './player.js';
import * as CharactersMod from './characters.js';
import * as VehiclesMod from './vehicles.js';
import * as DrivingMod from './driving.js';
import * as TrafficMod from './traffic.js';
import * as PedestriansMod from './pedestrians.js';
import * as PoliceMod from './police.js';
import * as AudioMod from './audio.js';
import * as VfxMod from './vfx.js';
import * as MissionsMod from './missions.js';
import * as HudMod from './hud.js';
import * as MinimapMod from './minimap.js';
import * as SaveMod from './save.js';

// Stop the browser's automatic /favicon.ico request (the page shell ships
// no icon file, so the request 404s and logs a console error). A data-URI
// icon satisfies the lookup with no network request. Runs synchronously
// at module evaluation, before the browser's favicon fetch.
if (typeof document !== 'undefined') {
  try {
    if (!document.querySelector('link[rel="icon"], link[rel="shortcut icon"]')) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = 'data:,';
      document.head.appendChild(link);
    }
  } catch (_err) { /* never break boot for an icon */ }
}

// ---------------------------------------------------------------- helpers
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function firstKey(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}
function pickFn(mod, names) {
  for (const name of names) {
    if (mod && typeof mod[name] === 'function') return mod[name];
  }
  return null;
}
function toXZ(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return { x: num(p[0], 0), z: num(p[1], 0) };
  if (typeof p === 'object') {
    if (typeof p.x === 'number' || typeof p.z === 'number') return { x: num(p.x, 0), z: num(p.z, 0) };
    if (p.position) return toXZ(p.position);
    if (p.mesh && p.mesh.position) return toXZ(p.mesh.position);
    if (p.group && p.group.position) return toXZ(p.group.position);
  }
  return null;
}
const clampLocal = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp = typeof UtilMod.clamp === 'function' ? UtilMod.clamp : clampLocal;

// Resolve CONFIG defensively: the spec says config exports CONFIG.
const CONFIG = ConfigMod.CONFIG || ConfigMod.default || {};
function cfg(names, fallback) {
  const v = firstKey(CONFIG, names);
  if (v !== undefined) return v;
  // Also look one level down (palette / colours / tuning nests).
  for (const nest of ['palette', 'colors', 'colours', 'tuning', 'game', 'settings']) {
    const sub = CONFIG[nest];
    if (sub && typeof sub === 'object') {
      const sv = firstKey(sub, names);
      if (sv !== undefined) return sv;
    }
  }
  return fallback;
}
const START_MONEY = num(cfg(['startingMoney', 'startMoney', 'initialMoney', 'money', 'playerMoney']), 250);
const START_HEALTH = num(cfg(['startingHealth', 'startHealth', 'initialHealth', 'health', 'maxHealth']), 100);
const CITY_HALF = (() => {
  // CONFIG.citySize is the FULL width (640 -> +/-320).
  const v = num(cfg(['citySize', 'city_size', 'worldSize', 'mapSize', 'size']), 400);
  return v / 2;
})();

const errors = [];
function report(system, err) {
  const msg = err && err.message ? err.message : String(err);
  errors.push({ system, message: msg, at: Date.now() });
  if (errors.length > 40) errors.shift();
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[velora:' + system + '] ' + msg);
  }
}
function safeCall(system, fn) {
  try {
    return fn();
  } catch (err) {
    report(system, err);
    return undefined;
  }
}

// ------------------------------------------------------------ THREE setup
async function loadThree() {
  if (typeof window !== 'undefined' && window.THREE && window.THREE.Scene) return window.THREE;
  try {
    const m = await import('../vendor/three.min.js');
    const cand = (m && m.Scene) ? m : (m && m.default && m.default.Scene ? m.default : null);
    if (cand) return cand;
  } catch (_err) { /* fall through to window.THREE */ }
  if (typeof window !== 'undefined' && window.THREE && window.THREE.Scene) return window.THREE;
  return null;
}

function findGameCanvas(minimapCanvas) {
  const doc = document;
  for (const id of ['game-canvas', 'game', 'canvas', 'scene', 'viewport', 'webgl', 'three-canvas']) {
    const el = doc.getElementById(id);
    if (el && el.tagName === 'CANVAS') return el;
  }
  const canvases = Array.from(doc.querySelectorAll('canvas'));
  for (const c of canvases) {
    if (minimapCanvas && c === minimapCanvas) continue;
    if (c.id && /minimap|map/i.test(c.id)) continue;
    if (c.className && /minimap/i.test(String(c.className))) continue;
    return c;
  }
  const c = doc.createElement('canvas');
  c.id = 'vh-game-canvas';
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;';
  doc.body.appendChild(c);
  return c;
}

function findMinimapCanvas() {
  const doc = document;
  for (const id of ['minimap', 'minimap-canvas', 'minimapCanvas', 'map', 'hud-minimap']) {
    const el = doc.getElementById(id);
    if (el && el.tagName === 'CANVAS') return el;
  }
  const el = doc.querySelector('canvas.minimap, canvas[data-hud="minimap"]');
  if (el) return el;
  const c = doc.createElement('canvas');
  c.id = 'vh-minimap';
  c.width = 170;
  c.height = 170;
  c.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:40;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.4);';
  doc.body.appendChild(c);
  return c;
}

// ------------------------------------------------------------------- boot
async function boot() {
  const THREE = await loadThree();
  if (!THREE) {
    if (typeof document !== 'undefined') {
      document.body.innerHTML = '<div style="font-family:sans-serif;padding:40px">Velora Heat could not start: Three.js failed to load.</div>';
    }
    return;
  }

  // Chunk-2 systems read THREE from the global: their modules guard on
  // window.THREE and throw when it is missing. The page shell loads
  // three.min.js as a classic script, which cannot execute an ES-module
  // build, so the global is never set there — publish the imported
  // namespace here, before any system is created. This file is the only
  // place the global is assigned.
  try {
    globalThis.THREE = THREE;
    if (typeof window !== 'undefined') window.THREE = THREE;
  } catch (_err) { /* ignore */ }

  const makeMaterials = pickFn(MaterialsMod, ['makeMaterials']);
  const setupLighting = pickFn(LightingMod, ['setupLighting']);
  const createSky = pickFn(SkyMod, ['createSky']);
  const createCity = pickFn(CityMod, ['createCity']);
  const createPlayer = pickFn(PlayerMod, ['createPlayer']);
  const makePerson = pickFn(CharactersMod, ['makePerson']);
  const makeCar = pickFn(VehiclesMod, ['makeCar']);
  const createDriving = pickFn(DrivingMod, ['createDriving']);
  const createTraffic = pickFn(TrafficMod, ['createTraffic']);
  const createPedestrians = pickFn(PedestriansMod, ['createPedestrians']);
  const createPolice = pickFn(PoliceMod, ['createPolice']);
  const createAudio = pickFn(AudioMod, ['createAudio']);
  const createVfx = pickFn(VfxMod, ['createVfx']);
  const createMissions = pickFn(MissionsMod, ['createMissions']);
  const createHud = pickFn(HudMod, ['createHud']);
  const createMinimap = pickFn(MinimapMod, ['createMinimap']);
  const saveGame = SaveMod.saveGame || null;
  const loadGame = SaveMod.loadGame || null;

  const saved = safeCall('save', () => (loadGame ? loadGame() : null));

  const minimapCanvas = findMinimapCanvas();
  const gameCanvas = findGameCanvas(minimapCanvas);

  const renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if ('shadowMap' in renderer) {
    renderer.shadowMap.enabled = true;
    // r186 removed PCFSoftShadowMap; PCFShadowMap is the supported soft type.
    if (THREE.PCFShadowMap !== undefined) renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  // Filmic tone mapping + sRGB output: highlights roll off warm instead of
  // clipping to flat white, and paint/glass pick up a real sheen.
  if (THREE.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  if (THREE.SRGBColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffd9a0);
  if (THREE.Fog) scene.fog = new THREE.Fog(0xffd9a0, 120, 700);

  // NOTE (r14): a procedural PMREM environment map was tried here and
  // removed again — in headless SwiftShader every standard-material
  // fragment pays a cubemap fetch for it and in-game FPS fell 1.0 -> 0.14.
  // Paints instead get their sheen from the sun + hemisphere with low
  // metalness (see materials.js); ACES + the warm sun carry the look.

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 26, 34);
  camera.lookAt(0, 0, 0);

  // ---- shared state (the one object every system reads) ---------------
  const state = {
    player: null, car: null, wanted: 0, money: START_MONEY, health: START_HEALTH,
    mission: 0, finished: false, bestScore: START_MONEY,
    config: CONFIG, city: null, traffic: null, police: null, pedestrians: null,
    driving: null, missions: null, phase: 'title',
    playerHeading: 0, speed: 0, speedKmh: 0, escape: 0,
    playerPos: { x: 0, z: 0 }, timePlayed: 0,
  };
  if (saved) {
    if (typeof saved.money === 'number') state.money = saved.money;
    if (typeof saved.bestScore === 'number') state.bestScore = Math.max(state.bestScore, saved.bestScore);
    if (typeof saved.health === 'number' && saved.health > 0) state.health = saved.health;
    if (typeof saved.mission === 'number') state.mission = clamp(saved.mission, 0, 3);
    if (saved.finished) state.bestScore = Math.max(state.bestScore, state.money);
  }

  // ---- world ----------------------------------------------------------
  const materials = safeCall('materials', () => (makeMaterials ? makeMaterials() : {})) || {};
  const sun = safeCall('lighting', () => (setupLighting ? setupLighting(scene) : null));
  const sky = safeCall('sky', () => (createSky ? createSky(scene) : null));
  const city = safeCall('city', () => (createCity ? createCity(scene, materials) : null));
  state.city = city;

  const playerStart = (() => {
    if (city) {
      const p = toXZ(firstKey(city, ['playerStart', 'start', 'startPoint', 'spawn', 'playerSpawn']));
      if (p) return p;
    }
    return { x: 0, z: 0 };
  })();
  state.playerPos = { x: playerStart.x, z: playerStart.z };

  const player = safeCall('player', () => (createPlayer ? createPlayer(scene, materials) : null));
  state.player = player;
  const driving = safeCall('driving', () => (createDriving && player ? createDriving(player, city) : null));
  state.driving = driving;
  const traffic = safeCall('traffic', () => (createTraffic && makeCar ? createTraffic(scene, city, makeCar) : null));
  state.traffic = traffic;
  const pedestrians = safeCall('pedestrians', () => (createPedestrians && makePerson ? createPedestrians(scene, city, makePerson) : null));
  state.pedestrians = pedestrians;
  const police = safeCall('police', () => (createPolice && makeCar ? createPolice(scene, city, makeCar) : null));
  state.police = police;
  const audio = safeCall('audio', () => (createAudio ? createAudio() : null));
  const vfx = safeCall('vfx', () => (createVfx ? createVfx(scene) : null));

  // Parked cars the player can steal: placed at the city's car spawn
  // points (or a fallback ring) so stealing never depends on catching a
  // moving traffic car.
  const parkedCars = [];
  if (makeCar) {
    const colourList = firstKey(VehiclesMod, ['CAR_COLOURS', 'carColours', 'colours', 'COLORS', 'carColors'])
      || ['red', 'blue', 'teal', 'cream', 'gold', 'coral'];
    const colours = Array.isArray(colourList) && colourList.length > 0 ? colourList : ['red', 'blue', 'teal', 'cream', 'gold', 'coral'];
    const spots = [];
    if (city) {
      const raw = firstKey(city, ['carSpawns', 'carSpawnPoints', 'spawns', 'spawnPoints', 'parkingSpots']);
      if (Array.isArray(raw)) for (const s of raw) { const p = toXZ(s); if (p) spots.push(p); }
    }
    if (spots.length === 0) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spots.push({ x: Math.cos(a) * 60, z: Math.sin(a) * 60 });
      }
    }
    spots.slice(0, 8).forEach((spot, i) => {
      safeCall('parked-car', () => {
        const colour = colours[i % colours.length];
        const group = makeCar(colour, 'sedan', materials);
        const obj = group && (group.isObject3D || group.isGroup) ? group : null;
        if (!obj) return;
        obj.position.set(spot.x, 0, spot.z);
        obj.rotation.y = (i * 1.7) % (Math.PI * 2);
        scene.add(obj);
        parkedCars.push({ group: obj, mesh: obj, position: obj.position, kind: 'sedan', colour, parked: true });
      });
    });
  }
  state.parkedCars = parkedCars;

  // ---- missions / hud / minimap ---------------------------------------
  const missions = safeCall('missions', () => (createMissions ? createMissions(state) : null));
  state.missions = missions;
  if (missions && saved && typeof saved.mission === 'number' && typeof missions.setMission === 'function') {
    safeCall('missions-load', () => missions.setMission(clamp(saved.mission, 0, 3)));
    state.mission = clamp(saved.mission, 0, 3);
  }
  const hud = safeCall('hud', () => (createHud ? createHud() : null));
  const minimap = safeCall('minimap', () => (createMinimap ? createMinimap(minimapCanvas, state) : null));

  // ---- input ----------------------------------------------------------
  const keys = new Set();
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked || !audio) return;
    audioUnlocked = true;
    safeCall('audio-unlock', () => {
      if (typeof audio.resume === 'function') audio.resume();
      if (typeof audio.unlock === 'function') audio.unlock();
      if (typeof audio.start === 'function') audio.start();
    });
  }
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', (ev) => {
    unlockAudio();
    keys.add(ev.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(ev.code)) ev.preventDefault();
    if ((ev.code === 'KeyE' || ev.code === 'KeyF') && state.phase === 'play') tryEnterExitCar();
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('beforeunload', () => {
    if (saveGame) safeCall('save', () => saveGame(state));
  });

  function inputState() {
    return {
      up: keys.has('KeyW') || keys.has('ArrowUp'),
      down: keys.has('KeyS') || keys.has('ArrowDown'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight'),
      run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      brake: keys.has('Space'),
      handbrake: keys.has('Space'),
      reverse: keys.has('KeyS') || keys.has('ArrowDown'),
      keys,
    };
  }

  // ---- position / driving helpers -------------------------------------
  function playerPositionObject() {
    if (!player) return null;
    if (player.position && typeof player.position.x === 'number') return player.position;
    if (player.mesh && player.mesh.position) return player.mesh.position;
    if (player.group && player.group.position) return player.group.position;
    if (player.object && player.object.position) return player.object.position;
    return null;
  }
  function readPlayerPos() {
    const obj = playerPositionObject();
    if (obj) return { x: num(obj.x, 0), z: num(obj.z, 0) };
    if (player && typeof player.getPosition === 'function') {
      const p = safeCall('player-pos', () => player.getPosition());
      const q = toXZ(p);
      if (q) return q;
    }
    if (player && typeof player.x === 'number') return { x: player.x, z: num(player.z, 0) };
    return { ...state.playerPos };
  }
  function readHeading() {
    const cg = currentCarGroup();
    if (cg && cg.rotation && typeof cg.rotation.y === 'number') return cg.rotation.y;
    if (state.car) {
      const g = state.car.group || state.car.mesh || state.car.object || state.car;
      if (g && g.rotation && typeof g.rotation.y === 'number') return g.rotation.y;
    }
    if (player) {
      if (typeof player.heading === 'number') return player.heading;
      if (typeof player.angle === 'number') return player.angle;
      const mesh = player.mesh || player.group || player.object || null;
      if (mesh && mesh.rotation && typeof mesh.rotation.y === 'number') return mesh.rotation.y;
      if (player.rotation && typeof player.rotation.y === 'number') return player.rotation.y;
    }
    return state.playerHeading;
  }
  function readDriving() {
    if (state.car) return true;
    if (!player) return false;
    if (player.driving === true || player.isDriving === true || player.inCar === true) return true;
    if (driving && (driving.driving === true || driving.isDriving === true || driving.inCar === true)) return true;
    if (driving && typeof driving.isDriving === 'function') {
      return !!safeCall('driving-isDriving', () => driving.isDriving());
    }
    if (typeof player.isDriving === 'function') {
      return !!safeCall('player-isDriving', () => player.isDriving());
    }
    return false;
  }
  function readSpeedMs() {
    if (driving) {
      const v = firstKey(driving, ['speed', 'speedMs', 'velocity']);
      if (typeof v === 'number') return v;
      if (typeof driving.getSpeed === 'function') {
        const s = safeCall('driving-speed', () => driving.getSpeed());
        if (typeof s === 'number') return s;
      }
      if (typeof driving.getSpeedKmh === 'function') {
        const k = safeCall('driving-speedkmh', () => driving.getSpeedKmh());
        if (typeof k === 'number') return k / 3.6;
      }
    }
    if (player && typeof player.speed === 'number') return player.speed;
    return state.speed || 0;
  }
  function readWanted() {
    if (!police) return state.wanted;
    if (typeof police.wanted === 'number') return police.wanted;
    if (typeof police.wantedLevel === 'number') return police.wantedLevel;
    if (typeof police.stars === 'number') return police.stars;
    if (typeof police.level === 'number') return police.level;
    if (typeof police.getWanted === 'function') {
      const w = safeCall('police-wanted', () => police.getWanted());
      if (typeof w === 'number') return w;
    }
    return state.wanted;
  }
  function readEscape() {
    if (!police) return 0;
    if (typeof police.escape === 'number') return police.escape;
    if (typeof police.escapeMeter === 'number') return police.escapeMeter;
    if (typeof police.escapeProgress === 'number') return police.escapeProgress;
    if (typeof police.getEscapeProgress === 'function') {
      const e = safeCall('police-escape', () => police.getEscapeProgress());
      if (typeof e === 'number') return e;
    }
    if (typeof police.getEscape === 'function') {
      const e = safeCall('police-escape2', () => police.getEscape());
      if (typeof e === 'number') return e;
    }
    return 0;
  }
  function trafficCarList() {
    if (!traffic) return [];
    if (Array.isArray(traffic)) return traffic;
    const raw = firstKey(traffic, ['cars', 'list', 'vehicles', 'liveCars', 'liveTraffic', 'items']);
    return Array.isArray(raw) ? raw : [];
  }
  // The car the player is currently driving, as a THREE group — from any
  // of the three places that may hold it (main's state, driving, player).
  function currentCarGroup() {
    const c = state.car || (driving && driving.car) || (player && player.car) || null;
    if (!c) return null;
    if (c.isGroup || c.isObject3D) return c;
    return c.group || c.mesh || c.object || null;
  }
  // While driving, the player module leaves its own position frozen at
  // the point where the player got in — the car group is the only thing
  // that moves. The orchestrator syncs the player position to the car
  // every frame so police, missions, minimap and camera see the truth.
  function syncPlayerToCar() {
    if (!readDriving()) return;
    const cg = currentCarGroup();
    const pp = playerPositionObject();
    if (!cg || !cg.position || !pp) return;
    if (typeof pp.set === 'function') pp.set(cg.position.x, num(pp.y, 0), cg.position.z);
    else { pp.x = cg.position.x; pp.z = cg.position.z; }
    if (!state.car) state.car = { group: cg, mesh: cg, position: cg.position };
  }
  function policeCarList() {
    if (!police) return [];
    if (Array.isArray(police)) return police;
    const raw = firstKey(police, ['pursuitCars', 'cars', 'list', 'vehicles', 'units']);
    return Array.isArray(raw) ? raw : [];
  }
  function setPlayerPos(x, z) {
    state.playerPos = { x, z };
    snapCamera = true;
    if (!player) return;
    safeCall('teleport', () => {
      if (typeof player.teleport === 'function') { player.teleport(x, z); return; }
      if (typeof player.setPosition === 'function') { player.setPosition(x, 0, z); return; }
      const obj = playerPositionObject();
      if (obj && typeof obj.set === 'function') { obj.set(x, num(obj.y, 0), z); return; }
      if (obj) { obj.x = x; obj.z = z; return; }
      if (typeof player.x === 'number') { player.x = x; player.z = z; }
    });
  }

  function nearestStealableCar(maxDist) {
    const pos = readPlayerPos();
    let best = null;
    let bestD = maxDist;
    const consider = (car) => {
      if (!car || car === state.car) return;
      const p = toXZ(car);
      if (!p) return;
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { best = car; bestD = d; }
    };
    parkedCars.forEach(consider);
    trafficCarList().forEach(consider);
    return best;
  }

  function tryEnterExitCar() {
    if (readDriving()) {
      // Exit the car.
      let exited = false;
      safeCall('exit-car', () => {
        if (driving && typeof driving.exitCar === 'function') { driving.exitCar(); exited = true; }
        else if (driving && typeof driving.leaveCar === 'function') { driving.leaveCar(); exited = true; }
        else if (driving && typeof driving.exit === 'function') { driving.exit(); exited = true; }
        else if (player && typeof player.exitCar === 'function') { player.exitCar(); exited = true; }
        else if (player && typeof player.leaveCar === 'function') { player.leaveCar(); exited = true; }
      });
      state.car = null;
      if (audio && typeof audio.playClick === 'function') safeCall('audio-click', () => audio.playClick());
      // Step the player out beside where the car was.
      const pos = readPlayerPos();
      setPlayerPos(pos.x + 2.5, pos.z + 2.5);
      return exited;
    }
    const car = nearestStealableCar(7);
    if (!car) {
      if (hud) hud.showBanner('No car close enough — walk up to one and press E.', 1800);
      return false;
    }
    let entered = false;
    safeCall('enter-car', () => {
      const target = car.group || car.mesh || car;
      if (driving && typeof driving.enterCar === 'function') { driving.enterCar(target); entered = true; }
      else if (driving && typeof driving.enter === 'function') { driving.enter(target); entered = true; }
      else if (player && typeof player.enterCar === 'function') { player.enterCar(target); entered = true; }
      else if (player && typeof player.enter === 'function') { player.enter(target); entered = true; }
    });
    // If the enter call did not visibly switch to driving, retry with the
    // wrapper object instead of the bare group.
    if (!readDriving() && car !== (car.group || car.mesh || car)) {
      safeCall('enter-car-retry', () => {
        if (driving && typeof driving.enterCar === 'function') { driving.enterCar(car); entered = true; }
        else if (player && typeof player.enterCar === 'function') { player.enterCar(car); entered = true; }
      });
    }
    if (readDriving() || entered) {
      state.car = car;
      if (car.parked) {
        const i = parkedCars.indexOf(car);
        if (i >= 0) parkedCars.splice(i, 1);
      }
      if (audio && typeof audio.playClick === 'function') safeCall('audio-click', () => audio.playClick());
      return true;
    }
    return false;
  }

  // ---- mission event handling -----------------------------------------
  function doSave() {
    if (saveGame) safeCall('save', () => saveGame(state));
  }
  function handleMissionEvent(ev) {
    if (!ev || !hud) return;
    if (ev.type === 'phase') {
      hud.showBanner(ev.mission.objective, 2600);
      hud.setObjective(ev.mission.objective);
      if (audio && typeof audio.playPickup === 'function') safeCall('audio-pickup', () => audio.playPickup());
      doSave();
    } else if (ev.type === 'mission-complete') {
      hud.showBanner('Mission complete: ' + ev.mission.title + '  +$' + ev.mission.reward, 3000);
      if (audio && typeof audio.playSuccess === 'function') safeCall('audio-success', () => audio.playSuccess());
      doSave();
      if (ev.next) {
        state.phase = 'brief';
        hud.showBrief(ev.next);
      }
    } else if (ev.type === 'story-complete') {
      doSave();
      state.phase = 'finish';
      if (audio && typeof audio.playSuccess === 'function') safeCall('audio-success', () => audio.playSuccess());
      hud.showFinish({ money: state.money, bestScore: state.bestScore, missionsDone: 4, timePlayed: state.timePlayed });
    } else if (ev.type === 'need-car') {
      hud.showBanner('You need a car for this — steal one first (E).', 1800);
    }
  }

  // ---- flow wiring ------------------------------------------------------
  if (hud) {
    hud.onStart(() => {
      unlockAudio();
      if (audio && typeof audio.playClick === 'function') safeCall('audio-click', () => audio.playClick());
      state.phase = 'brief';
      hud.showBrief(missions ? missions.currentMission() : null);
    });
    hud.onBrief(() => {
      unlockAudio();
      if (audio && typeof audio.playClick === 'function') safeCall('audio-click', () => audio.playClick());
      hud.hideScreens();
      state.phase = 'play';
      if (missions) hud.setObjective(missions.currentObjective());
    });
    hud.onFinish(() => {
      unlockAudio();
      state.money = START_MONEY;
      state.health = START_HEALTH;
      state.wanted = 0;
      state.finished = false;
      state.timePlayed = 0;
      if (police && typeof police.setWanted === 'function') safeCall('police-reset', () => police.setWanted(0));
      if (missions && typeof missions.setMission === 'function') missions.setMission(0);
      state.mission = 0;
      setPlayerPos(playerStart.x, playerStart.z);
      state.phase = 'brief';
      hud.showBrief(missions ? missions.currentMission() : null);
      doSave();
    });
    hud.showTitle();
    hud.setHealth(state.health, START_HEALTH);
    hud.setMoney(state.money);
    hud.setWanted(0);
    hud.setSpeed(0);
    hud.setObjective(missions ? missions.currentObjective() : 'Save Nia\u2019s garage.');
  }

  // ---- camera fallback --------------------------------------------------
  // The player / driving modules own the camera per the spec. If the
  // camera never moves while the player clearly does, main takes over.
  let camFallback = false;
  let camCheckAt = 0;
  let camCheckPos = null;
  let camCheckPlayerPos = null;
  let lastPlayerCheck = null;
  let snapCamera = false;

  function updateCameraFallback(dt, now) {
    const pos = readPlayerPos();
    if (!lastPlayerCheck) {
      lastPlayerCheck = pos;
      camCheckPos = camera.position.clone();
      camCheckPlayerPos = pos;
      camCheckAt = now;
      return;
    }
    lastPlayerCheck = pos;
    if (camFallback) {
      const heading = readHeading();
      // r16: forward vector — the camera sits BEHIND the player and looks
      // ahead. Was negated: the fallback camera sat in front of the player
      // and looked backward, so driving shots showed the empty road behind
      // instead of the traffic ahead (the module chase cameras are never
      // called — main.js never passes the camera to them — so this
      // fallback IS the game's camera).
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const dist = state.car ? 13 : 9;
      const height = state.car ? 5.5 : 4;
      const tx = pos.x - fx * dist;
      const tz = pos.z - fz * dist;
      if (snapCamera) {
        // Teleports and respawns: place the camera at once instead of
        // lerping across the map for seconds.
        camera.position.set(tx, height, tz);
        camera.lookAt(pos.x + fx * 6, 1.5, pos.z + fz * 6);
        snapCamera = false;
        return;
      }
      camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 4);
      camera.position.y += (height - camera.position.y) * Math.min(1, dt * 4);
      camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 4);
      camera.lookAt(pos.x + fx * 6, 1.5, pos.z + fz * 6);
      return;
    }
    // Compare against the player position at the last check, not the last
    // frame: per-frame movement (dt <= 0.05) can never exceed 0.5 m, so the
    // old check could never fire and the camera stayed at the title view.
    if (now - camCheckAt > 2500) {
      const moved = camCheckPlayerPos
        ? Math.hypot(pos.x - camCheckPlayerPos.x, pos.z - camCheckPlayerPos.z)
        : 0;
      if (moved > 0.5) {
        const camMoved = camCheckPos ? camera.position.distanceTo(camCheckPos) : 99;
        if (camMoved < 0.5) {
          camFallback = true;
          snapCamera = true;
          report('camera', new Error('camera never moved while player did; main.js took over follow'));
        }
      }
      camCheckPos = camera.position.clone();
      camCheckPlayerPos = pos;
      camCheckAt = now;
    }
  }

  // ---- audio / vfx helpers ----------------------------------------------
  let lastSirenAt = 0;
  let lastEngineAt = 0;
  let lastSmokeAt = 0;
  let lastSparkAt = 0;
  let lastCrashAt = 0;
  let lastContactAt = -9999;

  function updateAudioFx(now, dt) {
    if (!audio) return;
    const speedKmh = state.speedKmh;
    if (now - lastEngineAt > 200) {
      lastEngineAt = now;
      safeCall('audio-engine', () => {
        if (typeof audio.setEngineSpeed === 'function') audio.setEngineSpeed(speedKmh);
        else if (typeof audio.setEngine === 'function') audio.setEngine(speedKmh);
        else if (typeof audio.playEngine === 'function' && readDriving()) audio.playEngine();
      });
    }
    if (state.wanted > 0 && now - lastSirenAt > 5000) {
      lastSirenAt = now;
      safeCall('audio-siren', () => {
        if (typeof audio.playSiren === 'function') audio.playSiren();
      });
    }
  }

  function spawnSmokeAt(pos) {
    if (!vfx) return;
    safeCall('vfx-smoke', () => {
      if (typeof vfx.spawnTyreSmoke === 'function') vfx.spawnTyreSmoke(pos);
      else if (typeof vfx.spawnSmoke === 'function') vfx.spawnSmoke(pos);
    });
  }
  function spawnSparksAt(pos) {
    if (!vfx) return;
    safeCall('vfx-sparks', () => {
      if (typeof vfx.spawnSparks === 'function') vfx.spawnSparks(pos);
    });
  }

  // ---- main loop ---------------------------------------------------------
  let lastT = performance.now();
  let lastHudAt = 0;
  let lastSaveAt = 0;
  let prevSpeed = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - lastT) / 1000, 0, 0.05);
    lastT = now;
    const input = inputState();
    const playing = state.phase === 'play';

    if (playing) state.timePlayed += dt;

    // World updates.
    if (sky) safeCall('sky', () => { if (typeof sky.update === 'function') sky.update(dt); });
    if (sun && typeof sun.update === 'function') safeCall('sun-follow', () => sun.update(readPlayerPos()));
    if (traffic) safeCall('traffic', () => { if (typeof traffic.update === 'function') traffic.update(dt); });
    if (pedestrians) safeCall('pedestrians', () => { if (typeof pedestrians.update === 'function') pedestrians.update(dt); });

    if (playing) {
      if (player) safeCall('player', () => { if (typeof player.update === 'function') player.update(dt, input); });
      if (driving) safeCall('driving', () => { if (typeof driving.update === 'function') driving.update(dt, input); });
      safeCall('sync-player-car', syncPlayerToCar);
      if (police) {
        safeCall('police', () => {
          if (typeof police.update === 'function') {
            const pp = playerPositionObject();
            if (pp) police.update(dt, pp);
            else police.update(dt, { x: state.playerPos.x, y: 0, z: state.playerPos.z });
          }
        });
      }
    }

    // Shared-state sync.
    const pos = readPlayerPos();
    const prevPos = state.playerPos;
    const movedDist = Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z);
    state.playerPos = pos;
    if (movedDist > 0.05 && movedDist < 50 && dt > 0) {
      // A jump over 50 m in one frame is a teleport, not a heading.
      state.playerHeading = Math.atan2(-(pos.x - prevPos.x), -(pos.z - prevPos.z));
    } else {
      state.playerHeading = readHeading();
    }
    const speedMs = readSpeedMs();
    if (playing && dt > 0 && Math.abs(speedMs) < 0.01) {
      state.speed = movedDist / dt;
    } else {
      state.speed = Math.abs(speedMs);
    }
    state.speedKmh = state.speed * 3.6;
    state.wanted = clamp(Math.round(readWanted()), 0, 5);
    state.escape = clamp(num(readEscape(), 0), 0, 1);
    if (state.car && !readDriving()) state.car = null;

    // Police contact damage + effects.
    if (playing && state.wanted > 0) {
      let nearestPolice = Infinity;
      for (const car of policeCarList()) {
        const p = toXZ(car);
        if (!p) continue;
        nearestPolice = Math.min(nearestPolice, Math.hypot(p.x - pos.x, p.z - pos.z));
      }
      if (nearestPolice < 4.5) {
        lastContactAt = now / 1000;
        state.health = Math.max(0, state.health - 9 * dt);
        if (now - lastSparkAt > 300) {
          lastSparkAt = now;
          spawnSparksAt({ x: pos.x, y: 1, z: pos.z });
        }
        if (now - lastCrashAt > 1200) {
          lastCrashAt = now;
          safeCall('audio-crash', () => { if (audio && typeof audio.playCrash === 'function') audio.playCrash(); });
        }
      }
      // Tyre smoke while fleeing hard.
      if (readDriving() && input.handbrake && state.speed > 4 && now - lastSmokeAt > 140) {
        lastSmokeAt = now;
        spawnSmokeAt({ x: pos.x, y: 0.3, z: pos.z });
      }
    }
    // Slow health regen when safe.
    if (playing && now / 1000 - lastContactAt > 6 && state.health > 0 && state.health < START_HEALTH) {
      state.health = Math.min(START_HEALTH, state.health + 2 * dt);
    }
    // Busted: caught with no health left.
    if (playing && state.health <= 0) {
      state.health = Math.round(START_HEALTH / 2);
      state.money = Math.max(0, state.money - 200);
      state.wanted = 0;
      if (police && typeof police.setWanted === 'function') safeCall('police-reset', () => police.setWanted(0));
      else if (police && typeof police.lowerWanted === 'function') safeCall('police-reset', () => police.lowerWanted(5));
      if (state.car) { state.car = null; }
      setPlayerPos(playerStart.x, playerStart.z);
      if (hud) hud.showBanner('Busted! The crew bailed you out — $200.', 3000);
      doSave();
    }

    // Crash jolt: a sudden speed collapse while driving plays a crash.
    if (playing && readDriving() && prevSpeed > 14 && state.speed < prevSpeed * 0.3 && now - lastCrashAt > 1500) {
      lastCrashAt = now;
      safeCall('audio-crash', () => { if (audio && typeof audio.playCrash === 'function') audio.playCrash(); });
      spawnSparksAt({ x: pos.x, y: 1, z: pos.z });
    }
    prevSpeed = state.speed;

    // Missions.
    if (playing && missions && typeof missions.update === 'function') {
      const ev = safeCall('missions', () => missions.update(dt));
      if (ev) handleMissionEvent(ev);
    }

    // VFX.
    if (vfx) safeCall('vfx', () => { if (typeof vfx.update === 'function') vfx.update(dt); });

    // Camera.
    if (playing) updateCameraFallback(dt, now);

    // HUD + minimap (throttled text, live map).
    if (hud && now - lastHudAt > 120) {
      lastHudAt = now;
      safeCall('hud', () => {
        hud.setHealth(Math.round(state.health), START_HEALTH);
        hud.setMoney(state.money);
        hud.setWanted(state.wanted);
        hud.setSpeed(Math.round(state.speedKmh));
        let obj = missions ? missions.currentObjective() : '';
        if (state.wanted > 0 && state.escape > 0) {
          obj += '  —  Escape ' + Math.round(state.escape * 100) + '%';
        }
        hud.setObjective(obj);
      });
    }
    if (minimap) safeCall('minimap', () => { if (typeof minimap.update === 'function') minimap.update(dt); });

    if (playing) updateAudioFx(now, dt);

    // Periodic save.
    if (playing && now - lastSaveAt > 15000) {
      lastSaveAt = now;
      doSave();
    }

    renderer.render(scene, camera);
  }

  // ---- debug hooks (this file's own; used by the playtest only) --------
  window.__velora = {
    state, missions, hud, player, driving, traffic, police, city, errors,
    config: CONFIG, camera, renderer,
    pos() { return { ...readPlayerPos(), driving: readDriving(), wanted: state.wanted, money: state.money, health: state.health, mission: state.mission, phase: state.phase }; },
    teleport(x, z) {
      const cg = currentCarGroup();
      if (cg && cg.position && typeof cg.position.set === 'function') cg.position.set(x, 0, z);
      setPlayerPos(x, z);
      return readPlayerPos();
    },
    setWanted(n) {
      if (police && typeof police.setWanted === 'function') safeCall('police-set', () => police.setWanted(n));
      else if (police && typeof police.raiseWanted === 'function' && n > state.wanted) safeCall('police-raise', () => police.raiseWanted(n - state.wanted));
      state.wanted = n;
      return state.wanted;
    },
    enterNearestCar() { return tryEnterExitCar(); },
    completeMission() {
      if (!missions) return null;
      const ev = missions.advance();
      if (ev) handleMissionEvent(ev);
      return ev;
    },
    skipToMission(i) {
      if (!missions || typeof missions.setMission !== 'function') return null;
      const m = missions.setMission(i);
      state.phase = 'play';
      if (hud) { hud.hideScreens(); hud.setObjective(missions.currentObjective()); }
      return m;
    },
    startGame() {
      if (hud) {
        state.phase = 'brief';
        hud.showBrief(missions ? missions.currentMission() : null);
      }
    },
    beginPlay() {
      if (hud) hud.hideScreens();
      state.phase = 'play';
    },
    setSunset() {
      if (sun) {
        safeCall('sunset', () => {
          if (sun.position && typeof sun.position.set === 'function') sun.position.set(-120, 28, 60);
          if (sun.color && typeof sun.color.set === 'function') sun.color.set(0xff9a3c);
          if (typeof sun.intensity === 'number') sun.intensity = 1.6;
        });
      }
      scene.background = new THREE.Color(0xff8c42);
      if (scene.fog) scene.fog.color = new THREE.Color(0xff8c42);
      if (sky && typeof sky.setMode === 'function') safeCall('sky-sunset', () => sky.setMode('sunset'));
      return true;
    },
    setGolden() {
      if (sun) {
        safeCall('golden', () => {
          if (sun.position && typeof sun.position.set === 'function') sun.position.set(90, 70, 40);
          if (sun.color && typeof sun.color.set === 'function') sun.color.set(0xffd27a);
        });
      }
      scene.background = new THREE.Color(0xffd9a0);
      if (scene.fog) scene.fog.color = new THREE.Color(0xffd9a0);
      if (sky && typeof sky.setMode === 'function') safeCall('sky-golden', () => sky.setMode('golden'));
      return true;
    },
  };

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  if (typeof console !== 'undefined' && console.error) console.error('[velora:boot] ' + (err && err.message ? err.message : err));
});
