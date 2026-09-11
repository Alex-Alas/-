/* =========================================================
   EXPLOSIONS
   One blast touches every solver in the sandbox: rigid bodies take an
   impulse at their near face (so they tumble rather than slide), the
   verlet ragdoll and the SPH puddle are kicked, the player is thrown,
   and the camera shakes. Everything else in the codebase reaches this
   through explode() or by listening for the event.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { scene } from '../render/scene.js';
import { makeMaterial } from '../render/shader.js';
import { sphereMesh } from '../render/shapes.js';
import { bodies } from '../physics/world.js';
import { spawnShards } from '../physics/debris.js';
import { blastFluid, FL } from '../physics/fluid.js';
import { addShake } from '../camera/rig.js';
import { blastBuddy } from '../entities/buddy/index.js';
import { blastPlayer } from '../entities/player.js';

const MAX_DV = 48;

const _d = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _at = new THREE.Vector3();

/* ---- flash pool ---- */
const FLASHES = 6;
const flashes = [];
for (let i = 0; i < FLASHES; i++) {
  const m = sphereMesh(1, makeMaterial(0xffd98a, { alpha: 0.85 }), 1);
  m.visible = false;
  scene.add(m);
  flashes.push({ mesh: m, life: 0, radius: 1 });
}
let flashCursor = 0;

function flash(point, radius) {
  const f = flashes[flashCursor];
  flashCursor = (flashCursor + 1) % FLASHES;
  f.mesh.position.copy(point);
  f.mesh.visible = true;
  f.life = 0.42;
  f.radius = radius * 0.42;
}

export function updateExplosions(dt) {
  for (const f of flashes) {
    if (!f.mesh.visible) continue;
    f.life -= dt;
    if (f.life <= 0) { f.mesh.visible = false; continue; }
    const t = 1 - f.life / 0.42;
    f.mesh.scale.setScalar(f.radius * (0.35 + t * 1.5));
    f.mesh.material.uniforms.uAlpha.value = (1 - t) * 0.85;
  }
}

/**
 * @param point  world position of the blast
 * @param power  velocity scale: a body at distance d gains power/(d+1.5)^2
 * @param radius beyond this nothing is touched
 */
export function explode(point, { power = 620, radius = 9, shake = 0.7, shards = 22 } = {}) {
  for (const b of bodies) {
    if (b.immovable) continue;
    _d.copy(b.pos).sub(point);
    const d = _d.length();
    if (d > radius) continue;
    if (d < 1e-4) _d.set(0, 1, 0); else _d.divideScalar(d);

    const dv = Math.min(MAX_DV, power / ((d + 1.5) * (d + 1.5)));
    _imp.copy(_d).multiplyScalar(dv * b.mass);
    _imp.y += dv * b.mass * 0.25;          // blasts lift as well as push

    /* apply at the face nearest the blast: that is what makes things
       tumble instead of sliding away flat */
    const reach = b.shape === 'sphere' ? b.radius : Math.min(b.half.x, b.half.y, b.half.z);
    _at.copy(b.pos).addScaledVector(_d, -reach * 0.8);
    b.applyImpulse(_imp, _at);
  }

  blastBuddy(point, power, radius);
  blastPlayer(point, power, radius);
  if (FL.n > 0) blastFluid(point.x, point.y, point.z, power, radius);

  if (shards > 0) spawnShards(point, shards, _d.set(0, 2, 0));
  flash(point, radius);
  addShake(shake, 1.1);
  events.emit('explosion', { point: point.clone(), power, radius });
}
