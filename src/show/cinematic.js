/* =========================================================
   CINEMATIC DIRECTOR
   A scripted reel of shots. Each shot is data — camera pose, duration,
   blend, an onEnter that sets the scene and a motion() that flies the
   camera — so the reel is edited by editing the list.
   ========================================================= */
import * as THREE from 'three';
import { app } from '../core/app.js';
import { events } from '../core/events.js';
import { camState, setShake } from '../camera/rig.js';
import { sim, resetToggles, magnetTarget } from '../physics/sim.js';
import { FL } from '../physics/fluid.js';
import { P, setMaterial, resetCreature, applyImpulse, spinImpulse } from '../entities/buddy/index.js';
import { syncPanel } from '../ui/panel.js';

const cineEl = document.getElementById('cine');
const cineTitleEl = document.getElementById('cineTitle');
const cineTitleN = cineTitleEl.querySelector('.n');
const cineTitleS = cineTitleEl.querySelector('.s');
const cineBarFill = document.getElementById('cineBarFill');

const cin = {
  index: 0,
  time: 0,
  blend: 0.8,
  shotStart: null,
  total: 0,
};

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const CINEMATIC = [
  {
    name: 'Subject 01 · Plush',
    sub: 'baseline behaviour',
    dur: 3.0, blend: 0,
    cam: { theta: 0.40, phi: 1.22, radius: 11.0, target: V3(0, 1.9, 0) },
    onEnter: () => { resetToggles(); setMaterial('plush'); resetCreature(0.35); },
    motion: (t, dt) => { camState.theta += 0.10 * dt; },
  },
  {
    name: 'Facial Scan',
    sub: 'plush · close inspection',
    dur: 2.4, blend: 0.9,
    cam: { theta: 0.62, phi: 1.45, radius: 4.6, target: V3(0, 2.95, 0) },
    onEnter: () => {},
    motion: (t, dt) => {
      camState.theta += 0.06 * dt;
      camState.target.y += Math.sin(t * 2.0) * 0.006;
      camState.radius -= 0.22 * dt;
    },
  },
  {
    name: 'Impact Test · Rubber',
    sub: 'torture 01 · EXTRA rubbery drop',
    dur: 4.2, blend: 0.55,
    cam: { theta: -0.55, phi: 1.42, radius: 8.2, target: V3(0, 1.5, 0) },
    onEnter: () => { resetToggles(); setMaterial('rubber'); resetCreature(8.2); setShake(0.14); },
    motion: (t, dt) => {
      const y = Math.max(P.chest.pos.y, 1.5);
      camState.target.y += (y * 0.55 + 0.7 - camState.target.y) * Math.min(1, dt * 2.6);
      camState.theta += 0.16 * dt;
      // pull back a touch so we can watch it fly
      if (t > 1.4) camState.radius += 0.25 * dt;
    },
  },
  {
    name: 'Shatter Test · Porcelain',
    sub: 'torture 02 · guaranteed fracture',
    dur: 4.0, blend: 0.45,
    cam: { theta: 0.95, phi: 1.30, radius: 7.4, target: V3(0, 1.8, 0) },
    onEnter: () => { resetToggles(); setMaterial('vase'); resetCreature(8.2); },
    motion: (t, dt) => {
      const y = Math.max(P.chest.pos.y, 1.4);
      camState.target.y += (y * 0.6 + 0.5 - camState.target.y) * Math.min(1, dt * 2.4);
      camState.radius -= 0.16 * dt;
      camState.theta += 0.13 * dt;
    },
  },
  {
    /* LIQUID — dropped from height, then we watch the body dissolve into
       an actual SPH fluid and find its own level on the floor */
    name: 'Liquefaction · Fluid',
    sub: 'torture 03 · sph solver · density constraints',
    dur: 9.5, blend: 0.6,
    cam: { theta: -0.75, phi: 1.40, radius: 8.6, target: V3(0, 2.6, 0) },
    onEnter: () => { resetToggles(); setMaterial('liquid'); resetCreature(6.5); setShake(0.12); },
    motion: (t, dt) => {
      const y = Math.max(P.chest.pos.y, 0.7);
      camState.target.y += (y * 0.5 + 0.4 - camState.target.y) * Math.min(1, dt * 2.0);

      if (t < 1.4) {
        // fall tracking
        camState.theta -= 0.05 * dt;
      } else if (t < 5.0) {
        // orbit while the body sags and sheds
        camState.theta -= 0.28 * dt;
        camState.phi += 0.05 * dt;
        if (camState.phi > 1.52) camState.phi = 1.52;
      } else {
        // slow dolly in on the puddle
        camState.theta -= 0.06 * dt;
        camState.radius -= 0.42 * dt;
        if (camState.radius < 4.4) camState.radius = 4.4;
        camState.target.y += (0.35 - camState.target.y) * Math.min(1, dt * 2.0);
      }
    },
  },
  {
    name: 'Buoyancy Test · Balloon',
    sub: 'torture 04 · anti-gravity',
    dur: 3.4, blend: 0.8,
    cam: { theta: 0.25, phi: 1.62, radius: 8.4, target: V3(0, 1.6, 0) },
    onEnter: () => {
      resetToggles(); setMaterial('balloon'); resetCreature(0.6);
      applyImpulse(0.02, 0.06, 0.01);
    },
    motion: (t, dt) => {
      let top = 0;
      for (const p of particles) if (p.pos.y > top) top = p.pos.y;
      const want = Math.max(top * 0.72 + 1.0, 1.8);
      camState.target.y += (want - camState.target.y) * Math.min(1, dt * 2.0);
      camState.theta += 0.09 * dt;
      camState.phi = 1.62;
    },
  },
  {
    name: 'Wind Tunnel',
    sub: 'torture 05 · aero stress',
    dur: 3.0, blend: 0.7,
    cam: { theta: 0.0, phi: 1.24, radius: 9.0, target: V3(0, 1.9, 0) },
    onEnter: () => {
      resetToggles(); setMaterial('plush'); resetCreature(2.4);
      sim.wind = true;
      applyImpulse(0.05, 0.05, 0.05);
    },
    onExit: () => { sim.wind = false; },
    motion: (t, dt) => { camState.theta += 0.42 * dt; camState.radius -= 0.10 * dt; },
  },
  {
    name: 'Tractor Beam',
    sub: 'torture 06 · extreme magnetic pull',
    dur: 4.0, blend: 0.7,
    cam: { theta: -0.30, phi: 1.20, radius: 9.2, target: V3(0, 2.6, 0) },
    onEnter: () => {
      resetToggles(); setMaterial('plush'); resetCreature(3.0);
      sim.magnet = true;
      magnetTarget.set(2.2, 3.2, 0);
    },
    onExit: () => { sim.magnet = false; },
    motion: (t, dt) => {
      const a = t * 1.85;
      magnetTarget.set(Math.cos(a) * 2.6, 3.1 + Math.sin(t * 2.2) * 1.1, Math.sin(a) * 2.6);
      camState.theta += 0.10 * dt;
    },
  },
  {
    name: 'Centrifuge',
    sub: 'torture 07 · rapid rotation',
    dur: 2.8, blend: 0.5,
    cam: { theta: 0.0, phi: 1.16, radius: 8.4, target: V3(0, 2.0, 0) },
    onEnter: () => {
      resetToggles(); setMaterial('rubber'); resetCreature(2.2);
      applyImpulse(0.4, 0.45, 0.12);
      for (const p of particles) {
        const rx = p.pos.x, rz = p.pos.z;
        p.prev.x += rz * 0.055;
        p.prev.z -= rx * 0.055;
      }
      setShake(0.10);
    },
    motion: (t, dt) => { camState.theta += 0.85 * dt; camState.radius -= 0.30 * dt; },
  },
  {
    name: 'Zero Gravity',
    sub: 'finale · free float',
    dur: 4.0, blend: 1.1,
    cam: { theta: 0.40, phi: 1.15, radius: 10.0, target: V3(0, 2.6, 0) },
    onEnter: () => {
      resetToggles(); setMaterial('plush'); resetCreature(3.0);
      sim.zeroG = true;
      applyImpulse(0.06, 0.10, 0.06);
    },
    onExit: () => { sim.zeroG = false; },
    motion: (t, dt) => {
      camState.theta += 0.17 * dt;
      camState.radius -= 0.18 * dt;
      camState.target.y = 2.6 + Math.sin(t * 0.9) * 0.25;
    },
  },
];

