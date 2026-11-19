// Velora Heat — entry point: renderer, world wiring, the frame loop and
// the state machine that carries the player from the title screen to the
// final job. Everything runs from static files: three.js is vendored, all
// textures and sounds are generated in code, nothing is fetched at runtime.
//
// Screen flow: boot → title → brief → play ⇄ paused → busted / finish.
// The `world` object below is the narrow bridge the mission manager uses to
// talk back to the game (cash, toasts, objectives, saves).
import { GAME_NAME, MISSIONS, PLAYER, CITY_HALF, WATER_START, STREETS } from './config.js';
import { createMaterials } from './materials.js';
import { createSky } from './sky.js';
import { createLighting } from './lighting.js';
import { buildCity, LANDMARKS } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Minimap, drawMap } from './minimap.js';
import { Sfx } from './audio.js';
import { Vfx } from './vfx.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { clamp, damp, angleLerp, dist2 } from './util.js';

// URL switches used by the QA driver and the screenshot maker.
const params = new URLSearchParams(location.search);
const LITE = params.has('lite'); // low pixel ratio, for headless runs
const SHOT = params.get('shot'); // drive | foot | chase | sunset
const QA = params.has('qa'); // step the sim by hand instead of rAF

const canvas = document.getElementById('scene');
const hud = new Hud();
const sfx = new Sfx();

// ---- renderer ----
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('boot').innerHTML = '<h1>VELORA HEAT</h1><p>WebGL is not available in this browser.</p>';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LITE ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);

// ---- scene ----
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf0a56e, 130, 520);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1400);
camera.position.set(0, 8, -14);

// ---- world systems, built once and shared ----
createMaterials();
createSky(scene);
const lighting = createLighting(scene, renderer);
const { colliders, waterTex } = buildCity(scene);
const vfx = new Vfx(scene);
const player = new Player(scene);
const traffic = new Traffic(scene, colliders);
const peds = new Pedestrians(scene);
const police = new Police(scene, colliders, sfx);
const missions = new Missions(scene);
const minimap = new Minimap(document.getElementById('minimap'));
const bigmapCanvas = document.getElementById('bigmapCanvas');
const bigmap = { canvas: bigmapCanvas, ctx: bigmapCanvas.getContext('2d') };

// ---- mutable game state (exposed as window.G for the QA driver) ----
const G = {
  state: 'boot',
  cash: 0,
  clockMin: 17 * 60 + 12, // the story starts at golden hour
  time: 0,
  saveTimer: 0,
  bigMapOpen: false,
  muted: false,
  camYaw: Math.PI,
  camPitch: 0.32,
  camDist: 8,
  camTarget: { x: 0, y: 1.6, z: 0 },
  orbitHold: 0, // seconds since the player last dragged the camera
  stats: { carsStolen: 0, pedsPunched: 0, missionsDone: 0, topSpeed: 0 },
};
window.G = G;
G.player = player;
G.traffic = traffic;
G.peds = peds;
G.police = police;
G.wanted = police;
G.missions = missions;
G.camera = camera;

// ---- input state ----
const keys = {};
let mouseDown = false;
let lastMouse = { x: 0, y: 0 };
let mouseMoved = 0;

