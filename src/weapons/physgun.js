/* =========================================================
   PHYSICS GUN — slot 1

   Hold a prop under the crosshair and it follows the aim on a velocity
   spring, freeze it where it stands, drop it with whatever momentum it
   had. Freezing rides on RigidBody.frozen, which the solver already
   treats as immovable: a frozen crate stays solid, stacks, and is pushed
   around by everything else. It is a state change, not a removal, so
   thawing restores the prop untouched.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { Tools } from './index.js';
import { aimRay, aimHit, showBeam } from './aim.js';
import { toLocal, fromLocal, springTo } from './grip.js';
import { bodies } from '../physics/world.js';

const COLOUR = 0x8affe0;
const REACH = 120;
const STIFFNESS = 14;       // 1/s — loose enough to swing, tight enough to place
const MAX_SPEED = 40;       // u/s
const SPIN_DAMP = 0.86;     // per frame; without it a held prop winds itself up
const NEAR = 2, FAR = 26;
const WHEEL_STEP = 1.6;

/* The level is the world, not a toy: geometry and the ground cannot be
   grabbed. The ground is already excluded — raycast reports it with a
   null body. */
const grabbable = (b) => !b.isStatic && b.type !== 'level';

const held = { body: null, local: new THREE.Vector3(), dist: 8 };

const _anchor = new THREE.Vector3();
const _target = new THREE.Vector3();

function release() {
  /* Deliberately leaves the prop's velocity alone: a crate let go at
     speed keeps the momentum it was carrying. */
  held.body = null;
}

/**
 * Freezing is reversible by construction, so it needs no bookkeeping.
 * updateTransforms() matters on both sides: the solver zeroes the world
 * inertia of an immovable body, so a thawed prop would silently stop
 * rotating until it is rebuilt.
 */
function setFrozen(body, on) {
  body.frozen = on;
  body.vel.set(0, 0, 0);
  body.angVel.set(0, 0, 0);
  body.wake();
  body.updateTransforms();
}

Tools.register({
  id: 'physgun',
  slot: 1,
  name: 'PHYSICS GUN',
  colour: COLOUR,
  hint: {
    lmb: 'hold a prop under the crosshair',
    rmb: 'freeze it · thaw it',
    extra: 'wheel: hold distance · R: thaw everything',
  },

  equip() { release(); },
  unequip() { release(); },

  primary(down) {
    if (!down) { release(); return; }
    if (held.body) return;
    const hit = aimHit(REACH, grabbable);
    if (!hit || !hit.body) return;

    const body = hit.body;
    if (body.frozen) setFrozen(body, false);   // grabbing is how you thaw
    body.wake();
    toLocal(body, hit.point, held.local);
    held.dist = Math.min(FAR, Math.max(NEAR, hit.dist));
    held.body = body;
  },

  secondary(down) {
    if (!down) return;
    if (held.body) {
      /* Freezing what is in your hand means letting go of it first, or
         the spring keeps fighting a body that is now immovable. */
      setFrozen(held.body, true);
      release();
      return;
    }
    const hit = aimHit(REACH, grabbable);
    if (hit && hit.body) setFrozen(hit.body, true);
  },

  scroll(dir) {
    if (!held.body) return;
    held.dist = Math.min(FAR, Math.max(NEAR, held.dist + dir * WHEEL_STEP));
  },

  reload() {
    release();
    for (const b of bodies) if (b.frozen) setFrozen(b, false);
  },

  update(dt) {
    const body = held.body;
    if (!body) return;
    if (body.removed) { release(); return; }

    const ray = aimRay();
    _target.copy(ray.origin).addScaledVector(ray.dir, held.dist);
    fromLocal(body, held.local, _anchor);

    springTo(body, _target, _anchor, STIFFNESS, MAX_SPEED);
    body.angVel.multiplyScalar(SPIN_DAMP);
    showBeam(_anchor, COLOUR);
  },
});

/* Switching to the director camera mid-carry must not leave a prop
   hanging off a gun nobody is holding. */
events.on('play:mode', release);
