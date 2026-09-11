/* =========================================================
   HUD — PS1 WEAPON OSD
   Retro tactical weapon display showing active slot, signature
   color badges, contextual control hints, and pause prompt.
   ========================================================= */
import { app, interactive } from '../core/app.js';
import { events } from '../core/events.js';
import { Tools, belt } from '../weapons/index.js';
import { pointer } from './pointer.js';

const hudEl = document.getElementById('hud');
const hudSlotsEl = document.getElementById('hudSlots');
const hudHintsEl = document.getElementById('hudHints');
const promptEl = document.getElementById('unlockedPrompt');

export function initHUD() {
  renderSlots();
  updateHUDVisibility();

  events.on('tool:equipped', () => {
    renderSlots();
    updateHUDVisibility();
  });
  events.on('play:mode', updateHUDVisibility);
  events.on('pointer:lock', updateHUDVisibility);
  events.on('cinematic:skip', updateHUDVisibility);
}

export function renderSlots() {
  if (!hudSlotsEl) return;
  hudSlotsEl.innerHTML = '';
  const list = Tools.list().sort((a, b) => a.slot - b.slot);

  for (const t of list) {
    const slotEl = document.createElement('div');
    const isActive = t.id === belt.id;
    slotEl.className = 'hud-slot' + (isActive ? ' active' : '');
    const colorHex = '#' + (t.colour !== undefined ? t.colour.toString(16).padStart(6, '0') : 'ffffff');
    const shortName = t.name.replace(' GUN', '');
    slotEl.innerHTML = `<i style="background:${colorHex}"></i>[${t.slot}] ${shortName}`;
    hudSlotsEl.appendChild(slotEl);
  }

  if (hudHintsEl && belt.tool) {
    const h = belt.tool.hint || {};
    hudHintsEl.innerHTML = `<b>LMB:</b> ${h.lmb || 'USE'} &nbsp;|&nbsp; <b>RMB:</b> ${h.rmb || 'ALT'} &nbsp;|&nbsp; <b>MWHEEL:</b> CYCLE/DIST`;
  }
}

export function updateHUDVisibility() {
  const isPlaying = app.play && interactive() && !app.cinematic && !app.saver;
  if (hudEl) {
    hudEl.classList.toggle('hidden', !isPlaying);
  }
  if (promptEl) {
    promptEl.classList.toggle('visible', isPlaying && !pointer.locked);
  }
}
