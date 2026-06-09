// ── Settings UI toolkit ──
// Reusable building blocks for the injected Client settings tab: safety/refresh
// icons, the "needs refresh/restart" notification, the row factories
// (toggle/select/number/keybind/checkbox-grid), and collapsible sections.
// Consumers (settings-sections.ts + settings-render.ts) import and call these.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';
import { escapeHtml } from './utils';
import { openKeybindDialog, keybindDisplayString } from './keybind-dialog';

// ── Krunker-native settings styling constants (from Crankshaft) ──
const SAFETY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M12 12.5ZM3.425 20.5Q2.9 20.5 2.65 20.05Q2.4 19.6 2.65 19.15L11.2 4.35Q11.475 3.9 12 3.9Q12.525 3.9 12.8 4.35L21.35 19.15Q21.6 19.6 21.35 20.05Q21.1 20.5 20.575 20.5ZM12 10.2Q11.675 10.2 11.463 10.412Q11.25 10.625 11.25 10.95V14.45Q11.25 14.75 11.463 14.975Q11.675 15.2 12 15.2Q12.325 15.2 12.538 14.975Q12.75 14.75 12.75 14.45V10.95Q12.75 10.625 12.538 10.412Q12.325 10.2 12 10.2ZM12 17.8Q12.35 17.8 12.575 17.575Q12.8 17.35 12.8 17Q12.8 16.65 12.575 16.425Q12.35 16.2 12 16.2Q11.65 16.2 11.425 16.425Q11.2 16.65 11.2 17Q11.2 17.35 11.425 17.575Q11.65 17.8 12 17.8ZM4.45 19H19.55L12 6Z"/></svg>';
const REFRESH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#000000"><path d="M12 6v1.79c0 .45.54.67.85.35l2.79-2.79c.2-.2.2-.51 0-.71l-2.79-2.79c-.31-.31-.85-.09-.85.36V4c-4.42 0-8 3.58-8 8 0 1.04.2 2.04.57 2.95.27.67 1.13.85 1.64.34.27-.27.38-.68.23-1.04C6.15 13.56 6 12.79 6 12c0-3.31 2.69-6 6-6zm5.79 2.71c-.27.27-.38.69-.23 1.04.28.7.44 1.46.44 2.25 0 3.31-2.69 6-6 6v-1.79c0-.45-.54-.67-.85-.35l-2.79 2.79c-.2.2-.2.51 0 .71l2.79 2.79c.31.31.85.09.85-.35V20c4.42 0 8-3.58 8-8 0-1.04-.2-2.04-.57-2.95-.27-.67-1.13-.85-1.64-.34z"/></svg>';
const SAFETY_DESCS = [
    'This setting is safe/standard',
    'Proceed with caution',
    'This setting is not recommended',
    'This setting is experimental',
    'This setting is experimental and unstable. Use at your own risk.',
];

const enum RefreshLevel { none, refresh, restart }
let refreshLevel: number = RefreshLevel.none;
let refreshPopupEl: HTMLElement | null = null;

function safetyIcon(safety: string): string {
    return '<span class="desc-icon" title="' + safety + '">' + SAFETY_SVG + '</span>';
}

export function refreshIcon(mode: 'instant' | 'refresh-icon'): string {
    return '<span class="desc-icon ' + mode + '" title="' + (mode === 'instant' ? 'Applies instantly! (No refresh of page required)' : 'Refresh page to see changes') + '">' + REFRESH_SVG + '</span>';
}

function restartIcon(): string {
    return '<span class="desc-icon restart-icon" title="Requires client restart">' + SAFETY_SVG + '</span>';
}

function settingIcon(safety: number, instant?: boolean, refreshOnly?: boolean, restart?: boolean): string {
    if (safety > 0) return safetyIcon(SAFETY_DESCS[safety]);
    if (instant) return refreshIcon('instant');
    if (refreshOnly) return refreshIcon('refresh-icon');
    if (restart) return restartIcon();
    return '';
}

