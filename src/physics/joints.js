/* =========================================================
   JOINTS
   Two constraint types cover the whole tool kit: a point-to-point
   constraint (three of them, at non-collinear anchors, make a weld) and
   a rope that only pulls. Both are solved with impulses against the same
   bodies the contact solver uses, in the same step, so a roped crate
   still stacks and collides normally.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { scene } from '../render/scene.js';
import { makeMaterial } from '../render/shader.js';
import { boneMesh } from '../render/shapes.js';

export const joints = [];

const BETA = 0.2;
const ITER = 6;

const _rA = new THREE.Vector3();
const _rB = new THREE.Vector3();
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _c = new THREE.Vector3();
const _vrel = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _K = new THREE.Matrix3();
const _skewA = new THREE.Matrix3();
const _skewB = new THREE.Matrix3();
const _m = new THREE.Matrix3();

const ropeMat = makeMaterial(0xd8d0ff);

function skew(v, out) {
  // column-major: [ 0 vz -vy | -vz 0 vx | vy -vx 0 ]
  const e = out.elements;
  e[0] = 0;    e[1] = v.z;  e[2] = -v.y;
  e[3] = -v.z; e[4] = 0;    e[5] = v.x;
  e[6] = v.y;  e[7] = -v.x; e[8] = 0;
  return out;
}

/** world anchor -> body local */
function toLocal(body, world, out) {
  const m = body.rmat.elements;
  const x = world.x - body.pos.x, y = world.y - body.pos.y, z = world.z - body.pos.z;
  return out.set(x * m[0] + y * m[1] + z * m[2],
                 x * m[3] + y * m[4] + z * m[5],
                 x * m[6] + y * m[7] + z * m[8]);
}

function worldAnchor(body, local, out) {
  const m = body.rmat.elements;
  return out.set(
    body.pos.x + m[0] * local.x + m[3] * local.y + m[6] * local.z,
    body.pos.y + m[1] * local.x + m[4] * local.y + m[7] * local.z,
    body.pos.z + m[2] * local.x + m[5] * local.y + m[8] * local.z
  );
}

function makeJoint(kind, a, b, anchorA, anchorB, opts = {}) {
  const j = {
    kind, a, b,
    localA: toLocal(a, anchorA, new THREE.Vector3()),
    localB: b ? toLocal(b, anchorB, new THREE.Vector3()) : anchorB.clone(),
    length: opts.length || 0,
    group: opts.group || null,       // tools remove a whole group at once
    mesh: null,
    broken: false,
  };
  if (opts.visible) {
    j.mesh = boneMesh(opts.thickness || 0.06, ropeMat, 5);
    scene.add(j.mesh);
  }
  joints.push(j);
  events.emit('joint:added', j);
  return j;
}

/** Three of these at spread anchors lock two bodies together. */
export function addPoint(a, b, anchorA, anchorB, opts) {
  return makeJoint('point', a, b, anchorA, anchorB || anchorA, opts);
}

/** A rope pulls but never pushes. */
export function addRope(a, b, anchorA, anchorB, length, opts = {}) {
  return makeJoint('rope', a, b, anchorA, anchorB, { ...opts, length, visible: opts.visible !== false });
}

/** Weld two bodies: three point constraints at spread anchors. */
export function weld(a, b) {
  const group = Symbol('weld');
  const mid = new THREE.Vector3().copy(a.pos).add(b.pos).multiplyScalar(0.5);
  const spread = Math.max(0.35, a.half.length() * 0.5);
  const out = [];
  for (const off of [[spread, 0, 0], [0, spread, 0], [0, 0, spread]]) {
    const p = new THREE.Vector3(mid.x + off[0], mid.y + off[1], mid.z + off[2]);
    out.push(addPoint(a, b, p, p, { group }));
  }
  return { group, joints: out };
}

export function removeJoint(j) {
  const i = joints.indexOf(j);
  if (i >= 0) joints.splice(i, 1);
  if (j.mesh) { scene.remove(j.mesh); j.mesh = null; }
}

export function removeJointGroup(group) {
  for (let i = joints.length - 1; i >= 0; i--) {
    if (joints[i].group === group) removeJoint(joints[i]);
  }
}

export function removeJointsOf(body) {
  /* Collect first: removing a weld drops three entries at once, and
     walking the live array past that is how you read off the end of it. */
  const doomed = new Set();
  const groups = new Set();
  for (const j of joints) {
    if (j.a !== body && j.b !== body) continue;
    if (j.group) groups.add(j.group);
    else doomed.add(j);
  }
  for (const j of doomed) removeJoint(j);
  for (const g of groups) removeJointGroup(g);
}

