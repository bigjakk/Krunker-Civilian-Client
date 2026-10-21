// ── Stat counter overlay ── career totals from the public profile plus what the current match adds live

import { ipcRenderer } from 'electron';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import type { AppConfig } from '../main/config-defaults';
import { savedConsole as _console } from './saved-console';
import { LIVE_KEYS, trackMatchStats } from './match-stats';
import type { MatchStatListener } from './match-stats';

type StatCounterConfig = AppConfig['nukeCounter'];

interface Profile {
  player_stats?: Record<string, unknown>;
  [field: string]: unknown;
}

interface StatDef {
  id: string;
  label: string;
  tag: string;
  icon?: boolean;
  key?: string;
  ratio?: [string, string];
  tiers?: number[];
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// player_stats leaves a stat out until it's first counted; a hidden profile may leave it out regardless
function read(p: Profile, key: string): number | undefined {
  if (key.startsWith('player_')) return num(p[key]);
  const s = p.player_stats;
  if (!s || typeof s !== 'object') return undefined;
  return num(s[key]) ?? (s.hds === 1 ? undefined : 0);
}

// `tiers` are the thresholds of Krunker's titles for that stat
export const STATS: StatDef[] = [
  { id: 'nukes', label: 'Nukes', tag: '☢︎', icon: true, key: 'n', tiers: [500, 750, 1000, 1500, 2500] },
  { id: 'kills', label: 'Kills', tag: 'Kills', key: 'player_kills', tiers: [50000, 100000, 250000, 500000, 1000000] },
  { id: 'wins', label: 'Wins', tag: 'Wins', key: 'player_wins', tiers: [500, 1000, 5000, 10000] },
  { id: 'headshots', label: 'Headshots', tag: 'Headshots', key: 'hs' },
  { id: 'wallbangs', label: 'Wallbangs', tag: 'Wallbangs', key: 'wb' },
  { id: 'melee', label: 'Melee Kills', tag: 'Melee', key: 'mk' },
  { id: 'assists', label: 'Assists', tag: 'Assists', key: 'ast' },
  { id: 'thrown', label: 'Thrown Kills', tag: 'Thrown', key: 'tmk', tiers: [10000] },
  { id: 'sprays', label: 'Sprays', tag: 'Sprays', key: 'spry', tiers: [50000] },
  { id: 'crouches', label: 'Crouches', tag: 'Crouches', key: 'crc', tiers: [1000000] },
  { id: 'kd', label: 'K/D (session)', tag: 'K/D', ratio: ['player_kills', 'player_deaths'] },
];

const STAT_KEYS = new Set(STATS.flatMap((s) => s.ratio ?? [s.key!]));

const PLAYER_URL = 'https://gapi.svc.krunker.io/players/';
const SESSION_KEY = 'kcc_stat_session_';
const FLOOR_KEY = 'kcc_stat_floor_';
const TICK_MS = 2000;
const END_REFETCH_MS = 5000;
const UNCOUNTED_MS = 10000;
const RETRY_MS = 30000;
const BOX_PITCH_PX = 64;

const STYLE_ID = 'kcc-stat-counter-css';
const LAYER_ID = 'kcc-stat-counter';
const EDIT_CLASS = 'kcc-stat-editing';

const CSS = `
#${LAYER_ID} { position: absolute; inset: 0; z-index: 10; pointer-events: none; }
.kcc-stat-box {
  position: absolute;
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 8px;
  row-gap: 4px;
  transform: translate(-50%, -50%) scale(var(--kcc-stat-scale, 1));
  font-size: 26px;
  color: #fff;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}
.kcc-stat-box.kcc-stat-bg { background: rgba(0, 0, 0, 0.35); border-radius: 6px; padding: 6px 14px; }
.kcc-stat-tag { justify-self: end; color: #ffc107; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; }
.kcc-stat-tag.kcc-stat-icon { font-size: 28px; line-height: 1; letter-spacing: 0; }
.kcc-stat-goal, .kcc-stat-gain { margin-left: 8px; }
.kcc-stat-goal { color: rgba(255, 255, 255, 0.6); }
.kcc-stat-gain { color: #9eeb56; font-size: 18px; }
.kcc-stat-met .kcc-stat-num { color: #9eeb56; }
html.${EDIT_CLASS} #inGameUI { display: block !important; }
html.${EDIT_CLASS} #menuHolder { display: none !important; }
html.${EDIT_CLASS} #instructionHolder { visibility: hidden !important; }
html.${EDIT_CLASS} #${LAYER_ID} { z-index: 2147483645; }
html.${EDIT_CLASS} .kcc-stat-box { pointer-events: auto; cursor: move; outline: 2px dashed rgba(255, 255, 255, 0.7); outline-offset: 4px; }
#kcc-stat-dim { position: absolute; inset: 0; z-index: 9; background: rgba(0, 0, 0, 0.3); pointer-events: none; }
#kcc-stat-hint {
  position: absolute; left: 50%; top: 14%; transform: translateX(-50%); z-index: 2147483646;
  display: flex; align-items: center; gap: 24px; padding: 14px 28px; border-radius: 8px;
  background: rgba(0, 0, 0, 0.8); color: #fff; font-size: 26px; white-space: nowrap; pointer-events: auto;
}
#kcc-stat-done { padding: 8px 24px; border-radius: 6px; background: #ffc107; color: #000; cursor: pointer; }
`;

type Pos = { x: number; y: number };

const clampPct = (v: number): number => Math.min(100, Math.max(0, Number(v) || 0));
const clampScale = (v: number): number => Math.min(3, Math.max(0.25, Number(v) || 1));
const round2 = (v: number): number => Math.round(v * 100) / 100;

const LEGACY_DEFAULTS: Record<string, unknown> = { goal: 0, background: true, scale: 1, x: 94, y: 50 };

function normalize(raw: any): StatCounterConfig {
  const d = DEFAULT_CONFIG.nukeCounter;
  let c: StatCounterConfig = { ...d, ...raw };
  // Saved by the nukes-only counter: anyone who used or customised it keeps exactly that, the rest get the new defaults
  if (raw && raw.goal !== undefined) {
    const customised = raw.enabled || Object.keys(LEGACY_DEFAULTS).some((k) => raw[k] !== LEGACY_DEFAULTS[k]);
    c = customised
      ? { ...d, enabled: !!raw.enabled, background: raw.background, scale: raw.scale, x: raw.x, y: raw.y, stats: ['nukes'], goals: { nukes: Number(raw.goal) || 0 } }
      : { ...d };
  }
  c.stats = Array.isArray(c.stats) ? c.stats.filter((id) => STATS.some((s) => s.id === id)) : [...d.stats];
  c.goals = Object.fromEntries(Object.entries({ ...c.goals }).filter(([, g]) => typeof g === 'number' && g >= 0));
  c.positions = Object.fromEntries(Object.entries({ ...c.positions })
    .filter(([, p]) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map(([id, p]) => [id, { x: clampPct(p.x), y: clampPct(p.y) }]));
  c.layout = c.layout === 'separate' ? 'separate' : 'stacked';
  c.x = clampPct(c.x);
  c.y = clampPct(c.y);
  c.scale = clampScale(c.scale);
  return c;
}

let cfg: StatCounterConfig = normalize(undefined);
let initialized = false;
let styleEl: HTMLStyleElement | null = null;
let layerEl: HTMLElement | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let commitTimer: ReturnType<typeof setTimeout> | null = null;

let profile: Profile | null = null;
let baseline: Profile | null = null;
let shown: Profile | null = null;
let profileFor = '';
// By profile field: live counts of the running match, and committed totals the lagging profile endpoint hasn't caught up with
let current: Record<string, number> = {};
let floor: Record<string, number> = {};
let floorFor = '';
let matchOver = false;
let dropTimer: ReturnType<typeof setTimeout> | null = null;
let fetching = false;
let lastAttempt = 0;
let endWasVisible = false;

let editing = false;
let dragging = false;
let editorEls: HTMLElement[] = [];

function myName(): string {
  try { return window.localStorage.getItem('krunker_username') || ''; } catch { return ''; }
}

function fmt(n: number): string { return n.toLocaleString('en-US'); }

// sessionStorage outlives the page reload of every lobby change and clears when the client closes
function loadBaseline(name: string): Profile | null {
  try { return JSON.parse(window.sessionStorage.getItem(SESSION_KEY + name) || 'null'); } catch { return null; }
}

function saveBaseline(name: string, p: Profile): void {
  try { window.sessionStorage.setItem(SESSION_KEY + name, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

function useFloor(name: string): void {
  if (name === floorFor) return;
  floorFor = name;
  let saved: unknown = null;
  try { saved = JSON.parse(window.sessionStorage.getItem(FLOOR_KEY + name) || 'null'); } catch { /* unreadable */ }
  floor = Object.fromEntries(Object.entries(saved && typeof saved === 'object' ? saved : {}).filter(([, v]) => num(v) !== undefined));
}

function saveFloor(): void {
  try { window.sessionStorage.setItem(FLOOR_KEY + floorFor, JSON.stringify(floor)); } catch { /* storage unavailable */ }
}

function clearDrop(): void {
  if (dropTimer) { clearTimeout(dropTimer); dropTimer = null; }
}

function committed(p: Profile, key: string): number | undefined {
  const now = read(p, key);
  const held = floor[key];
  return now === undefined && held === undefined ? undefined : Math.max(now ?? 0, held ?? 0);
}

function withLive(p: Profile): Profile {
  const out: Profile = { ...p, player_stats: p.player_stats && { ...p.player_stats } };
  for (const key of new Set([...Object.keys(floor), ...Object.keys(current)])) {
    const base = committed(p, key);
    if (base === undefined) continue;
    if (key.startsWith('player_')) out[key] = base + (current[key] || 0);
    else if (out.player_stats) out.player_stats[key] = base + (current[key] || 0);
  }
  return out;
}

// The session's first committed match pins where it started, which a lagging first profile fetch can miss
function anchorBaseline(name: string, known: Record<string, number>): void {
  if (!baseline) return;
  const b: Profile = { ...baseline, player_stats: { ...baseline.player_stats }, anchored: true };
  for (const key of LIVE_KEYS) {
    if (!(key in known)) continue;
    const start = known[key] - (current[key] || 0);
    if (key.startsWith('player_')) b[key] = start;
    else b.player_stats![key] = start;
  }
  baseline = b;
  saveBaseline(name, b);
}

const live: MatchStatListener = {
  add(key, n) {
    current[key] = (current[key] || 0) + n;
    render();
  },
  end() {
    if (!Object.keys(current).length) return;
    matchOver = true;
    clearDrop();
    dropTimer = setTimeout(() => { dropTimer = null; matchOver = false; current = {}; render(); }, UNCOUNTED_MS);
  },
  totals(values) {
    const name = myName();
    if (!name) return;
    useFloor(name);
    const known = Object.fromEntries(Object.entries(values).filter(([key]) => STAT_KEYS.has(key)));
    if (matchOver) {
      const p = profile && profileFor === name ? profile : null;
      const counted = !!p && Object.entries(known).some(([key, v]) => v > (committed(p, key) ?? 0));
      if (counted && baseline && !baseline.anchored) anchorBaseline(name, known);
      if (counted) {
        for (const [key, n] of Object.entries(current)) {
          const base = committed(p!, key);
          // A live count the socket didn't commit is held at what it reached
          if (!(key in known) && base !== undefined) floor[key] = base + n;
        }
      }
      current = {};
      matchOver = false;
      clearDrop();
    }
    Object.assign(floor, known);
    saveFloor();
    render();
  },
};

function delta(key: string): number | null {
  if (!shown || !baseline) return null;
  const now = read(shown, key);
  const then = read(baseline, key);
  return typeof now === 'number' && typeof then === 'number' ? now - then : null;
}

function ratioText(def: StatDef): string {
  const n = delta(def.ratio![0]);
  const d = delta(def.ratio![1]);
  if (n === null || d === null) return '—';
  return n + d > 0 ? (n / Math.max(d, 1)).toFixed(2) : '—';
}

function rowHtml(def: StatDef): string {
  const tag = '<span class="kcc-stat-tag' + (def.icon ? ' kcc-stat-icon' : '') + '">' + def.tag + '</span>';
  if (def.ratio) return tag + '<span class="kcc-stat-val"><span class="kcc-stat-num">' + ratioText(def) + '</span></span>';
  const v = shown ? read(shown, def.key!) : undefined;
  const custom = cfg.goals[def.id];
  const goal = custom ?? (v !== undefined ? def.tiers?.find((t) => t > v) ?? 0 : 0);
  const gain = cfg.session ? delta(def.key!) : null;
  const met = custom !== undefined && custom > 0 && v !== undefined && v >= custom;
  return tag +
    '<span class="kcc-stat-val' + (met ? ' kcc-stat-met' : '') + '">' +
      '<span class="kcc-stat-num">' + (v === undefined ? '—' : fmt(v)) + '</span>' +
      (goal > 0 ? '<span class="kcc-stat-goal">/ ' + fmt(goal) + '</span>' : '') +
      (gain ? '<span class="kcc-stat-gain">+' + fmt(gain) + '</span>' : '') +
    '</span>';
}

function boxPos(id: string, i: number, n: number): Pos {
  const saved = cfg.positions[id];
  if (saved) return saved;
  const h = document.getElementById('uiBase')?.offsetHeight || 900;
  return { x: cfg.x, y: clampPct(cfg.y + (i - (n - 1) / 2) * BOX_PITCH_PX * cfg.scale / h * 100) };
}

function boxHtml(key: string, pos: Pos, rows: string): string {
  return '<div class="kcc-stat-box' + (cfg.background ? ' kcc-stat-bg' : '') + '" data-key="' + key + '"' +
    ' style="left:' + pos.x + '%;top:' + pos.y + '%;--kcc-stat-scale:' + cfg.scale + '">' + rows + '</div>';
}

function render(): void {
  if (!layerEl || dragging) return;
  shown = profile && withLive(profile);
  const defs = STATS.filter((s) => cfg.stats.includes(s.id));
  if (cfg.layout === 'separate') {
    layerEl.innerHTML = defs.map((def, i) => boxHtml(def.id, boxPos(def.id, i, defs.length), rowHtml(def))).join('');
  } else {
    layerEl.innerHTML = defs.length ? boxHtml('stack', { x: cfg.x, y: cfg.y }, defs.map(rowHtml).join('')) : '';
  }
}

function refresh(): void {
  const name = myName();
  if (!name || fetching) return;
  fetching = true;
  lastAttempt = Date.now();
  window.fetch(PLAYER_URL + encodeURIComponent(name), { credentials: 'omit', signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: any) => {
      const p = d?.data;
      if (p && typeof p === 'object') {
        profile = p;
        profileFor = name;
        useFloor(name);
        baseline = loadBaseline(name);
        if (!baseline) {
          baseline = { player_kills: p.player_kills, player_deaths: p.player_deaths, player_wins: p.player_wins, player_stats: p.player_stats };
          saveBaseline(name, baseline);
        }
      }
      render();
    })
    .catch((err) => _console.log('[KCC-Stats] fetch failed:', err))
    .finally(() => { fetching = false; });
}

function hostParent(): HTMLElement {
  return document.getElementById('inGameUI') || document.getElementById('uiBase') || document.body;
}

function inject(): void {
  if (layerEl && layerEl.isConnected) return;
  if (layerEl) layerEl.remove();
  layerEl = document.createElement('div');
  layerEl.id = LAYER_ID;
  hostParent().appendChild(layerEl);
  render();
}

// Polling (not MutationObserver) on purpose: observers on the main frame hang WebGL.
function onTick(): void {
  if (layerEl && !layerEl.isConnected) inject();
  if (profile && myName() !== profileFor) {
    profile = null;
    baseline = null;
    current = {};
    floor = {};
    floorFor = '';
    matchOver = false;
    clearDrop();
    lastAttempt = 0;
    render();
  }
  if (!profile && Date.now() - lastAttempt > RETRY_MS) refresh();
  const endUI = document.getElementById('endUI');
  const visible = !!endUI && endUI.style.display !== 'none';
  if (visible && !endWasVisible && !commitTimer) {
    // Backs up the socket's match-end totals; the profile endpoint itself lags by minutes
    commitTimer = setTimeout(() => { commitTimer = null; refresh(); }, END_REFETCH_MS);
  }
  endWasVisible = visible;
}

function save(): void {
  ipcRenderer.invoke('set-config', 'nukeCounter', cfg);
}

function apply(): void {
  if (!cfg.enabled) {
    closeEditor(false);
    trackMatchStats(null);
    if (tick) { clearInterval(tick); tick = null; }
    if (commitTimer) { clearTimeout(commitTimer); commitTimer = null; }
    if (layerEl) { layerEl.remove(); layerEl = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
    endWasVisible = false;
    // Live counts would go stale unwatched; the profile is kept so re-enabling renders cached totals, not dashes
    current = {};
    matchOver = false;
    clearDrop();
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
  inject();
  render();
  if (!tick) {
    tick = setInterval(onTick, TICK_MS);
    trackMatchStats(live);
    refresh();
  }
}

export function initStatCounter(raw: unknown): void {
  statCounterConfig(raw);
  apply();
}

// The settings panel edits this same object, so a dragged position can't be overwritten by a stale copy
export function statCounterConfig(fallback: unknown): StatCounterConfig {
  if (!initialized) { cfg = normalize(fallback); initialized = true; }
  return cfg;
}

export function updateStatCounter(patch: Partial<StatCounterConfig>): void {
  Object.assign(cfg, patch);
  save();
  apply();
}

// ── Move mode ──
// The HUD is hidden on the menu, so editing shows it in place of the menu and makes the counters draggable.

const EDIT_MOUSE_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;

function setPos(key: string, pos: Pos | null): void {
  const d = DEFAULT_CONFIG.nukeCounter;
  if (key === 'stack') {
    cfg.x = pos ? pos.x : d.x;
    cfg.y = pos ? pos.y : d.y;
  } else if (pos) {
    cfg.positions[key] = pos;
  } else {
    delete cfg.positions[key];
  }
  save();
  render();
}

function startDrag(e: MouseEvent, box: HTMLElement, key: string): void {
  const base = document.getElementById('uiBase')!.getBoundingClientRect();
  const rect = box.getBoundingClientRect();
  const offX = e.clientX - (rect.left + rect.width / 2);
  const offY = e.clientY - (rect.top + rect.height / 2);
  const halfX = rect.width / 2 / base.width * 100;
  const halfY = rect.height / 2 / base.height * 100;
  const fit = (v: number, half: number): number => round2(Math.min(100 - half, Math.max(half, v)));
  let pos: Pos | null = null;
  dragging = true;
  const move = (ev: MouseEvent): void => {
    // The mouseup is lost if focus leaves mid-drag (Alt-Tab with the button held)
    if (!(ev.buttons & 1)) return up();
    pos = {
      x: fit((ev.clientX - offX - base.left) / base.width * 100, halfX),
      y: fit((ev.clientY - offY - base.top) / base.height * 100, halfY),
    };
    box.style.left = pos.x + '%';
    box.style.top = pos.y + '%';
  };
  const up = (): void => {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    dragging = false;
    if (pos) setPos(key, pos);
    else render();
  };
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
}

// Every press is swallowed while editing so none reaches Krunker's click-to-play
function onEditMouse(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  const target = e.target as Element | null;
  if (target?.closest?.('#kcc-stat-done')) {
    if (e.type === 'click') closeEditor(true);
    return;
  }
  const box = target?.closest?.('.kcc-stat-box') as HTMLElement | null;
  const key = box?.dataset.key;
  if (!box || !key) return;
  if (e.type === 'dblclick') setPos(key, null);
  else if (e.type === 'mousedown' && e.button === 0) startDrag(e, box, key);
}

function onEditKey(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') closeEditor(true);
}

function onEditLock(): void {
  if (document.pointerLockElement) closeEditor(false);
}

function closeEditor(reopenSettings: boolean): void {
  if (!editing) return;
  editing = false;
  for (const type of EDIT_MOUSE_EVENTS) document.removeEventListener(type, onEditMouse, true);
  document.removeEventListener('keydown', onEditKey, true);
  document.removeEventListener('pointerlockchange', onEditLock);
  for (const el of editorEls) el.remove();
  editorEls = [];
  document.documentElement.classList.remove(EDIT_CLASS);
  if (reopenSettings) (window as any).showWindow?.(1);
}

export function openStatCounterEditor(): void {
  const base = document.getElementById('uiBase');
  if (editing || !cfg.enabled || !cfg.stats.length || !base) return;
  (window as any).closWind?.();
  editing = true;
  document.documentElement.classList.add(EDIT_CLASS);
  const dim = document.createElement('div');
  dim.id = 'kcc-stat-dim';
  const hint = document.createElement('div');
  hint.id = 'kcc-stat-hint';
  hint.innerHTML = '<span>Drag to move · Double-click to reset · Esc to finish</span><span id="kcc-stat-done">Done</span>';
  base.append(dim, hint);
  editorEls = [dim, hint];
  for (const type of EDIT_MOUSE_EVENTS) document.addEventListener(type, onEditMouse, true);
  document.addEventListener('keydown', onEditKey, true);
  document.addEventListener('pointerlockchange', onEditLock);
  inject();
}
