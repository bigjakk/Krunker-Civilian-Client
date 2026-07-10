import { get as httpsGet } from 'https';
import { createReadStream, createWriteStream, renameSync, unlinkSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { join } from 'path';
import { app } from 'electron';
import { electronLog } from './logger';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  fileSize: number;
  sha256: string;
}

/** Lightweight "an update exists" result for builds that can't self-install (portable, AppImage). */
export interface UpdateNotice {
  version: string;
  /** Link to the release page, where the user can pick the download for their platform. */
  releaseUrl: string;
}

export type ProgressCallback = (percent: number) => void;

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  digest: string;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  assets: GithubAsset[];
}

const UPDATE_CONFIG = {
  checkUrl: 'https://api.github.com/repos/bigjakk/Krunker-Civilian-Client/releases/latest',
  releasesUrl: 'https://github.com/bigjakk/Krunker-Civilian-Client/releases/latest',
  allowedHosts: ['github.com', 'githubusercontent.com'],
};

// The release asset to self-install, per platform. Windows = NSIS installer,
// macOS = the signed + notarized arm64 DMG. Linux self-installs via the notice path.
function updateAssetPattern(): RegExp {
  if (process.platform === 'win32') return /Setup\.exe$/i;
  if (process.platform === 'darwin') return /mac-arm64\.dmg$/i;
  return /$^/; // matches nothing
}

// Team ID of our Developer ID Application cert — the macOS auto-updater refuses to
// install any downloaded build not signed by this team.
const APPLE_TEAM_ID = 'K3L8M9BR93';

// A release version must be a plain version token: it flows into a filesystem path
// (the downloaded installer's name) and into the update dialog's HTML, so reject
// anything carrying path separators, HTML metacharacters, or whitespace.
function isSafeVersion(v: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(v);
}

const CHECK_TIMEOUT_MS = 10000;
const DOWNLOAD_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Validate that a redirect URL stays on an allowed host.
 */
function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return UPDATE_CONFIG.allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/**
 * Simple semver comparison: returns true if a < b.
 * Handles versions like "0.1.0", "1.2.3".
 */
function versionLessThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return true;
    if (na > nb) return false;
  }
  return false;
}

/**
 * Fetch and parse the latest GitHub release. Follows redirects (validated against
 * allowed hosts) and resolves null on any error, timeout, or non-200 status.
 */
function fetchLatestRelease(currentVersion: string): Promise<GithubRelease | null> {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'KrunkerCivilianClient/' + currentVersion };

    function doGet(url: string, redirectCount: number): void {
      if (redirectCount > 5) {
        electronLog.error('[KCC-Update] Too many redirects during check');
        resolve(null);
        return;
      }

      const req = httpsGet(url, { headers }, (res) => {
        electronLog.log('[KCC-Update] Check response status:', res.statusCode);
        // Follow redirects (with domain validation)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location;
          electronLog.log('[KCC-Update] Redirected to:', redirectUrl);
          if (!isAllowedRedirect(redirectUrl)) {
            electronLog.error('[KCC-Update] Redirect to untrusted host blocked:', redirectUrl);
            resolve(null);
            return;
          }
          res.resume(); // drain so the socket can be reused
          doGet(redirectUrl, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          electronLog.error('[KCC-Update] Check returned status', res.statusCode);
          resolve(null);
          return;
        }

        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as GithubRelease);
          } catch (err) {
            electronLog.error('[KCC-Update] Failed to parse release data:', err);
            resolve(null);
          }
        });
        res.on('error', (err) => {
          electronLog.error('[KCC-Update] Response error:', err);
          resolve(null);
        });
      });

      req.setTimeout(CHECK_TIMEOUT_MS, () => {
        electronLog.error('[KCC-Update] Check timed out after', CHECK_TIMEOUT_MS, 'ms');
        req.destroy();
        resolve(null);
      });

      req.on('error', (err) => {
        electronLog.error('[KCC-Update] Check error:', err);
        resolve(null);
      });
    }

    electronLog.log('[KCC-Update] Checking for updates at:', UPDATE_CONFIG.checkUrl);
    electronLog.log('[KCC-Update] Current version:', currentVersion);
    doGet(UPDATE_CONFIG.checkUrl, 0);
  });
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  const release = await fetchLatestRelease(currentVersion);
  if (!release) return null;

  const remoteVersion = (release.tag_name || '').replace(/^v/i, '');
  if (remoteVersion && !isSafeVersion(remoteVersion)) {
    electronLog.error('[KCC-Update] Rejecting release with unsafe version token:', remoteVersion);
    return null;
  }
  electronLog.log('[KCC-Update] Latest release:', remoteVersion, '| Current:', currentVersion);
  if (!remoteVersion || !versionLessThan(currentVersion, remoteVersion)) {
    electronLog.log('[KCC-Update] Already up to date');
    return null;
  }

  const pattern = updateAssetPattern();
  const setupAsset = (release.assets || []).find((a) => pattern.test(a.name));
  if (!setupAsset) {
    electronLog.error('[KCC-Update] No installable asset matching', String(pattern), 'in release', remoteVersion);
    return null;
  }

  // Validate the download URL points to an allowed host
  if (!isAllowedRedirect(setupAsset.browser_download_url)) {
    electronLog.error('[KCC-Update] Download URL points to untrusted host:', setupAsset.browser_download_url);
    return null;
  }

  // Extract SHA-256 digest from GitHub API (format: "sha256:<hex>")
  const sha256 = (setupAsset.digest || '').replace(/^sha256:/i, '');
  if (!sha256) {
    electronLog.error('[KCC-Update] No SHA-256 digest found for asset');
    return null;
  }

  electronLog.log('[KCC-Update] Update available:', remoteVersion, '| SHA-256:', sha256.substring(0, 16) + '...');
  return {
    version: remoteVersion,
    downloadUrl: setupAsset.browser_download_url,
    fileSize: setupAsset.size,
    sha256,
  };
}

