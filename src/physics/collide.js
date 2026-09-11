/* =========================================================
   NARROWPHASE
   Contact generation for the shapes the sandbox uses: sphere/sphere,
   sphere/box and box/box by separating-axis test with face clipping.
   Face clipping matters: a box resting on a box needs four contact
   points, not one, or stacks wobble and walk.

   Convention: a contact normal points from A toward B, and `point` is
   the world-space position of the contact.
   ========================================================= */
import * as THREE from 'three';
import { SHAPE } from './rigidbody.js';

const EPS = 1e-8;

export class Contact {
  constructor() {
    this.a = null; this.b = null;
    this.normal = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.depth = 0;
    this.key = 0;                 // feature id, for warm starting
    this.nImp = 0; this.t1Imp = 0; this.t2Imp = 0;
    this.t1 = new THREE.Vector3();
    this.t2 = new THREE.Vector3();
    this.rA = new THREE.Vector3();
    this.rB = new THREE.Vector3();
    this.nMass = 0; this.t1Mass = 0; this.t2Mass = 0;
    this.bounce = 0;
    this.friction = 0.5;
    this.local = new THREE.Vector3();   // contact point in the reference frame
    this.penetration = 0;
    this.pImp = 0;
  }
}

/* Contacts are pooled: a step generates hundreds and allocating them
   would dominate the frame. */
const pool = [];
let poolUsed = 0;
export function resetContacts() { poolUsed = 0; }
function take(a, b) {
  if (poolUsed === pool.length) pool.push(new Contact());
  const c = pool[poolUsed++];
  c.a = a; c.b = b; c.key = 0;
  c.nImp = 0; c.t1Imp = 0; c.t2Imp = 0;
  return c;
}

const _d = new THREE.Vector3();
const _local = new THREE.Vector3();
const _clamped = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();

/** World vector -> body local. */
function toLocal(body, v, out) {
  const m = body.rmat.elements;
  const x = v.x - body.pos.x, y = v.y - body.pos.y, z = v.z - body.pos.z;
  return out.set(
    x * m[0] + y * m[1] + z * m[2],
    x * m[3] + y * m[4] + z * m[5],
    x * m[6] + y * m[7] + z * m[8]
  );
}

/** Body local -> world. */
function toWorld(body, v, out) {
  const m = body.rmat.elements;
  return out.set(
    body.pos.x + m[0] * v.x + m[3] * v.y + m[6] * v.z,
    body.pos.y + m[1] * v.x + m[4] * v.y + m[7] * v.z,
    body.pos.z + m[2] * v.x + m[5] * v.y + m[8] * v.z
  );
}

/** Column `i` of a body's rotation matrix: its local axis in world space. */
export function axis(body, i, out) {
  const m = body.rmat.elements;
  return out.set(m[i * 3], m[i * 3 + 1], m[i * 3 + 2]);
}

/* ---------------------------------------------------------
   sphere / sphere
   --------------------------------------------------------- */
function sphereSphere(a, b, out) {
  _d.copy(b.pos).sub(a.pos);
  const rsum = a.radius + b.radius;
  const d2 = _d.lengthSq();
  if (d2 >= rsum * rsum) return;
  const d = Math.sqrt(d2);
  const c = take(a, b);
  if (d > EPS) c.normal.copy(_d).divideScalar(d);
  else c.normal.set(0, 1, 0);
  c.depth = rsum - d;
  c.point.copy(a.pos).addScaledVector(c.normal, a.radius - c.depth * 0.5);
  out.push(c);
}

/* ---------------------------------------------------------
   sphere / box   (sphere is A, box is B; flip handles the reverse)
   --------------------------------------------------------- */
