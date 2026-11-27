// world.js — scenery for all four zones. Sky / far / mid / ground layers with
// parallax; palettes blend smoothly across zone boundaries while props switch
// with the dominant zone. All decoration placement is a pure function of
// world-x segment index (seeded hash), so the scene is deterministic at any
// scroll value — including in screenshot mode.
'use strict';
const World = (() => {
  const W = 1280, H = 720, GROUND_Y = 600;
  const ZONE_LEN = 800; // metres per zone

  const ZONE_INFO = [
    { name: 'THE FARMYARD', sub: 'Thanksgiving is coming. Run.' },
    { name: 'THE BARN',     sub: 'Dusk is falling — and the dog is loose.' },
    { name: 'THE KITCHEN',  sub: 'Mind the knives. Mind the ovens.' },
    { name: 'THE WOODS',    sub: 'Almost free — run, bird, run!' },
  ];

  // Palettes per zone. Colors lerp across boundaries; numbers lerp too.
  const PALETTES = [
    { // FARMYARD — bright day
      sky0: '#6fbdf0', sky1: '#a8d8f2', sky2: '#f6d9a0',
      hillFar: '#79a856', hillNear: '#679a45',
      gTop: '#69a244', gMid: '#5c913c', gDirt: '#8a6844', gBot: '#6f5133',
      wall: null, sunX: 1085, sunY: 105, sunR: 40, sun: '#ffdf6b', glow: 0.55, moon: 0,
    },
    { // BARN — dusk
      sky0: '#3a2350', sky1: '#9c4a56', sky2: '#f0915a',
      hillFar: '#5d3a52', hillNear: '#4a2c40',
      gTop: '#8a6a34', gMid: '#7a5a2e', gDirt: '#6b4a2a', gBot: '#4f3520',
      wall: '#46241d', sunX: 300, sunY: 330, sunR: 62, sun: '#ff9a3c', glow: 0.7, moon: 0,
    },
    { // KITCHEN — night interior
      sky0: '#141824', sky1: '#1d2333', sky2: '#2a3049',
      hillFar: '#1a1f2e', hillNear: '#232939',
      gTop: '#8b93a5', gMid: '#3c4356', gDirt: '#313747', gBot: '#22262f',
      wall: '#252a38', sunX: 1020, sunY: 92, sunR: 30, sun: '#e8ecf5', glow: 0.25, moon: 1,
    },
    { // WOODS — dawn
      sky0: '#7d9fc4', sky1: '#d9b48f', sky2: '#f7cf9e',
      hillFar: '#3d5c46', hillNear: '#2f4a38',
      gTop: '#4e7d43', gMid: '#426e39', gDirt: '#5d4a33', gBot: '#42331f',
      wall: null, sunX: 640, sunY: 452, sunR: 54, sun: '#ffb27a', glow: 0.65, moon: 0,
    },
  ];
  const COLOR_KEYS = ['sky0', 'sky1', 'sky2', 'hillFar', 'hillNear', 'gTop', 'gMid', 'gDirt', 'gBot', 'sun'];
  const NUM_KEYS = ['sunX', 'sunY', 'sunR', 'glow', 'moon'];

  function hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  const rgbCache = {};
  function rgb(hex) { return rgbCache[hex] || (rgbCache[hex] = hexRgb(hex)); }
  function mix(a, b, k) {
    const ca = rgb(a), cb = rgb(b);
    return 'rgb(' + Math.round(ca[0] + (cb[0] - ca[0]) * k) + ',' +
                    Math.round(ca[1] + (cb[1] - ca[1]) * k) + ',' +
                    Math.round(ca[2] + (cb[2] - ca[2]) * k) + ')';
  }
  function paletteAt(distM) {
    const f = distM / ZONE_LEN;
    const i = Math.max(0, Math.min(2, Math.floor(f)));
    // blend across the last/first 70m around each boundary
    let k = 0;
    const frac = f - i;
    if (frac > 1 - 70 / ZONE_LEN) k = (frac - (1 - 70 / ZONE_LEN)) / (140 / ZONE_LEN);
    if (distM >= 2400) return PALETTES[3];
    const A = PALETTES[i], B = PALETTES[i + 1], out = { wall: k > 0.5 ? B.wall : A.wall };
    for (const key of COLOR_KEYS) out[key] = k > 0 ? mix(A[key], B[key], k) : A[key];
    for (const key of NUM_KEYS) out[key] = A[key] + (B[key] - A[key]) * k;
    return out;
  }
  function zoneAt(distM) { return Math.max(0, Math.min(3, Math.floor(distM / ZONE_LEN))); }

  // ---------------- painted backdrop plates (far layer) ----------------
  // One painterly plate per zone, generated in a single storybook style.
  // They sit BEHIND the vector mid/near layers (which stay for gameplay
  // readability); the zone post-grade in main tints plate + vectors as one
  // world. If a plate fails to load, the vector sky/far layers take over.
  const PLATE_SRC = ['img/plate-farm.jpg', 'img/plate-barn.jpg', 'img/plate-kitchen.jpg', 'img/plate-woods.jpg'];
  const plates = PLATE_SRC.map((src) => {
    const im = new Image();
    im._ok = false;
    im.onload = () => { im._ok = true; };
    im.onerror = () => { im._ok = false; };
    im.src = src;
    return im;
  });
  function platesReady() { return plates.every((p) => p._ok || (p.complete && p.naturalWidth === 0)); }
  function plateBlendAt(distM) {
    for (let b = 1; b <= 3; b++) {
      const edge = b * ZONE_LEN;
      if (Math.abs(distM - edge) < 40) {
        const k = (distM - (edge - 40)) / 80;
        return { i: b - 1, j: b, k: Math.max(0, Math.min(1, k)) };
      }
    }
    const z = zoneAt(distM);
    return { i: z, j: z, k: 0 };
  }
  function drawPlate(ctx, img, scroll, alpha) {
    const DW = 1472, DH = 828; // 16:9 cover of the 1280x720 stage, 1.15x
    const range = DW - W;
    const raw = (scroll * 0.04) % (range * 2);
    const off = raw < range ? raw : range * 2 - raw; // ping-pong: no jump cuts
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -off, -54, DW, DH);
    ctx.restore();
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---------------- sky ----------------
  function drawSky(ctx, scroll, t, pal, zone) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, pal.sky0);
    g.addColorStop(0.55, pal.sky1);
    g.addColorStop(1, pal.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y + 2);

    // Sun / moon (position and size come from the blended palette).
    ctx.save();
    const sg = ctx.createRadialGradient(pal.sunX, pal.sunY, 8, pal.sunX, pal.sunY, pal.sunR * 2.4);
    const sunRgb = rgb(typeof pal.sun === 'string' && pal.sun[0] === '#' ? pal.sun : '#ffdf6b');
    sg.addColorStop(0, 'rgba(' + sunRgb[0] + ',' + sunRgb[1] + ',' + sunRgb[2] + ',' + (0.85 * pal.glow + 0.15) + ')');
    sg.addColorStop(1, 'rgba(' + sunRgb[0] + ',' + sunRgb[1] + ',' + sunRgb[2] + ',0)');
    ctx.fillStyle = sg;
    ctx.fillRect(pal.sunX - pal.sunR * 2.4, pal.sunY - pal.sunR * 2.4, pal.sunR * 4.8, pal.sunR * 4.8);
    ctx.fillStyle = pal.sun;
    ctx.beginPath(); ctx.arc(pal.sunX, pal.sunY, pal.sunR, 0, Math.PI * 2); ctx.fill();
    if (pal.moon > 0.5) { // craters
      ctx.fillStyle = 'rgba(160,168,190,0.5)';
      ctx.beginPath(); ctx.arc(pal.sunX - 9, pal.sunY - 5, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pal.sunX + 8, pal.sunY + 9, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pal.sunX + 11, pal.sunY - 11, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (zone === 2) return; // indoors: no clouds
    // Clouds: very slow parallax (0.05x) + gentle drift.
    ctx.fillStyle = zone === 1 ? 'rgba(70,40,60,0.55)' : 'rgba(255,255,255,0.92)';
    const spacing = 460, off = (scroll * 0.05 + t * 4) % spacing;
    for (let i = -1; i < W / spacing + 1; i++) {
      const idx = Math.floor((scroll * 0.05 + t * 4) / spacing) + i;
      const cx = i * spacing - off + hash(idx * 3 + 1) * 160;
      const cy = 52 + hash(idx * 3 + 2) * 110;
      const s = 0.75 + hash(idx * 3 + 3) * 0.7;
      cloud(ctx, cx, cy, s);
    }
  }
  function cloud(ctx, x, y, s) {
    // FIX (demo flaw #2): each ellipse is its own path+fill. The demo drew all
    // four ellipses into ONE path; overlapping subpaths with opposite winding
    // cancelled and cut a visible notch out of the silhouette.
    const blobs = [[0, 0, 46, 17], [-30, 5, 30, 12], [30, 1, 34, 14], [2, -11, 28, 14]];
    for (const [bx, by, rx, ry] of blobs) {
      ctx.beginPath();
      ctx.ellipse(x + bx * s, y + by * s, rx * s, ry * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------- far layer ----------------
  function drawFar(ctx, scroll, pal, zone) {
    if (zone === 2) {
      // Kitchen wall: tiled wainscot + hanging pans on a rail.
      ctx.fillStyle = pal.wall || '#252a38';
      ctx.fillRect(0, 60, W, GROUND_Y - 60);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      const off = (scroll * 0.3) % 90;
      for (let x = -off; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x, GROUND_Y); ctx.stroke(); }
      for (let y = 330; y < GROUND_Y; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // rail with pans / utensils (0.3x)
      ctx.fillStyle = '#171b26';
      ctx.fillRect(0, 118, W, 7);
      const spacing = 300, poff = (scroll * 0.3) % spacing;
      for (let i = -1; i < W / spacing + 1; i++) {
        const idx = Math.floor(scroll * 0.3 / spacing) + i;
        const px = i * spacing - poff + hash(idx * 11) * 120;
        const kind = hash(idx * 11 + 1);
        ctx.fillStyle = '#10131c';
        if (kind < 0.5) { // pan
          ctx.beginPath(); ctx.arc(px, 168, 24, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(px - 3, 122, 6, 26);
        } else if (kind < 0.78) { // ladle / spoon
          ctx.fillRect(px - 2, 122, 4, 44);
          ctx.beginPath(); ctx.ellipse(px, 172, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
        } else { // small pot
          ctx.fillRect(px - 17, 140, 34, 26);
          ctx.fillRect(px - 2, 122, 4, 18);
        }
      }
      // spice shelf: plank + jars against the wall (0.3x)
      const soff2 = (scroll * 0.3) % 430;
      for (let i = -1; i < W / 430 + 1; i++) {
        const idx = Math.floor(scroll * 0.3 / 430) + i;
        const jx = i * 430 - soff2 + 36;
        ctx.fillStyle = '#313847';
        ctx.fillRect(jx - 10, 272, 196, 7);
        for (let j = 0; j < 4; j++) {
          const jw = 20 + hash(idx * 7 + j * 3) * 10, jh = 24 + hash(idx * 9 + j * 5) * 13;
          ctx.fillStyle = ['#4d4436', '#44503c', '#54423a', '#3d4a5c'][(((idx * 3 + j) % 4) + 4) % 4];
          ctx.fillRect(jx + j * 46, 272 - jh, jw, jh);
          ctx.fillStyle = 'rgba(220,225,240,0.28)';
          ctx.fillRect(jx + j * 46, 272 - jh, jw, 3); // lid highlight
          ctx.fillStyle = '#313847';
        }
      }
      // one window with the moon outside (0.15x)
      const wx = 880 - (scroll * 0.15) % 2400;
      if (wx > -220 && wx < W) {
        ctx.fillStyle = '#0d1322';
        ctx.fillRect(wx, 150, 150, 190);
        ctx.strokeStyle = '#3a4152'; ctx.lineWidth = 8; ctx.strokeRect(wx, 150, 150, 190);
        ctx.beginPath(); ctx.moveTo(wx + 75, 150); ctx.lineTo(wx + 75, 340); ctx.stroke();
        ctx.fillStyle = '#dfe6f2';
        ctx.beginPath(); ctx.arc(wx + 105, 195, 17, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    // Rolling hills (farm / barn / woods), 0.2x parallax.
    const off = scroll * 0.2;
    ctx.fillStyle = pal.hillFar;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 16) {
      const wx = x + off;
      const y = GROUND_Y - 118 - Math.sin(wx * 0.004) * 42 - Math.sin(wx * 0.011 + 2) * 16;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.hillNear;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 16) {
      const wx = x + off * 1.7;
      const y = GROUND_Y - 52 - Math.sin(wx * 0.006 + 1.2) * 26 - Math.sin(wx * 0.017) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    if (zone === 3) {
      // distant tree spikes on the near ridge
      ctx.fillStyle = pal.hillNear;
      const spacing = 90, toff = (scroll * 0.34) % spacing;
      for (let i = -1; i < W / spacing + 1; i++) {
        const idx = Math.floor(scroll * 0.34 / spacing) + i;
        const tx = i * spacing - toff + hash(idx * 5) * 30;
        const th = 44 + hash(idx * 5 + 1) * 40;
        const baseY = GROUND_Y - 46 - Math.sin((tx + scroll * 0.34) * 0.006 + 1.2) * 26;
        ctx.beginPath();
        ctx.moveTo(tx - 13, baseY);
        ctx.lineTo(tx, baseY - th);
        ctx.lineTo(tx + 13, baseY);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  // ---------------- mid layer ----------------
  function drawBarnShape(ctx, x) {
    const base = GROUND_Y, bw = 190, bh = 130;
    Shade.rect3(ctx, x, base - bh, bw, bh, MAT.barnRed);
    ctx.fillStyle = MAT.barnRed.shade;
    ctx.beginPath();
    ctx.moveTo(x - 14, base - bh);
    ctx.lineTo(x + bw / 2, base - bh - 58);
    ctx.lineTo(x + bw + 14, base - bh);
    ctx.closePath(); ctx.fill();
    // rim light along the roof's right slope (light from upper right)
    ctx.strokeStyle = MAT.barnRed.light;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, base - bh - 58);
    ctx.lineTo(x + bw + 14, base - bh);
    ctx.stroke();
    ctx.fillStyle = '#842a20';
    ctx.fillRect(x + bw / 2 - 30, base - 78, 60, 78);
    ctx.strokeStyle = '#e8ded0'; ctx.lineWidth = 5;
    ctx.strokeRect(x + bw / 2 - 30, base - 78, 60, 78);
    ctx.beginPath();
    ctx.moveTo(x + bw / 2 - 30, base - 78); ctx.lineTo(x + bw / 2 + 30, base);
    ctx.moveTo(x + bw / 2 + 30, base - 78); ctx.lineTo(x + bw / 2 - 30, base);
    ctx.stroke();
    ctx.fillStyle = '#f2d38a';
    ctx.fillRect(x + bw / 2 - 13, base - bh - 34, 26, 24);
    ctx.strokeStyle = '#e8ded0'; ctx.lineWidth = 3;
    ctx.strokeRect(x + bw / 2 - 13, base - bh - 34, 26, 24);
  }
  // Screen positions of the farmyard windmills (0.5x layer) — exported so
  // screenshot mode can frame one deliberately; drawMid uses the same math.
  function windmillXs(scroll) {
    const off = scroll * 0.5, every = 2600, out = [];
    const first = Math.floor(off / every);
    for (let i = first - 1; i < first + 3; i++) {
      out.push({ x: i * every + 500 + hash(i * 3) * 160 - off, i });
    }
    return out;
  }
  function drawWindmill(ctx, x, idx, t) {
    const base = GROUND_Y, topX = x + 30, topY = base - 196;
    ctx.strokeStyle = MAT.woodDark.base;
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 2, base); ctx.lineTo(topX - 12, topY);
    ctx.moveTo(x + 58, base); ctx.lineTo(topX + 12, topY);
    ctx.moveTo(x + 8, base - 66); ctx.lineTo(x + 52, base - 66);
    ctx.moveTo(x + 13, base - 128); ctx.lineTo(x + 47, base - 128);
    ctx.moveTo(x + 2, base); ctx.lineTo(x + 47, base - 128);
    ctx.moveTo(x + 58, base); ctx.lineTo(x + 13, base - 128);
    ctx.stroke();
    Shade.rect3(ctx, topX - 17, topY - 26, 34, 28, MAT.wood);
    ctx.fillStyle = MAT.barnRed.shade;
    ctx.beginPath();
    ctx.moveTo(topX - 21, topY - 24); ctx.lineTo(topX, topY - 40); ctx.lineTo(topX + 21, topY - 24);
    ctx.closePath(); ctx.fill();
    // four sail blades, turning slowly
    const hubX = topX, hubY = topY - 14, ang = t * 0.55 + idx * 1.7;
    ctx.strokeStyle = MAT.woodDark.shade; ctx.lineWidth = 4;
    for (let k = 0; k < 4; k++) {
      const a = ang + k * Math.PI / 2;
      const bx = hubX + Math.cos(a) * 60, by = hubY + Math.sin(a) * 60;
      ctx.beginPath(); ctx.moveTo(hubX, hubY); ctx.lineTo(bx, by); ctx.stroke();
      const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2);
      ctx.fillStyle = 'rgba(232,222,208,0.9)';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - Math.cos(a) * 20 + px * 7, by - Math.sin(a) * 20 + py * 7);
      ctx.lineTo(bx - Math.cos(a) * 20 - px * 7, by - Math.sin(a) * 20 - py * 7);
      ctx.closePath(); ctx.fill();
    }
    Shade.circle3(ctx, hubX, hubY, 5.5, MAT.woodDark);
  }
  function drawMid(ctx, scroll, zone, t) {
    const off = scroll * 0.5;
    if (zone === 0) {
      // With the painted plate live, its barns carry the vista — flat
      // vector barns on top would double the scene. Windmills stay: they
      // are foreground set pieces and read as a nearer pair.
      if (!plates[0]._ok) {
        const barnEvery = 1150;
        const first = Math.floor(off / barnEvery);
        for (let i = first - 1; i < first + 3; i++) {
          const bx = i * barnEvery + hash(i * 7) * 260 - off;
          if (bx > -260 && bx < W + 60) drawBarnShape(ctx, bx);
        }
      }
      for (const wm of windmillXs(scroll)) {
        if (wm.x > -180 && wm.x < W + 60) drawWindmill(ctx, wm.x, wm.i, t || 0);
      }
      const postEvery = 64;
      const poff = off % postEvery;
      ctx.fillStyle = '#8a6844';
      for (let x = -poff; x < W; x += postEvery) ctx.fillRect(x, GROUND_Y - 44, 7, 44);
      ctx.fillRect(0, GROUND_Y - 40, W, 6);
      ctx.fillRect(0, GROUND_Y - 20, W, 6);
    } else if (zone === 1) {
      // Barn interior silhouettes: posts, roof beam, hanging tools, hay piles.
      ctx.fillStyle = 'rgba(30,12,8,0.85)';
      ctx.fillRect(0, 96, W, 10); // roof beam
      const spacing = 330, poff = off % spacing;
      for (let i = -1; i < W / spacing + 1; i++) {
        const idx = Math.floor(off / spacing) + i;
        const px = i * spacing - poff;
        ctx.fillRect(px, 96, 16, GROUND_Y - 96); // post
        const kind = hash(idx * 17);
        ctx.save();
        ctx.translate(px + 90 + hash(idx * 17 + 1) * 90, 106);
        if (kind < 0.34) { // horseshoe
          ctx.strokeStyle = 'rgba(30,12,8,0.9)'; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.arc(0, 26, 13, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
          ctx.fillRect(-2, 0, 4, 14);
        } else if (kind < 0.67) { // saw
          ctx.fillStyle = 'rgba(30,12,8,0.9)';
          ctx.beginPath();
          ctx.moveTo(0, 10); ctx.lineTo(52, 22); ctx.lineTo(52, 34); ctx.lineTo(0, 26);
          ctx.closePath(); ctx.fill();
        } else { // rope coil
          ctx.strokeStyle = 'rgba(30,12,8,0.9)'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(10, 30, 12, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(10, 30, 6, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        // hay pile silhouette at the post base
        ctx.fillStyle = 'rgba(52,30,12,0.9)';
        ctx.beginPath();
        ctx.ellipse(px + 170, GROUND_Y, 74, 30 + hash(idx * 19) * 16, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      // hay loft: shelf silhouette high on the wall, bales on top, ladder down
      const lspace = 660, loff = off % lspace;
      for (let i = -1; i < W / lspace + 1; i++) {
        const idx = Math.floor(off / lspace) + i;
        const lx = i * lspace - loff + 60;
        ctx.fillStyle = 'rgba(84,54,20,0.9)'; // bales catch the dusk light
        const nb = 2 + Math.floor(hash(idx * 41) * 2);
        for (let b = 0; b < nb; b++) {
          ctx.beginPath();
          ctx.ellipse(lx + 52 + b * 74, 196, 34, 15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(30,12,8,0.88)';
        ctx.fillRect(lx, 208, 300, 12);          // loft shelf
        ctx.fillRect(lx + 18, 220, 9, 62);       // brace
        const ladX = lx + 252;                   // ladder
        ctx.fillRect(ladX, 220, 5, 212);
        ctx.fillRect(ladX + 22, 220, 5, 212);
        for (let r = 0; r < 6; r++) ctx.fillRect(ladX, 246 + r * 32, 27, 4);
      }
    } else if (zone === 2) {
      // Oven silhouettes with glowing doors (0.5x).
      const spacing = 980, ooff = off % spacing;
      for (let i = -1; i < W / spacing + 1; i++) {
        const idx = Math.floor(off / spacing) + i;
        const ox = i * spacing - ooff + hash(idx * 23) * 180;
        ctx.fillStyle = '#12151f';
        ctx.fillRect(ox, GROUND_Y - 190, 170, 190);
        ctx.fillRect(ox + 62, GROUND_Y - 268, 42, 82); // chimney
        const flick = 0.75 + Math.sin(idx * 7 + performance.now() / 130) * 0.25;
        const og = ctx.createRadialGradient(ox + 85, GROUND_Y - 78, 4, ox + 85, GROUND_Y - 78, 52);
        og.addColorStop(0, 'rgba(255,170,60,' + (0.95 * flick) + ')');
        og.addColorStop(0.55, 'rgba(230,90,25,' + (0.75 * flick) + ')');
        og.addColorStop(1, 'rgba(120,30,5,0)');
        ctx.fillStyle = og;
        ctx.fillRect(ox + 25, GROUND_Y - 138, 120, 120);
        ctx.fillStyle = '#0a0c12';
        ctx.fillRect(ox + 45, GROUND_Y - 118, 80, 76);
        ctx.fillStyle = 'rgba(255,140,40,' + (0.85 * flick) + ')';
        ctx.fillRect(ox + 53, GROUND_Y - 110, 64, 60);
        ctx.fillStyle = 'rgba(255,205,110,' + (0.9 * flick) + ')';
        ctx.fillRect(ox + 61, GROUND_Y - 100, 48, 38);
      }
    } else {
      // Woods: tree silhouettes (0.5x), pines and broadleafs.
      const spacing = 300, toff = off % spacing;
      for (let i = -1; i < W / spacing + 1; i++) {
        const idx = Math.floor(off / spacing) + i;
        const tx = i * spacing - toff + hash(idx * 29) * 110;
        const th = 190 + hash(idx * 29 + 1) * 130;
        ctx.fillStyle = '#1d3527';
        if (hash(idx * 29 + 2) < 0.55) { // pine: trunk + 3 tiers
          ctx.fillRect(tx - 6, GROUND_Y - 60, 12, 60);
          for (let tier = 0; tier < 3; tier++) {
            const tw = 74 - tier * 18, ty = GROUND_Y - 50 - tier * (th - 60) / 3;
            ctx.beginPath();
            ctx.moveTo(tx - tw / 2, ty);
            ctx.lineTo(tx, ty - (th - 40) / 3 - 16);
            ctx.lineTo(tx + tw / 2, ty);
            ctx.closePath(); ctx.fill();
          }
        } else { // broadleaf: trunk + canopy blobs
          ctx.fillRect(tx - 7, GROUND_Y - 92, 14, 92);
          ctx.beginPath(); ctx.arc(tx, GROUND_Y - th + 40, 52, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(tx - 40, GROUND_Y - th + 66, 36, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(tx + 42, GROUND_Y - th + 62, 38, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function scarecrow(ctx, x) {
    const base = GROUND_Y + 4;
    ctx.strokeStyle = MAT.woodDark.base; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - 88); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 26, base - 66); ctx.lineTo(x + 26, base - 70); ctx.stroke();
    Shade.rect3(ctx, x - 13, base - 68, 26, 34, MAT.shirt); // faded plaid body
    ctx.strokeStyle = MAT.hay.base; ctx.lineWidth = 3;      // straw hands
    for (const s of [-1, 1]) for (let f = 0; f < 3; f++) {
      ctx.beginPath();
      ctx.moveTo(x + s * 26, base - 68 + s * 2);
      ctx.lineTo(x + s * (32 + f * 2), base - 62 + f * 4);
      ctx.stroke();
    }
    Shade.circle3(ctx, x, base - 80, 10, MAT.hay);          // stuffed-sack head
    ctx.fillStyle = '#241a12';
    ctx.beginPath(); ctx.arc(x - 3.4, base - 82, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.4, base - 82, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = MAT.strawHat.base;
    ctx.beginPath(); ctx.ellipse(x, base - 88, 17, 4, 0, 0, Math.PI * 2); ctx.fill();
    Shade.ellipse3(ctx, x, base - 92, 9, 6, MAT.strawHat, 0);
  }

  // ---------------- ground ----------------
  function pumpkin(ctx, x, y, r) {
    Shade.ellipse3(ctx, x, y - r * 0.55, r, r * 0.78, MAT.pumpkin, 0);
    ctx.strokeStyle = 'rgba(160,80,10,0.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 0.55, r * 0.74, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5c7d33';
    ctx.fillRect(x - 2, y - r * 1.5, 4, 6);
  }

  // Screen-x centres of the kitchen ovens (same placement math as drawMid),
  // exported so the post pass can lay additive glow sprites over the doors.
  function ovenGlowPositions(scroll) {
    const off = scroll * 0.5, spacing = 980, ooff = off % spacing, out = [];
    for (let i = -1; i < W / spacing + 1; i++) {
      const idx = Math.floor(off / spacing) + i;
      out.push(i * spacing - ooff + hash(idx * 23) * 180 + 85);
    }
    return out;
  }
  function drawGround(ctx, scroll, pal, zone) {
    if (zone === 2) {
      // Checkerboard kitchen floor: 3 perspective rows of scrolling tiles.
      const rows = [[0, 24], [24, 62], [62, 120]];
      const tileW = 84;
      const firstTile = Math.floor(scroll / tileW);
      for (let r = 0; r < rows.length; r++) {
        const [ry, rh] = rows[r];
        for (let ti = firstTile - 1; ti < firstTile + W / tileW + 2; ti++) {
          const light = ((ti + r) % 2 + 2) % 2 === 0;
          ctx.fillStyle = light ? pal.gTop : pal.gMid;
          ctx.fillRect(ti * tileW - scroll, GROUND_Y + ry, tileW + 1, rh);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, GROUND_Y, W, 3);
      // grout lines
      ctx.strokeStyle = 'rgba(10,12,18,0.5)';
      ctx.lineWidth = 2;
      for (const [ry] of rows) { ctx.beginPath(); ctx.moveTo(0, GROUND_Y + ry); ctx.lineTo(W, GROUND_Y + ry); ctx.stroke(); }
      return;
    }
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    g.addColorStop(0, pal.gTop);
    g.addColorStop(0.18, pal.gMid);
    g.addColorStop(0.22, pal.gDirt);
    g.addColorStop(1, pal.gBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    const seg = 90;
    const first = Math.floor(scroll / seg);
    for (let i = first; i < first + W / seg + 2; i++) {
      const sx = i * seg - scroll + hash(i * 13 + 5) * 46;
      const kind = hash(i * 13 + 1);
      if (zone === 0) {
        if (kind < 0.52) {
          ctx.strokeStyle = '#4e7d33'; ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let b = -2; b <= 2; b++) {
            ctx.moveTo(sx + b * 4, GROUND_Y + 4);
            ctx.lineTo(sx + b * 6, GROUND_Y - 8 - hash(i * 31 + b + 9) * 7);
          }
          ctx.stroke();
        } else if (kind < 0.72) {
          pumpkin(ctx, sx, GROUND_Y + 6, 11 + hash(i * 17) * 7);
        } else if (kind < 0.84) {
          ctx.fillStyle = '#9a8d7c';
          ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 5, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        } else if (kind < 0.855) {
          scarecrow(ctx, sx);
        }
      } else if (zone === 1) {
        if (kind < 0.6) { // straw strokes
          ctx.strokeStyle = '#c9a34e'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let b = 0; b < 4; b++) {
            const bx = sx + hash(i * 31 + b) * 30;
            ctx.moveTo(bx, GROUND_Y + 8 + hash(i * 37 + b) * 8);
            ctx.lineTo(bx + 9, GROUND_Y + 5 + hash(i * 41 + b) * 8);
          }
          ctx.stroke();
        } else if (kind < 0.8) {
          ctx.fillStyle = '#5d4630';
          ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else { // woods floor
        if (kind < 0.45) {
          ctx.strokeStyle = '#33512c'; ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let b = -2; b <= 2; b++) {
            ctx.moveTo(sx + b * 4, GROUND_Y + 4);
            ctx.lineTo(sx + b * 6, GROUND_Y - 7 - hash(i * 31 + b + 9) * 6);
          }
          ctx.stroke();
        } else if (kind < 0.6) { // mushroom
          ctx.fillStyle = '#d8cfc0';
          ctx.fillRect(sx - 2, GROUND_Y - 4, 4, 7);
          ctx.fillStyle = '#b04a38';
          ctx.beginPath(); ctx.ellipse(sx, GROUND_Y - 5, 8, 5, 0, Math.PI, Math.PI * 2); ctx.fill();
        } else if (kind < 0.78) { // fallen leaves
          ctx.fillStyle = 'rgba(200,120,50,0.75)';
          ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 7, 7, 3, 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(sx + 14, GROUND_Y + 11, 6, 2.6, -0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (hash(i * 19 + 2) < 0.7) {
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.beginPath();
        ctx.ellipse(sx + 20, GROUND_Y + 34 + hash(i * 23) * 60, 12, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function draw(ctx, scroll, t, distM) {
    const pal = paletteAt(distM || 0);
    const zone = zoneAt(distM || 0);
    const pb = plateBlendAt(distM || 0);
    if (plates[pb.i]._ok) {
      // Painted plate = far layer. Vector hills stay at low alpha for
      // parallax depth (outdoor zones only — the kitchen far layer IS a
      // wall and would wash over the plate). Sky/sun/clouds are the plate's.
      drawPlate(ctx, plates[pb.i], scroll, 1);
      if (pb.k > 0 && plates[pb.j]._ok) drawPlate(ctx, plates[pb.j], scroll, pb.k);
      if (zone !== 2) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        drawFar(ctx, scroll, pal, zone);
        ctx.restore();
      }
    } else {
      drawSky(ctx, scroll, t, pal, zone);
      drawFar(ctx, scroll, pal, zone);
    }
    drawMid(ctx, scroll, zone, t);
    drawGround(ctx, scroll, pal, zone);
  }
  return { draw, zoneAt, paletteAt, ovenGlowPositions, windmillXs, platesReady, ZONE_INFO, ZONE_LEN, GROUND_Y, W, H };
})();
