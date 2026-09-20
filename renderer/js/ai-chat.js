'use strict';

const INPUT_MAX_HEIGHT = 140;

export function initAiChat() {
  const panel = document.getElementById('aiChatPanel');
  const openButton = document.getElementById('titlebarAiChatBtn');
  const closeButton = document.getElementById('aiChatCloseBtn');
  const header = panel?.querySelector('[data-ai-drag-handle]');
  const input = document.getElementById('aiChatInput');
  if (!panel || !openButton || !closeButton || !header || !input) return () => {};
  if (panel.dataset.initialized === 'true') return () => {};
  panel.dataset.initialized = 'true';

  function setOpen(open) {
    panel.hidden = !open;
    openButton.classList.toggle('is-active', open);
    openButton.setAttribute('aria-pressed', String(open));
    openButton.setAttribute('aria-label', open ? 'KI-Assistent schließen' : 'KI-Assistent öffnen');
    if (open) requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  function togglePanel() {
    setOpen(panel.hidden);
  }

  function closePanel() {
    setOpen(false);
  }

  function handleShortcut(event) {
    if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (String(event.key).toLowerCase() !== 'a') return;
    event.preventDefault();
    togglePanel();
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.max(36, Math.min(input.scrollHeight, INPUT_MAX_HEIGHT))}px`;
    input.style.overflowY = input.scrollHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  }

  let dragState = null;

  function handleDragMove(event) {
    if (!dragState) return;
    const minTop = document.getElementById('appTitlebar')?.offsetHeight || 0;
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(minTop, window.innerHeight - panel.offsetHeight);
    const left = Math.min(maxLeft, Math.max(0, event.clientX - dragState.offsetX));
    const top = Math.min(maxTop, Math.max(minTop, event.clientY - dragState.offsetY));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function stopDragging() {
    if (!dragState) return;
    dragState = null;
    header.classList.remove('is-dragging');
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', stopDragging);
  }

  function startDragging(event) {
    if (event.button !== 0 || event.target.closest('button, select, input, textarea, a')) return;
    const bounds = panel.getBoundingClientRect();
    dragState = {
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top
    };
    panel.style.left = `${bounds.left}px`;
    panel.style.top = `${bounds.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    header.classList.add('is-dragging');
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', stopDragging);
    event.preventDefault();
  }

  openButton.addEventListener('click', togglePanel);
  closeButton.addEventListener('click', closePanel);
  document.addEventListener('keydown', handleShortcut);
  header.addEventListener('mousedown', startDragging);
  input.addEventListener('input', resizeInput);
  resizeInput();

  return () => {
    stopDragging();
    openButton.removeEventListener('click', togglePanel);
    closeButton.removeEventListener('click', closePanel);
    document.removeEventListener('keydown', handleShortcut);
    header.removeEventListener('mousedown', startDragging);
    input.removeEventListener('input', resizeInput);
    delete panel.dataset.initialized;
  };
}