function sphereBox(sphere, box, out, flipped) {
  toLocal(box, sphere.pos, _local);
  _clamped.set(
    Math.max(-box.half.x, Math.min(_local.x, box.half.x)),
    Math.max(-box.half.y, Math.min(_local.y, box.half.y)),
    Math.max(-box.half.z, Math.min(_local.z, box.half.z))
  );

  _d.copy(_local).sub(_clamped);
  const d2 = _d.lengthSq();
  const r = sphere.radius;

  let depth, nx, ny, nz;
  if (d2 > EPS) {
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    depth = r - d;
    // local normal points from the box surface out toward the sphere
    nx = _d.x / d; ny = _d.y / d; nz = _d.z / d;
  } else {
    // centre inside the box: escape along the least-penetrated face
    const px = box.half.x - Math.abs(_local.x);
    const py = box.half.y - Math.abs(_local.y);
    const pz = box.half.z - Math.abs(_local.z);
    if (px <= py && px <= pz) { nx = Math.sign(_local.x) || 1; ny = 0; nz = 0; depth = r + px; }
    else if (py <= pz)        { nx = 0; ny = Math.sign(_local.y) || 1; nz = 0; depth = r + py; }
    else                      { nx = 0; ny = 0; nz = Math.sign(_local.z) || 1; depth = r + pz; }
    _clamped.set(
      nx ? nx * box.half.x : _local.x,
      ny ? ny * box.half.y : _local.y,
      nz ? nz * box.half.z : _local.z
    );
  }

  _n.set(nx, ny, nz);
  const m = box.rmat.elements;
  const wx = m[0] * _n.x + m[3] * _n.y + m[6] * _n.z;
  const wy = m[1] * _n.x + m[4] * _n.y + m[7] * _n.z;
  const wz = m[2] * _n.x + m[5] * _n.y + m[8] * _n.z;

  const c = flipped ? take(box, sphere) : take(sphere, box);
  // normal from sphere to box is the negation of "box surface -> sphere"
  if (flipped) c.normal.set(wx, wy, wz);
  else c.normal.set(-wx, -wy, -wz);
  c.depth = depth;
  toWorld(box, _clamped, c.point);
  out.push(c);
}

/* ---------------------------------------------------------
   box / box — separating axis test
   --------------------------------------------------------- */
const _C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const _absC = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const _tA = [0, 0, 0];
const _ax = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _bx = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _poly = [];
const _clip = [];
for (let i = 0; i < 16; i++) { _poly.push(new THREE.Vector3()); _clip.push(new THREE.Vector3()); }
const _refN = new THREE.Vector3();
const _tmpV = new THREE.Vector3();

function boxBox(a, b, out) {
  for (let i = 0; i < 3; i++) { axis(a, i, _ax[i]); axis(b, i, _bx[i]); }
  _d.copy(b.pos).sub(a.pos);
  for (let i = 0; i < 3; i++) _tA[i] = _d.dot(_ax[i]);

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      _C[i][j] = _ax[i].dot(_bx[j]);
      _absC[i][j] = Math.abs(_C[i][j]) + 1e-6;
    }
  }

  const ha = a.half, hb = b.half;
  let best = -Infinity, bestType = 0, bestI = 0, bestJ = 0, bestSign = 1;

  // faces of A
  for (let i = 0; i < 3; i++) {
    const ra = ha.getComponent(i);
    const rb = hb.x * _absC[i][0] + hb.y * _absC[i][1] + hb.z * _absC[i][2];
    const s = Math.abs(_tA[i]) - (ra + rb);
    if (s > 0) return;
    if (s > best) { best = s; bestType = 0; bestI = i; bestSign = _tA[i] >= 0 ? 1 : -1; }
  }

  // faces of B
  for (let j = 0; j < 3; j++) {
    const ra = ha.x * _absC[0][j] + ha.y * _absC[1][j] + ha.z * _absC[2][j];
    const rb = hb.getComponent(j);
    const tb = _tA[0] * _C[0][j] + _tA[1] * _C[1][j] + _tA[2] * _C[2][j];
    const s = Math.abs(tb) - (ra + rb);
    if (s > 0) return;
    if (s > best + 1e-4) { best = s; bestType = 1; bestJ = j; bestSign = tb >= 0 ? 1 : -1; }
  }

  // edge pairs
  let edgeBest = -Infinity, edgeI = 0, edgeJ = 0, edgeSign = 1;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const i1 = (i + 1) % 3, i2 = (i + 2) % 3;
      const j1 = (j + 1) % 3, j2 = (j + 2) % 3;
      const ra = ha.getComponent(i1) * _absC[i2][j] + ha.getComponent(i2) * _absC[i1][j];
      const rb = hb.getComponent(j1) * _absC[i][j2] + hb.getComponent(j2) * _absC[i][j1];
      const proj = _tA[i2] * _C[i1][j] - _tA[i1] * _C[i2][j];
      const len = Math.sqrt(Math.max(1e-9, 1 - _C[i][j] * _C[i][j]));
      const s = (Math.abs(proj) - (ra + rb)) / len;
      if (s > 0) return;
      if (s > edgeBest) { edgeBest = s; edgeI = i; edgeJ = j; edgeSign = proj >= 0 ? 1 : -1; }
    }
  }

  /* Face contacts are far more stable than edge contacts, so an edge axis
     only wins when it is clearly the shallower one. */
  if (edgeBest > best + 0.02) {
    edgeContact(a, b, edgeI, edgeJ, edgeSign, edgeBest, out);
    return;
  }

  if (bestType === 0) faceContacts(a, b, bestI, bestSign, false, out);
  else faceContacts(b, a, bestJ, -bestSign, true, out);
}

