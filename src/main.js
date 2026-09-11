/* =========================================================
   MAIN — assembly and the frame loop

   Nothing here knows how anything works. It imports the systems, gives
   them their slot in the frame, and gets out of the way. Adding a system
   means importing it and (if it needs time) registering a step.
   ========================================================= */
import './render/three-config.js';
import { app } from './core/app.js';
import { events } from './core/events.js';
import { renderer, view } from './render/renderer.js';
import { scene } from './render/scene.js';
import { camera, updateCamera, decayShake } from './camera/rig.js';
import './camera/modes/orbit.js';

import { updateWind } from './physics/sim.js';
import './entities/level.js';
import { updateShards } from './physics/debris.js';
import { FL, fluidStep, fluidRender, clearSolids, updateFinger } from './physics/fluid.js';
import { stepBuddy, syncAll, setMaterial, resetCreature, matDef, buddy } from './entities/buddy/index.js';
import { updateMagnetVisuals } from './entities/magnet.js';

import './ui/input.js';
import { buildPanel } from './ui/panel.js';
import { startCinematic, updateCinematic } from './show/cinematic.js';
import { startSaver, updateSaver, IDLE_MS, idle } from './show/saver.js';
import { pointer } from './ui/pointer.js';
import { finger } from './physics/fluid.js';

/* =========================================================
   FIXED-STEP WORLD
   ========================================================= */
const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
let accumulator = 0;
let lastTime = performance.now();

function stepWorld(dt) {
  updateWind(dt);
  clearSolids();          // obstacle list for the fluid, rebuilt by its owners
  stepBuddy(dt);
  if (FL.n > 0) fluidStep(dt, matDef(buddy.material).gravityMul);
}

function loop(now) {
  requestAnimationFrame(loop);

  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;

  updateCinematic(dt);
  updateSaver(dt);
  updateFinger(dt);

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    stepWorld(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  updateShards(Math.min(dt, 0.05));
  fluidRender();
  decayShake(dt);
  updateMagnetVisuals(dt, now);

  if (!app.saver && !app.cinematic && !pointer.dragging && !pointer.orbiting && !finger.on &&
      now - idle.last > IDLE_MS) startSaver();

  updateCamera(dt);
  syncAll();
  renderer.render(scene, camera);
}

/* =========================================================
   BOOT
   ========================================================= */
buildPanel();
setMaterial('plush');
resetCreature(0.35);
syncAll();

setTimeout(() => { startCinematic(); }, 700);

requestAnimationFrame(loop);
