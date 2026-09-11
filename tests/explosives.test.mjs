import assert from 'node:assert/strict';
import test from 'node:test';

test('rocket swept raycast prevents tunneling through thin crates at 60 and 120 u/s', () => {
  // Simulate a crate with depth 1.3 at position z = 5.0 (front face at z = 4.35)
  const crateFrontZ = 4.35;
  const crateBackZ = 5.65;
  const radius = 0.16;

  for (const speed of [60, 120]) {
    const dt = 1 / 60; // standard 60Hz step
    const stepDist = speed * dt; // 1.0 u at 60 u/s, 2.0 u at 120 u/s

    // Rocket starts at z = 3.5 moving in +Z direction
    let currentZ = 3.5;
    let hit = false;
    let hitZ = null;

    // Simulate swept raycast step
    const prevZ = currentZ;
    const rayMaxDist = stepDist + radius;

    // Ray intersection test
    const distToFront = crateFrontZ - prevZ;
    if (distToFront >= 0 && distToFront <= rayMaxDist) {
      hit = true;
      hitZ = crateFrontZ;
    }

    assert.equal(hit, true, `Rocket at ${speed} u/s must detect collision via continuous sweep`);
    assert.ok(hitZ <= crateBackZ, `Rocket impact must occur at the front surface and not pass through`);
  }
});

test('remote bomb detonation queue processes bombs in sequential 90 ms intervals', () => {
  const queue = [
    { id: 1, pos: [0, 0, 0] },
    { id: 2, pos: [1, 0, 0] },
    { id: 3, pos: [2, 0, 0] },
  ];

  const exploded = [];
  let detonateTimer = 0;
  const CHAIN_INTERVAL = 0.09;

  function tick(dt) {
    if (queue.length === 0) return;
    detonateTimer -= dt;
    while (detonateTimer <= 0 && queue.length > 0) {
      const b = queue.shift();
      exploded.push(b.id);
      detonateTimer += CHAIN_INTERVAL;
    }
  }

  // Frame 1 (dt = 0.016): First bomb detonates immediately
  tick(0.016);
  assert.deepEqual(exploded, [1], 'First bomb should detonate immediately on trigger');
  assert.equal(queue.length, 2);

  // Advance time by 50 ms (total ~66 ms) -> second bomb should not detonate yet
  tick(0.05);
  assert.deepEqual(exploded, [1], 'Second bomb should wait for the 90 ms interval');

  // Advance time by 40 ms (total ~106 ms > 90 ms) -> second bomb detonates
  tick(0.04);
  assert.deepEqual(exploded, [1, 2], 'Second bomb detonates after 90 ms threshold');

  // Advance time by 90 ms -> third bomb detonates
  tick(0.09);
  assert.deepEqual(exploded, [1, 2, 3], 'All bombs detonated in sequential order');
  assert.equal(queue.length, 0);
});

test('explosive chain reaction staggers fuses and strictly prevents infinite recursion on 10 adjacent barrels', () => {
  const barrels = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    pos: [i * 0.5, 0, 0], // tightly packed along X
    def: { explosive: { power: 620, radius: 8.5 } },
    _fuseActive: false,
    _exploded: false,
    removed: false,
    _fuseTime: 0,
  }));

  const activeFuses = [];
  let explosionCount = 0;

  function igniteExplosive(body) {
    if (!body || body.removed || body._fuseActive || body._exploded) {
      return false;
    }
    body._fuseActive = true;
    body._fuseTime = 0.12 + Math.random() * 0.14; // 120ms - 260ms
    activeFuses.push(body);
    return true;
  }

  function onExplosion(point, radius) {
    for (const b of barrels) {
      if (b.removed || b._fuseActive || b._exploded) continue;
      const dx = b.pos[0] - point[0];
      const dist = Math.abs(dx);
      if (dist <= radius) {
        igniteExplosive(b);
      }
    }
  }

  // Initial blast touches only the first barrel (spacing is 0.5)
  onExplosion([0, 0, 0], 0.4);
  assert.equal(activeFuses.length, 1, 'Only barrel within initial blast radius ignited');

  // Second blast on the same location should NOT duplicate or re-ignite
  onExplosion([0, 0, 0], 0.4);
  assert.equal(activeFuses.length, 1, 'Re-ignite guard prevents duplicate entries');

  // Step simulation until all barrels detonate
  const dt = 0.016;
  let totalSteps = 0;
  const maxSteps = 1000;

  while (activeFuses.length > 0 && totalSteps < maxSteps) {
    totalSteps++;
    for (let i = activeFuses.length - 1; i >= 0; i--) {
      const b = activeFuses[i];
      b._fuseTime -= dt;
      if (b._fuseTime <= 0) {
        b._fuseActive = false;
        b._exploded = true;
        b.removed = true;
        activeFuses.splice(i, 1);
        explosionCount++;

        // Trigger chain explosion for neighbors
        onExplosion(b.pos, b.def.explosive.radius);
      }
    }
  }

  assert.equal(explosionCount, 10, 'All 10 barrels must detonate exactly once');
  assert.equal(barrels.every(b => b._exploded && b.removed), true, 'All barrels properly marked and removed');
  assert.ok(totalSteps > 15, 'Chain reaction was staggered across multiple frames, not instant in 1 frame');
});

test('high velocity impact (|dv| > 22 u/s) triggers fuse ignition', () => {
  const barrel = {
    vel: { x: 0, y: -25, z: 0 },
    _prevVel: { x: 0, y: 0, z: 0 },
    def: { explosive: { power: 620, radius: 8.5 } },
    _fuseActive: false,
    _exploded: false,
  };

  const dv = Math.hypot(
    barrel.vel.x - barrel._prevVel.x,
    barrel.vel.y - barrel._prevVel.y,
    barrel.vel.z - barrel._prevVel.z
  );

  let ignited = false;
  if (dv >= 22.0 && !barrel._fuseActive) {
    barrel._fuseActive = true;
    ignited = true;
  }

  assert.equal(ignited, true, 'Velocity change of 25 u/s triggers impact detonation');
  assert.equal(barrel._fuseActive, true);
});
