'use strict';

/**
 * Downloads patched Electron builds for Windows (v42) and Linux (v43).
 *
 * The patched Electron fixes input starvation ("aim freeze") when --disable-frame-rate-limit
 * is active on modern Chromium. Without this, uncapped FPS causes 50-300ms input delays.
 *
 * Platform behavior:
 *   Windows:        patched Win   → dist/       (replaces stock)
 *   Linux (local):  patched Linux → dist/       (replaces stock), Win → dist-win/
 *   CI (Linux):     Win → dist-win/, Linux → dist-linux/  (stock stays in dist/)
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
const GITHUB_BASE = 'https://github.com';
const REPO = 'bigjakk/Electron-Websocket-Fix';
const RELEASE_TAG = 'v1.0.0';

const PLATFORMS = {
    win32: { asset: 'electron-v42.0.0-nightly-release-patched-win32-x64.zip' },
    linux: { asset: 'electron-v43.0.0-nightly-release-patched-linux-x64.zip' },
};

const IS_WIN = process.platform === 'win32';
const IS_CI = !!process.env.CI;
const ELECTRON_BASE = path.resolve(__dirname, '..', 'node_modules', 'electron');

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

// ── Per-directory install ──────────────────────────────────────────────────

async function installTo(distDir, platform) {
    const force = process.argv.includes('--force');
    const patchedMarker = path.join(distDir, '.patched');
    const tempZip = path.join(ELECTRON_BASE, `_electron-patched-${platform.asset}`);
    const label = path.relative(path.resolve(__dirname, '..'), distDir);

    // Check if this exact asset is already installed.
    // The marker stores the asset filename to handle version changes.
    if (!force && fs.existsSync(patchedMarker)) {
        const installed = fs.readFileSync(patchedMarker, 'utf8').trim();
        if (installed === platform.asset) {
            console.log(`  [${label}] ${platform.asset} already installed, skipping`);
            return;
        }
        console.log(`  [${label}] Installed: ${installed}, need: ${platform.asset}`);
    }

    // Direct download from GitHub release
    const url = `${GITHUB_BASE}/${REPO}/releases/download/${RELEASE_TAG}/${platform.asset}`;
    console.log(`  [${label}] Asset URL: ${url}`);

    // Download
    await downloadToFile(url, tempZip);
    const zipSize = (fs.statSync(tempZip).size / 1048576).toFixed(1);
    console.log(`  [${label}] Downloaded: ${zipSize} MB`);

    // Clear existing target dir and extract
    console.log(`  [${label}] Extracting...`);
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });
    extractZip(tempZip, distDir);

    // Clean up temp zip
    fs.unlinkSync(tempZip);

    // Write marker with asset name for future skip-check
    fs.writeFileSync(patchedMarker, platform.asset);
    const versionFile = path.join(distDir, 'version');
    if (fs.existsSync(versionFile)) {
        const ver = fs.readFileSync(versionFile, 'utf8').trim();
        console.log(`  [${label}] Installed patched Electron ${ver}`);
    } else {
        console.log(`  [${label}] Installed ${platform.asset} (no version file)`);
    }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    if (IS_WIN) {
        // Windows local dev: patched Win → dist/ (replaces stock)
        await installTo(path.join(ELECTRON_BASE, 'dist'), PLATFORMS.win32);
    } else if (IS_CI) {
        // CI (Linux): keep stock in dist/ untouched,
        // patched Win → dist-win/, patched Linux → dist-linux/
        await installTo(path.join(ELECTRON_BASE, 'dist-win'), PLATFORMS.win32);
        await installTo(path.join(ELECTRON_BASE, 'dist-linux'), PLATFORMS.linux);
    } else {
        // Linux local dev: patched Linux → dist/ (for npm run dev),
        // patched Win → dist-win/ (for cross-compilation)
        await installTo(path.join(ELECTRON_BASE, 'dist'), PLATFORMS.linux);
        await installTo(path.join(ELECTRON_BASE, 'dist-win'), PLATFORMS.win32);
    }

    // Write path.txt so the electron package's lazy downloader (index.js)
    // considers the binary already installed and doesn't re-download stock.
    const platformExe = IS_WIN ? 'electron.exe' : 'electron';
    fs.writeFileSync(path.join(ELECTRON_BASE, 'path.txt'), platformExe);
}

console.log('[KCC] Setting up patched Electron...');
main().then(() => {
    console.log('[KCC] Patched Electron ready.');
    if (!IS_WIN) {
        console.log('  (use --force to re-download)');
    }
}).catch((err) => {
    console.error('[KCC] Electron download failed:', err.message);
    console.error('');
    console.error('  Download the patched Electron manually from:');
    console.error(`  ${GITHUB_BASE}/${REPO}/releases/tag/${RELEASE_TAG}`);
    console.error('');
    console.error(`  Win asset:   ${PLATFORMS.win32.asset}`);
    console.error(`  Linux asset: ${PLATFORMS.linux.asset}`);
    process.exit(1);
});
