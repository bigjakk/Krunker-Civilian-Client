import { shell, WebContents } from 'electron';

export function isKrunkerHost(hostname: string): boolean {
  return hostname === 'krunker.io' || hostname.endsWith('.krunker.io');
}

// Only these origins get tabs and the preload bridge; other subdomains also serve user uploads.
const KRUNKER_PAGE_ORIGINS = new Set(['https://krunker.io', 'https://community.krunker.io']);

function parseURL(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isKrunkerPage(url: string): boolean {
  return KRUNKER_PAGE_ORIGINS.has(parseURL(url)?.origin ?? '');
}

export function isGameURL(url: string): boolean {
  const u = parseURL(url);
  return u?.origin === 'https://krunker.io' && u.pathname === '/';
}

export function safeOpenExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(url);
    }
  } catch { /* malformed URL — ignore */ }
}

// will-navigate doesn't fire for server redirects, so a Krunker link that redirects off-site needs its own check.
export function blockOffsiteRedirects(wc: WebContents): void {
  wc.on('will-redirect', (event) => {
    if (!event.isMainFrame || isKrunkerPage(event.url)) return;
    event.preventDefault();
    safeOpenExternal(event.url);
  });
}
