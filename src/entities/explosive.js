/* =========================================================
   EXPLOSIVE PROPS & CHAIN REACTION

   Manages explosive props (such as the 'boom' barrel):
   - Listens to the 'explosion' event on the global bus.
   - Triggers staggered fuses (120-260 ms) on nearby explosive bodies.
   - Detects violent impact deceleration (|dv| > 22 u/s in a single frame).
   - Renders intense pre-detonation blinking/pulsing while fuse is lit.
   - Guarantees zero infinite recursion: each body can only ignite
     and detonate once.
   ========================================================= */
import * as THREE from 'three';
import { events } from '../core/events.js';
import { bodies, removeBody } from '../physics/world.js';
import { explode } from '../weapons/explosion.js';

export const activeFuses = [];
const VELOCITY_THRESHOLD = 22.0; // u/s change to trigger impact detonation

export function igniteExplosive(body) {
  if (!body || !body.def?.explosive || body.removed || body._fuseActive || body._exploded) {
    return false;
  }

  body._fuseActive = true;
  // Staggered fuse duration: 120ms to 260ms
  body._fuseTime = 0.12 + Math.random() * 0.14;
  body.wake();

  activeFuses.push(body);
  return true;
}

export function updateExplosives(dt) {
  // 1. Check for severe velocity changes (impact detonation)
  for (const b of bodies) {
    if (!b.def?.explosive || b.removed || b._exploded) continue;

    if (!b._prevVel) {
      b._prevVel = b.vel.clone();
    } else {
      const dv = b.vel.distanceTo(b._prevVel);
      b._prevVel.copy(b.vel);

      if (dv >= VELOCITY_THRESHOLD && !b._fuseActive) {
        igniteExplosive(b);
      }
    }
  }

  // 2. Advance lit fuses, handle flashing, and detonate
  for (let i = activeFuses.length - 1; i >= 0; i--) {
    const b = activeFuses[i];
    if (b.removed || b._exploded) {
      activeFuses.splice(i, 1);
      continue;
    }

    b._fuseTime -= dt;

    // Visual blinking / pulsing effect
    const flash = Math.floor(b._fuseTime * 28) % 2 === 0;
    if (b.mesh) {
      b.mesh.traverse((child) => {
        if (child.isMesh && child.material?.uniforms?.uColor) {
          if (!child._origColor) {
            child._origColor = child.material.uniforms.uColor.value.getHex();
          }
          child.material.uniforms.uColor.value.setHex(flash ? 0xffffff : child._origColor);
        }
      });
      b.mesh.scale.setScalar(1.0 + (flash ? 0.08 : 0.0));
    }

    // Fuse expired: trigger explosion and remove from world
    if (b._fuseTime <= 0) {
      b._fuseActive = false;
      b._exploded = true;
      activeFuses.splice(i, 1);

      const power = b.def.explosive.power || 620;
      const radius = b.def.explosive.radius || 8.5;

      explode(b.pos, { power, radius });
      removeBody(b);
    }
  }
}

// Subscribe to global explosion event for chain reactions
events.on('explosion', ({ point, radius }) => {
  for (const b of bodies) {
    if (!b.def?.explosive || b.removed || b._fuseActive || b._exploded) continue;

    const dist = b.pos.distanceTo(point);
    if (dist <= radius) {
      igniteExplosive(b);
    }
  }
});
