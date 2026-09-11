/* =========================================================
   PROPS
   The spawnable furniture of the sandbox. Each entry describes its
   shape, its mass and how to build its mesh; spawnProp() does the rest.
   A new prop is one register() call — the spawn menu, the remover and
   the weapons all work off the registry.
   ========================================================= */
import * as THREE from 'three';
import { Registry } from '../core/registry.js';
import { events } from '../core/events.js';
import { scene } from '../render/scene.js';
import { makeMaterial, flat } from '../render/shader.js';
import { RigidBody, SHAPE } from '../physics/rigidbody.js';
import { addBody } from '../physics/world.js';

export const Props = new Registry('prop');

function boxBody(opts) {
  const [sx, sy, sz] = opts.size;
  const mesh = new THREE.Mesh(flat(new THREE.BoxGeometry(sx, sy, sz)), makeMaterial(opts.color));
  scene.add(mesh);
  return new RigidBody({
    shape: SHAPE.BOX,
    half: [sx / 2, sy / 2, sz / 2],
    mass: opts.mass,
    mesh,
    friction: opts.friction,
    restitution: opts.restitution,
  });
}

function sphereBody(opts) {
  const mesh = new THREE.Mesh(flat(new THREE.IcosahedronGeometry(opts.radius, opts.detail ?? 1)), makeMaterial(opts.color));
  scene.add(mesh);
  return new RigidBody({
    shape: SHAPE.SPHERE,
    radius: opts.radius,
    mass: opts.mass,
    mesh,
    friction: opts.friction,
    restitution: opts.restitution,
  });
}

/* Drums use a faceted cylinder mesh over a box collider: it stacks and
   tips convincingly, which matters more here than rolling. */
function drumBody(opts) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    flat(new THREE.CylinderGeometry(opts.radius, opts.radius, opts.height, 8)),
    makeMaterial(opts.color)
  );
  g.add(body);
  const band = new THREE.Mesh(
    flat(new THREE.CylinderGeometry(opts.radius * 1.06, opts.radius * 1.06, opts.height * 0.16, 8)),
    makeMaterial(opts.band || 0x2b2440)
  );
  g.add(band);
  scene.add(g);
  const r = opts.radius * 0.82;
  return new RigidBody({
    shape: SHAPE.BOX,
    half: [r, opts.height / 2, r],
    mass: opts.mass,
    mesh: g,
    friction: 0.5,
    restitution: 0.2,
  });
}

Props.register({
  id: 'crate', label: 'CRATE', order: 0, dot: 0xb98a4a,
  build: () => boxBody({ size: [1.3, 1.3, 1.3], mass: 6, color: 0xb98a4a, friction: 0.6, restitution: 0.18 }),
});

Props.register({
  id: 'bigcrate', label: 'BIG CRATE', order: 1, dot: 0x8c6a3a,
  build: () => boxBody({ size: [2.3, 2.3, 2.3], mass: 26, color: 0x8c6a3a, friction: 0.65, restitution: 0.12 }),
});

Props.register({
  id: 'plank', label: 'PLANK', order: 2, dot: 0xcfa46a,
  build: () => boxBody({ size: [3.4, 0.26, 1.0], mass: 5, color: 0xcfa46a, friction: 0.55, restitution: 0.2 }),
});

Props.register({
  id: 'barrel', label: 'BARREL', order: 3, dot: 0x4fb9a0,
  build: () => drumBody({ radius: 0.62, height: 1.7, mass: 9, color: 0x4fb9a0 }),
});

Props.register({
  id: 'boom', label: 'EXPLOSIVE', order: 4, dot: 0xff5a5a,
  explosive: { power: 620, radius: 8.5 },
  build: () => drumBody({ radius: 0.62, height: 1.7, mass: 8, color: 0xff5a5a, band: 0xffe066 }),
});

Props.register({
  id: 'ball', label: 'BALL', order: 5, dot: 0xff9ec2,
  build: () => sphereBody({ radius: 0.62, mass: 3, color: 0xff9ec2, friction: 0.4, restitution: 0.72 }),
});

Props.register({
  id: 'bowling', label: 'BOWLING', order: 6, dot: 0x6b5aa8,
  build: () => sphereBody({ radius: 0.52, mass: 55, color: 0x6b5aa8, friction: 0.5, restitution: 0.12, detail: 2 }),
});

Props.register({
  id: 'balloonprop', label: 'BALLOON', order: 7, dot: 0xff7fa8,
  build: () => {
    const b = sphereBody({ radius: 0.7, mass: 0.9, color: 0xff7fa8, friction: 0.3, restitution: 0.5 });
    b.gravityScale = -0.35;        // floats
    b.linDamp = 0.9;
    b.angDamp = 0.9;
    return b;
  },
});

/** Build a prop and drop it into the world. */
export function spawnProp(id, pos, opts = {}) {
  const def = Props.get(id);
  if (!def) return null;
  const body = def.build();
  body.type = def.id;
  body.def = def;
  if (pos) body.pos.copy(pos);
  if (opts.vel) body.vel.copy(opts.vel);
  if (opts.angVel) body.angVel.copy(opts.angVel);
  if (opts.quat) body.quat.copy(opts.quat);
  body.updateTransforms();
  body.syncMesh();
  addBody(body);
  events.emit('prop:spawned', body);
  return body;
}
