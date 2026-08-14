// Sky dome textures. The preload writes SKY_SENTINEL_ID into the map config's
// skyDomeTexA, and index.ts redirects the resulting user-asset request to a local file.

import { existsSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { SKY_SENTINEL_ID } from './config-defaults';

export const SKIES_DIR = 'skies';

// No .gif — this is a WebGL texture, not a CSS background (cf. css-themes.ts).
export const SKY_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const IMAGE_EXTS = new Set(SKY_IMAGE_EXTS.map((e) => `.${e}`));

// Depending on the map, the dome asks for the base texture, the emissive variant
// (texture_e.png), or both — serve the same image for either. The ?build= query is ignored.
export const SKY_TEXTURE_RE = new RegExp(`user-assets\\.krunker\\.io/${SKY_SENTINEL_ID}/texture(_e)?\\.png`);

interface SkyImageEntry {
  id: string;
  label: string;
}

export function listSkyImages(swapDir: string): SkyImageEntry[] {
  const entries: SkyImageEntry[] = [{ id: 'disabled', label: 'Disabled (Gradient)' }];
  try {
    for (const file of readdirSync(join(swapDir, SKIES_DIR))) {
      if (IMAGE_EXTS.has(extname(file).toLowerCase())) {
        entries.push({ id: `swap:${file}`, label: file });
      }
    }
  } catch { /* skies dir doesn't exist yet — that's fine */ }
  return entries;
}

/** Absolute path of the selected sky image, or null when none applies. */
export function resolveSkyImage(skyImage: string, swapDir: string): string | null {
  if (!skyImage || !skyImage.startsWith('swap:')) return null;
  const filename = basename(skyImage.slice(5)); // clamps traversal to a bare filename
  // Also rejects '.' and '..', whose extname is '' — keep this after basename().
  if (!IMAGE_EXTS.has(extname(filename).toLowerCase())) return null;
  const path = join(swapDir, SKIES_DIR, filename);
  return existsSync(path) ? path : null;
}
