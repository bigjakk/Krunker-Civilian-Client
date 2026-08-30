// ── Nuke counter overlay ──
// Career nuke total from the same gapi host trade-ding polls. The server only
// commits match stats at game end, so we refetch when the end screen appears.

import { savedConsole as _console } from './saved-console';

export interface NukeCounterConfig {
  enabled: boolean;
  goal: number;        // 0 = goal hidden
  background: boolean;
  scale: number;
  x: number;           // % of screen width
  y: number;           // % of screen height
}

const PLAYER_URL = 'https://gapi.svc.krunker.io/players/';
const TICK_MS = 2000;
const END_COMMIT_DELAY_MS = 5000;
const END_RECHECK_DELAY_MS = 15000;
const RETRY_MS = 30000;

const STYLE_ID = 'kcc-nuke-counter-css';
const EL_ID = 'kcc-nuke-counter';

const CSS = `
#${EL_ID} {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 26px;
  color: #fff;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}
#${EL_ID}.kcc-nuke-bg {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 6px;
  padding: 6px 14px;
}
#${EL_ID} .kcc-nuke-icon { color: #ffc107; font-size: 28px; line-height: 1; }
#${EL_ID} .kcc-nuke-goal { color: rgba(255, 255, 255, 0.6); }
#${EL_ID}.kcc-nuke-goal-met .kcc-nuke-count { color: #9eeb56; }
`;

let cfg: NukeCounterConfig | null = null;
let styleEl: HTMLStyleElement | null = null;
let overlayEl: HTMLElement | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let commitTimer: ReturnType<typeof setTimeout> | null = null;

let nukes: number | null = null;
let nukesFor = '';
let fetching = false;
let lastAttempt = 0;
let noStat = false;
let endWasVisible = false;

function myName(): string {
  try { return window.localStorage.getItem('krunker_username') || ''; } catch { return ''; }
}

function fmt(n: number): string { return n.toLocaleString('en-US'); }

function render(): void {
  if (!overlayEl || !cfg) return;
  const countEl = overlayEl.querySelector('.kcc-nuke-count') as HTMLElement | null;
  const goalEl = overlayEl.querySelector('.kcc-nuke-goal') as HTMLElement | null;
  if (countEl) countEl.textContent = nukes === null ? '—' : fmt(nukes);
  if (goalEl) {
    goalEl.style.display = cfg.goal > 0 ? '' : 'none';
    goalEl.textContent = '/ ' + fmt(cfg.goal);
  }
  overlayEl.classList.toggle('kcc-nuke-goal-met', cfg.goal > 0 && nukes !== null && nukes >= cfg.goal);
}

function refresh(): void {
  const name = myName();
  if (!name || fetching) return;
  fetching = true;
  lastAttempt = Date.now();
  window.fetch(PLAYER_URL + encodeURIComponent(name), { credentials: 'omit', signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: any) => {
      if (d) {
        const n = d.data?.player_stats?.n;
        if (typeof n === 'number') { nukes = n; noStat = false; }
        else noStat = true; // profile answered without a visible stat — stop idle retries
        nukesFor = name;
      }
      render();
    })
    .catch((err) => _console.log('[KCC-Nuke] fetch failed:', err))
    .finally(() => { fetching = false; });
}

function hostParent(): HTMLElement {
  return document.getElementById('inGameUI') || document.getElementById('uiBase') || document.body;
}

function applyConfig(): void {
  if (!overlayEl || !cfg) return;
  const x = Math.min(100, Math.max(0, Number(cfg.x) || 0));
  const y = Math.min(100, Math.max(0, Number(cfg.y) || 0));
  const s = Math.min(3, Math.max(0.25, Number(cfg.scale) || 1));
  overlayEl.style.left = x + '%';
  overlayEl.style.top = y + '%';
  overlayEl.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  overlayEl.classList.toggle('kcc-nuke-bg', !!cfg.background);
}

function inject(): void {
  if (!cfg) return;
  if (overlayEl && overlayEl.isConnected) return;
  if (overlayEl) overlayEl.remove();
  overlayEl = document.createElement('div');
  overlayEl.id = EL_ID;
  overlayEl.innerHTML =
    '<span class="kcc-nuke-icon">☢︎</span>' +
    '<span class="kcc-nuke-count">—</span>' +
    '<span class="kcc-nuke-goal"></span>';
  hostParent().appendChild(overlayEl);
  applyConfig();
  render();
}

// One interval drives reattachment, first-fetch retry, and end-screen detection.
// Polling (not MutationObserver) on purpose: observers on the main frame hang WebGL.
function onTick(): void {
  if (overlayEl && !overlayEl.isConnected) inject();
  if (myName() !== nukesFor && (nukes !== null || noStat)) {
    // account switched or logged out — drop the cached total
    nukes = null;
    noStat = false;
    lastAttempt = 0;
    render();
  }
  if (nukes === null && !noStat && Date.now() - lastAttempt > RETRY_MS) refresh();
  const endUI = document.getElementById('endUI');
  const visible = !!endUI && endUI.style.display !== 'none';
  if (visible && !endWasVisible && !commitTimer) {
    // Two refetches: the stat commit usually lands within 5s, but not always.
    commitTimer = setTimeout(() => {
      refresh();
      commitTimer = setTimeout(() => { commitTimer = null; refresh(); }, END_RECHECK_DELAY_MS);
    }, END_COMMIT_DELAY_MS);
  }
  endWasVisible = visible;
}

export function setNukeCounter(conf: NukeCounterConfig): void {
  if (!conf.enabled) { destroyNukeCounter(); return; }
  const justEnabled = !cfg;
  cfg = { ...conf };
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
  inject();
  applyConfig();
  render();
  if (!tick) tick = setInterval(onTick, TICK_MS);
  if (justEnabled) refresh();
}

export function destroyNukeCounter(): void {
  if (tick) { clearInterval(tick); tick = null; }
  if (commitTimer) { clearTimeout(commitTimer); commitTimer = null; }
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  if (styleEl) { styleEl.remove(); styleEl = null; }
  cfg = null;
  noStat = false;
  endWasVisible = false;
  // `nukes` is kept so re-enabling renders the cached total instead of a dash
}
