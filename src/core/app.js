/* =========================================================
   APP STATE
   The handful of flags every system needs to read to know what the app
   is currently doing. Kept in its own module so nothing has to import a
   system just to ask "are we in a cutscene?" (which is how import
   cycles start).
   ========================================================= */
export const app = {
  cinematic: false,   // the scripted reel owns the camera
  saver: false,       // the screensaver owns the camera
  timeScale: 1,       // slow motion
  frozen: false,      // physics paused for props
};

/** True when the player is free to move / shoot / aim. */
export const interactive = () => !app.cinematic && !app.saver;
