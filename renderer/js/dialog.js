// Gemeinsamer Bedien- und Accessibility-Standard für modale HTML-Dialoge.
// Die vorhandenen visuellen Klassen bleiben bestehen; dieses Modul vereinheitlicht
// Strukturrollen, Semantik, Fokus, Tastatur und Hintergrund zentral.

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

let dialogId = 0;
const activeControllers = new WeakMap();
const activeDialogStack = [];

const ACTION_BAR_SELECTOR = '.dialog-actions, .prompt-actions, .table-editor-actions, [data-dialog-actions]';
const BODY_SELECTOR = ':scope > .dialog-body, :scope > .settings-modal-body, :scope > .table-editor-grid-wrap';

function markDialogAction(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  const action = button.dataset.action || '';
  const isPrimary = button.classList.contains('primary')
    || button.classList.contains('danger')
    || ['ok', 'apply', 'open-github', 'syncall'].includes(action);
  const isSecondary = ['cancel', 'close', 'close-x'].includes(action);
  if (isPrimary) button.dataset.dialogAction = 'primary';
  else if (isSecondary) button.dataset.dialogAction = 'secondary';
}

function normalizeActionBar(actionBar) {
  actionBar.classList.add('dialog-actions');
  actionBar.setAttribute('data-dialog-actions', '');

  const buttons = [...actionBar.querySelectorAll(':scope > button')];
  buttons.forEach(markDialogAction);

  // Utility-Aktionen bleiben an ihrer bestehenden Position. Nur die klar
  // erkennbare Sekundär-/Primärgruppe wird am rechten Ende konsistent als
  // „Abbrechen, danach primäre Aktion“ angeordnet.
  const secondary = buttons.filter(button => button.dataset.dialogAction === 'secondary');
  const primary = buttons.filter(button => button.dataset.dialogAction === 'primary');
  if (secondary.length && primary.length) {
    secondary.forEach(button => actionBar.appendChild(button));
    primary.forEach(button => actionBar.appendChild(button));
  }
}

function normalizeDialogStructure(dialog, titleElement, descriptionElement) {
  dialog.classList.add('dialog-surface');
  dialog.setAttribute('data-dialog-surface', '');

  const title = titleElement
    || dialog.querySelector('[data-dialog-title], .prompt-title, .settings-modal-header > span, h1, h2, h3');
  const description = descriptionElement
    || dialog.querySelector('[data-dialog-description], .sync-modal-note, .settings-hint, p');

  if (title) {
    title.classList.add('dialog-title');
    title.setAttribute('data-dialog-title', '');
    const header = title.closest('.settings-modal-header') || title;
    header.classList.add('dialog-header');
    header.setAttribute('data-dialog-header', '');
  }

  if (description) {
    description.classList.add('dialog-description');
    description.setAttribute('data-dialog-description', '');
  }

  const actionBars = [...dialog.querySelectorAll(ACTION_BAR_SELECTOR)];
  actionBars.forEach(normalizeActionBar);

  let body = dialog.querySelector(BODY_SELECTOR);
  if (body) {
    body.classList.add('dialog-body');
    body.setAttribute('data-dialog-body', '');
  } else {
    const header = dialog.querySelector(':scope > [data-dialog-header]');
    const actionBar = actionBars.find(element => element.parentElement === dialog) || null;
    const bodyNodes = [...dialog.children].filter(element => element !== header && element !== actionBar);
    if (bodyNodes.length) {
      body = document.createElement('div');
      body.className = 'dialog-body dialog-body-layout-neutral';
      body.setAttribute('data-dialog-body', '');
      dialog.insertBefore(body, actionBar);
      bodyNodes.forEach(element => body.appendChild(element));
    }
  }

  dialog.querySelectorAll('button').forEach(markDialogAction);
  return { title, description, body, actionBars };
}

function visibleFocusableElements(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return element.getClientRects().length > 0;
  });
}

function ensureId(element, prefix) {
  if (!element) return null;
  if (!element.id) element.id = `${prefix}-${++dialogId}`;
  return element.id;
}

