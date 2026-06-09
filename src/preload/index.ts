import { ipcRenderer } from 'electron';
import { fetchGame } from './matchmaker';
import type { MatchmakerConfig } from './matchmaker';
import { initUserscripts, getInstances, setScriptEnabled } from './userscripts';
import type { UserscriptInstance } from './userscripts';
import { initTranslator } from './translator';
import { setDeathAnimBlock, setMenuTimer, setWatermark, escapeHtml } from './utils';
import { initChat } from './chat';
import { initHPCounter, initRankProgress } from './competitive';
import { initKeystrokes } from './keystrokes';
import type { KeystrokesConfig } from './keystrokes';
import { checkChangelog } from './changelog';
import type { Keybind } from '../main/config';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import { savedConsole as _console, setVerbose } from './saved-console';
import { openKeybindDialog, keybindDisplayString } from './keybind-dialog';
import {
  createToggleRow, createSection,
  onSettingChanged, resetRefreshNotification, setCollapsedState,
} from './settings-controls';
import { buildAccountsSection, initAltManagerButton } from './alt-manager';
import { startHidePopups, setClassicSocial } from './menu-tweaks';
import {
  type SettingsBag,
  buildGeneralSection, buildGameSection, buildKeystrokesRows, buildPerformanceSection,
  buildSwapperSection, buildAppearanceSection, buildMatchmakerSection, buildDiscordSection,
  buildChatSection, buildAdvancedSection,
} from './settings-sections';


_console.log('[KCC] Preload script loaded');

// preventDefault on wheel events avoids Chromium 100+ pacing frame production to vsync during scroll gestures (FPS would tank from 1000+ to refresh rate). Skip when target is inside a real scrollable element so menus still scroll.
window.addEventListener('wheel', (e: WheelEvent) => {
    let el = e.target as HTMLElement | null;
    while (el && el !== document.body && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowX === 'auto' || cs.overflowX === 'scroll')
            && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
        if (scrolls) return;
        el = el.parentElement;
    }
    e.preventDefault();
}, { capture: true, passive: false });

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

// ── Direct Server Ping Display (TCP RTT from main, overrides #pingText + #menuPingText) ──
// Locks the textContent setter on first value arrival so Krunker's writes become
// no-ops; we write via innerText (different setter) so our value sticks. The
// lock is deferred so Krunker's value passes through if our IPC never fires.
function initDirectPingDisplay(): void {
    const locked = new WeakSet<HTMLElement>();
    ipcRenderer.on('server-ping', (_e, ms: number) => {
        const text = String(ms);
        for (const id of ['pingText', 'menuPingText']) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (!locked.has(el)) {
                Object.defineProperty(el, 'textContent', { set: () => {}, configurable: true });
                locked.add(el);
            }
            el.innerText = text;
        }
    });
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
    setVerbose(advConf?.verboseLogging ?? false);

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
    if (isGamePage && uiConf?.classicSocial) setClassicSocial(true);

    // ── Direct server ping (TCP RTT to the game server, replaces Krunker's display) ──
    if (isGamePage && uiConf?.directServerPing) {
      initDirectPingDisplay();
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
      const mergedTl = { ...DEFAULT_CONFIG.translator, ...translatorConf };
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
    if (isGamePage) initAltManagerButton();

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
