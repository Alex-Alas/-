/* Shared pointer state. Leaf module with no imports so any system can ask
   what the mouse is doing without importing the input handler. */
export const pointer = {
  dragging: null,   // verlet particle held by the pointer
  orbiting: false,  // dragging the void to turn the director camera
  locked: false,    // pointer lock engaged (play mode)
};
