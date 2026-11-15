// ── Squished text fix (Linux/macOS) ──
// GameFont's hhea metrics are shorter than its capitals; re-declare it with Windows' OS/2 win metrics and no fake bold.

import { savedConsole as _console } from './saved-console';

const STYLE_ID = 'kcc-font-metrics';
const FAMILY = 'gamefont';
// Themes stay after the fix, so their own GameFont still wins
const SKIP_SHEET_IDS = new Set([STYLE_ID, 'kcc-user-theme', 'kcc-social-theme']);
const SYNTHESIS_CSS = ':root { font-synthesis-weight: none; }';
export const FONT_FIX_SUPPORTED = process.platform === 'linux' || process.platform === 'darwin';
// Captured before Krunker or the sky hook wrap it
const nativeFetch = window.fetch.bind(window);

let generation = 0;

interface FontFaceHit { rule: CSSFontFaceRule; base: string; node: Element }

export function setFontMetricsFix(enabled: boolean): void {
  const gen = ++generation;
  document.getElementById(STYLE_ID)?.remove();
  if (!enabled || !FONT_FIX_SUPPORTED) return;

  const hit = findGameFontRule();
  if (!hit) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SYNTHESIS_CSS;
  hit.node.after(style);

  const src = absoluteUrls(hit.rule.style.getPropertyValue('src'), hit.base);
  const fontUrl = /url\("([^"]+)"\)/.exec(src)?.[1];
  if (!fontUrl) return;
  nativeFetch(fontUrl)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status} for ${fontUrl}`))))
    .then((buf) => {
      if (gen !== generation || !style.isConnected) return;
      const m = windowsLineMetrics(buf);
      if (!m) {
        _console.warn('[KCC] Font fix: not a TrueType/OpenType file:', fontUrl);
        return;
      }
      const overrides = `ascent-override: ${pct(m.ascent)}; descent-override: ${pct(m.descent)}; line-gap-override: ${pct(m.lineGap)};`;
      style.textContent = `@font-face { ${descriptors(hit.rule, src)} ${overrides} }\n${SYNTHESIS_CSS}`;
      _console.log('[KCC] Font fix: GameFont', overrides);
    })
    .catch((err) => _console.warn('[KCC] Font fix failed:', err));
}

function findGameFontRule(): FontFaceHit | null {
  const hits: FontFaceHit[] = [];
  const visit = (sheet: CSSStyleSheet, node: Element, depth: number): void => {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return; // cross-origin
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet && depth < 3) visit(rule.styleSheet, node, depth + 1);
      } else if (rule instanceof CSSFontFaceRule
        && rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase() === FAMILY) {
        hits.push({ rule, base: sheet.href || document.baseURI, node });
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    const node = sheet.ownerNode;
    if (node instanceof Element && !SKIP_SHEET_IDS.has(node.id)) visit(sheet, node, 0);
  }
  return hits[hits.length - 1] ?? null;
}

function descriptors(rule: CSSFontFaceRule, src: string): string {
  const s = rule.style;
  const out = [`font-family: ${s.getPropertyValue('font-family')};`, `src: ${src};`];
  for (let i = 0; i < s.length; i++) {
    const name = s.item(i);
    if (name !== 'font-family' && name !== 'src' && !name.endsWith('-override')) out.push(`${name}: ${s.getPropertyValue(name)};`);
  }
  return out.join(' ');
}

function absoluteUrls(value: string, base: string): string {
  return value.replace(/url\(\s*(["']?)(.*?)\1\s*\)/g, (whole, _quote: string, url: string) => {
    try {
      return `url(${JSON.stringify(new URL(url, base).href)})`;
    } catch {
      return whole;
    }
  });
}

// As DirectWrite reads them: typo metrics if USE_TYPO_METRICS, else usWin with GDI's line gap
function windowsLineMetrics(buf: ArrayBuffer): { ascent: number; descent: number; lineGap: number } | null {
  try {
    const v = new DataView(buf);
    const version = v.getUint32(0);
    // TTF/OTF only; WOFF is compressed
    if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;
    const tables = new Map<string, { offset: number; length: number }>();
    for (let i = 0, n = v.getUint16(4); i < n; i++) {
      const rec = 12 + 16 * i;
      const tag = String.fromCharCode(v.getUint8(rec), v.getUint8(rec + 1), v.getUint8(rec + 2), v.getUint8(rec + 3));
      tables.set(tag, { offset: v.getUint32(rec + 8), length: v.getUint32(rec + 12) });
    }
    const head = tables.get('head');
    const hhea = tables.get('hhea');
    const os2 = tables.get('OS/2');
    if (!head || !hhea || !os2 || os2.length < 78) return null;
    const upem = v.getUint16(head.offset + 18);
    if (!upem) return null;
    let ascent: number;
    let descent: number;
    let lineGap: number;
    if (v.getUint16(os2.offset + 62) & 0x80) {
      ascent = v.getInt16(os2.offset + 68);
      descent = -v.getInt16(os2.offset + 70);
      lineGap = v.getInt16(os2.offset + 72);
    } else {
      ascent = v.getUint16(os2.offset + 74);
      descent = v.getUint16(os2.offset + 76);
      const hheaHeight = v.getInt16(hhea.offset + 4) - v.getInt16(hhea.offset + 6);
      lineGap = v.getInt16(hhea.offset + 8) - (ascent + descent - hheaHeight);
    }
    return { ascent: ascent / upem, descent: descent / upem, lineGap: Math.max(0, lineGap) / upem };
  } catch {
    return null; // truncated file
  }
}

function pct(em: number): string {
  return `${+(em * 100).toFixed(3)}%`;
}
