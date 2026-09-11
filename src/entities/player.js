/* =========================================================
   PLAYER
   A kinematic capsule with Source-style ground acceleration: you build
   speed against friction, keep some control in the air, and can step up
   onto crates without jumping. The capsule is resolved as three spheres,
   which reuses the same closest-point maths the rigid solver uses and
   keeps the player consistent with everything else in the world.

   The player is not a rigid body on purpose: characters that are want
   to fall over. It still exchanges momentum both ways — walking into a
   crate shoves it, and a crate thrown hard enough shoves back.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { clamp } from '../core/math.js';
import { scene } from '../render/scene.js';
import { makeMaterial } from '../render/shader.js';
import { sphereMesh, boxMesh } from '../render/shapes.js';
import { gravityFor } from '../physics/sim.js';
import { colliders, BOUNDS } from '../physics/statics.js';
import { bodies } from '../physics/world.js';
import { SHAPE } from '../physics/rigidbody.js';

export const PLAYER = {
  radius: 0.42,
  height: 3.20,
  crouchHeight: 2.00,
  eye: 2.88,
  crouchEye: 1.66,
  mass: 80,
  walk: 9.0,
  run: 15.0,
  crouch: 4.2,
  accel: 95,
  airAccel: 26,
  friction: 8.5,
  stopSpeed: 2.5,
  jump: 11.6,
  step: 0.62,
  pushForce: 0.85,      // how much of the collision impulse the shove carries
};

export const player = {
  pos: new THREE.Vector3(0, 0, 9),
  vel: new THREE.Vector3(),
  yaw: Math.PI,
  pitch: 0,
  onGround: false,
  crouching: false,
  height: PLAYER.height,
  eyeHeight: PLAYER.eye,
  bob: 0,
  enabled: false,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  /* Written every frame by whoever is driving: keyboard, a cutscene, a
     future bot. The controller itself never reads the keyboard. */
  intent: { forward: 0, strafe: 0, jump: false, run: false, crouch: false },
};

/* ---------------------------------------------------------
   Avatar — visible in third person, hidden in first
   --------------------------------------------------------- */
export const avatar = new THREE.Group();
scene.add(avatar);

const matSuit = makeMaterial(0x5c7cfa);
const matSuitDark = makeMaterial(0x3f56b8);
const matSkin = makeMaterial(0xf2c9a0);
const matVisor = makeMaterial(0x1a1226);

const torso = boxMesh(0.78, 1.12, 0.52, matSuit);
torso.position.y = 2.05;
avatar.add(torso);

const hips = boxMesh(0.70, 0.40, 0.50, matSuitDark);
hips.position.y = 1.36;
avatar.add(hips);

const head = sphereMesh(0.40, matSkin, 1);
head.position.y = 2.92;
avatar.add(head);

const visor = boxMesh(0.52, 0.18, 0.12, matVisor);
visor.position.set(0, 2.95, -0.34);
avatar.add(visor);

const legs = [];
for (const s of [-1, 1]) {
  const leg = boxMesh(0.28, 1.20, 0.30, matSuitDark);
  leg.position.set(s * 0.20, 0.62, 0);
  avatar.add(leg);
  legs.push(leg);
}

const arms = [];
for (const s of [-1, 1]) {
  const arm = boxMesh(0.24, 0.96, 0.26, matSuit);
  arm.position.set(s * 0.52, 2.12, 0);
  avatar.add(arm);
  arms.push(arm);
}

/** Where a held tool sits, in world space. Weapons hang their beam here. */
export const muzzle = new THREE.Object3D();
muzzle.position.set(0.34, 2.25, -0.72);
avatar.add(muzzle);

/* ---------------------------------------------------------
   Movement
   --------------------------------------------------------- */
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _sphere = new THREE.Vector3();
const _n = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _bodyVel = new THREE.Vector3();

export function playerForward(out = new THREE.Vector3()) {
  return out.set(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch)).normalize();
}

export function playerEye(out = new THREE.Vector3()) {
  return out.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
}

/** Source-style: accelerate toward the wish direction, capped by wishSpeed. */
function accelerate(wishDir, wishSpeed, accel, dt) {
  const current = player.vel.x * wishDir.x + player.vel.z * wishDir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const amount = Math.min(accel * dt * wishSpeed, add);
  player.vel.x += wishDir.x * amount;
  player.vel.z += wishDir.z * amount;
}

function applyFriction(dt) {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed < 0.01) { player.vel.x = 0; player.vel.z = 0; return; }
  const control = Math.max(speed, PLAYER.stopSpeed);
  const drop = control * PLAYER.friction * dt;
  const k = Math.max(0, speed - drop) / speed;
  player.vel.x *= k;
  player.vel.z *= k;
}

/* The capsule, sampled as three spheres from feet to head. */
const _offsets = [0, 0, 0];
function capsuleOffsets() {
  const r = PLAYER.radius;
  const h = player.height;
  const tuck = (!player.onGround && player.crouching) ? (PLAYER.height - PLAYER.crouchHeight) : 0;
  _offsets[0] = r + 0.02 + tuck;
  _offsets[1] = h * 0.5 + tuck * 0.5;
  _offsets[2] = h - r - 0.02;
  return _offsets;
}

