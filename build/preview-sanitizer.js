import DOMPurify from 'dompurify';

// Vorschau-Inhalte sind nicht vertrauenswürdig: Sie können aus lokalen
// Markdown-Dateien, Importen, WebDAV oder dem Web Clipper stammen. Deshalb
// erlaubt die zentrale Grenze nur die passiven HTML-Bausteine, die der
// Markdown-Renderer tatsächlich benötigt. Interaktive Archiv-Wiki-Elemente
// (Checklisten, Kopier- und Bildgrößen-Knöpfe) werden erst nach dieser Grenze
// mit DOM-APIs aus festen Werten aufgebaut.
const PREVIEW_ALLOWED_TAGS = [
  'a', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'img', 'li', 'ol', 'p', 'pre', 's', 'span',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u',
  'ul'
];

const PREVIEW_ALLOWED_ATTRIBUTES = [
  'align', 'alt', 'aria-hidden', 'class', 'colspan', 'href', 'reversed',
  'rowspan', 'scope', 'src', 'start', 'title'
];

// DOMPurify prüft URI-Attribute bereits während der DOM-basierten
// Sanitization. Anschließend folgt unten zusätzlich die elementbezogene
// Prüfung: Links dürfen nur HTTP(S) nutzen; file: ist ausschließlich für
// Bilder im .attachments-Ordner zulässig. data:, javascript: und unbekannte
// Protokolle erreichen die echte Vorschau dadurch nicht.
const PREVIEW_URI_PATTERN = /^(?:(?:https?|file|incoming-image):|assets\/icon-library\/)/i;
const ICON_SOURCE_PATTERN = /^assets\/icon-library\/[a-z0-9_-]+\/[a-z0-9._-]+\.svg$/i;
const IMAGE_WIDTH_PATTERN = /^width:(25|50|75|100)%$/;

const BASE_SANITIZE_CONFIG = {
  ALLOWED_TAGS: PREVIEW_ALLOWED_TAGS,
  ALLOWED_ATTR: PREVIEW_ALLOWED_ATTRIBUTES,
  ALLOWED_URI_REGEXP: PREVIEW_URI_PATTERN,
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_DOM_FRAGMENT: true,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true
};

// KaTeX läuft ausdrücklich ohne vertrauenswürdige URL-/HTML-Befehle und gibt
// nur seinen eigenen HTML-Baum aus. Der wird separat auf genau die von KaTeX
// benötigten span-/SVG-Strukturen begrenzt. Rohes SVG aus Markdown gelangt nie
// in diesen Pfad und wird von BASE_SANITIZE_CONFIG vollständig entfernt.
const KATEX_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['path', 'span', 'svg'],
  ALLOWED_ATTR: [
    'aria-hidden', 'class', 'd', 'height', 'preserveaspectratio', 'style',
    'title', 'viewbox', 'width', 'xmlns'
  ],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_DOM_FRAGMENT: true,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true
};

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function attachmentBaseUrl(projectPath) {
  const normalized = String(projectPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized.startsWith('/')) return null;
  try {
    return new URL(`file://${normalized}/.attachments/`);
  } catch {
    return null;
  }
}

function isProjectAttachmentUrl(value, projectPath) {
  const base = attachmentBaseUrl(projectPath);
  if (!base) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'file:' && url.href.startsWith(base.href);
  } catch {
    return false;
  }
}

function replaceTextTokens(root, pattern, createReplacement) {
  const textNodes = [];
  const walker = document.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    if (node.parentElement?.closest('code, pre')) return;
    const text = node.nodeValue || '';
    pattern.lastIndex = 0;
    if (!pattern.test(text)) return;
    pattern.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      const replacement = createReplacement(match, document);
      if (replacement) fragment.append(replacement);
      else fragment.append(document.createTextNode(match[0]));
      cursor = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  });
}

function restoreMath(root, mathStore) {
  replaceTextTokens(root, /@@MATH(\d+)@@/g, (match) => {
    const html = mathStore[Number(match[1])];
    if (typeof html !== 'string') return null;
    return DOMPurify.sanitize(html, KATEX_SANITIZE_CONFIG);
  });
}

