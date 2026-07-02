// ── Settings render orchestration ──
// Hooks Krunker's settings window and renders the Client tab as a sidebar: a header
// band, a category rail + content pane (sections built via settings-sections),
// cross-category search, and the userscripts section. hookSettings() is the entry
// point, called once the settings window is available.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import { escapeHtml, showToast } from './utils';
import { KCC_ICON_DATA_URL } from './header-icon';
import { savedConsole as _console } from './saved-console';
import { openKeybindDialog, keybindDisplayString } from './keybind-dialog';
import { showConfirm } from './confirm-dialog';
import {
  createToggleRow, createButtonRow, createInfoRow, createGroup,
  createRowShell, createSelect, onSettingChanged,
  resetRefreshNotification,
} from './settings-controls';
import {
  type SettingsBag,
  buildGeneralSection, buildGameSection, buildKeystrokesRows, buildPerformanceSection,
  buildSwapperSection, buildAppearanceSection, buildMatchmakerSection, buildDiscordSection,
  buildChatSection,
} from './settings-sections';
import { buildAccountsSection } from './alt-manager';
import { getInstances, setScriptEnabled } from './userscripts';
import type { UserscriptInstance } from './userscripts';

// ── Krunker native settings (localStorage) ──
// Krunker persists its in-game settings in localStorage: the settings menu uses
// the `kro_setngss_` prefix (FOV, sensitivity, crosshair, colors, etc.) and a few
// extras (e.g. ranked region prefs) use `s_`. We capture only these setting
// namespaces — never auth tokens (`__FRVR_*`, `krunker_username`) or other keys.
const KRUNKER_SETTING_PREFIXES = ['kro_setngss_', 's_'];

function isKrunkerSettingKey(key: string): boolean {
  return KRUNKER_SETTING_PREFIXES.some((p) => key.startsWith(p));
}

function collectKrunkerSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isKrunkerSettingKey(key)) {
        const val = localStorage.getItem(key);
        if (val !== null) out[key] = val;
      }
    }
  } catch (err) {
    _console.warn('[KCC] Could not read Krunker settings:', err);
  }
  return out;
}

function applyKrunkerSettings(settings: Record<string, string> | undefined): void {
  if (!settings || typeof settings !== 'object') return;
  try {
    for (const [key, val] of Object.entries(settings)) {
      if (isKrunkerSettingKey(key) && typeof val === 'string') {
        localStorage.setItem(key, val);
      }
    }
  } catch (err) {
    _console.warn('[KCC] Could not apply Krunker settings:', err);
  }
}

// Handle to the currently rendered settings UI so the search box can filter the
// existing DOM in place rather than rebuilding the whole tree on every keystroke.
let rendered: { container: HTMLElement; panels: HTMLElement[]; setActiveCat: (key: string) => void; activeKey: string } | null = null;

// Last category the user viewed — remembered across opening/closing the settings
// window within a session. Kept in memory only, so it resets on app relaunch (and
// page reload), which is the intended behaviour.
let lastActiveCategory: string | null = null;

export function hookSettings(): void {
  const w = window as any;
  const settingsWindow = w.windows[0];
  let selectedTab: number = settingsWindow.tabIndex;

  function isClientTab(): boolean {
    const tabs = settingsWindow.tabs[settingsWindow.settingType];
    return tabs && selectedTab === tabs.length - 1;
  }

  function safeRender(): void {
    if (!isClientTab()) return;
    const query = (document.getElementById('settSearch') as HTMLInputElement | null)?.value?.trim() ?? '';
    renderSettings(query.length > 0 ? query : undefined);
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
    const tabChanged = settingsWindow.tabIndex !== selectedTab;
    selectedTab = settingsWindow.tabIndex;
    // Only (re)render on an actual tab switch — re-clicking the already-active Client
    // tab would otherwise rebuild the panel and look like a refresh. Still restore if
    // Krunker wiped our injected content.
    const needsRestore = isClientTab() && !document.querySelector('#settHolder .kcc-settings');
    if (tabChanged || needsRestore) safeRender();
    return result;
  };

  settingsWindow.searchList = (...args: unknown[]) => {
    const result = origSearchList(...args);
    const searchInput = document.getElementById('settSearch') as HTMLInputElement | null;
    const query = searchInput?.value?.trim() ?? '';
    // Filter the already-built DOM in place when it's present — rebuilding here would
    // re-run every section's IPC plus the theme/background folder scans on every
    // keystroke. Only (re)build when our container is missing (first search, or a tab
    // switch wiped it).
    const haveDom = rendered !== null && document.body.contains(rendered.container);
    if (query.length > 0) {
      if (haveDom) updateSearch(query);
      else renderSettings(query);
    } else if (isClientTab()) {
      if (haveDom) updateSearch('');
      else renderSettings();
    } else {
      document.querySelector('#settHolder .kcc-settings')?.remove();
      rendered = null;
    }
    return result;
  };

  safeRender();
}

