/* =========================================================
   GRAVITY GUN — slot 2

   The offensive half of the pair: yank a prop out of the scenery, float
   it on a stiffer spring than the physics gun's, and turn it into a
   projectile. The punt is the point of the tool, so the launch impulse
   is scaled by mass — every prop leaves the barrel at the same speed
   regardless of how heavy it is — and a fixed angular kick gives it the
   tumble that a pure translation would not.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { Tools } from './index.js';
import { aimRay, aimHit, showBeam } from './aim.js';
import { toLocal, fromLocal, springTo } from './grip.js';
import { bodiesNear } from '../physics/world.js';
import { playerEye } from '../entities/player.js';

const COLOUR = 0xffc93c;
const REACH = 16;           // u — a yank, not a leash: it will not cross the map
const HOLD = 4.5;           // u in front of the eye
const STIFFNESS = 26;       // harder than the physgun, so the carry is rigid
const MAX_SPEED = 55;
const SPIN_DAMP = 0.90;

const PUNT_SPEED = 42;      // u/s a punted prop leaves at
const PUNT_SPIN = 60;       // torque per unit mass; a tumble, not a cartwheel

const SHOVE_RADIUS = 9;
const SHOVE_SPEED = 15;     // u/s at point blank, falling off with distance
const SHOVE_COS = 0.819;    // cos 35 deg — the mouth of the shove cone
const UP = new THREE.Vector3(0, 1, 0);

/* A prop the physics gun has frozen is pinned; the gravity gun cannot
   move it, so it must not pretend to grab it either. */
const yankable = (b) => !b.isStatic && b.type !== 'level' && !b.frozen;

const held = { body: null, local: new THREE.Vector3() };
const near = [];

const _anchor = new THREE.Vector3();
const _target = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _spin = new THREE.Vector3();

function release() {
  held.body = null;
}

/** Short shove for an empty-handed click: a cone of props is nudged away. */
function shove(dir) {
  playerEye(_eye);
  bodiesNear(_eye, SHOVE_RADIUS, near);
  for (const b of near) {
    if (b.immovable) continue;              // static and frozen alike
    _to.copy(b.pos).sub(_eye);
    const d = _to.length();
    if (d < 1e-3) continue;
    _to.divideScalar(d);
    if (_to.dot(dir) < SHOVE_COS) continue; // outside the cone
    const falloff = 1 - d / SHOVE_RADIUS;
    _imp.copy(_to).multiplyScalar(SHOVE_SPEED * falloff * b.mass);
    _imp.y += SHOVE_SPEED * falloff * b.mass * 0.3;
    b.applyImpulse(_imp);
  }
}

Tools.register({
  id: 'gravgun',
  slot: 2,
  name: 'GRAVITY GUN',
  colour: COLOUR,
  hint: {
    lmb: 'punt what you hold · shove a cone when empty',
    rmb: 'hold to pull a prop in front of you',
    extra: 'a punted crate leaves at 42 u/s',
  },

  isHolding() { return !!held.body; },
  equip() { release(); },
  unequip() { release(); },

  primary(down) {
    if (!down) return;
    const ray = aimRay();
    const body = held.body;

    if (!body) { shove(ray.dir); return; }

    _imp.copy(ray.dir).multiplyScalar(PUNT_SPEED * body.mass);
    body.applyImpulse(_imp);

    /* A punt that only translates reads as a nudge. Spinning about an
       axis perpendicular to the launch is what makes it tumble. */
    _spin.crossVectors(ray.dir, UP);
    if (_spin.lengthSq() < 1e-6) _spin.set(1, 0, 0);
    body.applyTorque(_spin.normalize().multiplyScalar(body.mass * PUNT_SPIN));

    release();
  },

  secondary(down) {
    if (!down) { release(); return; }
    if (held.body) return;
    const hit = aimHit(REACH, yankable);
    if (!hit || !hit.body) return;
    hit.body.wake();
    toLocal(hit.body, hit.point, held.local);
    held.body = hit.body;
  },

  update(dt) {
    const body = held.body;
    if (!body) return;
    if (body.removed) { release(); return; }

    const ray = aimRay();
    _target.copy(ray.origin).addScaledVector(ray.dir, HOLD);
    fromLocal(body, held.local, _anchor);

    springTo(body, _target, _anchor, STIFFNESS, MAX_SPEED);
    body.angVel.multiplyScalar(SPIN_DAMP);
    showBeam(_anchor, COLOUR);
  },
});

events.on('play:mode', release);
