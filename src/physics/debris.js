/* =========================================================
   DEBRIS
   A recycled pool of tumbling shards. Anything that wants to throw
   fragments — a shattering porcelain limb, a rocket impact, a crate
   splintering — calls spawnShards() rather than owning particles.
   ========================================================= */
import * as THREE from 'three';
import { scene } from '../render/scene.js';
import { makeMaterial, flat } from '../render/shader.js';

const SHARD_COUNT = 220;
const shardGeo = flat(new THREE.TetrahedronGeometry(0.075));
const shardMat = makeMaterial(0xf6f4ff);
export const shards = [];
for (let i = 0; i < SHARD_COUNT; i++) {
  const m = new THREE.Mesh(shardGeo, shardMat);
  m.visible = false;
  scene.add(m);
  shards.push({ mesh: m, vel: new THREE.Vector3(), rot: new THREE.Vector3(), life: 0, base: 1 });
}
let shardCursor = 0;

export function spawnShards(pos, n, baseVel) {
  for (let i = 0; i < n; i++) {
    const s = shards[shardCursor];
    shardCursor = (shardCursor + 1) % SHARD_COUNT;
    s.mesh.visible = true;
    s.mesh.position.copy(pos);
    s.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    s.life = 1.6 + Math.random() * 1.4;
    s.base = 0.55 + Math.random() * 1.0;
    s.vel.set(
      (Math.random() - 0.5) * 8,
      Math.random() * 6.5 + 1.8,
      (Math.random() - 0.5) * 8
    ).add(baseVel);
    s.rot.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
  }
}

export function updateShards(dt) {
  for (const s of shards) {
    if (!s.mesh.visible) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }

    s.vel.y -= 26 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    if (s.mesh.position.y < 0.05) {
      s.mesh.position.y = 0.05;
      s.vel.y *= -0.34;
      s.vel.x *= 0.7;
      s.vel.z *= 0.7;
    }
    s.mesh.rotation.x += s.rot.x * dt;
    s.mesh.rotation.y += s.rot.y * dt;
    s.mesh.rotation.z += s.rot.z * dt;

    const k = Math.min(1, s.life / 0.8);
    s.mesh.scale.setScalar(s.base * (0.35 + 0.65 * k));
  }
}

