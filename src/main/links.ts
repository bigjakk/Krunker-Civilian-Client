import { shell, WebContents } from 'electron';

export function isKrunkerHost(hostname: string): boolean {
  return hostname === 'krunker.io' || hostname.endsWith('.krunker.io');
}

// Only krunker.io itself gets the game window, tabs and the preload bridge; subdomains also serve user uploads.
export function isKrunkerPage(url: string): boolean {
  try {
    return new URL(url).origin === 'https://krunker.io';
  } catch {
    return false;
  }
}

export function isGameURL(url: string): boolean {
  return isKrunkerPage(url) && new URL(url).pathname === '/';
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
