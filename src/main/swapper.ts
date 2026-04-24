import { existsSync, mkdirSync, promises as fsp } from 'fs';
import { join } from 'path';
import { protocol, net, Session } from 'electron';

const PROTOCOL_NAME = 'kcc-swap';
const TARGET_DOMAIN = 'krunker.io';

/**
 * Convert a native file path to a proper kcc-swap:// URL.
 * Windows paths like C:\foo\bar become kcc-swap://C/foo/bar
 */
function filePathToSwapURL(filePath: string): string {
  const forwardSlash = filePath.replace(/\\/g, '/');
  // Windows drive letter: C:/foo → kcc-swap://C/foo
  const match = forwardSlash.match(/^([A-Za-z]):\/(.*)/);
  if (match) {
    return `${PROTOCOL_NAME}://${match[1]}/${match[2]}`;
  }
  // Unix absolute: /home/user/foo → kcc-swap:///home/user/foo
  return `${PROTOCOL_NAME}://${forwardSlash}`;
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

/**
 * Register the file protocol handler on the given session.
 * Must be called AFTER app.ready.
 */
export function registerSwapperFileProtocol(ses: Session): void {
  ses.protocol.handle(PROTOCOL_NAME, async (request) => {
    const url = new URL(request.url);
    // Reconstruct the file path from the URL
    // Windows: kcc-swap://C/foo/bar → C:/foo/bar
    // Unix:    kcc-swap:///home/foo  → /home/foo
    let filePath: string;
    if (url.hostname) {
      // Windows drive letter is the hostname
      filePath = `${url.hostname}:${url.pathname}`;
    } else {
      filePath = url.pathname;
    }
    try {
      return await net.fetch(`file://${filePath}`);
    } catch {
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

  constructor(swapDir: string) {
    this.swapDir = swapDir;
    if (!existsSync(this.swapDir)) mkdirSync(this.swapDir, { recursive: true });
    this.scanPromise = this.scanAsync('');
  }

  /** Wait for the async directory scan to complete */
  async waitForReady(): Promise<void> {
    await this.scanPromise;
    this.ready = true;
  }

  /** Rescan the swap directory to pick up added/removed/changed files */
  async rescan(): Promise<void> {
    this.swapFiles.clear();
    await this.scanAsync('');
    this.ready = true;
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
  private async scanAsync(prefix: string): Promise<void> {
    try {
      const entries = await fsp.readdir(join(this.swapDir, prefix), { withFileTypes: true });
      for (const dirent of entries) {
        const name = `${prefix}/${dirent.name}`;
        if (dirent.isDirectory()) {
          await this.scanAsync(name);
        } else {
          this.swapFiles.set(name, join(this.swapDir, name));
        }
      }
    } catch {
      console.error(`Failed to scan swap directory prefix: ${prefix}`);
    }
  }
}
