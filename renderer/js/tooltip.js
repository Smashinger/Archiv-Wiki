// renderer/js/tooltip.js
// Eigener Tooltip für per CSS abgeschnittene Texte (text-overflow: ellipsis).
// Bewusst EIN einziger, delegierter Listener auf document-Ebene statt
// individueller Zuweisung pro Element — funktioniert dadurch automatisch für
// alle betroffenen Stellen (Notiztitel, Sidebar-Einträge, Tags, angepinnte
// Karten, …), auch für Elemente, die erst später/dynamisch erzeugt werden,
// ohne dass jede einzelne Stelle im Code extra angepasst werden müsste.

let tooltipEl = null;
let showTimer = null;
let currentTarget = null;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'ellipsis-tooltip';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

// Ist der Text an DIESEM Element tatsächlich sichtbar abgeschnitten? (nicht
// nur "hat die CSS-Regel", sondern "überläuft gerade wirklich") — verhindert,
// dass ein Tooltip erscheint, obwohl der Text komplett sichtbar ist.
function isActuallyTruncated(el) {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const style = getComputedStyle(el);
  return style.textOverflow === 'ellipsis' && style.overflow !== 'visible';
}

function findTruncatedAncestor(el) {
  let node = el;
  let depth = 0;
  while (node && node !== document.body && depth < 4) {
    if (node.nodeType === 1 && isActuallyTruncated(node)) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

function showTooltip(target) {
  const tip = ensureTooltipEl();
  const text = target.dataset.tooltipText || target.textContent.trim();
  if (!text) return;
  tip.textContent = text;
  tip.style.display = 'block';

  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  // Dieselbe Viewport-Begrenzung wie bei den Auswahl-Fenstern an anderer
  // Stelle im Programm — bleibt immer sichtbar, weicht bei Bedarf aus.
  let top = rect.bottom + 8;
  if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 8;
  let left = Math.max(4, Math.min(rect.left, window.innerWidth - tipRect.width - 8));
  tip.style.top = Math.max(4, top) + 'px';
  tip.style.left = left + 'px';
}

function hideTooltip() {
  clearTimeout(showTimer);
  showTimer = null;
  currentTarget = null;
  if (tooltipEl) tooltipEl.style.display = 'none';
}

export function initEllipsisTooltips() {
  document.addEventListener('mouseover', (e) => {
    const target = findTruncatedAncestor(e.target);
    if (!target || target === currentTarget) return;
    hideTooltip();
    currentTarget = target;
    // Leichte Verzögerung wie gefordert, statt sofort aufzupoppen.
    showTimer = setTimeout(() => showTooltip(target), 450);
  });

  document.addEventListener('mouseout', (e) => {
    if (currentTarget && (e.target === currentTarget || currentTarget.contains(e.target))) {
      if (!currentTarget.contains(e.relatedTarget)) hideTooltip();
    }
  });

  // Beim Scrollen/Fenster-Größenänderung sofort ausblenden statt an falscher
  // Position hängen zu bleiben.
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
}
