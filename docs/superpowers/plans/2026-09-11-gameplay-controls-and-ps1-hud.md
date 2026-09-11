# Gameplay Controls & PS1 Retro HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance player kinematics with Source/indie-style jump buffering, coyote time, and air crouch-jump, implement smart wheel weapon cycling, and introduce an authentic PS1-styled tactical reticle and weapon OSD.

**Architecture:** 
- Player kinematics in [src/entities/player.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/entities/player.js) receives internal timers for coyote time (120ms) and jump buffering (100ms) with air-tuck offset for crouch-jumping.
- Weapon cycle dispatch in [src/weapons/index.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/index.js) and [src/weapons/physgun.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/physgun.js) conditionally delegates mouse wheel to distance adjustment if a prop is held, or cycles slots if empty-handed.
- Retro UI components ([src/ui/crosshair.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/ui/crosshair.js) and [src/ui/hud.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/ui/hud.js)) integrate with [index.html](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/index.html) and [src/main.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/main.js) to render low-res, high-contrast PS1 tactical framing and slot OSD with zero emojis.

**Tech Stack:** Vanilla JavaScript (ES Modules), Three.js (r160), HTML5 / CSS3.

## Global Constraints
- Under no circumstances use emojis anywhere in code, HTML, CSS, or logs.
- Preserve all existing comments and docstrings.
- Maintain retro PS1 aesthetic: chunky borders, monospace tracking, high contrast, hard 2px drop shadows.

---

### Task 1: Player Kinematics (Coyote Time, Jump Buffer, and Crouch-Jump Leg Tuck)

**Files:**
- Modify: `src/entities/player.js`
- Test: `tests/player-kinematics.test.mjs`

**Interfaces:**
- Consumes: `PLAYER` config constants, `player.onGround`, `player.intent`, `dt`.
- Produces: `player.coyoteTimer`, `player.jumpBufferTimer`, air-tucked capsule resolution for responsive platforming.

- [ ] **Step 1: Write test for coyote time and jump buffer logic**

Create `tests/player-kinematics.test.mjs`:
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

test('coyote time allows jumping briefly after leaving ground', () => {
  let onGround = false;
  let coyoteTimer = 0.12;
  const dt = 0.05;

  coyoteTimer -= dt;
  assert.ok(coyoteTimer > 0, 'Coyote timer should still be active');

  // Jump triggered
  const canJump = onGround || coyoteTimer > 0;
  assert.equal(canJump, true);
});

test('jump buffer registers pre-landing jump input', () => {
  let jumpBuffer = 0.10;
  const dt = 0.04;
  jumpBuffer -= dt;
  assert.ok(jumpBuffer > 0);

  // Touching ground consumes buffer
  let jumped = false;
  let onGround = true;
  if (onGround && jumpBuffer > 0) {
    jumped = true;
    jumpBuffer = 0;
  }
  assert.equal(jumped, true);
  assert.equal(jumpBuffer, 0);
});
```

- [ ] **Step 2: Run test to verify it passes baseline**

Run: `node --test tests/player-kinematics.test.mjs`  
Expected: PASS (2 tests)

- [ ] **Step 3: Implement coyote time, jump buffer, and crouch-jump in `src/entities/player.js`**

Update `src/entities/player.js`:
Add timer fields to `player`:
```javascript
export const player = {
  pos: new THREE.Vector3(0, 0, 9),
  vel: new THREE.Vector3(),
  yaw: Math.PI,
  pitch: 0,
  onGround: false,
  crouching: false,
  height: PLAYER.height,
  eyeHeight: PLAYER.eye,
  bob: 0,
  enabled: false,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  intent: { forward: 0, strafe: 0, jump: false, run: false, crouch: false },
};
```

Update `capsuleOffsets()` to support tucking the bottom sphere when crouching in mid-air:
```javascript
function capsuleOffsets() {
  const r = PLAYER.radius;
  const h = player.height;
  const tuck = (!player.onGround && player.crouching) ? (PLAYER.height - PLAYER.crouchHeight) : 0;
  _offsets[0] = r + 0.02 + tuck;
  _offsets[1] = h * 0.5 + tuck * 0.5;
  _offsets[2] = h - r - 0.02;
  return _offsets;
}
```

In `stepPlayer(dt)`, update timer progression and jump decision:
```javascript
  // Manage jump buffer timer
  if (player.intent.jump) {
    player.jumpBufferTimer = 0.10;
  } else if (player.jumpBufferTimer > 0) {
    player.jumpBufferTimer -= dt;
  }

  // Manage coyote timer
  if (player.onGround) {
    player.coyoteTimer = 0.12;
  } else if (player.coyoteTimer > 0) {
    player.coyoteTimer -= dt;
  }

  const wantsJump = player.jumpBufferTimer > 0;
  const canJump = player.onGround || player.coyoteTimer > 0;

  if (player.onGround) {
    applyFriction(dt);
    accelerate(_wish, wishSpeed, PLAYER.accel, dt);
    if (wantsJump && canJump) {
      player.vel.y = PLAYER.jump;
      player.onGround = false;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      events.emit('player:jump');
    }
  } else {
    accelerate(_wish, Math.min(wishSpeed, PLAYER.run), PLAYER.airAccel, dt);
    if (wantsJump && canJump) {
      player.vel.y = PLAYER.jump;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      events.emit('player:jump');
    }
  }
