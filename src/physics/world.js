/* =========================================================
   RIGID WORLD — sequential impulse solver

   Velocity-level solver with warm starting: contacts remember the
   impulse they needed last step, which is what lets a stack of crates
   settle instead of sinking and jittering. Penetration is resolved with
   a Baumgarte bias and a slop tolerance, restitution only above a
   threshold speed so resting boxes do not buzz, and bodies that stop
   moving are put to sleep.

   The world also owns the couplings out to the other solvers: verlet
   ragdoll particles collide against bodies here, and bodies register
   themselves as obstacles for the SPH fluid.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { sim, gravityFor, wind } from './sim.js';
import { colliders, BOUNDS } from './statics.js';
import { RigidBody, SHAPE } from './rigidbody.js';
import { collidePair, groundContacts, resetContacts } from './collide.js';
import { FL, addSolid } from './fluid.js';

export const bodies = [];
export const contacts = [];

/* Solver knobs, exposed so they can be tuned (and A/B tested) live. */
export const solverConfig = {
  iterations: 10,
  posIterations: 4,
  warmStart: true,
  beta: 0.28,
  slop: 0.012,
};
const SLOP = solverConfig.slop;
const BETA = solverConfig.beta;
const REST_THRESHOLD = 2.2;      // below this approach speed nothing bounces
const SLEEP_LIN = 0.10;
const SLEEP_ANG = 0.14;
const SLEEP_TIME = 0.75;

/* A stand-in body for the ground plane so the solver never special-cases it. */
export const GROUND = new RigidBody({ isStatic: true, half: [1, 1, 1], mass: 0, friction: 0.9, restitution: 0.2 });

export function addBody(body) {
  bodies.push(body);
  events.emit('body:added', body);
  return body;
}

export function removeBody(body) {
  const i = bodies.indexOf(body);
  if (i < 0) return;
  bodies.splice(i, 1);
  body.removed = true;
  if (body.mesh && body.mesh.parent) body.mesh.parent.remove(body.mesh);
  events.emit('body:removed', body);
}

export function clearBodies(pred) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (b.isStatic) continue;
    if (pred && !pred(b)) continue;
    removeBody(b);
  }
}

/* ---------------------------------------------------------
   Warm starting cache
   --------------------------------------------------------- */
/* Warm starting: a contact reuses the impulse the same contact needed last
   step, which is what lets a stack settle in a handful of iterations.
   Contacts are matched to last step's by proximity rather than by feature
   index, because clipping can renumber the points of a manifold between
   steps and a mismatched impulse injects spin. */
const cache = new Map();
const slotPool = [];
let slotUsed = 0;
const MATCH_DIST2 = 0.06 * 0.06;

const pairKey = (c) => c.a.id * 8192 + c.b.id;

function takeSlot() {
  if (slotUsed === slotPool.length) {
    slotPool.push({ x: 0, y: 0, z: 0, n: 0, t1: 0, t2: 0 });
  }
  return slotPool[slotUsed++];
}

