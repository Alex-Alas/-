/* The buddy's own mutable state. A leaf module: importing it never drags
   in the solver, which keeps input, HUD and cutscenes free of cycles. */
export const buddy = {
  material: 'plush',
  melt: 0,
  meltTimer: 0,
  dragging: null,   // the particle currently held by the pointer, if any
};
