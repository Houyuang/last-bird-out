// farmer.js — the chaser: a simple code-drawn farmer who runs at the left
// side of the screen, bobbing and swinging his arms. Origin = ground point
// under his feet; he is ~118px tall.
'use strict';
const Farmer = (() => {
  function draw(ctx, x, groundY, phase, t, zone) {
    const bob = Math.abs(Math.sin(phase)) * 4;
    ctx.save();
    ctx.translate(x, groundY - bob);
    ctx.rotate(0.07); // leaning into the chase

    const s1 = Math.sin(phase), s2 = Math.sin(phase + Math.PI);
    // legs (overalls blue), two-segment with boot feet
    ctx.lineCap = 'round';
    for (const [hipX, s] of [[-6, s2], [7, s1]]) {
      const footX = hipX + s * 17, footY = -2 - Math.max(0, Math.sin(phase + (s === s1 ? 0.6 : Math.PI + 0.6))) * 8;
      ctx.strokeStyle = '#33549e';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(hipX, -52);
      ctx.lineTo(hipX + s * 8, -26);
      ctx.lineTo(footX, footY - 4);
      ctx.stroke();
      ctx.strokeStyle = '#4a3220';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(footX, footY - 4);
      ctx.lineTo(footX + 10, footY - 3);
      ctx.stroke();
    }
    // torso: green plaid shirt (contrasts with the red barns) + overall bib
    Shade.rect3(ctx, -15, -96, 32, 48, MAT.shirt);
    ctx.fillStyle = MAT.overalls.base;
    ctx.fillRect(-11, -78, 24, 30);
    ctx.fillStyle = MAT.overalls.light;
    ctx.fillRect(-11, -78, 24, 2.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -84); ctx.lineTo(17, -84);
    ctx.moveTo(-15, -66); ctx.lineTo(17, -66);
    ctx.stroke();
    if (zone === 2) { // kitchen: butcher's apron over the overalls, strings at the waist
      ctx.fillStyle = '#ddd5bf';
      ctx.fillRect(-12, -82, 26, 36);
      ctx.fillStyle = 'rgba(120,105,80,0.5)';
      ctx.fillRect(-12, -52, 26, 3);           // grime line at the hem
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-12, -82, 26, 2.4);
      ctx.strokeStyle = '#b8ac90';            // neck strap + waist strings
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -96); ctx.lineTo(-9, -82);
      ctx.moveTo(10, -96); ctx.lineTo(11, -82);
      ctx.moveTo(-12, -64); ctx.lineTo(-20, -58);
      ctx.moveTo(14, -64); ctx.lineTo(21, -57);
      ctx.stroke();
    }
    // arms swinging opposite to legs
    ctx.strokeStyle = '#3e7c3f';
    ctx.lineWidth = 8;
    for (const [shX, s] of [[-12, s1], [14, s2]]) {
      ctx.beginPath();
      ctx.moveTo(shX, -90);
      ctx.lineTo(shX + s * 13, -62);
      ctx.stroke();
      ctx.strokeStyle = '#e8b48c';
      ctx.beginPath();
      ctx.moveTo(shX + s * 13, -62);
      ctx.lineTo(shX + s * 17, -52);
      ctx.stroke();
      ctx.strokeStyle = '#3e7c3f';
    }
    // head
    Shade.circle3(ctx, 2, -108, 12.5, MAT.skin);
    // nose bump + cheek shading
    ctx.fillStyle = MAT.skin.shade;
    ctx.beginPath(); ctx.ellipse(12.5, -104, 3.4, 2.6, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(192,141,100,0.45)';
    ctx.beginPath(); ctx.ellipse(6, -101, 5, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    // determined eye + frown
    ctx.fillStyle = '#1d130a';
    ctx.beginPath(); ctx.arc(7, -110, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1d130a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(3, -100); ctx.lineTo(10, -101.5); ctx.stroke();
    // straw hat: brim + crown
    ctx.fillStyle = MAT.strawHat.base;
    ctx.beginPath(); ctx.ellipse(2, -117, 24, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = MAT.strawHat.shade;
    ctx.beginPath(); ctx.ellipse(-6, -116, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
    Shade.ellipse3(ctx, 2, -122, 12.5, 8, MAT.strawHat, 0);
    ctx.fillStyle = '#a33327';
    ctx.fillRect(-10, -122, 24, 4);
    ctx.restore();
  }
  return { draw };
})();
