/* =========================================================
   FIRST PERSON
   Eye at the player's head, aim straight down the barrel, with a small
   bob tied to actual walking speed rather than to a timer.
   ========================================================= */
import * as THREE from 'three';
import { CameraModes } from '../rig.js';
import { player, playerEye, playerForward } from '../../entities/player.js';
import { avatar } from '../../entities/player.js';

const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();

CameraModes.register({
  id: 'first',
  order: 1,
  label: 'FIRST PERSON',
  player: true,
  enter() { avatar.visible = false; },
  exit() { avatar.visible = player.enabled; },
  update(dt, camera) {
    playerEye(_eye);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const k = Math.min(1, speed / 9);
    _eye.y += Math.sin(player.bob * 2) * 0.045 * k;
    _eye.x += Math.cos(player.bob) * 0.03 * k * Math.cos(player.yaw);
    _eye.z -= Math.cos(player.bob) * 0.03 * k * Math.sin(player.yaw);

    camera.position.copy(_eye);
    playerForward(_fwd);
    camera.lookAt(_look.copy(_eye).add(_fwd));
    camera.updateMatrixWorld();
  },
});
