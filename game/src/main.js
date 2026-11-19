// Marisol Bay, assembled: renderer and sun, the city, the player, the world's traffic and police,
// the wanted meter, the jobs, the HUD, the sound and the save file, plus the screens around them.
// This module owns the frame loop and is the only place that decides what a state allows.

import * as U from './core/util.js';
import { Input } from './core/input.js';
import { CameraRig } from './core/camera.js';
import { World } from './core/world.js';
import { RoadGraph } from './core/roads.js';
import { Bullets } from './core/bullets.js';
import { buildCity, CITY } from './world/city.js';
import { setAnisotropy } from './world/textures.js';
import { Player } from './entities/player.js';
import { Traffic } from './entities/traffic.js';
import { Peds } from './entities/pedestrian.js';
import { Police } from './entities/police.js';
import { Wanted } from './systems/wanted.js';
import { Missions } from './systems/missions.js';
import { Audio } from './systems/audio.js';
import { Particles } from './systems/particles.js';
import { Collectibles } from './systems/collectibles.js';
import { Hud } from './ui/hud.js';
import { loadSave, writeSave, clearSave, saveAge, EMPTY } from './systems/save.js';

const THREE = globalThis.THREE;

const SUN_COLOR = 0xfff0cf;
const SKY_TOP = '#2f7fb5';
const SKY_LOW = '#ffd9a0';

class Game {
  constructor() {
    this.state = 'boot';
    this.clockMinutes = 8 * 60 + 12;
    this.cash = 0;
    this.cam = null;
    this.shakeTimer = 0;
    this.saveTimer = 0;
    this.rendered = false;
    this.progress = structuredClone(EMPTY);
    this.pendingRetry = null;
    this.lastTime = 0;
    this.elapsed = 0;
    this.bigMapOpen = false;
    this.armed = false;
    this.lockIgnoreUntil = 0;

    this.canvas = document.getElementById('scene');
    // ?lite=1 trades shadows and resolution for frame rate: a soft-rendered laptop, a VM or a
    // software GL stack keeps up instead of dropping the tab.
    this.lite = new URLSearchParams(location.search).has('lite');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.lite, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.lite ? 1 : Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = !this.lite;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    // Every surface texture is painted after this, so the renderer's own limit is passed down.
    setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.background = makeSky();
    this.scene.fog = new THREE.Fog(0xf6d9b4, 130, 520);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.12, 900);
    this.buildLights();

    this.audio = new Audio();
    this.input = new Input(this.canvas);
    // Losing the pointer lock (Esc, alt-tab) or the tab itself parks the run instead of leaving
    // the player walking blind into traffic while cruisers keep spawning.
    this.input.onLockLost = () => {
      // A release that lands just after a resume or a wake-up is the tail of the old lock, not
      // the player pressing Esc: the grace window keeps the run from pausing itself.
      if (this.state === 'play' && !this.bigMapOpen && performance.now() > this.lockIgnoreUntil) this.pause();
    };
    this.input.onHidden = () => {
      if (this.state === 'play') this.pause();
    };
    this.input.onBlur = () => {
      if (this.state === 'play' && !this.bigMapOpen) this.pause();
    };

