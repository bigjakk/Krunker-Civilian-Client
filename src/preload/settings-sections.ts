// ── Settings section builders ──
// Each build*Section() populates one category panel of the injected Client settings
// tab using the shared row factories. renderSettings (settings-render.ts) builds
// the SettingsBag and calls these.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import { setDeathAnimBlock, setMenuTimer, setWatermark } from './utils';
import {
  createKeybindRow, createSimpleKeyRow, createToggleRow, createSelectRow,
  createNumberRow, createCheckboxGrid, createButtonRow, createTextRow,
  createInfoRow, createRowShell, createSelect, makeButton, onSettingChanged,
} from './settings-controls';
import { setClassicSocial, startHidePopups, stopHidePopups } from './menu-tweaks';
import { initHPCounter, destroyHPCounter } from './competitive';
import { updateKeystrokes } from './keystrokes';
import type { KeystrokesConfig } from './keystrokes';
import { setBetterChat, setChatHistorySize } from './chat';
import { updateTranslatorConfig } from './translator';
import { showChangelogNow } from './changelog';
import { setVerbose } from './saved-console';
import { MATCHMAKER_GAMEMODE_FILTER, MATCHMAKER_REGIONS, MATCHMAKER_REGION_NAMES, MATCHMAKER_MAP_FILTER, MATCHMAKER_MAP_NAMES, mapIconUrl } from './matchmaker';

export interface SettingsBag {
  binds: Record<string, Keybind>;
  saveBinds: () => void;
  isWindows: boolean;
}