// ── Search filter (cross-category) ──
// In search mode the rail is hidden (CSS) and every category panel is stacked with
// its heading; rows that don't match the query are hidden, and panels with no
// matches are hidden entirely. The active filter is retained so categories that
// populate asynchronously (Userscripts, saved Accounts) can re-apply it once their
// rows land — otherwise they'd stay hidden after the initial sync pass.
let activeSearch: { query: string; panels: HTMLElement[] } | null = null;

/** Re-run the active search filter (no-op when not searching). Async sections call
 *  this after appending their rows. */
function reapplySearch(): void {
  if (!activeSearch) return;
  const { query, panels } = activeSearch;
  panels.forEach((panel) => {
    let visible = 0;
    panel.querySelectorAll('.kcc-row').forEach((el) => {
      const match = (el.textContent || '').toLowerCase().includes(query);
      (el as HTMLElement).style.display = match ? '' : 'none';
      if (match) visible++;
    });
    panel.style.display = visible > 0 ? '' : 'none';
  });
}

function applySearchFilter(container: HTMLElement, holder: HTMLElement, searchQuery: string, panels: HTMLElement[]): void {
  container.classList.add('kcc-searching');
  activeSearch = { query: searchQuery.toLowerCase(), panels };
  reapplySearch();
  if (panels.some((p) => p.style.display !== 'none')) {
    Array.from(holder.children).forEach((child) => {
      if ((child as HTMLElement).textContent?.toLowerCase().includes('no settings')) {
        (child as HTMLElement).remove();
      }
    });
  }
}

// Update the search filter against the already-rendered DOM (no rebuild). Called on
// every keystroke once the settings tree exists; falls back to a build only when the
// container is gone (see the searchList hook).
function updateSearch(query: string): void {
  if (!rendered) return;
  // Krunker's native searchList may hide non-matching #settHolder children — make
  // sure our container stays visible since we filter inside it ourselves.
  rendered.container.style.display = '';
  if (query.length > 0) {
    const holder = document.getElementById('settHolder');
    if (holder) applySearchFilter(rendered.container, holder, query, rendered.panels);
  } else {
    // Exit search: drop the per-row/per-panel display overrides and restore the
    // single active category.
    activeSearch = null;
    rendered.container.classList.remove('kcc-searching');
    rendered.panels.forEach((panel) => {
      panel.style.display = '';
      panel.querySelectorAll('.kcc-row').forEach((el) => { (el as HTMLElement).style.display = ''; });
    });
    rendered.setActiveCat(rendered.activeKey);
  }
}

