// audio.js — Velora Heat (chunk 2)
// All sound is synthesized with WebAudio oscillators and noise — no external
// files, no network. Built from the spec contract only: createAudio() returns
// an object with play functions for engine hum, siren, pickup, crash,
// interface click, and mission success. The AudioContext is created lazily
// on the first user gesture so browsers allow it.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(seconds) {
    const c = ensure();
    if (!c) return null;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Short one-shot tone: type/frequency glide, gain envelope.
  function blip(type, freqFrom, freqTo, duration, volume, when) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    if (freqTo !== freqFrom) osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  const audio = {
    get muted() {
      return muted;
    },

    setMuted(m) {
      muted = !!m;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    },

    // Call from a user gesture (click / keydown) so the context may start.
    resume() {
      ensure();
    },

    // Engine hum: a low sawtooth + sub oscillator through a lowpass filter.
    // Call playEngine() once to start, setEngineSpeed(0..1) as speed changes,
    // stopEngine() when leaving the car / pausing.
    playEngine() {
      const c = ensure();
      if (!c || engineOsc) return;
      engineOsc = c.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = c.createOscillator();
      engineOsc2.type = 'sine';
      engineOsc2.frequency.value = 28;
      engineFilter = c.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = c.createGain();
      engineGain.gain.value = 0.0;
      engineGain.gain.setTargetAtTime(0.06, c.currentTime, 0.2);
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
    },

    setEngineSpeed(ratio) {
      if (!ctx || !engineOsc) return;
      const r = Math.max(0, Math.min(1, ratio || 0));
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + r * 165, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(28 + r * 80, t, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + r * 900, t, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + r * 0.07, t, 0.1);
    },

    stopEngine() {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(0, t, 0.05);
      const o1 = engineOsc;
      const o2 = engineOsc2;
      setTimeout(() => {
        try { o1.stop(); } catch (e) { /* already stopped */ }
        try { o2.stop(); } catch (e) { /* already stopped */ }
      }, 300);
      engineOsc = null;
      engineOsc2 = null;
      engineGain = null;
      engineFilter = null;
    },

    // Two-tone police siren loop. stopSiren() ends it.
    playSiren() {
      const c = ensure();
      if (!c || sirenOsc) return;
      sirenOsc = c.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = c.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenHigh = false;
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 960 : 720, ctx.currentTime, 0.05);
      }, 420);
    },

    stopSiren() {
      if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
      if (!sirenOsc) return;
      const o = sirenOsc;
      sirenOsc = null;
      try { o.stop(); } catch (e) { /* already stopped */ }
      sirenGain = null;
    },

    // Cash / item pickup: two quick ascending sine blips.
    playPickup() {
      blip('sine', 660, 660, 0.09, 0.22, 0);
      blip('sine', 990, 990, 0.14, 0.22, 0.09);
    },

    // Crash: filtered noise burst plus a low thump.
    playCrash() {
      const c = ensure();
      if (!c) return;
      const buf = noiseBuffer(0.25);
      if (buf) {
        const src = c.createBufferSource();
        src.buffer = buf;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.5, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start();
      }
      blip('sine', 120, 45, 0.22, 0.4, 0);
    },

    // Interface click: one short square blip.
    playClick() {
      blip('square', 880, 880, 0.05, 0.12, 0);
    },

    // Mission success: a small four-note arpeggio.
    playSuccess() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => blip('triangle', freq, freq, 0.22, 0.2, i * 0.11));
    },
  };

  return audio;
}
