/* =========================================================
   PANEL — the bottom button bar
   Rows are built from registries: buddy materials come from the material
   registry, buttons from PanelActions. A new sandbox toggle is a
   register() call, and it wires its own on/off light through isOn().
   ========================================================= */
import { Registry } from '../core/registry.js';
import { app } from '../core/app.js';
import { events } from '../core/events.js';
import { sim } from '../physics/sim.js';
import { addShake } from '../camera/rig.js';
import { BuddyMaterials, setMaterial, resetCreature, spinImpulse, applyImpulse, buddy } from '../entities/buddy/index.js';

export const PanelActions = new Registry('panelAction');

PanelActions.register({ id: 'reset', order: 0, label: 'RESET', run: () => resetCreature(0.35) });
PanelActions.register({ id: 'drop',  order: 1, label: 'DROP',  run: () => resetCreature(6.5) });
PanelActions.register({ id: 'spin',  order: 2, label: 'SPIN',  run: () => spinImpulse(0.012) });
PanelActions.register({ id: 'gust',  order: 3, label: 'GUST',  run: () => {
  const a = Math.random() * Math.PI * 2;
  applyImpulse(Math.cos(a) * 0.34, 0.16, Math.sin(a) * 0.34);
  addShake(0.10, 0.10);
} });
PanelActions.register({ id: 'pose',   order: 4, label: 'POSE',   toggle: true, isOn: () => sim.frozen, run: () => { sim.frozen = !sim.frozen; } });
PanelActions.register({ id: 'zeroG',  order: 5, label: 'ZERO-G', toggle: true, isOn: () => sim.zeroG,  run: () => { sim.zeroG = !sim.zeroG; } });
PanelActions.register({ id: 'wind',   order: 6, label: 'WIND',   toggle: true, isOn: () => sim.wind,   run: () => { sim.wind = !sim.wind; } });
PanelActions.register({ id: 'magnet', order: 7, label: 'MAGNET', toggle: true, isOn: () => sim.magnet, run: () => { sim.magnet = !sim.magnet; } });

const matRow = document.getElementById('matRow');
const toolRow = document.getElementById('toolRow');
const matButtons = {};
const actionButtons = {};

export function buildPanel() {
  matRow.innerHTML = '';
  toolRow.innerHTML = '';

  for (const m of BuddyMaterials.list()) {
    const b = document.createElement('button');
    b.innerHTML = `<i style="background:#${m.dot.toString(16).padStart(6, '0')}"></i>${m.label}`;
    b.addEventListener('click', () => setMaterial(m.id));
    matRow.appendChild(b);
    matButtons[m.id] = b;
  }

  for (const a of PanelActions.list()) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.addEventListener('click', () => { a.run(); syncPanel(); });
    toolRow.appendChild(b);
    actionButtons[a.id] = b;
  }
  syncPanel();
}

export function syncPanel() {
  for (const id in matButtons) matButtons[id].classList.toggle('on', buddy.material === id);
  for (const a of PanelActions.list()) {
    if (a.toggle && actionButtons[a.id]) actionButtons[a.id].classList.toggle('on', !!a.isOn());
  }
}

/* The title line follows the material, so the buddy never has to know a
   HUD exists. */
const titleEl = document.getElementById('title');
events.on('buddy:material', (M) => {
  syncPanel();
  if (app.cinematic || app.saver) return;
  titleEl.innerHTML =
    `RAGDOLL BUDDY <b>v2.4</b> <span>·</span> MATERIAL: <b>${M.id.toUpperCase()}</b><br>` +
    `<span>${M.hint}</span>`;
});
events.on('sim:changed', syncPanel);
