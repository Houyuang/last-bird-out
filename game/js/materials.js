// materials.js — ONE unified shading model for the whole game.
// Fixed light direction: from the UPPER RIGHT. Every material is data:
//   base  — the lit mid-tone
//   shade — base darkened (~x0.72-0.8), painted on the lower-left
//   light — rim/highlight tone, painted on the upper-right edge
//   emissive (optional) — self-lit color for flames / oven doors
// Helpers ellipse3 / rect3 apply the model so no object is a flat fill.
'use strict';
const MAT = {
  turkeyBody:  { base: '#8a5a2b', shade: '#68431f', light: '#c79f5f' },
  turkeyHead:  { base: '#a9743f', shade: '#7d5226', light: '#d9b47c' },
  wing:        { base: '#74491f', shade: '#573715', light: '#9c6c33' },
  wood:        { base: '#8a6844', shade: '#654a2c', light: '#ab8757' },
  woodDark:    { base: '#6f5133', shade: '#4f3822', light: '#8f6d45' },
  barnRed:     { base: '#a33327', shade: '#7a251c', light: '#c6503f' },
  pumpkin:     { base: '#e07b23', shade: '#b25c12', light: '#f7a54a' },
  hay:         { base: '#d9b45c', shade: '#a9853c', light: '#f2d98c' },
  metal:       { base: '#c7ccd6', shade: '#878e9c', light: '#f4f7fc' },
  ironDark:    { base: '#2b303d', shade: '#171a21', light: '#4a5265' },
  shirt:       { base: '#3e7c3f', shade: '#2d5c2f', light: '#5da35e' },
  overalls:    { base: '#33549e', shade: '#24406e', light: '#4f74bd' },
  skin:        { base: '#e8b48c', shade: '#c08d64', light: '#f7d3ab' },
  strawHat:    { base: '#dcb95e', shade: '#b3943f', light: '#f2da8d' },
  dogCoat:     { base: '#c8c2b8', shade: '#9d968a', light: '#e9e5dc' },
  dogSpot:     { base: '#7a6a55', shade: '#5b4d3c', light: '#99876c' },
  leaf:        { base: '#d94f30', shade: '#b23a20', light: '#f07850' },
  flame:       { base: '#f07f1e', shade: '#c2510d', light: '#ffd94d', emissive: '#ffa03c' },
  corn:        { base: '#f2c230', shade: '#c99a1d', light: '#ffe27a' },
  chili:       { base: '#c22e22', shade: '#8f1f16', light: '#ef5a48' },
};

const Shade = (() => {
  // Elliptical three-tone: base fill, shade mass lower-left, light mass
  // upper-right (soft, alpha), then a crisp rim arc on the upper-right edge.
  function ellipse3(ctx, x, y, rx, ry, mat, rot) {
    rot = rot || 0;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = mat.base;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = mat.shade;
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.38, y + ry * 0.42, rx * 1.02, ry * 0.98, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = mat.light;
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.44, y - ry * 0.5, rx * 0.6, ry * 0.52, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // rim light: upper-right arc
    ctx.strokeStyle = mat.light;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(1, rx - 1.2), Math.max(1, ry - 1.2), rot, -1.25, 0.45);
    ctx.stroke();
  }
  function circle3(ctx, x, y, r, mat) { ellipse3(ctx, x, y, r, r, mat, 0); }

  // Rectangular three-tone: base, shade band bottom + left, light lines
  // along the top and right edges (light comes from the upper right).
  function rect3(ctx, x, y, w, h, mat) {
    ctx.fillStyle = mat.base;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = mat.shade;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x, y + h * 0.64, w, h * 0.36);       // bottom band
    ctx.fillRect(x, y, w * 0.2, h);                    // left band
    ctx.globalAlpha = 1;
    ctx.fillStyle = mat.light;
    ctx.fillRect(x, y, w, 2.4);                        // top light
    ctx.fillRect(x + w - 2.4, y, 2.4, h);              // right rim
  }
  return { ellipse3, circle3, rect3 };
})();