export function onSettingChanged(level: 'refresh' | 'restart'): void {
    const newLevel = level === 'restart' ? RefreshLevel.restart : RefreshLevel.refresh;
    if (newLevel > refreshLevel) refreshLevel = newLevel;
    updateRefreshNotification();
}

function updateRefreshNotification(): void {
    if (refreshLevel === RefreshLevel.none) {
        if (refreshPopupEl) { refreshPopupEl.remove(); refreshPopupEl = null; }
        return;
    }
    if (refreshPopupEl) { try { refreshPopupEl.remove(); } catch { /* noop */ } }
    refreshPopupEl = document.createElement('div');
    refreshPopupEl.className = 'kcc-holder-update refresh-popup';
    if (refreshLevel === RefreshLevel.restart) {
        refreshPopupEl.innerHTML = '<span class="restart-msg">Restart client fully to see changes</span>';
    } else {
        refreshPopupEl.innerHTML = '<span class="reload-msg">' + refreshIcon('refresh-icon') + 'Reload page with <code>F5</code> or <code>CTRL + R</code> to see changes</span>';
    }
    document.body.appendChild(refreshPopupEl);
}

/** Reset the refresh/restart notification — called by renderSettings on each (re)render. */
export function resetRefreshNotification(): void {
    refreshLevel = RefreshLevel.none;
    if (refreshPopupEl) { refreshPopupEl.remove(); refreshPopupEl = null; }
}

export function createKeybindRow(label: string, desc: string, currentBind: Keybind, onBind: (bind: Keybind) => void, safety?: number, instant?: boolean): HTMLElement {
  const s = safety || 0;
  const row = document.createElement('div');
  row.className = 'setting settName safety-' + s + ' keybind';
  row.innerHTML =
    settingIcon(s, instant) +
    '<span class="setting-title">' + escapeHtml(label) + '</span>' +
    '<span class="keyIcon kcc-keyIcon">' + escapeHtml(keybindDisplayString(currentBind)) + '</span>' +
    '<div class="setting-desc-new">' + escapeHtml(desc) + '</div>';
  const keyEl = row.querySelector('.kcc-keyIcon') as HTMLElement;
  keyEl.addEventListener('click', () => {
    openKeybindDialog(label).then((newBind) => {
      keyEl.textContent = keybindDisplayString(newBind);
      onBind(newBind);
    });
  });
  return row;
}

// Single-key picker (no modifiers) — used for keystroke overlay aux keys
export function createSimpleKeyRow(opts: {
  label: string;
  desc: string;
  value: string;
  onChange: (value: string) => void;
  safety?: number;
  instant?: boolean;
}): HTMLElement {
  const s = opts.safety || 0;
  const row = document.createElement('div');
  row.className = 'setting settName safety-' + s + ' keybind';
  row.innerHTML =
    settingIcon(s, opts.instant) +
    '<span class="setting-title">' + escapeHtml(opts.label) + '</span>' +
    '<span class="keyIcon kcc-keyIcon">' + escapeHtml((opts.value || '?').toUpperCase()) + '</span>' +
    '<div class="setting-desc-new">' + escapeHtml(opts.desc) + '</div>';
  const keyEl = row.querySelector('.kcc-keyIcon') as HTMLElement;
  keyEl.addEventListener('click', () => {
    openKeybindDialog(opts.label, { simple: true }).then((bind) => {
      keyEl.textContent = bind.key.toUpperCase();
      opts.onChange(bind.key);
    });
  });
  return row;
}

export function createToggleRow(opts: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  restart?: boolean;
  disabled?: boolean;
  safety?: number;
  instant?: boolean;
  refreshOnly?: boolean;
}): HTMLElement {
  const s = opts.safety || 0;
  const row = document.createElement('div');
  row.className = 'setting settName safety-' + s + ' bool';
  row.innerHTML =
    settingIcon(s, opts.instant, opts.refreshOnly, opts.restart) +
    '<span class="setting-title">' + escapeHtml(opts.label) + '</span>' +
    '<label class="switch">' +
      '<input type="checkbox" class="s-update"' + (opts.checked ? ' checked' : '') + (opts.disabled ? ' disabled' : '') + '>' +
      '<div class="slider round"></div>' +
    '</label>' +
    '<div class="setting-desc-new">' + escapeHtml(opts.desc) + '</div>';
  if (!opts.disabled) {
    const cb = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.addEventListener('change', () => {
      opts.onChange(cb.checked);
      if (opts.restart) onSettingChanged('restart');
      else if (opts.refreshOnly) onSettingChanged('refresh');
    });
  }
  return row;
}

