/* =========================================================
   CONTROLS
   The one place that reads the keyboard and the mouse. Key actions are
   a registry, so a new binding is a register() call and never an edit to
   a switch statement. Movement is pushed into player.intent rather than
   read by the player, which keeps the character controller free of any
   idea that a keyboard exists.
   ========================================================= */
import { Registry } from '../core/registry.js';
import { events } from '../core/events.js';
import { app, interactive } from '../core/app.js';
import { clamp } from '../core/math.js';
import { canvas } from '../render/renderer.js';
import { rig, setCameraMode, camState } from '../camera/rig.js';
import { player, setPlayerEnabled, respawnPlayer } from '../entities/player.js';
import { pointer } from './pointer.js';

export const KeyActions = new Registry('keyAction');

export const keys = new Set();
export const mouse = { dx: 0, dy: 0, sensitivity: 0.0022, invert: false };

const MOVE_KEYS = {
  KeyW: ['forward', 1], KeyS: ['forward', -1],
  KeyA: ['strafe', -1], KeyD: ['strafe', 1],
  ArrowUp: ['forward', 1], ArrowDown: ['forward', -1],
  ArrowLeft: ['strafe', -1], ArrowRight: ['strafe', 1],
};

/** True when the player owns the camera and the mouse aims. */
export const inPlay = () => !!(app.play && interactive());

export function setPlayMode(on, cameraId) {
  app.play = on;
  setPlayerEnabled(on);
  if (on) {
    setCameraMode(cameraId || (rig.mode === 'first' ? 'first' : 'third'));
  } else {
    setCameraMode('orbit');
    document.exitPointerLock?.();
  }
  events.emit('play:mode', on);
}

/* ---------------------------------------------------------
   Pointer lock — the mouse aims while playing
   --------------------------------------------------------- */
canvas.addEventListener('click', () => {
  if (!inPlay()) return;
  if (!pointer.locked) canvas.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointer.locked = document.pointerLockElement === canvas;
  events.emit('pointer:lock', pointer.locked);
});

window.addEventListener('mousemove', (e) => {
  if (!pointer.locked || !inPlay()) return;
  const s = mouse.sensitivity;
  player.yaw -= e.movementX * s;
  player.pitch = clamp(player.pitch + (mouse.invert ? e.movementY : -e.movementY) * s, -1.45, 1.45);
});

/* Mouse buttons drive whatever tool is equipped. Controls does not know
   what the tools are; the weapon layer listens. */
window.addEventListener('mousedown', (e) => {
  if (!inPlay() || !pointer.locked) return;
  e.preventDefault();
  if (e.button === 0) events.emit('fire:primary', true);
  else if (e.button === 2) events.emit('fire:secondary', true);
  else if (e.button === 1) events.emit('fire:middle', true);
});

window.addEventListener('mouseup', (e) => {
  if (!inPlay()) return;
  if (e.button === 0) events.emit('fire:primary', false);
  else if (e.button === 2) events.emit('fire:secondary', false);
});

window.addEventListener('contextmenu', (e) => { if (inPlay()) e.preventDefault(); });

window.addEventListener('wheel', (e) => {
  if (!inPlay() || !pointer.locked) return;
  events.emit('fire:scroll', Math.sign(e.deltaY));
}, { passive: true });

/* ---------------------------------------------------------
   Keyboard
   --------------------------------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);

  for (const a of KeyActions.list()) {
    if (a.code !== e.code) continue;
    if (a.when && !a.when()) continue;
    e.preventDefault();
    a.down?.();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  for (const a of KeyActions.list()) {
    if (a.code === e.code && (!a.when || a.when())) a.up?.();
  }
});

window.addEventListener('blur', () => keys.clear());

/** Push this frame's movement wishes into the player. */
export function updateIntent() {
  const it = player.intent;
  it.forward = 0;
  it.strafe = 0;
  if (inPlay() && pointer.locked) {
    for (const code in MOVE_KEYS) {
      if (!keys.has(code)) continue;
      const [axis, dir] = MOVE_KEYS[code];
      it[axis] += dir;
    }
    it.forward = clamp(it.forward, -1, 1);
    it.strafe = clamp(it.strafe, -1, 1);
    it.jump = keys.has('Space');
    it.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    it.crouch = keys.has('ControlLeft') || keys.has('ControlRight');
  } else {
    it.jump = false; it.run = false; it.crouch = false;
  }
}

/* ---------------------------------------------------------
   Bindings that belong to movement and cameras. Tools, spawning and
   world toggles register their own elsewhere.
   --------------------------------------------------------- */
KeyActions.register({
  id: 'camera-toggle', code: 'KeyV', label: 'V', hint: 'first / third person',
  down: () => { if (inPlay()) setCameraMode(rig.mode === 'first' ? 'third' : 'first'); },
});

KeyActions.register({
  id: 'director', code: 'KeyC', label: 'C', hint: 'director camera',
  down: () => {
    if (!interactive()) return;
    if (app.play) {
      camState.target.set(player.pos.x, player.pos.y + 1.9, player.pos.z);
      setPlayMode(false);
    } else {
      setPlayMode(true);
    }
  },
});

KeyActions.register({
  id: 'respawn', code: 'KeyK', label: 'K', hint: 'respawn where you started',
  down: () => { if (app.play) respawnPlayer(); },
});
