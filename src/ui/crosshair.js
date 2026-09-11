/* =========================================================
   CROSSHAIR
   Tactical PS1-style reticle with dynamic lock-on brackets
   and hit detection for grabbable and frozen sandbox props.
   ========================================================= */
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

  // Active carrying check from equipped tool
  const isCarrying = !!(belt.tool?.isHolding?.());
  crosshairEl.classList.toggle('carrying', isCarrying);
}
