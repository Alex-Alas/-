/* =========================================================
   AIM
   Where the tools point, and the beam they draw. Aiming always comes
   from the player's eye along their facing, so first and third person
   agree with the crosshair.
   ========================================================= */
import * as THREE from 'three';
import { scene } from '../render/scene.js';
import { makeMaterial } from '../render/shader.js';
import { sphereMesh, boneMesh } from '../render/shapes.js';
import { raycast } from '../physics/world.js';
import { player, playerEye, playerForward, muzzle } from '../entities/player.js';

import { camera } from '../camera/rig.js';
import { particles } from '../entities/buddy/skeleton.js';

export const aim = {
  origin: new THREE.Vector3(),
  dir: new THREE.Vector3(),
};

export function aimRay() {
  if (camera) {
    camera.getWorldPosition(aim.origin);
    camera.getWorldDirection(aim.dir);
  } else {
    playerEye(aim.origin);
    playerForward(aim.dir);
  }
  return aim;
}

const _toP = new THREE.Vector3();

/** Nearest thing under the crosshair. */
export function aimHit(maxDist = 120, filter = null, includeBuddy = true) {
  aimRay();
  const hit = raycast(aim.origin, aim.dir, maxDist, filter);
  let bestDist = hit ? hit.dist : maxDist;
  let buddyHit = null;

  if (includeBuddy && particles && particles.length) {
    for (const p of particles) {
      _toP.copy(p.pos).sub(aim.origin);
      const tca = _toP.dot(aim.dir);
      if (tca < 0) continue;
      const d2 = _toP.lengthSq() - tca * tca;
      const r = (p.radius || 0.3) * 1.5;
      if (d2 > r * r) continue;
      const thc = Math.sqrt(r * r - d2);
      const t = tca - thc;
      const d = t >= 0 ? t : tca + thc;
      if (d > 0 && d < bestDist) {
        bestDist = d;
        const pt = new THREE.Vector3().copy(aim.origin).addScaledVector(aim.dir, d);
        const norm = new THREE.Vector3().copy(pt).sub(p.pos).normalize();
        buddyHit = {
          body: null,
          particle: p,
          point: pt,
          normal: norm,
          dist: d,
          isBuddy: true,
        };
      }
    }
  }

  return buddyHit || hit;
}

/* ---------------------------------------------------------
   Beam — a stretched cylinder from the muzzle to a point
   --------------------------------------------------------- */
const beamMat = makeMaterial(0x8affe0, { alpha: 0.8 });
const beamMesh = boneMesh(0.035, beamMat, 5);
beamMesh.visible = false;
scene.add(beamMesh);

const tipMat = makeMaterial(0xd8fff4, { alpha: 0.9 });
const tipMesh = sphereMesh(0.13, tipMat, 0);
tipMesh.visible = false;
scene.add(tipMesh);

const _from = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Draw the beam this frame. Call every frame it should be visible. */
export function showBeam(to, color) {
  muzzle.getWorldPosition(_from);
  if (!player.enabled) return;
  _dir.copy(to).sub(_from);
  const len = _dir.length();
  if (len < 1e-4) return;

  beamMesh.visible = true;
  beamMesh.position.copy(_mid.copy(_from).add(to).multiplyScalar(0.5));
  beamMesh.scale.set(1, len, 1);
  beamMesh.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len));

  tipMesh.visible = true;
  tipMesh.position.copy(to);

  if (color !== undefined) {
    beamMat.uniforms.uColor.value.setHex(color);
    tipMat.uniforms.uColor.value.setHex(color);
  }
}

export function hideBeam() {
  beamMesh.visible = false;
  tipMesh.visible = false;
}

/** Beams are opt-in per frame: anything not redrawn disappears. */
export function beamFrameStart() {
  hideBeam();
}