/* Reference face on `ref`, incident face on `inc`, clipped in the
   reference body's local frame where the face is axis aligned. */
function faceContacts(ref, inc, ri, rs, swapped, out) {
  axis(ref, ri, _refN).multiplyScalar(rs);       // outward from ref toward inc

  // incident face: the face of `inc` most anti-parallel to the reference normal
  let ii = 0, iDot = Infinity, isign = 1;
  for (let i = 0; i < 3; i++) {
    axis(inc, i, _tmpV);
    const d = _tmpV.dot(_refN);
    if (d < iDot) { iDot = d; ii = i; isign = 1; }
    if (-d < iDot) { iDot = -d; ii = i; isign = -1; }
  }

  const t1 = (ii + 1) % 3, t2 = (ii + 2) % 3;
  const h = inc.half;
  let n = 0;
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      _tmpV.set(0, 0, 0);
      _tmpV.setComponent(ii, isign * h.getComponent(ii));
      _tmpV.setComponent(t1, s1 * h.getComponent(t1));
      _tmpV.setComponent(t2, s2 * h.getComponent(t2));
      toWorld(inc, _tmpV, _poly[n]);
      toLocal(ref, _poly[n], _poly[n]);          // clip in reference-local space
      n++;
    }
  }
  // wind the quad so clipping walks its perimeter
  _tmpV.copy(_poly[2]); _poly[2].copy(_poly[3]); _poly[3].copy(_tmpV);

  const a1 = (ri + 1) % 3, a2 = (ri + 2) % 3;
  n = clipToSlab(_poly, 4, a1, ref.half.getComponent(a1), _clip);
  n = clipToSlab(_clip, n, a2, ref.half.getComponent(a2), _poly);
  if (n === 0) return;

  const refPlane = rs * ref.half.getComponent(ri);
  const first = out.length;

  for (let i = 0; i < n && out.length - first < 4; i++) {
    const lp = _poly[i];
    const sep = rs > 0 ? lp.getComponent(ri) - refPlane : refPlane - lp.getComponent(ri);
    if (sep > 0.02) continue;                     // not actually touching

    // drop points the clipper produced twice: coincident contacts double
    // the impulse at one corner and tip the stack
    let dup = false;
    for (let k = first; k < out.length; k++) {
      if (out[k].local.distanceToSquared(lp) < 1e-6) { dup = true; break; }
    }
    if (dup) continue;

    const c = swapped ? take(inc, ref) : take(ref, inc);
    if (swapped) c.normal.copy(_refN).multiplyScalar(-1);
    else c.normal.copy(_refN);
    c.depth = -sep;
    c.local.copy(lp);
    toWorld(ref, lp, c.point);
    c.key = (ri + 1) * 97 + i * 7 + (rs > 0 ? 3 : 0);
    out.push(c);
  }
}

/** Sutherland-Hodgman against the two planes x[axis] = +-h, in local space.

    The epsilon matters more than it looks: two identical crates stacked
    face to face put every vertex of the incident face exactly on a clip
    plane, and a naive test then emits both the vertex and a zero-length
    intersection — duplicate contact points, double the impulse in one
    corner, and the stack kicks itself over. Only a real crossing adds a
    point. Runs on preallocated scratch: this is the hottest loop here. */
const CLIP_EPS = 1e-6;
const _mid = [];
for (let i = 0; i < 16; i++) _mid.push(new THREE.Vector3());