// ── Backup & reset actions ──
// Grouped action page: backup and client maintenance as icon buttons, with the
// destructive actions set apart in a red danger zone with per-action descriptions.
function buildManageSection(body: HTMLElement): void {
  const makeActionBtn = (icon: string, label: string, onClick: () => void): HTMLElement => {
    const btn = document.createElement('div');
    btn.className = 'kcc-manage-btn';
    btn.innerHTML = '<span class="material-icons">' + icon + '</span>' + escapeHtml(label);
    btn.addEventListener('click', onClick);
    return btn;
  };
  const makeSection = (label: string): HTMLElement => {
    const l = document.createElement('div');
    l.className = 'kcc-group-label';
    l.textContent = label;
    body.appendChild(l);
    const grid = document.createElement('div');
    grid.className = 'kcc-manage-grid';
    body.appendChild(grid);
    return grid;
  };

  const backupGrid = makeSection('Backup');
  backupGrid.appendChild(makeActionBtn('file_download', 'Export Settings', () => {
    const krunker = collectKrunkerSettings();
    ipcRenderer.invoke('export-settings', krunker).then((res: any) => {
      if (res && res.success) showToast('Settings exported');
      else if (res && !res.canceled) showToast('Export failed: ' + (res.error || 'unknown error'));
    });
  }));
  backupGrid.appendChild(makeActionBtn('file_upload', 'Import Settings', () => {
    showConfirm({
      title: 'Import Settings',
      message: 'Import settings from a file? This overwrites your current client and Krunker settings (alt accounts are not affected) and restarts the client.',
      confirmLabel: 'Import',
    }).then((ok) => {
      if (!ok) return;
      ipcRenderer.invoke('import-settings').then((res: any) => {
        if (res && res.success) {
          applyKrunkerSettings(res.krunker);
          ipcRenderer.invoke('restart-client');
        } else if (res && !res.canceled) {
          showToast('Import failed: ' + (res.error || 'unknown error'));
        }
      });
    });
  }));

  const clientGrid = makeSection('Client');
  clientGrid.appendChild(makeActionBtn('folder', 'Swapper Folder', () => ipcRenderer.invoke('open-swap-folder')));
  clientGrid.appendChild(makeActionBtn('description', 'Electron Logs', () => ipcRenderer.invoke('open-electron-log')));
  clientGrid.appendChild(makeActionBtn('refresh', 'Restart Client', () => ipcRenderer.invoke('restart-client')));

  const dzLabel = document.createElement('div');
  dzLabel.className = 'kcc-group-label kcc-dzone-label';
  dzLabel.textContent = 'Danger Zone';
  body.appendChild(dzLabel);
  const dzone = document.createElement('div');
  dzone.className = 'kcc-dzone';
  body.appendChild(dzone);

  const dangerActions: Array<{ title: string; desc: string; button: string; action: () => void }> = [
    { title: 'Reset Resource Swapper', desc: 'Deletes all files in the swapper folder. Cannot be undone.', button: 'Reset', action: () => {
      showConfirm({
        title: 'Reset Resource Swapper',
        message: 'This deletes all files in the swapper folder and cannot be undone.',
        confirmLabel: 'Reset', danger: true,
      }).then((ok) => { if (ok) ipcRenderer.invoke('reset-swapper'); });
    }},
    { title: 'Reset Options', desc: 'Resets all client settings to their defaults and restarts the client.', button: 'Reset', action: () => {
      showConfirm({
        title: 'Reset Options',
        message: 'Reset all settings to their defaults? The client will restart.',
        confirmLabel: 'Reset', danger: true,
      }).then((ok) => { if (ok) ipcRenderer.invoke('reset-options'); });
    }},
    { title: 'Delete All Data', desc: 'Clears config, logs, and all Krunker site data including logins and in-game settings. Userscripts and swapper files are kept.', button: 'Delete', action: () => {
      showConfirm({
        title: 'Delete All Data',
        message: 'Clears your config, logs, and all Krunker site data — including your logins and in-game settings. Your userscripts and swapper files are kept. The client will restart.',
        confirmLabel: 'Delete', danger: true,
      }).then((ok) => { if (ok) ipcRenderer.invoke('delete-all-data'); });
    }},
  ];

  for (const d of dangerActions) {
    const row = document.createElement('div');
    row.className = 'kcc-drow';
    row.innerHTML =
      '<div class="kcc-drow-main">' +
        '<div class="kcc-drow-title">' + escapeHtml(d.title) + '</div>' +
        '<div class="kcc-drow-desc">' + escapeHtml(d.desc) + '</div>' +
      '</div>';
    const btn = document.createElement('button');
    btn.className = 'kcc-dbtn';
    btn.textContent = d.button;
    btn.addEventListener('click', d.action);
    row.appendChild(btn);
    dzone.appendChild(row);
  }
}

interface CatDef { key: string; label: string; icon: string; build: (body: HTMLElement) => void; }

