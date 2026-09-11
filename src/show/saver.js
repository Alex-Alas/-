/* =========================================================
   SCREEN SAVER
   An endless, self-directing show: shuffled scenes, randomised framing,
   slow drifting camera, fades across the cuts. Scenes are data, like the
   cinematic's shots. Any input wakes it; it arms itself again after
   IDLE_MS of stillness.
   ========================================================= */
import * as THREE from 'three';
import { app } from '../core/app.js';
import { events } from '../core/events.js';
import { rnd } from '../core/math.js';
import { camState, setShake } from '../camera/rig.js';
import { sim, resetToggles, magnetTarget } from '../physics/sim.js';
import { FL } from '../physics/fluid.js';
import { P, particles, setMaterial, resetCreature, applyImpulse, spinImpulse } from '../entities/buddy/index.js';
import { syncPanel } from '../ui/panel.js';
import { setPlayMode } from '../ui/controls.js';
import { endCinematic } from './cinematic.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const IDLE_MS = 90000;

const saverFadeEl = document.getElementById('saverFade');
const saverTagEl  = document.getElementById('saverTag');
const saverTagN   = saverTagEl.querySelector('.n');
const saverTagS   = saverTagEl.querySelector('.s');

const saver = {
  phase: 'in',        // 'in' | 'run' | 'out'
  fade: 1,
  time: 0,
  dur: 0,
  scene: null,
  mem: {},            // per-scene scratch, for mid-shot beats
  bag: [],
  last: -1,
  drift: 0,
  guard: 0,           // swallow wake events right after it starts
  moved: 0,
};


