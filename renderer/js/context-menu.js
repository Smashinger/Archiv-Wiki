// renderer/js/context-menu.js
// Generische Infrastruktur für selbst gerenderte HTML-Kontextmenüs — aus
// app.js ausgelagert (Phase 1D der Multi-Design-Vorbereitung). Enthält keine
// Archiv-Wiki-Classic-Fachlogik: alle Menüinhalte, Aktionen und Auslöser
// werden von außen übergeben (Klassenname, HTML, trigger, Klick-Handler auf
// den fertigen Menü-Elementen). Reine DOM-/Tastatur-/ARIA-Mechanik, damit
// künftige, strukturell andere Oberflächendesigns dieselbe Grundlage
// wiederverwenden können, ohne sie zu duplizieren.
//
// Zwei Menüvarianten werden unterstützt, beide über dieselbe Fokus-/
// Tastatur-/Schließen-Mechanik:
//  - flach (.context-menu): renderSimpleContextMenuItems() + createHtmlContextMenu()
//  - verschachtelt mit Untermenüs (.ectx-menu): renderMenuItemsHtml() +
//    findMenuItemByPath() + showEditorRightClickMenu()

import { escapeHtml } from './html-export.js';

let activeHtmlContextMenu = null;

export function isContextMenuOpen() {
  return Boolean(activeHtmlContextMenu);
}

export function isContextMenuKeyboardEvent(event) {
  const key = event.key || '';
  const code = event.code || '';
  return (
    key === 'ContextMenu' ||
    key === 'Menu' ||
    key === 'Apps' ||
    code === 'ContextMenu' ||
    (event.shiftKey && (key === 'F10' || code === 'F10'))
  );
}

export function getContextMenuItems(menuContainer) {
  return [...menuContainer.querySelectorAll(':scope > [role="menuitem"]')]
    .filter(item => item.getAttribute('aria-disabled') !== 'true' && item.offsetParent !== null);
}

export function focusContextMenuItem(item) {
  if (!item) return;
  const root = item.closest('.context-menu, .ectx-menu');
  root?.querySelectorAll('[role="menuitem"][tabindex="0"]').forEach(el => { el.tabIndex = -1; });
  item.tabIndex = 0;
  item.focus({ preventScroll: true });
}

export function setEditorSubmenuExpanded(item, expanded) {
  const submenu = item?.querySelector(':scope > .ectx-submenu');
  if (!submenu) return false;
  submenu.style.display = expanded ? 'block' : 'none';
  submenu.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  item.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (expanded) {
    submenu.style.left = '100%';
    submenu.style.right = 'auto';
    submenu.style.top = '-6px';
    submenu.style.bottom = 'auto';
    const itemRect = item.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    if (itemRect.right + submenuRect.width > window.innerWidth) {
      submenu.style.left = 'auto';
      submenu.style.right = '100%';
    }
    if (itemRect.top + submenuRect.height > window.innerHeight) {
      submenu.style.top = 'auto';
      submenu.style.bottom = '-6px';
    }
  }
  return true;
}

export function closeHtmlContextMenu(menu = activeHtmlContextMenu, { restoreFocus = true, reason = 'dismiss' } = {}) {
  if (!menu || menu.dataset.contextMenuClosed === 'true') return;
  menu.dataset.contextMenuClosed = 'true';
  menu.__contextMenuCleanup?.();
  const trigger = menu.__contextMenuTrigger;
  const onDismiss = menu.__contextMenuOnDismiss;
  if (activeHtmlContextMenu === menu) activeHtmlContextMenu = null;
  menu.remove();
  menu.__contextMenuTrigger = null;
  menu.__contextMenuOnDismiss = null;
  menu.__contextMenuCleanup = null;
  if (restoreFocus && trigger?.isConnected && typeof trigger.focus === 'function') {
    trigger.focus({ preventScroll: true });
  }
  if (reason !== 'action') onDismiss?.();
}