/* ---------------------------------------------------------
   Solve
   --------------------------------------------------------- */
function relativeVelocity(a, b, out) {
  out.set(0, 0, 0);
  if (b) {
    out.copy(b.vel);
    _tmp.copy(b.angVel).cross(_rB);
    out.add(_tmp);
  }
  _tmp.copy(a.angVel).cross(_rA);
  out.sub(_tmp).sub(a.vel);
  return out;
}

function applyImpulses(a, b, imp) {
  if (!a.immovable) {
    a.vel.addScaledVector(imp, -a.invMass);
    _tmp.copy(_rA).cross(imp).applyMatrix3(a.invInertiaWorld);
    a.angVel.sub(_tmp);
    a.wake();
  }
  if (b && !b.immovable) {
    b.vel.addScaledVector(imp, b.invMass);
    _tmp.copy(_rB).cross(imp).applyMatrix3(b.invInertiaWorld);
    b.angVel.add(_tmp);
    b.wake();
  }
}

/** K = (1/mA + 1/mB) I - skew(rA) IA skew(rA) - skew(rB) IB skew(rB) */
function buildK(a, b) {
  const e = _K.elements;
  const im = a.invMass + (b ? b.invMass : 0);
  e[0] = im; e[1] = 0; e[2] = 0;
  e[3] = 0; e[4] = im; e[5] = 0;
  e[6] = 0; e[7] = 0; e[8] = im;

  if (!a.immovable) {
    skew(_rA, _skewA);
    _m.copy(_skewA).multiply(a.invInertiaWorld).multiply(_skewA);
    for (let i = 0; i < 9; i++) e[i] -= _m.elements[i];
  }
  if (b && !b.immovable) {
    skew(_rB, _skewB);
    _m.copy(_skewB).multiply(b.invInertiaWorld).multiply(_skewB);
    for (let i = 0; i < 9; i++) e[i] -= _m.elements[i];
  }
  return _K;
}

export function solveJoints(dt) {
  if (joints.length === 0) return;

  for (let it = 0; it < ITER; it++) {
    for (const j of joints) {
      const a = j.a, b = j.b;
      if (a.removed || (b && b.removed)) continue;

      worldAnchor(a, j.localA, _pA);
      _rA.copy(_pA).sub(a.pos);
      if (b) {
        worldAnchor(b, j.localB, _pB);
        _rB.copy(_pB).sub(b.pos);
      } else {
        _pB.copy(j.localB);       // anchored to a point in the world
        _rB.set(0, 0, 0);
      }

      _c.copy(_pB).sub(_pA);

      if (j.kind === 'rope') {
        const dist = _c.length();
        if (dist <= j.length || dist < 1e-6) continue;
        _c.divideScalar(dist);                  // direction A -> B
        const vn = relativeVelocity(a, b, _vrel).dot(_c);
        const bias = (BETA / dt) * (dist - j.length);
        const k = buildK(a, b);
        const kn = _c.dot(_tmp.copy(_c).applyMatrix3(k));
        if (kn < 1e-9) continue;
        const lambda = -(vn + bias) / kn;
        if (lambda > 0) continue;               // ropes only pull
        applyImpulses(a, b, _imp.copy(_c).multiplyScalar(lambda));
        continue;
      }

      /* point-to-point: drive the anchors together. The bias adds to the
         relative velocity before it is negated — subtracting it feeds the
         positional error back in and the weld flies apart. */
      relativeVelocity(a, b, _vrel);
      _vrel.addScaledVector(_c, BETA / dt);
      const k = buildK(a, b);
      const inv = _m.copy(k).invert();
      _imp.copy(_vrel).applyMatrix3(inv).multiplyScalar(-1);
      applyImpulses(a, b, _imp);
    }
  }
}

const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function syncJointMeshes() {
  for (const j of joints) {
    if (!j.mesh) continue;
    worldAnchor(j.a, j.localA, _pA);
    if (j.b) worldAnchor(j.b, j.localB, _pB); else _pB.copy(j.localB);
    _mid.copy(_pA).add(_pB).multiplyScalar(0.5);
    _dir.copy(_pB).sub(_pA);
    const len = _dir.length();
    j.mesh.position.copy(_mid);
    j.mesh.scale.set(1, Math.max(0.01, len), 1);
    if (len > 1e-5) j.mesh.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len));
  }
}
