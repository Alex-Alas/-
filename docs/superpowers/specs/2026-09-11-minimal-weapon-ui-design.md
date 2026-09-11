# Minimal Weapon Selection UI Design

**Date:** 2026-09-11  
**Status:** Approved  
**Topic:** Minimal Weapon Selection UI & Dynamic Slot Drawer

## 1. Overview & Goals

Transform the weapon selection HUD from a persistent multi-slot bar into a minimal, low-profile tactical widget that stays out of the player's view during gameplay while providing full contextual feedback when cycling weapons.

### Goals
- Present an ultra-minimal resting state during gameplay displaying only the active weapon slot.
- Dynamically expand the full weapon belt drawer upon weapon cycle/selection (wheel or number keys `1`-`9`).
- Automatically collapse inactive slots back into the active badge after 2.0 seconds of inactivity.
- Ensure smooth CSS transitions (opacity, transform, max-width) consistent with the retro PS1 tactical aesthetic.
- Under no circumstances include emojis in any element, label, or hint text.

### Non-Goals
- Modifying weapon firing logic, projectile physics, or tool behaviors.
- Changing material picker or screen saver behaviors.

---

## 2. States and Transitions

```
+------------------------------------+
|           Resting State            |
|  [ ■ [1] PHYS ]                    |
|  (Only active weapon visible)      |
+------------------------------------+
                  |
      Weapon switch / cycle event
                  v
+------------------------------------+
|          Expanded State            |
|  [ ■ [1] PHYS ] [ [2] GRAV ] ...   |
|  [ LMB: USE | RMB: ALT ... ]       |
+------------------------------------+
                  |
         2.0s Timer expires
                  v
+------------------------------------+
|           Resting State            |
+------------------------------------+
```

### Resting State (Collapsed)
- The HUD widget sits in the lower-left corner (`bottom: 18px`, `left: 18px`).
- Only the currently active weapon slot is visible (`.hud-slot.active`).
- Inactive slots (`.hud-slot:not(.active)`) have `max-width: 0`, `opacity: 0`, `padding: 0`, and `overflow: hidden`, disappearing neatly without layout jitter.
- The control hints (`.hud-hints`) collapse into zero height / zero opacity to maximize viewport clarity.

### Expanded State (Active Switch)
- Triggered whenever:
  - `tool:equipped` event fires.
  - Hovered by cursor when pointer is unlocked.
- Inactive slots expand (`opacity: 1`, full width/padding) with a quick 0.12s transition.
- The control hints (`.hud-hints`) fade in cleanly underneath.
- An internal collapse timer resets to 2000ms. If another weapon switch occurs before 2000ms, the timer is cleared and restarted.
- When the timer fires, `#hud` returns to collapsed state unless hovered.

---

## 3. Component Architecture

### `index.html` (CSS & Markup)
- Consolidate `.hud-panel` styling to reduce visual clutter:
  - Streamline borders and padding.
  - Add transition classes for `#hud.collapsed` and `#hud.expanded`.
  - Animate `.hud-slot` entry/exit using CSS transitions on `max-width`, `opacity`, `margin`, and `padding`.
  - Animate `.hud-hints` slide/fade when collapsed.

### `src/ui/hud.js`
- Maintain collapse state: `isExpanded` (boolean) and `collapseTimer` (timeout reference).
- Function `expandHUD(durationMs = 2000)`:
  - Adds `.expanded` / removes `.collapsed` from `#hud`.
  - Clears existing timeout and schedules auto-collapse after `durationMs`.
- Function `collapseHUD()`:
  - Removes `.expanded` / adds `.collapsed` unless hovered.
- Event listeners:
  - Wire `tool:equipped` to call `expandHUD(2000)`.
  - Handle mouse enter/leave on `#hud` to hold expansion while interacting in unlocked mode.

---

## 4. Verification & Testing
- Unit test in `tests/hud-minimal.test.mjs` verifying timer scheduling, cancellation on rapid cycles, and collapsed/expanded class state transitions.
- Visual validation in browser verifying smooth collapse, proper slot highlight, and zero layout overflow.
