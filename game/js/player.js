// player.js — turkey physics & state machine.
//
// Jump tuning is DERIVED from two targets, not magic numbers:
//   target apex height  H = 120 px
//   target time-to-apex T = 0.38 s
//   rise gravity  g = 2H / T^2 = 240 / 0.1444  ≈ 1662 px/s^2
//   launch speed  v = g * T    = 2H / T        ≈  632 px/s
// Feel modifiers layered on top:
//   fall gravity  = 1.7 * g          (snappy descent)
//   apex band     |vy| < 110 -> g*0.5 (hang time at the top)
//   jump cut      releasing jump while rising multiplies vy by 0.45 (once)
//   coyote time   0.10 s after leaving the ground
//   jump buffer   a press up to 0.12 s before landing still fires
// Dash: SHIFT, costs 35 stamina, 0.28 s, handled here; the speed multiplier
// itself is applied by main (it owns world scroll). Stamina regens at
// 15/s after a 0.45 s delay since the last dash.
// Hide: main tells us when the turkey is inside a haystack with DOWN held;
// the player then crouches (mode 'hide'), can't jump/slide/dash.
'use strict';
const Player = (() => {
  const H = 120, T = 0.38;
  const G_RISE = 2 * H / (T * T);        // ≈1662
  const V_JUMP = 2 * H / T;              // ≈632
  const G_FALL = G_RISE * 1.7;
  const APEX_BAND = 110, APEX_FACTOR = 0.5;
  const JUMP_CUT = 0.45;
  const COYOTE = 0.10, BUFFER = 0.12;
  const SLIDE_TIME = 0.5;
  const DASH_TIME = 0.28, DASH_COST = 35, STAMINA_MAX = 100;
  const STAMINA_REGEN = 15, REGEN_DELAY = 0.45;

  function create(groundY) {
    return {
      restY: groundY - 47,        // body-centre height standing (feet at +48)
      slideY: groundY - 30,       // body-centre height while sliding
      hideY: groundY - 34,        // body-centre height crouched in hay
      y: groundY - 47, vy: 0,
      grounded: true, coyote: 0, jumps: 0, cutApplied: true,
      slideT: 0, squashT: 0, squashDur: 0.1, squashPower: 1,
      stretchT: 0, phase: 0, mode: 'run', lastJumpWasDouble: false,
      stamina: STAMINA_MAX, dashT: 0, regenDelay: 0,
      hiding: false, invincibleT: 0, stumbleT: 0,
    };
  }

  // events: { jump(), doubleJump(), land(impactSpeed), slideStart(), dash() }
  // opts:   { hiding: bool }
  function update(p, dt, speed, events, opts) {
    const now = performance.now() / 1000;
    const hiding = !!(opts && opts.hiding) && p.grounded;
    p.hiding = hiding;

    // --- timers ---
    if (!p.grounded) p.coyote -= dt;
    if (p.slideT > 0) p.slideT -= dt;
    if (p.squashT > 0) p.squashT -= dt;
    if (p.stretchT > 0) p.stretchT -= dt;
    if (p.dashT > 0) p.dashT -= dt;
    if (p.invincibleT > 0) p.invincibleT -= dt;
    if (p.stumbleT > 0) p.stumbleT -= dt;
    if (p.regenDelay > 0) p.regenDelay -= dt;
    else if (p.dashT <= 0) p.stamina = Math.min(STAMINA_MAX, p.stamina + STAMINA_REGEN * dt);

    // --- dash start ---
    const dashAge = now - Input.dashPressedAt;
    if (dashAge <= 0.15 && !hiding && p.dashT <= 0 && p.stamina >= DASH_COST) {
      p.dashT = DASH_TIME;
      p.stamina -= DASH_COST;
      p.regenDelay = REGEN_DELAY;
      p.slideT = 0;
      Input.consumeDashPress();
      events.dash();
    }

    // --- slide start (ground only, not while hiding) ---
    if (Input.down && p.grounded && p.slideT <= 0 && !hiding && p.dashT <= 0) {
      p.slideT = SLIDE_TIME;
      events.slideStart();
    }

    // --- jumping (with buffer + coyote + double jump) ---
    const pressAge = now - Input.jumpPressedAt;
    if (pressAge <= BUFFER && !hiding) {
      const canGroundJump = p.grounded || p.coyote > 0;
      if (canGroundJump) {
        doJump(p, false);
        Input.consumeJumpPress();
        events.jump();
      } else if (p.jumps === 1) {
        doJump(p, true);
        Input.consumeJumpPress();
        events.doubleJump();
      }
    }

    // --- variable jump height: early release cuts the rise ---
    const relAge = now - Input.jumpReleasedAt;
    if (relAge < 0.05 && !p.cutApplied && p.vy < 0) {
      p.vy *= JUMP_CUT;
      p.cutApplied = true;
      Input.consumeJumpRelease();
    }

    // --- gravity (rise / fall / apex band) ---
    if (!p.grounded) {
      let g = p.vy < 0 ? G_RISE : G_FALL;
      if (Math.abs(p.vy) < APEX_BAND) g *= APEX_FACTOR;
      p.vy += g * dt;
      p.y += p.vy * dt;

      if (p.y >= p.restY) {           // landed
        const impact = p.vy;
        p.y = p.restY; p.vy = 0; p.grounded = true; p.jumps = 0;
        p.squashDur = impact > 800 ? 0.13 : 0.1;
        p.squashT = p.squashDur;
        p.squashPower = Math.min(1.4, 0.6 + impact / 900);
        events.land(impact);
      }
    }

    // --- run cycle: leg frequency proportional to speed ---
    if (p.grounded && p.slideT <= 0 && !hiding) p.phase += dt * speed * 0.058;
    else if (!p.grounded) p.phase += dt * 3.2; // legs settle while airborne
    else if (hiding) p.phase += dt * 1.2;      // nervous shuffle in the hay

    // --- mode for drawing ---
    if (!p.grounded) p.mode = 'jump';
    else if (hiding) p.mode = 'hide';
    else if (p.dashT > 0) p.mode = 'dash';
    else if (p.slideT > 0) p.mode = 'slide';
    else p.mode = 'run';
    // body height eases toward the mode's target while grounded
    const targetY = !p.grounded ? p.y
      : hiding ? p.hideY
      : (p.slideT > 0 ? p.slideY : p.restY);
    if (p.grounded) p.y += (targetY - p.y) * Math.min(1, dt * 18);
    return p;
  }

  function doJump(p, isDouble) {
    p.vy = isDouble ? -V_JUMP * 0.94 : -V_JUMP;
    p.grounded = false;
    p.coyote = 0;
    p.jumps = isDouble ? 2 : 1;
    p.cutApplied = false;
    p.slideT = 0;
    p.dashT = 0;
    p.stretchT = 0.09;
    p.lastJumpWasDouble = isDouble;
  }

  // Pose helpers for the renderer.
  function squashAmount(p) {
    if (p.squashT <= 0) return 0;
    const t = 1 - p.squashT / p.squashDur;         // 0..1 over the squash
    return Math.sin(t * Math.PI) * p.squashPower;  // ease in-out bump
  }
  function stretchAmount(p) {
    if (p.stretchT <= 0) return 0;
    return (p.stretchT / 0.09);
  }
  function stateLabel(p) {
    if (!p.grounded) return p.jumps >= 2 ? 'DOUBLE JUMP' : 'JUMP';
    if (p.hiding) return 'HIDDEN';
    if (p.dashT > 0) return 'DASH';
    if (p.squashT > 0) return 'LAND SQUASH';
    if (p.slideT > 0) return 'SLIDE';
    return 'RUN';
  }
  return { create, update, squashAmount, stretchAmount, stateLabel,
           CONSTS: { G_RISE, V_JUMP, G_FALL, H, T, DASH_COST, STAMINA_MAX } };
})();
