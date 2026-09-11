/* =========================================================
   REGISTRY
   Every extensible axis of the sandbox — tools, props, camera modes,
   buddy materials, cinematic shots — is a Registry. Adding a member is
   a call to register(); the systems that consume them iterate the list
   and never name a member directly. Open for extension, closed for
   modification.
   ========================================================= */
export class Registry {
  constructor(kind) {
    this.kind = kind;
    this._items = new Map();
  }

  register(def) {
    if (!def || typeof def.id !== 'string') throw new Error(`${this.kind}: def needs an id`);
    if (this._items.has(def.id)) throw new Error(`${this.kind}: duplicate id "${def.id}"`);
    this._items.set(def.id, def);
    return def;
  }

  get(id) { return this._items.get(id) || null; }
  has(id) { return this._items.has(id); }
  /** Insertion order, or sorted by `order`/`slot` when the defs carry one. */
  list() {
    const all = [...this._items.values()];
    const keyed = all.filter(d => d.slot !== undefined || d.order !== undefined);
    if (keyed.length === all.length) {
      return all.sort((a, b) => (a.slot ?? a.order ?? 0) - (b.slot ?? b.order ?? 0));
    }
    return all;
  }
  find(pred) { return this.list().find(pred) || null; }
  get size() { return this._items.size; }
}
