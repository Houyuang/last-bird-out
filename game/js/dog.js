// dog.js — the farm dog: second chaser from the Barn zone on. Smaller, lower
// and faster-legged than the farmer. Origin = ground point under his feet;
// he is ~52px tall. Drawn entirely in code, like everything else.
'use strict';
const Dog = (() => {
  const COAT = '#c8c2b8', COAT_DARK = '#a89f92', SPOT = '#7a6a55',
        COLLAR = '#c0392b', NOSE = '#241a12';

  function draw(ctx, x, groundY, phase, t) {
    const bob = Math.abs(Math.sin(phase)) * 3;
    ctx.save();
    ctx.translate(x, groundY - bob);
    ctx.rotate(0.05);

    const s1 = Math.sin(phase), s2 = Math.sin(phase + Math.PI);
    // legs: 4, thin, fast trot
    ctx.strokeStyle = COAT_DARK;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    for (const [lx, s] of [[-20, s2], [-13, s1], [14, s1], [21, s2]]) {
      ctx.beginPath();
      ctx.moveTo(lx, -22);
      ctx.lineTo(lx + s * 7, -11);
      ctx.lineTo(lx + s * 12, -1 - Math.max(0, s) * 4);
      ctx.stroke();
    }
    // tail: up and wagging hard — he's having the time of his life
    const wag = Math.sin(t * 16) * 0.35;
    ctx.strokeStyle = COAT;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-30, -34);
    ctx.quadraticCurveTo(-42, -44, -40 + wag * 8, -54);
    ctx.stroke();
    // body: unified three-tone shading
    Shade.ellipse3(ctx, 0, -32, 32, 14.5, MAT.dogCoat, 0);
    // saddle spot
    ctx.fillStyle = MAT.dogSpot.base;
    ctx.beginPath();
    ctx.ellipse(-4, -36, 15, 9, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // head: skull + long snout + floppy ear
    Shade.circle3(ctx, 30, -44, 12, MAT.dogCoat);
    ctx.fillStyle = MAT.dogCoat.base;
    ctx.beginPath();
    ctx.ellipse(43, -39, 11, 6.5, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NOSE;
    ctx.beginPath();
    ctx.arc(52, -41, 3.4, 0, Math.PI * 2);
    ctx.fill();
    // tongue out while running
    ctx.fillStyle = '#e88a9a';
    ctx.beginPath();
    ctx.ellipse(46, -33.5, 4.5, 2.4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // floppy ear bouncing with the stride
    ctx.fillStyle = SPOT;
    ctx.save();
    ctx.translate(24, -50);
    ctx.rotate(-0.5 + Math.sin(phase) * 0.22);
    ctx.beginPath();
    ctx.ellipse(0, 7, 5.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // eye
    ctx.fillStyle = NOSE;
    ctx.beginPath();
    ctx.arc(33, -46, 2, 0, Math.PI * 2);
    ctx.fill();
    // collar
    ctx.strokeStyle = COLLAR;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(21, -38);
    ctx.lineTo(30, -33);
    ctx.stroke();
    ctx.restore();
  }
  return { draw };
})();
