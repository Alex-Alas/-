/* =========================================================
   BUDDY SOFT BODY
   Verlet integration, distance constraints with breakage, collision
   against the world, plus the melt that sheds the body into the SPH
   fluid. This solver owns the ragdoll only — rigid props are a separate
   world (physics/world.js) and the two are coupled through contacts.
   ========================================================= */
import * as THREE from 'three';
import { ITERATIONS_CAP, RESTITUTION_MIN, sim, wind, magnetTarget, gravityFor } from '../../physics/sim.js';
import { colliders } from '../../physics/statics.js';
import { spawnShards } from '../../physics/debris.js';
import { FL, fluidSpawn, addSolid } from '../../physics/fluid.js';
import { addShake } from '../../camera/rig.js';
import { pointer } from '../../ui/pointer.js';
import { P, particles, constraints } from './skeleton.js';
import { jointMeshes, PART_ORDER, partAlpha } from './meshes.js';
import { matDef } from './materials.js';
import { buddy } from './state.js';

/* ---------------------------------------------------------
   Emission — the body dissolves into the fluid, part by part
   --------------------------------------------------------- */
const MELT_EMIT = [
  ['handL', 'elbowL', 0.16], ['handR', 'elbowR', 0.16],
  ['footL', 'kneeL', 0.16],  ['footR', 'kneeR', 0.16],
  ['elbowL', 'shoulderL', 0.16], ['elbowR', 'shoulderR', 0.16],
  ['kneeL', 'hip', 0.18], ['kneeR', 'hip', 0.18],
  ['shoulderL', 'chest', 0.18], ['shoulderR', 'chest', 0.18],
  ['hip', 'chest', 0.26],
  ['chest', 'head', 0.24],
  ['head', 'head', 0.42],
].map(([a, b, jit]) => ({
  a: P[a], b: P[b], jit,
  order: Math.min(PART_ORDER[a], PART_ORDER[b]),
}));

const _emitPool = [];

export function meltEmit(meltK, dt, M) {
  const want = Math.round(Math.min(1, meltK * 1.06) * FL.max);
  let budget = Math.min(want - FL.n, 12);
  if (budget <= 0) return;

  pushBuddySolids(M, meltK);

  _emitPool.length = 0;
  for (const s of MELT_EMIT) if (meltK >= s.order) _emitPool.push(s);
  if (_emitPool.length === 0) return;

  const inv = 1 / dt;
  while (budget-- > 0 && FL.n < FL.max) {
    const s = _emitPool[(Math.random() * _emitPool.length) | 0];
    const t = Math.random();
    const j = s.jit;
    const x = s.a.pos.x + (s.b.pos.x - s.a.pos.x) * t + (Math.random() - 0.5) * j;
    const y = s.a.pos.y + (s.b.pos.y - s.a.pos.y) * t + (Math.random() - 0.5) * j;
    const z = s.a.pos.z + (s.b.pos.z - s.a.pos.z) * t + (Math.random() - 0.5) * j;

    let vx = (s.a.pos.x - s.a.prev.x) * inv;
    let vy = (s.a.pos.y - s.a.prev.y) * inv;
    let vz = (s.a.pos.z - s.a.prev.z) * inv;
    const sp2 = vx * vx + vy * vy + vz * vz;
    if (sp2 > 144) { const k = 12 / Math.sqrt(sp2); vx *= k; vy *= k; vz *= k; }

    fluidSpawn(x, y, z, vx, vy, vz);
  }
}

/* The still-solid parts of the body are obstacles the puddle has to flow
   around. They are handed to the fluid every step; the fluid neither knows
   nor cares that they belong to a melting ragdoll. */
let solidsPushed = false;

export function pushBuddySolids(M, meltK) {
  if (solidsPushed || meltK >= 0.99) return;
  solidsPushed = true;
  for (const j of jointMeshes) {
    const k = partAlpha(j.order, meltK);
    if (k <= 0.08) continue;
    if (!addSolid(j.p.pos.x, j.p.pos.y, j.p.pos.z, j.p.radius * M.radiusMul * k)) break;
  }
  const hk = partAlpha(PART_ORDER.head, meltK);
  if (hk > 0.08) addSolid(P.head.pos.x, P.head.pos.y, P.head.pos.z, 0.50 * M.radiusMul * hk);
}


const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();

