/* =========================================================
   MAIN — assembly and the frame loop

   Nothing here knows how anything works. It imports the systems, gives
   them their slot in the frame, and gets out of the way. Adding a system
   means importing it and (if it needs time) registering a step.
   ========================================================= */
import './render/three-config.js';
import { app } from './core/app.js';
import { renderer } from './render/renderer.js';
import { scene } from './render/scene.js';
import { camera, updateCamera, decayShake } from './camera/rig.js';
import './camera/modes/orbit.js';
import './camera/modes/first.js';
import './camera/modes/third.js';

import * as THREE from 'three';
import { syncBodyMeshes } from './physics/world.js';
import { syncJointMeshes } from './physics/joints.js';
import { stepWorld, FIXED_DT } from './physics/step.js';
import './entities/level.js';
import { spawnProp } from './entities/props.js';
import { respawnPlayer } from './entities/player.js';
import { updateShards } from './physics/debris.js';
import { fluidRender, updateFinger } from './physics/fluid.js';
import { syncAll, setMaterial, resetCreature } from './entities/buddy/index.js';
import { updateMagnetVisuals } from './entities/magnet.js';

import { Tools, equipTool, updateTools } from './weapons/index.js';
import './weapons/physgun.js';
import './weapons/gravgun.js';
import './weapons/forcegun.js';
import './weapons/rocket.js';
import { updateRockets } from './weapons/rocket.js';
import './weapons/bomb.js';
import { updateBombs } from './weapons/bomb.js';
import { updateExplosives } from './entities/explosive.js';
import { updateExplosions } from './weapons/explosion.js';

import './ui/input.js';
import { updateIntent, setPlayMode } from './ui/controls.js';
import { buildPanel } from './ui/panel.js';
import { updateCinematic } from './show/cinematic.js';
import { startSaver, updateSaver, IDLE_MS, idle } from './show/saver.js';
import { pointer } from './ui/pointer.js';
import { tickInspect } from './dev/inspect.js';
import { finger } from './physics/fluid.js';
import { updateCrosshair } from './ui/crosshair.js';
import { initHUD } from './ui/hud.js';

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
  updateRockets(dt);
  updateBombs(dt);
  updateExplosions(dt);
  updateCrosshair();

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    stepWorld(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  updateExplosives(dt);
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

function initSandboxProps() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // Props placed on platforms / furniture
  spawnProp('crate', V3(4.4, 1.6, -2.6));
  spawnProp('barrel', V3(-4.8, 1.6, 1.9));
  spawnProp('boom', V3(1.7, 3.2, 4.4));
  spawnProp('plank', V3(-12.0, 3.2, 6.0));
  spawnProp('bigcrate', V3(12.0, 4.4, 9.0));
  spawnProp('bowling', V3(12.0, 1.8, 5.2));
  spawnProp('crate', V3(-11.0, 2.0, -9.0));
  spawnProp('boom', V3(-11.0, 2.8, -12.2));
  spawnProp('crate', V3(0.0, 5.0, -13.0));

  // Props on the floor around the sandbox
  spawnProp('crate', V3(2.5, 0.8, -3.5));
  spawnProp('barrel', V3(-2.2, 0.9, -4.5));
  spawnProp('boom', V3(3.5, 0.9, 1.5));
  spawnProp('ball', V3(-1.5, 0.6, 3.5));
  spawnProp('bowling', V3(2.0, 0.6, 4.5));
}

/* =========================================================
   BOOT
   ========================================================= */
buildPanel();
initHUD();
setMaterial('plush');
resetCreature(0.35);
syncAll();
initSandboxProps();

/* Slot 1 is the physics gun: the sandbox opens with a tool in hand. */
const startingTool = Tools.find(t => t.slot === 1);
if (startingTool) equipTool(startingTool.id);

/* Straight into the sandbox. The reel is still there on P. */
respawnPlayer();
setPlayMode(true, 'third');

requestAnimationFrame(loop);
