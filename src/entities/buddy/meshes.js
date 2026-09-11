/* =========================================================
   BUDDY MESHES
   The visible creature: head group, joint blobs and bone cylinders,
   every one registered against a palette key so a material swap is a
   single pass over colorTargets.
   ========================================================= */
import * as THREE from 'three';
import { scene } from '../../render/scene.js';
import { makeMaterial, flat } from '../../render/shader.js';
import { sphereMesh, boneMesh } from '../../render/shapes.js';
import { P } from './skeleton.js';

export const colorTargets = [];
function reg(mesh, key) { colorTargets.push({ mat: mesh.material, key }); return mesh; }

const matHead  = makeMaterial(0x9ff2cd);
const matBody  = makeMaterial(0x7de3b8);
const matLimb  = makeMaterial(0x6fd3ab);
const matBelly = makeMaterial(0xffe9a8);
const matEyeW  = makeMaterial(0xf6fcff);
const matEyeD  = makeMaterial(0x1a1226);
const matCheek = makeMaterial(0xff9ec2);
const matEar   = makeMaterial(0x8ae8c0);
const matEarIn = makeMaterial(0xff9ec2);


export const headGroup = new THREE.Group();
scene.add(headGroup);
headGroup.add(reg(sphereMesh(0.56, matHead, 1), 'head'));

for (const s of [-1, 1]) {
  const ear = reg(new THREE.Mesh(flat(new THREE.ConeGeometry(0.17, 0.34, 4)), matEar), 'ear');
  ear.position.set(s * 0.27, 0.45, -0.02);
  ear.rotation.z = -s * 0.34; ear.rotation.y = Math.PI / 4;
  headGroup.add(ear);

  const inner = reg(new THREE.Mesh(flat(new THREE.ConeGeometry(0.09, 0.20, 4)), matEarIn), 'earIn');
  inner.position.set(s * 0.28, 0.48, 0.03);
  inner.rotation.z = -s * 0.34; inner.rotation.y = Math.PI / 4;
  headGroup.add(inner);
}

for (const e of [
  { x: -0.21, y: 0.10, z: 0.435, pr: 0.078, px: -0.155, py: 0.10 },
  { x:  0.21, y: 0.07, z: 0.435, pr: 0.066, px:  0.245, py: 0.09 },
]) {
  const white = reg(sphereMesh(0.135, matEyeW, 1), 'eyeW');
  white.position.set(e.x, e.y, e.z);
  headGroup.add(white);

  const pupil = reg(sphereMesh(e.pr, matEyeD, 1), 'eyeD');
  pupil.position.set(e.px, e.py, 0.53);
  headGroup.add(pupil);
}

for (const s of [-1, 1]) {
  const cheek = reg(sphereMesh(0.10, matCheek, 0), 'cheek');
  cheek.position.set(s * 0.36, -0.13, 0.37);
  headGroup.add(cheek);
}

const mouth = reg(sphereMesh(0.09, matEyeD, 0), 'eyeD');
mouth.position.set(0, -0.18, 0.47);
mouth.scale.set(1.6, 0.65, 0.6);
headGroup.add(mouth);

/* Melt ordering: the extremities liquefy first, the head last. A part is
   fully solid until `melt` passes its order, then dissolves over MELT_WINDOW. */
const MELT_WINDOW = 0.30;
export const PART_ORDER = {
  handL: 0.00, handR: 0.00,
  footL: 0.05, footR: 0.05,
  elbowL: 0.17, elbowR: 0.17,
  kneeL: 0.21, kneeR: 0.21,
  shoulderL: 0.36, shoulderR: 0.36,
  hip: 0.47, chest: 0.58, head: 0.70,
};
export function partAlpha(order, melt) {
  if (melt <= order) return 1;
  const k = 1 - (melt - order) / MELT_WINDOW;
  return k < 0 ? 0 : k;
}

const jointData = [
  ['chest',     0.36,  matBelly, 1, 'belly'],
  ['hip',       0.33,  matBody,  1, 'body'],
  ['shoulderL', 0.155, matLimb,  1, 'limb'],
  ['shoulderR', 0.155, matLimb,  1, 'limb'],
  ['elbowL',    0.135, matLimb,  0, 'limb'],
  ['elbowR',    0.135, matLimb,  0, 'limb'],
  ['handL',     0.175, matLimb,  1, 'limb'],
  ['handR',     0.175, matLimb,  1, 'limb'],
  ['kneeL',     0.145, matLimb,  0, 'limb'],
  ['kneeR',     0.145, matLimb,  0, 'limb'],
  ['footL',     0.19,  matLimb,  1, 'limb'],
  ['footR',     0.19,  matLimb,  1, 'limb'],
];
export const jointMeshes = [];
for (const [name, r, mat, det, key] of jointData) {
  const m = reg(sphereMesh(r, mat, det), key);
  const base = new THREE.Vector3(1, 1, 1);
  if (name === 'footL' || name === 'footR') base.set(1.15, 0.85, 1.35);
  m.scale.copy(base);
  scene.add(m);
  jointMeshes.push({ mesh: m, p: P[name], base, order: PART_ORDER[name] });
}

const boneData = [
  ['chest', 'hip',       0.30,  matBelly, 8],
  ['shoulderL', 'elbowL', 0.105, matLimb, 6],
  ['elbowL', 'handL',    0.095, matLimb, 6],
  ['shoulderR', 'elbowR', 0.105, matLimb, 6],
  ['elbowR', 'handR',    0.095, matLimb, 6],
  ['hip', 'kneeL',       0.125, matLimb, 6],
  ['kneeL', 'footL',     0.115, matLimb, 6],
  ['hip', 'kneeR',       0.125, matLimb, 6],
  ['kneeR', 'footR',     0.115, matLimb, 6],
  ['chest', 'shoulderL', 0.130, matLimb, 6],
  ['chest', 'shoulderR', 0.130, matLimb, 6],
];
export const boneMeshes = [];
for (const [a, b, r, mat, seg] of boneData) {
  const m = reg(boneMesh(r, mat, seg), a === 'chest' && b === 'hip' ? 'belly' : 'limb');
  scene.add(m);
  const pa = P[a], pb = P[b];
  boneMeshes.push({
    mesh: m, a: pa, b: pb,
    restLen: pa.pos.distanceTo(pb.pos),
    order: Math.min(PART_ORDER[a], PART_ORDER[b]),
  });
}