export function breakConstraint(c) {
  c.broken = true;
  c.repairTimer = 2.4;
  _tmpA.copy(c.a.pos).add(c.b.pos).multiplyScalar(0.5);
  _tmpB.copy(c.b.pos).sub(c.a.pos);
  const len = _tmpB.length();
  if (len > 1e-5) _tmpB.multiplyScalar(0.55 / len); else _tmpB.set(0, 0, 0);

  const isVase = buddy.material === 'vase';
  spawnShards(_tmpA, isVase ? 10 : 3, _tmpB);
  addShake(isVase ? 0.26 : 0.16, 0.75);
}

function solveConstraint(c) {
  if (c.broken) return;
  const a = c.a, b = c.b;
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dz = b.pos.z - a.pos.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < 1e-10) return;

  const dist = Math.sqrt(d2);

  if (c.breakAt > 0 && dist > c.breakAt) { breakConstraint(c); return; }
  if (c.mode === 1 && dist >= c.rest) return;
  if (c.mode === 2 && dist <= c.rest) return;

  const w = a.invMass + b.invMass;
  if (w < 1e-9) return;

  const diff = ((dist - c.rest) / dist) * c.stiffness;
  const kx = dx * diff, ky = dy * diff, kz = dz * diff;
  const ka = a.invMass / w, kb = b.invMass / w;

  a.pos.x += kx * ka; a.pos.y += ky * ka; a.pos.z += kz * ka;
  b.pos.x -= kx * kb; b.pos.y -= ky * kb; b.pos.z -= kz * kb;
}

function collideSphere(p, M, radius) {
  const rad = radius !== undefined ? radius : p.radius;
  if (p.pos.y < rad) p.pos.y = rad;

  // bouncy ceiling for rubber
  if (M.ceiling < 1e8 && p.pos.y > M.ceiling - rad) {
    const vyBefore = p.pos.y - p.prev.y;
    p.pos.y = M.ceiling - rad;
    if (vyBefore > 0.004) p.prev.y = p.pos.y - vyBefore * Math.max(RESTITUTION_MIN, M.restitution * 0.6);
  }

  for (const c of colliders) {
    const cx = Math.max(c.min.x, Math.min(p.pos.x, c.max.x));
    const cy = Math.max(c.min.y, Math.min(p.pos.y, c.max.y));
    const cz = Math.max(c.min.z, Math.min(p.pos.z, c.max.z));
    const dx = p.pos.x - cx, dy = p.pos.y - cy, dz = p.pos.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > rad * rad) continue;

    const d = Math.sqrt(d2);
    if (d > 1e-5) {
      const s = (rad - d) / d;
      p.pos.x += dx * s; p.pos.y += dy * s; p.pos.z += dz * s;
    } else {
      const px1 = p.pos.x - c.min.x, px2 = c.max.x - p.pos.x;
      const py1 = p.pos.y - c.min.y, py2 = c.max.y - p.pos.y;
      const pz1 = p.pos.z - c.min.z, pz2 = c.max.z - p.pos.z;
      const m = Math.min(px1, px2, py1, py2, pz1, pz2);
      if (m === px1) p.pos.x = c.min.x - rad;
      else if (m === px2) p.pos.x = c.max.x + rad;
      else if (m === py1) p.pos.y = c.min.y - rad;
      else if (m === py2) p.pos.y = c.max.y + rad;
      else if (m === pz1) p.pos.z = c.min.z - rad;
      else p.pos.z = c.max.z + rad;
    }
  }

  const B = 30;
  p.pos.x = Math.max(-B, Math.min(B, p.pos.x));
  p.pos.z = Math.max(-B, Math.min(B, p.pos.z));
}


