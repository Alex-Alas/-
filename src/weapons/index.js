/* =========================================================
   TOOL BELT
   Tools are registry entries with a slot number. This module owns the
   belt — equipping, dispatching mouse buttons and the scroll wheel, and
   giving each tool its update tick — and knows nothing about what any
   particular tool does. Adding one is a file plus an import line.

   A tool def:
     { id, slot, name, colour, hint: {lmb, rmb, extra},
       equip(), unequip(), primary(down), secondary(down),
       scroll(dir), reload(), update(dt) }
   ========================================================= */
import { Registry } from '../core/registry.js';
import { events } from '../core/events.js';
import { app } from '../core/app.js';
import { KeyActions, inPlay } from '../ui/controls.js';
import { beamFrameStart } from './aim.js';

export const Tools = new Registry('tool');

export const belt = { id: null, tool: null };

export function equipTool(id) {
  const t = Tools.get(id);
  if (!t || belt.id === id) return;
  belt.tool?.unequip?.();
  belt.id = t.id;
  belt.tool = t;
  t.equip?.();
  events.emit('tool:equipped', t);
}

export function cycleTool(dir) {
  const list = Tools.list();
  if (!list.length) return;
  const i = list.findIndex(t => t.id === belt.id);
  equipTool(list[(i + dir + list.length) % list.length].id);
}

export function updateTools(dt) {
  beamFrameStart();
  if (!inPlay()) return;
  belt.tool?.update?.(dt);
}

/* ---------------------------------------------------------
   Dispatch
   --------------------------------------------------------- */
events.on('fire:primary', (down) => { if (inPlay()) belt.tool?.primary?.(down); });
events.on('fire:secondary', (down) => { if (inPlay()) belt.tool?.secondary?.(down); });
events.on('fire:scroll', (dir) => { if (inPlay()) belt.tool?.scroll?.(dir); });
events.on('fire:middle', () => { if (inPlay()) belt.tool?.middle?.(); });

/* number keys pick a slot; R is the tool's reload/reset */
for (let n = 1; n <= 9; n++) {
  KeyActions.register({
    id: 'slot' + n, code: 'Digit' + n, label: String(n), hint: 'tool ' + n, hidden: true,
    down: () => {
      if (!inPlay()) return;
      const t = Tools.list().find(t => t.slot === n);
      if (t) equipTool(t.id);
    },
  });
}

KeyActions.register({
  id: 'reload', code: 'KeyR', label: 'R', hint: 'tool reset',
  down: () => { if (inPlay()) belt.tool?.reload?.(); },
});
