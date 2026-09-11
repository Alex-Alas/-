/* =========================================================
   REMOTE BOMB — slot 5

   Places sticky surface bombs under the crosshair.
   - LMB: Places a small RigidBody bomb against the surface.
   - RMB: Sequentially detonates all placed bombs in order with
     a ~90 ms interval between them for a visible chain reaction.
   - R (reload): Removes placed bombs without detonating.
   - Armed bombs blink rhythmically while active.
   ========================================================= */
import * as THREE from 'three';
import { Tools } from './index.js';
import { scene } from '../render/scene.js';
import { makeMaterial, flat } from '../render/shader.js';
import { RigidBody, SHAPE } from '../physics/rigidbody.js';
import { addBody, removeBody } from '../physics/world.js';
import { explode } from './explosion.js';
import { aimHit } from './aim.js';

const COLOUR = 0xffd76a;
const FLASH_COLOUR = 0xff2a2a;
const BOMB_RADIUS = 0.22;
const BOMB_MASS = 2.0;
const CHAIN_INTERVAL = 0.09; // 90 ms between detonations

export const placedBombs = [];
export const detonateQueue = [];
let detonateTimer = 0;
let blinkClock = 0;

const _spawnPos = new THREE.Vector3();

function createBombMesh() {
  const group = new THREE.Group();

  // Main bomb body
  const bodyGeo = flat(new THREE.IcosahedronGeometry(BOMB_RADIUS, 1));
  const bodyMat = makeMaterial(COLOUR);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // Blinking LED sensor on top
  const ledGeo = flat(new THREE.CylinderGeometry(BOMB_RADIUS * 0.35, BOMB_RADIUS * 0.35, 0.08, 6));
  const ledMat = makeMaterial(FLASH_COLOUR);
  const ledMesh = new THREE.Mesh(ledGeo, ledMat);
  ledMesh.position.y = BOMB_RADIUS * 0.88;
  group.add(ledMesh);

  scene.add(group);
  return { group, bodyMat, ledMat };
}

export function placeBomb() {
  const hit = aimHit(60);
  if (!hit) return null;

  // Place attached/resting on the surface: hit.point + hit.normal * radius
  _spawnPos.copy(hit.point).addScaledVector(hit.normal, BOMB_RADIUS + 0.01);

  const { group, bodyMat, ledMat } = createBombMesh();

  const body = new RigidBody({
    shape: SHAPE.SPHERE,
    radius: BOMB_RADIUS,
    mass: BOMB_MASS,
    mesh: group,
    friction: 0.85,
    restitution: 0.12,
    pos: _spawnPos.toArray(),
  });

  body.type = 'bomb';
  body._bodyMat = bodyMat;
  body._ledMat = ledMat;
  body.updateTransforms();
  body.syncMesh();

  addBody(body);
  placedBombs.push(body);

  return body;
}

export function triggerDetonation() {
  if (placedBombs.length === 0) return;
  detonateQueue.push(...placedBombs);
  placedBombs.length = 0;
  detonateTimer = 0; // Detonate the first bomb immediately
}

export function clearBombs() {
  for (const b of placedBombs) {
    if (!b.removed) removeBody(b);
  }
  placedBombs.length = 0;

  for (const b of detonateQueue) {
    if (!b.removed) removeBody(b);
  }
  detonateQueue.length = 0;
}

export function updateBombs(dt) {
  blinkClock += dt;
  const isFlash = Math.floor(blinkClock * 6) % 2 === 0;

  // Visual blinking while armed
  for (const b of placedBombs) {
    if (b.removed) continue;
    if (b._ledMat?.uniforms?.uColor) {
      b._ledMat.uniforms.uColor.value.setHex(isFlash ? FLASH_COLOUR : 0x440000);
    }
  }

  // Handle staggered sequential detonation
  if (detonateQueue.length > 0) {
    detonateTimer -= dt;
    while (detonateTimer <= 0 && detonateQueue.length > 0) {
      const b = detonateQueue.shift();
      if (!b.removed) {
        explode(b.pos, { power: 700, radius: 9 });
        removeBody(b);
      }
      detonateTimer += CHAIN_INTERVAL;
    }
  }
}

Tools.register({
  id: 'bomb',
  slot: 5,
  name: 'BOMB',
  colour: COLOUR,
  hint: {
    lmb: 'colocar bomba',
    rmb: 'detonar todas',
    extra: 'R: retirar bombas',
  },

  equip() {},
  unequip() {},

  primary(down) {
    if (down) placeBomb();
  },

  secondary(down) {
    if (down) triggerDetonation();
  },

  reload() {
    clearBombs();
  },

  update(dt) {
    // updateBombs is executed continuously in the global frame loop
  },
});
