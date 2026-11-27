// obstacles.js — the course: procedural layout (seeded, deterministic),
// drawing, and collision rules for every obstacle & pickup type.
//
// Types:
//   fence    ground, h46 — jump it, or DASH through it (smashes)
//   pumpkin  ground, h32 — jump it (dash smashes it too)
//   bale     ground, h54 — jump it; HIDEABLE bales are wide haystacks with a
//            red flag: hold DOWN inside one to hide (no collision while hidden)
//   beam     barn only — hangs to GROUND_Y-70: SLIDE under it
//   knife    kitchen — hangs to GROUND_Y-72: SLIDE under it
//   flameF   kitchen floor jet, timed — jump it while it's on
//   flameO   kitchen overhead jet, timed — SLIDE under it while it's on
//   puddle   ground patch — slows you (unless dashing), farmer gains
//   corn     pickup +100 · feather pickup (farmer -25) · chili pickup (kitchen)
//   finish   the tree line at 3000 m
'use strict';
const Obstacles = (() => {
  const GROUND_Y = World.GROUND_Y;
  const PX_PER_M = 40;
  const TOTAL_M = 3000;
  const FLAME_PERIOD = 2.3, FLAME_ON = 1.2;

  // Deterministic PRNG so the course is identical on every load.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DIMS = {
    fence:   { w: 42, h: 46 },
    pumpkin: { w: 40, h: 32 },
    bale:    { w: 58, h: 54 },
    stack:   { w: 116, h: 74 },
    beam:    { w: 30, bottom: GROUND_Y - 70 },
    knife:   { w: 26, bottom: GROUND_Y - 72 },
    flameF:  { w: 54, h: 60 },
    flameO:  { w: 46, bottom: GROUND_Y - 64 },
    puddle:  { w: 132, h: 0 },
    corn:    { w: 26, h: 26 },
    feather: { w: 30, h: 30 },
    chili:   { w: 26, h: 26 },
    sign:    { w: 182, h: 0 },
    page:    { w: 24, h: 0 },
    menuboard: { w: 212, h: 0 },
    finish:  { w: 30, h: 0 },
  };

  // Run speed (px/s) at a given metre — mirrors main.baseSpeed so obstacle
  // spacing can be scaled to how fast the turkey is actually moving there.
  function speedAt(m) { return 350 + Math.min(180, m * 0.055); }

  function buildCourse(seed) {
    const rnd = mulberry32(seed || 20261127);
    const ents = [];
    const push = (type, m, extra) => {
      const e = Object.assign({ type, x: m * PX_PER_M, m, hit: false, taken: false,
                                phase: rnd() * FLAME_PERIOD, seed: rnd() }, extra || {});
      e.w = DIMS[type].w; e.h = DIMS[type].h || 0;
      if (DIMS[type].bottom) e.bottom = DIMS[type].bottom;
      ents.push(e);
      return e;
    };
    const cornRow = (m, yOff, n) => {
      for (let i = 0; i < n; i++) push('corn', m + i * 0.85, { yOff });
    };
    const cornArc = (m, n) => { // arc over a jumpable obstacle
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        push('corn', m - 1 + k * 3.4, { yOff: 62 + Math.sin(k * Math.PI) * 62 });
      }
    };

    // Hideable stacks first, the whole course long, so obstacles keep clear
    // of them. In the Kitchen they are drawn as flour sacks (same promise).
    const stackMs = [];
    const addStack = (m) => { stackMs.push(m); push('stack', m); };
    for (let m = 170; m < 2900; m += 175 + rnd() * 70) addStack(m);
    addStack(1545); // guaranteed breather right before the Kitchen gauntlet
    addStack(2355); // ... and before the Woods peak
    stackMs.sort((a, b) => a - b);
    const nearStack = (m) => stackMs.some((s) => Math.abs(s - m) < 15);

    function pickType(zone) {
      const r = rnd();
      if (zone === 0) return r < 0.34 ? 'fence' : r < 0.64 ? 'pumpkin' : r < 0.84 ? 'bale' : 'puddle';
      if (zone === 1) return r < 0.27 ? 'bale' : r < 0.52 ? 'fence' : r < 0.76 ? 'beam' : 'puddle';
      if (zone === 2) return r < 0.30 ? 'knife' : r < 0.60 ? 'flameF' : r < 0.82 ? 'flameO' : 'puddle';
      return r < 0.30 ? 'fence' : r < 0.56 ? 'pumpkin' : r < 0.80 ? 'bale' : 'puddle';
    }
    function pickGround(zone) { // a solid ground obstacle (never a puddle)
      const r = rnd();
      if (zone === 2) return 'flameF';
      if (zone === 1) return r < 0.55 ? 'bale' : 'fence';
      return r < 0.4 ? 'fence' : r < 0.72 ? 'pumpkin' : 'bale';
    }
    function pickOverhead(zone) {
      if (zone === 1) return 'beam';
      if (zone === 2) return rnd() < 0.6 ? 'knife' : 'flameO';
      return null; // farmyard & woods have no overheads
    }
    const isOverhead = (t) => t === 'knife' || t === 'beam' || t === 'flameO';
    function pairCorn(type, m) {
      const pr = rnd();
      if ((type === 'fence' || type === 'pumpkin' || type === 'bale' || type === 'flameF') && pr < 0.5) cornArc(m, 4);
      else if ((type === 'knife' || type === 'beam' || type === 'flameO') && pr < 0.45) cornRow(m - 0.6, 26, 3); // slide-height corn
      else if (type === 'puddle' && pr < 0.5) cornRow(m + 0.6, 96, 3); // jump-height corn over puddles
    }
    function place(type, m) { push(type, m); pairCorn(type, m); }

    let m = 58;
    while (m < 2945) {
      const zone = Math.min(3, Math.floor(m / 800));
      if (nearStack(m)) { m += 18; continue; }
      const first = pickType(zone);
      place(first, m);
      let lastM = m;
      // Combos: a second (Kitchen/Woods: sometimes a third) obstacle at a
      // jump-scaled gap. Always landable — fair — but the frame-perfect
      // free ride ends here: landings and re-jumps have to be earned.
      const comboP = zone === 0 ? 0.10 : zone === 2 ? 0.20 : 0.16;
      if (rnd() < comboP && m < 2880) {
        const gap0 = Math.max(12.5, Math.min(18, (0.72 * speedAt(m) / PX_PER_M) * 1.5));
        // After an overhead, the player must un-slide and re-jump — that
        // needs a longer runway, or the pair is a trap, not a challenge.
        const gap = isOverhead(first) ? Math.max(20, Math.min(30, gap0 * 1.7)) : gap0;
        const m2 = m + gap;
        if (!nearStack(m2)) {
          let second;
          if (isOverhead(first)) second = pickGround(zone);
          else { const oh = pickOverhead(zone); second = (oh && rnd() < 0.45) ? oh : pickGround(zone); }
          place(second, m2);
          lastM = m2;
          if (zone >= 2 && rnd() < 0.35 && m2 + gap < 2920 && !nearStack(m2 + gap)) {
            place(pickGround(zone), m2 + gap);
            lastM = m2 + gap;
          }
        }
      }
      // Difficulty ramp: base gap shrinks 36m -> ~26m across the run, and
      // never below the speed-scaled minimum (a landing + a breath).
      const ramp = 36 - 9 * (lastM / TOTAL_M) + (zone === 2 ? -1.5 : 0);
      const minGap = Math.max(10, (0.72 * speedAt(lastM) / PX_PER_M) * 0.95);
      m = lastM + Math.max(minGap, ramp + rnd() * 11);
    }
    // golden feathers + kitchen chilis at fixed dramatic spots
    for (const fm of [392, 845, 1268, 1742, 2166, 2574, 2888]) push('feather', fm + rnd() * 8, { yOff: 74 });
    for (const cm of [1785, 2070, 2345]) push('chili', cm, { yOff: 40 });
    // Story props & distance signposts (non-colliding set dressing).
    for (const dm of [500, 1000, 1500, 2000, 2500]) push('sign', dm, { label: dm + ' m', kind: 'dist' });
    push('sign', 792, { label: 'KENNEL', sub: 'BEWARE OF DOG', kind: 'story' });
    push('sign', 1548, { label: "FARMER'S HOUSE", kind: 'story' });
    push('sign', 2360, { label: 'WHISPERING WOODS ->', kind: 'story' });
    push('page', 1505);       // the dropped recipe page, just before the house
    push('menuboard', 1985);  // TONIGHT'S MENU, mid-Kitchen
    push('finish', TOTAL_M);
    ents.sort((a, b) => a.x - b.x);
    return ents;
  }

  function flameOn(e, t) { return ((t + e.phase) % FLAME_PERIOD) < FLAME_ON; }
  // Telegraph: 0 when the jet is not imminent, ramping 0..1 over the last
  // FLAME_WARN seconds before it fires (SOP stage 8: hazards warn >= 0.4 s).
  const FLAME_WARN = 0.5;
  function flameWarn(e, t) {
    const ph = ((t + e.phase) % FLAME_PERIOD);
    if (ph < FLAME_ON) return 0;
    const until = FLAME_PERIOD - ph;
    return until < FLAME_WARN ? 1 - until / FLAME_WARN : 0;
  }

  // ---------------- drawing ----------------
  function drawFence(ctx, e, sx) {
    const top = GROUND_Y - e.h;
    if (e.hit) { // smashed: two leaning shards
      ctx.save();
      ctx.translate(sx + 8, GROUND_Y); ctx.rotate(0.5);
      Shade.rect3(ctx, -4, -30, 8, 30, MAT.woodDark);
      ctx.restore();
      ctx.save();
      ctx.translate(sx + e.w - 6, GROUND_Y); ctx.rotate(-0.65);
      Shade.rect3(ctx, -4, -24, 8, 24, MAT.woodDark);
      ctx.restore();
      return;
    }
    Shade.rect3(ctx, sx + 2, top, 9, e.h, MAT.wood);
    Shade.rect3(ctx, sx + e.w - 11, top, 9, e.h, MAT.wood);
    Shade.rect3(ctx, sx - 3, top + 7, e.w + 6, 8, MAT.wood);
    Shade.rect3(ctx, sx - 3, top + 25, e.w + 6, 8, MAT.wood);
  }
  function drawPumpkinEnt(ctx, e, sx) {
    if (e.hit) { // squashed flat
      ctx.fillStyle = MAT.pumpkin.shade;
      ctx.beginPath(); ctx.ellipse(sx + e.w / 2, GROUND_Y - 4, e.w * 0.62, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = MAT.pumpkin.base;
      ctx.beginPath(); ctx.ellipse(sx + e.w / 2 - 6, GROUND_Y - 7, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    Shade.ellipse3(ctx, sx + e.w / 2, GROUND_Y - e.h * 0.42, e.w * 0.52, e.h * 0.46, MAT.pumpkin, 0);
    ctx.strokeStyle = 'rgba(150,75,10,0.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(sx + e.w / 2, GROUND_Y - e.h * 0.42, e.w * 0.26, e.h * 0.43, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5c7d33';
    ctx.fillRect(sx + e.w / 2 - 2.5, GROUND_Y - e.h - 1, 5, 8);
  }
  function drawBale(ctx, e, sx) {
    const cx = sx + e.w / 2, cy = GROUND_Y - e.h / 2;
    Shade.ellipse3(ctx, cx, cy, e.w / 2, e.h / 2, MAT.hay, 0);
    ctx.strokeStyle = MAT.hay.shade; ctx.lineWidth = 2.4;
    for (const rr of [0.62, 0.34]) {
      ctx.beginPath(); ctx.ellipse(cx, cy, (e.w / 2) * rr, (e.h / 2) * rr, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = '#8a4a2a'; ctx.lineWidth = 3; // twine
    ctx.beginPath(); ctx.moveTo(cx - e.w * 0.22, cy - e.h / 2 + 2); ctx.lineTo(cx - e.w * 0.22, cy + e.h / 2 - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + e.w * 0.22, cy - e.h / 2 + 2); ctx.lineTo(cx + e.w * 0.22, cy + e.h / 2 - 2); ctx.stroke();
  }
  function drawSacks(ctx, e, sx) {
    // Kitchen hide spot: a pile of flour/feed sacks — same red flag, same
    // promise as the haystacks, drawn for the room it stands in.
    const cx = sx + e.w / 2;
    const sack = (x, y, w, h) => {
      ctx.fillStyle = '#cfc3a5';
      ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,100,70,0.35)';
      ctx.beginPath(); ctx.ellipse(x - w * 0.16, y + h * 0.18, w * 0.34, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efe6cc';
      ctx.beginPath(); ctx.ellipse(x + w * 0.14, y - h * 0.2, w * 0.26, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a7648'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - w * 0.2, y - h / 2 + 3); ctx.lineTo(x + w * 0.2, y - h / 2 + 3); ctx.stroke();
    };
    sack(cx - 30, GROUND_Y - 16, 62, 34);
    sack(cx + 30, GROUND_Y - 16, 62, 34);
    sack(cx, GROUND_Y - 44, 66, 36);
    sack(cx - 14, GROUND_Y - 66, 52, 30);
    ctx.strokeStyle = MAT.woodDark.base; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + 10, GROUND_Y - 66); ctx.lineTo(cx + 10, GROUND_Y - 96); ctx.stroke();
    ctx.fillStyle = MAT.leaf.base;
    ctx.beginPath();
    ctx.moveTo(cx + 10, GROUND_Y - 96); ctx.lineTo(cx + 30, GROUND_Y - 90); ctx.lineTo(cx + 10, GROUND_Y - 84);
    ctx.closePath(); ctx.fill();
  }
  function drawStack(ctx, e, sx) {
    if (e.m >= 1600 && e.m < 2400) { drawSacks(ctx, e, sx); return; }
    const cx = sx + e.w / 2;
    // haystack mound: stacked ellipses narrowing upward
    Shade.ellipse3(ctx, cx, GROUND_Y - 16, e.w / 2, 20, MAT.hay, 0);
    Shade.ellipse3(ctx, cx, GROUND_Y - 40, e.w * 0.38, 20, MAT.hay, 0);
    Shade.ellipse3(ctx, cx, GROUND_Y - 60, e.w * 0.24, 16, MAT.hay, 0);
    // straw strokes
    ctx.strokeStyle = MAT.hay.shade; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const hx = sx + 12 + e.seed * 0 + i * (e.w - 24) / 6 + Math.sin(e.seed * 40 + i) * 3;
      ctx.beginPath(); ctx.moveTo(hx, GROUND_Y - 6); ctx.lineTo(hx + 5, GROUND_Y - 20 - (i % 3) * 9); ctx.stroke();
    }
    // the MARK: a little red flag — "hide here"
    ctx.strokeStyle = MAT.woodDark.base; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + 10, GROUND_Y - 66); ctx.lineTo(cx + 10, GROUND_Y - 96); ctx.stroke();
    ctx.fillStyle = MAT.leaf.base;
    ctx.beginPath();
    ctx.moveTo(cx + 10, GROUND_Y - 96); ctx.lineTo(cx + 30, GROUND_Y - 90); ctx.lineTo(cx + 10, GROUND_Y - 84);
    ctx.closePath(); ctx.fill();
  }
  function drawBeam(ctx, e, sx, t) {
    // chains from the barn roof + a heavy beam to slide under
    ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx + 5, 100); ctx.lineTo(sx + 5, GROUND_Y - 118); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + e.w - 5, 100); ctx.lineTo(sx + e.w - 5, GROUND_Y - 118); ctx.stroke();
    Shade.rect3(ctx, sx - 8, GROUND_Y - 118, e.w + 16, 48, MAT.woodDark);
    ctx.fillStyle = MAT.hay.base; // straw caught on top
    ctx.fillRect(sx - 4, GROUND_Y - 122, e.w + 8, 5);
  }
  function drawKnife(ctx, e, sx) {
    // hanger rod from the kitchen rail down to the blade
    ctx.strokeStyle = '#0f1219'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx + e.w / 2, 122); ctx.lineTo(sx + e.w / 2, GROUND_Y - 196); ctx.stroke();
    // handle
    Shade.rect3(ctx, sx + e.w / 2 - 4, GROUND_Y - 200, 8, 26, MAT.woodDark);
    // blade: metal gradient, light edge on the right (upper-right light)
    const g = ctx.createLinearGradient(sx, 0, sx + e.w, 0);
    g.addColorStop(0, MAT.metal.shade);
    g.addColorStop(0.55, MAT.metal.base);
    g.addColorStop(1, MAT.metal.light);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx + 2, GROUND_Y - 176);
    ctx.lineTo(sx + e.w - 2, GROUND_Y - 176);
    ctx.lineTo(sx + e.w - 2, GROUND_Y - 96);
    ctx.lineTo(sx + e.w / 2, e.bottom);           // the point
    ctx.lineTo(sx + 2, GROUND_Y - 88);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = MAT.metal.light; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sx + e.w - 3, GROUND_Y - 170); ctx.lineTo(sx + e.w - 3, GROUND_Y - 98); ctx.stroke();
  }
  function flamePath(ctx, x, baseY, w, hgt, dir) {
    // teardrop flame: wide at base, pointed tip. dir=+1 up, -1 down.
    ctx.beginPath();
    ctx.moveTo(x - w / 2, baseY);
    ctx.quadraticCurveTo(x - w / 2, baseY - dir * hgt * 0.55, x, baseY - dir * hgt);
    ctx.quadraticCurveTo(x + w / 2, baseY - dir * hgt * 0.55, x + w / 2, baseY);
    ctx.closePath();
  }
  function drawFlame(ctx, x, baseY, w, hgt, dir, t, seed) {
    const flick = 0.88 + Math.sin(t * 31 + seed * 50) * 0.12;
    const h = hgt * flick;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    flamePath(ctx, x, baseY, w, h, dir);
    const g = ctx.createLinearGradient(0, baseY, 0, baseY - dir * h);
    g.addColorStop(0, 'rgba(255,120,20,0.85)');
    g.addColorStop(0.55, 'rgba(240,127,30,0.75)');
    g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.fill();
    flamePath(ctx, x, baseY, w * 0.55, h * 0.66, dir);
    const g2 = ctx.createLinearGradient(0, baseY, 0, baseY - dir * h * 0.66);
    g2.addColorStop(0, 'rgba(255,217,77,0.95)');
    g2.addColorStop(1, 'rgba(255,217,77,0)');
    ctx.fillStyle = g2; ctx.fill();
    ctx.restore();
    // white-hot core
    flamePath(ctx, x, baseY, w * 0.24, h * 0.36, dir);
    ctx.fillStyle = 'rgba(255,246,200,0.9)';
    ctx.fill();
  }
  function drawFlameF(ctx, e, sx, t) {
    // oven grate box on the floor + jet when on
    Shade.rect3(ctx, sx - 4, GROUND_Y - 14, e.w + 8, 14, MAT.ironDark);
    ctx.fillStyle = '#0c0e13';
    for (let i = 0; i < 4; i++) ctx.fillRect(sx + 4 + i * 13, GROUND_Y - 11, 6, 8);
    if (flameOn(e, t)) drawFlame(ctx, sx + e.w / 2, GROUND_Y - 12, e.w * 0.8, e.h + 14, 1, t, e.seed);
    else {
      const wk = flameWarn(e, t);
      if (wk > 0) { // pre-warn: sputtering tongues + a growing glow (>=0.4s of notice)
        ctx.fillStyle = 'rgba(255,140,40,' + (0.18 + wk * 0.3).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(sx + e.w / 2, GROUND_Y - 14, 12 + wk * 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        drawFlame(ctx, sx + e.w / 2, GROUND_Y - 12, e.w * (0.3 + wk * 0.25), 8 + wk * 22, 1, t * 2.7, e.seed);
      } else { // pilot shimmer
        ctx.fillStyle = 'rgba(255,150,50,0.35)';
        ctx.beginPath(); ctx.ellipse(sx + e.w / 2, GROUND_Y - 14, 9, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawFlameO(ctx, e, sx, t) {
    // pipe from the ceiling + downward jet when on. The jet is drawn from
    // the nozzle (y~242) down to the collision floor — it used to float
    // mid-air, disconnected from its own pipe.
    Shade.rect3(ctx, sx - 3, 196, e.w + 6, 20, MAT.ironDark);
    ctx.fillStyle = MAT.ironDark.base;
    ctx.beginPath();
    ctx.moveTo(sx + 6, 216); ctx.lineTo(sx + e.w - 6, 216); ctx.lineTo(sx + e.w / 2 + 5, 236); ctx.lineTo(sx + e.w / 2 - 5, 236);
    ctx.closePath(); ctx.fill();
    if (flameOn(e, t)) drawFlame(ctx, sx + e.w / 2, 242, e.w * 0.85, 296, -1, t, e.seed);
    else {
      const wk = flameWarn(e, t);
      if (wk > 0) { // pre-warn: the nozzle glows and spits before it fires
        ctx.fillStyle = 'rgba(255,140,40,' + (0.2 + wk * 0.35).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(sx + e.w / 2, 240, 10 + wk * 8, 4, 0, 0, Math.PI * 2); ctx.fill();
        drawFlame(ctx, sx + e.w / 2, 244, e.w * (0.3 + wk * 0.25), 10 + wk * 30, -1, t * 2.7, e.seed);
      } else { // pilot dot at the nozzle
        ctx.fillStyle = 'rgba(255,150,50,0.3)';
        ctx.beginPath(); ctx.ellipse(sx + e.w / 2, 239, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawPuddle(ctx, e, sx, zone) {
    const kitchen = zone === 2;
    ctx.fillStyle = kitchen ? 'rgba(30,34,48,0.9)' : 'rgba(84,120,150,0.75)';
    ctx.beginPath(); ctx.ellipse(sx + e.w / 2, GROUND_Y + 9, e.w / 2, 8.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = kitchen ? 'rgba(150,170,210,0.35)' : 'rgba(200,230,250,0.5)';
    ctx.beginPath(); ctx.ellipse(sx + e.w / 2 - 12, GROUND_Y + 7, e.w / 4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawCorn(ctx, e, sx, t) {
    if (e.taken) return;
    const cy = GROUND_Y - (e.yOff || 40) + Math.sin(t * 2.4 + e.seed * 9) * 3;
    ctx.save();
    ctx.translate(sx + e.w / 2, cy);
    ctx.rotate(Math.sin(t * 2 + e.seed * 7) * 0.16);
    Shade.ellipse3(ctx, 0, 0, 8, 13, MAT.corn, 0.5);
    ctx.strokeStyle = MAT.corn.shade; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, -9); ctx.lineTo(5, 9); ctx.moveTo(5, -9); ctx.lineTo(-5, 9); ctx.stroke();
    ctx.fillStyle = '#5c7d33'; // husk leaves
    ctx.beginPath(); ctx.ellipse(-6, 10, 5, 8, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6, 10, 5, 8, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawFeatherPickup(ctx, e, sx, t) {
    if (e.taken) return;
    const cy = GROUND_Y - (e.yOff || 74) + Math.sin(t * 2 + e.seed * 8) * 5;
    const cx = sx + e.w / 2;
    // glow halo — this one matters
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
    g.addColorStop(0, 'rgba(255,220,90,0.5)');
    g.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 30, cy - 30, 60, 60);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.5 + Math.sin(t * 2.6 + e.seed * 6) * 0.14);
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.ellipse(2, -1, 9, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9a92e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-14, 3); ctx.lineTo(14, -3); ctx.stroke();
    ctx.restore();
  }
  function drawChili(ctx, e, sx, t) {
    if (e.taken) return;
    const cy = GROUND_Y - (e.yOff || 40) + Math.sin(t * 3 + e.seed * 8) * 3;
    const cx = sx + e.w / 2;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24);
    g.addColorStop(0, 'rgba(255,80,50,0.45)');
    g.addColorStop(1, 'rgba(255,80,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 24, cy - 24, 48, 48);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.5 + Math.sin(t * 3 + e.seed) * 0.1);
    Shade.ellipse3(ctx, 0, 2, 6.5, 12, MAT.chili, 0.35);
    ctx.strokeStyle = '#3f7d2e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(3, -14, 7, -14); ctx.stroke();
    ctx.restore();
  }
  function drawSign(ctx, e, sx) {
    // Wooden signpost: post + board(s). Distance signs are small and grey-
    // painted; story signs are bigger with a dark board and cream letters.
    const cx = sx + e.w / 2;
    ctx.strokeStyle = MAT.woodDark.base; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, GROUND_Y + 4); ctx.lineTo(cx, GROUND_Y - 88); ctx.stroke();
    if (e.kind === 'dist') {
      Shade.rect3(ctx, cx - 34, GROUND_Y - 92, 68, 24, MAT.wood);
      ctx.fillStyle = '#fdf6e3';
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.label, cx, GROUND_Y - 75);
    } else {
      Shade.rect3(ctx, cx - 88, GROUND_Y - 100, 176, e.sub ? 46 : 32, MAT.ironDark);
      ctx.fillStyle = '#f3e9cf';
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      ctx.fillText(e.label, cx, GROUND_Y - 78);
      if (e.sub) {
        ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
        ctx.fillStyle = '#e88a6a';
        ctx.fillText(e.sub, cx, GROUND_Y - 61);
      }
    }
  }
  function drawPage(ctx, e, sx, t) {
    // A dropped recipe page, still fluttering on the path just before the
    // house — the story's breadcrumb: tonight, turkey was on the menu.
    const cx = sx + e.w / 2;
    const flutter = Math.sin(t * 2.6 + e.seed * 6.28) * 4;
    const lift = 5 + Math.sin(t * 1.7 + e.seed * 4) * 2.5;
    ctx.save();
    ctx.translate(cx, GROUND_Y - lift);
    ctx.rotate(flutter * 0.02 - 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(0, lift + 3, 16, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2ead2';
    ctx.fillRect(-11, -14, 22, 28);
    ctx.strokeStyle = 'rgba(120,100,70,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(-11, -14, 22, 28);
    ctx.strokeStyle = 'rgba(90,80,60,0.55)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(-7, -7 + i * 5); ctx.lineTo(7 - (i % 2) * 3, -7 + i * 5); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(176,58,44,0.85)';
    ctx.font = 'bold 6px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROAST', 0, 12);
    ctx.restore();
  }
  function drawMenuBoard(ctx, e, sx) {
    // TONIGHT'S MENU chalkboard. Once the turkey passes it, TURKEY is
    // struck through in red chalk and the board has a new last word.
    const cx = sx + e.w / 2;
    ctx.strokeStyle = MAT.woodDark.base; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 76, GROUND_Y + 4); ctx.lineTo(cx - 76, GROUND_Y - 168);
    ctx.moveTo(cx + 76, GROUND_Y + 4); ctx.lineTo(cx + 76, GROUND_Y - 168);
    ctx.stroke();
    Shade.rect3(ctx, sx, GROUND_Y - 176, e.w, 128, MAT.wood);
    ctx.fillStyle = '#2c3530';
    ctx.fillRect(sx + 8, GROUND_Y - 168, e.w - 16, 112);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3e9cf';
    ctx.font = 'bold 19px "Trebuchet MS", sans-serif';
    ctx.fillText("TONIGHT'S MENU", cx, GROUND_Y - 138);
    ctx.font = '13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(243,233,207,0.85)';
    ctx.fillText('soup of the day', cx, GROUND_Y - 114);
    ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fdf6e3';
    ctx.fillText('ROAST TURKEY', cx, GROUND_Y - 84);
    const passed = (sx + e.w) < 430; // the turkey (fixed at x=430) has run past it
    if (passed) {
      ctx.strokeStyle = '#e0483c'; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx - 78, GROUND_Y - 88); ctx.lineTo(cx + 78, GROUND_Y - 80);
      ctx.moveTo(cx - 78, GROUND_Y - 80); ctx.lineTo(cx + 78, GROUND_Y - 88);
      ctx.stroke();
      ctx.fillStyle = '#e0483c';
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      ctx.fillText('— ESCAPED! —', cx, GROUND_Y - 58);
    }
  }
  function drawFinish(ctx, e, sx) {
    // two poles + FREEDOM banner at the tree line
    Shade.rect3(ctx, sx - 6, GROUND_Y - 210, 11, 210, MAT.woodDark);
    Shade.rect3(ctx, sx + 330, GROUND_Y - 210, 11, 210, MAT.woodDark);
    ctx.fillStyle = '#fdf3d8';
    ctx.fillRect(sx + 2, GROUND_Y - 208, 334, 52);
    ctx.strokeStyle = MAT.barnRed.base; ctx.lineWidth = 3;
    ctx.strokeRect(sx + 2, GROUND_Y - 208, 334, 52);
    ctx.fillStyle = MAT.barnRed.shade;
    ctx.font = '900 37px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('FREEDOM', sx + 169, GROUND_Y - 172);
    ctx.textAlign = 'left';
    // bunting
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ['#e74c3c', '#f39c12', '#2ecc71'][i % 3];
      const bx = sx + 14 + i * 54;
      ctx.beginPath();
      ctx.moveTo(bx, GROUND_Y - 156); ctx.lineTo(bx + 24, GROUND_Y - 156); ctx.lineTo(bx + 12, GROUND_Y - 138);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawOne(ctx, e, sx, t, zone) {
    switch (e.type) {
      case 'fence': drawFence(ctx, e, sx); break;
      case 'pumpkin': drawPumpkinEnt(ctx, e, sx); break;
      case 'bale': drawBale(ctx, e, sx); break;
      case 'beam': drawBeam(ctx, e, sx, t); break;
      case 'knife': drawKnife(ctx, e, sx); break;
      case 'flameF': drawFlameF(ctx, e, sx, t); break;
      case 'flameO': drawFlameO(ctx, e, sx, t); break;
      case 'puddle': drawPuddle(ctx, e, sx, zone); break;
      case 'corn': drawCorn(ctx, e, sx, t); break;
      case 'feather': drawFeatherPickup(ctx, e, sx, t); break;
      case 'chili': drawChili(ctx, e, sx, t); break;
      case 'finish': drawFinish(ctx, e, sx); break;
      case 'sign': drawSign(ctx, e, sx); break;
      case 'page': drawPage(ctx, e, sx, t); break;
      case 'menuboard': drawMenuBoard(ctx, e, sx); break;
    }
  }
  // Everything except hideable stacks (drawn later, over the turkey).
  function drawMain(ctx, ents, scroll, t, zone) {
    for (const e of ents) {
      if (e.type === 'stack') continue;
      const sx = e.x - scroll;
      if (sx < -420 || sx > World.W + 60) continue;
      drawOne(ctx, e, sx, t, zone);
    }
  }
  function drawStacks(ctx, ents, scroll, t) {
    for (const e of ents) {
      if (e.type !== 'stack') continue;
      const sx = e.x - scroll;
      if (sx < -200 || sx > World.W + 60) continue;
      drawStack(ctx, e, sx);
    }
  }

  // ---------------- queries & collisions ----------------
  // The hideable stack (if any) whose span contains world-x cx.
  function stackAt(ents, cx) {
    for (const e of ents) {
      if (e.type !== 'stack') continue;
      if (cx > e.x - 6 && cx < e.x + e.w + 6) return e;
      if (e.x > cx + 200) break;
    }
    return null;
  }
  function nextAhead(ents, cx, within) {
    for (const e of ents) {
      if (e.x + e.w < cx) continue;
      if (e.x - cx > within) break;
      return e;
    }
    return null;
  }

  // turkey: {cx, feetY, topY, grounded, sliding, dashing, invincible, hiding}
  // events: {hit(e), smash(e), pickup(e), splash()}
  // returns {puddle: bool}
  function collide(ents, turkey, t, events) {
    let puddle = false;
    const tL = turkey.cx - 28, tR = turkey.cx + 34;
    for (const e of ents) {
      if (e.x > tR + 30) break;
      if (e.x + e.w < tL - 10) continue;
      const overlapX = e.x < tR && e.x + e.w > tL;
      switch (e.type) {
        case 'corn': case 'feather': case 'chili': {
          if (e.taken) break;
          // Slight magnet: pickups snap in from a modest radius so near
          // misses still feel generous (SOP: generous pickup radius).
          const magX = e.type === 'feather' ? 12 : 30;
          const magY = e.type === 'feather' ? 64 : 76;
          if (!(e.x - magX < tR && e.x + e.w + magX > tL)) break;
          const cy = GROUND_Y - (e.yOff || 40);
          const centreY = turkey.feetY - 48;
          if (Math.abs(centreY - cy) < magY) { e.taken = true; events.pickup(e); }
          break;
        }
        case 'puddle':
          if (overlapX && turkey.grounded && !turkey.dashing) puddle = true;
          break;
        case 'fence': case 'pumpkin': case 'bale': {
          if (e.hit || !overlapX) break;
          if (turkey.feetY > GROUND_Y - e.h + 12) {
            if (turkey.dashing && e.type !== 'bale') { e.hit = true; events.smash(e); }
            else if (!turkey.invincible) { e.hit = true; events.hit(e); }
          }
          break;
        }
        case 'stack':
          break; // never collides; hiding handled by main via stackAt
        case 'beam': case 'knife': {
          if (!overlapX || turkey.hiding) break;
          if (turkey.topY < e.bottom && !turkey.invincible) events.hit(e);
          break;
        }
        case 'flameO': {
          if (!overlapX || turkey.hiding || !flameOn(e, t)) break;
          if (turkey.topY < e.bottom && !turkey.invincible) events.hit(e);
          break;
        }
        case 'flameF': {
          if (e.hit || !overlapX || !flameOn(e, t)) break;
          if (turkey.feetY > GROUND_Y - e.h + 12 && !turkey.invincible) { e.hit = true; events.hit(e); }
          break;
        }
      }
    }
    return { puddle };
  }

  // Additive-glow sources for the post pass (lit flames only).
  function flameGlows(ents, scroll, t) {
    const out = [];
    for (const e of ents) {
      const sx = e.x - scroll;
      if (sx < -120 || sx > World.W + 60) continue;
      if (e.x > scroll + World.W + 60) break;
      if (e.type === 'flameF' && flameOn(e, t)) out.push({ x: sx + e.w / 2, y: GROUND_Y - 26, r: 74, a: 0.34 });
      else if (e.type === 'flameO' && flameOn(e, t)) out.push({ x: sx + e.w / 2, y: GROUND_Y - 128, r: 84, a: 0.3 });
    }
    return out;
  }

  return { buildCourse, collide, stackAt, nextAhead, drawMain, drawStacks,
           flameOn, flameWarn, flameGlows, PX_PER_M, TOTAL_M, DIMS };
})();
