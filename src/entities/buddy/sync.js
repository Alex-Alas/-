/* =========================================================
   BUDDY VISUAL SYNC
   Pushes the solver's particle positions into the meshes: head basis,
   joint blobs, squash-and-stretch on the bones, melt fade-out.
   ========================================================= */
import * as THREE from 'three';
import { P } from './skeleton.js';
import { headGroup, jointMeshes, boneMeshes, PART_ORDER, partAlpha } from './meshes.js';
import { matDef } from './materials.js';
import { buddy } from './state.js';

const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const UP_VEC = new THREE.Vector3(0, 1, 0);

function syncHead() {
  _up.copy(P.head.pos).sub(P.chest.pos);
  if (_up.lengthSq() < 1e-8) _up.set(0, 1, 0); else _up.normalize();

  _right.copy(P.shoulderR.pos).sub(P.shoulderL.pos);
  if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0); else _right.normalize();

  _fwd.crossVectors(_right, _up);
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1); else _fwd.normalize();
  _right.crossVectors(_up, _fwd).normalize();

  _m4.makeBasis(_right, _up, _fwd);
  headGroup.quaternion.setFromRotationMatrix(_m4);
  headGroup.position.copy(P.head.pos);

  const meltK = buddy.melt;
  const base = matDef(buddy.material).radiusMul * 0.55 + 0.45;
  const hk = meltK > 0 ? partAlpha(PART_ORDER.head, meltK) : 1;
  headGroup.visible = hk > 0.02;
  headGroup.scale.setScalar(base * hk * (1 - meltK * 0.18));
}

function syncJoints() {
  const meltK = buddy.melt;
  const mul = matDef(buddy.material).radiusMul;
  for (const j of jointMeshes) {
    j.mesh.position.copy(j.p.pos);
    const k = meltK > 0 ? partAlpha(j.order, meltK) : 1;
    j.mesh.visible = k > 0.02;
    if (j.mesh.visible) j.mesh.scale.copy(j.base).multiplyScalar(mul * k);
  }
}

function syncBones() {
  const M = matDef(buddy.material);
  const thickness = M.boneThickness || 1.0;

  const meltK = buddy.melt;

  for (const b of boneMeshes) {
    _dir.copy(b.b.pos).sub(b.a.pos);
    const len = _dir.length();
    if (len < 1e-5) { b.mesh.visible = false; continue; }

    const melted = meltK > 0 ? partAlpha(b.order, meltK) : 1;
    b.mesh.visible = melted > 0.02 && len < b.restLen * 1.6;
    if (!b.mesh.visible) continue;

    _mid.copy(b.a.pos).add(b.b.pos).multiplyScalar(0.5);
    b.mesh.position.copy(_mid);

    _dir.divideScalar(len);
    b.mesh.quaternion.setFromUnitVectors(UP_VEC, _dir);

    /* --- volume-preserving squash & stretch ---
       A compressed bone bulges out sideways, a stretched one thins.
       Makes rubber (and melting slime) read as a soft squeezable mass. */
    const stretch = len / b.restLen;
    const squash = 1 / Math.sqrt(Math.max(0.35, stretch));
    const th = thickness * squash * melted;
    b.mesh.scale.set(th, len, th);
  }
}

export function syncAll() {
  syncHead();
  syncJoints();
  syncBones();
}

