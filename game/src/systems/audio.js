// All sound is synthesized here with WebAudio: no files. An engine note that tracks speed, a
// two-tone siren, gunshots, punches, horns, pickups, UI blips and a lazy sun-bleached score of
// plucked chords and soft bass that keeps playing under the city.
// Audio starts at the first user gesture because browsers may suspend autoplay contexts.

import * as U from '../core/util.js';

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null;
    this.siren = null;
    this.muted = false;
    this.listener = { x: 0, z: 0 };
    this.musicTimer = 0;
    this.chordIndex = 0;
    this.started = false;
    this.radioOn = true;
  }

  init() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.radioOn ? 0.22 : 0;
    this.musicGain.connect(this.master);

    this.started = true;
    this.musicTimer = 1.5;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  // The car radio: mutes the score without touching the street sounds.
  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.musicGain) this.musicGain.gain.value = this.radioOn ? 0.22 : 0;
    return this.radioOn;
  }

  setListener(x, z) {
    this.listener.x = x;
    this.listener.z = z;
  }

  // Distance falloff applied to world sounds.
  spatial(x, z, range = 60) {
    if (x === undefined) return 1;
    const d = U.dist(x, z, this.listener.x, this.listener.z);
    return U.clamp(1 - d / range, 0, 1);
  }

  env(node, gain, attack, decay, peak = 1) {
    const t = this.ctx.currentTime;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * gain), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  blip(freq, dur, type = 'square', vol = 0.2, detune = 0) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(g).connect(this.sfxGain);
    this.env(g, vol, 0.006, dur);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.05);
  }

  noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    // One buffer per length, kept: a chase fires dozens of shots a second and each used to
    // allocate its own sample array.
    this.noiseCache ??= new Map();
    let buf = this.noiseCache.get(len);
    if (!buf) {
      buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noiseCache.set(len, buf);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    this.env(g, vol, 0.005, dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start();
  }

  gunshot(x, z) {
    const k = this.spatial(x, z, 90);
    if (k <= 0.02) return;
    this.noise(0.22, 0.5 * k, 1900);
    this.blip(140, 0.1, 'square', 0.16 * k);
  }

  punch() {
    this.noise(0.12, 0.35, 700);
    this.blip(120, 0.08, 'sine', 0.22);
  }

  reload() {
    this.noise(0.05, 0.12, 3200, 'highpass');
    this.blip(270, 0.06, 'triangle', 0.08);
  }

  // A soft scuff under a sprint: gritty, quiet, and short.
  footstep() {
    this.noise(0.09, 0.12, 2400, 'bandpass');
  }

  hurt() {
    this.blip(320, 0.16, 'sawtooth', 0.14, -200);
  }

  horn(x, z) {
    const k = this.spatial(x, z, 70);
    if (k <= 0.05) return;
    this.blip(392, 0.28, 'sawtooth', 0.12 * k);
    this.blip(494, 0.28, 'sawtooth', 0.1 * k);
  }

  sirenFar() {
    this.blip(680, 0.3, 'triangle', 0.08);
    setTimeout(() => this.blip(520, 0.3, 'triangle', 0.08), 320);
  }

  pickup() {
    this.blip(660, 0.08, 'triangle', 0.18);
    setTimeout(() => this.blip(990, 0.12, 'triangle', 0.16), 80);
  }

  cash() {
    this.blip(880, 0.06, 'square', 0.14);
    setTimeout(() => this.blip(1180, 0.1, 'square', 0.12), 70);
  }

  ui() {
    this.blip(520, 0.05, 'square', 0.1);
  }

  stars(level) {
    for (let i = 0; i < level; i++) {
      setTimeout(() => this.blip(420 + i * 130, 0.1, 'square', 0.12), i * 90);
    }
  }

  missionStart() {
    [440, 554, 659].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.14), i * 120));
  }

  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.16), i * 130));
  }

  fail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.28, 'sawtooth', 0.13), i * 160));
  }

  explosion(x, z) {
    const k = this.spatial(x, z, 120);
    if (k <= 0.03) return;
    this.noise(0.9, 0.7 * k, 900);
    this.blip(60, 0.5, 'sawtooth', 0.3 * k);
  }

  crash(force, x, z) {
    const k = this.spatial(x, z, 80);
    if (k <= 0.05) return;
    this.noise(0.2, U.clamp(force / 30, 0.1, 0.5) * k, 1200);
  }

  // Tyres scrubbing sideways through a handbrake turn: a thin, high squeal under the engine.
  screech(x, z) {
    const k = this.spatial(x, z, 55);
    if (k <= 0.08) return;
    this.blip(U.rand(1500, 1900), 0.18, 'triangle', 0.05 * k);
  }

  // Gulls over the promenade, now and then: the bay should sound like a bay between the engines.
  gull() {
    const base = U.rand(820, 1150);
    this.blip(base, 0.16, 'sine', 0.05);
    setTimeout(() => this.blip(base * 0.82, 0.22, 'sine', 0.04), 150);
    setTimeout(() => this.blip(base * 1.1, 0.14, 'sine', 0.03), 330);
  }

  // --- continuous engine and siren --------------------------------------------------------
  startEngine() {
    if (!this.ctx || this.engine) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o1.frequency.value = 52;
    o2.frequency.value = 26;
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 4;
    gain.gain.value = 0.0;
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain).connect(this.sfxGain);
    o1.start();
    o2.start();
    this.engine = { o1, o2, filter, gain };
  }

  stopEngine() {
    if (!this.engine) return;
    const { o1, o2, gain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.25);
    o1.stop(t + 0.3);
    o2.stop(t + 0.3);
    this.engine = null;
  }

  engineState(speedKmh, throttle, wheelsOnGround = true) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 45 + Math.min(speedKmh, 150) * 1.5 + throttle * 22;
    this.engine.o1.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engine.o2.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(320 + Math.min(speedKmh, 150) * 12, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(wheelsOnGround ? 0.1 + throttle * 0.05 : 0.02, t, 0.1);
  }

  startSiren() {
    if (!this.ctx || this.siren) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 700;
    lfo.frequency.value = 1.6;
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain).connect(o.frequency);
    g.gain.value = 0.0;
    o.connect(g).connect(this.sfxGain);
    o.start();
    lfo.start();
    g.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.4);
    this.siren = { o, g, lfo };
  }

  // Sirens fade with distance: a cruiser three streets over should not sound like the one on
  // your bumper. The nearest live cruiser sets the level while the chase runs.
  sirenAt(cruisers, x, z) {
    if (!this.siren || !this.ctx) return;
    let near = Infinity;
    for (const car of cruisers) {
      if (car.dead || !car.sirenOn) continue;
      near = Math.min(near, U.dist(car.x, car.z, x, z));
    }
    const level = near === Infinity ? 0.02 : U.clamp(1 - near / 90, 0.05, 1) * 0.16;
    this.siren.g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
  }

  stopSiren() {
    if (!this.siren) return;
    const { o, g, lfo } = this.siren;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.2);
    o.stop(t + 0.6);
    lfo.stop(t + 0.6);
    this.siren = null;
  }

  // --- score ------------------------------------------------------------------------------
  note(freq, dur = 1.4, vol = 0.1, type = 'triangle') {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g).connect(this.musicGain);
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start();
    o.stop(t + dur + 0.1);
  }

  update(dt) {
    if (!this.ctx || this.muted) return;
    // Gulls live outside the radio switch: turning the score off should not silence the bay.
    this.ambientTimer = (this.ambientTimer ?? U.rand(4, 9)) - dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = U.rand(7, 16);
      this.gull();
    }
    if (!this.radioOn) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = U.rand(1.6, 2.6);

    // A slow marimba figure over a two-chord bass.
    const root = [146.8, 164.8, 130.8, 174.6][this.chordIndex % 4];
    this.chordIndex++;
    const pick = () => SCALE[Math.floor(Math.random() * SCALE.length)];
    const semi = (n) => root * Math.pow(2, n / 12);
    this.note(root / 2, 2.4, 0.1, 'sine');
    this.note(semi(7), 1.6, 0.05, 'triangle');
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.note(semi(pick() + 12), 0.9, 0.035, 'triangle'), i * 260 + Math.random() * 120);
    }
    if (Math.random() < 0.5) setTimeout(() => this.noise(0.06, 0.05, 6000, 'highpass'), 700);
  }
}
