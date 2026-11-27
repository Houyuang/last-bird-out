// input.js — keyboard + mouse state, with edge timestamps for jump buffering,
// plus a programmatic API so the autoplay driver and the real keyboard go
// through exactly the same code paths.
'use strict';
const Input = (() => {
  const held = Object.create(null);
  let jumpPressedAt = -Infinity;   // performance.now()/1000 of last jump press
  let jumpHeld = false;
  let jumpReleasedAt = -Infinity;
  let dashPressedAt = -Infinity;
  const edge = { pause: false, mute: false, restart: false, any: false };

  function now() { return performance.now() / 1000; }

  function pressJump() {
    if (!jumpHeld) { jumpPressedAt = now(); edge.any = true; }
    jumpHeld = true;
  }
  function releaseJump() {
    if (jumpHeld) jumpReleasedAt = now();
    jumpHeld = false;
  }
  function pressDash() { dashPressedAt = now(); edge.any = true; }
  function setDown(v) { held['ArrowDown'] = !!v; if (v) edge.any = true; }
  function fire(name) { edge[name] = true; edge.any = true; }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { pressJump(); e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') pressDash();
    if (e.code === 'KeyP') fire('pause');
    if (e.code === 'KeyM') fire('mute');
    if (e.code === 'KeyR') fire('restart');
    if (e.code === 'ArrowDown') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    held[e.code] = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') releaseJump();
  });
  window.addEventListener('mousedown', () => pressJump());
  window.addEventListener('mouseup', () => releaseJump());
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; jumpHeld = false; });

  return {
    get down() { return !!held['ArrowDown'] || !!held['KeyS']; },
    get dashHeld() { return !!held['ShiftLeft'] || !!held['ShiftRight']; },
    get jumpHeld() { return jumpHeld; },
    get jumpPressedAt() { return jumpPressedAt; },
    get jumpReleasedAt() { return jumpReleasedAt; },
    get dashPressedAt() { return dashPressedAt; },
    consumeJumpPress() { jumpPressedAt = -Infinity; },
    consumeJumpRelease() { jumpReleasedAt = -Infinity; },
    consumeDashPress() { dashPressedAt = -Infinity; },
    // one-shot edge flags, consumed by the game loop each frame
    take(name) { const v = !!edge[name]; edge[name] = false; return v; },
    // programmatic API (autoplay / tests) — same paths as real keys
    pressJump, releaseJump, pressDash, setDown, fire,
  };
})();