function clipToSlab(src, count, ax, h, dst) {
  let m = 0;
  for (let i = 0; i < count; i++) {
    const a = src[i], b = src[(i + 1) % count];
    const da = a.getComponent(ax) - h, db = b.getComponent(ax) - h;
    if (da <= CLIP_EPS && m < _mid.length) _mid[m++].copy(a);
    if (((da > CLIP_EPS && db < -CLIP_EPS) || (da < -CLIP_EPS && db > CLIP_EPS)) && m < _mid.length) {
      _mid[m++].copy(a).lerp(b, da / (da - db));
    }
  }

  let n = 0;
  for (let i = 0; i < m; i++) {
    const a = _mid[i], b = _mid[(i + 1) % m];
    const da = -h - a.getComponent(ax), db = -h - b.getComponent(ax);
    if (da <= CLIP_EPS && n < dst.length) dst[n++].copy(a);
    if (((da > CLIP_EPS && db < -CLIP_EPS) || (da < -CLIP_EPS && db > CLIP_EPS)) && n < dst.length) {
      dst[n++].copy(a).lerp(b, da / (da - db));
    }
  }
  return n;
}

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();

/** Closest points of the two crossing edges give a single contact. */
function edgeContact(a, b, i, j, sign, sep, out) {
  _n.copy(_ax[i]).cross(_bx[j]);
  const len = _n.length();
  if (len < 1e-6) return;
  _n.divideScalar(len);
  _d.copy(b.pos).sub(a.pos);
  if (_n.dot(_d) < 0) _n.multiplyScalar(-1);      // normal points A -> B

  // support corners along +-n
  _pa.copy(a.pos);
  for (let k = 0; k < 3; k++) {
    if (k === i) continue;
    const s = _ax[k].dot(_n) >= 0 ? 1 : -1;
    _pa.addScaledVector(_ax[k], s * a.half.getComponent(k));
  }
  _pb.copy(b.pos);
  for (let k = 0; k < 3; k++) {
    if (k === j) continue;
    const s = _bx[k].dot(_n) >= 0 ? -1 : 1;
    _pb.addScaledVector(_bx[k], s * b.half.getComponent(k));
  }

  // closest points between the two infinite edges
  const u = _ax[i], v = _bx[j];
  _t.copy(_pa).sub(_pb);
  const dd = u.dot(v);
  const den = 1 - dd * dd;
  let s = 0, tt = 0;
  if (Math.abs(den) > 1e-6) {
    const e = u.dot(_t), f = v.dot(_t);
    s = (dd * f - e) / den;
    tt = (f - dd * e) / den;
  }
  s = Math.max(-a.half.getComponent(i), Math.min(s, a.half.getComponent(i)));
  tt = Math.max(-b.half.getComponent(j), Math.min(tt, b.half.getComponent(j)));

  _pa.addScaledVector(u, s);
  _pb.addScaledVector(v, tt);

  const c = take(a, b);
  c.normal.copy(_n);
  c.depth = -sep;
  c.point.copy(_pa).add(_pb).multiplyScalar(0.5);
  c.key = 991 + i * 3 + j;
  out.push(c);
}

/* ---------------------------------------------------------
   dispatch
   --------------------------------------------------------- */
export function collidePair(a, b, out) {
  const sa = a.shape, sb = b.shape;
  if (sa === SHAPE.SPHERE && sb === SHAPE.SPHERE) return sphereSphere(a, b, out);
  if (sa === SHAPE.SPHERE && sb === SHAPE.BOX) return sphereBox(a, b, out, false);
  if (sa === SHAPE.BOX && sb === SHAPE.SPHERE) return sphereBox(b, a, out, true);
  return boxBox(a, b, out);
}

/* ---------------------------------------------------------
   ground plane at y = 0
   --------------------------------------------------------- */
const _corners = [];
for (let i = 0; i < 8; i++) _corners.push(new THREE.Vector3());

export function groundContacts(body, out) {
  if (body.shape === SHAPE.SPHERE) {
    const d = body.pos.y - body.radius;
    if (d >= 0) return;
    const c = take(null, body);
    c.normal.set(0, 1, 0);               // ground (A) -> body (B): push it up
    c.depth = -d;
    c.point.set(body.pos.x, 0, body.pos.z);
    c.key = 1;
    out.push(c);
    return;
  }
  if (body.aabb.min.y >= 0) return;
  body.corners(_corners);
  let k = 2;
  for (const p of _corners) {
    if (p.y >= 0) { k++; continue; }
    const c = take(null, body);
    c.normal.set(0, 1, 0);
    c.depth = -p.y;
    c.point.set(p.x, 0, p.z);
    c.key = k++;
    out.push(c);
  }
}
