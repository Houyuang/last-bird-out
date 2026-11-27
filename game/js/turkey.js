// turkey.js — THE HERO ASSET. The turkey, drawn entirely with vector shapes
// in a local coordinate space. Origin = body centre, +x = facing direction
// (right), ground contact is about +48px below origin at rest.
//
// SOP stage 3.4 character pipeline, full treatment:
//   silhouette  — fuller breast, tapered tail junction, head held proud
//   plumage     — scalloped feather rows clipped to the body (lighter on the
//                 back, darker toward the belly) with a restrained
//                 bronze-green iridescent band; wing = 3 separated feather
//                 layers; tail fan = 8 individually three-toned feathers,
//                 each with a pale tip band + iridescent sheen band
//   head        — outlined eye with highlight, two-tone beak with ridge,
//                 snood over the beak, two-tone wattle that sways with speed,
//                 subtle cheek patch
//   legs        — jointed, scaly segment hints, three-toed feet
//   light       — unified three-tone model (materials.js) + an optional warm
//                 rim on the back (pose.rimWarm, dawn Woods grade)
//   secondary   — tail fan rides a spring (pose.tailLag, driven by main from
//                 acceleration/landing), wattle swing (pose.wattleSwing),
//                 wing flutter on double jump (pose.wingFlap)
// Pose fields (all optional except x/y/t/phase/mode):
//   squash, stretch, blink, airTilt, lean, legAmp,
//   tailLag, wattleSwing, rimWarm, wingFlap
'use strict';
const Turkey = (() => {
  const BODY = '#8a5a2b', ORANGE = '#e8912d', ORANGE_LT = '#f2a541',
        ORANGE_DK = '#c97a1f', RED = '#c0392b', RED_DK = '#96281f';

  // ---- tiny color helpers (hex -> rgba string / lerp between MAT tones) ----
  function rgbOf(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function mixHex(a, b, k) {
    const ca = rgbOf(a), cb = rgbOf(b);
    return 'rgb(' + Math.round(ca[0] + (cb[0] - ca[0]) * k) + ',' +
                    Math.round(ca[1] + (cb[1] - ca[1]) * k) + ',' +
                    Math.round(ca[2] + (cb[2] - ca[2]) * k) + ')';
  }

  // ---- body silhouette path (fuller breast, tapered tail junction) ----
  function bodyPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-40, -8);                                        // tail junction
    ctx.bezierCurveTo(-43, -25, -18, -31, 6, -30);              // back
    ctx.bezierCurveTo(27, -29, 41, -21, 45, -5);                // proud breast, top
    ctx.bezierCurveTo(48, 10, 39, 25, 20, 30);                  // full breast, lower
    ctx.bezierCurveTo(0, 35, -25, 33, -37, 20);                 // belly
    ctx.bezierCurveTo(-45, 12, -43, 3, -40, -8);                // tapered junction
    ctx.closePath();
  }
  // approximate half-width of the body at height y (for plumage layout)
  function bodyHalfW(y) {
    const k = 1 - Math.pow(y / 34, 2);
    return k <= 0 ? 0 : 45 * Math.sqrt(k);
  }

  // ---- scalloped plumage rows, clipped to the body ----
  function drawPlumage(ctx) {
    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    const ROW = 8.5, R = 9;
    for (let row = 0; row < 7; row++) {
      const y = -24 + row * ROW;
      const t = row / 6;                       // 0 = back, 1 = belly
      // lighter on the back, base mid-body, darker toward the belly
      const tone = t < 0.45
        ? mixHex(MAT.turkeyBody.light, MAT.turkeyBody.base, t / 0.45)
        : mixHex(MAT.turkeyBody.base, MAT.turkeyBody.shade, (t - 0.45) / 0.55);
      const hw = bodyHalfW(y + 4);
      const off = (row % 2) * 7;               // brick-offset the scallops
      let i = 0;
      for (let x = -hw - 6 + off; x < hw + 4; x += 13.5, i++) {
        const jx = x + Math.sin(row * 41.3 + i * 19.7) * 1.7; // jitter kills the grid
        ctx.beginPath();
        ctx.arc(jx + 2, y, R, 0, Math.PI);      // scallop: half-disc hanging down
        ctx.fillStyle = tone;
        ctx.fill();
        // iridescent sheen on the mid-body rows, following the scallop shape
        if (row === 3 || row === 4) {
          ctx.fillStyle = (i + row) % 2 === 0 ? 'rgba(96,158,110,0.20)' : 'rgba(196,132,66,0.17)';
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(56,32,12,0.20)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // soft volume masses over the rows (same trick as Shade.ellipse3)
    ctx.fillStyle = MAT.turkeyBody.shade;
    ctx.globalAlpha = 0.30;
    ctx.beginPath(); ctx.ellipse(-14, 16, 42, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = MAT.turkeyBody.light;
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.ellipse(18, -18, 30, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // body outline + a darker belly line for separation
    bodyPath(ctx);
    ctx.strokeStyle = 'rgba(56,32,12,0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // ---- one tail feather, in a rotated frame pointing +x ----
  function tailFeather(ctx, len, wid, toneA, toneB) {
    // shaft body: three-toned elongated ellipse
    ctx.fillStyle = toneA;
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, wid, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = toneB;
    ctx.beginPath(); ctx.ellipse(len / 2 - 3, wid * 0.34, len / 2 - 4, wid * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    // iridescent sheen band (bronze, then green) just behind the tip
    ctx.fillStyle = 'rgba(205,145,75,0.5)';
    ctx.beginPath(); ctx.ellipse(len * 0.78, 0, 4.6, wid * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(96,168,118,0.45)';
    ctx.beginPath(); ctx.ellipse(len * 0.86, 0, 3.6, wid * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    // pale tip band
    ctx.fillStyle = MAT.turkeyBody.light;
    ctx.beginPath(); ctx.ellipse(len * 0.95, 0, len * 0.07, wid * 0.88, 0, 0, Math.PI * 2); ctx.fill();
    // central shaft
    ctx.strokeStyle = 'rgba(56,32,12,0.4)';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len - 3, 0); ctx.stroke();
  }

  // ---- one wing feather (tapered), pointing +x in local frame ----
  function wingFeather(ctx, len, wid, mat) {
    ctx.fillStyle = mat.base;
    ctx.beginPath();
    ctx.moveTo(0, -wid / 2);
    ctx.quadraticCurveTo(len * 0.7, -wid / 2, len, 0);
    ctx.quadraticCurveTo(len * 0.7, wid / 2, 0, wid / 2);
    ctx.quadraticCurveTo(len * 0.2, 0, 0, -wid / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mat.shade;
    ctx.beginPath();
    ctx.moveTo(2, wid * 0.1);
    ctx.quadraticCurveTo(len * 0.7, wid / 2, len - 2, 0);
    ctx.quadraticCurveTo(len * 0.7, wid / 2 - 1, 2, wid / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = mat.light;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(3, -wid / 2 + 1); ctx.quadraticCurveTo(len * 0.7, -wid / 2 + 1, len - 3, -1); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,22,8,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len - 4, 0); ctx.stroke();
  }

  function leg(ctx, hipX, footX, footY, kneeBend) {
    // Two-segment leg: hip -> knee -> foot, scaly shank, 3-toe foot.
    const kneeX = hipX + kneeBend, kneeY = 26 + (footY - 40) * 0.45;
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, 24);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
    // scaly segment hint: short cross-strokes along the shank
    ctx.strokeStyle = 'rgba(150,85,20,0.65)';
    ctx.lineWidth = 1.4;
    const ang = Math.atan2(footY - kneeY, footX - kneeX) + Math.PI / 2;
    for (const tt of [0.3, 0.52, 0.74]) {
      const px = kneeX + (footX - kneeX) * tt, py = kneeY + (footY - kneeY) * tt;
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(ang) * 3.4, py - Math.sin(ang) * 3.4);
      ctx.lineTo(px + Math.cos(ang) * 3.4, py + Math.sin(ang) * 3.4);
      ctx.stroke();
    }
    // three toes
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(footX, footY);
    ctx.lineTo(footX + 10, footY);
    ctx.moveTo(footX, footY);
    ctx.lineTo(footX + 7, footY - 4);
    ctx.moveTo(footX, footY);
    ctx.lineTo(footX + 5, footY + 3);
    ctx.stroke();
  }

  function draw(ctx, pose) {
    const mode = pose.mode;
    ctx.save();
    ctx.translate(pose.x, pose.y);

    // Squash & stretch (volume-preserving-ish): squash flattens Y, widens X.
    let sx = 1, sy = 1;
    if (pose.squash > 0) { sy -= 0.26 * pose.squash; sx += 0.20 * pose.squash; }
    if (pose.stretch > 0) { sy += 0.16 * pose.stretch; sx -= 0.10 * pose.stretch; }

    let lean = 0.05; // slight forward lean while running
    if (mode === 'jump') lean = -0.10 + (pose.airTilt || 0);
    if (mode === 'slide') lean = -0.38;
    if (mode === 'dash') lean = 0.26;   // nose-down sprint
    if (mode === 'hide') lean = -0.06;  // crouched in the hay
    if (typeof pose.lean === 'number') lean = pose.lean; // animation-blend override from main
    ctx.rotate(lean);
    // Anchor squash/stretch to the ground-contact point (+48) so a landing
    // squash presses DOWN into the ground instead of floating the body up.
    ctx.translate(0, 48 * (1 - sy));
    ctx.scale(sx, sy);

    const phase = pose.phase;
    const sway = Math.sin(phase * 0.5) * 0.07 + Math.sin(pose.t * 1.7) * 0.03;
    const tailLag = pose.tailLag || 0;   // spring-driven secondary motion

    // ---- tail fan: 8 individual feathers, spring-lagged behind the body ----
    // While hiding, the fan tips up above the haystack — the classic tell.
    const fanBase = mode === 'hide' ? -2.95 : -2.55;
    for (let i = 0; i < 8; i++) {
      const fi = i - 3.5;
      const a = fanBase + fi * 0.21 + sway * (1 + Math.abs(fi) * 0.35) + tailLag * (1 + Math.abs(fi) * 0.22);
      ctx.save();
      ctx.translate(-36, -6);
      ctx.rotate(a);
      tailFeather(ctx, 56, 8.6,
        i % 2 === 0 ? MAT.turkeyBody.base : MAT.wing.base,
        i % 2 === 0 ? MAT.turkeyBody.shade : MAT.wing.shade);
      ctx.restore();
    }

    // ---- legs ----
    if (mode === 'run' || mode === 'dash') {
      const amp = pose.legAmp == null ? 1 : pose.legAmp; // blend-space amplitude
      const s1 = Math.sin(phase) * amp, s2 = Math.sin(phase + Math.PI) * amp;
      const lift1 = Math.max(0, Math.sin(phase + Math.PI / 2)) * 13 * amp;
      const lift2 = Math.max(0, Math.sin(phase + Math.PI * 1.5)) * 13 * amp;
      leg(ctx, -10, -10 + s2 * 21, 48 - lift2, 6 + s2 * 5);   // far leg
      leg(ctx, 14, 14 + s1 * 21, 48 - lift1, 6 + s1 * 5);     // near leg
    } else if (mode === 'jump') {
      // tucked: feet folded up under the body
      leg(ctx, -10, 2, 36, 14);
      leg(ctx, 14, 26, 34, 16);
    } else if (mode === 'slide') {
      // both legs reaching forward with a knee bend, feet just off the dirt
      leg(ctx, -6, 32, 42, 12);
      leg(ctx, 12, 46, 37, 10);
    } else if (mode === 'hide') {
      // tucked away in the hay: no legs visible below the straw line
      leg(ctx, -10, 0, 44, 12);
      leg(ctx, 14, 22, 42, 14);
    }

    // ---- body: layered scalloped plumage ----
    drawPlumage(ctx);

    // ---- warm rim on the back (dawn Woods grade; pose.rimWarm 0..1) ----
    // Clipped to the body so the rim hugs the inside of the back edge and
    // can never float outside the silhouette.
    if (pose.rimWarm > 0.02) {
      ctx.save();
      bodyPath(ctx);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,178,104,' + (0.55 * pose.rimWarm).toFixed(3) + ')';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.ellipse(2, -2, 44, 31, 0, -2.75, -0.85);
      ctx.stroke();
      ctx.restore();
    }

    // ---- wing: 3 separated feather layers ----
    const flap = mode === 'jump' ? -0.55 - pose.wingFlap * 0.3
               : mode === 'dash' ? 0.34
               : mode === 'hide' ? 0.1
               : -0.18 + Math.sin(phase) * 0.07;
    const flutter = (mode === 'jump' && pose.wingFlap > 0) ? Math.sin(pose.t * 42) * 0.13 : 0;
    ctx.save();
    ctx.translate(-4, -4);
    ctx.rotate(flap + flutter);
    // layer A (back, longest, darkest)
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(-14 + i * 3, -6 + i * 5.5);
      ctx.rotate(0.62 + i * 0.13);
      wingFeather(ctx, 34, 10.5, { base: MAT.wing.shade, shade: '#46300f', light: MAT.wing.base });
      ctx.restore();
    }
    // layer B (mid)
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(-10 + i * 3, -4 + i * 5);
      ctx.rotate(0.5 + i * 0.12);
      wingFeather(ctx, 29, 10, MAT.wing);
      ctx.restore();
    }
    // layer C (front, shortest, lightest)
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(-6 + i * 3, -2 + i * 4.6);
      ctx.rotate(0.38 + i * 0.11);
      wingFeather(ctx, 23, 9, { base: MAT.wing.light, shade: MAT.wing.base, light: '#c79f5f' });
      ctx.restore();
    }
    ctx.restore();

    // ---- neck + head (held proud) ----
    ctx.save();
    if (mode === 'slide') ctx.translate(7, 17); // duck: head tucks low to pass under blades
    // neck ruff: small scallops where neck meets breast
    ctx.fillStyle = MAT.turkeyBody.shade;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(30 + i * 5, -8 + i * 4, 6.5, 0, Math.PI);
      ctx.fill();
    }
    ctx.strokeStyle = BODY;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(32, -12);
    ctx.quadraticCurveTo(43, -24, 47, -29);
    ctx.stroke();
    // head
    Shade.circle3(ctx, 52, -34, 16.5, MAT.turkeyHead);
    // subtle cheek patch
    ctx.fillStyle = MAT.turkeyHead.light;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(47, -29, 7.5, 5.5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // wattle: two-tone, hangs under the beak, sways with speed
    const wob = pose.wattleSwing || 0;
    ctx.save();
    ctx.translate(57 + wob, -17);
    ctx.rotate(wob * 0.05);
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.ellipse(0, 3, 6, 9.5, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RED_DK;
    ctx.beginPath(); ctx.ellipse(-2.4, 6, 3.6, 6, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0604f';
    ctx.beginPath(); ctx.ellipse(2.4, 0, 2.4, 4.5, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // snood: drapes from the forehead over the beak base
    ctx.save();
    ctx.translate(60, -43);
    ctx.rotate(0.5 + wob * 0.03);
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.ellipse(0, 4, 3.6, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RED_DK;
    ctx.beginPath(); ctx.ellipse(-1.4, 6, 1.8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // beak: two-tone with a ridge line
    ctx.fillStyle = ORANGE_LT;
    ctx.beginPath();
    ctx.moveTo(62, -42);
    ctx.lineTo(85, -33.5);
    ctx.lineTo(62, -27);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ORANGE_DK; // lower mandible
    ctx.beginPath();
    ctx.moveTo(62, -29.5);
    ctx.lineTo(79, -31.5);
    ctx.lineTo(62, -24.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,85,20,0.8)'; // ridge
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(63, -40.5); ctx.lineTo(83, -33.8); ctx.stroke();
    // eye: dark outline, white, pupil, highlight (blink = eyelid scale)
    const blink = Math.max(0, Math.min(1, pose.blink || 0));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(54, -38, 5.6, 5.6 * (1 - blink * 0.85), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1d130a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(54, -38, 5.6, 5.6 * (1 - blink * 0.85), 0, 0, Math.PI * 2);
    ctx.stroke();
    if (blink < 0.7) {
      ctx.fillStyle = '#1d130a';
      ctx.beginPath();
      ctx.arc(55.5, -38, 2.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(56.6, -39.4, 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore(); // head duck
    ctx.restore();
  }
  return { draw };
})();