function renderSettings(searchQuery?: string): void {
  const holder = document.getElementById('settHolder');
  if (!holder) return;

  resetRefreshNotification();

  const container = document.createElement('div');
  container.className = 'kcc-settings';

  // Synchronous fetch + build so the whole panel rebuilds in one tick — an async
  // gap here lets the browser paint the (Krunker-cleared) empty holder = a flash.
  let data: { config: any; platform: any; version: string };
  try {
    data = ipcRenderer.sendSync('get-settings-data-sync', ['swapper', 'matchmaker', 'keybinds', 'advanced', 'game', 'ui', 'discord', 'translator', 'performance']);
  } catch (err: any) {
    _console.error('[KCC] Settings render error:', err);
    return;
  }
  const allConf = data.config;
  const platformInfo = data.platform;
  const version = data.version;
  const gameConf = allConf.game;
  const uiConfRaw = allConf.ui;
  const isWindows = platformInfo && platformInfo.isWindows;
  const binds = { ...DEFAULT_CONFIG.keybinds, ...allConf.keybinds };
  const bag: SettingsBag = {
    binds,
    saveBinds: () => ipcRenderer.invoke('set-config', 'keybinds', binds),
    isWindows,
  };

  // ── Header band (shown only when the KCC watermark setting is on; rendered
  // either way so the watermark toggle can show/hide it live) ──
  const showBrand = uiConfRaw?.watermark ?? DEFAULT_CONFIG.ui.watermark;
  const header = document.createElement('div');
  header.className = 'kcc-header';
  if (!showBrand) header.style.display = 'none';
  header.innerHTML =
    '<div class="kcc-header-mark"><img src="' + KCC_ICON_DATA_URL + '" alt="KCC" draggable="false"></div>' +
    '<div class="kcc-header-text">' +
      '<div class="kcc-header-name">Civilian Client</div>' +
      '<div class="kcc-header-ver">v' + escapeHtml(version || '') + '</div>' +
    '</div>';
  container.appendChild(header);

  // ── Shell: category rail + content pane ──
  const shell = document.createElement('div');
  shell.className = 'kcc-shell';
  const rail = document.createElement('div');
  rail.className = 'kcc-rail';
  const pane = document.createElement('div');
  pane.className = 'kcc-pane';
  shell.appendChild(rail);
  shell.appendChild(pane);
  container.appendChild(shell);

  const cats: CatDef[] = [
    { key: 'General', label: 'General', icon: 'tune', build: (b) => buildGeneralSection(b, gameConf, uiConfRaw, bag) },
    { key: 'Game', label: 'Game', icon: 'sports_esports', build: (b) => buildGameSection(b, gameConf, uiConfRaw, bag) },
    { key: 'Performance', label: 'Performance', icon: 'speed', build: (b) => buildPerformanceSection(b, allConf.performance, allConf.advanced, isWindows) },
    { key: 'Swapper', label: 'Swapper', icon: 'swap_horiz', build: (b) => buildSwapperSection(b, allConf.swapper) },
    { key: 'Appearance', label: 'Appearance', icon: 'palette', build: (b) => buildAppearanceSection(b, uiConfRaw) },
    { key: 'Matchmaker', label: 'Matchmaker', icon: 'travel_explore', build: (b) => buildMatchmakerSection(b, allConf.matchmaker, bag) },
    { key: 'Chat', label: 'Chat', icon: 'chat', build: (b) => buildChatSection(b, gameConf, allConf.translator) },
    { key: 'Discord', label: 'Discord', icon: 'forum', build: (b) => buildDiscordSection(b, allConf.discord) },
    { key: 'Accounts', label: 'Accounts', icon: 'people', build: (b) => buildAccountsSection(createGroup(b), reapplySearch) },
    { key: 'Keystrokes', label: 'Keystrokes', icon: 'keyboard', build: (b) => buildKeystrokesRows(b) },
    { key: 'Userscripts', label: 'Userscripts', icon: 'code', build: (b) => renderUserscriptsSection(b) },
    { key: 'Manage', label: 'Backup & Reset', icon: 'restart_alt', build: (b) => buildManageSection(b) },
  ];

  const panels: HTMLElement[] = [];
  const items: HTMLElement[] = [];

  const setActiveCat = (key: string): void => {
    items.forEach((it) => it.classList.toggle('kcc-active', it.dataset.cat === key));
    panels.forEach((pnl) => { pnl.style.display = pnl.dataset.cat === key ? '' : 'none'; });
    lastActiveCategory = key;
    if (rendered) rendered.activeKey = key;
  };

  cats.forEach((cat) => {
    const item = document.createElement('div');
    item.className = 'kcc-rail-item';
    item.dataset.cat = cat.key;
    item.innerHTML = '<span class="material-icons">' + cat.icon + '</span><span class="kcc-rail-label">' + escapeHtml(cat.label) + '</span>';
    item.addEventListener('click', () => setActiveCat(cat.key));
    rail.appendChild(item);
    items.push(item);

    const panel = document.createElement('div');
    panel.className = 'kcc-cat';
    panel.dataset.cat = cat.key;
    const head = document.createElement('div');
    head.className = 'kcc-cat-head';
    head.textContent = cat.label;
    panel.appendChild(head);
    pane.appendChild(panel);
    panels.push(panel);

    cat.build(panel);
  });

  // Restore the last-viewed category (this session); fall back to the first.
  const initialKey = lastActiveCategory && cats.some((c) => c.key === lastActiveCategory)
    ? lastActiveCategory
    : cats[0].key;
  rendered = { container, panels, setActiveCat, activeKey: initialKey };

  if (searchQuery) {
    applySearchFilter(container, holder, searchQuery, panels);
  } else {
    activeSearch = null;
    setActiveCat(initialKey);
  }

  // Swap the freshly built panel in only now — deferring the clear until the build
  // is done keeps the previous content painted, avoiding the flash on tab clicks.
  if (searchQuery) {
    const existing = holder.querySelector('.kcc-settings');
    if (existing) existing.remove();
  } else {
    while (holder.firstChild) holder.removeChild(holder.firstChild);
  }
  holder.appendChild(container);
}