const EASE = (u) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

function lerpCam(a, b, u) {
  return {
    theta: a.theta + (b.theta - a.theta) * u,
    phi: a.phi + (b.phi - a.phi) * u,
    radius: a.radius + (b.radius - a.radius) * u,
    target: new THREE.Vector3().lerpVectors(a.target, b.target, u),
  };
}

function showShotTitle(s) {
  cineTitleN.textContent = s.name;
  cineTitleS.textContent = s.sub || '';
  cineTitleEl.style.opacity = 0;
  cineTitleEl.style.transform = 'translateY(8px)';
  requestAnimationFrame(() => {
    cineTitleEl.style.transition = 'opacity .5s ease, transform .5s ease';
    cineTitleEl.style.opacity = 1;
    cineTitleEl.style.transform = 'translateY(0)';
  });
}

function enterShot(i) {
  const s = CINEMATIC[i];
  cin.shotStart = {
    theta: camState.theta,
    phi: camState.phi,
    radius: camState.radius,
    target: camState.target.clone(),
  };
  cin.blend = s.blend !== undefined ? s.blend : 0.8;
  cin.time = 0;
  if (s.onEnter) s.onEnter();
  showShotTitle(s);
  syncPanel();
}

export function startCinematic() {
  app.cinematic = true;
  cin.index = 0;
  cin.time = 0;
  cin.total = CINEMATIC.reduce((a, s) => a + s.dur, 0);

  document.getElementById('ui').classList.add('hidden');
  document.getElementById('title').classList.add('hidden');
  cineEl.classList.add('on');
  cineTitleEl.style.transition = 'none';
  cineTitleEl.style.opacity = 0;

  const s = CINEMATIC[0];
  camState.theta = s.cam.theta;
  camState.phi = s.cam.phi;
  camState.radius = s.cam.radius;
  camState.target.copy(s.cam.target);

  enterShot(0);
}