    this.bindScreens();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xdff0ff, 0xa88d6d, 0.72);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(SUN_COLOR, 3.1);
    this.sun.position.set(-110, 145, 90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.lite ? 1024 : 2048, this.lite ? 1024 : 2048);
    // A tight box that rides with the player: sharper contact shadows than one covering the map.
    const s = this.sun.shadow.camera;
    s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 20; s.far = 300;
    this.sun.shadow.bias = -0.00035;
    s.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // A warm bounce from the pavement keeps the shadows from going blue-black.
    const bounce = new THREE.DirectionalLight(0xffc987, 0.5);
    bounce.position.set(80, 24, -120);
    this.scene.add(bounce);
  }

  captureMouse() {
    if (document.pointerLockElement === this.canvas) return;
    this.canvas.requestPointerLock?.()?.catch(() => {});
  }

  // ---------------------------------------------------------------- screens and buttons
  bindScreens() {
    const $ = (id) => document.getElementById(id);
    const on = (id, fn) => $(id)?.addEventListener('click', fn);

    on('btnNew', () => { clearSave(); this.startNew(); });
    on('btnContinue', () => this.startFromSave());
    on('btnStory', () => $('story').classList.remove('hidden'));
    on('btnStoryDone', () => $('story').classList.add('hidden'));
    on('btnStoryNext', () => this.cycleStory());
    on('btnKeys', () => $('keyList').classList.toggle('hidden'));
    on('btnResume', () => this.resume());
    on('btnSave', () => { this.hud.toast(this.save() ? 'Saved' : 'Save unavailable — browser storage is blocked or full'); });
    on('btnMute', () => { const m = this.audio.toggleMute(); $('btnMute').textContent = `Sound: ${m ? 'Off' : 'On'}`; });
    on('btnRadio', () => { const r = this.audio.toggleRadio(); $('btnRadio').textContent = `Radio: ${r ? 'On' : 'Off'}`; });
    on('btnQuit', () => this.toTitle());
    on('btnRetry', () => this.retry());
    on('btnHospital', () => this.wakeUp());
    on('btnBriefGo', () => this.beginBrief());
    on('btnBriefLater', () => { $('brief').classList.add('hidden'); this.pendingJob = null; this.resume(); });
    on('btnFree', () => { $('finish').classList.add('hidden'); this.state = 'play'; this.captureMouse(); });
    on('btnFinishQuit', () => this.toTitle());
  }

  cycleStory() {
    const slides = [...document.querySelectorAll('#story .slide')];
    const dots = [...document.querySelectorAll('#story .dots i')];
    const at = slides.findIndex((s) => s.classList.contains('on'));
    const next = (at + 1) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('on', i === next));
    dots.forEach((d, i) => d.classList.toggle('on', i === next));
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- boot
  load(progressCb) {
    return new Promise((resolve) => {
      const steps = [
        ['concrete', () => {
          this.city = buildCity(this.scene);
          this.world = new World(this.scene, this.city, this);
          this.roads = new RoadGraph({ ...this.city, cells: CITY.cells });
        }],
        ['people', () => {
          this.particles = new Particles(this.scene);
          this.bullets = new Bullets(this.scene, this);
          this.peds = new Peds(this.scene, this.world);
          this.traffic = new Traffic(this.scene, this.world, this.roads);
          this.traffic.seedParked(this.city.lotAnchors);
          this.traffic.seedCurb(this.city.roadNodes);
          this.police = new Police(this.scene, this.world, this.roads);
          this.collectibles = new Collectibles(this);
        }],
        ['paperwork', () => {
          this.wanted = new Wanted(this);
          this.missions = new Missions(this);
          this.hud = new Hud(this);
          this.player = new Player(this.scene, this.progress.pos.x, this.progress.pos.z);
          this.cam = new CameraRig(this.camera, this.world);
          this.markerMesh = this.buildMarker();
        }],
      ];
      let i = 0;
      const tick = () => {
        if (i >= steps.length) return resolve();
        progressCb?.(i / steps.length);
        steps[i][1]();
        i++;
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  // The floating gold diamond over the current job marker.
  buildMarker() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf0b93c, transparent: true, opacity: 0.85 });
    const geo = new THREE.OctahedronGeometry(0.85, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- state changes
  startNew() {
    this.resetRun();
    this.progress = structuredClone(EMPTY);
    this.cash = 0;
    this.player.armed = true;
    this.player.ammo = 12;
    this.player.reserve = 36;
    this.player.health = this.player.maxHealth;
    this.player.armor = 25;
    this.player.stamina = 1;
    this.player.dead = false;
    const home = this.city.missionSpots.garage;
    this.player.setPosition(home.x + 6, home.z + 15, Math.PI);
    this.cam.setYaw(0.15);
    this.hud.updateAmmo();
    this.wanted.clear();
    this.missions.active = null;
    this.missions.completed = [];
    this.collectibles.reset();
    this.enterPlay();
    this.hud.toast('Welcome back to the bay');
    this.hud.say('BIMA', 'Garage is behind you. Get to work.', 4);
  }

  startFromSave() {
    this.resetRun();
    const data = loadSave();
    if (data) {
      this.progress = data;
      this.cash = data.cash;
      this.player.armed = data.armed;
      this.player.ammo = data.ammo;
      this.player.reserve = data.reserve;
      this.player.setPosition(data.pos.x, data.pos.z, data.pos.heading);
      for (const id of data.collected) {
        const c = this.collectibles.list[id];
        if (c) { c.taken = true; c.timer = 1e9; c.mesh.visible = false; }
      }
    } else {
      this.progress = structuredClone(EMPTY);
      this.cash = 0;
      this.player.armed = true;
      this.player.ammo = 12;
      this.player.reserve = 36;
    }
    this.player.dead = false;
    this.player.health = this.player.maxHealth;
    this.enterPlay();
  }

  enterPlay() {
    for (const id of ['pause', 'brief', 'bigmap']) document.getElementById(id).classList.add('hidden');
    this.bigMapOpen = false;
    document.getElementById('title').classList.add('hidden');
    document.getElementById('boot').classList.add('hidden');
    document.getElementById('wasted').classList.add('hidden');
    document.getElementById('finish').classList.add('hidden');
    this.hud.show();
    this.hud.setMoney(this.cash);
    this.state = 'play';
    this.lockIgnoreUntil = performance.now() + 450;
    this.audio.init();
    this.captureMouse();
    this.lastTime = performance.now();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    this.input.releaseAll();
    document.exitPointerLock?.();
    this.audio.stopEngine();
    this.audio.stopSiren();
    this.save();
  }

  resume() {
    document.getElementById('pause').classList.add('hidden');
    this.state = 'play';
    this.lockIgnoreUntil = performance.now() + 450;
    this.lastTime = performance.now();
    this.captureMouse();
    if (this.player.vehicle) this.audio.startEngine();
  }

  toTitle() {
    this.save();
    this.audio.stopEngine();
    this.audio.stopSiren();
    this.hud.hide();
    for (const id of ['pause', 'wasted', 'finish', 'brief', 'bigmap']) {
      document.getElementById(id).classList.add('hidden');
    }
    document.getElementById('title').classList.remove('hidden');
    this.state = 'title';
    this.bigMapOpen = false;
  }

  onPlayerDead() {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.progress.stats.busted++;
    if (this.missions.active) {
      this.pendingRetry = this.missions.active.job;
      this.missions.cleanup();
    }
    this.audio.stopEngine();
    this.audio.stopSiren();
    this.wanted.clear();
    this.exitVehicle(true);
    document.getElementById('wasted').classList.remove('hidden');
    document.getElementById('wastedText').textContent = this.progress.stats.busted > 1
      ? `The bay spits you back out, $${Math.min(120, Math.round(this.cash * 0.1))} lighter.`
      : 'The bay spits you back onto the promenade, lighter in the wallet.';
    this.input.releaseAll();
    document.exitPointerLock?.();
  }

  // Wake up at the garage after being put down.
  wakeUp() {
    const p = this.city.missionSpots.garage;
    this.player.dead = false;
    this.player.health = this.player.maxHealth;
    this.player.armor = 0;
    this.player.setPosition(p.x, p.z + 16, 0);
    this.cash = Math.max(0, this.cash - Math.min(120, Math.round(this.cash * 0.1)));
    this.enterPlay();
    this.hud.clearObjective();
  }

  retry() {
    if (this.pendingRetry) {
      const job = this.pendingRetry;
      this.pendingRetry = null;
      this.wakeUp();
      this.showBrief(job, true);
    } else {
      this.wakeUp();
    }
  }

  // ---------------------------------------------------------------- jobs and briefings
  showBrief(job, retry = false) {
    this.state = 'brief';
    document.getElementById('brief').classList.remove('hidden');
    document.getElementById('briefTab').textContent = `Chapter ${job.chapter} · ${retry ? 'Second try' : 'Job'}`;
    document.getElementById('briefTitle').textContent = job.title;
    document.getElementById('briefText').textContent = job.brief;
    document.getElementById('btnBriefGo').textContent = retry ? 'Try again' : 'Start job';
    this.pendingJob = job;
    this.input.releaseAll();
    document.exitPointerLock?.();
  }

  beginBrief() {
    document.getElementById('brief').classList.add('hidden');
    this.state = 'play';
    this.lockIgnoreUntil = performance.now() + 450;
    this.captureMouse();
    this.lastTime = performance.now();
    if (this.pendingJob) this.missions.begin(this.pendingJob);
    this.pendingJob = null;
  }

  finishStory() {
    this.progress.finished = true;
    const rows = [
      ['Jobs done', this.progress.stats.jobsDone],
      ['Cash banked', U.money(this.progress.stats.earned)],
      ['Distance driven', `${Math.round(this.progress.stats.driven)} m`],
      ['Cars wrecked', this.progress.stats.wrecks],
      ['Officers down', this.progress.stats.kills],
    ];
    document.getElementById('finishStats').innerHTML = rows
      .map(([k, v]) => `<div class="stat"><span>${k}</span><span>${v}</span></div>`).join('');
    this.state = 'finish';
    setTimeout(() => {
      document.getElementById('finish').classList.remove('hidden');
      document.exitPointerLock?.();
    }, 1200);
  }

  // ---------------------------------------------------------------- save
  save() {
    this.progress.cash = this.cash;
    this.progress.armed = this.player.armed;
    this.progress.ammo = this.player.ammo;
    this.progress.reserve = this.player.reserve;
    this.progress.collected = this.collectibles.list
      .map((c, i) => (c.taken ? i : -1)).filter((i) => i >= 0);
    this.progress.pos = { x: this.player.x, z: this.player.z, heading: this.player.heading };
    const saved = writeSave(this.progress);
    const bar = document.getElementById('saveDot');
    if (bar) bar.textContent = saved ? 'saved' : 'not saved';
    return saved;
  }

  // ---------------------------------------------------------------- helpers other systems call
  shake(v) {
    this.cam?.addShake(v);
  }

  allCars() {
    return [...this.traffic.all, ...this.police.cruisers];
  }

  resetRun() {
    if (this.player.vehicle) this.exitVehicle(true);
    this.missions.cleanup();
    this.police.clear();
    this.wanted.clear();
    this.collectibles.reset();
    this.bullets.clear();
    this.input.releaseAll();
    this.pendingRetry = null;
    this.pendingJob = null;
    this.player.speed = 0;
    this.player.reloadTimer = 0;
    this.hud.subQueue.length = 0;
    this.hud.subs.textContent = '';
    this.hud.clearObjective();
    this.hud.setPrompt('');
  }

  resolveVehicleContacts() {
    const cars = this.allCars().filter((car) => !car.dead);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 3.1 || distance < 0.001) continue;
      const nx = dx / distance, nz = dz / distance;
      const push = (3.1 - distance) * 0.5;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      const impact = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (impact > 1) {
        const impulse = impact * 0.7;
        a.vx -= nx * impulse; a.vz -= nz * impulse;
        b.vx += nx * impulse; b.vz += nz * impulse;
        if (impact > 4 && a.lastImpact <= 0 && b.lastImpact <= 0) {
          a.damage(impact * b.spec.mass * 2.3);
          b.damage(impact * a.spec.mass * 2.3);
          a.lastImpact = b.lastImpact = 0.3;
          this.world.onImpact(a, impact);
          if (a.driver === 'player' || b.driver === 'player') this.wanted.addCrime(2, false);
        }
      }
      a.group.position.set(a.x, 0, a.z); b.group.position.set(b.x, 0, b.z);
    }
  }

  fireBullet(origin, heading, speed, owner) {
    this.bullets.fire(origin, heading, speed, owner);
  }

  spawnSparks(x, y, z, color = 0xffd27a) {
    this.particles.sparks(x, y, z, 6, color);
  }

  damageFlash() {
    this.hud?.damageFlash();
  }

  onWantedCleared() {
    if (this.state === 'play') this.hud.toast('You lost them');
    this.audio.stopSiren();
  }

  onCopDown() {
    this.progress.stats.kills++;
    this.wanted.addCrime(4);
    this.hud.toast('Officer down', 'bad');
  }

  onPlayerCrash(force) {
    if (force > 16) this.hud.toast('Hang on to it', 'bad');
    this.progress.stats.wrecks += force > 20 ? 1 : 0;
  }

  collectCase(c) {
    const cash = U.randInt(30, 95);
    this.cash += cash;
    this.progress.stats.earned += cash;
    this.hud.setMoney(this.cash);
    this.hud.toast(`+$${cash} found`, 'cash');
    this.audio.pickup();
    this.particles.sparks(c.x, 0.5, c.z, 10, 0xbfe98a);
  }

  // ---------------------------------------------------------------- vehicles
  nearestCar(max = 4.2) {
    let best = null;
    let bd = max * max;
    for (const car of this.allCars()) {
      if (car.dead || car === this.player.vehicle) continue;
      const d = U.dist2(this.player.x, this.player.z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  enterVehicle(car) {
    if (!car || car.dead) return;
    const stolen = car.driver !== null;
    car.driver = 'player';
    car.ai = null;
    car.parked = false;
    this.player.vehicle = car;
    this.player.root.visible = false;
    car.sirenOn = false;
    this.audio.startEngine();
    this.hud.setPrompt('');
    this.cam.setYaw(car.heading + Math.PI);
    if (stolen) {
      const copCar = car.type === 'police';
      this.wanted.addCrime(copCar ? 26 : 14);
      this.hud.toast(`Stolen: ${car.spec.name}`, 'bad');
      this.peds.scare(car.x, car.z, 8);
    }
    this.missions.onEnterVehicle(car);
  }

  exitVehicle(forced = false) {
    const car = this.player.vehicle;
    if (!car) return;
    // Bailing out of a moving car costs a little skin.
    const fast = car.speedKmh > 34;
    this.player.vehicle = null;
    car.driver = null;
    car.vx *= 0.2;
    car.vz *= 0.2;
    this.player.root.visible = true;
    const off = car.heading + Math.PI / 2;
    this.player.setPosition(car.x + Math.sin(off) * 2.1, car.z + Math.cos(off) * 2.1, car.heading);
    this.audio.stopEngine();
    this.hud.setPrompt('');
    if (!forced && fast) {
      this.shake(0.5);
      this.player.invuln = 0.4;
      this.hud.toast('Off at speed', 'bad');
    }
  }

  // ---------------------------------------------------------------- frame
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const raw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Ten frames a second is the floor: below that the world runs in slow motion rather than
    // teleporting, and a slow machine still gets an honest game.
    const dt = U.clamp(Number.isFinite(raw) ? raw : 0.016, 0, 0.1);

    if (this.state === 'play') this.step(dt);
    else this.idle(dt);

    if (this.state !== 'boot') {
      this.renderer.render(this.scene, this.camera);
      this.rendered = true;
    }
    this.input.endFrame();
  }

  // A hand-driven frame loop for playtests and screenshots: `game.sim(2, ['KeyW'])` walks the
  // player for two seconds without waiting on the browser's frame clock.
  sim(seconds, codes = [], hold = false) {
    for (const code of codes) dispatchEvent(new KeyboardEvent('keydown', { code }));
    const steps = Math.max(1, Math.round(seconds / 0.02));
    for (let i = 0; i < steps; i++) {
      if (this.state === 'play') this.step(0.02);
      this.input.endFrame();
    }
    if (!hold) for (const code of codes) dispatchEvent(new KeyboardEvent('keyup', { code }));
    return this;
  }

  // Quick state probe for debugging: `game.probe()` prints key run-time numbers to console.
  probe() {
    console.log(
      `pos: ${this.player?.x.toFixed(1)}, ${this.player?.z.toFixed(1)} | ` +
      `vehicle: ${this.player?.vehicle?.spec?.name ?? 'none'} | ` +
      `wanted: ${this.wanted?.level} (${this.wanted?.heat.toFixed(1)}) | ` +
      `traffic: ${this.traffic?.all?.length ?? 0} | ` +
      `peds: ${this.peds?.all?.length ?? 0} | ` +
      `police: ${this.police?.cruisers?.length ?? 0} | ` +
      `cash: $${this.cash} | ` +
      `chapter: ${this.progress?.chapter ?? 0}`
    );
    return this;
  }

  // One press of a key, exactly as a player would hit it.
  tap(code) {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    this.step(0.02);
    this.input.endFrame();
    dispatchEvent(new KeyboardEvent('keyup', { code }));
    this.input.endFrame();
    return this;
  }

  idle(dt) {
    if (this.state === 'title' || this.state === 'boot') this.hud?.map.draw(this, dt);
    if (this.cam && this.player) {
      this.audio.update(dt);
      // The title screen looks at the bay over Rafi's shoulder instead of freezing the camera:
      // a very slow drift, never enough to make the menu behind it swim.
      if (this.state === 'title') {
        this.cam.yaw += dt * 0.045;
        this.cam.update(dt * 0.4, this.input, this.player, false);
      }
    }
  }

  step(dt) {
    const input = this.input;
    const p = this.player;
    this.elapsed += dt;
    this.progress.stats.time += dt;
    this.clockMinutes += dt * 0.55;
    this.hud.setClock(this.clockMinutes);

    if (input.hit('pause')) return this.pause();
    if (input.hit('radio')) {
      const on = this.audio.toggleRadio();
      this.hud.setRadio(on);
      this.hud.toast(on ? 'Radio on' : 'Radio off');
    }
    if (input.hit('map')) {
      this.bigMapOpen = !this.bigMapOpen;
      this.hud.toggleBigMap(this.bigMapOpen);
      if (this.bigMapOpen) this.hud.map.drawBig(this);
    }
    if (this.bigMapOpen && this.input.mouse.leftPressed) this.hud.map.drawBig(this);
    if (input.hit('recenter')) this.cam.recenter(p.vehicle ? p.vehicle.heading : p.heading);

    const ctx = {
      input, player: p, world: this.world, peds: this.peds, police: this.police,
      traffic: this.traffic, wanted: this.wanted, audio: this.audio, hud: this.hud,
      particles: this.particles,
      cameraYaw: this.cam.yaw, camera: this.camera,
      fireBullet: (o, h, s, who) => this.fireBullet(o, h, s, who),
      shake: (v) => this.shake(v),
      damageFlash: () => this.damageFlash(),
      spawnSparks: (x, y, z, c) => this.spawnSparks(x, y, z, c),
      onPlayerDead: () => this.onPlayerDead(),
      onCopDown: () => this.onCopDown(),
    };

    this.audio.setListener(p.x, p.z);

    // Driving: the car takes the input and the body rides along.
    if (p.vehicle && input.hit('enter')) this.exitVehicle();
    else if (!p.vehicle && input.hit('enter')) this.enterVehicle(this.nearestCar());

    if (p.vehicle) {
      const car = p.vehicle;
      const kmh = car.speedKmh;
      this.hud.setPrompt('');

      if (input.hit('horn') && car.honkCooldown <= 0) {
        car.honkCooldown = 0.45;
        this.audio.horn(car.x, car.z);
      }
      car.update(dt, this.world, {
        throttle: (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0),
        steer: (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0),
        brake: input.down('brake'),
        handbrake: input.down('brake') && kmh > 20,
      });
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.root.position.set(car.x, 0, car.z);
      p.root.rotation.y = car.heading;
      this.progress.stats.driven += Math.abs(car.forwardSpeed) * dt;
      this.audio.engineState(kmh, input.down('forward') ? 1 : 0);

      // The player rides out a wreck.
      if (car.dead) {
        this.exitVehicle(true);
        p.damage(45, ctx, car.x, car.z);
      }
    } else {
      p.update(dt, ctx);
      this.progress.stats.walked += p.speed * dt;
      this.audio.stopEngine();

      const car = this.nearestCar();
      if (car) {
        this.hud.setPrompt(`<b>F</b> ${car.driver ? 'carjack' : 'drive'} the ${car.spec.name}`);

      } else if (!this.missions.marker || U.dist(p.x, p.z, this.missions.marker.x, this.missions.marker.z) > 7) {
        this.hud.setPrompt('');
      }
    }
    if (input.hit('interact')) this.missions.interact();
    if (this.state !== 'play') return;

    this.traffic.update(dt, ctx);
    this.peds.update(dt, ctx);
    this.police.update(dt, ctx);
    // An officer can put the player down in that pass: the rest of the frame is the death screen's.
    if (this.state !== 'play') return;
    this.resolveVehicleContacts();
    this.wanted.update(dt, ctx);
    this.missions.update(dt);
    this.collectibles.update(dt, ctx);
    this.bullets.update(dt);
    this.bullets.render();
    this.particles.update(dt);
    this.hud.update(dt);
    this.audio.update(dt);

    // Sirens: only while a cruiser has eyes on the player, and mixed by how close it is.
    const chase = this.wanted.level > 0 && this.wanted.unseenFor < 2;
    if (chase) { this.audio.startSiren(); this.audio.sirenAt(this.police.cruisers, p.x, p.z); }
    else this.audio.stopSiren();

    // Marker mesh over the objective.
    const m = this.missions.marker;
    if (m) {
      this.markerMesh.visible = true;
      this.markerMesh.position.set(m.x, 1.9 + Math.sin(this.elapsed * 2.4) * 0.25, m.z);
      this.markerMesh.rotation.y += dt * 1.6;
    } else {
      this.markerMesh.visible = false;
    }

    this.cam.update(dt, input, p.vehicle ?? p, !!p.vehicle);
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.position.set(p.x - 110, 145, p.z + 90);

    // Autosave every thirty seconds alive.
    this.saveTimer += dt;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      this.cash = Math.max(0, this.cash);
      this.save();
    }
  }

  boot() {
    const bar = document.getElementById('bootBar');
    this.load((t) => { bar.style.width = `${8 + t * 88}%`; }).then(() => {
      bar.style.width = '100%';
      this.player.setPosition(this.progress.pos.x, this.progress.pos.z, 0.6);
      this.cam.setYaw(0.6);
      this.cam.update(0.1, this.input, this.player, false);
      this.state = 'title';
      document.getElementById('boot').classList.add('hidden');
      document.getElementById('title').classList.remove('hidden');
      document.getElementById('btnContinue').disabled = !loadSave();
      // How stale the slot is: two days away from the bay should read as such before Continue.
      const age = saveAge();
      const cont = document.getElementById('btnContinue');
      if (age !== null && !cont.disabled) cont.textContent = age < 1 ? 'Continue · just now' : `Continue · ${age < 60 ? `${age} min` : `${Math.round(age / 60)} h`} ago`;
      this.renderer.compile(this.scene, this.camera);
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.frame(t));

    });
  }
}

// A vertical gradient sky baked to a canvas: no image files, no network.
function makeSky() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.45, '#7fc0dd');
  g.addColorStop(0.72, SKY_LOW);
  g.addColorStop(1, '#f7c98e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

globalThis.THREE = globalThis.THREE ?? window.THREE;
addEventListener('error', (e) => {
  console.error('BOOT FAIL', e.message, e.filename, e.lineno, e.error?.stack);
  document.getElementById('boot').insertAdjacentHTML('beforeend', `<pre style="max-width:90vw;white-space:pre-wrap;font-size:12px">${e.message}\n${e.error?.stack ?? ''}</pre>`);
});
const game = new Game();
// Fixture access stays opt-in; ordinary play starts only through the title screen.
if (new URLSearchParams(location.search).get('qa') === '1') globalThis.G = game;
game.boot();