export function manageHtmlContextMenu(menu, {
  trigger = document.activeElement,
  label = 'Kontextmenü',
  onDismiss = null
} = {}) {
  closeHtmlContextMenu(activeHtmlContextMenu, { restoreFocus: false });
  activeHtmlContextMenu = menu;
  menu.__contextMenuTrigger = trigger;
  menu.__contextMenuOnDismiss = onDismiss;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);
  normalizeContextMenuSeparators(menu);

  menu.querySelectorAll(':scope > button').forEach(button => {
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
  });
  menu.querySelectorAll('.ectx-sep').forEach(separator => separator.setAttribute('role', 'separator'));
  menu.querySelectorAll('.ectx-submenu').forEach(submenu => {
    submenu.setAttribute('role', 'menu');
    submenu.setAttribute('aria-hidden', 'true');
  });
  menu.querySelectorAll('.ectx-item').forEach(item => {
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    if (item.classList.contains('disabled')) item.setAttribute('aria-disabled', 'true');
    if (item.classList.contains('has-submenu')) {
      item.setAttribute('aria-haspopup', 'menu');
      item.setAttribute('aria-expanded', 'false');
      const labelText = item.querySelector(':scope > .ectx-label')?.textContent?.trim();
      const submenu = item.querySelector(':scope > .ectx-submenu');
      if (labelText && submenu) submenu.setAttribute('aria-label', labelText);
    }
  });

  const onDocumentPointerDown = (event) => {
    if (!menu.contains(event.target)) closeHtmlContextMenu(menu);
  };
  const onKeyDown = (event) => {
    const focused = document.activeElement?.closest?.('[role="menuitem"]');
    const currentContainer = focused?.parentElement?.closest?.('[role="menu"]') || menu;
    const items = getContextMenuItems(currentContainer);
    const currentIndex = Math.max(0, items.indexOf(focused));

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeHtmlContextMenu(menu);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      closeHtmlContextMenu(menu);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusContextMenuItem(items[(currentIndex + delta + items.length) % items.length]);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!items.length) return;
      event.preventDefault();
      focusContextMenuItem(event.key === 'Home' ? items[0] : items[items.length - 1]);
      return;
    }
    if (event.key === 'ArrowRight' && focused?.classList.contains('has-submenu')) {
      event.preventDefault();
      setEditorSubmenuExpanded(focused, true);
      const submenu = focused.querySelector(':scope > .ectx-submenu');
      focusContextMenuItem(getContextMenuItems(submenu)[0]);
      return;
    }
    if (event.key === 'ArrowLeft') {
      const submenu = focused?.closest('.ectx-submenu');
      const parentItem = submenu?.parentElement?.closest('.ectx-item.has-submenu');
      if (submenu && parentItem) {
        event.preventDefault();
        setEditorSubmenuExpanded(parentItem, false);
        focusContextMenuItem(parentItem);
      }
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && focused) {
      event.preventDefault();
      if (focused.getAttribute('aria-disabled') === 'true') return;
      if (focused.classList.contains('has-submenu')) {
        setEditorSubmenuExpanded(focused, true);
        focusContextMenuItem(getContextMenuItems(focused.querySelector(':scope > .ectx-submenu'))[0]);
      } else {
        focused.click();
      }
    }
  };

  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  menu.addEventListener('keydown', onKeyDown);
  menu.__contextMenuCleanup = () => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    menu.removeEventListener('keydown', onKeyDown);
  };

  requestAnimationFrame(() => {
    if (!menu.isConnected) return;
    focusContextMenuItem(getContextMenuItems(menu)[0]);
  });
  return menu;
}


export function isContextMenuSeparatorElement(element) {
  return element?.matches?.('hr, .ectx-sep, [role="separator"]') || false;
}

export function normalizeContextMenuSeparators(container) {
  const children = [...container.children];
  let previousWasSeparator = true;
  for (const child of children) {
    if (!isContextMenuSeparatorElement(child)) {
      previousWasSeparator = false;
      continue;
    }
    if (previousWasSeparator) {
      child.remove();
      continue;
    }
    previousWasSeparator = true;
  }
  const last = container.lastElementChild;
  if (isContextMenuSeparatorElement(last)) last.remove();
}

