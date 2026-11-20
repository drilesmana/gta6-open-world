// Procedural WebAudio for Velora Heat. Every sound is built from oscillators
// and filtered noise — no external audio files. The AudioContext is created
// lazily (browsers require a user gesture first) and every method is a no-op
// where there is no AudioContext, so the module also loads cleanly in Node.

function hasAudio() {
  return typeof window !== 'undefined'
    && (typeof window.AudioContext === 'function' || typeof window.webkitAudioContext === 'function');
}

// createAudio(): returns the audio object. Play functions: playEngine /
// setEngine / stopEngine (continuous hum), playSiren / stopSiren (two-tone),
// playPickup, playCrash, playClick, playSuccess. ensure() creates and
// resumes the context; call it from a user gesture.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    noiseBuf: null,
    engine: null,
    siren: null,
    muted: false,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
      }
      if (!hasAudio()) return null;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        // One second of white noise, reused by the crash.
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch (e) {
        this.ctx = null;
      }
      return this.ctx;
    },

    setMuted(m) {
      this.muted = !!m;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    },

    _tone({ type = 'sine', from = 440, to = null, dur = 0.15, gain = 0.2, when = 0 }) {
      if (!this.ensure()) return null;
      const t0 = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to !== null && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      return osc;
    },

    _noise({ dur = 0.3, gain = 0.3, freq = 800, when = 0 }) {
      if (!this.ensure()) return null;
      const t0 = this.ctx.currentTime + when;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
      return src;
    },

    // Continuous engine hum. Call playEngine once, then setEngine(rpm01,
    // throttle01) every frame; stopEngine silences it.
    playEngine() {
      if (!this.ensure() || this.engine) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 38;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      osc.start();
      sub.start();
      this.engine = { osc, sub, gain: g };
      g.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.15);
    },

    setEngine(rpm01 = 0, throttle01 = 0) {
      if (!this.engine || !this.ctx) return;
      const rpm = Math.max(0, Math.min(1, rpm01));
      const thr = Math.max(0, Math.min(1, throttle01));
      const t = this.ctx.currentTime;
      this.engine.osc.frequency.setTargetAtTime(62 + rpm * 150, t, 0.05);
      this.engine.sub.frequency.setTargetAtTime(34 + rpm * 70, t, 0.05);
      this.engine.gain.gain.setTargetAtTime(0.05 + thr * 0.1 + rpm * 0.05, t, 0.08);
    },

    stopEngine() {
      if (!this.engine || !this.ctx) return;
      const e = this.engine;
      this.engine = null;
      e.gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.2);
      setTimeout(() => {
        try { e.osc.stop(); e.sub.stop(); } catch (err) { /* already stopped */ }
      }, 300);
    },

    // Two-tone siren: a triangle wave whose pitch swings on a slow square LFO.
    playSiren() {
      if (!this.ensure() || this.siren) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 800;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      lfo.start();
      g.gain.linearRampToValueAtTime(0.09, this.ctx.currentTime + 0.2);
      this.siren = { osc, lfo, gain: g };
    },

    stopSiren() {
      if (!this.siren || !this.ctx) return;
      const s = this.siren;
      this.siren = null;
      s.gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);
      setTimeout(() => {
        try { s.osc.stop(); s.lfo.stop(); } catch (err) { /* already stopped */ }
      }, 350);
    },

    playPickup() {
      this._tone({ type: 'sine', from: 620, to: 1240, dur: 0.16, gain: 0.22 });
    },

    playCrash() {
      this._noise({ dur: 0.32, gain: 0.35, freq: 700 });
      this._tone({ type: 'sine', from: 90, to: 42, dur: 0.3, gain: 0.3 });
    },

    playClick() {
      this._tone({ type: 'square', from: 950, to: 950, dur: 0.05, gain: 0.1 });
    },

    playSuccess() {
      // Short rising arpeggio: C5, E5, G5.
      this._tone({ type: 'sine', from: 523.25, dur: 0.18, gain: 0.2, when: 0 });
      this._tone({ type: 'sine', from: 659.25, dur: 0.18, gain: 0.2, when: 0.09 });
      this._tone({ type: 'sine', from: 783.99, dur: 0.3, gain: 0.22, when: 0.18 });
    },
  };

  return audio;
}
