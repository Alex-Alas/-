/* =========================================================
   CAMERA RIG
   Owns the one camera and dispatches to whichever mode is active.
   Modes are registered (camera/modes/*.js), so adding a chase cam, a
   drone cam or a ragdoll-head cam never touches this file.
   ========================================================= */
import * as THREE from 'three';
import { Registry } from '../core/registry.js';
import { events } from '../core/events.js';
import { view } from '../render/renderer.js';

export const CameraModes = new Registry('cameraMode');

export const camera = new THREE.PerspectiveCamera(55, view.aspect, 0.3, 220);

/* Orbit state — shared by the director camera, the cinematic and the saver. */
export const camState = {
  theta: 0.38,
  phi: 1.18,
  radius: 10.5,
  target: new THREE.Vector3(0, 1.9, 0),
};

export const rig = { mode: 'orbit', prevMode: 'orbit' };

let shake = 0;
export const getShake = () => shake;
export function addShake(amount, cap = 0.75) { shake = Math.min(cap, shake + amount); }
export function setShake(v) { shake = v; }

export function setCameraMode(id) {
  const m = CameraModes.get(id);
  if (!m || rig.mode === id) return;
  const from = CameraModes.get(rig.mode);
  if (from && from.exit) from.exit();
  rig.prevMode = rig.mode;
  rig.mode = id;
  if (m.enter) m.enter();
  events.emit('camera:mode', m);
}

export function cycleCameraMode(ids) {
  const list = ids ? ids.map(i => CameraModes.get(i)).filter(Boolean) : CameraModes.list();
  if (!list.length) return;
  const i = list.findIndex(m => m.id === rig.mode);
  setCameraMode(list[(i + 1) % list.length].id);
}

export function updateCamera(dt) {
  const mode = CameraModes.get(rig.mode) || CameraModes.list()[0];
  if (mode) mode.update(dt, camera);

  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.9;
    camera.position.y += (Math.random() - 0.5) * shake * 0.9;
    camera.position.z += (Math.random() - 0.5) * shake * 0.9;
    camera.updateMatrixWorld();
  }
}

export function decayShake(dt) {
  if (shake > 0.0005) shake *= Math.pow(0.0025, dt);
  else shake = 0;
}

events.on('view:resize', (v) => {
  camera.aspect = v.aspect;
  camera.updateProjectionMatrix();
});