// ── Userscripts settings section ──
function renderUserscriptsSection(body: HTMLElement): void {
  ipcRenderer.invoke('get-config', 'userscripts').then((usConf: any) => {
    const us = { ...DEFAULT_CONFIG.userscripts, ...usConf };

    const engineGroup = createGroup(body);

    engineGroup.appendChild(createToggleRow({
      label: 'Userscripts',
      desc: 'Load custom scripts from the scripts folder',
      checked: us.enabled, restart: true,
      onChange: (v) => { us.enabled = v; ipcRenderer.invoke('set-config', 'userscripts', us); },
    }));

    engineGroup.appendChild(createButtonRow({
      label: 'Scripts Folder',
      desc: 'Place .js userscript files here',
      buttons: [{ icon: 'folder', label: 'Scripts', title: 'Open Folder', onClick: () => ipcRenderer.invoke('userscripts-open-folder') }],
    }).row);

    const scriptsGroup = createGroup(body, 'Installed Scripts');

    const scriptInstances = getInstances();
    if (scriptInstances.length === 0) {
      scriptsGroup.appendChild(createInfoRow('No userscripts found. Place .js files in the scripts folder and reload.'));
      reapplySearch();
      return;
    }

    for (const inst of scriptInstances) {
      const metaParts: string[] = [];
      if (inst.meta.author) metaParts.push('by ' + escapeHtml(inst.meta.author));
      if (inst.meta.version) metaParts.push('v' + escapeHtml(inst.meta.version));
      const metaLine = metaParts.length > 0 ? '<span class="kcc-us-meta">' + metaParts.join(' &middot; ') + '</span>' : '';
      const descHtml = escapeHtml(inst.meta.desc || '') + (metaLine ? '<br>' + metaLine : '');

      const { row: scriptRow, control } = createRowShell(inst.meta.name || inst.filename, descHtml);
      control.innerHTML =
        '<label class="kcc-toggle"><input type="checkbox"' + (inst.enabled ? ' checked' : '') + '><span class="kcc-toggle-track"></span></label>';
      scriptsGroup.appendChild(scriptRow);

      const cb = control.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const settingsContainer = document.createElement('div');
      settingsContainer.className = 'kcc-us-settings';
      scriptsGroup.appendChild(settingsContainer);

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
    reapplySearch();
  });
}

function renderScriptSettings(inst: UserscriptInstance, container: HTMLElement): void {
  if (!inst.settings) return;

  for (const [, setting] of Object.entries(inst.settings)) {
    const { row, control } = createRowShell(setting.title, setting.desc ? escapeHtml(setting.desc) : '');

    switch (setting.type) {
      case 'bool': {
        control.innerHTML =
          '<label class="kcc-toggle"><input type="checkbox"' + (setting.value ? ' checked' : '') + '><span class="kcc-toggle-track"></span></label>';
        const input = control.querySelector('input') as HTMLInputElement;
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
        input.className = 'kcc-num-val';
        input.value = String(setting.value);
        if (setting.min !== undefined) input.min = String(setting.min);
        if (setting.max !== undefined) input.max = String(setting.max);
        if (setting.step !== undefined) input.step = String(setting.step);
        control.appendChild(input);
        input.addEventListener('change', () => {
          setting.value = parseFloat(input.value) || 0;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'sel': {
        const select = createSelect((setting.opts || []).map((o) => ({ value: String(o), label: String(o) })), String(setting.value));
        control.appendChild(select);
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
        control.appendChild(input);
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
        keyEl.className = 'kcc-keyIcon';
        keyEl.textContent = keybindDisplayString(bind);
        keyEl.addEventListener('click', () => {
          openKeybindDialog(setting.title).then((newBind) => {
            setting.value = newBind;
            keyEl.textContent = keybindDisplayString(newBind);
            if (typeof setting.changed === 'function') setting.changed(setting.value);
            saveScriptSetting(inst);
          });
        });
        control.appendChild(keyEl);
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
