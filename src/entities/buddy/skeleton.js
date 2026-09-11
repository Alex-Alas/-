/* =========================================================
   BUDDY SKELETON — verlet particles & distance constraints
   Thirteen point masses and the constraints that hold them in the shape
   of a small creature. Positions are integrated by softbody.js; the
   meshes only ever read from here.
   ========================================================= */
import * as THREE from 'three';

export class Particle {
  constructor(x, y, z, mass, radius) {
    this.pos = new THREE.Vector3(x, y, z);
    this.prev = new THREE.Vector3(x, y, z);
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.radius = radius;
    this.grabbed = false;
    this._invMass = this.invMass;
  }
}

export const P = {};
export const particles = [];

export const defs = {
  head:      [ 0.00, 3.30,  0.00, 1.0, 0.30],
  chest:     [ 0.00, 2.62,  0.00, 1.6, 0.34],
  hip:       [ 0.00, 1.80,  0.00, 1.6, 0.32],
  shoulderL: [-0.44, 2.80,  0.00, 0.7, 0.15],
  shoulderR: [ 0.44, 2.80,  0.00, 0.7, 0.15],
  elbowL:    [-0.72, 2.12,  0.00, 0.5, 0.13],
  elbowR:    [ 0.72, 2.12,  0.00, 0.5, 0.13],
  handL:     [-0.84, 1.46,  0.00, 0.5, 0.17],
  handR:     [ 0.84, 1.46,  0.00, 0.5, 0.17],
  kneeL:     [-0.28, 1.02,  0.00, 0.8, 0.14],
  kneeR:     [ 0.28, 1.02,  0.00, 0.8, 0.14],
  footL:     [-0.30, 0.24,  0.06, 0.6, 0.18],
  footR:     [ 0.30, 0.24,  0.06, 0.6, 0.18],
};

for (const name in defs) {
  const d = defs[name];
  const p = new Particle(d[0], d[1], d[2], d[3], d[4]);
  P[name] = p;
  particles.push(p);
}

export const MODE = { eq: 0, min: 1, max: 2 };
export const constraints = [];

const constraintDefs = [
  ['head', 'chest',       1.00, 'eq'],
  ['chest', 'hip',        1.00, 'eq'],
  ['head', 'hip',         0.55, 'min'],
  ['chest', 'shoulderL',  1.00, 'eq'],
  ['chest', 'shoulderR',  1.00, 'eq'],
  ['shoulderL', 'shoulderR', 1.00, 'eq'],
  ['shoulderL', 'hip',    0.80, 'eq'],
  ['shoulderR', 'hip',    0.80, 'eq'],
  ['shoulderL', 'elbowL', 1.00, 'eq'],
  ['elbowL', 'handL',     1.00, 'eq'],
  ['shoulderR', 'elbowR', 1.00, 'eq'],
  ['elbowR', 'handR',     1.00, 'eq'],
  ['shoulderL', 'handL',  0.45, 'min'],
  ['shoulderR', 'handR',  0.45, 'min'],
  ['hip', 'kneeL',        1.00, 'eq'],
  ['kneeL', 'footL',      1.00, 'eq'],
  ['hip', 'kneeR',        1.00, 'eq'],
  ['kneeR', 'footR',      1.00, 'eq'],
  ['hip', 'footL',        0.45, 'min'],
  ['hip', 'footR',        0.45, 'min'],
  ['kneeL', 'kneeR',      0.35, 'min'],
  ['handL', 'handR',      0.20, 'min'],
];

for (const [a, b, s, mode] of constraintDefs) {
  const pa = P[a], pb = P[b];
  const rest = pa.pos.distanceTo(pb.pos) * s;
  constraints.push({
    a: pa, b: pb, rest, mode: MODE[mode],
    stiffness: 1.0, broken: false, breakAt: 0, repairTimer: 0,
  });
}

