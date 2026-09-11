# Gameplay Audit & PS1 Retro Controls/HUD Enhancement Specification

**Date:** 2026-09-11  
**Target Project:** Ragdoll Buddy Sandbox (`Cinematic-physics-test`)  
**Scope:** Approach B (Kinematics, Weapon Cycling, PS1-Style Reticle & Weapon OSD)

---

## 1. Overview
This specification addresses core gameplay feel, input responsiveness, and diegetic player feedback by introducing Source/indie-style kinematic enhancements and a retro PS1-era tactical on-screen display (OSD) and targeting reticle.

---

## 2. Player Kinematics & Movement System

### 2.1 Coyote Time
* **Duration:** 120ms (0.12s).
* **Mechanism:** 
  * When `player.onGround` transitions from `true` to `false` without a jump, `coyoteTimer` is initialized to `0.12`.
  * Every frame, `coyoteTimer -= dt`.
  * If a jump input occurs while `coyoteTimer > 0`, the player jumps with standard vertical impulse `PLAYER.jump` and `coyoteTimer` resets to `0`.

### 2.2 Jump Buffering
* **Duration:** 100ms (0.10s).
* **Mechanism:**
  * When `Space` is pressed while mid-air (outside coyote window), `jumpBufferTimer` is set to `0.10`.
  * Every frame, `jumpBufferTimer -= dt`.
  * When the player contacts the ground (`onGround === true`) and `jumpBufferTimer > 0`, the jump executes immediately and `jumpBufferTimer` resets to `0`.

### 2.3 Air Crouch-Jump (Leg Tucking)
* **Mechanism:**
  * When crouching mid-air (`!player.onGround && player.intent.crouch`), the capsule lowers its bottom radius offset or tucks upwards by `(PLAYER.height - PLAYER.crouchHeight)`.
  * This allows the player to mantle onto crates and platforms that are otherwise just out of reach of standard step-height.

---

## 3. Weapon Handling & Wheel Cycling

### 3.1 Mouse Wheel Tool Cycling
* **Mechanism:**
  * In [controls.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/ui/controls.js), mouse wheel triggers `events.emit('fire:scroll', dir)`.
  * In [weapons/index.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/index.js), `fire:scroll` asks `belt.tool?.scroll?.(dir)`.
  * If `scroll` returns `true` (indicating it was consumed by the tool, such as Physics Gun adjusting distance while holding a prop), nothing further happens.
  * If no object is held or the tool does not consume the scroll, `cycleTool(dir)` is called, cycling slots 1 (`physgun`), 2 (`gravgun`), and 3 (`forcegun`).

---

## 4. Retro PS1-Style Reticle & Weapon OSD

### 4.1 PS1 Tactical Reticle ([src/ui/crosshair.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/ui/crosshair.js))
* **Styling:**
  * Fixed at viewport center, rendered with pixelated borders and solid contrast.
  * Neutral state: 4 corner brackets `[   ]` around a 2x2 px center pip.
  * Target hover: Brackets clamp inward to frame interactable props with bright amber/green border.
  * Frozen target hover: Cyan bracket highlight indicating thawable object.
  * Active hold: Center pip lights up in the active tool's color (Cyan, Gold, or Pink).
* **Visibility:** Active only when `app.play && pointer.locked`.

### 4.2 PS1 Weapon OSD ([src/ui/hud.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/ui/hud.js))
* **Styling:**
  * Fixed at bottom-left corner with `#141026` dark background, `2px solid #4d3f7a` beveled borders, and hard `2px 2px 0 #000` drop shadows.
  * Uppercase monospace font with wide letter-spacing (`ui-monospace, "Courier New"`).
* **Display Elements:**
  * Slot badges: `[1] PHYS`, `[2] GRAV`, `[3] FORCE`. Active slot highlighted with solid color indicator and border glow.
  * Contextual controls bar: Displays active bindings (e.g., `LMB: GRAB`, `RMB: FREEZE`, `MWHEEL: DIST / CYCLE`).
  * Unlocked state banner: When in Play mode but pointer is unlocked, shows a retro flashing prompt `[ CLICK TO RESUME ]`.
* **State synchronization:**
  * Auto-hides during Screen Saver (`app.saver`), Cinematic Reel (`app.cinematic`), or Director Camera mode (`!app.play`).

---

## 5. File Architecture

* [src/entities/player.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/entities/player.js): Add coyote timer, jump buffer timer, and crouch-jump leg tuck logic in `stepPlayer`.
* [src/weapons/physgun.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/physgun.js): Return `true` in `scroll(dir)` when holding an object, `false` when idle.
* [src/weapons/index.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/index.js): Fall back to `cycleTool(dir)` when tool scroll is not consumed.
* [src/ui/hud.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/ui/hud.js): Create PS1 HUD and reticle system, listening to tool changes, pointer lock, and target raycasts.
* [src/main.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/main.js): Mount HUD tick/update loop and crosshair target evaluation.
* [index.html](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/index.html): Add PS1 HUD and crosshair markup and styling.

---

## 6. Verification & Acceptance Criteria
* Jumping within 120ms of running off an edge triggers without falling.
* Pressing jump 100ms before touching down triggers an instant jump upon landing.
* Crouching in mid-air lets the player mantle onto obstacle heights previously blocked.
* Rolling mouse wheel with no object held cycles weapons 1 -> 2 -> 3 -> 1.
* Crosshair is clearly visible and changes brackets when pointing at props.
* HUD matches the retro PS1 aesthetic of the existing canvas rendering.