function cacheLookup(c) {
  const list = cache.get(pairKey(c));
  if (!list) return null;
  let best = null, bestD = MATCH_DIST2;
  for (const s of list) {
    const dx = s.x - c.point.x, dy = s.y - c.point.y, dz = s.z - c.point.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function cacheStore(c) {
  const k = pairKey(c);
  let list = cache.get(k);
  if (!list) { list = []; cache.set(k, list); }
  const s = takeSlot();
  s.x = c.point.x; s.y = c.point.y; s.z = c.point.z;
  s.n = c.nImp; s.t1 = c.t1Imp; s.t2 = c.t2Imp;
  list.push(s);
}

/* ---------------------------------------------------------
   Broadphase — O(n^2) AABB, which is plenty for a sandbox this size
   --------------------------------------------------------- */
function overlaps(a, b) {
  return !(a.aabb.max.x < b.aabb.min.x || a.aabb.min.x > b.aabb.max.x ||
           a.aabb.max.y < b.aabb.min.y || a.aabb.min.y > b.aabb.max.y ||
           a.aabb.max.z < b.aabb.min.z || a.aabb.min.z > b.aabb.max.z);
}

/* ---------------------------------------------------------
   Solver
   --------------------------------------------------------- */
const _rv = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

function effectiveMass(c, dir) {
  let k = c.a.invMass + c.b.invMass;
  if (!c.a.immovable) {
    _tmp.copy(c.rA).cross(dir).applyMatrix3(c.a.invInertiaWorld).cross(c.rA);
    k += _tmp.dot(dir);
  }
  if (!c.b.immovable) {
    _tmp.copy(c.rB).cross(dir).applyMatrix3(c.b.invInertiaWorld).cross(c.rB);
    k += _tmp.dot(dir);
  }
  return k > 1e-9 ? 1 / k : 0;
}

function relativeVelocity(c, out) {
  out.copy(c.b.vel);
  _tmp2.copy(c.b.angVel).cross(c.rB);
  out.add(_tmp2);
  _tmp2.copy(c.a.angVel).cross(c.rA);
  out.sub(_tmp2).sub(c.a.vel);
  return out;
}

function prepare(c, dt) {
  const a = c.a, b = c.b;
  if (a.sleeping && !b.sleeping && !b.immovable) a.wake();
  if (b.sleeping && !a.sleeping && !a.immovable) b.wake();

  c.rA.copy(c.point).sub(a.pos);
  c.rB.copy(c.point).sub(b.pos);

  // two tangents perpendicular to the normal
  if (Math.abs(c.normal.x) > 0.57) c.t1.set(c.normal.y, -c.normal.x, 0);
  else c.t1.set(0, c.normal.z, -c.normal.y);
  c.t1.normalize();
  c.t2.copy(c.normal).cross(c.t1);

  c.nMass = effectiveMass(c, c.normal);
  c.t1Mass = effectiveMass(c, c.t1);
  c.t2Mass = effectiveMass(c, c.t2);

  c.friction = Math.sqrt(a.friction * b.friction);

  const vn = relativeVelocity(c, _rv).dot(c.normal);
  const e = Math.max(a.restitution, b.restitution);
  c.bounce = vn < -REST_THRESHOLD ? -e * vn : 0;
  c.penetration = Math.max(0, c.depth - solverConfig.slop);
  c.pImp = 0;

  const prev = solverConfig.warmStart ? cacheLookup(c) : null;
  if (prev) { c.nImp = prev.n; c.t1Imp = prev.t1; c.t2Imp = prev.t2; }
}

/**
 * Warm starting runs as its own pass, after every contact has measured
 * its approach speed. Applying it inside prepare() contaminates the
 * measurement of the contacts prepared later: they see the impulse that
 * held up the stack last step as if it were a body slamming into them,
 * and hand out restitution for it. That feedback is what shakes a stack
 * of crates apart.
 */
function warmStart(c) {
  if (c.nImp === 0 && c.t1Imp === 0 && c.t2Imp === 0) return;
  _imp.copy(c.normal).multiplyScalar(c.nImp)
    .addScaledVector(c.t1, c.t1Imp)
    .addScaledVector(c.t2, c.t2Imp);
  applyPair(c, _imp);
}

function applyPair(c, impulse) {
  const a = c.a, b = c.b;
  if (!a.immovable) {
    a.vel.addScaledVector(impulse, -a.invMass);
    _tmp.copy(c.rA).cross(impulse).applyMatrix3(a.invInertiaWorld);
    a.angVel.sub(_tmp);
  }
  if (!b.immovable) {
    b.vel.addScaledVector(impulse, b.invMass);
    _tmp.copy(c.rB).cross(impulse).applyMatrix3(b.invInertiaWorld);
    b.angVel.add(_tmp);
  }
}

function solve(c, dt) {
  // normal — penetration is handled separately, in the pseudo-velocity pass
  const vn = relativeVelocity(c, _rv).dot(c.normal);
  let lambda = c.nMass * (c.bounce - vn);
  const oldN = c.nImp;
  c.nImp = Math.max(0, oldN + lambda);
  lambda = c.nImp - oldN;
  if (lambda !== 0) applyPair(c, _imp.copy(c.normal).multiplyScalar(lambda));

  // friction, clamped to the Coulomb cone of the normal impulse so far
  const maxF = c.friction * c.nImp;

  relativeVelocity(c, _rv);
  let lt = -c.t1Mass * _rv.dot(c.t1);
  let old1 = c.t1Imp;
  c.t1Imp = Math.max(-maxF, Math.min(maxF, old1 + lt));
  lt = c.t1Imp - old1;
  if (lt !== 0) applyPair(c, _imp.copy(c.t1).multiplyScalar(lt));

  relativeVelocity(c, _rv);
  let lt2 = -c.t2Mass * _rv.dot(c.t2);
  const old2 = c.t2Imp;
  c.t2Imp = Math.max(-maxF, Math.min(maxF, old2 + lt2));
  lt2 = c.t2Imp - old2;
  if (lt2 !== 0) applyPair(c, _imp.copy(c.t2).multiplyScalar(lt2));
}

function applyPseudo(c, impulse) {
  const a = c.a, b = c.b;
  if (!a.immovable) {
    a.pvel.addScaledVector(impulse, -a.invMass);
    _tmp.copy(c.rA).cross(impulse).applyMatrix3(a.invInertiaWorld);
    a.pang.sub(_tmp);
  }
  if (!b.immovable) {
    b.pvel.addScaledVector(impulse, b.invMass);
    _tmp.copy(c.rB).cross(impulse).applyMatrix3(b.invInertiaWorld);
    b.pang.add(_tmp);
  }
}

/** Push overlapping bodies apart without touching their real velocity. */
function solvePosition(c, dt) {
  if (c.penetration <= 0) return;
  const a = c.a, b = c.b;

  _rv.copy(b.pvel);
  _tmp2.copy(b.pang).cross(c.rB);
  _rv.add(_tmp2);
  _tmp2.copy(a.pang).cross(c.rA);
  _rv.sub(_tmp2).sub(a.pvel);

  const vn = _rv.dot(c.normal);
  let lambda = c.nMass * ((solverConfig.beta / dt) * c.penetration - vn);
  const old = c.pImp;
  c.pImp = Math.max(0, old + lambda);
  lambda = c.pImp - old;
  if (lambda !== 0) applyPseudo(c, _imp.copy(c.normal).multiplyScalar(lambda));
}

/* ---------------------------------------------------------
   Step
   --------------------------------------------------------- */
export function stepRigid(dt) {
  const g = sim.frozen ? 0 : gravityFor(1);

  for (const b of bodies) {
    if (b.immovable) continue;
    if (sim.frozen) { b.vel.set(0, 0, 0); b.angVel.set(0, 0, 0); continue; }
    if (sim.wind && !b.sleeping) {
      // light props catch the wind; heavy ones shrug it off
      b.force.x += wind.x * 26 * Math.min(2, b.mass * 0.25);
      b.force.z += wind.z * 26 * Math.min(2, b.mass * 0.25);
    }
    b.integrateVelocity(dt, g);
  }

  /* ---- broadphase + narrowphase ---- */
  contacts.length = 0;
  resetContacts();

  for (const b of bodies) {
    if (b.isStatic) continue;
    if (b.sleeping) continue;
    groundContacts(b, contacts);
  }
  for (const c of contacts) if (c.a === null) c.a = GROUND;

  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (a.immovable && b.immovable) continue;
      if (a.sleeping && b.sleeping) continue;
      if (!overlaps(a, b)) continue;
      collidePair(a, b, contacts);
    }
  }

  /* ---- solve ---- */
  for (const c of contacts) prepare(c, dt);
  for (const c of contacts) warmStart(c);
  /* Sweeping the contact list in the same order every iteration biases a
     stack in one direction — it leans as it settles. Alternating the
     sweep cancels the bias. */
  for (let it = 0; it < solverConfig.iterations; it++) {
    if (it & 1) for (let i = contacts.length - 1; i >= 0; i--) solve(contacts[i], dt);
    else for (let i = 0; i < contacts.length; i++) solve(contacts[i], dt);
  }
  for (let it = 0; it < solverConfig.posIterations; it++) {
    if (it & 1) for (let i = contacts.length - 1; i >= 0; i--) solvePosition(contacts[i], dt);
    else for (let i = 0; i < contacts.length; i++) solvePosition(contacts[i], dt);
  }

  // remember impulses for the next step (pooled slots: no per-frame garbage)
  for (const list of cache.values()) list.length = 0;
  slotUsed = 0;
  for (const c of contacts) cacheStore(c);

  /* ---- integrate & sleep ---- */
  for (const b of bodies) {
    if (b.immovable) continue;
    b.integratePosition(dt);

    if (b.pos.x < -BOUNDS || b.pos.x > BOUNDS || b.pos.z < -BOUNDS || b.pos.z > BOUNDS) {
      b.pos.x = Math.max(-BOUNDS, Math.min(BOUNDS, b.pos.x));
      b.pos.z = Math.max(-BOUNDS, Math.min(BOUNDS, b.pos.z));
      b.vel.x *= -0.3; b.vel.z *= -0.3;
    }
    if (b.pos.y < -6) removeBody(b);
  }

  if (!sim.frozen) updateSleep(dt);
}

