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

const groundTex = makeCheckerTexture('#2c2447', '#241d3a');

export const ground = new THREE.Mesh(
  flat(new THREE.PlaneGeometry(120, 120, 60, 60)),
  makeMaterial(0xffffff, { map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

export const LEVEL_BLOCKS = [
  { p: [ 4.4, 0.45, -2.6], s: [2.2, 0.9, 2.2], c: 0x4a3d72 },
  { p: [-4.8, 0.35,  1.9], s: [1.8, 0.7, 1.8], c: 0x453a6b },
  { p: [ 1.7, 1.15,  4.4], s: [2.6, 2.3, 2.6], c: 0x554480 },
];

export const blocks = [];

for (const b of LEVEL_BLOCKS) {
  const m = new THREE.Mesh(flat(new THREE.BoxGeometry(b.s[0], b.s[1], b.s[2])), makeMaterial(b.c));
  m.position.set(b.p[0], b.p[1], b.p[2]);
  scene.add(m);
  blocks.push({ mesh: m, def: b, box: addStaticBox(b.p, b.s) });
}
