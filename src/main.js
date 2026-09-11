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
import './camera/modes/first.js';
import './camera/modes/third.js';

import { syncBodyMeshes } from './physics/world.js';
import { syncJointMeshes } from './physics/joints.js';
import { stepWorld, FIXED_DT } from './physics/step.js';
import './entities/level.js';
import './entities/props.js';
import { respawnPlayer } from './entities/player.js';
import { updateShards } from './physics/debris.js';
import { fluidRender, updateFinger } from './physics/fluid.js';
import { syncAll, setMaterial, resetCreature } from './entities/buddy/index.js';
import { updateMagnetVisuals } from './entities/magnet.js';

import { Tools, equipTool, updateTools } from './weapons/index.js';
import './weapons/physgun.js';
import './weapons/gravgun.js';
import { updateExplosions } from './weapons/explosion.js';

import './ui/input.js';
import { updateIntent, setPlayMode } from './ui/controls.js';
import { buildPanel } from './ui/panel.js';
import { startCinematic, updateCinematic } from './show/cinematic.js';
import { startSaver, updateSaver, IDLE_MS, idle } from './show/saver.js';
import { pointer } from './ui/pointer.js';
import { tickInspect } from './dev/inspect.js';
import { finger } from './physics/fluid.js';

/* =========================================================
   FRAME LOOP
   ========================================================= */
const MAX_STEPS = 5;
let accumulator = 0;
let lastTime = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  tickInspect();

  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;

  updateCinematic(dt);
  updateSaver(dt);
  updateFinger(dt);
  updateIntent();
  updateTools(dt);
  updateExplosions(dt);

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    stepWorld(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  syncBodyMeshes();
  syncJointMeshes();
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

/* Slot 1 is the physics gun: the sandbox opens with a tool in hand. */
const startingTool = Tools.find(t => t.slot === 1);
if (startingTool) equipTool(startingTool.id);

/* Straight into the sandbox. The reel is still there on P. */
respawnPlayer();
setPlayMode(true, 'third');

requestAnimationFrame(loop);
