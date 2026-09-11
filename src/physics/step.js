/* =========================================================
   WORLD STEP
   One fixed physics tick, in the order the couplings need: rigid bodies
   first, then the player against them, then the verlet ragdoll, then the
   fluid around whatever is left. Kept apart from the frame loop so tests
   can advance the world without rendering it.
   ========================================================= */
import { updateWind } from './sim.js';
import { stepRigid, pushBodySolids, collideParticleWithBodies } from './world.js';
import { FL, fluidStep, clearSolids } from './fluid.js';
import { stepPlayer } from '../entities/player.js';
import { updateAttachments } from '../entities/attachments.js';
import { stepBuddy, matDef, buddy, particles } from '../entities/buddy/index.js';

export const FIXED_DT = 1 / 60;

export function stepWorld(dt) {
  const M = matDef(buddy.material);

  updateWind(dt);
  clearSolids();            // obstacle list for the fluid, rebuilt by its owners

  updateAttachments(dt);      // thrusters and balloons push before the solve
  stepRigid(dt);
  stepPlayer(dt);
  stepBuddy(dt);

  /* the ragdoll is pushed around by the props, and pushes back */
  for (const p of particles) {
    if (p.grabbed) continue;
    collideParticleWithBodies(p, p.radius * M.radiusMul, p.invMass > 0 ? 1 / p.invMass : 1, dt);
  }

  if (FL.n > 0) {
    pushBodySolids();
    fluidStep(dt, M.gravityMul);
  }
}

/** Run the world forward without waiting for frames. Used by tests. */
export function advance(seconds) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) stepWorld(FIXED_DT);
  return steps;
}
