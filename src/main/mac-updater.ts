import { app, autoUpdater, dialog, shell } from 'electron';
import { randomBytes } from 'crypto';
import { accessSync, constants as fsConstants, createReadStream, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { dirname, join } from 'path';
import { pipeline } from 'stream';
import { config, DEFAULT_CONFIG } from './config';
import { electronLog } from './logger';
import { getSplash, splashAlive, splashPrompt, splashStatus } from './splash';
import { checkForUpdate, checkForUpdateNotice, downloadUpdate, RELEASES_URL } from './updater';

// macOS self-update. The app downloads the release's zip of the app itself (progress bar
// and a SHA-256 check against GitHub's digest, through the same downloadUpdate as Windows
// and Linux), then hands it to Electron's built-in autoUpdater (Squirrel.Mac) through a
// one-off feed on 127.0.0.1. Squirrel refuses the bundle unless it satisfies this app's
// own designated requirement (our bundle ID and Developer ID team), and its ShipIt helper
// swaps the bundle once we quit, then relaunches it. dist-mac.sh builds the zip next to
// the DMG. Copies that can't replace their own bundle keep the download notice in index.ts.
//
// Don't add ElectronSquirrelPreventDowngrades to Info.plist while we ship Electron 43:
// its Squirrel.Mac rejects every version string (fixed upstream in Squirrel.Mac #314),
// so every update fails with "not a valid version string". Until then only the release's
// version label is checked, not the app inside the zip: a release that shipped an older,
// validly signed build would install. Re-enable the key once we ship Electron 44+.

const TEMP_PREFIX = 'kcc-mac-update-';

// Records the version we restarted from. A next launch still on that version means ShipIt
// didn't install the update (any other version means it did, or the user installed one).
function attemptFile(): string {
  return join(app.getPath('userData'), 'mac-update-attempt');
}

/** Reads and clears the attempt record; null when there is none or it's unreadable. */
function takeAttempt(): { from: string; to: string } | null {
  let raw: string;
  try { raw = readFileSync(attemptFile(), 'utf8'); } catch { return null; }
  try { rmSync(attemptFile(), { force: true }); } catch { /* best effort */ }
  try {
    const attempt = JSON.parse(raw);
    return typeof attempt?.from === 'string' && typeof attempt?.to === 'string' ? attempt : null;
  } catch {
    return null;
  }
}

/**
 * Whether this copy can replace its own bundle. False (download notice instead) outside
 * an .app, when running translocated or from the DMG, or when the bundle or the folder
 * holding it isn't writable (another admin or a pkg/MDM installed it): Squirrel would
 * fail there, or ask for an admin password and run its installer as root.
 */
export function macCanSelfUpdate(): boolean {
  if (process.platform !== 'darwin' || !app.isPackaged) return false;
  const bundle = process.execPath.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/)?.[1];
  if (!bundle || bundle.includes('/AppTranslocation/')) {
    electronLog.log('[KCC-Update] Not an installed app bundle, using the download notice:', process.execPath);
    return false;
  }
  try {
    accessSync(bundle, fsConstants.W_OK);
    accessSync(dirname(bundle), fsConstants.W_OK);
    return true;
  } catch {
    electronLog.log('[KCC-Update] Can\'t write', bundle, 'or its folder, using the download notice');
    return false;
  }
}

