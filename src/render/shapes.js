/* Flat-shaded primitives every entity builds from. */
import * as THREE from 'three';
import { flat } from './shader.js';

export function sphereMesh(r, mat, detail = 1) {
  return new THREE.Mesh(flat(new THREE.IcosahedronGeometry(r, detail)), mat);
}

export function boneMesh(r, mat, seg = 7) {
  return new THREE.Mesh(flat(new THREE.CylinderGeometry(r, r, 1, seg, 1, false)), mat);
}

export function boxMesh(sx, sy, sz, mat) {
  return new THREE.Mesh(flat(new THREE.BoxGeometry(sx, sy, sz)), mat);
}
