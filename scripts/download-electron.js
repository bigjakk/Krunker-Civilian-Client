'use strict';

/**
 * Downloads the patched Electron build and extracts it into node_modules/electron/dist/.
 *
 * The patched Electron fixes input starvation ("aim freeze") when --disable-frame-rate-limit
 * is active on modern Chromium. Without this, uncapped FPS causes 50-300ms input delays.
 *
 * The zip is hosted as a release asset on the same Gitea repo. The script checks the
 * local version file to skip re-downloading if already present.
 *
 * Usage:
 *   node scripts/download-electron.js            # download if needed
 *   node scripts/download-electron.js --force     # re-download even if present
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Configuration ──────────────────────────────────────────────────────────
const ELECTRON_VERSION = '42.0.0-nightly.20260227';
const ASSET_NAME = 'electron-v42.0.0-nightly-patched-win32-x64.zip';
const GITEA_BASE = 'https://gitea.crjlab.net';
const REPO = 'bigjakk/Krunker-Civilian-Client';
// The release tag that holds the patched Electron zip.
// Upload the zip as an asset to this release on Gitea.
const RELEASE_TAG = 'electron-patched';

// On Windows, overwrite the npm-installed Electron with our patched build.
// On Linux/macOS (CI cross-compilation), extract to a separate dist-win/ directory
// so the npm-installed platform-native Electron stays in dist/ for bytenode compilation.
const IS_WIN = process.platform === 'win32';
const ELECTRON_DIST = IS_WIN
    ? path.resolve(__dirname, '..', 'node_modules', 'electron', 'dist')
    : path.resolve(__dirname, '..', 'node_modules', 'electron', 'dist-win');
const VERSION_FILE = path.join(ELECTRON_DIST, 'version');
// Separate marker file to distinguish patched from stock electron-nightly.
// Both have the same version string, so VERSION_FILE alone is not sufficient.
const PATCHED_MARKER = path.join(ELECTRON_DIST, '.patched');
const TEMP_ZIP = path.join(ELECTRON_DIST, '..', '_electron-patched.zip');

// ── Helpers ────────────────────────────────────────────────────────────────

function get(url) {
    const lib = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        lib.get(url, { headers: { 'User-Agent': 'KCC-Build' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                get(res.headers.location).then(resolve, reject);
                res.resume();
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            resolve(res);
        }).on('error', reject);
    });
}

function downloadToFile(url, dest) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await get(url);
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let downloaded = 0;

            const file = fs.createWriteStream(dest);
            res.on('data', (chunk) => {
                downloaded += chunk.length;
                if (total > 0) {
                    const pct = ((downloaded / total) * 100).toFixed(1);
                    const mb = (downloaded / 1048576).toFixed(1);
                    const totalMb = (total / 1048576).toFixed(1);
                    process.stdout.write(`\r  Downloading: ${pct}% (${mb}/${totalMb} MB)`);
                }
            });
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                process.stdout.write('\n');
                resolve();
            });
            file.on('error', (err) => {
                fs.unlinkSync(dest);
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

async function getAssetUrl() {
    const apiUrl = `${GITEA_BASE}/api/v1/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
    const res = await get(apiUrl);
    const body = await new Promise((resolve, reject) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
    });

    const release = JSON.parse(body);
    const asset = release.assets.find((a) => a.name === ASSET_NAME);
    if (!asset) {
        const names = release.assets.map((a) => a.name).join(', ');
        throw new Error(
            `Asset "${ASSET_NAME}" not found in release "${RELEASE_TAG}".\n` +
            `  Available assets: ${names || '(none)'}\n` +
            `  Upload the patched Electron zip to: ${GITEA_BASE}/${REPO}/releases/tag/${RELEASE_TAG}`
        );
    }

    // Gitea API returns browser_download_url for direct download
    return asset.browser_download_url;
}

function extractZip(zipPath, destDir) {
    // Use PowerShell on Windows, unzip on Linux/macOS
    if (process.platform === 'win32') {
        execSync(
            `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`,
            { stdio: 'inherit' }
        );
    } else {
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
    }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    const force = process.argv.includes('--force');

    // Check if patched version is already installed.
    // The .patched marker distinguishes our build from stock electron-nightly
    // (both share the same version string).
    if (!force && fs.existsSync(PATCHED_MARKER)) {
        const installed = fs.readFileSync(PATCHED_MARKER, 'utf8').trim();
        if (installed === ELECTRON_VERSION) {
            console.log(`  Patched Electron ${ELECTRON_VERSION} already installed, skipping`);
            console.log('  (use --force to re-download)');
            return;
        }
        console.log(`  Installed: ${installed}, need: ${ELECTRON_VERSION}`);
    }

    // Resolve download URL from Gitea release
    console.log(`  Fetching release info for "${RELEASE_TAG}"...`);
    const url = await getAssetUrl();
    console.log(`  Asset URL: ${url}`);

    // Download
    await downloadToFile(url, TEMP_ZIP);
    const zipSize = (fs.statSync(TEMP_ZIP).size / 1048576).toFixed(1);
    console.log(`  Downloaded: ${zipSize} MB`);

    // Clear existing target dir and extract
    console.log(`  Extracting to ${path.relative(path.resolve(__dirname, '..'), ELECTRON_DIST)}/...`);
    if (fs.existsSync(ELECTRON_DIST)) {
        fs.rmSync(ELECTRON_DIST, { recursive: true, force: true });
    }
    fs.mkdirSync(ELECTRON_DIST, { recursive: true });
    extractZip(TEMP_ZIP, ELECTRON_DIST);

    // Clean up temp zip
    fs.unlinkSync(TEMP_ZIP);

    // Write path.txt so the electron package's lazy downloader (index.js)
    // considers the binary already installed and doesn't re-download stock.
    // On non-Windows (CI cross-compilation), skip this so electron-nightly still
    // downloads the native Linux binary into dist/ for the Linux build target.
    if (IS_WIN) {
        fs.writeFileSync(path.join(ELECTRON_DIST, '..', 'path.txt'), 'electron.exe');
    }

    // Write marker and verify
    if (fs.existsSync(VERSION_FILE)) {
        const ver = fs.readFileSync(VERSION_FILE, 'utf8').trim();
        fs.writeFileSync(PATCHED_MARKER, ver);
        console.log(`  Installed patched Electron ${ver}`);
    } else {
        console.log('  Warning: version file not found after extraction');
    }
}

console.log('[KCC] Setting up patched Electron...');
main().then(() => {
    console.log('[KCC] Patched Electron ready.');
}).catch((err) => {
    console.error('[KCC] Electron download failed:', err.message);
    console.error('');
    console.error('  If this is your first time building, you need the patched Electron zip');
    console.error(`  uploaded as a release asset on ${GITEA_BASE}/${REPO}`);
    console.error('');
    console.error('  1. Go to: ' + GITEA_BASE + '/' + REPO + '/releases/new');
    console.error(`  2. Create a release with tag: ${RELEASE_TAG}`);
    console.error(`  3. Upload: ${ASSET_NAME}`);
    console.error('');
    console.error('  See electron-build/BUILD.md for how to build Electron from source.');
    process.exit(1);
});