/** Startup update check for macOS. Resolves 'quit' when the app is restarting into an update or quitting. */
export async function runMacSelfUpdate(appVersion: string): Promise<'quit' | 'continue'> {
  // A second instance that lost the single-instance lock still gets 'ready' before its
  // queued quit runs; it must not delete the running instance's download or marker.
  if (!app.hasSingleInstanceLock()) return 'quit';
  try {
    removeStaleDownloads();
    const attempt = takeAttempt();
    if (attempt?.from === appVersion) {
      electronLog.error(`[KCC-Update] v${attempt.to} was downloaded but not installed; see ~/Library/Caches/com.krunkercivilian.client.ShipIt`);
      return await showUpdateFailed(attempt.to, 'macOS did not finish installing it.');
    }

    electronLog.log('[KCC] Checking for updates (macOS self-update)...');
    splashStatus('Checking for updates...', -1);
    const notice = await checkForUpdateNotice(appVersion);
    if (!splashAlive()) return 'quit'; // user closed the splash — app is quitting
    if (!notice) {
      electronLog.log('[KCC] No updates available');
      return 'continue';
    }
    if (notice.version === (config.get('ui')?.skippedUpdateVersion || '')) {
      electronLog.log(`[KCC] Update v${notice.version} available but skipped by user preference`);
      return 'continue';
    }

    electronLog.log(`[KCC] Update available: v${notice.version}`);
    const choice = await splashPrompt('install', notice.version, appVersion, notice.notes);
    if (choice === 'closed') return 'quit';
    if (choice !== 'primary') {
      electronLog.log('[KCC] User skipped update');
      if (choice === 'secondary-skip') {
        config.set('ui', { ...DEFAULT_CONFIG.ui, ...config.get('ui'), skippedUpdateVersion: notice.version });
      }
      return 'continue';
    }

    // The release's app zip, with its size and GitHub's SHA-256. Fetched only now, so an
    // up-to-date launch makes one API call.
    splashStatus('Downloading update... 0%', 0);
    const update = await checkForUpdate(appVersion);
    if (!splashAlive()) return 'quit';
    if (!update) {
      return await showUpdateFailed(notice.version, 'Its macOS update file is missing from the release, or GitHub couldn\'t be reached.');
    }

    const work = mkdtempSync(join(app.getPath('temp'), TEMP_PREFIX));
    try {
      const zip = join(work, 'update.zip');
      await downloadUpdate(update.downloadUrl, zip, (pct) => {
        // At 100% the bytes are down but downloadUpdate is still hashing the file.
        splashStatus(pct >= 100 ? 'Verifying download...' : `Downloading update... ${pct}%`, pct >= 100 ? -1 : pct);
      }, update.sha256);
      // Closing the splash mid-download is the cancel path (the app quits with it).
      if (!splashAlive()) return 'quit';
      splashStatus('Preparing update...', -1);
      await installWithSquirrel(zip, update.version);
      if (!splashAlive()) return 'quit';
    } catch (err) {
      electronLog.error('[KCC-Update] macOS update failed:', err);
      return await showUpdateFailed(update.version, (err as Error).message || String(err));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }

    splashStatus('Installing update...', -1);
    // Best effort: ShipIt is already queued to install at quit, so never let this block it.
    try {
      writeFileSync(attemptFile(), JSON.stringify({ from: appVersion, to: update.version }));
    } catch (err) {
      electronLog.warn('[KCC-Update] Could not record the update attempt:', err);
    }
    electronLog.log(`[KCC-Update] v${update.version} downloaded and verified, restarting to install`);
    autoUpdater.quitAndInstall();
    return 'quit';
  } catch (err) {
    electronLog.error('[KCC] macOS update check failed:', err);
    return 'continue';
  }
}

// Hands the verified zip to Squirrel through a one-release JSON feed served on 127.0.0.1
// (random port and path, closed as soon as Squirrel is done). Resolves once Squirrel has
// unpacked it and checked its signature against ours.
async function installWithSquirrel(zipPath: string, version: string): Promise<void> {
  const token = randomBytes(16).toString('hex');
  const size = statSync(zipPath).size;
  let base = '';
  const server = createServer((req, res) => {
    if (req.url === `/${token}/feed.json`) {
      const updateTo = { version, name: version, url: `${base}/update.zip` };
      const body = JSON.stringify({ currentRelease: version, releases: [{ version, updateTo }] });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    } else if (req.url === `/${token}/update.zip`) {
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': size });
      // pipeline closes the file if Squirrel disconnects early, and ends the response on a read error.
      pipeline(createReadStream(zipPath), res, () => { /* nothing to clean up */ });
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${token}`;
  try {
    await squirrelUpdate(`${base}/feed.json`);
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

// Resolves once Squirrel has fetched the feed's zip, unpacked it and verified it against our signature.
function squirrelUpdate(feedUrl: string): Promise<void> {
  // An 'error' emitted with no listener throws in the main process, so keep one attached for good.
  if (autoUpdater.listenerCount('error') === 0) {
    autoUpdater.on('error', (err) => electronLog.error('[KCC-Update] Squirrel error:', err));
  }
  return new Promise((resolve, reject) => {
    const finish = (err?: Error): void => {
      autoUpdater.removeListener('update-downloaded', onDownloaded);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
      if (err) reject(err); else resolve();
    };
    const onDownloaded = (): void => finish();
    const onNotAvailable = (): void => finish(new Error('Squirrel found nothing newer to install.'));
    const onError = (err: Error): void => finish(err);
    autoUpdater.on('update-downloaded', onDownloaded);
    autoUpdater.on('update-not-available', onNotAvailable);
    autoUpdater.on('error', onError);
    try {
      autoUpdater.setFeedURL({ url: feedUrl, serverType: 'json' });
      autoUpdater.checkForUpdates();
    } catch (err) {
      finish(err as Error);
    }
  });
}

// A download cut off by a quit or crash leaves its temp folder behind.
function removeStaleDownloads(): void {
  const tmp = app.getPath('temp');
  try {
    for (const name of readdirSync(tmp)) {
      if (name.startsWith(TEMP_PREFIX)) rmSync(join(tmp, name), { recursive: true, force: true });
    }
  } catch { /* best effort */ }
}

async function showUpdateFailed(version: string, detail: string): Promise<'quit' | 'continue'> {
  const splashWin = getSplash();
  if (!splashWin) return 'quit'; // splash gone — app is quitting
  splashStatus('Update failed');
  const { response } = await dialog.showMessageBox(splashWin, {
    type: 'error',
    title: 'Update failed',
    message: `The update to v${version} could not be installed.`,
    detail: `${detail}\n\nYou can download it manually from the releases page — the current version keeps working in the meantime.`,
    buttons: ['Open Releases Page', 'Continue'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) await shell.openExternal(RELEASES_URL).catch(() => { });
  return 'continue';
}
