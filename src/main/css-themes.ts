// ── CSS theme & loading screen background management ──
// Scans swap directory for user CSS themes and loading screen backgrounds.

import { readdirSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';
import { electronLog } from './logger';

export interface ThemeEntry {
    id: string;
    label: string;
}

export interface LoadingThemeEntry {
    id: string;
    label: string;
}

export const GAME_THEMES_DIR = 'themes';
export const SOCIAL_THEMES_DIR = 'socialthemes';

export function listThemes(swapDir: string, subdir: string = GAME_THEMES_DIR): ThemeEntry[] {
    const entries: ThemeEntry[] = [{ id: 'disabled', label: 'Disabled' }];
    const themesDir = join(swapDir, subdir);
    try {
        const files = readdirSync(themesDir);
        for (const file of files) {
            if (extname(file).toLowerCase() === '.css') {
                entries.push({ id: `user:${file}`, label: basename(file, '.css') });
            }
        }
    } catch { /* themes dir doesn't exist yet — that's fine */ }
    return entries;
}

export function getThemeCSS(themeId: string, swapDir: string, subdir: string = GAME_THEMES_DIR): string {
    if (themeId === 'disabled' || !themeId) return '';
    const prefix = 'user:';
    if (!themeId.startsWith(prefix)) return '';
    const filename = basename(themeId.slice(prefix.length));
    if (!filename) return '';
    try {
        return readFileSync(join(swapDir, subdir, filename), 'utf-8');
    } catch (err) { electronLog.warn('[KCC] Failed to read theme ' + filename + ':', err); return ''; }
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

export function listLoadingThemes(swapDir: string): LoadingThemeEntry[] {
    const entries: LoadingThemeEntry[] = [
        { id: 'disabled', label: 'Disabled (Default)' },
        { id: 'swap:random', label: 'Random (from backgrounds/)' },
    ];
    const bgDir = join(swapDir, 'backgrounds');
    try {
        const files = readdirSync(bgDir);
        for (const file of files) {
            if (IMAGE_EXTS.has(extname(file).toLowerCase())) {
                entries.push({ id: `swap:${file}`, label: file });
            }
        }
    } catch { /* backgrounds dir doesn't exist yet */ }
    return entries;
}

function mimeFromExt(ext: string): string {
    switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
        return 'image/jpeg';
    case '.gif':
        return 'image/gif';
    case '.webp':
        return 'image/webp';
    default:
        return 'image/png';
    }
}

function getBackgroundFiles(swapDir: string): string[] {
    const bgDir = join(swapDir, 'backgrounds');
    try {
        return readdirSync(bgDir).filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()));
    } catch { return []; }
}

function fileToDataUri(filePath: string): string {
    const data = readFileSync(filePath);
    const mime = mimeFromExt(extname(filePath));
    return `data:${mime};base64,${data.toString('base64')}`;
}

export function getLoadingScreenCSS(loadingTheme: string, backgroundUrl: string, swapDir: string): string {
    let imageUrl = '';

    // Explicit URL takes priority
    if (backgroundUrl) {
        try {
            new URL(backgroundUrl);
            imageUrl = `url(${backgroundUrl})`;
        } catch { /* invalid URL — ignore */ }
    }

    if (!imageUrl && loadingTheme && loadingTheme !== 'disabled') {
        const bgDir = join(swapDir, 'backgrounds');
        if (loadingTheme === 'swap:random') {
            const files = getBackgroundFiles(swapDir);
            if (files.length > 0) {
                const pick = files[Math.floor(Math.random() * files.length)];
                try {
                    imageUrl = `url(${fileToDataUri(join(bgDir, pick))})`;
                } catch (err) { electronLog.warn('[KCC] Failed to read loading background:', err); }
            }
        } else if (loadingTheme.startsWith('swap:')) {
            const filename = basename(loadingTheme.slice(5));
            if (!filename) return '';
            try {
                imageUrl = `url(${fileToDataUri(join(bgDir, filename))})`;
            } catch (err) { electronLog.warn('[KCC] Failed to read loading background ' + filename + ':', err); }
        }
    }

    if (!imageUrl) return '';

    return `
#instructionHolder[style^="display: block"] {
    background-image: initial !important;
}
#instructionHolder {
    background-image: ${imageUrl} !important;
    background-size: cover !important;
    background-position: center !important;
}
#instructions {
    display: block;
    visibility: hidden;
}`;
}