export const SAVER_SCENES = [
  {
    n: 'liquefaction', s: 'sph fluid · density constraints',
    dur: [16, 20],
    enter: () => { resetToggles(); setMaterial('liquid'); resetCreature(rnd(4.5, 7.5)); setShake(0.12); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.36, radius: 9.6, target: V3(0, 2.6, 0) }),
    motion: (t, dt) => {
      camState.theta += 0.16 * dt;
      const wantY = t < 2.4 ? 2.3 : 0.55;
      camState.target.y += (wantY - camState.target.y) * Math.min(1, dt * 1.1);
      if (t > 6.5) {
        camState.radius += (5.3 - camState.radius) * Math.min(1, dt * 0.35);
        camState.phi   += (1.50 - camState.phi)   * Math.min(1, dt * 0.35);
      }
    },
  },
  {
    n: 'tractor beam', s: 'fluid under magnetic capture',
    dur: [14, 18],
    enter: () => {
      resetToggles(); setMaterial('liquid'); resetCreature(1.2);
      sim.magnet = true; magnetTarget.set(0, 3.4, 0); syncPanel();
    },
    exit: () => { sim.magnet = false; syncPanel(); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.24, radius: 9.0, target: V3(0, 3.0, 0) }),
    motion: (t, dt) => {
      const a = t * 0.85;
      magnetTarget.set(Math.cos(a) * 1.9, 3.2 + Math.sin(t * 1.3) * 0.9, Math.sin(a) * 1.9);
      camState.theta += 0.13 * dt;
      camState.target.y += (3.1 - camState.target.y) * Math.min(1, dt * 0.8);
      camState.radius += (7.4 - camState.radius) * Math.min(1, dt * 0.25);
    },
  },
  {
    n: 'free fall', s: 'liquid · zero gravity',
    dur: [13, 16],
    enter: () => {
      resetToggles(); setMaterial('liquid'); resetCreature(2.8);
      sim.zeroG = true; applyImpulse(0.05, 0.04, 0.03);
    },
    exit: () => { sim.zeroG = false; },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.18, radius: 8.6, target: V3(0, 3.0, 0) }),
    motion: (t, dt) => {
      camState.theta += 0.22 * dt;
      camState.phi = 1.18 + Math.sin(t * 0.35) * 0.16;
      const wantY = FL.n > 40 ? FL.cy : 2.8;
      camState.target.y += (wantY - camState.target.y) * Math.min(1, dt * 0.9);
      camState.radius += (6.6 - camState.radius) * Math.min(1, dt * 0.2);
    },
  },
  {
    n: 'shatter test', s: 'porcelain · terminal fracture',
    dur: [11, 14],
    enter: () => { resetToggles(); setMaterial('vase'); resetCreature(rnd(6.5, 9.5)); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.32, radius: 8.2, target: V3(0, 3.0, 0) }),
    motion: (t, dt, mem) => {
      const y = Math.max(P.chest.pos.y, 1.2);
      camState.target.y += (y * 0.55 + 0.5 - camState.target.y) * Math.min(1, dt * 2.2);
      camState.theta += 0.16 * dt;
      camState.radius += (6.4 - camState.radius) * Math.min(1, dt * 0.25);
      if (t > 6.4 && !mem.again) { mem.again = 1; resetCreature(rnd(7, 10)); }
    },
  },
  {
    n: 'impact test', s: 'rubber · elastic return',
    dur: [12, 15],
    enter: () => { resetToggles(); setMaterial('rubber'); resetCreature(rnd(7, 11)); setShake(0.12); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.42, radius: 8.6, target: V3(0, 2.0, 0) }),
    motion: (t, dt, mem) => {
      const y = Math.max(P.chest.pos.y, 1.4);
      camState.target.y += (y * 0.55 + 0.6 - camState.target.y) * Math.min(1, dt * 2.4);
      camState.theta += 0.20 * dt;
      if (t > 7 && !mem.kick) { mem.kick = 1; applyImpulse(rnd(-0.3, 0.3), 0.55, rnd(-0.3, 0.3)); }
    },
  },
  {
    n: 'buoyancy', s: 'balloon · negative gravity',
    dur: [11, 14],
    enter: () => { resetToggles(); setMaterial('balloon'); resetCreature(0.6); applyImpulse(0.02, 0.05, 0.01); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.60, radius: 8.6, target: V3(0, 1.6, 0) }),
    motion: (t, dt) => {
      let top = 0;
      for (const p of particles) if (p.pos.y > top) top = p.pos.y;
      camState.target.y += (Math.max(top * 0.72 + 0.9, 1.8) - camState.target.y) * Math.min(1, dt * 1.6);
      camState.theta += 0.12 * dt;
      camState.phi = 1.60;
    },
  },
  {
    n: 'wind tunnel', s: 'plush · aero stress',
    dur: [11, 14],
    enter: () => { resetToggles(); setMaterial('plush'); resetCreature(2.2); sim.wind = true; syncPanel(); },
    exit: () => { sim.wind = false; syncPanel(); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.26, radius: 9.2, target: V3(0, 1.9, 0) }),
    motion: (t, dt) => {
      camState.theta += 0.34 * dt;
      camState.radius += (7.2 - camState.radius) * Math.min(1, dt * 0.2);
    },
  },
  {
    n: 'centrifuge', s: 'rubber · rapid rotation',
    dur: [10, 13],
    enter: () => { resetToggles(); setMaterial('rubber'); resetCreature(2.4); spinImpulse(0.055); setShake(0.10); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: 1.16, radius: 8.8, target: V3(0, 2.0, 0) }),
    motion: (t, dt, mem) => {
      camState.theta += 0.72 * dt;
      camState.radius += (6.8 - camState.radius) * Math.min(1, dt * 0.25);
      if (t > 5.5 && !mem.again) { mem.again = 1; spinImpulse(0.05); }
    },
  },
  {
    n: 'subject 01', s: 'plush · baseline behaviour',
    dur: [12, 15],
    enter: () => { resetToggles(); setMaterial('plush'); resetCreature(rnd(0.4, 3.0)); },
    cam: () => ({ theta: rnd(-3.1, 3.1), phi: rnd(1.15, 1.40), radius: 10.5, target: V3(0, 2.0, 0) }),
    motion: (t, dt, mem) => {
      camState.theta += 0.10 * dt;
      camState.radius += (6.0 - camState.radius) * Math.min(1, dt * 0.12);
      camState.target.y += (1.6 - camState.target.y) * Math.min(1, dt * 0.6);
      if (t > 6 && !mem.poke) { mem.poke = 1; applyImpulse(rnd(-0.25, 0.25), 0.32, rnd(-0.25, 0.25)); }
    },
  },
];