/* ---------------------------------------------------------
   Sleeping by island

   Two crates in contact keep waking each other: whichever falls asleep
   first is woken by its neighbour on the next step. So bodies sleep as
   a group — everything connected through contacts goes to sleep on the
   same step, or none of it does. A union-find over this step's contacts
   is enough, and it costs nothing next to the solver.
   --------------------------------------------------------- */
const roots = [];
const islandTimer = [];

function findRoot(i) {
  while (roots[i] !== i) { roots[i] = roots[roots[i]]; i = roots[i]; }
  return i;
}

function updateSleep(dt) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    roots[i] = i;
    islandTimer[i] = Infinity;
    bodies[i]._idx = i;
  }

  for (const c of contacts) {
    const a = c.a, b = c.b;
    if (a.immovable || b.immovable) continue;
    const ra = findRoot(a._idx), rb = findRoot(b._idx);
    if (ra !== rb) roots[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.immovable) continue;
    const still = b.vel.lengthSq() < SLEEP_LIN && b.angVel.lengthSq() < SLEEP_ANG;
    b.sleepTimer = still ? b.sleepTimer + dt : 0;
    const r = findRoot(i);
    if (b.sleepTimer < islandTimer[r]) islandTimer[r] = b.sleepTimer;
  }

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.immovable || b.sleeping) continue;
    if (islandTimer[findRoot(i)] <= SLEEP_TIME) continue;
    b.sleeping = true;
    b.vel.set(0, 0, 0);
    b.angVel.set(0, 0, 0);
  }
}