export function createSelectRow(opts: {
  label: string;
  desc: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  restart?: boolean;
  safety?: number;
  instant?: boolean;
  refreshOnly?: boolean;
}): HTMLElement {
  const s = opts.safety || 0;
  const row = document.createElement('div');
  row.className = 'setting settName safety-' + s + ' sel';
  row.innerHTML =
    settingIcon(s, opts.instant, opts.refreshOnly, opts.restart) +
    '<span class="setting-title">' + escapeHtml(opts.label) + '</span>' +
    '<div class="setting-desc-new">' + escapeHtml(opts.desc) + '</div>';
  const select = document.createElement('select');
  select.className = 's-update inputGrey2';
  for (const o of opts.options) {
    const option = document.createElement('option');
    option.value = o.value;
    option.textContent = o.label;
    if (o.value === opts.value) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    opts.onChange(select.value);
    if (opts.restart) onSettingChanged('restart');
    else if (opts.refreshOnly) onSettingChanged('refresh');
  });
  row.appendChild(select);
  return row;
}

export function createNumberRow(opts: {
  label: string;
  desc: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  safety?: number;
  restart?: boolean;
  instant?: boolean;
  refreshOnly?: boolean;
}): HTMLElement {
  const s = opts.safety || 0;
  const step = opts.step || 1;
  const parse = step < 1 ? parseFloat : parseInt;
  const row = document.createElement('div');
  row.className = 'setting settName safety-' + s + ' num';
  row.innerHTML =
    settingIcon(s, opts.instant, opts.refreshOnly, opts.restart) +
    '<span class="setting-title">' + escapeHtml(opts.label) + '</span>' +
    '<span class="setting-input-wrapper">' +
      '<div class="slidecontainer"><input type="range" class="sliderM s-update-secondary" min="' + opts.min + '" max="' + opts.max + '" step="' + step + '" value="' + opts.value + '"></div>' +
      '<input type="number" class="rb-input s-update sliderVal" min="' + opts.min + '" max="' + opts.max + '" step="' + step + '" value="' + opts.value + '">' +
    '</span>' +
    '<div class="setting-desc-new">' + escapeHtml(opts.desc) + '</div>';
  const rangeInput = row.querySelector('input[type="range"]') as HTMLInputElement;
  const numInput = row.querySelector('input[type="number"]') as HTMLInputElement;
  rangeInput.addEventListener('input', () => {
    numInput.value = rangeInput.value;
  });
  rangeInput.addEventListener('change', () => {
    const v = Math.max(opts.min, Math.min(opts.max, parse(rangeInput.value) || 0));
    rangeInput.value = String(v);
    numInput.value = String(v);
    opts.onChange(v);
    if (opts.restart) onSettingChanged('restart');
    else if (opts.refreshOnly) onSettingChanged('refresh');
  });
  numInput.addEventListener('change', () => {
    const v = Math.max(opts.min, Math.min(opts.max, parse(numInput.value) || 0));
    numInput.value = String(v);
    rangeInput.value = String(v);
    opts.onChange(v);
    if (opts.restart) onSettingChanged('restart');
    else if (opts.refreshOnly) onSettingChanged('refresh');
  });
  return row;
}

