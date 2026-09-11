/* =========================================================
   EVENT BUS
   The only channel systems use to talk to systems they do not own.
   An explosion does not know about the fluid, the ragdoll or the HUD:
   it emits, and whoever cares is already listening. New subscribers are
   added without touching the emitter — that is the whole point.
   ========================================================= */
const handlers = new Map();

export const events = {
  /** Subscribe. Returns an unsubscribe function. */
  on(type, fn) {
    let set = handlers.get(type);
    if (!set) { set = new Set(); handlers.set(type, set); }
    set.add(fn);
    return () => set.delete(fn);
  },

  off(type, fn) {
    const set = handlers.get(type);
    if (set) set.delete(fn);
  },

  emit(type, payload) {
    const set = handlers.get(type);
    if (!set) return;
    // iterate a copy: a handler is allowed to unsubscribe itself
    for (const fn of [...set]) fn(payload);
  },
};
