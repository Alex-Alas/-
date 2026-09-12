/* =========================================================
   HUD STATE
   State controller for auto-collapsing weapon HUD drawer.
   Keeps track of expanded/collapsed states, hover status,
   and debounce collapse timers without coupling to DOM.
   ========================================================= */

export function createHUDState(options = {}) {
  const scheduler = options.scheduler || {
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id)
  };
  const onChange = options.onChange || null;

  let expanded = false;
  let hovered = false;
  let pendingCollapse = false;
  let timer = null;

  function expand(durationMs = 2000) {
    expanded = true;
    pendingCollapse = false;
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
    onChange?.(true);

    timer = scheduler.setTimeout(() => {
      timer = null;
      if (hovered) {
        pendingCollapse = true;
      } else {
        expanded = false;
        onChange?.(false);
      }
    }, durationMs);
  }

  function collapse() {
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
    if (hovered) {
      pendingCollapse = true;
    } else {
      expanded = false;
      pendingCollapse = false;
      onChange?.(false);
    }
  }

  function setHovered(isHovered) {
    hovered = !!isHovered;
    if (!hovered && pendingCollapse) {
      expanded = false;
      pendingCollapse = false;
      onChange?.(false);
    }
  }

  function isExpanded() {
    return expanded;
  }

  return {
    expand,
    collapse,
    setHovered,
    isExpanded
  };
}
