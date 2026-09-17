// renderer/js/toolbar-overflow.js
// Überlaufmenü "Weitere" für die Editor-Werkzeugleiste.
//
// Die Leiste bleibt eine einzige Zeile (flex-wrap:nowrap, overflow-x:auto in
// components.css). Bei schmalen Fenstern lagen dadurch ganze Gruppen – bei
// 960 px Mindestbreite u. a. Listen, Einfügen, Markdown und die komplette
// Dokument-Gruppe – unsichtbar außerhalb des Bildes, ohne jeden Hinweis.
//
// Dieses Modul ergänzt nur einen Knopf am rechten Ende, der ausschließlich bei
// tatsächlichem Überlauf erscheint. Sein Menü listet genau die Bedienelemente,
// die gerade nicht sichtbar sind. Ein Eintrag scrollt das ORIGINAL-Element ins
// Bild und löst dessen eigenen Klick aus: keine zweite Befehlslogik, keine
// kopierten Handler, Tastenkürzel unverändert. Verankerte Menüs (Überschrift,
// Tabelle, Callout, Export …) öffnen sich dadurch weiterhin am echten Knopf.
// Das Menü selbst ist das vorhandene createHtmlContextMenu() (Pfeiltasten,
// Enter/Leertaste, Escape, Fokus-Rückgabe).

const OVERFLOW_BUTTON_ID = 'btnToolbarOverflow';
const CONTROL_SELECTOR = 'button, select';

/**
 * Reine Geometrieprüfung: liegt ein Element nicht vollständig im sichtbaren
 * Bereich [visibleLeft, visibleRight]? Eine halbe Pixel Toleranz fängt
 * Rundungen bei gebrochenen Breiten ab.
 */
export function isOutsideVisibleRange(rect, visibleLeft, visibleRight, tolerance = 0.5) {
  return rect.left < visibleLeft - tolerance || rect.right > visibleRight + tolerance;
}

/**
 * Sichtbare Beschriftung eines Werkzeugleisten-Elements für das Menü.
 * title vor aria-label: title trägt die hilfreichen Zusätze (Markdown-Syntax,
 * Tastenkürzel wie "Strg+F"), aria-label nur den knappen Namen; der sichtbare
 * Knopftext ("F", "•") ist allein nicht verständlich.
 */
export function toolbarControlLabel({ ariaLabel = '', title = '', text = '' } = {}) {
  const label = String(title || ariaLabel || text || '').replace(/\s+/g, ' ').trim();
  return label || 'Werkzeug';
}

function describeControl(control) {
  return toolbarControlLabel({
    ariaLabel: control.getAttribute('aria-label'),
    title: control.getAttribute('title'),
    text: control.textContent
  });
}

function isActiveControl(control) {
  return control.getAttribute('aria-pressed') === 'true' || control.classList.contains('active');
}

function escapeMenuText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

/**
 * Richtet das Überlaufmenü an einer frisch gerenderten Werkzeugleiste ein.
 * Wird bei jedem Notizwechsel erneut aufgerufen (die Leiste wird neu gebaut);
 * Beobachter der alten Leiste lösen sich selbst, sobald sie nicht mehr im DOM ist.
 */
export function setupToolbarOverflow(toolbar, { createMenu, closeMenu }) {
  if (!(toolbar instanceof HTMLElement) || toolbar.querySelector(`#${OVERFLOW_BUTTON_ID}`)) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = OVERFLOW_BUTTON_ID;
  button.className = 'toolbar-overflow-btn';
  button.hidden = true;
  button.title = 'Weitere Werkzeuge, die gerade nicht in die Leiste passen';
  button.setAttribute('aria-label', 'Weitere Werkzeuge');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span class="toolbar-overflow-dots" aria-hidden="true">⋯</span><span class="toolbar-overflow-text">Weitere</span>';
  toolbar.appendChild(button);

  function controls() {
    return [...toolbar.querySelectorAll(CONTROL_SELECTOR)]
      .filter(control => control !== button && !button.contains(control) && control.getClientRects().length > 0);
  }

  function hiddenControls() {
    const toolbarRect = toolbar.getBoundingClientRect();
    const visibleRight = button.hidden ? toolbarRect.right : button.getBoundingClientRect().left;
    return controls().filter(control => isOutsideVisibleRange(control.getBoundingClientRect(), toolbarRect.left, visibleRight));
  }

  // Überlauf unabhängig davon bestimmen, ob der Knopf selbst gerade Platz belegt:
  // sonst schaltet er sich an der Grenze durch seine eigene Breite hin und her.
  function update() {
    if (!toolbar.isConnected) { observer.disconnect(); return; }
    const ownWidth = button.hidden ? 0 : button.getBoundingClientRect().width;
    const overflowing = toolbar.scrollWidth - ownWidth > toolbar.clientWidth + 1;
    if (button.hidden === overflowing) button.hidden = !overflowing;
  }

  const observer = new ResizeObserver(() => update());
  observer.observe(toolbar);
  [...toolbar.children].forEach(child => { if (child !== button) observer.observe(child); });
  requestAnimationFrame(update);

  function activate(control) {
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (control instanceof HTMLSelectElement) {
      control.focus({ preventScroll: true });
      try { control.showPicker(); } catch { /* ohne Nutzeraktivierung bleibt der Fokus am Feld */ }
      return;
    }
    control.click();
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const entries = hiddenControls();
    if (!entries.length) { update(); return; }

    let lastGroup = null;
    const html = entries.map((control, index) => {
      const group = control.closest('.toolbar-group');
      const separator = lastGroup && group !== lastGroup ? '<hr>' : '';
      lastGroup = group;
      const disabled = control.disabled ? ' disabled aria-disabled="true"' : '';
      const state = isActiveControl(control) ? ' (aktiv)' : '';
      return `${separator}<button type="button" data-overflow-index="${index}"${disabled}>${escapeMenuText(describeControl(control) + state)}</button>`;
    }).join('');

    button.setAttribute('aria-expanded', 'true');
    const menu = createMenu({
      className: 'context-menu toolbar-overflow-menu',
      trigger: button,
      label: 'Weitere Werkzeuge',
      html,
      onDismiss: () => button.setAttribute('aria-expanded', 'false')
    });
    menu.addEventListener('click', (menuEvent) => {
      const item = menuEvent.target.closest('[data-overflow-index]');
      if (!item || item.disabled) return;
      const control = entries[Number(item.dataset.overflowIndex)];
      closeMenu(menu, { restoreFocus: false, reason: 'action' });
      button.setAttribute('aria-expanded', 'false');
      if (control?.isConnected) activate(control);
    });
  });

  return { button, update };
}
