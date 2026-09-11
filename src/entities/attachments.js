/* =========================================================
   ATTACHMENTS
   Things bolted onto props that keep acting every step: thrusters push
   along their own axis, balloons pull up on a rope. They are stepped by
   the world rather than by the tool that placed them, so they keep
   working once you switch tools.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { scene } from '../render/scene.js';
import { makeMaterial, flat } from '../render/shader.js';
import { sphereMesh } from '../render/shapes.js';
import { RigidBody, SHAPE } from '../physics/rigidbody.js';
import { addBody, removeBody } from '../physics/world.js';
import { addRope, removeJointsOf } from '../physics/joints.js';

export const thrusters = [];
export const balloons = [];

const thrusterMat = makeMaterial(0xff9a3c);
const flameMat = makeMaterial(0xffd76a, { alpha: 0.85 });
const balloonMat = makeMaterial(0xff7fa8);

const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _f = new THREE.Vector3();

/* ---------------------------------------------------------
   Thruster
   --------------------------------------------------------- */
export function addThruster(body, worldPoint, worldDir, force = 900) {
  const m = body.rmat.elements;
  const rel = _p.copy(worldPoint).sub(body.pos);
  const local = new THREE.Vector3(
    rel.x * m[0] + rel.y * m[1] + rel.z * m[2],
    rel.x * m[3] + rel.y * m[4] + rel.z * m[5],
    rel.x * m[6] + rel.y * m[7] + rel.z * m[8]
  );
  const d = _dir.copy(worldDir).normalize();
  const localDir = new THREE.Vector3(
    d.x * m[0] + d.y * m[1] + d.z * m[2],
    d.x * m[3] + d.y * m[4] + d.z * m[5],
    d.x * m[6] + d.y * m[7] + d.z * m[8]
  );

  const group = new THREE.Group();
  const can = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6)), thrusterMat);
  group.add(can);
  const flame = new THREE.Mesh(flat(new THREE.ConeGeometry(0.17, 0.55, 6)), flameMat);
  flame.position.y = -0.45;
  flame.rotation.x = Math.PI;
  group.add(flame);
  scene.add(group);

  const t = { body, local, localDir, force, on: true, mesh: group, flame };
  thrusters.push(t);
  events.emit('thruster:added', t);
  return t;
}

export function toggleThrusters(on) {
  for (const t of thrusters) t.on = on === undefined ? !t.on : on;
}

export function clearThrusters() {
  for (const t of thrusters) scene.remove(t.mesh);
  thrusters.length = 0;
}

/* ---------------------------------------------------------
   Balloon
   --------------------------------------------------------- */
export const BALLOON_CEILING = 20;
export const BALLOON_RISE = 6;      // it stops pushing above this rise speed

/**
 * `lift` is in newtons and is sized against the prop's own weight, so one
 * balloon floats a crate and a bowling ball needs a bunch of them.
 */
export function addBalloon(body, worldPoint, lift = null) {
  const balloon = new RigidBody({
    shape: SHAPE.SPHERE,
    radius: 0.58,
    mass: 0.7,
    pos: [worldPoint.x, worldPoint.y + 2.6, worldPoint.z],
    mesh: sphereMesh(0.58, balloonMat, 1),
    friction: 0.3,
    restitution: 0.4,
  });
  balloon.gravityScale = -0.6;
  balloon.linDamp = 1.4;
  balloon.angDamp = 1.6;
  balloon.type = 'balloon';
  scene.add(balloon.mesh);
  addBody(balloon);

  const rope = addRope(body, balloon, worldPoint, balloon.pos, 2.6, { thickness: 0.04 });
  const b = {
    balloon, rope, body,
    lift: lift !== null ? lift : Math.min(420, body.mass * 26 * 1.15 + 70),
  };
  balloons.push(b);
  events.emit('balloon:added', b);
  return b;
}

export function popBalloon(b) {
  const i = balloons.indexOf(b);
  if (i >= 0) balloons.splice(i, 1);
  removeJointsOf(b.balloon);
  removeBody(b.balloon);
  events.emit('balloon:popped', b);
}

export function clearBalloons() {
  while (balloons.length) popBalloon(balloons[0]);
}

/* ---------------------------------------------------------
   Step
   --------------------------------------------------------- */
export function updateAttachments(dt) {
  for (let i = thrusters.length - 1; i >= 0; i--) {
    const t = thrusters[i];
    if (t.body.removed) { scene.remove(t.mesh); thrusters.splice(i, 1); continue; }

    const m = t.body.rmat.elements;
    _p.set(
      t.body.pos.x + m[0] * t.local.x + m[3] * t.local.y + m[6] * t.local.z,
      t.body.pos.y + m[1] * t.local.x + m[4] * t.local.y + m[7] * t.local.z,
      t.body.pos.z + m[2] * t.local.x + m[5] * t.local.y + m[8] * t.local.z
    );
    _dir.set(
      m[0] * t.localDir.x + m[3] * t.localDir.y + m[6] * t.localDir.z,
      m[1] * t.localDir.x + m[4] * t.localDir.y + m[7] * t.localDir.z,
      m[2] * t.localDir.x + m[5] * t.localDir.y + m[8] * t.localDir.z
    );

    t.mesh.position.copy(_p);
    t.mesh.quaternion.setFromUnitVectors(UP, _dir);
    t.flame.visible = t.on;

    if (!t.on) continue;
    /* force at an offset point: a thruster on the corner of a crate makes
       it spin, exactly like the real toy */
    t.body.applyForce(_f.copy(_dir).multiplyScalar(t.force), _p);
  }

  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    if (b.body.removed || b.balloon.removed) { balloons.splice(i, 1); continue; }
    /* Governed lift instead of raw force: it eases off as the balloon
       gains rise speed and fades out near the ceiling, so a balloon
       hovers instead of launching its prop into orbit. */
    const vy = b.balloon.vel.y;
    const speedK = Math.max(0, Math.min(1, 1 - vy / BALLOON_RISE));
    const ceilK = Math.max(0, Math.min(1, (BALLOON_CEILING - b.balloon.pos.y) / 4));
    const f = b.lift * speedK * ceilK;
    if (f > 0) {
      _f.set(0, f, 0);
      b.balloon.applyForce(_f);
      b.balloon.wake();
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/* Attachments follow their prop out of the world. */
events.on('body:removed', (body) => {
  for (let i = thrusters.length - 1; i >= 0; i--) {
    if (thrusters[i].body === body) { scene.remove(thrusters[i].mesh); thrusters.splice(i, 1); }
  }
  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    if (b.body === body) { balloons.splice(i, 1); removeJointsOf(b.balloon); if (!b.balloon.removed) removeBody(b.balloon); }
  }
});
