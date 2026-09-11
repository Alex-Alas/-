/* =========================================================
   MAGNET VISUALS
   The orb and its expanding field rings. The pull itself lives in the
   solvers; this is only what it looks like.
   ========================================================= */
import * as THREE from 'three';
import { scene } from '../render/scene.js';
import { makeMaterial } from '../render/shader.js';
import { sphereMesh } from '../render/shapes.js';
import { sim, magnetTarget } from '../physics/sim.js';

export const magnetOrb = sphereMesh(0.24, makeMaterial(0xff5fd0, { alpha: 0.95 }), 1);
magnetOrb.visible = false;
scene.add(magnetOrb);

export const fieldRings = new THREE.Group();
scene.add(fieldRings);
export const ringMeshes = [];
for (let i = 0; i < 3; i++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.035, 6, 24),
    makeMaterial(0xff7fd8, { alpha: 0.55 })
  );
  ring.rotation.x = Math.PI / 2;
  fieldRings.add(ring);
  ringMeshes.push(ring);
}
fieldRings.visible = false;

export function updateMagnetVisuals(dt, now) {
  magnetOrb.visible = sim.magnet;
  fieldRings.visible = sim.magnet;
  if (!sim.magnet) return;

  magnetOrb.position.copy(magnetTarget);
  magnetOrb.rotation.y += dt * 2.2;
  magnetOrb.rotation.x += dt * 1.1;
  magnetOrb.scale.setScalar(1 + Math.sin(now * 0.008) * 0.22);

  fieldRings.position.copy(magnetTarget);
  fieldRings.rotation.y += dt * 1.6;
  fieldRings.rotation.z += dt * 0.9;
  for (let i = 0; i < ringMeshes.length; i++) {
    const r = ringMeshes[i];
    const t = (now * 0.0016 + i * 0.33) % 1;
    r.scale.setScalar(0.4 + t * 3.6);
    r.material.uniforms.uAlpha.value = (1 - t) * 0.55;
  }
}