export function closeManagedDialog(overlay, { restoreFocus = false } = {}) {
  const controller = activeControllers.get(overlay);
  if (controller) controller.destroy({ restoreFocus });
  else overlay?.remove();
}

export function closeManagedDialogs(selector, options = {}) {
  document.querySelectorAll(selector).forEach(overlay => closeManagedDialog(overlay, options));
}



function escapeDialogHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

export function showMessageDialog({
  title = 'Hinweis',
  message = '',
  buttonLabel = 'OK',
  className = ''
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = `prompt-overlay ${className}`.trim();
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">${escapeDialogHtml(title)}</div>
        <p class="dialog-message">${escapeDialogHtml(message)}</p>
        <div class="prompt-actions">
          <button type="button" class="btn primary" data-action="ok">${escapeDialogHtml(buttonLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let closed = false;
    const okButton = overlay.querySelector('[data-action="ok"]');
    function close() {
      if (closed) return;
      closed = true;
      controller.destroy();
      resolve();
    }
    okButton.addEventListener('click', close);
    const controller = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: okButton,
      primaryAction: okButton,
      enterActivatesPrimary: true,
      onRequestClose: close,
      closeOnBackdrop: false
    });
  });
}

export function showConfirmDialog({
  title = 'Bestätigen',
  message = '',
  confirmLabel = 'OK',
  cancelLabel = 'Abbrechen',
  danger = false,
  className = ''
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = `prompt-overlay ${className}`.trim();
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">${escapeDialogHtml(title)}</div>
        <p class="dialog-message">${escapeDialogHtml(message)}</p>
        <div class="prompt-actions">
          <button type="button" class="btn" data-action="cancel">${escapeDialogHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-action="ok">${escapeDialogHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      controller.destroy();
      resolve(result);
    }
    const cancelButton = overlay.querySelector('[data-action="cancel"]');
    const confirmButton = overlay.querySelector('[data-action="ok"]');
    cancelButton.addEventListener('click', () => close(false));
    confirmButton.addEventListener('click', () => close(true));
    const controller = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: danger ? cancelButton : confirmButton,
      primaryAction: confirmButton,
      enterActivatesPrimary: !danger,
      onRequestClose: () => close(false),
      closeOnBackdrop: false
    });
  });
}