function restoreWikiLinks(root, wikiStore) {
  replaceTextTokens(root, /@@WIKILINK(\d+)@@/g, (match, ownerDocument) => {
    const entry = wikiStore[Number(match[1])];
    if (!entry) return null;
    const link = ownerDocument.createElement('a');
    link.className = entry.relPath ? 'wiki-link' : 'wiki-link wiki-link-missing';
    link.textContent = entry.display;
    if (entry.relPath) {
      link.dataset.wikilinkTarget = entry.relPath;
    } else {
      link.dataset.wikilinkCreate = entry.target;
      link.title = 'Notiz existiert noch nicht — klicken zum Anlegen';
    }
    return link;
  });
}

function restoreTaskCheckboxes(root, taskCheckboxCount) {
  replaceTextTokens(root, /@@TASKCHECKBOX(\d+)_(0|1)@@/g, (match, ownerDocument) => {
    const index = Number(match[1]);
    if (!Number.isSafeInteger(index) || index < 0 || index >= taskCheckboxCount) return null;
    const checkbox = ownerDocument.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.taskIndex = String(index);
    if (match[2] === '1') checkbox.setAttribute('checked', '');
    return checkbox;
  });
}

function secureLinks(root) {
  root.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!isHttpUrl(href)) {
      link.removeAttribute('href');
      return;
    }
    link.rel = 'noopener noreferrer';
  });
}

function classifyImageSource(image, projectPath) {
  const source = image.getAttribute('src') || '';
  if (isHttpUrl(source)) return 'remote';
  if (isProjectAttachmentUrl(source, projectPath)) return 'attachment';
  if (ICON_SOURCE_PATTERN.test(source)) return 'icon';
  if (/^incoming-image:[a-z0-9._-]+$/i.test(source)) return 'incoming';
  return null;
}

function secureAndEnhanceImages(root, projectPath) {
  let imageIndex = 0;
  Array.from(root.querySelectorAll('img')).forEach((image) => {
    const sourceType = classifyImageSource(image, projectPath);
    if (sourceType === 'incoming') {
      image.dataset.incomingImageMarker = image.getAttribute('src');
      image.removeAttribute('src');
    } else if (!sourceType) {
      image.removeAttribute('src');
    }

    if (sourceType === 'icon') {
      image.classList.add('preview-lib-icon');
      return;
    }

    const widthMatch = IMAGE_WIDTH_PATTERN.exec(image.getAttribute('title') || '');
    if (widthMatch) {
      image.removeAttribute('title');
      image.style.width = `${widthMatch[1]}%`;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'img-size-wrap';
    wrapper.dataset.imgIndex = String(imageIndex++);
    image.replaceWith(wrapper);
    wrapper.append(image);

    const controls = document.createElement('span');
    controls.className = 'img-size-buttons';
    [25, 50, 75, 100].forEach((percent) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.imgPct = String(percent);
      button.textContent = `${percent}%`;
      controls.append(button);
    });
    wrapper.append(controls);
  });
}

function enhanceCodeBlocks(root) {
  root.querySelectorAll('.code-block').forEach((block) => {
    block.querySelectorAll('.copy-btn').forEach((element) => element.remove());
    if (!block.querySelector('pre > code')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.dataset.copyBtn = '';
    button.textContent = 'Kopieren';
    const language = block.querySelector(':scope > .lang');
    if (language) language.after(button);
    else block.prepend(button);
  });
}

function enhanceTables(root) {
  root.querySelectorAll('table').forEach((table, index) => {
    table.dataset.tableIndex = String(index);
    table.title = 'Doppelklick zum Bearbeiten';
  });
}

export function sanitizePreviewHtml(html, options = {}) {
  const fragment = DOMPurify.sanitize(String(html || ''), BASE_SANITIZE_CONFIG);
  restoreMath(fragment, options.mathStore || []);
  restoreWikiLinks(fragment, options.wikiStore || []);
  restoreTaskCheckboxes(fragment, options.taskCheckboxCount || 0);
  secureLinks(fragment);
  enhanceCodeBlocks(fragment);
  enhanceTables(fragment);
  secureAndEnhanceImages(fragment, options.projectPath);

  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content';
  wrapper.append(fragment);
  return wrapper.outerHTML;
}
