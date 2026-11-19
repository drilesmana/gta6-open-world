// Velora Heat — synthesized sound. No audio files: every effect is built with
// the Web Audio API at boot, so the game stays offline and light.
// The radio is a tiny chiptune loop sequenced from oscillators.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.radioOn = true;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.radioTimer = null;
    this.radioStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.01;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp);
    engineOsc2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    this.startRadio();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const target = on ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const f = 48 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.01, this.ctx.currentTime, 0.06);
  }

  blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.25, filterFreq = 800, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  punch() {
    this.noise(0.12, 0.5, 500);
    this.blip(90, 0.14, 'sine', 0.5);
  }

  cash() {
    this.blip(880, 0.09, 'sine', 0.22);
    this.blip(1318, 0.14, 'sine', 0.22, 0.07);
  }

  horn() {
    this.blip(370, 0.28, 'square', 0.12);
    this.blip(466, 0.28, 'square', 0.1);
  }

  sirenBlip() {
    // Two-tone wail: alternate the pitch on each call so the siren
    // rises and falls instead of repeating the same pair.
    this.sirenHigh = !this.sirenHigh;
    const first = this.sirenHigh ? 880 : 660;
    const second = this.sirenHigh ? 660 : 880;
    this.blip(first, 0.16, 'sine', 0.1);
    this.blip(second, 0.16, 'sine', 0.1, 0.16);
  }

  crash() {
    this.noise(0.35, 0.5, 300);
    this.blip(60, 0.3, 'sine', 0.5);
  }

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.blip(n, 0.22, 'triangle', 0.25, i * 0.11));
  }

  missionFail() {
    this.blip(392, 0.25, 'triangle', 0.22);
    this.blip(311, 0.4, 'triangle', 0.22, 0.2);
  }

  click() {
    this.blip(1200, 0.05, 'square', 0.1);
  }

  // A laid-back sunset groove: bass + pluck melody, 8 steps a bar.
  startRadio() {
    if (this.radioTimer || !this.ctx) return;
    const bass = [110, 0, 130.8, 0, 98, 0, 146.8, 0];
    const lead = [440, 0, 523, 659, 0, 587, 523, 0];
    this.radioTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.radioOn) return;
      const i = this.radioStep % 8;
      if (bass[i]) this.blip(bass[i], 0.3, 'triangle', 0.12);
      if (lead[i]) this.blip(lead[i], 0.18, 'square', 0.05);
      this.radioStep++;
    }, 260);
  }
}
