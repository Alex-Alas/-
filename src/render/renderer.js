/* =========================================================
   RENDERER
   The look is a fixed low-resolution buffer scaled up with nearest
   filtering. Resolution is a registry of modes rather than a constant,
   so aiming down a rocket launcher at 640x360 and admiring the PS1
   crunch at 320x240 are the same code path.
   ========================================================= */
import * as THREE from 'three';
import './three-config.js';
import { events } from '../core/events.js';
import { Registry } from '../core/registry.js';

export const ResolutionModes = new Registry('resolution');
ResolutionModes.register({ id: 'retro', order: 0, label: '320x240', w: 320, h: 240 });
ResolutionModes.register({ id: 'crisp', order: 1, label: '640x360', w: 640, h: 360 });

export const view = { w: 320, h: 240, aspect: 320 / 240, mode: 'retro' };

export const canvas = document.getElementById('c');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(view.w, view.h, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x1b1430, 1);

/** Letterbox the upscaled buffer inside the window, preserving its aspect. */
export function fitCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let cw, ch;
  if (w / h > view.aspect) { ch = h; cw = h * view.aspect; }
  else { cw = w; ch = w / view.aspect; }
  canvas.style.width = Math.round(cw) + 'px';
  canvas.style.height = Math.round(ch) + 'px';
}

export function setResolution(id) {
  const m = ResolutionModes.get(id);
  if (!m) return;
  view.mode = m.id;
  view.w = m.w;
  view.h = m.h;
  view.aspect = m.w / m.h;
  renderer.setSize(m.w, m.h, false);
  fitCanvas();
  events.emit('view:resize', view);   // shader snap grid + camera aspect follow
}

export function cycleResolution() {
  const list = ResolutionModes.list();
  const i = list.findIndex(m => m.id === view.mode);
  setResolution(list[(i + 1) % list.length].id);
  return ResolutionModes.get(view.mode);
}

window.addEventListener('resize', fitCanvas);
fitCanvas();