let pushTick = 0;

function resolveAgainstWorld(dt) {
  pushTick++;
  const r = PLAYER.radius;
  const offs = capsuleOffsets();
  let grounded = false;

  for (let iter = 0; iter < 3; iter++) {
    let hit = false;

    for (let s = 0; s < offs.length; s++) {
      _sphere.set(player.pos.x, player.pos.y + offs[s], player.pos.z);

      /* static AABB level geometry */
      for (const c of colliders) {
        const cx = clamp(_sphere.x, c.min.x, c.max.x);
        const cy = clamp(_sphere.y, c.min.y, c.max.y);
        const cz = clamp(_sphere.z, c.min.z, c.max.z);
        const dx = _sphere.x - cx, dy = _sphere.y - cy, dz = _sphere.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r * r) continue;

        // step up instead of stopping dead, when the ledge is low enough
        if (s === 0 && c.max.y > player.pos.y && c.max.y - player.pos.y <= PLAYER.step) {
          player.pos.y = c.max.y + 0.001;
          if (player.vel.y < 0) player.vel.y = 0;   // or he keeps falling into the step
          grounded = true;
          hit = true;
          continue;
        }

        let d = Math.sqrt(d2);
        if (d < 1e-5) { _n.set(0, 1, 0); d = 0; }
        else _n.set(dx / d, dy / d, dz / d);
        const push = r - d;
        player.pos.addScaledVector(_n, push);
        _sphere.addScaledVector(_n, push);
        if (_n.y > 0.5) grounded = true;
        const vn = player.vel.dot(_n);
        if (vn < 0) player.vel.addScaledVector(_n, -vn);
        hit = true;
      }

      /* props — including frozen and static ones. Level geometry is
         skipped because it is already in `colliders` as an AABB. */
      for (const b of bodies) {
        if (b.type === 'level') continue;
        if (b.aabb.min.x - r > _sphere.x || b.aabb.max.x + r < _sphere.x ||
            b.aabb.min.y - r > _sphere.y || b.aabb.max.y + r < _sphere.y ||
            b.aabb.min.z - r > _sphere.z || b.aabb.max.z + r < _sphere.z) continue;

        let depth = 0;
        if (b.shape === SHAPE.SPHERE) {
          _n.copy(_sphere).sub(b.pos);
          const d = _n.length();
          const rr = b.radius + r;
          if (d >= rr) continue;
          depth = rr - d;
          if (d > 1e-5) _n.divideScalar(d); else _n.set(0, 1, 0);
        } else {
          const m = b.rmat.elements;
          const px = _sphere.x - b.pos.x, py = _sphere.y - b.pos.y, pz = _sphere.z - b.pos.z;
          const lx = px * m[0] + py * m[1] + pz * m[2];
          const ly = px * m[3] + py * m[4] + pz * m[5];
          const lz = px * m[6] + py * m[7] + pz * m[8];
          const qx = clamp(lx, -b.half.x, b.half.x);
          const qy = clamp(ly, -b.half.y, b.half.y);
          const qz = clamp(lz, -b.half.z, b.half.z);
          const dx = lx - qx, dy = ly - qy, dz = lz - qz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r * r) continue;
          const d = Math.sqrt(d2);
          depth = r - d;
          if (d > 1e-5) {
            _n.set(m[0] * dx + m[3] * dy + m[6] * dz,
                   m[1] * dx + m[4] * dy + m[7] * dz,
                   m[2] * dx + m[5] * dy + m[8] * dz).divideScalar(d);
          } else _n.set(0, 1, 0);
        }

        if (s === 0 && _n.y < 0.5 && b.aabb.max.y > player.pos.y && b.aabb.max.y - player.pos.y <= PLAYER.step) {
          player.pos.y = b.aabb.max.y + 0.001;
          if (player.vel.y < 0) player.vel.y = 0;
          grounded = true;
          hit = true;
          continue;
        }

        /* Momentum both ways, through the reduced mass of the pair: a
           crate is shoved to about walking speed, a bowling ball barely
           budges, and nothing gets launched across the map. */
        /* Once per body per step: the capsule is three spheres resolved
           over three iterations, and paying the shove nine times launches
           crates across the map. */
        if (b.pushTick !== pushTick) {
          b.pushTick = pushTick;
          b.pointVelocity(_sphere, _bodyVel);
          const rel = player.vel.dot(_n) - _bodyVel.dot(_n);
          if (rel < 0) {
            const reduced = (PLAYER.mass * b.mass) / (PLAYER.mass + b.mass);
            _imp.copy(_n).multiplyScalar(rel * reduced * PLAYER.pushForce);
            b.applyImpulse(_imp, _sphere);
          }
        } else {
          b.pointVelocity(_sphere, _bodyVel);
        }
        const incoming = _bodyVel.dot(_n);
        if (incoming > 2.5) {
          const kick = Math.min(incoming * (b.mass / (b.mass + PLAYER.mass)) * 1.6, 26);
          player.vel.addScaledVector(_n, kick);
          b.wake();
        }

        player.pos.addScaledVector(_n, depth);
        _sphere.addScaledVector(_n, depth);
        if (_n.y > 0.5) grounded = true;
        const vn = player.vel.dot(_n);
        if (vn < 0) player.vel.addScaledVector(_n, -vn);
        hit = true;
      }
    }

    if (!hit) break;
  }

  /* ground plane */
  if (player.pos.y <= 0) {
    player.pos.y = 0;
    if (player.vel.y < 0) player.vel.y = 0;
    grounded = true;
  }

  player.pos.x = clamp(player.pos.x, -BOUNDS + 1, BOUNDS - 1);
  player.pos.z = clamp(player.pos.z, -BOUNDS + 1, BOUNDS - 1);

  return grounded;
}