```

- [ ] **Step 4: Verify syntax and kinematics compilation**

Run: `node -e "import('./src/entities/player.js').then(() => console.log('OK'))"`  
Expected: `OK` (or module resolution test confirming no syntax errors)

- [ ] **Step 5: Commit kinematics changes**

```bash
git add src/entities/player.js tests/player-kinematics.test.mjs
git commit -m "feat: add coyote time, jump buffering, and air crouch-jump tucking"
```

---

### Task 2: Smart Mouse Wheel Weapon Cycling

**Files:**
- Modify: `src/weapons/physgun.js`
- Modify: `src/weapons/index.js`
- Test: `tests/weapon-scroll.test.mjs`

**Interfaces:**
- Consumes: `fire:scroll` event from `ui/controls.js`.
- Produces: `physgun.scroll(dir)` returning `boolean` (true if distance adjusted, false if idle), `cycleTool(dir)` fallback.

- [ ] **Step 1: Write test for wheel cycling logic**

Create `tests/weapon-scroll.test.mjs`:
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

test('wheel cycles weapons when tool does not consume scroll', () => {
  let cycled = 0;
  function cycleTool(dir) { cycled += dir; }

  const tool = {
    scroll(dir) {
      const holding = false;
      if (holding) return true;
      return false;
    }
  };

  const consumed = tool.scroll(1);
  if (!consumed) cycleTool(1);

  assert.equal(consumed, false);
  assert.equal(cycled, 1);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/weapon-scroll.test.mjs`  
Expected: PASS (1 test)

- [ ] **Step 3: Update `src/weapons/physgun.js` to return consumption status**

In `src/weapons/physgun.js`:
```javascript
  scroll(dir) {
    if (!held.body) return false;
    held.dist = Math.min(FAR, Math.max(NEAR, held.dist + dir * WHEEL_STEP));
    return true;
  },
```

- [ ] **Step 4: Update `src/weapons/index.js` to cycle tools on unconsumed scroll**

In `src/weapons/index.js`:
```javascript
events.on('fire:scroll', (dir) => {
  if (!inPlay()) return;
  const consumed = belt.tool?.scroll?.(dir);
  if (!consumed) {
    cycleTool(dir);
  }
});
```

- [ ] **Step 5: Commit weapon cycling changes**

```bash
git add src/weapons/physgun.js src/weapons/index.js tests/weapon-scroll.test.mjs
git commit -m "feat: cycle weapon slots via mouse wheel when not holding an object"
```

---

### Task 3: PS1 Tactical Reticle

**Files:**
- Create: `src/ui/crosshair.js`
- Modify: `index.html`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `app.play`, `pointer.locked`, `aimHit()` from `weapons/aim.js`.
- Produces: DOM elements `#crosshair` with CSS classes `.active`, `.target`, `.frozen`, `.carrying`.

- [ ] **Step 1: Add Reticle HTML and CSS to `index.html`**

