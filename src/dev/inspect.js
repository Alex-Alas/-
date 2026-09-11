/* =========================================================
   INSPECT
   A small console/testing handle on the running sandbox:
   `__sandbox` in the browser console. Handy while playing, and it is
   what the headless smoke tests drive the world through.
   ========================================================= */
import { bodies, contacts, raycast, solverConfig } from '../physics/world.js';
import { Props, spawnProp } from '../entities/props.js';
import { FL } from '../physics/fluid.js';
import { advance } from '../physics/step.js';
import { sim } from '../physics/sim.js';
import { app } from '../core/app.js';
import { camera, camState, rig } from '../camera/rig.js';
import { buddy, particles } from '../entities/buddy/index.js';
import { player, respawnPlayer } from '../entities/player.js';
import { setPlayMode, KeyActions, keys } from '../ui/controls.js';
import { startCinematic, endCinematic, CINEMATIC } from '../show/cinematic.js';
import { startSaver, exitSaver, SAVER_SCENES } from '../show/saver.js';

let frames = 0, fpsWindow = performance.now(), fps = 0;

export function tickInspect() {
  frames++;
  const now = performance.now();
  if (now - fpsWindow >= 1000) {
    fps = Math.round((frames * 1000) / (now - fpsWindow));
    frames = 0;
    fpsWindow = now;
  }
}

window.__sandbox = {
  bodies, contacts, particles, FL, sim, app, camera, camState, rig, buddy, solverConfig,
  Props, spawnProp, raycast, player, respawnPlayer, setPlayMode, KeyActions, keys,
  startCinematic, endCinematic, startSaver, exitSaver, CINEMATIC, SAVER_SCENES,

  /** Advance the physics without waiting for frames — fps-independent tests. */
  advance,

  health() {
    const dyn = bodies.filter(b => !b.isStatic);
    let below = 0, fastest = 0, awake = 0, energy = 0;
    for (const b of dyn) {
      if (b.aabb.min.y < -0.25) below++;
      if (!b.sleeping) awake++;
      const v = b.vel.length();
      if (v > fastest) fastest = v;
      energy += 0.5 * b.mass * v * v;
    }
    return {
      fps,
      bodies: dyn.length,
      statics: bodies.length - dyn.length,
      awake,
      contacts: contacts.length,
      sunk: below,
      fastest: +fastest.toFixed(2),
      energy: +energy.toFixed(1),
      fluid: FL.n,
      cameraMode: rig.mode,
      play: app.play,
      playerPos: player.pos.toArray().map(v => +v.toFixed(2)),
      onGround: player.onGround,
      material: buddy.material,
      cinematic: app.cinematic,
      saver: app.saver,
    };
  },

  /** Positions of every dynamic body, for regression checks. */
  dump() {
    return bodies.filter(b => !b.isStatic).map(b => ({
      type: b.type,
      pos: b.pos.toArray().map(v => +v.toFixed(3)),
      sleeping: b.sleeping,
    }));
  },
};
