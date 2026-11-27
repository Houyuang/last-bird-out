// particles.js — pre-allocated particle pool driven by EMITTER CONFIGS.
// Every effect is data: spawn shape, velocity ranges, gravity/drag, and
// color-over-life + size-over-life curves evaluated per particle each frame.
//   dust:      grows and fades          feathers: flutter, rotate, fade
//   spark:     shrinks and falls        chip:     tumbles under gravity
//   confetti:  flutters down            ovenSpark: tiny, fast, shrinks hard
'use strict';
const Particles = (() => {
  const EMITTERS = {
    dust: {
      shape: 'circle', r: [198, 166, 112],
      vx: [-120, -30], vy: [-55, -10], grav: -30, drag: 0.92,
      life: [0.35, 0.65], size: [3.5, 9],
      sizeCurve: [0.6, 1.5],           // grows over life
      alphaCurve: [0.95, 0],           // fades over life
    },
    feather: {
      shape: 'feather', r: [240, 230, 210],
      vx: [-130, -40], vy: [-80, -20], grav: 160, drag: 0.96,
      life: [0.6, 1.0], size: [4, 8], vr: [-6, 6],
      sizeCurve: [1, 0.9], alphaCurve: [1, 0],
    },
    spark: {
      shape: 'circle', r: [255, 217, 77],
      vx: [-90, 90], vy: [-130, 40], grav: 220, drag: 0.94,
      life: [0.35, 0.65], size: [2, 4.6],
      sizeCurve: [1, 0.25],            // shrinks over life
      alphaCurve: [1, 0],
    },
    chip: {
      shape: 'rect', r: [138, 104, 68],
      vx: [-60, 130], vy: [-230, -60], grav: 620, drag: 0.99,
      life: [0.5, 0.85], size: [3, 7.5], vr: [-8, 8],
      sizeCurve: [1, 0.8], alphaCurve: [1, 0.35],
    },
    confetti: {
      shape: 'rect', palette: [[231, 76, 60], [243, 156, 18], [46, 204, 113], [52, 152, 219], [232, 67, 147], [241, 196, 15]],
      vx: [-65, 65], vy: [-420, -190], grav: 300, drag: 0.985,
      life: [1.4, 2.5], size: [4, 8], vr: [-5.5, 5.5],
      sizeCurve: [1, 0.9], alphaCurve: [1, 0],
    },
    ovenSpark: {
      shape: 'circle', r: [255, 176, 66],
      vx: [-26, 26], vy: [-190, -70], grav: -60, drag: 0.97,
      life: [0.4, 0.9], size: [1.6, 3.2],
      sizeCurve: [1, 0.1],             // shrinks hard as it rises
      alphaCurve: [0.95, 0],
    },
    leaf: {
      shape: 'feather', r: [168, 178, 96],
      vx: [-30, 30], vy: [-14, 30], grav: 24, drag: 0.995,
      life: [0.9, 1.9], size: [4, 8], vr: [-5, 5],
      sizeCurve: [1, 0.9], alphaCurve: [0.95, 0],
    },
  };

  const MAX = 300; // SOP stage 10 budget: <=300 particles on screen, pool-capped
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ alive: false, cfg: null, x: 0, y: 0, vx: 0, vy: 0, life: 0,
                maxLife: 1, size: 3, rot: 0, vr: 0, r: 255, g: 255, b: 255 });
  }
  let cursor = 0;
  function rnd(range) { return range[0] + Math.random() * (range[1] - range[0]); }

  function emit(name, x, y, n, opt) {
    const cfg = EMITTERS[name];
    if (!cfg) return;
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const p = pool[cursor];
      cursor = (cursor + 1) % MAX;
      p.alive = true; p.cfg = cfg;
      p.x = x + (Math.random() - 0.5) * (opt.spreadX || 22);
      p.y = y + (Math.random() - 0.5) * (opt.spreadY || 6);
      p.vx = rnd(cfg.vx) * (opt.power || 1) + (opt.vxAdd || 0);
      p.vy = rnd(cfg.vy) * (opt.power || 1);
      p.life = 0;
      p.maxLife = rnd(cfg.life);
      p.size = rnd(cfg.size);
      p.rot = Math.random() * Math.PI;
      p.vr = cfg.vr ? rnd(cfg.vr) : 0;
      const c = opt.rgb ? opt.rgb
        : cfg.palette ? cfg.palette[(Math.random() * cfg.palette.length) | 0] : cfg.r;
      p.r = c[0]; p.g = c[1]; p.b = c[2];
    }
  }

  // Named emitters (the API the rest of the game uses).
  function dust(x, y, n, power, rgb) { emit('dust', x, y, n, { power: power || 1, rgb: rgb || null }); }
  function feathers(x, y, n) { emit('feather', x, y, n, { spreadX: 20, spreadY: 10 }); }
  function sparks(x, y, n) { emit('spark', x, y, n, { spreadX: 8, spreadY: 8 }); }
  function chips(x, y, n) { emit('chip', x, y, n, { spreadX: 16, spreadY: 26 }); }
  function confetti(x, y, n) { emit('confetti', x, y, n, { spreadX: 240, spreadY: 50 }); }
  function ovenSparks(x, y, n) { emit('ovenSpark', x, y, n, { spreadX: 30, spreadY: 4 }); }
  function leaves(x, y, n, vxAdd) { emit('leaf', x, y, n, { spreadX: 10, spreadY: 130, vxAdd: vxAdd || 0 }); }

  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; continue; }
      p.vy += p.cfg.grav * dt;
      const d = Math.pow(p.cfg.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }

  function draw(ctx) {
    for (const p of pool) {
      if (!p.alive) continue;
      const t = p.life / p.maxLife;
      const cfg = p.cfg;
      const size = p.size * (cfg.sizeCurve[0] + (cfg.sizeCurve[1] - cfg.sizeCurve[0]) * t);
      const alpha = cfg.alphaCurve[0] + (cfg.alphaCurve[1] - cfg.alphaCurve[0]) * t;
      if (alpha <= 0.01) continue;
      const col = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + alpha.toFixed(3) + ')';
      if (cfg.shape === 'circle') {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      } else if (cfg.shape === 'feather') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else { // rect (chip / confetti)
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = col;
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        ctx.restore();
      }
    }
  }
  return { emit, dust, feathers, sparks, chips, confetti, ovenSparks, leaves, update, draw, EMITTERS };
})();