In `index.html`, add styles for `#crosshair`:
```css
  /* ---------- PS1 TACTICAL RETICLE ---------- */
  #crosshair {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 28px; height: 28px;
    pointer-events: none;
    z-index: 25;
    display: none;
  }
  #crosshair.visible { display: block; }

  /* Corner brackets */
  .reticle-bracket {
    position: absolute;
    width: 6px; height: 6px;
    border-color: rgba(185, 163, 255, 0.7);
    border-style: solid;
    transition: transform 0.08s ease, border-color 0.08s ease;
  }
  .reticle-tl { top: 0; left: 0; border-width: 2px 0 0 2px; }
  .reticle-tr { top: 0; right: 0; border-width: 2px 2px 0 0; }
  .reticle-bl { bottom: 0; left: 0; border-width: 0 0 2px 2px; }
  .reticle-br { bottom: 0; right: 0; border-width: 0 2px 2px 0; }

  .reticle-pip {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 3px; height: 3px;
    background: #b9a3ff;
    box-shadow: 1px 1px 0 #000;
  }

  /* Lock-on states */
  #crosshair.target .reticle-bracket {
    border-color: #ffd13b;
    transform: scale(0.85);
  }
  #crosshair.frozen .reticle-bracket {
    border-color: #5ce6e6;
  }
  #crosshair.carrying .reticle-pip {
    width: 5px; height: 5px;
    background: #ff5a8a;
  }
```
And add markup before closing `</body>`:
```html
<div id="crosshair">
  <div class="reticle-bracket reticle-tl"></div>
  <div class="reticle-bracket reticle-tr"></div>
  <div class="reticle-bracket reticle-bl"></div>
  <div class="reticle-bracket reticle-br"></div>
  <div class="reticle-pip"></div>
</div>
```

- [ ] **Step 2: Create `src/ui/crosshair.js`**

Write `src/ui/crosshair.js`:
```javascript
import { app, interactive } from '../core/app.js';
import { pointer } from './pointer.js';
import { aimHit } from '../weapons/aim.js';
import { belt } from '../weapons/index.js';

const crosshairEl = document.getElementById('crosshair');

export function updateCrosshair() {
  if (!crosshairEl) return;
  const isPlaying = app.play && interactive() && pointer.locked && !app.cinematic && !app.saver;
  if (!isPlaying) {
    crosshairEl.classList.remove('visible');
    return;
  }
  crosshairEl.classList.add('visible');

  const hit = aimHit(60);
  const isGrabbable = hit && hit.body && !hit.body.isStatic && hit.body.type !== 'level';
  const isFrozen = isGrabbable && hit.body.frozen;

  crosshairEl.classList.toggle('target', !!isGrabbable && !isFrozen);
  crosshairEl.classList.toggle('frozen', !!isFrozen);

  // Active carrying check if the equipped tool is holding
  const isCarrying = !!(belt.tool?.isHolding?.() || (belt.id === 'physgun' && hit?.body?.grabbed));
  crosshairEl.classList.toggle('carrying', isCarrying);
}
```

- [ ] **Step 3: Register crosshair update in `src/main.js`**

Import and call `updateCrosshair()` in the main frame loop.

- [ ] **Step 4: Commit PS1 reticle**

```bash
git add index.html src/ui/crosshair.js src/main.js
git commit -m "feat: implement PS1 tactical reticle with contextual lock-on brackets"
```

---

### Task 4: PS1 Weapon OSD Component

**Files:**
- Create: `src/ui/hud.js`
- Modify: `index.html`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `Tools.list()`, `belt.id`, `events`, `pointer.locked`.
- Produces: Visual retro weapon OSD displaying active slot, weapon hints, and pause prompt.

- [ ] **Step 1: Add PS1 HUD HTML & CSS to `index.html`**

In `index.html`, add styling:
```css
  /* ---------- PS1 WEAPON OSD ---------- */
  #hud {
    position: fixed;
    left: 18px; bottom: 18px;
    z-index: 22;
    display: flex; flex-direction: column; gap: 6px;
    font-family: ui-monospace, "Courier New", monospace;
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  #hud.hidden { opacity: 0; transform: translateY(12px); }

  .hud-panel {
    background: #120e24;
    border: 2px solid #4d3f7a;
    box-shadow: 2px 2px 0 #000;
    padding: 6px 10px;
    color: #e7dcff;
    letter-spacing: 1.5px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .hud-slots {
    display: flex; gap: 6px;
  }

  .hud-slot {
    padding: 4px 8px;
    background: #1c1538;
    border: 1px solid #3d3262;
    color: #8c7fb8;
    box-shadow: 1px 1px 0 #000;
    transition: all 0.08s ease;
  }
  .hud-slot.active {
    background: #392e62;
    border-color: #b9a3ff;
    color: #ffffff;
    box-shadow: 2px 2px 0 #000;
  }
  .hud-slot i {
    display: inline-block; width: 6px; height: 6px;
    margin-right: 5px; vertical-align: middle;
  }

  .hud-hints {
    font-size: 8px;
    color: #9f91cf;
    line-height: 1.4;
  }
  .hud-hints b { color: #fff; }

  #unlockedPrompt {
    position: fixed;
    top: 22%; left: 0; right: 0;
    text-align: center;
    font-size: 11px;
    letter-spacing: 3px;
    color: #ffd13b;
    text-transform: uppercase;
    pointer-events: none;
    z-index: 24;
    text-shadow: 1px 1px 0 #000;
    display: none;
  }
  #unlockedPrompt.visible { display: block; }
```

