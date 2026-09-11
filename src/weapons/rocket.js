/* =========================================================
   ROCKET LAUNCHER — slot 4

   Fires a fast ballistic projectile from `muzzle` in the direction
   of aim. To prevent tunneling through crates at high velocity (60-120 u/s),
   the rocket is NOT a RigidBody: it is a dedicated entity that performs
   continuous swept raycasting each frame.
   ========================================================= */
import * as THREE from 'three';
import { Tools } from './index.js';
import { scene } from '../render/scene.js';
import { makeMaterial, flat } from '../render/shader.js';
import { raycast } from '../physics/world.js';
import { explode } from './explosion.js';
import { spawnShards } from '../physics/debris.js';
import { aim, aimHit } from './aim.js';
import { player, muzzle } from '../entities/player.js';

const COLOUR = 0xff5a5a;
const COOLDOWN = 1.0 / 1.1; // ~1.1 shots per second (~0.909 s)
export const ROCKET_CONFIG = {
  speed: 60,                // units/s
  gravity: -6.0,            // soft arc drop
  radius: 0.16,             // collision sweep radius
  maxLife: 5.0,             // max flight duration in seconds
  recoil: 4.8,              // impulse kick applied to player.vel
};

export const activeRockets = [];
let fireCooldown = 0;

const _muzzlePos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _stepDir = new THREE.Vector3();
const _prevPos = new THREE.Vector3();
const _trailDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function createRocketMesh() {
  const group = new THREE.Group();

  // Nose cone (tip along +Y)
  const coneGeo = flat(new THREE.ConeGeometry(ROCKET_CONFIG.radius, 0.52, 8));
  const coneMat = makeMaterial(COLOUR);
  const coneMesh = new THREE.Mesh(coneGeo, coneMat);
  coneMesh.position.y = 0.12;
  group.add(coneMesh);

  // Rear booster ring
  const ringGeo = flat(new THREE.CylinderGeometry(ROCKET_CONFIG.radius * 0.95, ROCKET_CONFIG.radius * 0.95, 0.22, 8));
  const ringMat = makeMaterial(0x2d2238);
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = -0.16;
  group.add(ringMesh);

  scene.add(group);
  return group;
}

export function spawnRocket(customSpeed = null) {
  if (!muzzle) return null;
  muzzle.getWorldPosition(_muzzlePos);

  // Converge trajectory towards point under crosshair
  const hit = aimHit(200);
  if (hit) {
    _target.copy(hit.point);
  } else {
    _target.copy(aim.origin).addScaledVector(aim.dir, 200);
  }

  _dir.copy(_target).sub(_muzzlePos);
  if (_dir.lengthSq() < 1e-4) _dir.copy(aim.dir);
  _dir.normalize();

  const speed = customSpeed !== null ? customSpeed : ROCKET_CONFIG.speed;
  const mesh = createRocketMesh();
  mesh.position.copy(_muzzlePos);
  mesh.quaternion.setFromUnitVectors(UP, _dir);

  const rocket = {
    pos: _muzzlePos.clone(),
    prevPos: _muzzlePos.clone(),
    vel: _dir.clone().multiplyScalar(speed),
    radius: ROCKET_CONFIG.radius,
    life: ROCKET_CONFIG.maxLife,
    mesh,
    trailTimer: 0,
  };
  activeRockets.push(rocket);

  // Recoil push on player
  player.vel.addScaledVector(aim.dir, -ROCKET_CONFIG.recoil);

  return rocket;
}

export function updateRockets(dt) {
  if (fireCooldown > 0) fireCooldown -= dt;

  for (let i = activeRockets.length - 1; i >= 0; i--) {
    const r = activeRockets[i];
    r.life -= dt;
    if (r.life <= 0) {
      destroyRocket(i);
      continue;
    }

    _prevPos.copy(r.pos);

    // Apply soft gravity
    r.vel.y += ROCKET_CONFIG.gravity * dt;

    const speed = r.vel.length();
    if (speed < 1e-4) {
      destroyRocket(i);
      continue;
    }

    _stepDir.copy(r.vel).divideScalar(speed);
    const stepDist = speed * dt;

    // Continuous sweep raycast: detects dynamic bodies, static geometry and ground plane
    const hit = raycast(_prevPos, _stepDir, stepDist + r.radius);
    if (hit) {
      explode(hit.point, { power: 780, radius: 10 });
      destroyRocket(i);
      continue;
    }

    // Advance position
    r.pos.addScaledVector(r.vel, dt);
    r.mesh.position.copy(r.pos);
    r.mesh.quaternion.setFromUnitVectors(UP, _stepDir);

    // Trail particles
    r.trailTimer += dt;
    if (r.trailTimer >= 0.03) {
      r.trailTimer = 0;
      _trailDir.copy(_stepDir).multiplyScalar(-2.5);
      spawnShards(r.pos, 1, _trailDir);
    }
  }
}

function destroyRocket(index) {
  const r = activeRockets[index];
  if (!r) return;
  if (r.mesh && r.mesh.parent) {
    r.mesh.parent.remove(r.mesh);
  }
  activeRockets.splice(index, 1);
}

export function clearRockets() {
  for (let i = activeRockets.length - 1; i >= 0; i--) {
    destroyRocket(i);
  }
}

Tools.register({
  id: 'rocket',
  slot: 4,
  name: 'ROCKET',
  colour: COLOUR,
  hint: {
    lmb: 'disparar cohete',
    rmb: '',
    extra: 'proyectil balístico de alta velocidad',
  },

  equip() {},
  unequip() {},

  primary(down) {
    if (down && fireCooldown <= 0) {
      spawnRocket();
      fireCooldown = COOLDOWN;
    }
  },

  update(dt) {
    // Keep active rockets updating even if unequipped via global loop
  },
});