export function syncBodyMeshes() {
  for (const b of bodies) b.syncMesh();
}

/* ---------------------------------------------------------
   Coupling: verlet particles (the ragdoll) against rigid bodies
   --------------------------------------------------------- */
const _cp = new THREE.Vector3();
const _nrm = new THREE.Vector3();
const _pv = new THREE.Vector3();

function localOf(body, v, out) {
  const m = body.rmat.elements;
  const x = v.x - body.pos.x, y = v.y - body.pos.y, z = v.z - body.pos.z;
  return out.set(x * m[0] + y * m[1] + z * m[2],
                 x * m[3] + y * m[4] + z * m[5],
                 x * m[6] + y * m[7] + z * m[8]);
}

/**
 * Push one verlet particle out of the rigid bodies and kick the bodies
 * back, so the ragdoll can be buried under a crate and a thrown crate
 * knocks him over.
 */
export function collideParticleWithBodies(p, radius, mass, dt) {
  for (const b of bodies) {
    if (b.aabb.min.x - radius > p.pos.x || b.aabb.max.x + radius < p.pos.x ||
        b.aabb.min.y - radius > p.pos.y || b.aabb.max.y + radius < p.pos.y ||
        b.aabb.min.z - radius > p.pos.z || b.aabb.max.z + radius < p.pos.z) continue;

    let depth = 0;
    if (b.shape === SHAPE.SPHERE) {
      _nrm.copy(p.pos).sub(b.pos);
      const d = _nrm.length();
      const rr = b.radius + radius;
      if (d >= rr) continue;
      depth = rr - d;
      if (d > 1e-6) _nrm.divideScalar(d); else _nrm.set(0, 1, 0);
    } else {
      localOf(b, p.pos, _cp);
      const cx = Math.max(-b.half.x, Math.min(_cp.x, b.half.x));
      const cy = Math.max(-b.half.y, Math.min(_cp.y, b.half.y));
      const cz = Math.max(-b.half.z, Math.min(_cp.z, b.half.z));
      const dx = _cp.x - cx, dy = _cp.y - cy, dz = _cp.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius * radius) continue;

      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        depth = radius - d;
        _nrm.set(dx / d, dy / d, dz / d);
      } else {
        const px = b.half.x - Math.abs(_cp.x), py = b.half.y - Math.abs(_cp.y), pz = b.half.z - Math.abs(_cp.z);
        if (px <= py && px <= pz) { _nrm.set(Math.sign(_cp.x) || 1, 0, 0); depth = radius + px; }
        else if (py <= pz) { _nrm.set(0, Math.sign(_cp.y) || 1, 0); depth = radius + py; }
        else { _nrm.set(0, 0, Math.sign(_cp.z) || 1); depth = radius + pz; }
      }
      const m = b.rmat.elements;
      const nx = _nrm.x, ny = _nrm.y, nz = _nrm.z;
      _nrm.set(m[0] * nx + m[3] * ny + m[6] * nz,
               m[1] * nx + m[4] * ny + m[7] * nz,
               m[2] * nx + m[5] * ny + m[8] * nz);
    }

    // separate the particle
    p.pos.addScaledVector(_nrm, depth);

    // momentum exchange: the particle's approach speed becomes an impulse
    if (!b.immovable) {
      _pv.copy(p.pos).sub(p.prev).multiplyScalar(1 / Math.max(dt, 1e-4));
      b.pointVelocity(p.pos, _tmp2);
      const vn = _pv.sub(_tmp2).dot(_nrm);
      if (vn < 0) {
        _imp.copy(_nrm).multiplyScalar(vn * mass * 0.75);
        b.applyImpulse(_imp, p.pos);
      } else {
        b.wake();
      }
    } else {
      // damp the particle sliding along an immovable surface
      const vt = _pv.copy(p.pos).sub(p.prev);
      p.prev.copy(p.pos).sub(vt.multiplyScalar(0.82));
    }
  }
}