function nextSaverScene() {
  if (saver.scene && saver.scene.exit) saver.scene.exit();

  if (saver.bag.length === 0) {
    saver.bag = SAVER_SCENES.map((_, i) => i);
    for (let i = saver.bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = saver.bag[i]; saver.bag[i] = saver.bag[j]; saver.bag[j] = tmp;
    }
    if (saver.bag.length > 1 && saver.bag[0] === saver.last) {
      const tmp = saver.bag[0]; saver.bag[0] = saver.bag[1]; saver.bag[1] = tmp;
    }
  }

  const idx = saver.bag.shift();
  const s = SAVER_SCENES[idx];
  saver.last = idx;
  saver.scene = s;
  saver.mem = {};
  saver.time = 0;
  saver.dur = rnd(s.dur[0], s.dur[1]);
  saver.phase = 'in';

  s.enter();

  const c = s.cam();
  camState.theta = c.theta;
  camState.phi = c.phi;
  camState.radius = c.radius;
  camState.target.copy(c.target);

  saverTagN.textContent = s.n;
  saverTagS.textContent = s.s;
}

let resumePlay = false;

events.on('saver:start', () => startSaver());

export function startSaver() {
  if (app.saver) return;
  if (app.cinematic) endCinematic();

  resumePlay = app.play;
  if (app.play) setPlayMode(false);
  app.saver = true;
  saver.fade = 1;
  saver.guard = 1.2;
  saver.moved = 0;
  saver.bag.length = 0;
  saver.last = -1;
  saver.scene = null;
  saver.drift = Math.random() * 120;
  wakeX = null;

  document.body.classList.add('saver');
  document.getElementById('ui').classList.add('hidden');
  document.getElementById('title').classList.add('hidden');
  saverFadeEl.style.opacity = '1';
  saverTagEl.classList.add('on');

  nextSaverScene();
}

export function exitSaver() {
  if (app.saver && resumePlay) setPlayMode(true);
  if (!app.saver) return;
  if (saver.scene && saver.scene.exit) saver.scene.exit();

  app.saver = false;
  saver.scene = null;

  document.body.classList.remove('saver');
  saverTagEl.classList.remove('on');
  saverFadeEl.style.opacity = '0';
  document.getElementById('ui').classList.remove('hidden');
  document.getElementById('title').classList.remove('hidden');

  resetToggles();
  syncPanel();
  idle.last = performance.now();
}

export function updateSaver(dt) {
  if (!app.saver) return;

  if (saver.guard > 0) saver.guard -= dt;
  saver.time += dt;

  if (saver.phase === 'in') {
    saver.fade -= dt / 0.8;
    if (saver.fade <= 0) { saver.fade = 0; saver.phase = 'run'; }
  } else if (saver.phase === 'run') {
    if (saver.time >= saver.dur - 0.8) saver.phase = 'out';
  } else {
    saver.fade += dt / 0.8;
    if (saver.fade >= 1) { saver.fade = 1; nextSaverScene(); }
  }

  if (saver.scene && saver.scene.motion) saver.scene.motion(saver.time, dt, saver.mem);

  saverFadeEl.style.opacity = saver.fade.toFixed(3);

  /* the caption wanders so nothing is ever burnt into one spot */
  saver.drift += dt;
  const mx = 28, my = 28;
  const w = Math.max(0, window.innerWidth  - mx * 2 - 250);
  const h = Math.max(0, window.innerHeight - my * 2 - 70);
  const x = mx + (Math.sin(saver.drift * 0.081) * 0.5 + 0.5) * w;
  const y = my + (Math.sin(saver.drift * 0.053 + 1.7) * 0.5 + 0.5) * h;
  saverTagEl.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
}

/* ---- waking up / idle arming ---- */
export const idle = { last: performance.now() };
let wakeX = null, wakeY = null;

export function noteInput() { idle.last = performance.now(); }

function wake() {
  noteInput();
  if (!app.saver || saver.guard > 0) return;
  exitSaver();
}

events.on('saver:wake', wake);
window.addEventListener('pointerdown', wake);
window.addEventListener('keydown', wake);
window.addEventListener('wheel', wake, { passive: true });
window.addEventListener('touchstart', wake, { passive: true });
window.addEventListener('pointermove', (e) => {
  noteInput();
  if (!app.saver || saver.guard > 0 || wakeX === null) {
    wakeX = e.clientX; wakeY = e.clientY;
    return;
  }
  saver.moved += Math.abs(e.clientX - wakeX) + Math.abs(e.clientY - wakeY);
  wakeX = e.clientX; wakeY = e.clientY;
  if (saver.moved > 16) exitSaver();
});