export function manageModalDialog({
  overlay,
  dialog = overlay?.firstElementChild,
  titleElement = null,
  descriptionElement = null,
  initialFocus = null,
  primaryAction = null,
  onRequestClose,
  closeOnBackdrop = false,
  closeOnEscape = true,
  enterActivatesPrimary = false,
  canCloseOnEscape = () => true,
  restoreFocus = true
}) {
  if (!(overlay instanceof HTMLElement) || !(dialog instanceof HTMLElement)) {
    throw new TypeError('manageModalDialog benötigt Overlay und Dialogelement.');
  }

  const existing = activeControllers.get(overlay);
  if (existing) return existing;

  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('tabindex', '-1');

  const structure = normalizeDialogStructure(dialog, titleElement, descriptionElement);
  const resolvedTitle = structure.title;
  const resolvedDescription = structure.description;

  const titleId = ensureId(resolvedTitle, 'dialog-title');
  const descriptionId = ensureId(resolvedDescription, 'dialog-description');
  if (titleId) dialog.setAttribute('aria-labelledby', titleId);
  if (descriptionId) dialog.setAttribute('aria-describedby', descriptionId);

  // Verschachtelte modale Dialoge müssen immer über dem aktuell offenen
  // Eltern-Dialog liegen. Die visuellen Overlay-Klassen behalten ihre
  // bestehenden Basis-z-Indizes; nur wenn ein neuer verwalteter Dialog sonst
  // darunter oder auf derselben Ebene läge, wird seine Ebene relativ zum
  // Eltern-Dialog angehoben. Dadurch bleibt die Layer-Reihenfolge zentral im
  // gemeinsamen Dialogsystem und einzelne Aufrufer brauchen keine Sonder-CSS.
  const parentOverlay = activeDialogStack[activeDialogStack.length - 1];
  if (parentOverlay?.isConnected) {
    const parentZIndex = Number.parseInt(getComputedStyle(parentOverlay).zIndex, 10);
    const ownZIndex = Number.parseInt(getComputedStyle(overlay).zIndex, 10);
    if (Number.isFinite(parentZIndex) && (!Number.isFinite(ownZIndex) || ownZIndex <= parentZIndex)) {
      overlay.style.zIndex = String(parentZIndex + 1);
    }
  }

  // Nur die bereits vorhandenen Geschwister werden gesperrt. Dadurch kann ein
  // untergeordneter Dialog einen bereits offenen Dialog sicher überlagern und
  // dessen vorherigen Zustand beim Schließen exakt wiederherstellen.
  const backgroundState = [...document.body.children]
    .filter(element => element !== overlay)
    .map(element => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden')
    }));
  backgroundState.forEach(({ element }) => {
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
  });

  let destroyed = false;

  function requestClose(reason) {
    if (typeof onRequestClose === 'function') onRequestClose(reason);
  }

  function handleKeydown(event) {
    // Bei verschachtelten Dialogen verarbeitet ausschließlich der zuletzt
    // geöffnete Dialog Tastaturereignisse. Der darunterliegende Dialog bleibt
    // dadurch inert und kann den Fokus nicht aus dem Kinddialog zurückziehen.
    if (activeDialogStack[activeDialogStack.length - 1] !== overlay) return;

    if (event.key === 'Escape' && closeOnEscape) {
      if (!canCloseOnEscape()) return;
      event.preventDefault();
      event.stopPropagation();
      requestClose('escape');
      return;
    }

    if (event.key === 'Enter' && enterActivatesPrimary && primaryAction) {
      const target = event.target;
      const isMultiline = target instanceof HTMLTextAreaElement
        || target?.isContentEditable;
      const isInteractiveButton = target instanceof HTMLButtonElement
        || target instanceof HTMLAnchorElement;
      if (!isMultiline && !isInteractiveButton && !event.isComposing) {
        event.preventDefault();
        primaryAction.click();
        return;
      }
    }

    if (event.key !== 'Tab') return;
    const focusable = visibleFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function handleBackdrop(event) {
    if (closeOnBackdrop && event.target === overlay) requestClose('backdrop');
  }

  function restoreBackground() {
    backgroundState.forEach(({ element, inert, ariaHidden }) => {
      if (!element.isConnected) return;
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    });
  }

  function destroy({ restoreFocus: shouldRestoreFocus = restoreFocus } = {}) {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', handleKeydown, true);
    overlay.removeEventListener('mousedown', handleBackdrop);
    activeControllers.delete(overlay);
    const stackIndex = activeDialogStack.lastIndexOf(overlay);
    if (stackIndex !== -1) activeDialogStack.splice(stackIndex, 1);
    overlay.remove();
    restoreBackground();
    if (shouldRestoreFocus && previouslyFocused?.isConnected) {
      requestAnimationFrame(() => previouslyFocused.focus({ preventScroll: true }));
    }
  }

  document.addEventListener('keydown', handleKeydown, true);
  overlay.addEventListener('mousedown', handleBackdrop);

  const controller = { destroy, requestClose, dialog, overlay };
  activeControllers.set(overlay, controller);
  activeDialogStack.push(overlay);

  requestAnimationFrame(() => {
    if (destroyed) return;
    const candidate = typeof initialFocus === 'function' ? initialFocus() : initialFocus;
    const focusTarget = candidate instanceof HTMLElement && !candidate.disabled
      ? candidate
      : visibleFocusableElements(dialog)[0] || dialog;
    focusTarget.focus({ preventScroll: true });
    if (focusTarget instanceof HTMLInputElement && focusTarget.type === 'text') {
      focusTarget.select();
    }
  });

  return controller;
}