/* ---------------------------------------------------------
   Coupling: bodies displace the fluid
   --------------------------------------------------------- */
export function pushBodySolids() {
  if (FL.n === 0) return;
  for (const b of bodies) {
    if (b.isStatic) continue;
    const r = b.shape === SHAPE.SPHERE ? b.radius : Math.max(b.half.x, b.half.y, b.half.z) * 0.86;
    const dx = b.pos.x - FL.cx, dy = b.pos.y - FL.cy, dz = b.pos.z - FL.cz;
    if (dx * dx + dy * dy + dz * dz > 64) continue;    // far from the puddle
    if (!addSolid(b.pos.x, b.pos.y, b.pos.z, r)) return;
  }
}

/* ---------------------------------------------------------
   Queries
   --------------------------------------------------------- */
const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();

/** Ray against one body; returns the hit distance or -1. */
function rayBody(origin, dir, b) {
  if (b.shape === SHAPE.SPHERE) {
    _tmp.copy(b.pos).sub(origin);
    const tca = _tmp.dot(dir);
    if (tca < 0) return -1;
    const d2 = _tmp.lengthSq() - tca * tca;
    const r2 = b.radius * b.radius;
    if (d2 > r2) return -1;
    const thc = Math.sqrt(r2 - d2);
    const t = tca - thc;
    return t >= 0 ? t : tca + thc;
  }
  // slab test in the box's local frame
  localOf(b, origin, _ro);
  const m = b.rmat.elements;
  _rd.set(dir.x * m[0] + dir.y * m[1] + dir.z * m[2],
          dir.x * m[3] + dir.y * m[4] + dir.z * m[5],
          dir.x * m[6] + dir.y * m[7] + dir.z * m[8]);

  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = _ro.getComponent(i), d = _rd.getComponent(i), h = b.half.getComponent(i);
    if (Math.abs(d) < 1e-8) {
      if (o < -h || o > h) return -1;
    } else {
      let t1 = (-h - o) / d, t2 = (h - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : tmax;
}

/**
 * Cast a ray through the sandbox. Returns the nearest body hit, plus the
 * ground plane when nothing else is closer. Every aiming tool uses this.
 */
export function raycast(origin, dir, maxDist = 120, filter = null) {
  let best = null, bestT = maxDist;

  for (const b of bodies) {
    if (filter && !filter(b)) continue;
    const t = rayBody(origin, dir, b);
    if (t >= 0 && t < bestT) { bestT = t; best = b; }
  }

  let hitGround = false;
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t >= 0 && t < bestT) { bestT = t; best = null; hitGround = true; }
  }

  if (!best && !hitGround) return null;

  const point = new THREE.Vector3().copy(origin).addScaledVector(dir, bestT);
  const normal = new THREE.Vector3();
  if (hitGround) normal.set(0, 1, 0);
  else if (best.shape === SHAPE.SPHERE) normal.copy(point).sub(best.pos).normalize();
  else {
    // the face whose plane the hit point sits on
    localOf(best, point, _cp);
    const ax = Math.abs(_cp.x) / best.half.x, ay = Math.abs(_cp.y) / best.half.y, az = Math.abs(_cp.z) / best.half.z;
    _nrm.set(0, 0, 0);
    if (ax >= ay && ax >= az) _nrm.x = Math.sign(_cp.x) || 1;
    else if (ay >= az) _nrm.y = Math.sign(_cp.y) || 1;
    else _nrm.z = Math.sign(_cp.z) || 1;
    const m = best.rmat.elements;
    normal.set(m[0] * _nrm.x + m[3] * _nrm.y + m[6] * _nrm.z,
               m[1] * _nrm.x + m[4] * _nrm.y + m[7] * _nrm.z,
               m[2] * _nrm.x + m[5] * _nrm.y + m[8] * _nrm.z);
  }

  return { body: best, point, normal, dist: bestT, ground: hitGround };
}

/** Bodies whose centre lies within `radius` of a point. */
export function bodiesNear(point, radius, out = []) {
  out.length = 0;
  const r2 = radius * radius;
  for (const b of bodies) {
    if (b.isStatic) continue;
    if (b.pos.distanceToSquared(point) <= r2) out.push(b);
  }
  return out;
}

/* Static level geometry is part of the same world: build immovable bodies
   from the boxes the particle solvers already collide against. */
export function addStaticBoxBody(center, size, opts = {}) {
  return addBody(new RigidBody({
    isStatic: true, mass: 0,
    pos: center,
    half: [size[0] / 2, size[1] / 2, size[2] / 2],
    friction: opts.friction !== undefined ? opts.friction : 0.75,
    restitution: opts.restitution !== undefined ? opts.restitution : 0.15,
    type: 'level',
  }));
}
