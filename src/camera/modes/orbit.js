/* =========================================================
   ORBIT / DIRECTOR CAMERA
   The original free camera: spherical coordinates around a target.
   The cinematic reel and the screensaver drive it by writing camState.
   ========================================================= */
import { CameraModes, camState } from '../rig.js';

CameraModes.register({
  id: 'orbit',
  order: 0,
  label: 'DIRECTOR',
  update(dt, camera) {
    const sp = Math.sin(camState.phi), cp = Math.cos(camState.phi);
    camera.position.set(
      camState.target.x + camState.radius * sp * Math.sin(camState.theta),
      camState.target.y + camState.radius * cp,
      camState.target.z + camState.radius * sp * Math.cos(camState.theta)
    );
    camera.lookAt(camState.target);
    camera.updateMatrixWorld();
  },
});