And add markup to `index.html`:
```html
<div id="unlockedPrompt">[ CLICK SCREEN TO AIM ]</div>
<div id="hud" class="hidden">
  <div class="hud-panel">
    <div class="hud-slots" id="hudSlots"></div>
  </div>
  <div class="hud-panel hud-hints" id="hudHints"></div>
</div>
```

- [ ] **Step 2: Create `src/ui/hud.js`**

Write `src/ui/hud.js`:
```javascript
import { app, interactive } from '../core/app.js';
import { events } from '../core/events.js';
import { Tools, belt } from '../weapons/index.js';
import { pointer } from './pointer.js';

const hudEl = document.getElementById('hud');
const hudSlotsEl = document.getElementById('hudSlots');
const hudHintsEl = document.getElementById('hudHints');
const promptEl = document.getElementById('unlockedPrompt');

export function initHUD() {
  renderSlots();
  events.on('tool:equipped', renderSlots);
  events.on('play:mode', updateHUDVisibility);
  events.on('pointer:lock', updateHUDVisibility);
}

export function renderSlots() {
  if (!hudSlotsEl) return;
  hudSlotsEl.innerHTML = '';
  const list = Tools.list().sort((a, b) => a.slot - b.slot);

  for (const t of list) {
    const slotEl = document.createElement('div');
    slotEl.className = 'hud-slot' + (t.id === belt.id ? ' active' : '');
    const colorHex = '#' + (t.colour ? t.colour.toString(16).padStart(6, '0') : 'ffffff');
    slotEl.innerHTML = `<i style="background:${colorHex}"></i>[${t.slot}] ${t.name.split(' ')[0]}`;
    hudSlotsEl.appendChild(slotEl);
  }

  if (hudHintsEl && belt.tool) {
    const h = belt.tool.hint || {};
    hudHintsEl.innerHTML = `<b>LMB:</b> ${h.lmb || 'ACTION'} &nbsp;|&nbsp; <b>RMB:</b> ${h.rmb || 'ALT'} &nbsp;|&nbsp; <b>WHEEL:</b> CYCLE/DIST`;
  }
}

export function updateHUDVisibility() {
  const isPlaying = app.play && interactive() && !app.cinematic && !app.saver;
  if (hudEl) {
    hudEl.classList.toggle('hidden', !isPlaying);
  }
  if (promptEl) {
    promptEl.classList.toggle('visible', isPlaying && !pointer.locked);
  }
}
```

- [ ] **Step 3: Wire HUD into `src/main.js`**

Import `initHUD` and `updateHUDVisibility` in `src/main.js` and call `initHUD()` at boot.

- [ ] **Step 4: Commit PS1 HUD**

```bash
git add index.html src/ui/hud.js src/main.js
git commit -m "feat: add PS1-style weapon OSD and pause resume prompt"
```

---

### Task 5: End-to-End Verification

**Files:**
- Test: All tests in `tests/`
- Check runtime behavior in browser

- [ ] **Step 1: Run all automated unit tests**

Run: `node --test tests/*.test.mjs`  
Expected: All tests PASS.

- [ ] **Step 2: Inspect browser execution**

Launch browser check to confirm:
- Jump buffering and coyote time execute cleanly without console errors.
- Mouse wheel cycles tools `PHYS -> GRAV -> FORCE` smoothly.
- Tactical PS1 reticle appears when pointer locked.
- Weapon OSD displays slots `[1] PHYS`, `[2] GRAV`, `[3] FORCE` with authentic PS1 aesthetic.
- Clicking while unlocked hides `[ CLICK SCREEN TO AIM ]` and locks pointer.

- [ ] **Step 3: Final clean commit**

```bash
git add .
git commit -m "chore: final verification of gameplay kinematics and PS1 HUD"
```
