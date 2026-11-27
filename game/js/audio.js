// audio.js — WebAudio synthesized SFX, no audio assets. Guarded: silent until
// first user gesture, silent forever if anything fails. Every repeat-prone
// sound gets a slight random pitch variation so it doesn't feel machine-made.
'use strict';
const AudioFX = (() => {
  let ctx = null, master = null, muted = false;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }
  window.addEventListener('keydown', ensure, { once: true });
  window.addEventListener('mousedown', ensure, { once: true });

  function vary() { return 0.95 + Math.random() * 0.1; } // ±5% pitch

  function tone(freq, dur, type, gain, slideTo) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq * vary(), t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo * vary()), t0 + dur);
      g.gain.setValueAtTime(gain || 0.04, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio is garnish; never break the game */ }
  }
  function noise(dur, gain, freq) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, (dur * ctx.sampleRate) | 0);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
      const g = ctx.createGain(); g.gain.value = gain || 0.08;
      src.connect(f).connect(g).connect(master);
      src.start(t0);
    } catch (e) { /* ignore */ }
  }
  function seq(notes, step, type, gain) {
    if (!ctx || muted) return;
    notes.forEach((f, i) => setTimeout(() => tone(f, 0.12, type, gain), i * step * 1000));
  }

  return {
    unlock: ensure,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
    get muted() { return muted; },
    step() { noise(0.03, 0.016, 480); tone(150, 0.03, 'triangle', 0.012, 90); },
    jump() { tone(520, 0.09, 'square', 0.028, 760); },
    doubleJump() { tone(740, 0.1, 'square', 0.03, 1080); },
    land(hard) { tone(hard ? 130 : 190, 0.07, 'triangle', 0.05, 70); noise(0.05, 0.03, 500); },
    slide() { noise(0.16, 0.045, 700); },
    dash() { noise(0.18, 0.07, 1600); tone(220, 0.16, 'sawtooth', 0.02, 520); },
    smash() { noise(0.12, 0.1, 900); tone(160, 0.1, 'triangle', 0.06, 60); },
    pickup() { seq([880, 1320], 0.05, 'square', 0.03); },
    combo(mult) { const b = 700 + mult * 110; seq([b, b * 1.335, b * 1.5], 0.045, 'square', 0.03); },
    nearMiss() { noise(0.13, 0.05, 2600); tone(1240, 0.11, 'sine', 0.032, 590); },
    feather() { seq([1180, 1560, 1980], 0.06, 'sine', 0.035); },
    chili() { seq([660, 880, 1100, 1470], 0.045, 'square', 0.032); },
    hit() { tone(150, 0.18, 'sawtooth', 0.07, 55); noise(0.14, 0.09, 600); },
    bark() { // two short low blasts — the dog announcing himself
      tone(165, 0.08, 'sawtooth', 0.05, 70); noise(0.05, 0.035, 800);
      setTimeout(() => { tone(150, 0.09, 'sawtooth', 0.055, 62); noise(0.05, 0.035, 760); }, 115);
    },
    zone() { seq([523, 784], 0.09, 'sine', 0.04); },
    caught() { seq([392, 330, 262, 196], 0.16, 'triangle', 0.05); },
    win() { seq([523, 659, 784, 1047, 784, 1047, 1319], 0.11, 'square', 0.035); },
  };
})();
