// Escape-first renderer for the markdown subset used in GitHub release notes
// (headers, bullets, bold/italic, links). Shared by the in-game changelog
// popup and the startup splash.

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]);
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return escapeHtml(url);
  } catch { /* invalid URL */ }
  return '#';
}

// links: false renders link text without an anchor — for surfaces that block
// navigation (the splash).
export function renderMarkdown(md: string, opts?: { links?: boolean }): string {
  const escaped = escapeHtml(md.replace(/\r\n?/g, '\n'));
  let html = escaped
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/# (.+)/g, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = (opts?.links ?? true)
    ? html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${sanitizeUrl(url)}" target="_blank">${text}</a>`)
    : html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  const lines = html.split('\n');
  let inList = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + line.trimStart().slice(2) + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line);
    }
  }
  if (inList) out.push('</ul>');

  // Newlines touching block elements are dropped (their margins provide the
  // spacing); only text-to-text newlines become <br>.
  return out.join('\n')
    .replace(/\n+(?=<(?:h[123]|ul|li)>)/g, '')
    .replace(/(<\/(?:h[123]|ul|li)>)\n+/g, '$1')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
