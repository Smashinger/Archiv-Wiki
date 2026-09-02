// Eigenständiger HTML-Export einer Notiz. Der Body muss aus dem zentralen
// DOMPurify-geschützten Markdown-Renderer stammen; Metadaten werden hier
// ausschließlich als Text in das Dokument eingesetzt.

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

const HLJS_EXPORT_CSS = `
  .hljs{ color:#24292e; }
  .hljs-comment,.hljs-quote{ color:#6a737d; font-style:italic; }
  .hljs-keyword,.hljs-selector-tag,.hljs-literal{ color:#d73a49; }
  .hljs-string,.hljs-attr,.hljs-template-tag{ color:#032f62; }
  .hljs-number,.hljs-literal{ color:#005cc5; }
  .hljs-title,.hljs-name,.hljs-built_in{ color:#6f42c1; }
  .hljs-type,.hljs-class .hljs-title{ color:#22863a; }
  .hljs-variable,.hljs-attribute{ color:#e36209; }
`;

export function buildStandaloneNoteHtml({ title, tags, category, sanitizedBodyHtml, katexCss = '' }) {
  const metaParts = [];
  if (category) metaParts.push(escapeHtml(category));
  const tagsHtml = tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join(' ');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: file:; font-src file:; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
  ${katexCss}
  ${HLJS_EXPORT_CSS}
  body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 24px; color:#1a1a1a; line-height:1.65; }
  h1{ font-size: 28px; margin: 0 0 6px; }
  .meta{ color:#666; font-size:13px; margin-bottom:26px; }
  .tag{ display:inline-block; background:#eee; border-radius:12px; padding:2px 10px; font-size:11px; margin-right:4px; }
  pre{ background:#f4f4f4; padding:12px; border-radius:6px; overflow-x:auto; }
  code{ background:#f4f4f4; padding:1px 5px; border-radius:4px; font-size:.9em; }
  pre code{ background:none; padding:0; }
  a{ color:#1a56db; }
  blockquote{ border-left:3px solid #ddd; margin-left:0; padding-left:16px; color:#555; }
  img{ max-width:100%; }
  table{ border-collapse:collapse; }
  th, td{ border:1px solid #ddd; padding:6px 10px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${metaParts.join(' · ')}${metaParts.length && tagsHtml ? ' · ' : ''}${tagsHtml}</div>
${sanitizedBodyHtml}
</body>
</html>`;
}
