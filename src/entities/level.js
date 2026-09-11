/* =========================================================
   LEVEL
   The arena: ground plane plus a table of immovable blocks. Blocks are
   data, so laying out a different sandbox is an edit to LEVEL_BLOCKS —
   no code changes anywhere else.
   ========================================================= */
import * as THREE from 'three';
import { scene } from '../render/scene.js';
import { makeMaterial, flat, makeCheckerTexture } from '../render/shader.js';
import { addStaticBox } from '../physics/statics.js';
import { addStaticBoxBody } from '../physics/world.js';

const groundTex = makeCheckerTexture('#2c2447', '#241d3a');

export const ground = new THREE.Mesh(
  flat(new THREE.PlaneGeometry(120, 120, 60, 60)),
  makeMaterial(0xffffff, { map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

export const LEVEL_BLOCKS = [
  /* the original three blocks — the cinematic frames around them */
  { p: [ 4.4, 0.45, -2.6], s: [2.2, 0.9, 2.2], c: 0x4a3d72 },
  { p: [-4.8, 0.35,  1.9], s: [1.8, 0.7, 1.8], c: 0x453a6b },
  { p: [ 1.7, 1.15,  4.4], s: [2.6, 2.3, 2.6], c: 0x554480 },

  /* sandbox furniture: somewhere to climb, shoot from and knock things off */
  { p: [-11.0, 0.75, -9.0], s: [6.0, 1.5, 6.0], c: 0x3f3564 },
  { p: [-11.0, 1.85, -12.2], s: [6.0, 0.7, 0.6], c: 0x574a86 },
  { p: [ 12.0, 1.60,  9.0], s: [5.0, 3.2, 5.0], c: 0x3f3564 },
  { p: [ 12.0, 0.55,  5.2], s: [5.0, 1.1, 1.6], c: 0x4a3d72 },
  { p: [ 0.0, 2.20, -13.0], s: [9.0, 4.4, 0.8], c: 0x342b52 },
  { p: [-13.5, 1.10,  6.0], s: [1.0, 2.2, 1.0], c: 0x574a86 },
  { p: [-10.5, 1.10,  6.0], s: [1.0, 2.2, 1.0], c: 0x574a86 },
  { p: [-12.0, 2.40,  6.0], s: [4.2, 0.5, 1.2], c: 0x6a5a9e },
];

export const blocks = [];

for (const b of LEVEL_BLOCKS) {
  const m = new THREE.Mesh(flat(new THREE.BoxGeometry(b.s[0], b.s[1], b.s[2])), makeMaterial(b.c));
  m.position.set(b.p[0], b.p[1], b.p[2]);
  scene.add(m);
  blocks.push({
    mesh: m,
    def: b,
    box: addStaticBox(b.p, b.s),      // particle solvers (ragdoll, fluid)
    body: addStaticBoxBody(b.p, b.s), // rigid world
  });
}
