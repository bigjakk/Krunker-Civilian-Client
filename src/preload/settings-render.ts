// ── Settings render orchestration ──
// Hooks Krunker's settings window, renders the Client tab (action buttons +
// collapsible sections built via settings-sections), the search filter, and the
// userscripts section. hookSettings() is the entry point, called once the
// settings window is available.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import { escapeHtml } from './utils';
import { savedConsole as _console } from './saved-console';
import { openKeybindDialog, keybindDisplayString } from './keybind-dialog';
import {
  createToggleRow, createSection, onSettingChanged,
  resetRefreshNotification, setCollapsedState,
} from './settings-controls';
import {
  type SettingsBag,
  buildGeneralSection, buildGameSection, buildKeystrokesRows, buildPerformanceSection,
  buildSwapperSection, buildAppearanceSection, buildMatchmakerSection, buildDiscordSection,
  buildChatSection, buildAdvancedSection,
} from './settings-sections';
import { buildAccountsSection } from './alt-manager';
import { getInstances, setScriptEnabled } from './userscripts';
import type { UserscriptInstance } from './userscripts';

export function hookSettings(): void {
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

  resetRefreshNotification();

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
    ipcRenderer.invoke('get-all-config', ['swapper', 'matchmaker', 'keybinds', 'advanced', 'game', 'ui', 'discord', 'translator', 'performance', 'collapsedSections']),
    ipcRenderer.invoke('get-platform'),
  ]).then(([allConf, platformInfo]: [any, any]) => {
    setCollapsedState((allConf.collapsedSections as Record<string, boolean>) || {});

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
    const binds = { ...DEFAULT_CONFIG.keybinds, ...keybindsConf };
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
    buildAccountsSection(accSec.body);
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
    const us = { ...DEFAULT_CONFIG.userscripts, ...usConf };

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
