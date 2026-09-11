/* =========================================================
   POINTER INPUT — director mode
   Grab the buddy, shove the puddle, orbit the void. Play-mode aiming
   lives in ui/controls.js; this module only runs the mouse-driven
   sandbox toys.
   ========================================================= */
import * as THREE from 'three';
import { app, interactive } from '../core/app.js';
import { events } from '../core/events.js';
import { view, canvas } from '../render/renderer.js';
import { camera, camState } from '../camera/rig.js';
import { magnetTarget } from '../physics/sim.js';
import { FL, finger } from '../physics/fluid.js';
import { particles } from '../entities/buddy/skeleton.js';
import { buddy } from '../entities/buddy/state.js';
import { pointer } from './pointer.js';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const grabPlane = new THREE.Plane();
const fluidPlane = new THREE.Plane();
const _fluidCentre = new THREE.Vector3();
const magnetPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.5);
const hitPoint = new THREE.Vector3();
const camDir = new THREE.Vector3();

let lastX = 0, lastY = 0;

export function toBuffer(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * view.w,
    y: ((clientY - r.top) / r.height) * view.h,
  };
}

export function findParticleNear(bx, by, maxDist) {
  let best = null, bestD = maxDist;
  const v = new THREE.Vector3();
  for (const p of particles) {
    v.copy(p.pos).project(camera);
    const sx = (v.x * 0.5 + 0.5) * view.w;
    const sy = (-v.y * 0.5 + 0.5) * view.h;
    const d = Math.hypot(sx - bx, sy - by);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  if (app.play) return;              // playing: the mouse aims, it does not grab
  e.preventDefault();
  if (app.saver) { events.emit('saver:wake'); return; }
  if (app.cinematic) { events.emit('cinematic:skip'); return; }
  canvas.setPointerCapture(e.pointerId);

  const { x, y } = toBuffer(e.clientX, e.clientY);

  /* once he is mostly liquid there is no body left to grab — the pointer
     becomes a finger that shoves the fluid around instead */
  if (FL.n > 0 && buddy.melt > 0.35) {
    ndc.x = (x / view.w) * 2 - 1;
    ndc.y = -(y / view.h) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(camDir);
    fluidPlane.setFromNormalAndCoplanarPoint(camDir, _fluidCentre.set(FL.cx, FL.cy, FL.cz));
    if (raycaster.ray.intersectPlane(fluidPlane, hitPoint)) {
      finger.on = true;
      finger.x = hitPoint.x; finger.y = Math.max(FL.rad, hitPoint.y); finger.z = hitPoint.z;
      finger.px = finger.x; finger.py = finger.y; finger.pz = finger.z;
      finger.vx = finger.vy = finger.vz = 0;
      canvas.classList.add('grabbing');
      lastX = e.clientX; lastY = e.clientY;
      return;
    }
  }

  const p = findParticleNear(x, y, 24);

  if (p) {
    pointer.dragging = p;
    p.grabbed = true;
    p._invMass = p.invMass;
    p.invMass = 0;
    canvas.classList.add('grabbing');
    camera.getWorldDirection(camDir);
    grabPlane.setFromNormalAndCoplanarPoint(camDir, p.pos);
  } else {
    pointer.orbiting = true;
    canvas.classList.add('grabbing');
  }

  lastX = e.clientX;
  lastY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (app.play) return;
  const { x, y } = toBuffer(e.clientX, e.clientY);

  ndc.x = (x / view.w) * 2 - 1;
  ndc.y = -(y / view.h) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(magnetPlane, hitPoint)) {
    if (interactive()) magnetTarget.copy(hitPoint);
  }

  if (finger.on) {
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(fluidPlane, hitPoint)) {
      finger.x = hitPoint.x;
      finger.y = Math.max(FL.rad, hitPoint.y);
      finger.z = hitPoint.z;
    }
    lastX = e.clientX; lastY = e.clientY;
    return;
  }

  if (!interactive() || (!pointer.dragging && !pointer.orbiting)) { lastX = e.clientX; lastY = e.clientY; return; }

  if (pointer.dragging) {
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(grabPlane, hitPoint)) {
      pointer.dragging.pos.copy(hitPoint);
      pointer.dragging.prev.lerp(pointer.dragging.pos, 0.85);
    }
  } else if (pointer.orbiting) {
    camState.theta -= (e.clientX - lastX) * 0.007;
    camState.phi -= (e.clientY - lastY) * 0.006;
    camState.phi = Math.max(0.35, Math.min(1.62, camState.phi));
  }

  lastX = e.clientX;
  lastY = e.clientY;
});

function endPointer() {
  finger.on = false;
  const d = pointer.dragging;
  if (d) {
    d.invMass = d._invMass;
    d.grabbed = false;
    pointer.dragging = null;
  }
  pointer.orbiting = false;
  canvas.classList.remove('grabbing');
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