export function createCheckboxGrid(opts: {
  header: string;
  items: Array<{ value: string; label: string; icon?: string }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}): HTMLElement {
  const row = document.createElement('div');
  row.className = 'setting settName safety-0 multisel';
  row.innerHTML = '<span class="setting-title">' + escapeHtml(opts.header) + '</span>';
  const grid = document.createElement('div');
  grid.className = 'kcc-multisel-parent';
  if (opts.items.some(it => it.icon)) grid.classList.add('kcc-multisel-has-icons');
  for (const item of opts.items) {
    const label = document.createElement('label');
    label.className = 'hostOpt';
    label.innerHTML =
      (item.icon ? '<img class="kcc-mapopt-icon" alt="" src="' + item.icon + '">' : '') +
      '<span class="optName">' + escapeHtml(item.label) + '</span>' +
      '<input type="checkbox"' + (opts.selected.includes(item.value) ? ' checked' : '') + '>' +
      '<div class="optCheck"></div>';
    const iconImg = label.querySelector('.kcc-mapopt-icon') as HTMLImageElement | null;
    if (iconImg) {
      // Inline (not stylesheet): Krunker's hostOpt button paints over the icon, so it
      // needs its own stacking context (position+z-index) to show. Injected CSS lost
      // the cascade here; inline styles win. px size avoids hostOpt's font-size:0.
      iconImg.style.cssText = 'width:46px;height:46px;object-fit:cover;border-radius:4px;margin-right:10px;display:inline-block;vertical-align:middle;position:relative;z-index:9';
      iconImg.onerror = () => { iconImg.style.visibility = 'hidden'; };
      // Tighten the button vertically so the larger icon fills it (inline beats hostOpt padding)
      label.style.paddingTop = '5px';
      label.style.paddingBottom = '5px';
    }
    const cb = label.querySelector('input') as HTMLInputElement;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!opts.selected.includes(item.value)) opts.selected.push(item.value);
      } else {
        const idx = opts.selected.indexOf(item.value);
        if (idx >= 0) opts.selected.splice(idx, 1);
      }
      opts.onChange(opts.selected);
    });
    grid.appendChild(label);
  }

  const clearBtn = document.createElement('div');
  clearBtn.className = 'kcc-clear-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.setAttribute('onmouseenter', 'playTick()');
  clearBtn.addEventListener('click', () => {
    const w = window as any;
    if (typeof w.playSelect === 'function') w.playSelect();
    for (const cb of grid.querySelectorAll('input[type="checkbox"]')) {
      (cb as HTMLInputElement).checked = false;
    }
    opts.selected.length = 0;
    opts.onChange(opts.selected);
  });
  row.appendChild(clearBtn);

  row.appendChild(grid);
  return row;
}

// ── Collapsible sections ──
// Persisted collapsed-state map; populated at render time, mutated on click.
let collapsedState: Record<string, boolean> = {};
let collapsedSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Seed the collapsed-state map from persisted config (called by renderSettings). */
export function setCollapsedState(state: Record<string, boolean>): void {
  collapsedState = state;
}

function persistCollapsedState(): void {
  if (collapsedSaveTimer) clearTimeout(collapsedSaveTimer);
  collapsedSaveTimer = setTimeout(() => {
    ipcRenderer.invoke('set-config', 'collapsedSections', collapsedState);
    collapsedSaveTimer = null;
  }, 200);
}

export function createSection(title: string, defaultCollapsed?: boolean): { section: HTMLElement; body: HTMLElement } {
  const collapsed = collapsedState[title] ?? defaultCollapsed ?? false;
  const section = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'setHed';
  header.innerHTML = '<span class="material-icons plusOrMinus">' + (collapsed ? 'keyboard_arrow_right' : 'keyboard_arrow_down') + '</span>' + title;
  const body = document.createElement('div');
  body.className = 'setBodH' + (collapsed ? ' setting-category-collapsed' : '');
  header.addEventListener('click', () => {
    const isCollapsed = body.classList.toggle('setting-category-collapsed');
    const arrow = header.querySelector('.plusOrMinus');
    if (arrow) arrow.textContent = isCollapsed ? 'keyboard_arrow_right' : 'keyboard_arrow_down';
    collapsedState[title] = isCollapsed;
    persistCollapsedState();
  });
  section.appendChild(header);
  section.appendChild(body);
  return { section, body };
}
