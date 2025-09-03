// Moves a node to a target container (default: document.body) to avoid
// being affected by parent stacking/overflow contexts.
export function portal(node: HTMLElement, target: HTMLElement = document.body) {
  if (target && node && node.parentNode !== target) {
    target.appendChild(node);
  }
  return {
    destroy() {
      try {
        if (node.parentNode === target) target.removeChild(node);
      } catch (_) {
        // noop
      }
    }
  };
}