/**
 * Check for a newer release without downloading anything — for builds that can't
 * self-install (portable, AppImage). Returns the new version plus a link to the
 * release page, where the user can pick the download for their platform.
 */
export async function checkForUpdateNotice(currentVersion: string): Promise<UpdateNotice | null> {
  const release = await fetchLatestRelease(currentVersion);
  if (!release) return null;

  const remoteVersion = (release.tag_name || '').replace(/^v/i, '');
  if (remoteVersion && !isSafeVersion(remoteVersion)) {
    electronLog.error('[KCC-Update] Rejecting release with unsafe version token:', remoteVersion);
    return null;
  }
  electronLog.log('[KCC-Update] Latest release:', remoteVersion, '| Current:', currentVersion);
  if (!remoteVersion || !versionLessThan(currentVersion, remoteVersion)) {
    electronLog.log('[KCC-Update] Already up to date');
    return null;
  }

  const releaseUrl = release.html_url || UPDATE_CONFIG.releasesUrl;
  // Final guard: never hand out a link to an untrusted host.
  if (!isAllowedRedirect(releaseUrl)) {
    electronLog.error('[KCC-Update] Notice URL points to untrusted host:', releaseUrl);
    return null;
  }

  electronLog.log('[KCC-Update] Update notice:', remoteVersion, '->', releaseUrl);
  return { version: remoteVersion, releaseUrl };
}

function verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const actual = hash.digest('hex');
      electronLog.log('[KCC-Update] SHA-256 expected:', expectedSha256);
      electronLog.log('[KCC-Update] SHA-256 actual:  ', actual);
      resolve(actual === expectedSha256);
    });
    stream.on('error', reject);
  });
}

export function downloadUpdate(url: string, destPath: string, onProgress: ProgressCallback, expectedSha256?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.tmp';

    function doDownload(downloadUrl: string, redirectCount = 0): void {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      electronLog.log('[KCC-Update] Downloading from:', downloadUrl);
      const req = httpsGet(downloadUrl, {
        headers: { 'User-Agent': 'KrunkerCivilianClient' },
      }, (res) => {
        // Follow redirects (with domain validation)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location;
          electronLog.log('[KCC-Update] Download redirected to:', redirectUrl);
          if (!isAllowedRedirect(redirectUrl)) {
            electronLog.error('[KCC-Update] Download redirect to untrusted host blocked:', redirectUrl);
            reject(new Error('Download redirect to untrusted host: ' + redirectUrl));
            return;
          }
          doDownload(redirectUrl, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          electronLog.error('[KCC-Update] Download returned status', res.statusCode, 'from:', downloadUrl);
          reject(new Error('Download returned status ' + res.statusCode));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;

        const file = createWriteStream(tmpPath);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            onProgress(Math.round(100 * received / total));
          }
        });
        res.pipe(file);

        file.on('finish', () => {
          file.close(async () => {
            try {
              if (expectedSha256) {
                const valid = await verifyChecksum(tmpPath, expectedSha256);
                if (!valid) {
                  electronLog.error('[KCC-Update] Checksum mismatch — file may be corrupted or tampered');
                  try { unlinkSync(tmpPath); } catch { /* ignore */ }
                  reject(new Error('SHA-256 checksum mismatch'));
                  return;
                }
                electronLog.log('[KCC-Update] Checksum verified');
              }
              if (existsSync(destPath)) unlinkSync(destPath);
              renameSync(tmpPath, destPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });

        file.on('error', (err) => {
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(err);
        });

        res.on('error', (err) => {
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(err);
        });
      });

      req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
        req.destroy();
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(new Error('Download timed out'));
      });

      req.on('error', (err) => {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(err);
      });
    }

    doDownload(url);
  });
}

