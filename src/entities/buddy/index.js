/* =========================================================
   BUDDY — public face of the ragdoll
   Everything outside entities/buddy/ talks to the creature through this
   module: swap his material, reset him, punch him. Internals (skeleton,
   meshes, solver) stay private to the folder.
   ========================================================= */
import { events } from '../../core/events.js';
import { fluidReset } from '../../physics/fluid.js';
import { shards } from '../../physics/debris.js';
import { P, particles, constraints, defs } from './skeleton.js';
import { colorTargets, jointMeshes, headGroup } from './meshes.js';
import { BuddyMaterials, matDef } from './materials.js';
import { buddy } from './state.js';
import { syncAll } from './sync.js';
import { stepBuddy } from './softbody.js';

export { buddy, P, particles, constraints, syncAll, stepBuddy, BuddyMaterials, matDef };

export function resetMelt() {
  buddy.melt = 0;
  buddy.meltTimer = 0;
  fluidReset();
}

export function setMaterial(id) {
  const M = matDef(id);
  buddy.material = M.id;

  for (const t of colorTargets) {
    const c = M.pal[t.key] !== undefined ? M.pal[t.key] : M.pal.body;
    t.mat.uniforms.uColor.value.setHex(c);
  }

  for (const j of jointMeshes) j.mesh.scale.copy(j.base).multiplyScalar(M.radiusMul);
  headGroup.scale.setScalar(M.radiusMul * 0.55 + 0.45);

  if (M.breakStretch <= 0) {
    for (const c of constraints) { c.broken = false; c.repairTimer = 0; }
  }

  resetMelt();
  events.emit('buddy:material', M);
}

export function resetCreature(heightOffset = 0.35) {
  for (const name in defs) {
    const d = defs[name];
    const p = P[name];
    p.pos.set(d[0], d[1] + heightOffset, d[2]);
    p.prev.copy(p.pos);
  }
  for (const c of constraints) { c.broken = false; c.repairTimer = 0; }
  for (const s of shards) s.mesh.visible = false;
  resetMelt();
}

/** Shift every particle's previous position: a uniform velocity kick. */
export function applyImpulse(vx, vy, vz) {
  for (const p of particles) {
    p.prev.x -= vx;
    p.prev.y -= vy;
    p.prev.z -= vz;
  }
}

export function spinImpulse(swirl) {
  const ax = (Math.random() - 0.5) * 2;
  const az = (Math.random() - 0.5) * 2;
  applyImpulse(ax * 0.32, 0.5 + Math.random() * 0.28, az * 0.32);
  for (const p of particles) {
    const rx = p.pos.x, rz = p.pos.z;
    p.prev.x += rz * swirl;
    p.prev.z -= rx * swirl;
  }
}

/** Push every particle away from a point — used by explosions and blasts. */
export function blastBuddy(point, power, radius) {
  for (const p of particles) {
    const dx = p.pos.x - point.x, dy = p.pos.y - point.y, dz = p.pos.z - point.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > radius * radius) continue;
    const d = Math.sqrt(d2) + 0.4;
    const k = (power / (d * d)) * 0.016;
    p.prev.x -= (dx / d) * k;
    p.prev.y -= (dy / d) * k;
    p.prev.z -= (dz / d) * k;
  }
}
