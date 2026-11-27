// main.js — game orchestration: states (menu/play/pause/caught/win), the
// chase economy (hearts + farmer proximity), render passes in fixed order
//   sky -> parallax -> props -> contact shadows -> characters -> particles
//   -> POST (zone grade + practical glows + vignette) -> HUD
// plus pose blending, footstep notifies, the autoplay driver and the
// deterministic screenshot mode (?shot=menu|run|kitchen|caught&freeze=1).
'use strict';
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = World.W, H = World.H, GROUND_Y = World.GROUND_Y;
  const PLAYER_X = 430;
  const PX_PER_M = Obstacles.PX_PER_M, TOTAL_M = Obstacles.TOTAL_M;

  const params = new URLSearchParams(location.search);
  const SHOT = params.get('shot');
  const HERO = SHOT === 'hero'; // 2x close framing of the turkey for art QA
  const AUTOPLAY = params.has('autoplay');
  const BOT = params.get('bot'); // 'standard' = human-like driver (smoke suite)
  const GODMODE = params.has('godmode');
  const FAST = Math.max(1, parseFloat(params.get('fast') || '1') || 1);

  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));

  // ---------------- post-process grades (per zone) ----------------
  const GRADES = [
    { mul: [255, 247, 226], over: [255, 180, 80],  overA: 0.05, vig: 0.16 }, // farmyard warm noon
    { mul: [255, 208, 158], over: [255, 118, 40],  overA: 0.10, vig: 0.30 }, // barn amber dusk
    { mul: [182, 194, 224], over: [14, 24, 52],    overA: 0.15, vig: 0.40 }, // kitchen cool dark
    { mul: [255, 238, 208], over: [255, 170, 120], overA: 0.06, vig: 0.24 }, // woods pale dawn
  ];
  function cloneGrade(g) { return { mul: g.mul.slice(), over: g.over.slice(), overA: g.overA, vig: g.vig }; }
  let gradeCur = cloneGrade(GRADES[0]);
  function updateGrade(dt) {
    const target = GRADES[G.zone];
    const k = 1 - Math.exp(-dt * 3.2); // ~95% there in 1 s — no hard cuts
    for (let i = 0; i < 3; i++) {
      gradeCur.mul[i] += (target.mul[i] - gradeCur.mul[i]) * k;
      gradeCur.over[i] += (target.over[i] - gradeCur.over[i]) * k;
    }
    gradeCur.overA += (target.overA - gradeCur.overA) * k;
    gradeCur.vig += (target.vig - gradeCur.vig) * k;
  }
  const rgbStr = (a) => 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')';

  // ---------------- game state ----------------
  let ents = Obstacles.buildCourse();
  let player = Player.create(GROUND_Y);
  const G = {
    state: 'menu', scroll: 0, distM: 0, score: 0, hearts: 3, proximity: 0,
    zone: 0, time: 0, stateT: 0, hitStop: 0, trauma: 0,
    farmerX: PLAYER_X - 320, farmerPhase: 0, dogX: -120, dogPhase: 0,
    featherSlowT: 0, chiliT: 0, puddle: false, bannerT: 0, speedNow: 0,
    ovenSparkT: 0, winConfettiT: 0, fast: FAST,
    tailLag: 0, tailLagV: 0, prevSpeed: 0,
    corn: 0, hitsTaken: 0, runTime: 0, caughtIdx: 0, runCount: 0,
    bubble: null, dogBubbleAt: 0, popups: [], hitLog: [],
  };

  // Best score/distance, persisted when storage exists. file:// and
  // private-mode storage can throw — every access is guarded.
  let best = { score: 0, dist: 0 };
  try {
    const raw = localStorage.getItem('lboBest');
    if (raw) {
      const b = JSON.parse(raw);
      if (b && isFinite(b.score)) best = { score: b.score | 0, dist: b.dist | 0 };
    }
  } catch (e) { /* best stays in memory only */ }
  function saveBest() {
    const s = Math.floor(G.score), d = Math.floor(G.distM);
    if (s > best.score) best.score = s;
    if (d > best.dist) best.dist = d;
    try { localStorage.setItem('lboBest', JSON.stringify(best)); } catch (e) { /* ignore */ }
  }
  // Floating score text, anchored to world x so it scrolls with the world.
  function popup(x, y, text, color) {
    G.popups.push({ x, y, text, color: color || '#ffd94d', life: 0.9, vy: -46 });
    if (G.popups.length > 14) G.popups.shift();
  }
  const blend = { lean: 0.05, legAmp: 1 };
  let prevPhaseSin = 0;

  function reset(toPlay) {
    ents = Obstacles.buildCourse();
    player = Player.create(GROUND_Y);
    G.scroll = 0; G.distM = 0; G.score = 0; G.hearts = 3; G.proximity = 0;
    G.zone = 0; G.hitStop = 0; G.trauma = 0; G.featherSlowT = 0; G.chiliT = 0;
    G.puddle = false; G.stateT = 0;
    G.corn = 0; G.hitsTaken = 0; G.runTime = 0; G.popups.length = 0;
    G.bubble = null; G.dogBubbleAt = 0;
    G.caughtIdx = G.runCount % 3; G.runCount++;
    G.farmerX = PLAYER_X - 320; G.dogX = -120;
    gradeCur = cloneGrade(GRADES[0]);
    blend.lean = 0.05; blend.legAmp = 1;
    showBanner(0);
    G.state = toPlay ? 'play' : 'menu';
  }
  function showBanner(zone) {
    G.bannerZone = zone;
    G.bannerT = 2.4;
  }
  function doCaught() {
    if (G.state !== 'play') return;
    G.state = 'caught'; G.stateT = 0;
    Input.take('any'); // flush stale presses so the end screen doesn't insta-restart
    G.trauma = Math.min(1, G.trauma + 0.5);
    saveBest();
    AudioFX.caught();
  }
  function doWin() {
    G.state = 'win'; G.stateT = 0;
    Input.take('any');
    G.score += 500;
    saveBest();
    AudioFX.win();
    Particles.confetti(PLAYER_X + 60, GROUND_Y - 160, 90);
  }

  // ---------------- player / collision events ----------------
  // Dust takes the zone's tint: golden straw in the Barn, pale flour in
  // the Kitchen, leafy green at dawn in the Woods (Farmyard keeps default).
  const DUST_TINTS = [null, [198, 160, 104], [210, 214, 226], [180, 190, 152]];
  function dustTint() { return DUST_TINTS[G.zone] || undefined; }
  const playerEvents = {
    jump() { AudioFX.jump(); },
    doubleJump() { AudioFX.doubleJump(); Particles.feathers(PLAYER_X - 6, player.y + 16, 7); },
    land(impact) {
      AudioFX.land(impact > 800);
      Particles.dust(PLAYER_X, GROUND_Y + 2, impact > 800 ? 15 : 8, Math.min(1.6, impact / 700), dustTint());
      if (impact > 780) G.trauma = Math.min(1, G.trauma + 0.28 + (impact - 780) / 1400);
      G.tailLagV += Math.min(2.4, impact * 0.0024); // tail fan jolts on touchdown
    },
    slideStart() { AudioFX.slide(); Particles.dust(PLAYER_X - 20, GROUND_Y + 2, 6, 0.7, dustTint()); },
    dash() { AudioFX.dash(); Particles.dust(PLAYER_X - 26, GROUND_Y + 2, 8, 1, dustTint()); },
  };
  const collideEvents = {
    hit(e) {
      if (GODMODE || G.state !== 'play') return;
      G.hearts -= 1;
      G.hitsTaken += 1;
      G.hitLog.push({ type: e.type, m: Math.round(G.distM), prox: Math.round(G.proximity) });
      G.proximity = Math.min(100, G.proximity + 25);
      G.hitStop = 0.05;                       // 50 ms hit-stop
      G.trauma = Math.min(1, G.trauma + 0.5);
      player.invincibleT = 1.2;
      player.stumbleT = 0.55;
      AudioFX.hit();
      Particles.feathers(PLAYER_X, player.y, 9);
      if (G.hearts <= 0) doCaught();
    },
    smash(e) {
      G.score += 50;
      popup(e.x + e.w / 2, GROUND_Y - 74, '+50', '#7ec3ee');
      AudioFX.smash();
      Particles.chips(e.x - G.scroll + e.w / 2, GROUND_Y - 18, 11);
      G.trauma = Math.min(1, G.trauma + 0.12);
    },
    pickup(e) {
      const sx = e.x - G.scroll + e.w / 2, sy = GROUND_Y - (e.yOff || 40);
      if (e.type === 'corn') {
        G.score += 100; G.corn += 1;
        popup(e.x + e.w / 2, sy - 16, '+100');
        AudioFX.pickup(); Particles.sparks(sx, sy, 7);
      } else if (e.type === 'feather') {
        G.score += 250;
        popup(e.x + e.w / 2, sy - 16, '+250', '#ffe27a');
        G.proximity = Math.max(0, G.proximity - 25);
        G.featherSlowT = 3;
        AudioFX.feather();
        Particles.feathers(PLAYER_X, player.y, 8);
        Particles.sparks(sx, sy, 10);
      } else if (e.type === 'chili') {
        G.score += 150; G.chiliT = 3;
        popup(e.x + e.w / 2, sy - 16, '+150', '#ff9a3c');
        AudioFX.chili();
        Particles.sparks(sx, sy, 12);
      }
    },
  };

  // ---------------- footstep notifies ----------------
  // Dust + tick fire exactly when a foot lands: sin(phase) zero-crossings.
  function footstepFX() {
    if (!player.grounded) { prevPhaseSin = Math.sin(player.phase); return; }
    const s = Math.sin(player.phase);
    if ((player.mode === 'run' || player.mode === 'dash') &&
        ((prevPhaseSin <= 0 && s > 0) || (prevPhaseSin >= 0 && s < 0))) {
      Particles.dust(PLAYER_X - 22, GROUND_Y + 2, 2, 0.55, dustTint());
      if (G.state === 'play') AudioFX.step();
    }
    prevPhaseSin = s;
  }

  // ---------------- pose blending ----------------
  const LEAN_TARGETS = { run: 0.05, dash: 0.26, slide: -0.38, hide: -0.06 };
  const AMP_TARGETS = { run: 1, dash: 1.18, slide: 0.3, hide: 0.25 };
  function updateBlend(dt) {
    let leanT, ampT;
    if (!player.grounded) {
      leanT = -0.10 + Math.max(-0.14, Math.min(0.3, player.vy / 2600));
      ampT = 0.45;
    } else {
      leanT = LEAN_TARGETS[player.mode] != null ? LEAN_TARGETS[player.mode] : 0.05;
      ampT = AMP_TARGETS[player.mode] != null ? AMP_TARGETS[player.mode] : 1;
    }
    const k = 1 - Math.exp(-dt / 0.11); // 0.08–0.15 s blends
    blend.lean += (leanT - blend.lean) * k;
    blend.legAmp += (ampT - blend.legAmp) * k;
  }
  function blinkAmount(t) {
    const cycle = t % 2.8;
    if (cycle < 2.62) return 0;
    return Math.sin(Math.min(1, (cycle - 2.62) / 0.13) * Math.PI);
  }
  // Tail-fan spring: lags behind horizontal acceleration and vertical
  // motion, so the fan trails, overshoots and settles like real feathers.
  function updateTailSpring(dt, speed) {
    const accel = dt > 0 ? (speed - G.prevSpeed) / dt : 0;
    G.prevSpeed = speed;
    let target = Math.max(-0.26, Math.min(0.26, -accel * 0.00030));
    if (!player.grounded) target += Math.max(-0.14, Math.min(0.2, player.vy * 0.00013));
    G.tailLagV += ((target - G.tailLag) * 95 - G.tailLagV * 11) * dt;
    G.tailLag += G.tailLagV * dt;
  }
  const RIM_BY_ZONE = [0.35, 0.2, 0.12, 0.9]; // warm back rim, strongest at dawn in the Woods
  function buildPose(t) {
    const bob = (player.mode === 'run' || player.mode === 'dash') ? Math.sin(player.phase * 2) * 2.6 : 0;
    const spd = Math.min(1, Math.abs(G.speedNow || 130) / 480);
    return {
      x: PLAYER_X, y: player.y + bob, t,
      phase: player.phase, mode: player.mode,
      squash: Player.squashAmount(player),
      stretch: Player.stretchAmount(player),
      blink: blinkAmount(t),
      wingFlap: player.lastJumpWasDouble && !player.grounded ? 1 : 0,
      airTilt: Math.max(-0.14, Math.min(0.3, player.vy / 2600)),
      lean: blend.lean, legAmp: blend.legAmp,
      tailLag: G.tailLag,
      wattleSwing: Math.sin(t * (6 + spd * 7)) * (1.1 + spd * 2.6),
      rimWarm: RIM_BY_ZONE[G.zone] || 0,
    };
  }

  // ---------------- update ----------------
  function baseSpeed(distM) { return 350 + Math.min(180, distM * 0.055); }

  function updatePlay(dt) {
    G.time += dt;
    G.runTime += dt;
    if (Input.take('pause')) { G.state = 'pause'; return; }
    if (Input.take('restart')) { reset(true); return; }

    const cx = G.scroll + PLAYER_X;
    const stack = Obstacles.stackAt(ents, cx);
    const hiding = !!(stack && Input.down && player.grounded);

    // speed stack-up
    let speed = baseSpeed(G.distM) * FAST;
    if (player.dashT > 0) speed *= 1.55;
    if (G.chiliT > 0) speed *= 1.3;
    if (player.stumbleT > 0) speed *= 0.55;
    if (G.puddle) speed *= 0.55;
    if (hiding) speed *= 0.45;
    G.speedNow = speed;
    updateTailSpring(dt, speed);
    G.scroll += speed * dt;
    G.distM = G.scroll / PX_PER_M;
    G.score += (speed / PX_PER_M) * dt;

    Player.update(player, dt, speed, playerEvents, { hiding });
    if (GODMODE) player.invincibleT = 999;
    if (G.chiliT > 0) {
      G.chiliT -= dt;
      player.invincibleT = Math.max(player.invincibleT, 0.12);
      if (Math.random() < 0.5) Particles.sparks(PLAYER_X - 30, player.y + 20, 1);
    }
    if (G.featherSlowT > 0) G.featherSlowT -= dt;
    footstepFX();
    if (player.mode === 'slide') Particles.dust(PLAYER_X - 44, GROUND_Y + 2, 1, 0.5, dustTint());
    // feather trail: at full tilt the bird sheds the odd feather
    if ((player.dashT > 0 || G.speedNow > 505) && Math.random() < 0.22) {
      Particles.emit('feather', PLAYER_X - 34, player.y + 8 + Math.random() * 14, 1, {});
    }
    // score popups rise & fade
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const p = G.popups[i];
      p.life -= dt; p.y += p.vy * dt;
      if (p.life <= 0) G.popups.splice(i, 1);
    }

    // collisions
    const turkeyBox = {
      cx: G.scroll + PLAYER_X,
      feetY: player.y + 48,
      topY: player.mode === 'slide' ? player.y - 30 : player.y - 50,
      grounded: player.grounded, sliding: player.mode === 'slide',
      dashing: player.dashT > 0, invincible: player.invincibleT > 0, hiding,
    };
    const res = Obstacles.collide(ents, turkeyBox, G.time, collideEvents);
    G.puddle = res.puddle;
    if (G.state !== 'play') return; // a hit may have ended the run

    // chase economy
    let dp = -3.2;                                   // clean running: farmer falls back
    if (G.puddle) dp += 9;
    if (player.stumbleT > 0) dp += 12;
    if (G.zone >= 1) dp += 1.6;                      // the dog keeps the pressure on
    if (player.dashT > 0) dp -= 4;
    if (G.featherSlowT > 0) dp -= 9;
    if (hiding) dp = -42;                            // hidden: he loses the trail fast
    G.proximity = Math.max(0, Math.min(100, G.proximity + dp * dt));
    if (G.proximity >= 100) { doCaught(); return; }

    // zone change — banner + the farmer's threshold taunt
    const z = World.zoneAt(G.distM);
    if (z !== G.zone) {
      G.zone = z; showBanner(z); AudioFX.zone();
      const taunts = { 1: "I've let the dog loose!", 2: 'Into MY kitchen? Bold.', 3: "Come back! You're the MAIN COURSE!" };
      if (taunts[z]) G.bubble = { text: taunts[z], dur: 2.6 };
      if (z === 1) G.dogBubbleAt = G.time + 1.2; // the dog gets his own beat
    }
    if (G.bubble) { G.bubble.dur -= dt; if (G.bubble.dur <= 0) G.bubble = null; }
    if (G.dogBubbleAt && G.time >= G.dogBubbleAt) {
      G.dogBubbleAt = 0;
      G.bubble = { text: 'WOOF! WOOF!', who: 'dog', dur: 1.6 };
    }

    // chasers' screen positions follow the proximity gap
    const gap = 330 + (76 - 330) * (G.proximity / 100);
    const fTarget = PLAYER_X - gap + Math.sin(G.time * 0.7) * 6;
    G.farmerX += (fTarget - G.farmerX) * Math.min(1, dt * 4);
    G.farmerPhase += dt * speed * 0.052;
    const dTarget = G.zone >= 1 ? PLAYER_X - gap * 0.55 - 30 : -120;
    const dogWasOut = G.dogX <= -60;
    G.dogX += (dTarget - G.dogX) * Math.min(1, dt * 2.4);
    if (dogWasOut && G.dogX > -60 && G.zone >= 1) AudioFX.bark(); // he announces himself
    G.dogPhase += dt * speed * 0.075;

    // ambient oven sparks in the kitchen
    if (G.zone === 2) {
      G.ovenSparkT -= dt;
      if (G.ovenSparkT <= 0) {
        G.ovenSparkT = 0.13;
        const ovens = World.ovenGlowPositions(G.scroll).filter((x) => x > 0 && x < W);
        if (ovens.length) Particles.ovenSparks(ovens[(Math.random() * ovens.length) | 0], GROUND_Y - 66, 2);
      }
    }

    if (G.distM >= TOTAL_M) doWin();
  }

  function updateMenu(dt) {
    G.time += dt;
    G.scroll += 130 * dt;
    G.distM = G.scroll / PX_PER_M;
    if (G.distM > 60) { G.scroll = 0; G.distM = 0; } // loop the attract run
    player.phase += dt * 130 * 0.058;
    player.mode = 'run';
    footstepFX();
    G.farmerX = PLAYER_X - 300 + Math.sin(G.time * 0.7) * 8;
    G.farmerPhase += dt * 130 * 0.052;
    if (Input.take('any')) { AudioFX.unlock(); reset(true); }
  }

  function updateEnd(dt) { // caught / win: world idles, particles keep falling
    G.time += dt;
    G.stateT += dt;
    if (G.state === 'win') {
      player.phase += dt * 5.2;
      G.winConfettiT -= dt;
      if (G.winConfettiT <= 0 && G.stateT < 3.2) {
        G.winConfettiT = 0.45;
        Particles.confetti(PLAYER_X + 60, GROUND_Y - 170, 36);
      }
    }
    if (G.stateT > 0.6 && (Input.take('restart') || Input.take('any'))) reset(true);
  }

  // ---------------- autoplay driver (smoke tests) ----------------
  const auto = { releaseAt: 0 };
  function driveAutoplay() {
    const now = performance.now() / 1000;
    if (Input.jumpHeld && now >= auto.releaseAt) Input.releaseJump();
    const cx = G.scroll + PLAYER_X;
    let holding = false;
    for (const e of ents) {
      if (e.x + e.w < cx - 10) continue;
      const ahead = e.x - cx;
      if (ahead > 720) break;
      if (e.type === 'knife' || e.type === 'beam' || e.type === 'flameO') {
        if (ahead < 380) { Input.setDown(true); holding = true; }
        if (e.x + e.w < cx + 40) Input.setDown(false);
        break;
      }
      if (e.type === 'fence' || e.type === 'pumpkin' || e.type === 'bale' || e.type === 'flameF') {
        const trig = Math.max(120, Math.min(620, G.speedNow * 0.33));
        if (ahead < trig && ahead > 20 && player.grounded && !Input.jumpHeld) {
          Input.pressJump();
          auto.releaseAt = now + 0.1; // jump-cut hold: real seconds (vertical physics run in real time)
        }
        break;
      }
      if (e.type === 'puddle') {
        if (ahead < 220 && player.stamina >= Player.CONSTS.DASH_COST) Input.pressDash();
        break;
      }
    }
    if (!holding && !Input.down) Input.setDown(false);
    else if (!holding) {
      // release slide once the overhead obstacle is behind us
      const cx2 = cx;
      const stillUnder = ents.some((e) => (e.type === 'knife' || e.type === 'beam' || e.type === 'flameO') &&
        e.x < cx2 + 30 && e.x + e.w > cx2 - 40);
      if (!stillUnder) Input.setDown(false);
    }
  }

  // ---------------- standard player bot (difficulty calibration) --------
  // A fair-but-human driver: ~0.2 s reaction delay on every decision,
  // jittered jump timing, occasional early/late misjudgements, and it uses
  // haystacks when the farmer gets close. The smoke suite uses it to prove
  // the course is beatable-but-not-free for a normal player.
  const std = { queue: [], seen: new Set(), hideUntil: 0, recovered: false };
  function driveStandard() {
    const nowS = performance.now() / 1000;
    if (Input.jumpHeld && nowS >= auto.releaseAt) Input.releaseJump();
    const now = G.time;
    const cx = G.scroll + PLAYER_X;
    for (let i = std.queue.length - 1; i >= 0; i--) {
      if (std.queue[i].at <= now) { std.queue[i].fn(); std.queue.splice(i, 1); }
    }
    if (std.hideUntil > now) {
      Input.setDown(true);
      if (G.proximity < 25) { std.hideUntil = 0; Input.setDown(false); }
      return; // committed to the hiding spot — no obstacle scanning
    }
    const stack = Obstacles.stackAt(ents, cx);
    if (stack && player.grounded && G.proximity > 55 && !Input.jumpHeld) {
      std.hideUntil = now + 4; // released early once the farmer cools off
      Input.setDown(true);
      return;
    }
    // Recovery double jump — what a real player does when a jump is
    // falling short of the obstacle: flap again. Once per airborne stint.
    if (player.grounded) std.recovered = false;
    else if (player.vy > 60 && !std.recovered) {
      const e = ents.find((en) => en.x + en.w >= cx - 10 && en.x - cx > 20 && en.x - cx <= 240 &&
        (en.type === 'fence' || en.type === 'pumpkin' || en.type === 'bale' || en.type === 'flameF'));
      if (e && Math.random() < 0.8) { Input.pressJump(); std.recovered = true; }
    }
    let holding = false;
    for (const e of ents) {
      if (e.x + e.w < cx - 10) continue;
      const ahead = e.x - cx;
      if (ahead > 720) break;
      const id = e.x + ':' + e.type;
      if (e.type === 'knife' || e.type === 'beam' || e.type === 'flameO') {
        if (ahead < 380) { Input.setDown(true); holding = true; }
        if (e.x + e.w < cx + 40) Input.setDown(false);
        break;
      }
      if (e.type === 'fence' || e.type === 'pumpkin' || e.type === 'bale' || e.type === 'flameF') {
        if (!std.seen.has(id) && ahead < 700) {
          std.seen.add(id);
          let fate = 1;
          const roll = Math.random();
          if (roll < 0.05) fate = 1.55;      // jumps way too early
          else if (roll < 0.10) fate = 0.5;  // jumps too late
          const jitter = 0.84 + Math.random() * 0.32;
          // Sometimes it just dashes through smashables instead of jumping.
          const dashIt = (e.type === 'fence' || e.type === 'pumpkin') &&
            player.stamina >= Player.CONSTS.DASH_COST && Math.random() < 0.25;
          const trigDist = dashIt ? 170 : Math.max(120, Math.min(620, G.speedNow * 0.33)) * jitter * fate;
          const delay = Math.max(0, (ahead - trigDist) / Math.max(1, G.speedNow)) + 0.2 / FAST; // reaction, in world seconds
          std.queue.push({ at: now + delay, fn: () => {
            if (dashIt) { Input.pressDash(); return; }
            if (player.grounded && !Input.jumpHeld) {
              Input.pressJump();
              auto.releaseAt = performance.now() / 1000 + 0.1;
            }
          } });
        }
        break;
      }
      if (e.type === 'puddle') {
        if (!std.seen.has(id) && ahead < 700) {
          std.seen.add(id);
          const dash = player.stamina >= Player.CONSTS.DASH_COST && Math.random() < 0.4;
          const delay = Math.max(0, (ahead - 220) / Math.max(1, G.speedNow)) + 0.2 / FAST;
          std.queue.push({ at: now + delay, fn: () => {
            if (dash) Input.pressDash();
            else if (player.grounded && !Input.jumpHeld) {
              Input.pressJump();
              auto.releaseAt = performance.now() / 1000 + 0.1;
            }
          } });
        }
        break;
      }
    }
    if (!holding) {
      const stillUnder = ents.some((e) => (e.type === 'knife' || e.type === 'beam' || e.type === 'flameO') &&
        e.x < cx + 30 && e.x + e.w > cx - 40);
      if (!stillUnder) Input.setDown(false);
    }
  }

  // ---------------- render ----------------
  function contactShadow(x, feetY, rxBase) {
    const hgt = Math.max(0, GROUND_Y - feetY);
    const s = Math.max(0.32, 1 - hgt / 300);
    const stretch = G.zone === 1 ? 1.7 : 1.0; // long dusk shadows in the barn
    ctx.fillStyle = 'rgba(20,12,6,' + (0.30 * s).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(x + (G.zone === 1 ? 14 : 0), GROUND_Y + 8, rxBase * s * stretch, 6.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function glow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,160,60,' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const mhash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  // Barn window light shafts: warm slanted wedges falling from the high
  // windows, spaced with the wall posts (330 px world period, 0.5x layer),
  // each landing in a soft pool on the floor.
  function drawBarnShafts() {
    const off = (G.scroll * 0.5) % 330;
    for (let x = -off - 60; x < W + 200; x += 330) {
      ctx.fillStyle = 'rgba(255,196,110,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, 96); ctx.lineTo(x + 54, 96);
      ctx.lineTo(x + 190, GROUND_Y); ctx.lineTo(x + 96, GROUND_Y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,214,140,0.13)';
      ctx.beginPath();
      ctx.ellipse(x + 142, GROUND_Y - 2, 74, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Warm pool of light on the floor under a practical (oven/lantern).
  function glowPool(x, y, rx, ry, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
    g.addColorStop(0, 'rgba(255,170,80,' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  // Film grain: one pre-rendered noise tile, pattern-filled at 5% overlay
  // with a fixed offset — breaks the flat digital look at zero per-frame
  // generation cost.
  let grainPat = null;
  function drawGrain() {
    if (!grainPat) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g2 = c.getContext('2d');
      const img = g2.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g2.putImageData(img, 0, 0);
      grainPat = ctx.createPattern(c, 'repeat');
    }
    if (!grainPat) return;
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    ctx.translate(37, 53);
    ctx.fillStyle = grainPat;
    ctx.fillRect(-37, -53, W + 74, H + 106);
    ctx.restore();
  }
  function applyPost(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgbStr(gradeCur.mul);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = gradeCur.overA;
    ctx.fillStyle = rgbStr(gradeCur.over);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    if (G.zone === 1) drawBarnShafts();
    if (G.zone === 2) {
      for (const gx of World.ovenGlowPositions(G.scroll)) {
        glow(gx, GROUND_Y - 78, 100, 0.30);
        glowPool(gx, GROUND_Y + 26, 120, 26, 0.20); // light pools on the tiles
      }
    }
    if (G.zone === 3) {
      // Dawn god rays slanting through the tree line…
      ctx.fillStyle = 'rgba(255,226,170,0.07)';
      for (let i = 0; i < 4; i++) {
        const rx = ((i * 347 + 120 - G.scroll * 0.06) % (W + 300) + W + 300) % (W + 300) - 150;
        ctx.beginPath();
        ctx.moveTo(rx, 0); ctx.lineTo(rx + 60, 0);
        ctx.lineTo(rx + 210, GROUND_Y); ctx.lineTo(rx + 90, GROUND_Y);
        ctx.closePath(); ctx.fill();
      }
      // …and drifting seeds/fireflies catching that light.
      ctx.fillStyle = 'rgba(255,240,200,1)';
      for (let i = 0; i < 22; i++) {
        let mx = (mhash(i * 7 + 1) * (W + 80) + Math.sin(G.time * 0.4 + i * 1.7) * 14 - G.scroll * 0.05) % (W + 40);
        if (mx < 0) mx += W + 40;
        const my = 120 + mhash(i * 13 + 2) * 380 + Math.sin(G.time * 0.6 + i * 2.3) * 10;
        ctx.globalAlpha = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(G.time * 1.3 + i * 2.1));
        ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const gl of Obstacles.flameGlows(ents, G.scroll, t)) glow(gl.x, gl.y, gl.r, gl.a);
    ctx.restore();
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.88);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,' + gradeCur.vig.toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    drawGrain();
  }

  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.32);
    ctx.bezierCurveTo(x, y, x - s * 0.52, y - s * 0.3, x - s * 0.52, y + s * 0.08);
    ctx.bezierCurveTo(x - s * 0.52, y + s * 0.48, x, y + s * 0.62, x, y + s * 0.98);
    ctx.bezierCurveTo(x, y + s * 0.62, x + s * 0.52, y + s * 0.48, x + s * 0.52, y + s * 0.08);
    ctx.bezierCurveTo(x + s * 0.52, y - s * 0.3, x, y, x, y + s * 0.32);
    ctx.closePath();
  }
  function bar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1.5, y + 1.5, Math.max(0, (w - 3) * Math.max(0, Math.min(1, frac))), h - 3);
  }
  function drawHUD() {
    // progress bar with zone ticks
    ctx.fillStyle = 'rgba(10,6,3,0.5)';
    ctx.fillRect(0, 0, W, 9);
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(0, 0, W * Math.min(1, G.distM / TOTAL_M), 9);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const zm of [800, 1600, 2400]) ctx.fillRect((zm / TOTAL_M) * W - 1, 0, 2, 9);
    // left panel: score / hearts / distance / zone
    ctx.fillStyle = 'rgba(20,12,6,0.55)';
    ctx.fillRect(16, 18, 330, 94);
    ctx.fillStyle = '#fff7e8';
    ctx.font = 'bold 23px ui-monospace, Menlo, monospace';
    ctx.fillText('SCORE ' + String(Math.floor(G.score)).padStart(6, '0'), 30, 48);
    for (let i = 0; i < 3; i++) {
      heartPath(42 + i * 30, 62, 21);
      if (i < G.hearts) { ctx.fillStyle = '#e74c3c'; ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.6; ctx.stroke(); }
    }
    ctx.fillStyle = '#fff7e8';
    ctx.font = 'bold 17px ui-monospace, Menlo, monospace';
    ctx.fillText(Math.floor(G.distM) + ' / ' + TOTAL_M + ' m', 138, 80);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillText(World.ZONE_INFO[G.zone].name, 30, 102);
    // right panel: farmer proximity + dash stamina
    ctx.fillStyle = 'rgba(20,12,6,0.55)';
    ctx.fillRect(W - 346, 18, 330, 94);
    ctx.fillStyle = '#fff7e8';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillText('FARMER', W - 332, 40);
    const prox = G.proximity / 100;
    const proxColor = prox > 0.75 ? '#e74c3c' : prox > 0.45 ? '#f39c12' : '#2ecc71';
    bar(W - 252, 28, 218, 14, prox, proxColor);
    if (prox > 0.75 && Math.floor(G.time * 4) % 2 === 0) {
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
      ctx.fillText('!', W - 26, 41);
    }
    ctx.fillStyle = '#fff7e8';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillText('DASH', W - 332, 66);
    bar(W - 252, 54, 218, 14, player.stamina / 100,
        player.stamina >= Player.CONSTS.DASH_COST ? '#7ec3ee' : 'rgba(126,195,238,0.4)');
    ctx.fillStyle = 'rgba(255,247,232,0.75)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText('SPACE jump×2 · ↓ slide/hide · SHIFT dash', W - 332, 102);
    if (AudioFX.muted) {
      ctx.fillStyle = '#ffd98a';
      ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
      ctx.fillText('MUTED', W - 76, H - 16);
    }
  }
  // Speech bubble over the farmer (or the dog) — in-world story delivery.
  function drawBubble() {
    if (!G.bubble) return;
    const isDog = G.bubble.who === 'dog';
    const bx = isDog ? G.dogX : G.farmerX;
    if (bx < -80) return;
    const by = GROUND_Y - 218;
    ctx.save();
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    const bw = ctx.measureText(G.bubble.text).width + 26, bh = 34;
    const x0 = Math.max(8, Math.min(W - bw - 8, bx + 30 - bw / 2));
    ctx.fillStyle = 'rgba(253,246,227,0.96)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, by - bh, bw, bh, 9); else ctx.rect(x0, by - bh, bw, bh);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + 22, by - 2); ctx.lineTo(bx + 34, by - 2); ctx.lineTo(bx + 28, by + 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#33241a';
    ctx.textAlign = 'center';
    ctx.fillText(G.bubble.text, x0 + bw / 2, by - bh + 23);
    ctx.restore();
  }
  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px ui-monospace, Menlo, monospace';
    for (const p of G.popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.45));
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x - G.scroll, p.y);
    }
    ctx.restore();
  }
  function drawBanner() {
    if (G.bannerT <= 0) return;
    const info = World.ZONE_INFO[G.bannerZone || 0];
    const a = Math.min(1, G.bannerT / 0.5, (2.4 - G.bannerT) / 0.4 + 0.15);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = 'rgba(16,9,4,0.5)';
    ctx.fillRect(0, 168, W, 108);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf5e';
    ctx.font = '900 52px Georgia, serif';
    ctx.fillText(info.name, W / 2, 224);
    ctx.fillStyle = '#fff7e8';
    ctx.font = '19px ui-monospace, Menlo, monospace';
    ctx.fillText(info.sub, W / 2, 256);
    ctx.restore();
  }
  function drawMenuOverlay(t) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(24,12,4,0.44)');
    g.addColorStop(0.55, 'rgba(24,12,4,0.16)');
    g.addColorStop(1, 'rgba(24,12,4,0.48)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fdf3d8';
    ctx.font = '900 92px Georgia, "Times New Roman", serif';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowOffsetY = 5;
    ctx.fillText('LAST BIRD OUT', W / 2, 196);
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#ffcf5e';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText("A  T U R K E Y ' S   G R E A T   E S C A P E", W / 2, 238);
    ctx.fillStyle = '#fff7e8';
    ctx.font = '20px ui-monospace, Menlo, monospace';
    ctx.fillText("Tonight's menu board says it plainly: MAIN COURSE — TURKEY.", W / 2, 288);
    ctx.fillText('Out back, the farmer is sharpening something. It is not a pencil.', W / 2, 316);
    ctx.fillText('The Whispering Woods are 3,000 m away. Run.', W / 2, 344);
    ctx.font = '19px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('SPACE / CLICK — jump · press again mid-air to double jump', W / 2, 392);
    ctx.fillText('DOWN — slide under knives · hold DOWN in a flagged haystack to HIDE', W / 2, 422);
    ctx.fillText('SHIFT — dash (smashes fences) · P pause · M mute · R restart', W / 2, 452);
    if (Math.floor(t * 1.6) % 2 === 0) {
      ctx.fillStyle = '#ffdf6b';
      ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
      ctx.fillText('PRESS SPACE', W / 2, 528);
    }
    if (best.score > 0) {
      ctx.fillStyle = 'rgba(255,233,176,0.85)';
      ctx.font = '15px ui-monospace, Menlo, monospace';
      ctx.fillText('BEST  ' + best.score + ' pts · ' + best.dist + ' m', W / 2, 566);
    }
    ctx.restore();
  }
  function panel(title, titleColor, lines, foot) {
    ctx.save();
    ctx.fillStyle = 'rgba(14,8,4,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = titleColor;
    ctx.font = '900 84px Georgia, serif';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetY = 5;
    ctx.fillText(title, W / 2, 268);
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#fff7e8';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, 330 + i * 32));
    ctx.fillStyle = '#ffdf6b';
    ctx.font = 'bold 24px ui-monospace, Menlo, monospace';
    ctx.fillText(foot, W / 2, 330 + lines.length * 32 + 38);
    ctx.restore();
  }
  const CAUGHT_LINES = [
    'Somewhere, an oven is already preheating…',
    'He got him right at the fence line. So close.',
    'The dog is doing a victory lap around the yard.',
  ];
  function drawCaughtOverlay() {
    panel('CAUGHT!', '#e74c3c', [
      'The farmer scoops the turkey up under one arm.',
      CAUGHT_LINES[G.caughtIdx % 3],
      '',
      'Score ' + Math.floor(G.score) + '  ·  Distance ' + Math.floor(G.distM) + ' m',
    ], 'PRESS R TO RUN AGAIN');
  }
  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }
  function drawWinOverlay() {
    panel('FREE!', '#2ecc71', [
      'The turkey bursts through the tree line into the Whispering Woods.',
      'No farmer. No dog. No oven. Just dawn — and the whole flock, waiting.',
      'The woods remember a bird who ran.',
      '',
      'Final score ' + Math.floor(G.score) + '  ·  3,000 m',
      'Time ' + fmtTime(G.runTime) + '  ·  Corn ' + G.corn + '  ·  Hits ' + G.hitsTaken,
    ], 'PRESS R TO RUN AGAIN');
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    if (HERO) { // camera: 2x zoom centred on the running turkey
      ctx.save();
      ctx.translate(W / 2, H * 0.60);
      ctx.scale(2, 2);
      ctx.translate(-PLAYER_X, -(GROUND_Y - 24));
    }
    ctx.save();
    if (G.trauma > 0.001) {
      const s = G.trauma * G.trauma;
      ctx.translate((Math.random() * 2 - 1) * 15 * s, (Math.random() * 2 - 1) * 11 * s);
      ctx.translate(W / 2, H / 2);
      ctx.rotate((Math.random() * 2 - 1) * 0.018 * s);
      ctx.translate(-W / 2, -H / 2);
    }
    // PASS 1-2: sky + parallax + ground
    World.draw(ctx, G.scroll, t, G.distM);
    // PASS 3: world props
    Obstacles.drawMain(ctx, ents, G.scroll, t, G.zone);
    // contact shadows
    contactShadow(G.farmerX, GROUND_Y + 2, 30);
    if (G.dogX > -60) contactShadow(G.dogX, GROUND_Y + 2, 30);
    contactShadow(PLAYER_X, player.y + 48, 46);
    // PASS 4: characters
    Farmer.draw(ctx, G.farmerX, GROUND_Y + 2, G.farmerPhase, t, G.zone);
    if (G.dogX > -60) Dog.draw(ctx, G.dogX, GROUND_Y + 2, G.dogPhase, t);
    if (G.state === 'caught') {
      // scooped up under the farmer's arm
      ctx.save();
      ctx.translate(PLAYER_X - 88, GROUND_Y - 118);
      ctx.rotate(-0.55);
      Turkey.draw(ctx, { x: 0, y: 0, t, phase: 0.4, mode: 'jump', squash: 0.3, stretch: 0,
                         blink: 0.5, wingFlap: 0.5, airTilt: 0, lean: -0.3, legAmp: 0.2 });
      ctx.restore();
    } else {
      ctx.save();
      if (player.invincibleT > 0.2 && G.state === 'play' && G.chiliT <= 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha = 0.45;
      Turkey.draw(ctx, buildPose(t));
      ctx.restore();
    }
    // haystacks draw over the turkey (that's what hiding means)
    Obstacles.drawStacks(ctx, ents, G.scroll, t);
    if (G.state === 'win') {
      // the flock, waiting in the tree line — plain dark silhouettes
      ctx.fillStyle = 'rgba(24,20,14,0.85)';
      for (const spec of [[180, 0.9], [248, 0.7], [316, 1.05]]) {
        const bx = W - spec[0], s = spec[1], by = GROUND_Y + 4;
        ctx.beginPath(); ctx.ellipse(bx, by - 26 * s, 30 * s, 22 * s, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 26 * s, by - 44 * s, 10 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx - 24 * s, by - 30 * s);
        ctx.lineTo(bx - 46 * s, by - 52 * s); ctx.lineTo(bx - 40 * s, by - 24 * s);
        ctx.lineTo(bx - 50 * s, by - 34 * s); ctx.lineTo(bx - 28 * s, by - 16 * s);
        ctx.closePath(); ctx.fill();
      }
    }
    drawBubble();
    drawPopups();
    // PASS 5: particles
    Particles.draw(ctx);
    ctx.restore();
    // PASS 6: post (grade + practical glows + vignette)
    applyPost(t);
    if (HERO) ctx.restore();
    // PASS 7: HUD + overlays (skipped in hero framing — art QA only)
    if (!HERO && G.state !== 'menu') drawHUD();
    if (G.state === 'play') drawBanner();
    if (G.state === 'menu') drawMenuOverlay(t);
    if (G.state === 'pause') panel('PAUSED', '#fdf3d8', [
      'The turkey holds its breath.',
      '',
      'SPACE jump ×2 · ↓ slide / hide in flagged haystacks',
      'SHIFT dash through fences · P resume · R restart · M mute',
    ], 'P — resume');
    if (G.state === 'caught') drawCaughtOverlay();
    if (G.state === 'win') drawWinOverlay();
  }

  // ---------------- screenshot mode ----------------
  function setupShot(name) {
    document.title = 'SHOT:' + name;
    if (name === 'run' || name === 'kitchen' || name === 'hero' || name === 'barn') G.state = 'play';
    if (name === 'run' || name === 'hero') {
      const fence = ents.find((e) => e.type === 'fence');
      let scrollPx = Math.max(0, fence.x - 780);
      if (name === 'run') {
        // Frame the new set dressing: a windmill on the right third with a
        // fence in the turkey's path. Scan scrolls until both are in frame.
        for (let s = 0; s <= 700 * PX_PER_M; s += 40) {
          const wm = World.windmillXs(s).find((p) => p.x >= 830 && p.x <= 1120);
          if (!wm) continue;
          const f2 = ents.find((e) => e.type === 'fence' && e.x - s >= 560 && e.x - s <= 900);
          if (f2) { scrollPx = s; break; }
        }
      }
      G.scroll = scrollPx;
      G.distM = G.scroll / PX_PER_M;
      G.zone = World.zoneAt(G.distM);
      G.score = 612; G.proximity = 32;
      player.phase = 0.85; player.mode = 'run';
      blend.lean = 0.05; blend.legAmp = 1;
      G.tailLag = -0.07; // fan trailing mid-stride
      const gap = 330 + (76 - 330) * 0.32;
      G.farmerX = PLAYER_X - gap;
      G.farmerPhase = 0.8;
      for (let i = 0; i < 9; i++) {
        Particles.emit('dust', PLAYER_X - 34 - i * 17, GROUND_Y - 2 - (i % 3) * 3, 1, {});
      }
      Particles.update(0.16);
    } else if (name === 'barn') {
      const beam = ents.find((e) => e.type === 'beam');
      G.scroll = Math.max(0, beam.x - 700);
      G.distM = G.scroll / PX_PER_M;
      G.zone = 1;
      G.score = 2740; G.proximity = 48; G.hearts = 3;
      player.phase = 0.85; player.mode = 'run';
      blend.lean = 0.05; blend.legAmp = 1;
      G.tailLag = -0.07;
      const gap = 330 + (76 - 330) * 0.48;
      G.farmerX = PLAYER_X - gap;
      G.farmerPhase = 0.8;
      G.dogX = PLAYER_X - gap * 0.55 - 30;
      G.dogPhase = 1.1;
      G.bubble = { text: "I've let the dog loose!", dur: 99 }; // frozen for the shot
      for (let i = 0; i < 8; i++) {
        Particles.emit('dust', PLAYER_X - 34 - i * 17, GROUND_Y - 2 - (i % 3) * 3, 1, { rgb: [198, 160, 104] });
      }
      Particles.update(0.16);
    } else if (name === 'kitchen') {
      // Frame the TONIGHT'S MENU board, already behind the turkey — so the
      // red chalk cross-out and ESCAPED! are showing.
      const board = ents.find((e) => e.type === 'menuboard');
      G.scroll = Math.max(0, board.x + board.w - 330);
      G.distM = G.scroll / PX_PER_M;
      G.zone = 2;
      G.score = 5310; G.proximity = 55; G.hearts = 2;
      player.mode = 'slide'; player.slideT = 0.3; player.y = player.slideY;
      blend.lean = -0.38; blend.legAmp = 0.3;
      const gap = 330 + (76 - 330) * 0.55;
      G.farmerX = 64; // clear of the menu board so the cross-out reads
      G.farmerPhase = 0.8;
      G.dogX = PLAYER_X - gap * 0.55 - 30;
      G.dogPhase = 1.1;
      for (let i = 0; i < 7; i++) Particles.emit('dust', PLAYER_X - 52 - i * 15, GROUND_Y - 1 - (i % 2) * 3, 1, {});
      const ovens = World.ovenGlowPositions(G.scroll).filter((x) => x > 0 && x < W);
      if (ovens.length) Particles.ovenSparks(ovens[0], GROUND_Y - 66, 7);
      Particles.update(0.12);
    } else if (name === 'caught') {
      G.state = 'caught';
      G.caughtIdx = 0; // always the oven-preheating line in the shot
      G.scroll = 812 * PX_PER_M;
      G.distM = 812; G.zone = 1;
      G.score = 2410; G.hearts = 0; G.proximity = 100;
      G.farmerX = PLAYER_X - 150;
      G.farmerPhase = 0.3;
      G.dogX = PLAYER_X - 210;
      G.dogPhase = 0.6;
    } else if (name === 'win') {
      G.state = 'win'; G.stateT = 1.0;
      G.scroll = 2952 * PX_PER_M;
      G.distM = 2952; G.zone = 3;
      G.score = 9840; G.hearts = 2; G.proximity = 12;
      G.corn = 23; G.hitsTaken = 1; G.runTime = 97;
      player.phase = 0.85; player.mode = 'run';
      blend.lean = 0.05; blend.legAmp = 1;
      G.farmerX = -400; G.dogX = -300; // long gone
      Particles.confetti(PLAYER_X + 60, GROUND_Y - 170, 40);
      Particles.update(0.3);
    } else { // menu
      G.state = 'menu';
      G.scroll = 2400;
      G.distM = G.scroll / PX_PER_M;
      player.phase = 0.85; player.mode = 'run';
      G.farmerX = PLAYER_X - 208;
      G.farmerPhase = 0.8;
    }
    gradeCur = cloneGrade(GRADES[G.zone]);
    render(1.35);
  }

  // ---------------- boot ----------------
  window.__game = {
    get state() { return G.state; },
    get distM() { return G.distM; },
    get zone() { return G.zone; },
    get hearts() { return G.hearts; },
    get proximity() { return G.proximity; },
    get score() { return G.score; },
    get bot() { return BOT; },
    get runTime() { return G.runTime; },
    get corn() { return G.corn; },
    get hits() { return G.hitsTaken; },
    get hitLog() { return G.hitLog; },
    errors,
  };

  if (SHOT) {
    setupShot(SHOT);
    // Shot mode renders once, synchronously — before the backdrop plates
    // have loaded, so that first frame falls back to vector. Re-render as
    // the plates arrive so captures show the real (plated) look.
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (World.platesReady() || tries > 40) { render(1.35); clearInterval(iv); }
    }, 100);
  } else {
    if (AUTOPLAY) reset(true);
    let last = performance.now();
    function frame(nowMs) {
      let dt = Math.min(0.033, (nowMs - last) / 1000 || 0.016);
      last = nowMs;
      const t = nowMs / 1000;
      if (Input.take('mute')) AudioFX.toggleMute();
      if (G.state === 'play' && G.hitStop > 0) {
        G.hitStop -= dt;             // hit-stop: world freezes, render continues
        render(t);
        requestAnimationFrame(frame);
        return;
      }
      if (G.state === 'menu') updateMenu(dt);
      else if (G.state === 'play') {
        if (AUTOPLAY) { if (BOT === 'standard') driveStandard(); else driveAutoplay(); }
        updatePlay(dt);
      } else if (G.state === 'pause') {
        if (Input.take('pause')) G.state = 'play';
        if (Input.take('restart')) reset(true);
      } else updateEnd(dt);
      Particles.update(dt);
      G.trauma = Math.max(0, G.trauma - dt * 1.7);
      if (G.bannerT > 0) G.bannerT -= dt;
      updateGrade(dt);
      render(t);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
