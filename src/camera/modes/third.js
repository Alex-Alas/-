/* =========================================================
   THIRD PERSON
   A spring arm over the shoulder. The arm shortens when level geometry
   would come between the camera and the player, so the view never ends
   up inside a wall; props are ignored on purpose, or the camera would
   jump every time a crate flew past.
   ========================================================= */
import * as THREE from 'three';
import { CameraModes } from '../rig.js';
import { player, playerEye, playerForward, avatar } from '../../entities/player.js';
import { raycast } from '../../physics/world.js';

/* The avatar is 3.2 units tall and the buffer is 4:3 at 55 degrees, so a
   short arm fills the frame with his back. */
const DIST = 9.6;
const SHOULDER = 1.15;
const LIFT = 0.75;

const _pivot = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _want = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();
const _cur = new THREE.Vector3();
let primed = false;

CameraModes.register({
  id: 'third',
  order: 2,
  label: 'THIRD PERSON',
  player: true,
  enter() { avatar.visible = player.enabled; primed = false; },
  update(dt, camera) {
    playerEye(_pivot);
    _pivot.y += LIFT;
    playerForward(_fwd);
    _right.set(-Math.cos(player.yaw), 0, Math.sin(player.yaw));

    _want.copy(_pivot).addScaledVector(_fwd, -DIST).addScaledVector(_right, SHOULDER);

    /* keep the level out of the shot */
    _dir.copy(_want).sub(_pivot);
    const want = _dir.length();
    if (want > 1e-4) {
      _dir.divideScalar(want);
      const hit = raycast(_pivot, _dir, want + 0.4, (b) => b.isStatic);
      if (hit && hit.dist < want) _want.copy(_pivot).addScaledVector(_dir, Math.max(0.6, hit.dist - 0.35));
    }
    if (_want.y < 0.5) _want.y = 0.5;

    if (!primed) { _cur.copy(_want); primed = true; }
    else _cur.lerp(_want, 1 - Math.pow(0.0001, dt));   // frame-rate independent

    camera.position.copy(_cur);
    camera.lookAt(_look.copy(_pivot).addScaledVector(_fwd, 2.2));
    camera.updateMatrixWorld();
  },
});