// ---- screen helpers ----
function show(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hide(id) {
  document.getElementById(id).classList.add('hidden');
}
const SCREENS = ['title', 'story', 'pause', 'wasted', 'brief', 'finish'];
function showOnly(id) {
  for (const s of SCREENS) hide(s);
  if (id) show(id);
}

function districtAt(x, z) {
  if (z > 186) return 'PROMENADE';
  if (z > 150 && x > 100) return 'MARINA';
  if (x < -80 && z < -80) return 'MERCADO';
  if (Math.hypot(x - 52, z + 104) < 30) return 'PALMERA PARK';
  if (x > 80) return 'CALLE VERDE';
  if (x < -80) return 'OLD TOWN';
  if (z < -130) return 'NORTH END';
  return 'DOWNTOWN';
}

function clockText() {
  const h = Math.floor(G.clockMin / 60) % 24;
  const m = Math.floor(G.clockMin % 60);
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return `${days[Math.floor(G.time / 86400) % 7]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---- persistence ----
function saveGame() {
  writeSave({
    cash: G.cash,
    missionIndex: missions.index,
    storyDone: missions.storyDone,
    health: player.health,
    x: player.vehicle ? player.vehicle.x : player.x,
    z: player.vehicle ? player.vehicle.z : player.z,
    stats: G.stats,
  });
  hud.saveFlash();
}

function resetWorldForPlay() {
  missions.active = null;
  missions.waiting = false;
  police.clear();
  traffic.clear();
  peds.clear();
  traffic.spawnInitial(player.x, player.z);
  peds.spawnInitial(player.x, player.z);
  G.camYaw = Math.PI;
}

function startNew() {
  G.cash = 0;
  G.stats = { carsStolen: 0, pedsPunched: 0, missionsDone: 0, topSpeed: 0 };
  missions.index = 0;
  missions.storyDone = false;
  missions.clearMarker();
  player.health = 100;
  player.setPosition(-26, 150, Math.PI);
  resetWorldForPlay();
  enterPlay();
  offerBrief();
}

function loadGame() {
  const s = loadSave();
  if (!s) return false;
  G.cash = s.cash || 0;
  G.stats = s.stats || G.stats;
  missions.index = s.missionIndex || 0;
  missions.storyDone = !!s.storyDone;
  player.health = s.health ?? 100;
  player.setPosition(s.x ?? -26, s.z ?? 150, Math.PI);
  resetWorldForPlay();
  enterPlay();
  if (!missions.storyDone && missions.currentDef) offerBrief();
  return true;
}

// ---- screen transitions ----
function enterPlay() {
  G.state = 'play';
  showOnly(null);
  hud.show();
  hud.setMoney(G.cash);
  hud.setHealth(player.health);
  hud.setObjective('Velora Bay', missions.objectiveText(), 'Press M for the map · F to take a car');
}

function fillBriefCard(def) {
  document.getElementById('briefTab').textContent = `Job ${missions.index + 1} of ${MISSIONS.length}`;
  document.getElementById('briefTitle').textContent = def.title;
  document.getElementById('briefText').textContent = `${def.giver}: ${def.brief} Reward: $${def.reward}.`;
}

function offerBrief() {
  const def = missions.offer();
  if (!def) return;
  G.state = 'brief';
  fillBriefCard(def);
  showOnly('brief');
}

function onStoryComplete() {
  G.state = 'finish';
  const s = G.stats;
  document.getElementById('finishStats').innerHTML =
    `<div class="stat"><span>Jobs finished</span><span>${s.missionsDone} / ${MISSIONS.length}</span></div>` +
    `<div class="stat"><span>Cars stolen</span><span>${s.carsStolen}</span></div>` +
    `<div class="stat"><span>Top speed</span><span>${Math.round(s.topSpeed * 3.6)} km/h</span></div>` +
    `<div class="stat"><span>Cash</span><span>$${G.cash.toLocaleString('en-US')}</span></div>`;
  showOnly('finish');
  saveGame();
}

// ---- the bridge the mission manager uses to reach the game ----
const world = {
  player, traffic, police, vfx, sfx, hud,
  addCash(n) {
    G.cash += n;
    hud.setMoney(G.cash);
  },
  save: saveGame,
  toast: (t, k) => hud.toast(t, k),
  subtitle: (w, t) => hud.subtitle(w, t),
  setObjective: (h, t, s) => hud.setObjective(h, t, s),
  offerNext() {
    offerBrief();
  },
  onStoryComplete,
};

// ---- stealing and leaving cars ----
function crimeWitnessed() {
  if (peds.nearest(player.x, player.z, 45)) return true;
  for (const c of police.cars) {
    if (dist2(c.x, c.z, player.x, player.z) < 80 * 80) return true;
  }
  return false;
}

function tryEnterCar() {
  if (player.vehicle) return;
  const car = traffic.nearestCar(player.x, player.z, 3.6);
  if (!car) return;
  const wasParked = car.parked;
  if (car.driver === 'ai') {
    // The driver bails and runs for it.
    const d = peds.spawn(player.x, player.z);
    d.x = car.x + 2;
    d.z = car.z + 2;
    d.flee(5);
  }
  player.vehicle = car;
  car.driver = 'player';
  car.parked = false;
  traffic.setCarShadow(car, true); // the hero car casts a real shadow
  traffic.parked = traffic.parked.filter((c) => c !== car);
  player.rig.root.visible = false;
  G.stats.carsStolen++;
  sfx.horn();
  if (crimeWitnessed()) {
    police.addCrime(12, 'theft');
    hud.toast('Car stolen — someone saw you', 'bad');
  } else {
    hud.toast(wasParked ? 'Car taken' : 'Carjacked', '');
  }
  if (car.isPrize) hud.toast('The Aurelio GT', 'cash');
  hud.setObjective('Velora Bay', missions.objectiveText(), 'WASD to drive · Space to handbrake · F to get out');
}

function exitCar() {
  const car = player.vehicle;
  if (!car) return;
  const f = car.forward();
  // Step out on the left side of the car.
  player.setPosition(car.x - f.z * 2.4, car.z + f.x * 2.4, car.heading);
  player.vehicle = null;
  car.driver = null;
  car.speed *= 0.4;
  traffic.setCarShadow(car, false);
  if (!traffic.parked.includes(car)) traffic.parked.push(car);
  player.rig.root.visible = true;
}

// ---- keyboard ----
addEventListener('keydown', (e) => {
  sfx.ensure();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (G.state === 'play') {
      G.state = 'paused';
      showOnly('pause');
    } else if (G.state === 'paused') {
      resume();
    }
    return;
  }
  if (G.state !== 'play') return;
  if (e.code === 'KeyF') {
    if (player.vehicle) exitCar();
    else tryEnterCar();
  }
  if (e.code === 'KeyE') {
    if (missions.waiting && missions.tryStartAt(player.x, player.z, world)) {
      G.state = 'play';
      showOnly(null);
      offerBriefAfterStart();
    }
  }
  if (e.code === 'KeyM') toggleBigMap();
  if (e.code === 'KeyH') sfx.horn();
  if (e.code === 'KeyQ') {
    sfx.radioOn = !sfx.radioOn;
    hud.toast(sfx.radioOn ? 'Radio on' : 'Radio off', '');
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// ---- mouse: drag orbits the camera, a click punches ----
canvas.addEventListener('pointerdown', (e) => {
  sfx.ensure();
  mouseDown = true;
  mouseMoved = 0;
  lastMouse = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', () => {
  if (mouseDown && mouseMoved < 6 && G.state === 'play' && !player.vehicle) {
    player.startPunch();
  }
  mouseDown = false;
});
addEventListener('pointermove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  mouseMoved += Math.abs(dx) + Math.abs(dy);
  lastMouse = { x: e.clientX, y: e.clientY };
  G.camYaw -= dx * 0.005;
  G.camPitch = clamp(G.camPitch + dy * 0.003, 0.08, 1.1);
  G.orbitHold = 0;
});
canvas.addEventListener('wheel', (e) => {
  G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.2, 5, 18);
  e.preventDefault();
}, { passive: false });

function offerBriefAfterStart() {
  // After starting a declined job from the giver, show its brief card.
  const def = missions.active ? missions.active.def : null;
  if (!def) {
    G.state = 'play';
    return;
  }
  G.state = 'brief';
  fillBriefCard(def);
  showOnly('brief');
}

function toggleBigMap() {
  G.bigMapOpen = !G.bigMapOpen;
  document.getElementById('bigmap').classList.toggle('hidden', !G.bigMapOpen);
}

function resume() {
  G.state = 'play';
  showOnly(null);
}

// ---- menu buttons ----
function bindButton(id, fn) {
  document.getElementById(id).addEventListener('click', () => {
    sfx.click();
    fn();
  });
}
document.getElementById('btnNew').addEventListener('click', () => {
  sfx.ensure();
  sfx.click();
  clearSave();
  startNew();
});
document.getElementById('btnContinue').addEventListener('click', () => {
  sfx.ensure();
  sfx.click();
  if (!loadGame()) startNew();
});
bindButton('btnStory', () => showOnly('story'));
bindButton('btnStoryDone', () => showOnly('title'));
bindButton('btnStoryNext', () => {
  const slides = document.querySelectorAll('#story .slide');
  const dots = document.querySelectorAll('#story .dots i');
  let cur = 0;
  slides.forEach((s, i) => {
    if (s.classList.contains('on')) cur = i;
  });
  slides[cur].classList.remove('on');
  dots[cur].classList.remove('on');
  const next = (cur + 1) % slides.length;
  slides[next].classList.add('on');
  dots[next].classList.add('on');
});
bindButton('btnKeys', () => {
  document.getElementById('keyList').classList.toggle('hidden');
});
bindButton('btnResume', resume);
bindButton('btnSave', () => {
  saveGame();
  hud.toast('Progress saved', 'cash');
});
document.getElementById('btnMute').addEventListener('click', (e) => {
  sfx.ensure();
  G.muted = !G.muted;
  sfx.setMuted(G.muted);
  e.target.textContent = `Sound: ${G.muted ? 'Off' : 'On'}`;
});
document.getElementById('btnRadio').addEventListener('click', (e) => {
  sfx.radioOn = !sfx.radioOn;
  e.target.textContent = `Radio: ${sfx.radioOn ? 'On' : 'Off'}`;
});
bindButton('btnQuit', () => {
  saveGame();
  G.state = 'title';
  hud.hide();
  showOnly('title');
  refreshTitleButtons();
});
bindButton('btnRetry', respawnAfterBust);
bindButton('btnHospital', respawnAfterBust);
document.getElementById('btnBriefGo').addEventListener('click', () => {
  sfx.click();
  const def = missions.start(world);
  if (def) {
    G.state = 'play';
    showOnly(null);
    hud.setObjective(`Job · ${def.title}`, missions.objectiveText(), '');
    hud.subtitle(def.giver, def.brief);
  }
});
bindButton('btnBriefLater', () => {
  missions.decline();
  G.state = 'play';
  showOnly(null);
  hud.setObjective('Velora Bay', missions.objectiveText(), 'The job waits at the marker.');
});
bindButton('btnFree', () => {
  G.state = 'play';
  showOnly(null);
});
bindButton('btnFinishQuit', () => {
  G.state = 'title';
  hud.hide();
  showOnly('title');
  refreshTitleButtons();
});

function respawnAfterBust() {
  police.clear();
  player.health = 60;
  if (player.vehicle) {
    traffic.removeCar(player.vehicle);
    player.vehicle = null;
    player.rig.root.visible = true;
  }
  player.setPosition(LANDMARKS.garage.x, LANDMARKS.garage.z, Math.PI);
  G.state = 'play';
  showOnly(null);
  hud.setHealth(player.health);
  hud.toast('You are back on the street', '');
}

function refreshTitleButtons() {
  document.getElementById('btnContinue').disabled = !loadSave();
}

// ---- third-person camera ----
function updateCamera(dt) {
  const driving = !!player.vehicle;
  const anchor = driving
    ? { x: player.vehicle.x, y: 2.0, z: player.vehicle.z }
    : { x: player.x, y: 1.7, z: player.z };
  G.camTarget.x = damp(G.camTarget.x, anchor.x, 12, dt);
  G.camTarget.y = damp(G.camTarget.y, anchor.y, 12, dt);
  G.camTarget.z = damp(G.camTarget.z, anchor.z, 12, dt);

  // While driving, the camera settles behind the car unless the player orbits.
  G.orbitHold += dt;
  if (driving && G.orbitHold > 2.5) {
    G.camYaw = angleLerp(G.camYaw, player.vehicle.heading, 1.6 * dt);
  }
  const dist = driving ? G.camDist + 3.5 : G.camDist;
  const height = Math.sin(G.camPitch) * dist * 0.55 + 1.2;
  const flat = Math.cos(G.camPitch) * dist;
  let cx = G.camTarget.x - Math.sin(G.camYaw) * flat;
  let cz = G.camTarget.z - Math.cos(G.camYaw) * flat;
  let cy = G.camTarget.y + height;
  // Keep the camera out of buildings: pull it toward the target.
  for (let i = 0; i < 4; i++) {
    const inside = colliders.some((b) => cx > b.minX - 0.4 && cx < b.maxX + 0.4 && cz > b.minZ - 0.4 && cz < b.maxZ + 0.4 && cy < 40);
    if (!inside) break;
    cx = (cx + G.camTarget.x) / 2;
    cz = (cz + G.camTarget.z) / 2;
    cy = (cy + G.camTarget.y + 2) / 2;
  }
  cy = Math.max(cy, 1.4);
  camera.position.set(cx, cy, cz);
  camera.lookAt(G.camTarget.x, G.camTarget.y, G.camTarget.z);
}

// ---- one simulation step ----
function step(dt) {
  G.time += dt;
  G.clockMin += dt * 0.5; // a game minute every 2 real seconds
  waterTex.offset.x += dt * 0.008;
  waterTex.offset.y += dt * 0.003;

  if (G.state !== 'play') {
    // The world idles behind menus: traffic drifts, clouds move.
    return;
  }

  const input = {
    f: !!keys.KeyW || !!keys.ArrowUp,
    b: !!keys.KeyS || !!keys.ArrowDown,
    l: !!keys.KeyA || !!keys.ArrowLeft,
    r: !!keys.KeyD || !!keys.ArrowRight,
    run: !!keys.ShiftLeft || !!keys.ShiftRight,
    punch: false,
    camYaw: G.camYaw, // movement is relative to the camera view
  };

  if (player.vehicle) {
    drivePlayerCar(dt, input);
  } else {
    player.update(dt, input, colliders, peds, (amount, reason) => {
      police.addCrime(amount, reason);
      G.stats.pedsPunched++;
    });
    sfx.setEngine(0, false);
  }

  // World systems.
  traffic.update(dt, player.x, player.z, vfx);
  peds.update(dt, player, player.vehicle, police.cars);
  const busted = police.update(dt, player, player.vehicle, vfx);
  missions.update(dt, world);
  vfx.update(dt);

  // Slow health regen out of trouble.
  if (police.level === 0 && player.health > 0 && player.health < 100) {
    player.heal(dt * 1.5);
  }

  // Busted / wasted.
  if (busted === 'busted' || player.health <= 0) {
    endRun(player.health <= 0 ? 'Wasted' : 'Busted');
    return;
  }

  // HUD (throttled by the callers themselves where it matters).
  hud.setStars(police.level, police.escape);
  hud.setHealth(player.health);
  hud.setSpeed(player.vehicle ? player.vehicle.speedKmh : 0, !!player.vehicle);
  hud.setMoney(G.cash);
  hud.setDistrict(districtAt(player.x, player.z));
  hud.setClock(clockText());
  hud.damageFlash(player.hurtFlash);
  const heading = player.vehicle ? player.vehicle.heading : player.heading;
  minimap.draw({
    player: { x: player.x, z: player.z, heading },
    traffic: traffic.cars,
    police: police.cars,
    marker: missions.marker,
  });
  if (G.bigMapOpen) {
    drawMap(bigmap.ctx, 880, player.x, player.z, {
      player: { x: player.x, z: player.z, heading: player.heading },
      traffic: traffic.cars,
      police: police.cars,
      marker: missions.marker,
    });
  }

  // Context prompt: what the player can do right here.
  let promptHtml = '';
  if (!player.vehicle) {
    const car = traffic.nearestCar(player.x, player.z, 3.6);
    if (car) promptHtml = '<b>F</b> Take the car';
    else if (missions.waiting) {
      const g = LANDMARKS.garage;
      if (Math.hypot(player.x - g.x, player.z - g.z) < 6) promptHtml = '<b>E</b> Talk to Nia — take the job';
    }
  }
  hud.prompt(promptHtml);

  // Periodic save.
  G.saveTimer += dt;
  if (G.saveTimer > 30) {
    G.saveTimer = 0;
    saveGame();
  }

  // The shadow frustum follows the player.
  lighting.follow(player.vehicle ? player.vehicle.x : player.x, player.vehicle ? player.vehicle.z : player.z);
  updateCamera(dt);
}

function drivePlayerCar(dt, input) {
  const car = player.vehicle;
  const throttle = input.f ? 1 : input.b ? -1 : 0;
  const steer = (input.l ? -1 : 0) + (input.r ? 1 : 0);
  const impact = car.update(dt, { throttle, steer, handbrake: !!keys.Space }, colliders);
  if (impact > 0.25) {
    vfx.sparks(car.x, 0.9, car.z);
    sfx.crash();
    player.damage(impact * 10);
  }
  if (Math.abs(car.speed) > 4 && Math.random() < dt * 2) vfx.dust(car.x, 0.2, car.z, 1);
  if (keys.Space && Math.abs(car.speed) > 8 && Math.random() < dt * 20) {
    vfx.skid(car.x - Math.sin(car.heading) * 1.4, 0.06, car.z - Math.cos(car.heading) * 1.4, car.heading);
  }
  G.stats.topSpeed = Math.max(G.stats.topSpeed, Math.abs(car.speed));
  sfx.setEngine(Math.abs(car.speed) / 38, true);
  // Bumps against traffic: shove both cars apart and trade speed.
  for (const other of traffic.cars) {
    if (other === car || other.driver === 'player') continue;
    const d = Math.hypot(other.x - car.x, other.z - car.z);
    if (d < 3.6 && d > 0.01) {
      const push = (3.6 - d) / 2;
      const nx = (car.x - other.x) / d;
      const nz = (car.z - other.z) / d;
      car.x += nx * push;
      car.z += nz * push;
      other.x -= nx * push;
      other.z -= nz * push;
      if (Math.abs(car.speed - other.speed) > 5) {
        vfx.sparks((car.x + other.x) / 2, 0.9, (car.z + other.z) / 2);
        sfx.crash();
        player.damage(4);
        police.addCrime(4, 'collision');
      }
      const tmp = car.speed;
      car.speed = car.speed * 0.7 + other.speed * 0.3;
      other.speed = other.speed * 0.7 + tmp * 0.3;
    }
  }
  if (car.health <= 0) {
    // The car is wrecked: the player is out on foot, health low.
    exitCar();
    player.damage(30);
    hud.toast('Your car is wrecked', 'bad');
  }
}

function endRun(title) {
  const loss = Math.min(G.cash, Math.max(50, Math.floor(G.cash * 0.25)));
  G.cash -= loss;
  hud.setMoney(G.cash);
  document.querySelector('#wasted h2').textContent = title;
  document.getElementById('wastedText').textContent =
    `${title === 'Busted' ? 'The Velora PD pulls you in. Bail costs you' : 'The bay spits you back onto the promenade, lighter in the wallet. You lose'} $${loss}.`;
  G.state = 'busted';
  showOnly('wasted');
  sfx.missionFail();
  saveGame();
}

// ---- the frame loop ----
let last = performance.now();
let frameCount = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!QA) step(dt);
  renderer.render(scene, camera);
  // Renderer diagnostics for the headless QA driver (and the scorecard).
  if (++frameCount % 30 === 0) {
    window.__stats = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }
  requestAnimationFrame(frame);
}

// ---- debug / screenshot API on window.G ----
G.sim = function (seconds, heldKeys = []) {
  const prev = { ...keys };
  for (const k of Object.keys(keys)) keys[k] = false;
  for (const k of heldKeys) keys[k] = true;
  const steps = Math.round(seconds / 0.016);
  for (let i = 0; i < steps; i++) step(0.016);
  for (const k of heldKeys) keys[k] = false;
  Object.assign(keys, prev);
};
G.step = function (dt) {
  step(dt);
};
G.render = function () {
  // Manual frame: headless shells sometimes throttle rAF, so the QA driver
  // renders explicitly before a screenshot or a stats read.
  renderer.render(scene, camera);
  window.__stats = {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
};
G.tap = function (code) {
  // Dispatch a real key event: F/E/M/Escape live in the keydown handler,
  // not in the per-frame input read, so setting keys[] alone would not fire them.
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  step(0.016);
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  step(0.05);
};
G.setPosition = function (x, z, heading = 0) {
  if (player.vehicle) exitCar();
  player.setPosition(x, z, heading);
  G.camYaw = heading; // camera sits behind the player, looking where they face
};
G.startNew = function () {
  startNew();
};
G.beginBrief = function () {
  const def = missions.offer();
  if (def) offerBrief();
};
G.resume = resume;
G.spawnParked = function (x, z, heading = 0, type = 'sedan', colorHex = null) {
  return traffic.spawnParked(x, z, heading, type, colorHex);
};

// ---- screenshot staging: ?shot=drive|foot|chase|sunset ----
// These are real gameplay states, staged for the camera — the maker taking
// screenshots of the game itself. The game plays identically without them.
function stageShot(name) {
  startNew();
  hide('brief');
  G.state = 'play';
  showOnly(null);
  hud.show();
  if (name === 'drive') {
    // Cover: Dario driving a red sedan down a city street toward the sunset,
    // buildings both sides, traffic ahead. Camera behind the car (camYaw =
    // heading), so the road ahead and the sunset are in frame.
    const car = traffic.spawnParked(-26, 60, 0, 'sedan', 0xc23b2e);
    player.setPosition(car.x - 2, car.z, 0);
    tryEnterCar();
    missions.start(world);
    G.camYaw = 0;
    G.camDist = 8;
  } else if (name === 'foot') {
    // On foot in the city: Dario on a street with buildings, a parked car
    // and pedestrians around — the city, not the empty beach.
    player.setPosition(-26, -52, 0);
    traffic.spawnParked(-26, -44, 0, 'coupe', 0x2e6fb0);
    for (let i = 0; i < 4; i++) peds.spawn(-26, -52);
    G.camYaw = 0;
    G.camDist = 7;
  } else if (name === 'chase') {
    // Three-star pursuit: Dario in a stolen sport car, two cruisers right on
    // his bumper, flanking him in the rear view. The road ahead is cleared
    // of traffic so the chase reads instead of a pile-up, and the sim is
    // short so the cruisers are still closing in, not left behind.
    const car = traffic.spawnParked(-26, -100, 0, 'sport', 0x2b3a55);
    player.setPosition(car.x - 2, car.z, 0);
    tryEnterCar();
    for (const c of [...traffic.cars, ...traffic.parked]) {
      if (Math.abs(c.x + 26) < 14 && c.z > -110 && c.z < 0) traffic.removeCar(c);
      else if (Math.abs(c.x - 26) < 14 && c.z > -110 && c.z < 0) traffic.removeCar(c);
    }
    police.setLevel(3);
    // A roadblock ahead: two cruisers coming at the player down the same
    // street, light bars flashing, so the pursuit reads in the frame the
    // rear camera actually sees. The sim is short, so they close in but do
    // not reach the player before the shot.
    const pc1 = police.spawnCar(player.vehicle.x, player.vehicle.z);
    pc1.setPose(-28, -70, Math.PI);
    const pc2 = police.spawnCar(player.vehicle.x, player.vehicle.z);
    pc2.setPose(-24, -60, Math.PI);
    G.camYaw = 0;
    G.camPitch = 0.45;
    G.camDist = 11;
  } else if (name === 'sunset') {
    // The score: Dario on the beach approaching the gold Aurelio GT, the
    // Velora Bay skyline and a golden sky behind it.
    missions.index = 3;
    missions.start(world);
    player.setPosition(130, 216, Math.PI);
    G.camYaw = Math.PI;
    G.camDist = 8;
  }
  hud.setObjective('Velora Bay', missions.objectiveText(), '');
  hud.setMoney(G.cash);
}

// ---- boot ----
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

refreshTitleButtons();
document.getElementById('boot').style.display = 'none';
G.state = 'title';
showOnly('title');
hud.hide();
if (SHOT) {
  stageShot(SHOT);
} else if (QA) {
  G.state = 'title';
}
requestAnimationFrame(frame);