export function installUpdate(installerPath: string): void {
  electronLog.log('[KCC-Update] Launching installer:', installerPath);
  const child = spawn(installerPath, [], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  app.quit();
}

/**
 * macOS in-place update from a downloaded DMG. Mounts it, then REFUSES to proceed
 * unless the app inside is validly signed by our Developer ID team — the security
 * gate that makes auto-installing downloaded code safe (a forged or tampered build
 * cannot satisfy an Apple-anchored requirement carrying our Team ID). Stages a copy,
 * then a detached helper waits for us to quit, swaps the bundle (move-aside so a
 * failed copy rolls back), and relaunches.
 */
export function installUpdateMac(dmgPath: string): void {
  const APP_NAME = 'Krunker Civilian Client.app';
  // "Apple-anchored, a Developer ID Application cert, carrying our Team ID." Apple will
  // not issue a cert with our OU to anyone else, so this is the trust anchor.
  const requirement = `anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${APPLE_TEAM_ID}"`;

  // Private 0700 working dir (mkdtemp) for the mount point, the staged copy, and the
  // swap helper — keeps them out of world-writable temp, and gives a deterministic
  // mount path so we never parse hdiutil output or trust an attacker-chosen volume name.
  const work = mkdtempSync(join(app.getPath('temp'), 'kcc-update-'));
  const mountPoint = join(work, 'mnt');
  const staged = join(work, APP_NAME);
  mkdirSync(mountPoint);

  try {
    execFileSync('hdiutil', ['attach', dmgPath, '-nobrowse', '-noverify', '-mountpoint', mountPoint], { stdio: 'pipe' });
    const newApp = join(mountPoint, APP_NAME);
    if (!existsSync(newApp)) throw new Error('[KCC-Update] no app bundle in update DMG');

    // ── Authenticity + integrity gate (offline-capable). Throws on any mismatch. ──
    execFileSync('codesign', ['--verify', '--deep', '--strict', '-R', '=' + requirement, newApp], { stdio: 'pipe' });
    electronLog.log(`[KCC-Update] update verified: Developer ID team ${APPLE_TEAM_ID}`);

    // Stage a copy inside the private dir so the DMG can be unmounted immediately.
    execFileSync('ditto', [newApp, staged]);
  } finally {
    try { execFileSync('hdiutil', ['detach', mountPoint, '-force', '-quiet']); } catch { /* best effort */ }
  }

  const installApp = process.execPath.replace(/\.app\/Contents\/MacOS\/[^/]+$/, '.app');

  // Helper reads its paths from argv ($1..$4) — never interpolated into the script
  // body — so odd characters in a path cannot break out. Waits (bounded ~20s) for our
  // PID to exit, swaps the bundle with rollback, relaunches, removes the private dir.
  const helper = join(work, 'swap.sh');
  writeFileSync(helper, [
    '#!/bin/sh',
    'STAGED="$1"; INSTALL="$2"; PID="$3"; WORK="$4"',
    'i=0; while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 100 ]; do sleep 0.2; i=$((i+1)); done',
    'if mv "$INSTALL" "$INSTALL.bak" 2>/dev/null; then',
    '  if /usr/bin/ditto "$STAGED" "$INSTALL"; then rm -rf "$INSTALL.bak"; else rm -rf "$INSTALL"; mv "$INSTALL.bak" "$INSTALL"; fi',
    'else',
    '  /usr/bin/ditto "$STAGED" "$INSTALL"',
    'fi',
    '/usr/bin/open "$INSTALL"',
    'rm -rf "$WORK"',
  ].join('\n'), { mode: 0o755 });

  electronLog.log('[KCC-Update] staged; helper will swap', installApp, 'after quit');
  spawn('/bin/sh', [helper, staged, installApp, String(process.pid), work], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}