export function positionHtmlContextMenu(menu, { clientX, clientY, anchorEl = null, offsetY = 4 } = {}) {
  const anchorRect = anchorEl?.getBoundingClientRect?.();
  const requestedLeft = Number.isFinite(clientX) ? clientX : (anchorRect?.left ?? 4);
  const requestedTop = Number.isFinite(clientY) ? clientY : ((anchorRect?.bottom ?? 0) + offsetY);
  const rect = menu.getBoundingClientRect();
  const margin = 4;
  const left = Math.max(margin, Math.min(requestedLeft, window.innerWidth - rect.width - margin));
  const top = Math.max(margin, Math.min(requestedTop, window.innerHeight - rect.height - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

export function createHtmlContextMenu({
  className = 'context-menu',
  html = '',
  trigger = document.activeElement,
  label = 'Kontextmenü',
  position = null,
  onDismiss = null
} = {}) {
  const menu = document.createElement('div');
  menu.className = className;
  menu.innerHTML = html;
  normalizeContextMenuSeparators(menu);
  document.body.appendChild(menu);
  manageHtmlContextMenu(menu, { trigger, label, onDismiss });
  positionHtmlContextMenu(menu, { ...(position || {}), anchorEl: trigger });
  return menu;
}

export function renderSimpleContextMenuItems(items) {
  return items.map(item => {
    if (item.separator) return '<hr>';
    const className = item.danger ? ' class="danger"' : '';
    const data = item.data || {};
    const attributes = Object.entries(data)
      .map(([key, value]) => ` data-${key}="${escapeHtml(String(value))}"`)
      .join('');
    return `<button type="button"${className}${attributes}>${item.label}</button>`;
  }).join('');
}

export function contextMenuPointForElement(element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: Math.max(4, Math.min(window.innerWidth - 8, rect.left)),
    clientY: Math.max(4, Math.min(window.innerHeight - 8, rect.bottom + 4))
  };
}

export function normalizeMenuItemDefinitions(items) {
  const normalized = [];
  for (const sourceItem of items || []) {
    const item = Array.isArray(sourceItem?.submenu)
      ? { ...sourceItem, submenu: normalizeMenuItemDefinitions(sourceItem.submenu) }
      : sourceItem;
    if (item?.separator) {
      if (!normalized.length || normalized[normalized.length - 1]?.separator) continue;
      normalized.push(item);
      continue;
    }
    if (item) normalized.push(item);
  }
  if (normalized[normalized.length - 1]?.separator) normalized.pop();
  return normalized;
}

export function renderMenuItemsHtml(items) {
  return normalizeMenuItemDefinitions(items).map((item, i) => {
    if (item.separator) return '<div class="ectx-sep"></div>';
    const hasSubmenu = Array.isArray(item.submenu);
    return `
      <div class="ectx-item${hasSubmenu ? ' has-submenu' : ''}${item.disabled ? ' disabled' : ''}" data-idx="${i}">
        <span class="ectx-label">${escapeHtml(item.label)}</span>
        ${hasSubmenu ? '<span class="ectx-arrow">▸</span>' : ''}
        ${hasSubmenu ? `<div class="ectx-submenu">${renderMenuItemsHtml(item.submenu)}</div>` : ''}
      </div>`;
  }).join('');
}

// Findet das item-Objekt zu einem angeklickten .ectx-item anhand des Pfads
// aus data-idx-Werten (jede Verschachtelungsebene hat ihren eigenen Index).
export function findMenuItemByPath(items, path) {
  let list = items, item = null;
  for (const idx of path) {
    item = list[idx];
    if (!item) return null;
    list = item.submenu || [];
  }
  return item;
}

export function showEditorRightClickMenu(e, items, clickPos, trigger = e.currentTarget || document.activeElement) {
  e.preventDefault();
  const menu = createHtmlContextMenu({
    className: 'ectx-menu',
    trigger,
    label: 'Editor-Kontextmenü',
    position: { clientX: e.clientX, clientY: e.clientY },
    html: renderMenuItemsHtml(items)
  });

  // Untermenüs: JS-gesteuert statt reinem CSS-:hover, weil wir die TATSÄCHLICHE
  // Höhe/Breite eines Untermenüs erst kennen, sobald es (auch nur kurz)
  // sichtbar ist — ein display:none-Element hat immer ein Null-Rechteck.
  // Bekannter Bug vorher: "Absatz" (das längste Untermenü) ragte am unteren
  // Bildschirmrand einfach ab, weil nur horizontaler Überlauf abgefangen wurde.
  menu.querySelectorAll('.ectx-item.has-submenu').forEach(el => {
    const sub = el.querySelector(':scope > .ectx-submenu');
    let hideTimer = null;
    el.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      setEditorSubmenuExpanded(el, true);
    });
    const scheduleHide = () => {
      hideTimer = setTimeout(() => {
        if (!el.contains(document.activeElement)) setEditorSubmenuExpanded(el, false);
      }, 150);
    };
    el.addEventListener('mouseleave', scheduleHide);
    sub.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    sub.addEventListener('mouseleave', scheduleHide);
    sub.addEventListener('focusin', () => clearTimeout(hideTimer));
  });

  menu.addEventListener('click', (ev) => {
    const el = ev.target.closest('.ectx-item');
    if (!el || el.classList.contains('disabled')) return;
    // Pfad aus data-idx über alle Verschachtelungsebenen bis zum geklickten Element aufsammeln.
    const path = [];
    let node = el;
    while (node && node.classList.contains('ectx-item')) {
      path.unshift(Number(node.dataset.idx));
      node = node.parentElement?.closest('.ectx-item');
    }
    const item = findMenuItemByPath(items, path);
    if (!item || item.submenu) return; // Klick auf einen Eintrag MIT Untermenü selbst tut nichts (nur Hover öffnet es)
    ev.stopPropagation();
    closeHtmlContextMenu(menu, { reason: 'action' });
    item.action?.(clickPos);
  });
}
