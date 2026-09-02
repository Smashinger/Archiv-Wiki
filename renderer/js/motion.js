// renderer/js/motion.js
// Einheitliche, kurze Ein-/Ausblend-Animation für Einstellungsfenster,
// Such-Dropdown und Icon-Auswahl — bewusst nur opacity+transform (laufen auf
// dem Compositor, kein Layout-Neuberechnen/"Layout Thrashing"). Respektiert
// prefers-reduced-motion: dann läuft alles ohne jede Bewegung sofort durch.

const REDUCED_MOTION = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE_IN_DURATION = 100;
const EASE_OUT_DURATION = 140;

const animationVersions = new WeakMap();
const pendingOutTimers = new WeakMap();

function beginAnimation(el) {
  const version = (animationVersions.get(el) || 0) + 1;
  animationVersions.set(el, version);
  const pendingTimer = pendingOutTimers.get(el);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingOutTimers.delete(el);
  }
  return version;
}

function isCurrentAnimation(el, version) {
  return animationVersions.get(el) === version;
}

// Blendet ein bereits im DOM eingefügtes Element sanft ein — Aufrufer muss es
// VORHER anhängen (display bleibt unangetastet, nur opacity/transform).
export function animateIn(el) {
  const version = beginAnimation(el);
  if (REDUCED_MOTION) { el.style.opacity = '1'; el.style.transform = 'none'; return; }
  el.style.opacity = '0';
  el.style.transform = 'translateY(-4px)';
  el.style.transition = `opacity ${EASE_OUT_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${EASE_OUT_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  // Doppeltes rAF: stellt sicher, dass der Browser den opacity:0-Ausgangs-
  // zustand tatsächlich gemalt hat, bevor zum Zielzustand übergegangen wird —
  // sonst wird die Animation in manchen Fällen einfach übersprungen.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isCurrentAnimation(el, version)) return;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  });
}

// Blendet sanft aus, ruft onComplete danach auf (dort typischerweise
// el.remove() bzw. el.style.display = 'none').
export function animateOut(el, onComplete) {
  const version = beginAnimation(el);
  if (REDUCED_MOTION) { onComplete(); return; }
  el.style.transition = `opacity ${EASE_IN_DURATION}ms ease-in, transform ${EASE_IN_DURATION}ms ease-in`;
  el.style.opacity = '0';
  el.style.transform = 'translateY(-4px)';
  const timer = setTimeout(() => {
    pendingOutTimers.delete(el);
    if (!isCurrentAnimation(el, version)) return;
    onComplete();
  }, EASE_IN_DURATION);
  pendingOutTimers.set(el, timer);
}
