import { ipcRenderer } from 'electron';
import { fetchGame, MATCHMAKER_GAMEMODE_FILTER, MATCHMAKER_REGIONS, MATCHMAKER_REGION_NAMES, MATCHMAKER_MAP_FILTER, MATCHMAKER_MAP_NAMES } from './matchmaker';
import type { MatchmakerConfig } from './matchmaker';
import { initUserscripts, getInstances, setScriptEnabled } from './userscripts';
import type { UserscriptInstance } from './userscripts';
import { initTranslator, updateTranslatorConfig } from './translator';
import { setDeathAnimBlock, setMenuTimer, setWatermark, escapeHtml } from './utils';
import { initChat, setBetterChat, setChatHistorySize } from './chat';
import { initHPCounter, destroyHPCounter, initRankProgress } from './competitive';
import { initKeystrokes, updateKeystrokes } from './keystrokes';
import type { KeystrokesConfig } from './keystrokes';
import { checkChangelog, showChangelogNow } from './changelog';
import type { Keybind } from '../main/config';


// ── Save console methods before Krunker overwrites them ──
// Wrapped to forward errors/warnings always, and logs when verbose is enabled
let _verboseLogging = false;

const _console = {
  log: (...args: unknown[]) => {
    console.log(...args);
    if (_verboseLogging) ipcRenderer.send('verbose-log', 'log', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
    ipcRenderer.send('verbose-log', 'warn', ...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    ipcRenderer.send('verbose-log', 'error', ...args);
  },
};

_console.log('[KCC] Preload script loaded');

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

function refreshIcon(mode: 'instant' | 'refresh-icon'): string {
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

function onSettingChanged(level: 'refresh' | 'restart'): void {
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

// ── Tell Krunker this is a client (enables "Client" settings tab) ──
(window as any).OffCliV = true;

// ── IPC bridge exposed as window.kcc ──
(window as any).kcc = {
  platform: {
    getInfo: () => ipcRenderer.invoke('get-platform'),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke('get-config', key),
    getAll: (keys: string[]) => ipcRenderer.invoke('get-all-config', keys),
    set: (key: string, value: unknown) => ipcRenderer.invoke('set-config', key, value),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  dev: {
    toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  },
  swapper: {
    openFolder: () => ipcRenderer.invoke('open-swap-folder'),
    getPath: () => ipcRenderer.invoke('get-swap-dir'),
  },
  userscripts: {
    openFolder: () => ipcRenderer.invoke('userscripts-open-folder'),
    getPath: () => ipcRenderer.invoke('userscripts-get-dir'),
  },
};

// ── Client settings tab in Krunker's settings ──

// ── Keybind helpers ──
function keybindDisplayString(bind: Keybind): string {
  return (bind.shift ? 'Shift+' : '') + (bind.ctrl ? 'Ctrl+' : '') + (bind.alt ? 'Alt+' : '') + bind.key.toUpperCase();
}

// ── Keybind capture dialog (Crankshaft-style) ──
let capturingKeybind: { resolve: (bind: Keybind) => void; simple: boolean } | null = null;

const kbOverlay = document.createElement('div');
kbOverlay.className = 'kcc-keybind-overlay';
const kbDialog = document.createElement('div');
kbDialog.className = 'kcc-keybind-dialog';
const kbTitle = document.createElement('div');
kbTitle.className = 'kcc-keybind-dialog-title';
const kbSub = document.createElement('div');
kbSub.className = 'kcc-keybind-dialog-sub';
kbSub.innerHTML = 'Press any key. Press <code>Shift+Escape</code> to cancel.';
const kbModifiers = document.createElement('div');
kbModifiers.className = 'kcc-keybind-dialog-modifiers';
const kbShift = document.createElement('div');
kbShift.className = 'kcc-keybind-modifier';
kbShift.textContent = 'Shift';
const kbCtrl = document.createElement('div');
kbCtrl.className = 'kcc-keybind-modifier';
kbCtrl.textContent = 'Control';
const kbAlt = document.createElement('div');
kbAlt.className = 'kcc-keybind-modifier';
kbAlt.textContent = 'Alt';
const kbCancel = document.createElement('div');
kbCancel.className = 'kcc-keybind-dialog-cancel';
kbCancel.textContent = 'Cancel';
kbCancel.addEventListener('click', dismissKeybindDialog);

kbModifiers.appendChild(kbShift);
kbModifiers.appendChild(kbCtrl);
kbModifiers.appendChild(kbAlt);
kbDialog.appendChild(kbCancel);
kbDialog.appendChild(kbTitle);
kbDialog.appendChild(kbSub);
kbDialog.appendChild(kbModifiers);
kbOverlay.appendChild(kbDialog);

function dismissKeybindDialog(): void {
  kbShift.classList.remove('active');
  kbCtrl.classList.remove('active');
  kbAlt.classList.remove('active');
  document.removeEventListener('keydown', kbKeydownHandler, true);
  document.removeEventListener('keyup', kbKeyupHandler, true);
  if (kbOverlay.parentNode) kbOverlay.remove();
  capturingKeybind = null;
  ipcRenderer.send('keybind-capture', false);
}

function kbKeydownHandler(event: KeyboardEvent): void {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (capturingKeybind?.simple) return;
  if (event.key === 'Control') kbCtrl.classList.add('active');
  else if (event.key === 'Shift') kbShift.classList.add('active');
  else if (event.key === 'Alt') kbAlt.classList.add('active');
}

function kbKeyupHandler(event: KeyboardEvent): void {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (!capturingKeybind) return;

  if (event.key === 'Escape' && event.shiftKey) {
    dismissKeybindDialog();
    return;
  }

  const isModifier = event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt';
  if (capturingKeybind.simple) {
    // Single-key picker: ignore modifier presses entirely, never capture them
    if (isModifier) return;
    capturingKeybind.resolve({ key: event.key, ctrl: false, shift: false, alt: false });
    dismissKeybindDialog();
    return;
  }

  if (isModifier) {
    // Modifier-only release returns the modifier as the bound key (full keybind mode)
    capturingKeybind.resolve({ key: event.key, ctrl: false, shift: false, alt: false });
    dismissKeybindDialog();
    return;
  }

  capturingKeybind.resolve({
    key: event.key,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  });
  dismissKeybindDialog();
}

function openKeybindDialog(title: string, opts?: { simple?: boolean }): Promise<Keybind> {
  const simple = !!opts?.simple;
  return new Promise((resolve) => {
    capturingKeybind = { resolve, simple };
    kbTitle.textContent = (simple ? 'Set Key: ' : 'Edit Keybind: ') + title;
    kbSub.innerHTML = simple
      ? 'Press any key. Press <code>Shift+Escape</code> to cancel.'
      : 'Press any key. Press <code>Shift+Escape</code> to cancel.';
    kbModifiers.style.display = simple ? 'none' : '';
    kbShift.classList.remove('active');
    kbCtrl.classList.remove('active');
    kbAlt.classList.remove('active');
    ipcRenderer.send('keybind-capture', true);
    document.addEventListener('keydown', kbKeydownHandler, true);
    document.addEventListener('keyup', kbKeyupHandler, true);
    document.body.appendChild(kbOverlay);
  });
}

function createKeybindRow(label: string, desc: string, currentBind: Keybind, onBind: (bind: Keybind) => void, safety?: number, instant?: boolean): HTMLElement {
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
function createSimpleKeyRow(opts: {
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

function createToggleRow(opts: {
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

function createSelectRow(opts: {
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

function createNumberRow(opts: {
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

function createCheckboxGrid(opts: {
  header: string;
  items: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}): HTMLElement {
  const row = document.createElement('div');
  row.className = 'setting settName safety-0 multisel';
  row.innerHTML = '<span class="setting-title">' + escapeHtml(opts.header) + '</span>';
  const grid = document.createElement('div');
  grid.className = 'kcc-multisel-parent';
  for (const item of opts.items) {
    const label = document.createElement('label');
    label.className = 'hostOpt';
    label.innerHTML =
      '<span class="optName">' + escapeHtml(item.label) + '</span>' +
      '<input type="checkbox"' + (opts.selected.includes(item.value) ? ' checked' : '') + '>' +
      '<div class="optCheck"></div>';
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
  row.appendChild(grid);
  return row;
}

// ── Double Ping Display (Krunker shows half the actual ping) ──
let _doublePingObserver: MutationObserver | null = null;

function initDoublePing(): void {
    function attach(pingEl: HTMLElement): void {
        _doublePingObserver = new MutationObserver(() => {
            const text = pingEl.textContent;
            if (!text) return;
            const match = text.match(/(\d+)/);
            if (!match) return;
            const doubled = parseInt(match[1]) * 2;
            _doublePingObserver!.disconnect();
            pingEl.textContent = text.replace(match[1], String(doubled));
            _doublePingObserver!.observe(pingEl, { childList: true, characterData: true, subtree: true });
        });
        _doublePingObserver.observe(pingEl, { childList: true, characterData: true, subtree: true });
    }

    const el = document.getElementById('pingText');
    if (el) { attach(el); return; }

    let attempts = 0;
    const poll = setInterval(() => {
        if (++attempts > 60) { clearInterval(poll); return; }
        const pingEl = document.getElementById('pingText');
        if (pingEl) { clearInterval(poll); attach(pingEl); }
    }, 500);
}

// ── Show Ping in Player List (numeric ms instead of icon) ──
// genList returns an HTML string — parse it, replace icon elements, return modified HTML.
function initShowPing(): void {
    const w = window as any;
    let attempts = 0;
    const poll = setInterval(() => {
        const origGenList = w.windows?.[22]?.genList;
        if (origGenList && !origGenList.__kccPingPatched) {
            clearInterval(poll);
            const patched = function (this: any) {
                const html = origGenList.call(this);
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                for (const icon of doc.querySelectorAll('.pListPing.material-icons')) {
                    const ping = icon.getAttribute('title');
                    icon.classList.remove('pListPing', 'material-icons');
                    icon.removeAttribute('title');
                    icon.textContent = ping ? ping + ' ' : 'N/A ';
                }
                return doc.body.innerHTML;
            };
            (patched as any).__kccPingPatched = true;
            w.windows[22].genList = patched;
        } else if (++attempts > 75) {
            clearInterval(poll);
        }
    }, 200);
}

function hookSettings(): void {
  const w = window as any;
  const settingsWindow = w.windows[0];
  let selectedTab: number = settingsWindow.tabIndex;

  function isClientTab(): boolean {
    const tabs = settingsWindow.tabs[settingsWindow.settingType];
    return tabs && selectedTab === tabs.length - 1;
  }

  function safeRender(): void {
    if (isClientTab()) renderSettings();
  }

  const origShowWindow = w.showWindow.bind(w);
  const origChangeTab = settingsWindow.changeTab.bind(settingsWindow);
  const origSearchList = settingsWindow.searchList.bind(settingsWindow);

  w.showWindow = (...args: unknown[]) => {
    const result = origShowWindow(...args);
    if (args[0] === 1) {
      if (settingsWindow.settingType === 'basic') {
        settingsWindow.toggleType({ checked: true });
      }
      const advSlider = document.querySelector('.advancedSwitch input#typeBtn') as HTMLInputElement | null;
      if (advSlider) {
        advSlider.disabled = true;
        if (advSlider.nextElementSibling) {
          advSlider.nextElementSibling.setAttribute('title', 'Client auto-enables advanced settings mode');
        }
      }

      const searchInput = document.getElementById('settSearch') as HTMLInputElement | null;
      const searchQuery = searchInput?.value?.trim() ?? '';
      if (searchQuery.length > 0) renderSettings(searchQuery);
      else if (isClientTab()) renderSettings();
    }
    return result;
  };

  settingsWindow.changeTab = (...args: unknown[]) => {
    const result = origChangeTab(...args);
    selectedTab = settingsWindow.tabIndex;
    safeRender();
    return result;
  };

  settingsWindow.searchList = (...args: unknown[]) => {
    const result = origSearchList(...args);
    const searchInput = document.getElementById('settSearch') as HTMLInputElement | null;
    const query = searchInput?.value?.trim() ?? '';
    if (query.length > 0) {
      renderSettings(query);
    } else {
      const existing = document.querySelector('#settHolder .kcc-settings');
      if (existing && !isClientTab()) existing.remove();
      else if (isClientTab()) renderSettings();
    }
    return result;
  };

  safeRender();
}

// Persisted collapsed-state map; populated at render time, mutated on click
let collapsedState: Record<string, boolean> = {};
let collapsedSaveTimer: ReturnType<typeof setTimeout> | null = null;

function persistCollapsedState(): void {
  if (collapsedSaveTimer) clearTimeout(collapsedSaveTimer);
  collapsedSaveTimer = setTimeout(() => {
    ipcRenderer.invoke('set-config', 'collapsedSections', collapsedState);
    collapsedSaveTimer = null;
  }, 200);
}

function createSection(title: string, defaultCollapsed?: boolean): { section: HTMLElement; body: HTMLElement } {
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

// ── Settings section builders ──

interface SettingsBag {
  binds: Record<string, Keybind>;
  saveBinds: () => void;
  isWindows: boolean;
}

function buildGeneralSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const gameDefaults = { lastServer: '', socialTabBehaviour: 'New Window', rememberTabs: false };
  const game = { ...gameDefaults, ...gameConf };

  body.appendChild(createSelectRow({
    label: 'Social/Hub Tab Behaviour',
    desc: 'How social, market, and editor pages open when clicked',
    options: [{ value: 'New Window', label: 'Tabs (Separate Window)' }, { value: 'Same Window', label: 'Tabs (Overlay Game)' }],
    value: game.socialTabBehaviour, instant: true,
    onChange: (v) => { game.socialTabBehaviour = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  body.appendChild(createToggleRow({
    label: 'Remember Tabs',
    desc: 'Restore your open tabs when you reopen the social/hub window',
    checked: game.rememberTabs, instant: true,
    onChange: (v) => { game.rememberTabs = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  const uiDefaults = { showExitButton: true, deathscreenAnimation: false, hideMenuPopups: false };
  const ui = { ...uiDefaults, ...uiConfRaw };

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  body.appendChild(createToggleRow({
    label: 'Show Exit Button',
    desc: 'Show the exit button in the game sidebar',
    checked: ui.showExitButton, instant: true,
    onChange: (v) => {
      ui.showExitButton = v; saveUI();
      const btn = document.getElementById('clientExit');
      if (btn) btn.style.display = v ? 'flex' : 'none';
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Join as Spectator',
    desc: 'Automatically enable spectate mode when joining a game',
    checked: game.joinAsSpectator, instant: true,
    onChange: (v) => { game.joinAsSpectator = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Changelog',
    desc: 'Show release notes popup when the client updates',
    checked: ui.showChangelog ?? true, instant: true,
    onChange: (v) => { ui.showChangelog = v; saveUI(); },
  }));

  const changelogBtnRow = document.createElement('div');
  changelogBtnRow.className = 'setting settName safety-0 has-button';
  changelogBtnRow.innerHTML =
    '<span class="setting-title">Changelog</span>' +
    '<div class="setting-desc-new">View release notes for the current version</div>';
  const changelogBtn = document.createElement('div');
  changelogBtn.className = 'settingsBtn';
  changelogBtn.innerHTML = '<span class="material-icons">article</span> Show';
  changelogBtn.addEventListener('click', () => {
    ipcRenderer.invoke('get-version').then((ver: string) => showChangelogNow(ver));
  });
  changelogBtnRow.appendChild(changelogBtn);
  body.appendChild(changelogBtnRow);

  body.appendChild(createKeybindRow('Toggle Fullscreen', 'Fullscreen the game window (default F11)', bag.binds.fullscreenToggle, (b) => {
    bag.binds.fullscreenToggle = b;
    bag.saveBinds();
  }, undefined, true));
}

function buildGameSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = { rawInput: true, showPing: true, hpEnemyCounter: true, hideBunnies: false, ...gameConf };
  const ui = { deathscreenAnimation: false, hideMenuPopups: false, menuTimer: true, watermark: true, doublePing: true, ...uiConfRaw };

  function saveGame(): void {
    ipcRenderer.invoke('set-config', 'game', game);
  }
  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  if (bag.isWindows) {
    body.appendChild(createToggleRow({
      label: 'Raw Input',
      desc: 'Bypass OS mouse acceleration for direct 1:1 sensor input (Windows only)',
      checked: game.rawInput ?? true, refreshOnly: true,
      onChange: (v) => { game.rawInput = v; saveGame(); },
    }));
  }

  body.appendChild(createToggleRow({
    label: 'Show Ping in Player List',
    desc: 'Replace the ping icon with numeric millisecond values in the player list',
    checked: game.showPing ?? true, refreshOnly: true,
    onChange: (v) => { game.showPing = v; saveGame(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Double Ping Display',
    desc: 'Show the real ping value (Krunker displays half the actual latency)',
    checked: ui.doublePing ?? true, refreshOnly: true,
    onChange: (v) => { ui.doublePing = v; saveUI(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Hardpoint Enemy Counter',
    desc: 'Show enemy capture points in Hardpoint mode',
    checked: game.hpEnemyCounter ?? true, refreshOnly: true,
    onChange: (v) => {
      game.hpEnemyCounter = v; saveGame();
      if (v) initHPCounter(); else destroyHPCounter();
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Hide Bunny NPCs',
    desc: 'Block the bunny NPC models that spawn in public matches',
    checked: game.hideBunnies ?? false, refreshOnly: true,
    onChange: (v) => { game.hideBunnies = v; saveGame(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Block Death Screen Animation',
    desc: 'Disable the slide-in animation on the death screen',
    checked: ui.deathscreenAnimation, instant: true,
    onChange: (v) => { ui.deathscreenAnimation = v; saveUI(); setDeathAnimBlock(v); },
  }));

  body.appendChild(createToggleRow({
    label: 'Hide Menu Popups',
    desc: 'Hide promotional notifications, offers, and streams on the main menu',
    checked: ui.hideMenuPopups, instant: true,
    onChange: (v) => {
      ui.hideMenuPopups = v; saveUI();
      if (v) startHidePopups(); else stopHidePopups();
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Menu Timer',
    desc: 'Show the game/spectate timer on the menu screen',
    checked: ui.menuTimer ?? true, instant: true,
    onChange: (v) => { ui.menuTimer = v; saveUI(); setMenuTimer(v); },
  }));

  body.appendChild(createToggleRow({
    label: 'KCC Watermark',
    desc: 'Show the KCC version watermark in-game and on the menu',
    checked: ui.watermark ?? true, instant: true,
    onChange: (v) => { ui.watermark = v; saveUI(); setWatermark(v); },
  }));

  if (ui.deathscreenAnimation) setDeathAnimBlock(true);
  if (ui.menuTimer ?? true) setMenuTimer(true);
  if (ui.hideMenuPopups) startHidePopups();
}

function buildKeystrokesRows(body: HTMLElement): void {
  const defaults: KeystrokesConfig = {
    enabled: false, size: 2.5, auxKey1: 'r', auxKey2: 'n',
    showAuxKeys: true, mouseEnabled: false,
  };
  const ks: KeystrokesConfig = { ...defaults };
  let loaded = false;

  function save(): void {
    if (!loaded) return;
    ipcRenderer.invoke('set-config', 'keystrokes', ks);
    updateKeystrokes(ks);
  }

  const enableRow = createToggleRow({
    label: 'Keystrokes Overlay',
    desc: 'Show on-screen WASD/Shift/Space + 2 aux keys (great for streaming)',
    checked: false, instant: true,
    onChange: (v) => { ks.enabled = v; save(); },
  });
  body.appendChild(enableRow);

  const mouseRow = createToggleRow({
    label: 'Mouse Overlay',
    desc: 'Show on-screen mouse buttons (L/M/R) and scroll wheel direction',
    checked: false, instant: true,
    onChange: (v) => { ks.mouseEnabled = v; save(); },
  });
  body.appendChild(mouseRow);

  const sizeRow = createNumberRow({
    label: 'Overlay Size',
    desc: 'Visual scale of the keystroke and mouse indicators (rem)',
    min: 1, max: 6, step: 0.1, value: 2.5, instant: true,
    onChange: (v) => { ks.size = v; save(); },
  });
  body.appendChild(sizeRow);

  const showAuxRow = createToggleRow({
    label: 'Show Aux Keys',
    desc: 'Display the two configurable aux key indicators in the keyboard overlay',
    checked: true, instant: true,
    onChange: (v) => { ks.showAuxKeys = v; save(); },
  });
  body.appendChild(showAuxRow);

  const aux1Row = createSimpleKeyRow({
    label: 'Aux Key 1',
    desc: 'First configurable key (default R, e.g. weapon switch). Click to rebind.',
    value: 'r', instant: true,
    onChange: (v) => { ks.auxKey1 = v; save(); },
  });
  body.appendChild(aux1Row);

  const aux2Row = createSimpleKeyRow({
    label: 'Aux Key 2',
    desc: 'Second configurable key (default N, e.g. knife). Click to rebind.',
    value: 'n', instant: true,
    onChange: (v) => { ks.auxKey2 = v; save(); },
  });
  body.appendChild(aux2Row);

  const KEYSTROKES_CREDIT_URL = 'https://gist.github.com/KraXen72/2ea1332440b0c66b83ca9b73afc38269';
  const creditRow = document.createElement('div');
  creditRow.className = 'setting settName safety-0';
  creditRow.innerHTML =
    '<span class="setting-title" style="font-weight:normal;opacity:0.75;font-size:0.9em;">' +
      'Keyboard overlay adapted from <a class="kcc-credit-link" style="color:#4cb3ff;cursor:pointer;text-decoration:underline;">KraXen72\'s Keystrokes userscript</a> for the Crankshaft Krunker client.' +
    '</span>';
  const creditLink = creditRow.querySelector('.kcc-credit-link') as HTMLElement;
  creditLink.addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.invoke('open-external', KEYSTROKES_CREDIT_URL);
  });
  body.appendChild(creditRow);

  ipcRenderer.invoke('get-config', 'keystrokes').then((conf: KeystrokesConfig | undefined) => {
    Object.assign(ks, defaults, conf || {});
    const enableCb = enableRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (enableCb) enableCb.checked = !!ks.enabled;
    const mouseCb = mouseRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (mouseCb) mouseCb.checked = !!ks.mouseEnabled;
    const sizeRange = sizeRow.querySelector('input[type="range"]') as HTMLInputElement;
    const sizeNum = sizeRow.querySelector('input[type="number"]') as HTMLInputElement;
    if (sizeRange) sizeRange.value = String(ks.size);
    if (sizeNum) sizeNum.value = String(ks.size);
    const showAuxCb = showAuxRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (showAuxCb) showAuxCb.checked = !!ks.showAuxKeys;
    const aux1KeyEl = aux1Row.querySelector('.kcc-keyIcon') as HTMLElement;
    if (aux1KeyEl) aux1KeyEl.textContent = (ks.auxKey1 || 'R').toUpperCase();
    const aux2KeyEl = aux2Row.querySelector('.kcc-keyIcon') as HTMLElement;
    if (aux2KeyEl) aux2KeyEl.textContent = (ks.auxKey2 || 'N').toUpperCase();
    loaded = true;
  }).catch(() => { loaded = true; });
}

function buildPerformanceSection(
  body: HTMLElement, perfConf: any, isWindows: boolean,
): void {
  const perf = { fpsUnlocked: true, cpuThrottleGame: 1, cpuThrottleMenu: 1.5, processPriority: 'Normal', ...perfConf };

  function savePerf(): void {
    ipcRenderer.invoke('set-config', 'performance', perf);
  }

  body.appendChild(createToggleRow({
    label: 'Unlimited FPS',
    desc: 'Uncap the frame rate (requires restart)',
    checked: perf.fpsUnlocked, restart: true,
    onChange: (v) => { perf.fpsUnlocked = v; savePerf(); },
  }));

  body.appendChild(createNumberRow({
    label: 'CPU Throttle (Game)', desc: 'CPU throttle rate during gameplay (1 = no throttle, 3 = heavy throttle)',
    min: 1, max: 3, step: 0.01, value: perf.cpuThrottleGame, instant: true, safety: 2,
    onChange: (v) => { perf.cpuThrottleGame = v; savePerf(); },
  }));

  body.appendChild(createNumberRow({
    label: 'CPU Throttle (Menu)', desc: 'CPU throttle rate on menu screens (1 = no throttle, 3 = heavy throttle)',
    min: 1, max: 3, step: 0.01, value: perf.cpuThrottleMenu, instant: true, safety: 1,
    onChange: (v) => { perf.cpuThrottleMenu = v; savePerf(); },
  }));

  if (isWindows) {
    body.appendChild(createSelectRow({
      label: 'Process Priority',
      desc: 'OS-level process priority for the client (Windows only)',
      options: [
        { value: 'Normal', label: 'Normal' },
        { value: 'Above Normal', label: 'Above Normal' },
        { value: 'High', label: 'High' },
        { value: 'Below Normal', label: 'Below Normal' },
        { value: 'Low', label: 'Low' },
      ],
      value: perf.processPriority, restart: true, safety: 2,
      onChange: (v) => { perf.processPriority = v; savePerf(); },
    }));
  }
}

function buildSwapperSection(body: HTMLElement, swapperConf: any): void {
  const swapEnabled = swapperConf ? swapperConf.enabled : true;

  body.appendChild(createToggleRow({
    label: 'Resource Swapper',
    desc: 'Replace game textures, sounds, and models with local files',
    checked: swapEnabled,
    restart: true,
    onChange: (v) => {
      ipcRenderer.invoke('get-config', 'swapper').then((conf: any) => {
        ipcRenderer.invoke('set-config', 'swapper', { enabled: v, path: conf ? conf.path : '' });
      });
    },
  }));

  const folderRow = document.createElement('div');
  folderRow.className = 'setting settName safety-0 has-button';
  folderRow.innerHTML =
    '<span class="setting-title">Swapper Folder</span>' +
    '<div class="setting-desc-new">Place replacement assets here (textures/, sound/, models/)</div>';
  const swapFolderBtn = document.createElement('div');
  swapFolderBtn.className = 'settingsBtn';
  swapFolderBtn.title = 'Open Folder';
  swapFolderBtn.innerHTML = '<span class="material-icons">folder</span> Swapper';
  swapFolderBtn.addEventListener('click', () => ipcRenderer.invoke('open-swap-folder'));
  folderRow.appendChild(swapFolderBtn);
  body.appendChild(folderRow);
}

function buildAppearanceSection(body: HTMLElement, uiConfRaw: any): void {
  const ui = { cssTheme: 'disabled', loadingTheme: 'disabled', backgroundUrl: '', ...uiConfRaw };

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  // ── CSS Theme selector (populated from swap/themes/) ──
  const themeRow = document.createElement('div');
  themeRow.className = 'setting settName safety-0 sel has-button';
  themeRow.innerHTML =
    '<span class="setting-title">CSS Theme</span>' +
    '<div class="setting-desc-new">Load a custom CSS theme from swap/themes/</div>';
  const themeSelect = document.createElement('select');
  themeSelect.className = 's-update inputGrey2';
  themeSelect.innerHTML = '<option value="disabled">Loading...</option>';
  themeRow.appendChild(themeSelect);
  const themeFolderBtn = document.createElement('div');
  themeFolderBtn.className = 'settingsBtn';
  themeFolderBtn.title = 'Open Themes Folder';
  themeFolderBtn.innerHTML = '<span class="material-icons">folder</span>';
  themeFolderBtn.addEventListener('click', () => ipcRenderer.invoke('open-themes-folder'));
  themeRow.appendChild(themeFolderBtn);
  body.appendChild(themeRow);

  ipcRenderer.invoke('list-themes').then((themes: Array<{ id: string; label: string }>) => {
    themeSelect.innerHTML = '';
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === ui.cssTheme) opt.selected = true;
      themeSelect.appendChild(opt);
    }
  });

  themeSelect.addEventListener('change', () => {
    ui.cssTheme = themeSelect.value;
    saveUI();
    onSettingChanged('refresh');
  });

  // ── Loading Screen Background ──
  const bgRow = document.createElement('div');
  bgRow.className = 'setting settName safety-0 sel has-button';
  bgRow.innerHTML =
    '<span class="setting-title">Loading Background</span>' +
    '<div class="setting-desc-new">Custom background image for the loading screen (swap/backgrounds/)</div>';
  const bgSelect = document.createElement('select');
  bgSelect.className = 's-update inputGrey2';
  bgSelect.innerHTML = '<option value="disabled">Loading...</option>';
  bgRow.appendChild(bgSelect);
  const bgFolderBtn = document.createElement('div');
  bgFolderBtn.className = 'settingsBtn';
  bgFolderBtn.title = 'Open Backgrounds Folder';
  bgFolderBtn.innerHTML = '<span class="material-icons">folder</span>';
  bgFolderBtn.addEventListener('click', () => ipcRenderer.invoke('open-backgrounds-folder'));
  bgRow.appendChild(bgFolderBtn);
  body.appendChild(bgRow);

  ipcRenderer.invoke('list-loading-themes').then((themes: Array<{ id: string; label: string }>) => {
    bgSelect.innerHTML = '';
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === ui.loadingTheme) opt.selected = true;
      bgSelect.appendChild(opt);
    }
  });

  bgSelect.addEventListener('change', () => {
    ui.loadingTheme = bgSelect.value;
    saveUI();
    onSettingChanged('refresh');
  });

  // ── Background URL (overrides loading theme selection) ──
  const urlRow = document.createElement('div');
  urlRow.className = 'setting settName safety-0';
  urlRow.innerHTML =
    refreshIcon('refresh-icon') +
    '<span class="setting-title">Background URL</span>' +
    '<div class="setting-desc-new">Direct image URL for loading screen (overrides dropdown above)</div>';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'inputGrey2';
  urlInput.placeholder = 'https://example.com/image.png';
  urlInput.value = ui.backgroundUrl || '';
  urlInput.style.width = '300px';
  urlInput.addEventListener('change', () => {
    ui.backgroundUrl = urlInput.value.trim();
    saveUI();
    onSettingChanged('refresh');
  });
  urlRow.appendChild(urlInput);
  body.appendChild(urlRow);
}

function buildMatchmakerSection(body: HTMLElement, mmConf: any, bag: SettingsBag): void {
  const mm = mmConf || { enabled: true, regions: [], gamemodes: [], minPlayers: 1, maxPlayers: 6, minRemainingTime: 120, openServerBrowser: true, sortByPlayers: false, rankedMatchSound: '' };
  if (mm.rankedMatchSound === undefined) mm.rankedMatchSound = '';

  function saveMM(): void {
    ipcRenderer.invoke('set-config', 'matchmaker', mm);
  }

  body.appendChild(createToggleRow({
    label: 'Custom Matchmaker',
    desc: 'Use the matchmaker hotkey to find a game matching your criteria',
    checked: mm.enabled, instant: true,
    onChange: (v) => { mm.enabled = v; saveMM(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Open Server Browser on Cancel',
    desc: 'Opens the server browser when no game is found and you cancel',
    checked: mm.openServerBrowser, instant: true,
    onChange: (v) => { mm.openServerBrowser = v; saveMM(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Prioritize Player Count',
    desc: 'Sort results by most players first, then by ping (default is ping first)',
    checked: mm.sortByPlayers ?? false, instant: true,
    onChange: (v) => { mm.sortByPlayers = v; saveMM(); },
  }));

  body.appendChild(createKeybindRow('Matchmaker Hotkey', 'Key to trigger the custom matchmaker', bag.binds.matchmaker, (b) => {
    bag.binds.matchmaker = b;
    bag.saveBinds();
  }, undefined, true));
  body.appendChild(createKeybindRow('Matchmaker Cancel', 'Key to dismiss the matchmaker popup', bag.binds.matchmakerCancel, (b) => {
    bag.binds.matchmakerCancel = b;
    bag.saveBinds();
  }, undefined, true));

  body.appendChild(createNumberRow({
    label: 'Min Players', desc: 'Minimum player count in lobby (0-7)',
    min: 0, max: 7, value: mm.minPlayers, instant: true,
    onChange: (v) => { mm.minPlayers = v; saveMM(); },
  }));

  body.appendChild(createNumberRow({
    label: 'Max Players', desc: 'Maximum player count in lobby (0-7)',
    min: 0, max: 7, value: mm.maxPlayers, instant: true,
    onChange: (v) => { mm.maxPlayers = v; saveMM(); },
  }));

  body.appendChild(createNumberRow({
    label: 'Min Remaining Time', desc: 'Minimum seconds remaining in match (0-480)',
    min: 0, max: 480, value: mm.minRemainingTime, instant: true,
    onChange: (v) => { mm.minRemainingTime = v; saveMM(); },
  }));

  body.appendChild(createCheckboxGrid({
    header: 'Regions (none selected = all)',
    items: MATCHMAKER_REGIONS.map(r => ({ value: r, label: MATCHMAKER_REGION_NAMES[r] || r })),
    selected: mm.regions,
    onChange: () => saveMM(),
  }));

  body.appendChild(createCheckboxGrid({
    header: 'Gamemodes (none selected = all)',
    items: MATCHMAKER_GAMEMODE_FILTER.map(gm => ({ value: gm, label: gm })),
    selected: mm.gamemodes,
    onChange: () => saveMM(),
  }));

  if (!mm.maps) mm.maps = [];
  body.appendChild(createCheckboxGrid({
    header: 'Maps (none selected = all)',
    items: MATCHMAKER_MAP_FILTER.map(m => ({ value: m, label: MATCHMAKER_MAP_NAMES[m] || m })),
    selected: mm.maps,
    onChange: () => saveMM(),
  }));

  // ── Ranked Match Sound (URL or local file path; empty = default) ──
  const soundRow = document.createElement('div');
  soundRow.className = 'setting settName safety-0 has-button';
  soundRow.innerHTML =
    '<span class="setting-title">Ranked Match Sound</span>' +
    '<div class="setting-desc-new">Custom sound played when a ranked match is found. Accepts a URL or a local file path; leave blank for default.</div>';
  const soundInput = document.createElement('input');
  soundInput.type = 'text';
  soundInput.className = 'inputGrey2';
  soundInput.placeholder = 'https://example.com/sound.mp3  or  C:\\path\\to\\file.mp3';
  soundInput.value = mm.rankedMatchSound || '';
  soundInput.style.width = '300px';
  soundInput.addEventListener('change', () => {
    mm.rankedMatchSound = soundInput.value.trim();
    saveMM();
  });
  soundRow.appendChild(soundInput);
  const soundBtnWrap = document.createElement('div');
  soundBtnWrap.style.cssText = 'grid-area: button; display: inline-flex; gap: 0.25rem; margin: 0 .5rem;';
  const soundBrowseBtn = document.createElement('div');
  soundBrowseBtn.className = 'settingsBtn';
  soundBrowseBtn.title = 'Browse for Audio File';
  soundBrowseBtn.style.margin = '0';
  soundBrowseBtn.innerHTML = '<span class="material-icons">folder_open</span>';
  soundBrowseBtn.addEventListener('click', async () => {
    const path: string = await ipcRenderer.invoke('pick-audio-file');
    if (path) {
      soundInput.value = path;
      mm.rankedMatchSound = path;
      saveMM();
    }
  });
  soundBtnWrap.appendChild(soundBrowseBtn);
  let previewAudio: HTMLAudioElement | null = null;
  const soundPlayBtn = document.createElement('div');
  soundPlayBtn.className = 'settingsBtn';
  soundPlayBtn.title = 'Preview Sound';
  soundPlayBtn.style.margin = '0';
  soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
  soundPlayBtn.addEventListener('click', async () => {
    if (previewAudio) { previewAudio.pause(); previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; return; }
    const url: string = await ipcRenderer.invoke('resolve-ranked-sound', soundInput.value.trim());
    previewAudio = new Audio(url);
    soundPlayBtn.innerHTML = '<span class="material-icons">stop</span>';
    previewAudio.onended = () => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; };
    previewAudio.onerror = () => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; };
    previewAudio.play().catch(() => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; });
  });
  soundBtnWrap.appendChild(soundPlayBtn);
  soundRow.appendChild(soundBtnWrap);
  body.appendChild(soundRow);
}

function buildDiscordSection(body: HTMLElement, discordConf: any): void {
  const discord = {
    enabled: false,
    showMapMode: true,
    showClass: true,
    showTimer: true,
    showStatus: true,
    ...discordConf,
  };

  body.appendChild(createToggleRow({
    label: 'Discord Rich Presence',
    desc: 'Show game activity in your Discord profile',
    checked: discord.enabled,
    restart: true,
    onChange: (v) => {
      discord.enabled = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Map & Gamemode',
    desc: 'Display the current map and gamemode',
    checked: discord.showMapMode,
    refreshOnly: true,
    onChange: (v) => {
      discord.showMapMode = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Class',
    desc: 'Display your current class name',
    checked: discord.showClass,
    refreshOnly: true,
    onChange: (v) => {
      discord.showClass = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Elapsed Time',
    desc: 'Display how long you\'ve been in the current match',
    checked: discord.showTimer,
    refreshOnly: true,
    onChange: (v) => {
      discord.showTimer = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Menu/Spectating Status',
    desc: 'Display "In Menus" or "Spectating" when not in a match',
    checked: discord.showStatus,
    refreshOnly: true,
    onChange: (v) => {
      discord.showStatus = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));
}

// ── Alt Manager helpers ──
function switchToAccount(account: { username: string; password: string }): void {
  const w = window as any;
  if (typeof w.loginOrRegister !== 'function') return;

  function doLogin(): void {
    w.loginOrRegister();
    queueMicrotask(() => {
      const toggleBtn = document.querySelector('.auth-toggle-btn') as HTMLElement;
      if (toggleBtn && toggleBtn.textContent?.includes('username')) toggleBtn.click();
      queueMicrotask(() => {
        const nameInput = document.querySelector('#accName') as HTMLInputElement;
        const passInput = document.querySelector('#accPass') as HTMLInputElement;
        if (!nameInput || !passInput) return;
        nameInput.value = account.username;
        passInput.value = account.password;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        const submitBtn = document.querySelector('.io-button') as HTMLElement;
        if (submitBtn) submitBtn.click();
      });
    });
  }

  if (typeof w.logoutAcc === 'function') {
    w.logoutAcc();
    setTimeout(doLogin, 500);
  } else {
    doLogin();
  }
}

function buildAccountsSection(body: HTMLElement, accountsArr: any[]): void {
  const accounts: any[] = accountsArr || [];

  const addBtn = document.createElement('div');
  addBtn.className = 'setting settName safety-0 has-button';
  addBtn.innerHTML =
    '<span class="setting-title">Add Account</span>' +
    '<button class="kcc-acc-save" style="margin-left:auto;padding:4px 14px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:var(--kcc-accent);color:#fff;">+ Add</button>' +
    '<div class="setting-desc-new">Save a Krunker account for quick switching</div>';
  body.appendChild(addBtn);

  const form = document.createElement('div');
  form.className = 'kcc-acc-form';
  form.style.display = 'none';
  form.innerHTML =
    '<input type="text" placeholder="Label (e.g. Main, Alt1)" class="kcc-acc-label">' +
    '<input type="text" placeholder="Krunker Username" class="kcc-acc-user">' +
    '<input type="password" placeholder="Krunker Password" class="kcc-acc-pass">' +
    '<div class="kcc-acc-form-buttons">' +
      '<button class="kcc-acc-save">Save</button>' +
      '<button class="kcc-acc-cancel">Cancel</button>' +
    '</div>';
  body.appendChild(form);

  const labelIn = form.querySelector('.kcc-acc-label') as HTMLInputElement;
  const userIn = form.querySelector('.kcc-acc-user') as HTMLInputElement;
  const passIn = form.querySelector('.kcc-acc-pass') as HTMLInputElement;

  // Stop Krunker's global keydown handler from eating keystrokes in our inputs
  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', (e) => e.stopPropagation());
  });

  addBtn.querySelector('button')!.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? '' : 'none';
  });

  form.querySelector('.kcc-acc-cancel')!.addEventListener('click', () => {
    form.style.display = 'none';
  });

  const listEl = document.createElement('div');
  body.appendChild(listEl);

  function renderList(): void {
    listEl.innerHTML = '';
    if (accounts.length === 0) {
      listEl.innerHTML = '<div class="kcc-acc-empty">No saved accounts</div>';
      return;
    }
    accounts.forEach((acc, i) => {
      const row = document.createElement('div');
      row.className = 'kcc-acc-item';
      row.innerHTML =
        '<div class="kcc-acc-item-info">' +
          '<span class="kcc-acc-item-label">' + escapeHtml(acc.label) + '</span>' +
        '</div>' +
        '<div class="kcc-acc-item-actions">' +
          '<button class="kcc-acc-switch">Switch</button>' +
          '<button class="kcc-acc-delete">Delete</button>' +
        '</div>';
      row.querySelector('.kcc-acc-switch')!.addEventListener('click', () => {
        ipcRenderer.invoke('alt-get-credentials', i).then((creds: { username: string; password: string } | null) => {
          if (creds) switchToAccount(creds);
        });
      });
      row.querySelector('.kcc-acc-delete')!.addEventListener('click', () => {
        ipcRenderer.invoke('alt-remove', i).then(() => {
          accounts.splice(i, 1);
          renderList();
        });
      });
      listEl.appendChild(row);
    });
  }
  renderList();

  form.querySelector('.kcc-acc-save')!.addEventListener('click', () => {
    const label = labelIn.value.trim();
    const user = userIn.value.trim();
    const pass = passIn.value;
    if (!label || !user || !pass) return;
    const newAcc = { label, username: user, password: pass };
    ipcRenderer.invoke('alt-save', newAcc).then(() => {
      accounts.push({ label });
      labelIn.value = '';
      userIn.value = '';
      passIn.value = '';
      form.style.display = 'none';
      renderList();
    });
  });
}

function buildChatSection(body: HTMLElement, gameConf: any, translatorConf: any): void {
  const game = { betterChat: true, chatHistorySize: 200, ...gameConf };

  function saveGame(): void {
    ipcRenderer.invoke('set-config', 'game', game);
  }

  body.appendChild(createToggleRow({
    label: 'Better Chat',
    desc: 'Merge team and all-chat with colored [T]/[M] prefixes',
    checked: game.betterChat, instant: true,
    onChange: (v) => { game.betterChat = v; saveGame(); setBetterChat(v); },
  }));

  body.appendChild(createNumberRow({
    label: 'Chat History Size', desc: 'Maximum chat messages to keep (0 to disable history preservation)',
    min: 0, max: 1000, value: game.chatHistorySize, instant: true,
    onChange: (v) => { game.chatHistorySize = v; saveGame(); setChatHistorySize(v); },
  }));

  // Translator settings inline
  const tl = { enabled: true, targetLanguage: 'en', showLanguageTag: true, customSkipWords: '', ...translatorConf };

  function saveTL(): void {
    ipcRenderer.invoke('set-config', 'translator', tl);
  }

  body.appendChild(createToggleRow({
    label: 'Chat Translator',
    desc: 'Automatically translate non-English chat messages',
    checked: tl.enabled, instant: true,
    onChange: (v) => {
      tl.enabled = v;
      saveTL();
      updateTranslatorConfig({ enabled: v });
    },
  }));

  body.appendChild(createSelectRow({
    label: 'Target Language',
    desc: 'Language to translate messages into', instant: true,
    options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'ru', label: 'Russian' },
      { value: 'ja', label: 'Japanese' },
      { value: 'ko', label: 'Korean' },
      { value: 'zh', label: 'Chinese' },
      { value: 'ar', label: 'Arabic' },
      { value: 'hi', label: 'Hindi' },
      { value: 'tr', label: 'Turkish' },
      { value: 'pl', label: 'Polish' },
      { value: 'it', label: 'Italian' },
      { value: 'nl', label: 'Dutch' },
    ],
    value: tl.targetLanguage,
    onChange: (v) => {
      tl.targetLanguage = v;
      saveTL();
      updateTranslatorConfig({ targetLanguage: v });
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Language Tag',
    desc: 'Show detected language code before translations (e.g. [FR])',
    checked: tl.showLanguageTag, instant: true,
    onChange: (v) => {
      tl.showLanguageTag = v;
      saveTL();
      updateTranslatorConfig({ showLanguageTag: v });
    },
  }));

  // Custom skip words — messages made entirely of these (plus built-in skip terms) won't be translated.
  const skipRow = document.createElement('div');
  skipRow.className = 'setting settName safety-0';
  skipRow.innerHTML =
    '<span class="setting-title">Custom Skip Words</span>' +
    '<div class="setting-desc-new">Comma-separated words to ignore (e.g. your nickname, friends\' names). Applies instantly.</div>';
  const skipInput = document.createElement('input');
  skipInput.type = 'text';
  skipInput.className = 'inputGrey2';
  skipInput.placeholder = 'jakk, bigj, etc.';
  skipInput.value = tl.customSkipWords || '';
  skipInput.style.width = '300px';
  skipInput.addEventListener('change', () => {
    tl.customSkipWords = skipInput.value;
    saveTL();
    updateTranslatorConfig({ customSkipWords: skipInput.value });
  });
  skipRow.appendChild(skipInput);
  body.appendChild(skipRow);
}

function buildAdvancedSection(
  body: HTMLElement, advConf: any, isWindows: boolean,
): void {
  const advDefaults = {
    removeUselessFeatures: true,
    gpuRasterizing: false,
    helpfulFlags: true,
    increaseLimits: false,
    lowLatency: false,
    experimentalFlags: false,
    angleBackend: 'default',
    verboseLogging: false,
  };
  const adv = { ...advDefaults, ...advConf };

  function saveAdv(): void {
    ipcRenderer.invoke('set-config', 'advanced', adv);
  }

  const angleOptions: Array<{ value: string; label: string }> = isWindows
    ? [
        { value: 'default', label: 'Default (D3D11)' },
        { value: 'gl',      label: 'OpenGL' },
        { value: 'd3d9',    label: 'Direct3D 9' },
        { value: 'd3d11',   label: 'Direct3D 11' },
        { value: 'd3d11on12', label: 'D3D11on12' },
        { value: 'vulkan',  label: 'Vulkan' },
      ]
    : [
        { value: 'default', label: 'Default' },
        { value: 'gl',     label: 'OpenGL' },
        { value: 'vulkan', label: 'Vulkan' },
      ];

  body.appendChild(createSelectRow({
    label: 'ANGLE Backend',
    desc: 'Graphics API used for WebGL rendering',
    options: angleOptions,
    value: adv.angleBackend, restart: true,
    onChange: (v) => { adv.angleBackend = v; saveAdv(); },
  }));

  const advToggles: Array<{ key: string; label: string; desc: string; safety: number }> = [
    { key: 'removeUselessFeatures', label: 'Remove Useless Features', desc: 'Disables crash reporting, metrics, print preview, and other unused Chromium features', safety: 1 },
    { key: 'gpuRasterizing', label: 'GPU Rasterization', desc: 'Force GPU rasterization and out-of-process rasterization', safety: 2 },
    { key: 'helpfulFlags', label: 'Useful Flags', desc: 'Enables WebGL, JS harmony, V8 features, background throttle prevention, and autoplay bypass', safety: 3 },
    { key: 'increaseLimits', label: 'Increase Limits', desc: 'Raises renderer process, WebGL context, and WebRTC CPU limits; ignores GPU blocklist', safety: 4 },
    { key: 'lowLatency', label: 'Low Latency Flags', desc: 'Enables high-resolution timer, QUIC protocol, and high-performance GPU', safety: 4 },
    { key: 'experimentalFlags', label: 'Experimental Flags', desc: 'Enables accelerated video decode, native GPU memory buffers, high DPI support, and disables pings/proxy', safety: 4 },
  ];

  for (const t of advToggles) {
    body.appendChild(createToggleRow({
      label: t.label, desc: t.desc,
      checked: !!adv[t.key], restart: true,
      safety: t.safety,
      onChange: (v) => { adv[t.key] = v; saveAdv(); },
    }));
  }

  body.appendChild(createToggleRow({
    label: 'Verbose Logging',
    desc: 'Forward all preload console output to the Electron log file',
    checked: adv.verboseLogging, instant: true,
    onChange: (v) => {
      adv.verboseLogging = v; saveAdv();
      _verboseLogging = v;
    },
  }));
}

// ── Search filter + "no settings" cleanup ──
function applySearchFilter(container: HTMLElement, holder: HTMLElement, searchQuery: string): void {
  const query = searchQuery.toLowerCase();
  const sections = Array.from(container.children).filter(el => el.querySelector('.setHed'));
  sections.forEach(sectionEl => {
    const sectionTitle = sectionEl.querySelector('.setHed')?.textContent?.toLowerCase() || '';
    const body = sectionEl.querySelector('.setBodH');
    if (!body) { (sectionEl as HTMLElement).style.display = 'none'; return; }

    if (sectionTitle.includes(query)) {
      body.classList.remove('setting-category-collapsed');
      return;
    }

    let visibleCount = 0;
    Array.from(body.children).forEach(child => {
      const el = child as HTMLElement;
      const text = el.textContent?.toLowerCase() || '';
      if (text.includes(query)) {
        el.style.display = '';
        visibleCount++;
      } else {
        el.style.display = 'none';
      }
    });
    if (visibleCount === 0) {
      (sectionEl as HTMLElement).style.display = 'none';
    } else {
      body.classList.remove('setting-category-collapsed');
    }
  });

  const hasVisible = sections.find(el => (el as HTMLElement).style.display !== 'none');
  if (hasVisible) {
    Array.from(holder.children).forEach(child => {
      if ((child as HTMLElement).textContent?.toLowerCase().includes('no settings')) {
        (child as HTMLElement).remove();
      }
    });
  }
}

function renderSettings(searchQuery?: string): void {
  const holder = document.getElementById('settHolder');
  if (!holder) return;

  refreshLevel = RefreshLevel.none;
  if (refreshPopupEl) { refreshPopupEl.remove(); refreshPopupEl = null; }

  if (searchQuery) {
    const existing = holder.querySelector('.kcc-settings');
    if (existing) existing.remove();
  } else {
    while (holder.firstChild) holder.removeChild(holder.firstChild);
  }

  const container = document.createElement('div');
  container.className = 'kcc-settings';

  // ── Action button grid ──
  const actionGrid = document.createElement('div');
  actionGrid.className = 'kcc-action-grid';

  const actionButtons: Array<{ label: string; color: string; full?: boolean; action: () => void }> = [
    { label: 'Open Resource Swapper', color: 'kcc-ab-pink', action: () => ipcRenderer.invoke('open-swap-folder') },
    { label: 'Reset Resource Swapper', color: 'kcc-ab-pink', action: () => {
      if (confirm('Reset resource swapper? This will delete all files in the swapper folder.')) {
        ipcRenderer.invoke('reset-swapper');
      }
    }},
    { label: 'Open Electron Logs', color: 'kcc-ab-red', action: () => ipcRenderer.invoke('open-electron-log') },
    { label: 'Restart Client', color: 'kcc-ab-orange', full: true, action: () => ipcRenderer.invoke('restart-client') },
    { label: 'Reset Options', color: 'kcc-ab-red', action: () => {
      if (confirm('Reset all settings to defaults? The client will restart.')) {
        ipcRenderer.invoke('reset-options');
      }
    }},
    { label: 'Delete All Data', color: 'kcc-ab-red', action: () => {
      if (confirm('Delete all data (config, logs)? Scripts are preserved. The client will restart.')) {
        ipcRenderer.invoke('delete-all-data');
      }
    }},
  ];

  for (const ab of actionButtons) {
    const btn = document.createElement('button');
    btn.className = 'kcc-action-btn ' + ab.color + (ab.full ? ' full' : '');
    btn.textContent = ab.label;
    btn.addEventListener('click', ab.action);
    actionGrid.appendChild(btn);
  }
  container.appendChild(actionGrid);

  // Load all configs in a single IPC call + platform info.
  // Section shells are created inside the .then() so the persisted collapsed
  // state is loaded before createSection consults it.
  Promise.all([
    ipcRenderer.invoke('get-all-config', ['swapper', 'matchmaker', 'keybinds', 'advanced', 'game', 'ui', 'discord', 'translator', 'accounts', 'performance', 'collapsedSections']),
    ipcRenderer.invoke('get-platform'),
  ]).then(([allConf, platformInfo]: [any, any]) => {
    collapsedState = (allConf.collapsedSections as Record<string, boolean>) || {};

    // ── Create section shells (after collapsed state is loaded) ──
    const genSec = createSection('General');
    container.appendChild(genSec.section);
    const gameSec = createSection('Game');
    container.appendChild(gameSec.section);
    const perfSec = createSection('Performance');
    container.appendChild(perfSec.section);
    const swapSec = createSection('Swapper');
    container.appendChild(swapSec.section);
    const appearSec = createSection('Appearance');
    container.appendChild(appearSec.section);
    const mmSec = createSection('Matchmaker');
    container.appendChild(mmSec.section);
    const chatSec = createSection('Chat');
    container.appendChild(chatSec.section);
    const discordSec = createSection('Discord');
    container.appendChild(discordSec.section);
    const accSec = createSection('Accounts', true);
    container.appendChild(accSec.section);
    const ksSec = createSection('Keystrokes', true);
    container.appendChild(ksSec.section);
    const advSec = createSection('Advanced');
    container.appendChild(advSec.section);
    const usSec = createSection('Userscripts');
    container.appendChild(usSec.section);

    const swapperConf = allConf.swapper;
    const mmConf = allConf.matchmaker;
    const keybindsConf = allConf.keybinds;
    const advConf = allConf.advanced;
    const gameConf = allConf.game;
    const uiConfRaw = allConf.ui;
    const discordConf = allConf.discord;
    const translatorConf = allConf.translator;
    const defaultBinds = {
      matchmaker:       { key: 'F6',     ctrl: false, shift: false, alt: false },
      matchmakerCancel: { key: 'Escape', ctrl: false, shift: false, alt: false },
      fullscreenToggle: { key: 'F11',    ctrl: false, shift: false, alt: false },
    };
    const binds = { ...defaultBinds, ...keybindsConf };
    const isWindows = platformInfo && platformInfo.isWindows;

    const bag: SettingsBag = {
      binds,
      saveBinds: () => ipcRenderer.invoke('set-config', 'keybinds', binds),
      isWindows,
    };

    // Populate each section
    buildGeneralSection(genSec.body, gameConf, uiConfRaw, bag);
    buildGameSection(gameSec.body, gameConf, uiConfRaw, bag);
    buildPerformanceSection(perfSec.body, allConf.performance, isWindows);
    buildSwapperSection(swapSec.body, swapperConf);
    buildAppearanceSection(appearSec.body, uiConfRaw);
    buildMatchmakerSection(mmSec.body, mmConf, bag);
    buildChatSection(chatSec.body, gameConf, translatorConf);
    buildDiscordSection(discordSec.body, discordConf);
    buildAccountsSection(accSec.body, allConf.accounts);
    buildKeystrokesRows(ksSec.body);
    buildAdvancedSection(advSec.body, advConf, isWindows);
    renderUserscriptsSection(usSec.body);

    if (searchQuery) applySearchFilter(container, holder, searchQuery);

    holder.appendChild(container);
  }).catch((err: any) => {
    console.error('[KCC] Settings render error:', err);
  });
}

// ── Userscripts settings section ──
function renderUserscriptsSection(body: HTMLElement): void {
  ipcRenderer.invoke('get-config', 'userscripts').then((usConf: any) => {
    const us = usConf || { enabled: true, path: '' };

    body.appendChild(createToggleRow({
      label: 'Userscripts',
      desc: 'Load custom scripts from the scripts folder',
      checked: us.enabled, restart: true,
      onChange: (v) => { us.enabled = v; ipcRenderer.invoke('set-config', 'userscripts', us); },
    }));

    const usFolderRow = document.createElement('div');
    usFolderRow.className = 'setting settName safety-0 has-button';
    usFolderRow.innerHTML =
      '<span class="setting-title">Scripts Folder</span>' +
      '<div class="setting-desc-new">Place .js userscript files here</div>';
    const usFolderBtn = document.createElement('div');
    usFolderBtn.className = 'settingsBtn';
    usFolderBtn.title = 'Open Folder';
    usFolderBtn.innerHTML = '<span class="material-icons">folder</span> Scripts';
    usFolderBtn.addEventListener('click', () => ipcRenderer.invoke('userscripts-open-folder'));
    usFolderRow.appendChild(usFolderBtn);
    body.appendChild(usFolderRow);

    const scriptInstances = getInstances();
    if (scriptInstances.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'setting settName safety-0';
      emptyRow.innerHTML =
        '<div class="setting-desc-new">No userscripts found. Place .js files in the scripts folder and reload.</div>';
      body.appendChild(emptyRow);
      return;
    }

    for (const inst of scriptInstances) {
      const scriptRow = document.createElement('div');
      scriptRow.className = 'setting settName safety-0 bool';

      const displayName = escapeHtml(inst.meta.name || inst.filename);
      const metaParts: string[] = [];
      if (inst.meta.author) metaParts.push('by ' + escapeHtml(inst.meta.author));
      if (inst.meta.version) metaParts.push('v' + escapeHtml(inst.meta.version));
      const metaLine = metaParts.length > 0 ? '<span class="kcc-us-meta">' + metaParts.join(' &middot; ') + '</span>' : '';
      const descText = escapeHtml(inst.meta.desc || '');

      scriptRow.innerHTML =
        '<span class="setting-title">' + displayName + '</span>' +
        '<label class="switch">' +
          '<input type="checkbox" class="s-update"' + (inst.enabled ? ' checked' : '') + '>' +
          '<div class="slider round"></div>' +
        '</label>' +
        '<div class="setting-desc-new">' + descText + (metaLine ? '<br>' + metaLine : '') + '</div>';
      body.appendChild(scriptRow);

      const cb = scriptRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const settingsContainer = document.createElement('div');
      settingsContainer.className = 'kcc-us-settings';
      body.appendChild(settingsContainer);

      if (inst.enabled && inst.settings) {
        renderScriptSettings(inst, settingsContainer);
      }

      cb.addEventListener('change', () => {
        const { needsReload } = setScriptEnabled(inst.filename, cb.checked, _console);
        settingsContainer.innerHTML = '';
        if (cb.checked && inst.settings) {
          renderScriptSettings(inst, settingsContainer);
        }
        if (needsReload) {
          onSettingChanged('refresh');
        }
      });
    }
  });
}

function renderScriptSettings(inst: UserscriptInstance, container: HTMLElement): void {
  if (!inst.settings) return;

  for (const [, setting] of Object.entries(inst.settings)) {
    const typeClass = setting.type === 'bool' ? 'bool' : setting.type === 'sel' ? 'sel' : setting.type === 'num' ? 'num' : setting.type === 'keybind' ? 'keybind' : '';
    const row = document.createElement('div');
    row.className = 'setting settName safety-0' + (typeClass ? ' ' + typeClass : '');
    row.innerHTML =
      '<span class="setting-title">' + escapeHtml(setting.title) + '</span>' +
      (setting.desc ? '<div class="setting-desc-new">' + escapeHtml(setting.desc) + '</div>' : '');

    switch (setting.type) {
      case 'bool': {
        const label = document.createElement('label');
        label.className = 'switch';
        label.innerHTML =
          '<input type="checkbox" class="s-update"' + (setting.value ? ' checked' : '') + '>' +
          '<div class="slider round"></div>';
        row.appendChild(label);
        const input = label.querySelector('input') as HTMLInputElement;
        input.addEventListener('change', () => {
          setting.value = input.checked;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'num': {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'rb-input s-update sliderVal';
        input.value = String(setting.value);
        if (setting.min !== undefined) input.min = String(setting.min);
        if (setting.max !== undefined) input.max = String(setting.max);
        if (setting.step !== undefined) input.step = String(setting.step);
        row.appendChild(input);
        input.addEventListener('change', () => {
          setting.value = parseFloat(input.value) || 0;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'sel': {
        const select = document.createElement('select');
        select.className = 's-update inputGrey2';
        if (setting.opts) {
          for (const opt of setting.opts) {
            const option = document.createElement('option');
            option.value = String(opt);
            option.textContent = String(opt);
            if (String(opt) === String(setting.value)) option.selected = true;
            select.appendChild(option);
          }
        }
        row.appendChild(select);
        select.addEventListener('change', () => {
          setting.value = select.value;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'color': {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'kcc-color-input';
        input.value = String(setting.value) || '#ffffff';
        row.appendChild(input);
        input.addEventListener('input', () => {
          setting.value = input.value;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'keybind': {
        const bind = setting.value as Keybind;
        const keyEl = document.createElement('span');
        keyEl.className = 'keyIcon kcc-keyIcon';
        keyEl.textContent = keybindDisplayString(bind);
        keyEl.addEventListener('click', () => {
          openKeybindDialog(setting.title).then((newBind) => {
            setting.value = newBind;
            keyEl.textContent = keybindDisplayString(newBind);
            if (typeof setting.changed === 'function') setting.changed(setting.value);
            saveScriptSetting(inst);
          });
        });
        row.appendChild(keyEl);
        break;
      }
    }

    container.appendChild(row);
  }
}

function saveScriptSetting(inst: UserscriptInstance): void {
  if (!inst.settings) return;
  const prefs: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(inst.settings)) {
    prefs[k] = s.value;
  }
  ipcRenderer.invoke('userscripts-save-prefs', inst.filename, prefs);
}

// ── Hide menu popups ──
// Bundle/claim popups need clearPops(), not CSS — Krunker renders them via
// #popupHolder + #popupBack (the dim backdrop), so CSS-only hiding leaves the
// backdrop visible (the "dark screen") and breaks user-clicked bundles in the
// shop. Only fire on the main menu so shop bundles still work.
const HIDE_POPUPS_CSS =
  '#leftTabsHolder > .youNewDiv:not(#battlepassAd), .webpush-container, ' +
  '#homeStoreAd, #streamContainerNew, ' +
  '#newsHolder, #streamContainer { display: none !important; }';
let _hidePopupsStyle: HTMLStyleElement | null = null;
const _hidePopupsObservers: MutationObserver[] = [];

function dismissPromos(): void {
  const wh = document.getElementById('windowHolder');
  if (wh && wh.style.display && wh.style.display !== 'none') return;
  const bp = document.getElementById('bundlePop');
  const gp = document.getElementById('genericPop');
  if (!bp?.children.length && !gp?.classList.contains('claimPop')) return;
  (window as any).clearPops?.();
}

function startHidePopups(): void {
  if (_hidePopupsStyle) return;
  _hidePopupsStyle = document.createElement('style');
  _hidePopupsStyle.id = 'kcc-hideMenuPopups';
  _hidePopupsStyle.textContent = HIDE_POPUPS_CSS;
  document.head.appendChild(_hidePopupsStyle);

  const bp = document.getElementById('bundlePop');
  if (bp) {
    const obs = new MutationObserver(dismissPromos);
    obs.observe(bp, { childList: true });
    _hidePopupsObservers.push(obs);
  }
  const gp = document.getElementById('genericPop');
  if (gp) {
    const obs = new MutationObserver(dismissPromos);
    obs.observe(gp, { attributes: true, attributeFilter: ['class'] });
    _hidePopupsObservers.push(obs);
  }
  dismissPromos(); // Catch popups already showing
}

function stopHidePopups(): void {
  if (!_hidePopupsStyle) return;
  _hidePopupsStyle.remove();
  _hidePopupsStyle = null;
  for (const obs of _hidePopupsObservers) obs.disconnect();
  _hidePopupsObservers.length = 0;
}

// ── Matchmaker IPC listener ──
ipcRenderer.on('matchmaker-find', (_e, mmConfig: MatchmakerConfig) => {
  fetchGame(mmConfig, _console).catch((err) => _console.error('[KCC] Matchmaker error:', err));
});


// ── Wait for main process to signal page load, then poll for settings window ──
ipcRenderer.on('main_did-finish-load', () => {
  _console.log('[KCC] did-finish-load received, waiting to hook settings...');

  const isGamePage = window.location.pathname === '/' || window.location.pathname === '';

  // ── Batch all config reads into a single IPC call ──
  (window as any).closeClient = () => window.close();
  Promise.all([
    ipcRenderer.invoke('get-all-config', ['ui', 'userscripts', 'game', 'translator', 'keybinds', 'discord', 'advanced', 'performance']),
    ipcRenderer.invoke('get-platform'),
    ipcRenderer.invoke('get-version'),
  ]).then(([allConf, _platformInfo, currentVersion]: [any, any, string]) => {
    const uiConf = allConf.ui;
    const usConf = allConf.userscripts;
    const gameConf = allConf.game;
    const translatorConf = allConf.translator;
    const discordConf = allConf.discord;
    const advConf = allConf.advanced;

    // ── Verbose logging toggle ──
    _verboseLogging = advConf?.verboseLogging ?? false;

    // ── Exit button + UI toggles ──
    const showExit = uiConf ? (uiConf.showExitButton !== false) : true;
    const showExitBtn = () => {
      const btn = document.getElementById('clientExit');
      if (btn) {
        btn.style.display = showExit ? 'flex' : 'none';
        return true;
      }
      return false;
    };
    if (!showExitBtn()) {
      let exitAttempts = 0;
      const exitPoll = setInterval(() => {
        if (showExitBtn() || ++exitAttempts > 30) clearInterval(exitPoll);
      }, 500);
    }

    if (uiConf?.deathscreenAnimation) setDeathAnimBlock(true);
    if (uiConf?.hideMenuPopups) startHidePopups();
    if (uiConf?.menuTimer ?? true) setMenuTimer(true);

    // ── Double ping display ──
    if (isGamePage && (uiConf?.doublePing ?? true)) {
      initDoublePing();
    }

    // ── Show ping in player list ──
    if (isGamePage && (gameConf?.showPing ?? true)) {
      initShowPing();
    }

    // ── Raw input (Windows only — unadjustedMovement) ──
    if (isGamePage && process.platform === 'win32' && (gameConf?.rawInput ?? true)) {
      const origLock = HTMLCanvasElement.prototype.requestPointerLock;
      HTMLCanvasElement.prototype.requestPointerLock = function (opts?: any) {
        const promise = origLock.call(this, { ...opts, unadjustedMovement: true }) as any;
        if (promise && typeof promise.catch === 'function') {
          return promise.catch(() => origLock.call(this, opts));
        }
        return promise;
      };
    }

    // ── Better chat + Chat history ──
    if (isGamePage) {
      initChat({
        betterChat: gameConf?.betterChat ?? true,
        chatHistorySize: gameConf?.chatHistorySize ?? 200,
      }, _console);
    }

    // ── Competitive features ──
    if (isGamePage && (gameConf?.hpEnemyCounter ?? true)) {
      initHPCounter();
    }
    if (isGamePage) {
      initRankProgress();
    }

    // ── Keystrokes + Mouse overlay ──
    if (isGamePage) {
      ipcRenderer.invoke('get-config', 'keystrokes').then((ksConf: KeystrokesConfig | undefined) => {
        if (ksConf && (ksConf.enabled || ksConf.mouseEnabled)) initKeystrokes(ksConf);
      }).catch(() => { /* ignore */ });
    }

    // ── KCC watermark (in-game + menu) ──
    if (isGamePage) {
      setWatermark(uiConf?.watermark ?? true, currentVersion);
    }

    // ── CPU throttle state notifications ──
    if (isGamePage) {
      let inGame = false;
      setInterval(() => {
        const uiBase = document.getElementById('uiBase');
        const nowInGame = !!uiBase && uiBase.className !== 'onMenu' && uiBase.className !== '';
        if (nowInGame !== inGame) {
          inGame = nowInGame;
          ipcRenderer.send('throttle-state', inGame ? 'game' : 'menu');
        }
      }, 2000);
    }

    // ── Changelog popup ──
    if (isGamePage && (uiConf?.showChangelog ?? true)) {
      checkChangelog(currentVersion, uiConf?.lastSeenVersion || '');
    }

    // ── Battle Pass Claim All (game page only) ──
    // Poll for .bpBotH element — injects button when BP window is visible
    if (isGamePage) {
      const getClaimable = () => Array.from(document.querySelectorAll('.bpClaimB')).filter(
        (el: any) => el.offsetParent !== null && el.textContent?.trim() === 'Claim'
      );
      setInterval(() => {
        const bar = document.querySelector('.bpBotH') as HTMLElement | null;
        if (!bar || bar.offsetParent === null) return;
        const existing = document.getElementById('claimAllBtn');
        if (existing) {
          // Update state on re-check (rewards may have become claimable)
          const claimable = getClaimable();
          if (claimable.length > 0) {
            existing.textContent = 'Claim All';
            existing.classList.remove('disabled');
          } else {
            existing.textContent = 'Nothing to Claim';
            existing.classList.add('disabled');
          }
          return;
        }
        const claimable = getClaimable();
        const btn = document.createElement('div');
        btn.className = 'bpBtn skip';
        btn.id = 'claimAllBtn';
        btn.style.cssText = 'margin-left: 8px; cursor: pointer; background: #4CAF50;';
        if (claimable.length > 0) {
          btn.textContent = 'Claim All';
        } else {
          btn.textContent = 'Nothing to Claim';
          btn.classList.add('disabled');
        }
        btn.addEventListener('click', async () => {
          if (btn.classList.contains('disabled')) return;
          (window as any).playSelect?.(0.1);
          const items = getClaimable();
          if (items.length === 0) return;
          btn.textContent = 'Claiming...';
          btn.classList.add('disabled');
          for (const item of items) {
            (item as HTMLElement).click();
            await new Promise(r => setTimeout(r, 200));
          }
          const remaining = getClaimable();
          btn.textContent = remaining.length > 0 ? 'Claim All' : 'Nothing to Claim';
          btn.classList.toggle('disabled', remaining.length === 0);
        });
        bar.appendChild(btn);
      }, 500);
    }

    // ── Initialize userscripts ──
    const usEnabled = usConf ? usConf.enabled : true;
    if (usEnabled) {
      initUserscripts(_console).catch(err => _console.error('[KCC] Userscript init error:', err));
    }

    // ── Join as Spectator — auto-enable spectate on regular game join ──
    if (isGamePage && gameConf?.joinAsSpectator) {
      let attempts = 0;
      const poll = setInterval(() => {
        if (++attempts > 300) { clearInterval(poll); return; }
        const uiBase = document.getElementById('uiBase');
        if (!uiBase || uiBase.className === '') return;
        if (uiBase.className === 'onMenu') {
          const specBtn = document.querySelector('#spectButton input') as HTMLInputElement;
          if (specBtn && !specBtn.checked) {
            (window as any).setSpect(1);
          }
          clearInterval(poll);
        } else {
          clearInterval(poll);
        }
      }, 100);
    }

    // ── Initialize chat translator (game page only) ──
    if (isGamePage) {
      const mergedTl = { enabled: true, targetLanguage: 'en', showLanguageTag: true, customSkipWords: '', ...translatorConf };
      initTranslator(_console, mergedTl);
    }

    // ── Discord Rich Presence game state polling ──
    if (isGamePage && discordConf?.enabled) {
      const showMapMode = discordConf.showMapMode !== false;
      const showClass = discordConf.showClass !== false;
      const showTimer = discordConf.showTimer !== false;
      const showStatus = discordConf.showStatus !== false;

      let lastDetails = '';
      let lastState = '';
      let firstSend = true;
      let gameStartTimestamp = Math.floor(Date.now() / 1000);

      function pollDiscordState(): void {
        let details = '';
        let state = '';
        let startTimestamp: number | undefined = undefined;

        const w = window as any;
        const spectating = w.spectating;

        let gameActivity: any = null;
        if (typeof w.getGameActivity === 'function') {
          try { gameActivity = w.getGameActivity(); } catch { /* game API unavailable */ }
        }

        if (spectating) {
          if (showStatus) details = 'Spectating';
          if (showMapMode && gameActivity?.map) {
            state = gameActivity.map;
          }
        } else {
          const uiBase = document.getElementById('uiBase');
          if (uiBase && uiBase.className === 'onMenu') {
            if (showStatus) details = 'In Menus';
          } else {
            if (showMapMode) {
              if (gameActivity?.mode && gameActivity?.map) {
                details = gameActivity.mode + ' on ' + gameActivity.map;
              } else {
                const mapInfo = document.getElementById('mapInfo');
                details = mapInfo?.textContent || 'Playing Krunker';
              }
            }

            if (showClass) {
              if (gameActivity?.class?.name) {
                state = gameActivity.class.name;
              } else {
                const classElem = document.getElementById('menuClassName');
                if (classElem?.textContent) state = classElem.textContent;
              }
            }

            if (showTimer) startTimestamp = gameStartTimestamp;
          }
        }

        if (firstSend || details !== lastDetails || state !== lastState) {
          if (startTimestamp && lastDetails !== details) {
            gameStartTimestamp = Math.floor(Date.now() / 1000);
            startTimestamp = gameStartTimestamp;
          }
          lastDetails = details;
          lastState = state;
          firstSend = false;
          ipcRenderer.send('discord-update', {
            details: details || undefined,
            state: state || undefined,
            startTimestamp,
            largeImageKey: 'krunker',
            largeImageText: 'Krunker Civilian Client',
          });
        }
      }

      pollDiscordState();
      setInterval(pollDiscordState, 5000);
      document.addEventListener('pointerlockchange', pollDiscordState);
    }
    // ── In-game Accounts quick-switch button ──
    if (isGamePage) {
      ipcRenderer.invoke('alt-list').then(() => {
        const altBtn = document.createElement('div');
        altBtn.id = 'kccAltBtn';
        altBtn.className = 'menuItem';
        altBtn.setAttribute('onmouseenter', 'playTick()');
        altBtn.innerHTML =
          '<span class="material-icons-outlined menBtnIcn" style="color:#4fc3f7">people</span>' +
          '<div class="menuItemTitle" style="font-size:13px">Accounts</div>';

        function showAltManager(): void {
          const windowHolder = document.getElementById('windowHolder') as HTMLElement;
          const menuWindow = document.getElementById('menuWindow') as HTMLElement;
          const windowHeader = document.getElementById('windowHeader') as HTMLElement;
          if (!windowHolder || !menuWindow || !windowHeader) return;

          if (windowHolder.style.display !== 'none' && windowHeader.innerText === 'Alt Manager') {
            windowHolder.style.display = 'none';
            return;
          }

          windowHolder.className = 'popupWin';
          windowHolder.style.display = 'block';
          menuWindow.classList.value = 'dark';
          menuWindow.style.cssText = 'width:800px;max-height:calc(100% - 330px);overflow-y:auto;top:50%;transform:translate(-50%,-50%);';
          windowHeader.innerText = 'Alt Manager';

          function renderAccountList(): void {
            ipcRenderer.invoke('alt-list').then((accs: any[]) => {
              let html =
                '<div style="font-size:30px;text-align:center;margin:3px;font-weight:700;color:#fff;">Alt Manager</div>' +
                '<hr style="color:rgba(28,28,28,.5);">' +
                '<div class="button buttonPI lgn" id="kccAltAddBtn" style="text-align:center;width:98%;margin:3px;padding-top:5px;padding-bottom:13px;">Add Account</div>' +
                '<div class="amHolder" style="display:flex;flex-direction:column;justify-content:center;">';

              if (!accs || accs.length === 0) {
                html += '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px 0;font-size:18px;">No saved accounts</div>';
              } else {
                accs.forEach((acc, i) => {
                  html +=
                    '<div class="amAccName" style="display:flex;justify-content:flex-end;align-items:center;padding:4px 0;">' +
                      '<span style="margin-right:auto;color:#fff;font-size:18px;">' + escapeHtml(acc.label) + '</span>' +
                      '<div class="button buttonG lgn kcc-alt-login" data-idx="' + i + '" style="width:70px;margin-right:0;padding-top:3px;padding-bottom:15px;transform:scale(0.75);">' +
                        '<span class="material-icons" style="vertical-align:bottom;color:#fff;font-size:30px;margin-bottom:-1px;">login</span>' +
                      '</div>' +
                      '<div class="verticalSeparator" style="height:35px;background:rgba(28,28,28,.3);"></div>' +
                      '<div class="button buttonR lgn kcc-alt-del" data-idx="' + i + '" style="width:70px;margin-right:0;padding-top:3px;padding-bottom:15px;transform:scale(0.75);">' +
                        '<span class="material-icons" style="vertical-align:bottom;color:#fff;font-size:30px;margin-bottom:-1px;">delete</span>' +
                      '</div>' +
                    '</div>';
                });
              }
              html += '</div>';
              menuWindow.innerHTML = html;

              const addBtn = document.getElementById('kccAltAddBtn');
              if (addBtn) addBtn.addEventListener('click', showAddForm);

              menuWindow.querySelectorAll('.kcc-alt-login').forEach((el) => {
                el.addEventListener('click', () => {
                  const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
                  if (accs[idx]) {
                    windowHolder.style.display = 'none';
                    ipcRenderer.invoke('alt-get-credentials', idx).then((creds: { username: string; password: string } | null) => {
                      if (creds) switchToAccount(creds);
                    });
                  }
                });
              });

              menuWindow.querySelectorAll('.kcc-alt-del').forEach((el) => {
                el.addEventListener('click', () => {
                  const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
                  if (confirm('Delete account "' + (accs[idx]?.label || '') + '"?')) {
                    ipcRenderer.invoke('alt-remove', idx).then(() => renderAccountList());
                  }
                });
              });
            });
          }

          function showAddForm(): void {
            menuWindow.innerHTML =
              '<div class="setBodH" style="padding:20px;">' +
                '<div style="font-size:25px;text-align:center;margin-bottom:15px;color:#fff;">Add Account</div>' +
                '<input class="accountInput" id="kccAltLabel" type="text" placeholder="Label (e.g. Main, Alt1)" style="width:100%;margin-bottom:8px;">' +
                '<input class="accountInput" id="kccAltUser" type="text" placeholder="Krunker Username" style="width:100%;margin-bottom:8px;">' +
                '<input class="accountInput" id="kccAltPass" type="password" placeholder="Krunker Password" style="width:100%;margin-bottom:15px;">' +
                '<div style="display:flex;gap:8px;">' +
                  '<div class="button buttonG lgn" id="kccAltSaveBtn" style="flex:1;text-align:center;padding-top:5px;padding-bottom:13px;">Add Account</div>' +
                  '<div class="button buttonR lgn" id="kccAltBackBtn" style="width:120px;text-align:center;padding-top:5px;padding-bottom:13px;">Back</div>' +
                '</div>' +
              '</div>';

            // Stop Krunker's global keydown handler from eating keystrokes in our inputs
            menuWindow.querySelectorAll('input.accountInput').forEach((input) => {
              input.addEventListener('keydown', (e) => e.stopPropagation());
            });

            document.getElementById('kccAltBackBtn')!.addEventListener('click', renderAccountList);
            document.getElementById('kccAltSaveBtn')!.addEventListener('click', () => {
              const label = (document.getElementById('kccAltLabel') as HTMLInputElement).value.trim();
              const user = (document.getElementById('kccAltUser') as HTMLInputElement).value.trim();
              const pass = (document.getElementById('kccAltPass') as HTMLInputElement).value;
              if (!label || !user || !pass) return;
              ipcRenderer.invoke('alt-save', {
                label,
                username: user,
                password: pass,
              }).then(() => renderAccountList());
            });
          }

          renderAccountList();
        }

        altBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          (window as any).playSelect?.();
          showAltManager();
        });

        function injectAltBtn(): boolean {
          if (document.getElementById('kccAltBtn')) return true;
          const menuContainer = document.getElementById('menuItemContainer');
          if (!menuContainer) return false;
          const exitBtn = document.getElementById('clientExit');
          if (exitBtn) {
            menuContainer.insertBefore(altBtn, exitBtn);
          } else {
            menuContainer.appendChild(altBtn);
          }
          return true;
        }

        if (!injectAltBtn()) {
          let attempts = 0;
          const poll = setInterval(() => {
            if (injectAltBtn() || ++attempts > 60) clearInterval(poll);
          }, 500);
        }
      });
    }

  }).catch(() => {});

  const pollInterval = setInterval(() => {
    const w = window as any;
    if (
      Object.hasOwn(w, 'showWindow')
      && typeof w.showWindow === 'function'
      && Object.hasOwn(w, 'windows')
      && Array.isArray(w.windows)
      && w.windows.length >= 0
      && typeof w.windows[0] !== 'undefined'
      && typeof w.windows[0].changeTab === 'function'
    ) {
      clearInterval(pollInterval);
      _console.log('[KCC] Settings window found, hooking...');
      hookSettings();
    }
  }, 500);
});

// ── Lightweight tab page init (skips game-only features) ──
ipcRenderer.on('main_did-finish-load-tab', () => {
  _console.log('[KCC] Tab page loaded');
  (window as any).closeClient = () => window.close();
});