export function endCinematic() {
  if (!app.cinematic) return;
  const s = CINEMATIC[cin.index];
  if (s && s.onExit) s.onExit();
  app.cinematic = false;

  resetToggles();
  setMaterial('plush');
  resetCreature(0.35);

  cineEl.classList.remove('on');
  document.getElementById('ui').classList.remove('hidden');
  document.getElementById('title').classList.remove('hidden');

  document.getElementById('title').innerHTML =
    `RAGDOLL BUDDY <b>v2.4</b> <span>·</span> MATERIAL LAB<br>` +
    `<span>drag him · drag the void to orbit · pick a material below</span>`;

  syncPanel();
}

export function updateCinematic(dt) {
  if (!app.cinematic) return;

  const s = CINEMATIC[cin.index];
  cin.time += dt;

  if (cin.time >= s.dur) {
    if (s.onExit) s.onExit();
    const next = cin.index + 1;
    if (next >= CINEMATIC.length) { endCinematic(); return; }
    cin.index = next;
    enterShot(cin.index);
    return;
  }

  const u = cin.blend > 0.0001 ? Math.min(1, cin.time / cin.blend) : 1;
  const e = EASE(u);
  const c = lerpCam(cin.shotStart, s.cam, e);

  camState.theta = c.theta;
  camState.phi = c.phi;
  camState.radius = c.radius;
  camState.target.copy(c.target);

  if (s.motion) s.motion(cin.time, dt, s.dur);

  let elapsed = 0;
  for (let i = 0; i < cin.index; i++) elapsed += CINEMATIC[i].dur;
  elapsed += cin.time;
  cineBarFill.style.width = ((elapsed / cin.total) * 100).toFixed(1) + '%';
}

document.getElementById('cineSkip').addEventListener('click', endCinematic);
events.on('cinematic:skip', endCinematic);
window.addEventListener('keydown', (e) => {
  if (app.cinematic && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    endCinematic();
  }
});

