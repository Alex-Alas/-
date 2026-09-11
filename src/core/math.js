/* Small numeric helpers shared across the sandbox. */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Frame-rate independent exponential approach: k is the fraction left after 1s. */
export const damp = (a, b, k, dt) => b + (a - b) * Math.pow(k, dt);
export const smoothstep = (t) => t * t * (3 - 2 * t);
