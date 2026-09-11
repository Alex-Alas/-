/* =========================================================
   GRIP
   Where a grabbed prop was grabbed, and how it is dragged.

   The grab point lives in the body's own frame: it swings as the prop
   turns, and a world-space point would slide across the surface the
   moment the thing rotated. Both force guns need that conversion, so it
   lives here instead of being written twice.
   ========================================================= */
import * as THREE from 'three';

const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _want = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _K = new THREE.Matrix3();
const _skew = new THREE.Matrix3();
const _m = new THREE.Matrix3();

/** World point -> body local coordinates. Inverse of fromLocal(). */
export function toLocal(body, world, out) {
  const m = body.rmat.elements;
  const x = world.x - body.pos.x, y = world.y - body.pos.y, z = world.z - body.pos.z;
  return out.set(x * m[0] + y * m[1] + z * m[2],
                 x * m[3] + y * m[4] + z * m[5],
                 x * m[6] + y * m[7] + z * m[8]);
}

/** Body local coordinates -> world point, following the body's rotation. */
export function fromLocal(body, local, out) {
  const m = body.rmat.elements;
  return out.set(
    body.pos.x + m[0] * local.x + m[3] * local.y + m[6] * local.z,
    body.pos.y + m[1] * local.x + m[4] * local.y + m[7] * local.z,
    body.pos.z + m[2] * local.x + m[5] * local.y + m[8] * local.z);
}

/* Same storage layout the joint solver uses, so the same 3x3 algebra
   applies. */
function skew(v, out) {
  const e = out.elements;
  e[0] = 0;    e[1] = v.z;  e[2] = -v.y;
  e[3] = -v.z; e[4] = 0;    e[5] = v.x;
  e[6] = v.y;  e[7] = -v.x; e[8] = 0;
  return out;
}

/**
 * Drag the grabbed point toward `target` on a velocity spring.
 *
 * The impulse is solved against the body's effective mass at the anchor
 * — the same 1/m + skew(r) I^-1 skew(r) matrix the joint solver builds —
 * instead of being handed out as (wanted - actual) * mass. That shortcut
 * is not self-limiting: the angular half of a raw velocity change feeds
 * straight back into the point velocity on the next tick, and a display
 * refreshing faster than the fixed step runs the feedback several times
 * per step until the prop winds itself up and is flung off the gun.
 * Solving it properly converges in one pass, so one call per frame is
 * safe at any refresh rate.
 *
 * `stiffness` is the gain in 1/s and `maxSpeed` the ceiling in u/s, so a
 * stiff gun snaps at the target and a soft one lags behind it.
 */
export function springTo(body, target, anchor, stiffness, maxSpeed) {
  _d.copy(target).sub(anchor);
  const len = _d.length();
  if (len < 1e-5) _want.set(0, 0, 0);
  else _want.copy(_d).multiplyScalar(Math.min(len * stiffness, maxSpeed) / len);

  _want.sub(body.pointVelocity(anchor, _pv));
  if (_want.lengthSq() < 1e-8) return;

  _r.copy(anchor).sub(body.pos);
  const e = _K.elements;
  const im = body.invMass;
  e[0] = im; e[1] = 0; e[2] = 0;
  e[3] = 0; e[4] = im; e[5] = 0;
  e[6] = 0; e[7] = 0; e[8] = im;
  _m.copy(skew(_r, _skew)).multiply(body.invInertiaWorld).multiply(_skew);
  for (let i = 0; i < 9; i++) e[i] -= _m.elements[i];

  _imp.copy(_want).applyMatrix3(_m.copy(_K).invert());
  body.applyImpulse(_imp, anchor);
}