export function buildGeneralSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = { ...DEFAULT_CONFIG.game, ...gameConf };

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

  const ui = { ...DEFAULT_CONFIG.ui, ...uiConfRaw };

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  body.appendChild(createToggleRow({
    label: 'Classic Social',
    desc: 'Open the standalone social page in a tab instead of the in-game panel',
    checked: ui.classicSocial ?? false, instant: true,
    onChange: (v) => { ui.classicSocial = v; saveUI(); setClassicSocial(v); },
  }));

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

  body.appendChild(createButtonRow({
    label: 'Changelog',
    desc: 'View release notes for the current version',
    buttons: [{ icon: 'article', label: 'Show', onClick: () => {
      ipcRenderer.invoke('get-version').then((ver: string) => showChangelogNow(ver));
    } }],
  }).row);

  body.appendChild(createKeybindRow('Toggle Fullscreen', 'Fullscreen the game window (default F11)', bag.binds.fullscreenToggle, (b) => {
    bag.binds.fullscreenToggle = b;
    bag.saveBinds();
  }, undefined, true));

  body.appendChild(createKeybindRow('Screenshot', 'Copy the game view to your clipboard (default F9)', bag.binds.screenshot, (b) => {
    bag.binds.screenshot = b;
    bag.saveBinds();
  }, undefined, true));

  body.appendChild(createToggleRow({
    label: 'Save Screenshots to Folder',
    desc: 'Also save a PNG copy to the screenshots folder (always copies to clipboard)',
    checked: game.screenshotSave ?? false, instant: true,
    onChange: (v) => { game.screenshotSave = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  body.appendChild(createButtonRow({
    label: 'Screenshots Folder',
    desc: 'Where saved screenshots are written',
    buttons: [{ icon: 'folder', label: 'Screenshots', title: 'Open Folder', onClick: () => ipcRenderer.invoke('open-screenshots-folder') }],
  }).row);
}

export function buildGameSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = { ...DEFAULT_CONFIG.game, ...gameConf };
  const ui = { ...DEFAULT_CONFIG.ui, ...uiConfRaw };

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
    label: 'Direct Server Ping',
    desc: 'Replace Krunker\'s ping with a TCP round-trip measurement to the game server',
    checked: ui.directServerPing ?? false, refreshOnly: true,
    onChange: (v) => { ui.directServerPing = v; saveUI(); },
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

export function buildKeystrokesRows(body: HTMLElement): void {
  const ks: KeystrokesConfig = { ...DEFAULT_CONFIG.keystrokes };
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
  const creditRow = createInfoRow(
    'Keyboard overlay adapted from <a class="kcc-credit-link">KraXen72\'s Keystrokes userscript</a> for the Crankshaft Krunker client.',
  );
  const creditLink = creditRow.querySelector('.kcc-credit-link') as HTMLElement;
  creditLink.addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.invoke('open-external', KEYSTROKES_CREDIT_URL);
  });
  body.appendChild(creditRow);

  ipcRenderer.invoke('get-config', 'keystrokes').then((conf: KeystrokesConfig | undefined) => {
    Object.assign(ks, DEFAULT_CONFIG.keystrokes, conf || {});
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

export function buildPerformanceSection(
  body: HTMLElement, perfConf: any, isWindows: boolean,
): void {
  const perf = { ...DEFAULT_CONFIG.performance, ...perfConf };

  function savePerf(): void {
    ipcRenderer.invoke('set-config', 'performance', perf);
  }

  body.appendChild(createToggleRow({
    label: 'Unlimited FPS',
    desc: 'Uncap the frame rate (requires restart)',
    checked: perf.fpsUnlocked, restart: true,
    onChange: (v) => { perf.fpsUnlocked = v; savePerf(); },
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

export function buildSwapperSection(body: HTMLElement, swapperConf: any): void {
  const swapEnabled = swapperConf ? swapperConf.enabled : DEFAULT_CONFIG.swapper.enabled;

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

  body.appendChild(createButtonRow({
    label: 'Swapper Folder',
    desc: 'Place replacement assets here (textures/, sound/, models/)',
    buttons: [{ icon: 'folder', label: 'Swapper', title: 'Open Folder', onClick: () => ipcRenderer.invoke('open-swap-folder') }],
  }).row);
}

export function buildAppearanceSection(body: HTMLElement, uiConfRaw: any): void {
  const ui = { ...DEFAULT_CONFIG.ui, ...uiConfRaw };

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  // ── CSS Theme selector (populated from swap/themes/) ──
  const themeRowR = createRowShell('CSS Theme', 'Load a custom CSS theme from swap/themes/');
  const themeSelect = createSelect([{ value: 'disabled', label: 'Loading...' }], 'disabled');
  themeRowR.control.appendChild(themeSelect);
  themeRowR.control.appendChild(makeButton({ icon: 'folder', title: 'Open Themes Folder', onClick: () => ipcRenderer.invoke('open-themes-folder') }));
  body.appendChild(themeRowR.row);

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
  const bgRowR = createRowShell('Loading Background', 'Custom background image for the loading screen (swap/backgrounds/)');
  const bgSelect = createSelect([{ value: 'disabled', label: 'Loading...' }], 'disabled');
  bgRowR.control.appendChild(bgSelect);
  bgRowR.control.appendChild(makeButton({ icon: 'folder', title: 'Open Backgrounds Folder', onClick: () => ipcRenderer.invoke('open-backgrounds-folder') }));
  body.appendChild(bgRowR.row);

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
  body.appendChild(createTextRow({
    label: 'Background URL',
    desc: 'Direct image URL for loading screen (overrides dropdown above)',
    value: ui.backgroundUrl || '',
    placeholder: 'https://example.com/image.png',
    refreshOnly: true,
    onChange: (v) => { ui.backgroundUrl = v; saveUI(); },
  }).row);
}

export function buildMatchmakerSection(body: HTMLElement, mmConf: any, bag: SettingsBag): void {
  const mm = { ...DEFAULT_CONFIG.matchmaker, ...mmConf };

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

  body.appendChild(createToggleRow({
    label: 'Hide Search Overlay',
    desc: 'Skip the lobby search animation and join the match instantly',
    checked: mm.hideSearchOverlay ?? false, instant: true,
    onChange: (v) => { mm.hideSearchOverlay = v; saveMM(); },
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

  body.appendChild(createCheckboxGrid({
    header: 'Maps (none selected = all)',
    items: MATCHMAKER_MAP_FILTER.map(m => ({ value: m, label: MATCHMAKER_MAP_NAMES[m] || m, icon: mapIconUrl(m) ?? undefined })),
    selected: mm.maps,
    onChange: () => saveMM(),
  }));

  // ── Ranked Match Sound (URL or local file path; empty = default) ──
  const soundR = createTextRow({
    label: 'Ranked Match Sound',
    desc: 'Custom sound played when a ranked match is found. Accepts a URL or a local file path; leave blank for default.',
    value: mm.rankedMatchSound || '',
    placeholder: 'https://example.com/sound.mp3  or  C:\\path\\to\\file.mp3',
    onChange: (v) => { mm.rankedMatchSound = v; saveMM(); },
  });
  const soundInput = soundR.input;
  const soundControl = soundR.row.querySelector('.kcc-row-control') as HTMLElement;
  soundControl.appendChild(makeButton({ icon: 'folder_open', title: 'Browse for Audio File', onClick: async () => {
    const path: string = await ipcRenderer.invoke('pick-audio-file');
    if (path) {
      soundInput.value = path;
      mm.rankedMatchSound = path;
      saveMM();
    }
  } }));
  let previewAudio: HTMLAudioElement | null = null;
  const soundPlayBtn = makeButton({ icon: 'play_arrow', title: 'Preview Sound', onClick: async () => {
    if (previewAudio) { previewAudio.pause(); previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; return; }
    const url: string = await ipcRenderer.invoke('resolve-ranked-sound', soundInput.value.trim());
    previewAudio = new Audio(url);
    soundPlayBtn.innerHTML = '<span class="material-icons">stop</span>';
    previewAudio.onended = () => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; };
    previewAudio.onerror = () => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; };
    previewAudio.play().catch(() => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; });
  } });
  soundControl.appendChild(soundPlayBtn);
  body.appendChild(soundR.row);
}

export function buildDiscordSection(body: HTMLElement, discordConf: any): void {
  const discord = { ...DEFAULT_CONFIG.discord, ...discordConf };

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

export function buildChatSection(body: HTMLElement, gameConf: any, translatorConf: any): void {
  const game = { ...DEFAULT_CONFIG.game, ...gameConf };

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
  const tl = { ...DEFAULT_CONFIG.translator, ...translatorConf };

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
  body.appendChild(createTextRow({
    label: 'Custom Skip Words',
    desc: 'Comma-separated words to ignore (e.g. your nickname, friends\' names). Applies instantly.',
    value: tl.customSkipWords || '',
    placeholder: 'jakk, bigj, etc.',
    onChange: (v) => { tl.customSkipWords = v; saveTL(); updateTranslatorConfig({ customSkipWords: v }); },
  }).row);
}

export function buildAdvancedSection(
  body: HTMLElement, advConf: any, isWindows: boolean,
): void {
  const adv = { ...DEFAULT_CONFIG.advanced, ...advConf };

  function saveAdv(): void {
    ipcRenderer.invoke('set-config', 'advanced', adv);
  }

  const angleOptions: Array<{ value: string; label: string }> = isWindows
    ? [
        { value: 'default', label: 'Default (D3D11)' },
        { value: 'gl',      label: 'OpenGL' },
        { value: 'd3d11',   label: 'Direct3D 11' },
        { value: 'd3d11on12', label: 'D3D11on12' },
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
      setVerbose(v);
    },
  }));
}