export function stepPlayer(dt) {
  if (!player.enabled) return;

  /* crouch changes the capsule, and the eye follows smoothly */
  const wantCrouch = player.intent.crouch;
  player.crouching = wantCrouch;
  const targetH = wantCrouch ? PLAYER.crouchHeight : PLAYER.height;
  player.height += (targetH - player.height) * Math.min(1, dt * 14);
  const targetEye = wantCrouch ? PLAYER.crouchEye : PLAYER.eye;
  player.eyeHeight += (targetEye - player.eyeHeight) * Math.min(1, dt * 14);

  _fwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  _wish.set(0, 0, 0)
    .addScaledVector(_fwd, player.intent.forward)
    .addScaledVector(_right, player.intent.strafe);
  const wishLen = _wish.length();
  if (wishLen > 1e-4) _wish.divideScalar(wishLen);

  let speed = player.intent.run ? PLAYER.run : PLAYER.walk;
  if (player.crouching) speed = PLAYER.crouch;
  const wishSpeed = wishLen > 1e-4 ? speed : 0;

  // manage jump buffer timer (100ms window)
  if (player.intent.jump) {
    player.jumpBufferTimer = 0.10;
  } else if (player.jumpBufferTimer > 0) {
    player.jumpBufferTimer -= dt;
  }

  // manage coyote timer (120ms window)
  if (player.onGround) {
    player.coyoteTimer = 0.12;
  } else if (player.coyoteTimer > 0) {
    player.coyoteTimer -= dt;
  }

  const wantsJump = player.jumpBufferTimer > 0;
  const canJump = player.onGround || player.coyoteTimer > 0;

  if (player.onGround) {
    applyFriction(dt);
    accelerate(_wish, wishSpeed, PLAYER.accel, dt);
    if (wantsJump && canJump) {
      player.vel.y = PLAYER.jump;
      player.onGround = false;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      events.emit('player:jump');
    }
  } else {
    accelerate(_wish, Math.min(wishSpeed, PLAYER.run), PLAYER.airAccel, dt);
    if (wantsJump && canJump) {
      player.vel.y = PLAYER.jump;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      events.emit('player:jump');
    }
  }

  player.vel.y += gravityFor(1) * dt;
  if (player.vel.y < -70) player.vel.y = -70;

  player.pos.addScaledVector(player.vel, dt);
  player.onGround = resolveAgainstWorld(dt);

  /* head bob, for first person */
  const hspeed = Math.hypot(player.vel.x, player.vel.z);
  player.bob += hspeed * dt * 1.5;

  updateAvatar(dt, hspeed);
}

function updateAvatar(dt, hspeed) {
  avatar.position.copy(player.pos);
  avatar.rotation.y = player.yaw + Math.PI;
  avatar.scale.y = player.height / PLAYER.height;

  const swing = Math.sin(player.bob * 2) * Math.min(0.7, hspeed * 0.06);
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.6;
  arms[1].rotation.x = -0.9 - player.pitch * 0.6;   // the tool arm points where you aim
  head.rotation.x = -player.pitch * 0.5;
  visor.rotation.x = -player.pitch * 0.5;
}

/** Blast response: explosions throw the player too. */
export function blastPlayer(point, power, radius) {
  if (!player.enabled) return;
  _n.set(player.pos.x, player.pos.y + player.height * 0.5, player.pos.z).sub(point);
  const d = _n.length();
  if (d > radius) return;
  const k = power / ((d + 1.2) * (d + 1.2)) * 0.02;
  _n.divideScalar(Math.max(d, 1e-4));
  player.vel.addScaledVector(_n, Math.min(k, 34));
  player.onGround = false;
}

export function setPlayerEnabled(on) {
  player.enabled = on;
  avatar.visible = on;
  events.emit('player:enabled', on);
}

export function respawnPlayer(x = 0, z = 9) {
  player.pos.set(x, 0.2, z);
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(-x, -z);
  player.pitch = 0;
}

setPlayerEnabled(false);
