import { get as httpsGet } from 'https';
import { createWriteStream, renameSync, unlinkSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import { electronLog } from './logger';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  fileSize: number;
}

export type ProgressCallback = (percent: number) => void;

const UPDATE_CONFIG = {
  checkUrl: 'https://api.github.com/repos/bigjakk/Krunker-Civilian-Client/releases/latest',
  assetPattern: /Setup\.exe$/i,
  allowedHosts: ['github.com', 'api.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'],
};

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

export function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  return new Promise((resolve) => {
    electronLog.log('[KCC-Update] Checking for updates at:', UPDATE_CONFIG.checkUrl);
    electronLog.log('[KCC-Update] Current version:', currentVersion);

    const req = httpsGet(UPDATE_CONFIG.checkUrl, {
      headers: { 'User-Agent': 'KrunkerCivilianClient/' + currentVersion },
    }, (res) => {
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
        httpsGet(redirectUrl, {
          headers: { 'User-Agent': 'KrunkerCivilianClient/' + currentVersion },
        }, (redirectRes) => {
          electronLog.log('[KCC-Update] Redirect response status:', redirectRes.statusCode);
          handleResponse(redirectRes);
        }).on('error', (err) => {
          electronLog.error('[KCC-Update] Redirect error:', err);
          resolve(null);
        });
        return;
      }
      handleResponse(res);
    });

    function handleResponse(res: import('http').IncomingMessage): void {
      if (res.statusCode !== 200) {
        electronLog.error('[KCC-Update] Check returned status', res.statusCode);
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const tagName: string = release.tag_name || '';
          const remoteVersion = tagName.replace(/^v/i, '');
          electronLog.log('[KCC-Update] Latest release:', remoteVersion, '| Current:', currentVersion);

          if (!remoteVersion || !versionLessThan(currentVersion, remoteVersion)) {
            electronLog.log('[KCC-Update] Already up to date');
            resolve(null);
            return;
          }

          const assets: Array<{ name: string; browser_download_url: string; size: number }> = release.assets || [];
          const setupAsset = assets.find((a) => UPDATE_CONFIG.assetPattern.test(a.name));
          if (!setupAsset) {
            electronLog.error('[KCC-Update] No Setup.exe asset found in release', remoteVersion);
            resolve(null);
            return;
          }

          // Validate the download URL points to an allowed host
          if (!isAllowedRedirect(setupAsset.browser_download_url)) {
            electronLog.error('[KCC-Update] Download URL points to untrusted host:', setupAsset.browser_download_url);
            resolve(null);
            return;
          }

          electronLog.log('[KCC-Update] Update available:', remoteVersion, '| Download:', setupAsset.browser_download_url, '| Size:', setupAsset.size);
          resolve({
            version: remoteVersion,
            downloadUrl: setupAsset.browser_download_url,
            fileSize: setupAsset.size,
          });
        } catch (err) {
          electronLog.error('[KCC-Update] Failed to parse release data:', err);
          resolve(null);
        }
      });
      res.on('error', (err) => {
        electronLog.error('[KCC-Update] Response error:', err);
        resolve(null);
      });
    }

    req.setTimeout(CHECK_TIMEOUT_MS, () => {
      electronLog.error('[KCC-Update] Check timed out after', CHECK_TIMEOUT_MS, 'ms');
      req.destroy();
      resolve(null);
    });

    req.on('error', (err) => {
      electronLog.error('[KCC-Update] Check error:', err);
      resolve(null);
    });
  });
}

export function downloadUpdate(url: string, destPath: string, onProgress: ProgressCallback): Promise<void> {
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
          file.close(() => {
            try {
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
