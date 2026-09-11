/* =========================================================
   STATIC COLLIDERS
   Axis-aligned boxes that never move. The particle solvers (verlet
   ragdoll, SPH fluid) collide against this list directly; the rigid
   body world builds immovable bodies from the same definitions, so a
   level only has to describe its geometry once.
   ========================================================= */
import * as THREE from 'three';

export const colliders = [];

export function addStaticBox(center, size) {
  const half = [size[0] / 2, size[1] / 2, size[2] / 2];
  const box = {
    min: new THREE.Vector3(center[0] - half[0], center[1] - half[1], center[2] - half[2]),
    max: new THREE.Vector3(center[0] + half[0], center[1] + half[1], center[2] + half[2]),
  };
  colliders.push(box);
  return box;
}

/** World bounds shared by every solver (the ground plane is y = 0). */
export const BOUNDS = 30;