export function stepBuddy(dt) {
  solidsPushed = false;
  const M = matDef(buddy.material);
  const frozen = sim.frozen;
  const dt2 = dt * dt;
  const iters = Math.min(ITERATIONS_CAP, M.iterations);

  /* --- melt progress --- */
  if (M.meltDuration > 0 && !frozen) {
    buddy.meltTimer += dt;
    buddy.melt = Math.min(1, buddy.meltTimer / M.meltDuration);
  } else if (M.meltDuration === 0) {
    buddy.melt = 0;
    buddy.meltTimer = 0;
  }
  const meltK = buddy.melt;

  /* --- melt eases material properties --- */
  const stiffnessNow   = M.stiffness  * (1 - meltK * 0.94);   // 1 → 0.06
  const dampingNow     = Math.max(0.90, M.damping - meltK * 0.035);
  const frictionNow    = M.friction   * (1 - meltK * 0.68);
  const gravityNow     = M.gravityMul * (1 + meltK * 0.45);
  const cohesionNow    = M.cohesion   * (1 - meltK * 0.78);

  const g = frozen ? 0 : gravityFor(gravityNow);
  const damp = frozen ? 0 : dampingNow;
  const airDrag = frozen ? 1 : Math.max(0, 1 - M.drag * dt);

  const windX = wind.x, windZ = wind.z;

  if (!frozen) {
    /* ---- verlet integration ---- */
    for (const p of particles) {
      if (p.invMass === 0 || p.grabbed) continue;
      const vx = (p.pos.x - p.prev.x) * damp * airDrag;
      const vy = (p.pos.y - p.prev.y) * damp * airDrag;
      const vz = (p.pos.z - p.prev.z) * damp * airDrag;
      p.prev.set(p.pos.x, p.pos.y, p.pos.z);
      p.pos.x += vx + windX * 16 * dt2;
      p.pos.y += vy + g * dt2;
      p.pos.z += vz + windZ * 16 * dt2;
    }

    /* ---- magnet: strong inverse-square pull ---- */
    if (sim.magnet && !pointer.dragging) {
      for (const p of particles) {
        if (p.invMass === 0 || p.grabbed) continue;
        const dx = magnetTarget.x - p.pos.x;
        const dy = magnetTarget.y - p.pos.y;
        const dz = magnetTarget.z - p.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.20;
        const d = Math.sqrt(d2);
        let acc = 340 / d2;
        if (acc > 900) acc = 900;
        if (acc < 8) acc = 8;
        const s = (acc * dt2) / d;
        p.pos.x += dx * s;
        p.pos.y += dy * s;
        p.pos.z += dz * s;
      }
    }

    /* ---- cohesion: pull every particle toward the centroid ---- */
    if (cohesionNow > 0.01) {
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const p of particles) {
        if (p.grabbed) continue;
        cx += p.pos.x; cy += p.pos.y; cz += p.pos.z;
        n++;
      }
      if (n > 0) {
        cx /= n; cy /= n; cz /= n;
        const k = cohesionNow * dt2;
        for (const p of particles) {
          if (p.grabbed) continue;
          p.pos.x += (cx - p.pos.x) * k;
          p.pos.y += (cy - p.pos.y) * k;
          p.pos.z += (cz - p.pos.z) * k;
        }
      }
    }

    /* ---- melt: shed the body into the fluid ---- */
    if (M.meltDuration > 0) meltEmit(meltK, dt, M);
  }

  /* ---- constraint tuning ---- */
  for (const c of constraints) c.stiffness = stiffnessNow;
  for (const c of constraints) {
    if (c.broken) {
      c.repairTimer -= dt;
      if (c.repairTimer <= 0) c.broken = false;
    }
    c.breakAt = M.breakStretch > 0 ? c.rest * M.breakStretch : 0;
  }

  for (let i = 0; i < iters; i++) {
    for (const c of constraints) solveConstraint(c);
    for (const p of particles) if (!p.grabbed) collideSphere(p, M, p.radius * (1 + meltK * 0.4));
  }

  /* ---- ground response ---- */
  for (const p of particles) {
    if (p.grabbed) continue;
    if (p.pos.y <= p.radius + 1e-4) {
      const vyBefore = p.pos.y - p.prev.y;
      p.pos.y = p.radius;

      const vx = p.pos.x - p.prev.x;
      const vz = p.pos.z - p.prev.z;
      p.prev.x = p.pos.x - vx * frictionNow;
      p.prev.z = p.pos.z - vz * frictionNow;

      const rest = Math.max(RESTITUTION_MIN, M.restitution);
      if (vyBefore < -0.004) p.prev.y = p.pos.y + vyBefore * rest;
      else p.prev.y = p.pos.y;
    }
  }

  if (frozen) for (const p of particles) p.prev.copy(p.pos);

  /* The melting body is an obstacle for its own puddle. Stepping the fluid
     itself is the world's job, not the buddy's. */
  if (FL.n > 0 && M.meltDuration > 0) pushBuddySolids(M, meltK);
}
