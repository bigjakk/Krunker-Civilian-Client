import { existsSync, mkdirSync, watch, promises as fsp } from 'fs';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { protocol, net, Session } from 'electron';
import { electronLog } from './logger';

const PROTOCOL_NAME = 'kcc-swap';
const TARGET_DOMAIN = 'krunker.io';

/**
 * Convert a native file path to a proper kcc-swap:// URL.
 * Windows paths like C:\foo\bar become kcc-swap://C/foo/bar
 */
export function filePathToSwapURL(filePath: string): string {
  const forwardSlash = filePath.replace(/\\/g, '/');
  // Per segment, so #, ?, and % in a file name survive the handler's decodeURIComponent
  const encode = (p: string): string => p.split('/').map(encodeURIComponent).join('/');
  // Windows drive letter: C:/foo → kcc-swap://C/foo
  const match = forwardSlash.match(/^([A-Za-z]):\/(.*)/);
  if (match) {
    return `${PROTOCOL_NAME}://${match[1]}/${encode(match[2])}`;
  }
  // Unix absolute: /home/user/foo → kcc-swap:///home/user/foo
  return `${PROTOCOL_NAME}://${encode(forwardSlash)}`;
}

/**
 * Register the custom protocol scheme. Must be called BEFORE app.ready.
 */
export function initSwapperProtocol(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: PROTOCOL_NAME,
    privileges: { standard: true, secure: true, corsEnabled: true, bypassCSP: true },
  }]);
}

/** Must be called AFTER app.ready. */
export function registerSwapperFileProtocol(ses: Session, swapDir: string): void {
  // Windows paths are case-insensitive, and a drive letter can reach us in either case
  const norm = (p: string): string => process.platform === 'win32' ? p.toLowerCase() : p;
  const root = norm(resolve(swapDir));
  ses.protocol.handle(PROTOCOL_NAME, async (request) => {
    const url = new URL(request.url);
    // Windows drive letter rides as the hostname: kcc-swap://C/foo → C:/foo
    const raw = url.hostname ? `${url.hostname}:${url.pathname}` : url.pathname;
    let filePath: string;
    try {
      filePath = resolve(decodeURIComponent(raw));
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    // The ACAO below makes these readable cross-origin, so anything outside the
    // swap dir would be an arbitrary local-file read for any script on the page.
    if (norm(filePath) !== root && !norm(filePath).startsWith(root + sep)) {
      electronLog.warn(`[KCC] Blocked swap request outside swap dir: ${filePath}`);
      return new Response('Forbidden', { status: 403 });
    }
    try {
      const res = await net.fetch(pathToFileURL(filePath).href);
      // WebGL texture uploads need a CORS-clean image; file:// carries no ACAO
      const headers = new Headers(res.headers);
      headers.set('access-control-allow-origin', '*');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch (err) {
      electronLog.warn(`[KCC] Swap file fetch failed for ${filePath}:`, err);
      return new Response('Not found', { status: 404 });
    }
  });
}

/**
 * Scans a local directory and intercepts matching Krunker asset requests,
 * redirecting them to local replacement files via a custom protocol.
 */
export class ResourceSwapper {
  private swapDir: string;
  private swapFiles = new Map<string, string>();
  private ready = false;
  private scanPromise: Promise<void>;
  private scanGen = 0;
  /** False when the folder watcher couldn't start or has stopped; callers then rescan on their own */
  watching = false;

  constructor(swapDir: string) {
    this.swapDir = swapDir;
    if (!existsSync(this.swapDir)) mkdirSync(this.swapDir, { recursive: true });
    this.scanPromise = this.buildMap().then((m) => { this.swapFiles = m; });
    // Krunker requests css/main_custom.css from the page head, before any on-navigation
    // rescan can finish — so keep the map current as files change instead
    let timer: NodeJS.Timeout | null = null;
    let changed = new Set<string>();
    let unknown = false;
    try {
      watch(this.swapDir, { recursive: true }, (_event, filename) => {
        if (filename) changed.add('/' + filename.toString().replace(/\\/g, '/'));
        else unknown = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const paths = changed;
          const all = unknown;
          changed = new Set();
          unknown = false;
          const before = all ? this.cssPaths() : [];
          this.rescan()
            .then(() => this.onFilesChange?.(all ? [...new Set([...before, ...this.cssPaths()])] : [...paths]))
            .catch((err) => electronLog.warn('[KCC] Swapper rescan failed:', err));
        }, 300);
      }).on('error', (err) => {
        this.watching = false;
        electronLog.warn('[KCC] Swap folder watcher stopped:', err);
      });
      this.watching = true;
    } catch (err) {
      electronLog.warn('[KCC] Swap folder watcher unavailable:', err);
    }
  }

  /** Wait for the async directory scan to complete */
  async waitForReady(): Promise<void> {
    await this.scanPromise;
    this.ready = true;
  }

  /** Called after a folder change with the changed paths, relative to the swap dir with a leading slash */
  onFilesChange: ((paths: string[]) => void) | null = null;

  cssPaths(): string[] {
    return [...this.swapFiles.keys()].filter((k) => k.toLowerCase().endsWith('.css'));
  }

  /** Rescan the swap directory to pick up added/removed/changed files */
  async rescan(): Promise<void> {
    // Overlapping rescans (watcher, navigation, Move It) — only the newest may install its map
    const gen = ++this.scanGen;
    const files = await this.buildMap();
    if (gen !== this.scanGen) return;
    this.swapFiles = files;
    this.ready = true;
  }

  private async buildMap(): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    await this.scanAsync('', files);
    return files;
  }

  /** URL filter patterns for webRequest.onBeforeRequest — single broad pattern */
  get patterns(): string[] {
    return this.swapFiles.size > 0 ? [`*://*.${TARGET_DOMAIN}/*`] : [];
  }

  /**
   * Returns a redirect URL if the request should be swapped, null otherwise.
   * Strips /assets/ prefix so both `assets.krunker.io/assets/textures/foo.png`
   * and `assets.krunker.io/textures/foo.png` resolve to the same local file.
   */
  getRedirect(url: string): string | null {
    if (!this.ready) return null;
    try {
      // Extract pathname from URL using string ops (faster than new URL())
      // URLs are like: https://assets.krunker.io/path/file.ext?v=hash
      const protoEnd = url.indexOf('//');
      if (protoEnd === -1) return null;
      const pathStart = url.indexOf('/', protoEnd + 2);
      if (pathStart === -1) return null;
      const queryStart = url.indexOf('?', pathStart);
      let pathname = queryStart === -1 ? url.substring(pathStart) : url.substring(pathStart, queryStart);
      if (pathname.startsWith('/assets/')) pathname = pathname.substring(7);
      const localPath = this.swapFiles.get(pathname);
      if (localPath) return filePathToSwapURL(localPath);
    } catch { /* malformed URL — ignore */ }
    return null;
  }

  /** Recursively scan the swap directory and build the file map (async) */
  private async scanAsync(prefix: string, files: Map<string, string>): Promise<void> {
    try {
      const entries = await fsp.readdir(join(this.swapDir, prefix), { withFileTypes: true });
      for (const dirent of entries) {
        const name = `${prefix}/${dirent.name}`;
        if (dirent.isDirectory()) {
          await this.scanAsync(name, files);
        } else {
          files.set(name, join(this.swapDir, name));
        }
      }
    } catch (err) {
      electronLog.error(`[KCC] Failed to scan swap directory prefix: ${prefix}`, err);
    }
  }
}
