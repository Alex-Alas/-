/* =========================================================
   SIM — world-level physics settings
   Gravity, wind, zero-g, freeze, the magnet target: the knobs that apply
   to every solver in the sandbox (rigid bodies, the verlet ragdoll and
   the SPH fluid all read them). Tools mutate this; solvers only read it.
   ========================================================= */
import * as THREE from 'three';

export const GRAVITY = -26;            // world units / s^2 (1 unit ~= 0.55 m)
export const ITERATIONS_CAP = 44;
export const RESTITUTION_MIN = 0.02;

export const sim = {
  gravityScale: 1,       // 0 = zero-g, 1 = normal, negative = float up
  zeroG: false,
  wind: false,
  frozen: false,         // "pose": every dynamic thing holds still
  magnet: false,
  timeScale: 1,
};

export const wind = { x: 0, z: 0 };
export const magnetTarget = new THREE.Vector3(0, 2.5, 0);

let windPhase = 0;

/** Advance the wind field. Called once per physics step by the world. */
export function updateWind(dt) {
  windPhase += dt;
  if (sim.wind) {
    wind.x = Math.sin(windPhase * 0.72) * 1.3 + Math.sin(windPhase * 2.1) * 0.45;
    wind.z = Math.cos(windPhase * 0.55) * 1.3 + Math.cos(windPhase * 2.4) * 0.45;
  } else {
    wind.x = 0; wind.z = 0;
  }
}

/** Effective gravity for a body whose material scales it. */
export function gravityFor(mul = 1) {
  return sim.zeroG ? 0 : GRAVITY * sim.gravityScale * mul;
}

/** Turn every world toggle off — used between cinematic shots. */
export function resetToggles() {
  sim.frozen = false;
  sim.zeroG = false;
  sim.magnet = false;
  sim.wind = false;
}
