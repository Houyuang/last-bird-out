// systems.js — the v2 scoring & weather systems, one small state machine
// per feature. Each owns a plain state object created by create(); main.js
// drives them from updatePlay and reads them for the HUD / end screens.
//
//   Combo     consecutive corn pickups inside a short window build a
//             streak multiplier (x1..x5) applied to corn score.
//   NearMiss  skimming past the farmer or the dog (close, but not caught)
//             pays bonus points and buys a beat of slow motion.
//   Wind      the Woods (zone 4) has a weather identity: periodic gusts,
//             telegraphed by drifting leaves, that push the run faster
//             (tailwind) or hold it back (headwind), alternating.
'use strict';

// ================= COMBO =================
const Combo = (() => {
  const WINDOW = 2.5;        // s between corns before the streak lapses
  const MAX_MULT = 5;
  const CORNS_PER_STEP = 2;  // every 2 corns in a row: +1 multiplier step

  function create() {
    return { streak: 0, mult: 1, timer: 0, best: 1 };
  }
  // A corn was collected: extend the streak, return the multiplier the
  // corn scores at (the streak AFTER this corn counts).
  function onCorn(c) {
    c.streak += 1;
    c.timer = WINDOW;
    c.mult = Math.min(MAX_MULT, 1 + Math.floor(c.streak / CORNS_PER_STEP));
    if (c.mult > c.best) c.best = c.mult;
    return c.mult;
  }
  // Damage breaks the streak outright.
  function onDamage(c) {
    c.streak = 0; c.mult = 1; c.timer = 0;
  }
  function update(c, dt) {
    if (c.timer > 0) {
      c.timer -= dt;
      if (c.timer <= 0) { c.streak = 0; c.mult = 1; c.timer = 0; }
    }
  }
  // 0..1 of the window left — drives the HUD streak bar.
  function frac(c) { return c.timer > 0 ? c.timer / WINDOW : 0; }
  return { create, onCorn, onDamage, update, frac, WINDOW, MAX_MULT };
})();

// ================= NEAR MISS =================
const NearMiss = (() => {
  // Screen-space gaps (enemy x to the turkey's fixed x). The chase model
  // puts the farmer 76 px away at proximity 100 (the catch). Playtesting
  // v2 measured real proximity peaks: a crash-test turkey taking every
  // hit peaks at ~55 (hits add +25, the stumble carries ~+5 more, and
  // clean running drains the rest between obstacles), so the farmer
  // radius is 200 px == proximity ~51 — a genuinely close chase that
  // actually happens, not a number only a perfect storm reaches. The
  // dog rides at ~0.55x the farmer's gap and is the vanguard, so its
  // radius is tighter and its near misses are the common ones.
  const FARMER_RADIUS = 200;
  const DOG_RADIUS = 150;
  const COOLDOWN = 2.0;      // per enemy, seconds
  const POINTS = 150;
  const SLOW_SCALE = 0.35;   // world speed during the beat
  const SLOW_TIME = 0.25;    // real seconds of slow motion per trigger

  function create() {
    return { count: 0, cdFarmer: 0, cdDog: 0, farmerIn: false, dogIn: false };
  }
  function update(n, dt) {
    if (n.cdFarmer > 0) n.cdFarmer -= dt;
    if (n.cdDog > 0) n.cdDog -= dt;
  }
  // Crossing-based: a bonus fires when an enemy ENTERS its radius (and
  // cannot re-fire until it has left and the cooldown has run out), so
  // camping next to the farmer pays nothing. Returns the enemies that
  // triggered this frame: [], ['farmer'], ['dog'] or both.
  function check(n, o) {
    const hits = [];
    const fIn = o.farmerGap != null && o.farmerGap < FARMER_RADIUS;
    if (fIn && !n.farmerIn && n.cdFarmer <= 0) { n.cdFarmer = COOLDOWN; hits.push('farmer'); }
    n.farmerIn = fIn;
    const dIn = !!o.dogActive && o.dogGap != null && o.dogGap < DOG_RADIUS;
    if (dIn && !n.dogIn && n.cdDog <= 0) { n.cdDog = COOLDOWN; hits.push('dog'); }
    n.dogIn = dIn;
    if (hits.length) n.count += hits.length;
    return hits;
  }
  return { create, update, check, POINTS, SLOW_SCALE, SLOW_TIME,
           FARMER_RADIUS, DOG_RADIUS };
})();

// ================= WIND (Woods weather) =================
const Wind = (() => {
  const WARN_TIME = 1.1;     // leaf-drift warning before a gust lands
  const GUST_TIME = 2.6;     // gust duration at full strength
  const CALM_MIN = 5.5, CALM_MAX = 8.5; // calm between gusts
  const PUSH = 0.16;         // ±16% run speed at full strength

  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  function create() {
    return { phase: 'calm', t: 3.4, dir: 1, strength: 0, cycle: 0 };
  }
  // Phase machine: calm -> warn (leaves drift in the gust's direction)
  // -> gust (full push) -> calm... Direction alternates every cycle:
  // tailwind, headwind, tailwind — the Woods giveth and taketh away.
  function update(w, dt, inWoods) {
    if (!inWoods) {
      w.phase = 'calm'; w.cycle = 0; w.t = 3.4;
      w.strength = Math.max(0, w.strength - dt * 2.5);
      return;
    }
    w.t -= dt;
    if (w.phase === 'calm' && w.t <= 0) {
      w.phase = 'warn'; w.t = WARN_TIME;
      w.dir = w.cycle % 2 === 0 ? 1 : -1;
    } else if (w.phase === 'warn' && w.t <= 0) {
      w.phase = 'gust'; w.t = GUST_TIME;
    } else if (w.phase === 'gust' && w.t <= 0) {
      w.phase = 'calm'; w.cycle += 1;
      w.t = CALM_MIN + hash(w.cycle * 3 + 1) * (CALM_MAX - CALM_MIN);
    }
    const target = w.phase === 'gust' ? 1 : 0;
    const rate = w.phase === 'gust' ? 2.4 : 1.8;
    w.strength += (target - w.strength) * Math.min(1, dt * rate);
    if (w.strength < 0.001 && target === 0) w.strength = 0;
  }
  // Multiplier on the run speed: >1 tailwind (dir +1), <1 headwind.
  function speedFactor(w) { return 1 + w.dir * PUSH * w.strength; }
  return { create, update, speedFactor, WARN_TIME, GUST_TIME, PUSH };
})();
