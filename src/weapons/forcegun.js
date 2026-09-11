/* =========================================================
   FORCE GUN — slot 3

   A continuous push or pull applied at the exact point the crosshair
   lands on, not at the prop's centre. That one detail is the whole tool:
   lean on a plank near its end and it spins, lean on the same plank in
   the middle and it slides. Nothing is grabbed and nothing is welded, so
   the prop keeps colliding with the world the entire time it is being
   pushed.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { Tools } from './index.js';
import { aim, aimHit, showBeam } from './aim.js';

const COLOUR = 0xff7fa8;
const REACH = 120;
const FORCE_PER_MASS = 65;  // newtons per unit mass ...
const MASS_CAP = 40;        // ... up to this mass, so a bowling ball does not fly like a crate

const active = { push: false, pull: false };

const _dir = new THREE.Vector3();
const _force = new THREE.Vector3();

function release() {
  active.push = false;
  active.pull = false;
}

Tools.register({
  id: 'forcegun',
  slot: 3,
  name: 'FORCE GUN',
  colour: COLOUR,
  hint: {
    lmb: 'push where you point',
    rmb: 'pull where you point',
    extra: 'off-centre pushes spin the prop',
  },

  equip() { release(); },
  unequip() { release(); },

  primary(down) { active.push = down; },
  secondary(down) { active.pull = down; },

  update(dt) {
    if (!active.push && !active.pull) return;

    /* No ray filter here: a wall has to stop the ray. Pushing whatever
       happens to stand behind it would shove props through the level. */
    const hit = aimHit(REACH);
    if (!hit) return;
    showBeam(hit.point, COLOUR);

    if (hit.isBuddy && hit.particle) {
      _dir.copy(aim.dir);
      if (active.pull) _dir.negate();
      const kick = (active.push ? 1 : -1) * 0.45 * Math.min(dt, 0.05) * 60;
      hit.particle.prev.subScaledVector(_dir, kick);
      return;
    }

    const body = hit.body;
    if (!body || body.immovable) return;    // the ground and the level are not toys

    _dir.copy(aim.dir);
    if (active.pull) _dir.negate();
    _force.copy(_dir).multiplyScalar(Math.min(body.mass, MASS_CAP) * FORCE_PER_MASS);

    /* At hit.point, not at body.pos: the lever arm is the demonstration. */
    body.applyForce(_force, hit.point);
  },
});

events.on('play:mode', release);
