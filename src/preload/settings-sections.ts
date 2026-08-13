// ── Settings section builders ──
// Each build*Section() populates one category panel of the injected Client settings
// tab using the shared row factories. renderSettings (settings-render.ts) builds
// the SettingsBag and calls these.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import type { SocialMusicSource } from '../main/config-defaults';
import { setDeathAnimBlock, setMenuTimer, setWatermark, showToast } from './utils';
import {
  createKeybindRow, createSimpleKeyRow, createToggleRow, createSelectRow,
  createNumberRow, createCheckboxGrid, createButtonRow, createTextRow,
  createInfoRow, createRowShell, createSelect, makeButton, onSettingChanged,
  createGroup, createColorRow,
} from './settings-controls';
import { setClassicSocial, startHidePopups, stopHidePopups } from './menu-tweaks';
import { updateSocialMusicConfig } from './social-music';
import { initHPCounter, destroyHPCounter } from './competitive';
import { setHeadshotSoundMode } from './headshot-sound';
import type { HeadshotSoundMode } from './headshot-sound';
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

// Module-scoped so it can be stopped from outside the panel that created it.
let musicPreview: HTMLAudioElement | null = null;
let musicPreviewUrl = ''; // Blob URL while previewing a local file

export function stopMusicPreview(): void {
  if (musicPreview) musicPreview.pause();
  musicPreview = null;
  if (musicPreviewUrl) {
    URL.revokeObjectURL(musicPreviewUrl);
    musicPreviewUrl = '';
  }
}

export function buildGeneralSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = gameConf;

  const tabsGroup = createGroup(body, 'Tabs & Social');

  tabsGroup.appendChild(createSelectRow({
    label: 'Social/Hub Tab Behaviour',
    desc: 'How social, market, and editor pages open when clicked',
    options: [{ value: 'New Window', label: 'Tabs (Separate Window)' }, { value: 'Same Window', label: 'Tabs (Overlay Game)' }],
    value: game.socialTabBehaviour, instant: true,
    onChange: (v) => { game.socialTabBehaviour = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  tabsGroup.appendChild(createToggleRow({
    label: 'Remember Tabs',
    desc: 'Restore your open tabs when you reopen the social/hub window',
    checked: game.rememberTabs, instant: true,
    onChange: (v) => { game.rememberTabs = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  const ui = uiConfRaw;

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  tabsGroup.appendChild(createToggleRow({
    label: 'Classic Social',
    desc: 'Open the standalone social page in a tab instead of the in-game panel',
    checked: ui.classicSocial ?? false, instant: true,
    onChange: (v) => { ui.classicSocial = v; saveUI(); setClassicSocial(v); },
  }));

  const clientGroup = createGroup(body, 'Client');

  clientGroup.appendChild(createToggleRow({
    label: 'Show Exit Button',
    desc: 'Show the exit button in the game sidebar',
    checked: ui.showExitButton, instant: true,
    onChange: (v) => {
      ui.showExitButton = v; saveUI();
      const btn = document.getElementById('clientExit');
      if (btn) btn.style.display = v ? 'flex' : 'none';
    },
  }));

  clientGroup.appendChild(createToggleRow({
    label: 'Join as Spectator',
    desc: 'Automatically enable spectate mode when joining a game',
    checked: game.joinAsSpectator, instant: true,
    onChange: (v) => { game.joinAsSpectator = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  clientGroup.appendChild(createToggleRow({
    label: 'Show Changelog',
    desc: 'Show release notes popup when the client updates',
    checked: ui.showChangelog ?? true, instant: true,
    onChange: (v) => { ui.showChangelog = v; saveUI(); },
  }));

  clientGroup.appendChild(createButtonRow({
    label: 'Changelog',
    desc: 'View release notes for the current version',
    buttons: [{ icon: 'article', label: 'Show', onClick: () => {
      ipcRenderer.invoke('get-version').then((ver: string) => showChangelogNow(ver));
    } }],
  }).row);

  const hotkeysGroup = createGroup(body, 'Hotkeys');

  hotkeysGroup.appendChild(createKeybindRow('Toggle Fullscreen', 'Fullscreen the game window (default F11)', bag.binds.fullscreenToggle, (b) => {
    bag.binds.fullscreenToggle = b;
    bag.saveBinds();
  }, undefined, true));

  hotkeysGroup.appendChild(createKeybindRow('Screenshot', 'Copy the game view to your clipboard (default F9)', bag.binds.screenshot, (b) => {
    bag.binds.screenshot = b;
    bag.saveBinds();
  }, undefined, true));

  const shotsGroup = createGroup(body, 'Screenshots');

  shotsGroup.appendChild(createToggleRow({
    label: 'Save Screenshots to Folder',
    desc: 'Also save a PNG copy to the screenshots folder (always copies to clipboard)',
    checked: game.screenshotSave ?? false, instant: true,
    onChange: (v) => { game.screenshotSave = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  shotsGroup.appendChild(createButtonRow({
    label: 'Screenshots Folder',
    desc: 'Where saved screenshots are written',
    buttons: [{ icon: 'folder', label: 'Screenshots', title: 'Open Folder', onClick: () => ipcRenderer.invoke('open-screenshots-folder') }],
  }).row);
}

export function buildGameSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = gameConf;
  const ui = uiConfRaw;

  function saveGame(): void {
    ipcRenderer.invoke('set-config', 'game', game);
  }
  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  const inputGroup = createGroup(body, 'Input & HUD');

  if (bag.isWindows) {
    inputGroup.appendChild(createToggleRow({
      label: 'Raw Input',
      desc: 'Bypass OS mouse acceleration for direct 1:1 sensor input (Windows only)',
      checked: game.rawInput ?? true, refreshOnly: true,
      onChange: (v) => { game.rawInput = v; saveGame(); },
    }));
  }

  inputGroup.appendChild(createToggleRow({
    label: 'Show Ping in Player List',
    desc: 'Replace the ping icon with numeric millisecond values in the player list',
    checked: game.showPing ?? true, refreshOnly: true,
    onChange: (v) => { game.showPing = v; saveGame(); },
  }));

  inputGroup.appendChild(createToggleRow({
    label: 'Direct Server Ping',
    desc: 'Replace Krunker\'s ping with a TCP round-trip measurement to the game server',
    checked: ui.directServerPing ?? false, refreshOnly: true,
    onChange: (v) => { ui.directServerPing = v; saveUI(); },
  }));

  inputGroup.appendChild(createToggleRow({
    label: 'Hardpoint Enemy Counter',
    desc: 'Show enemy capture points in Hardpoint mode',
    checked: game.hpEnemyCounter ?? true, refreshOnly: true,
    onChange: (v) => {
      game.hpEnemyCounter = v; saveGame();
      if (v) initHPCounter(); else destroyHPCounter();
    },
  }));

  inputGroup.appendChild(createSelectRow({
    label: 'Headshot Sound',
    desc: 'Play the headshot hit sound on every kill, or on every hit. Also applies to a resource-swapped custom headshot sound.',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'kill', label: 'On Every Kill' },
      { value: 'hit', label: 'On Every Hit' },
    ],
    value: game.headshotSound ?? 'off', instant: true,
    onChange: (v) => { game.headshotSound = v as HeadshotSoundMode; saveGame(); setHeadshotSoundMode(v as HeadshotSoundMode); },
  }));

  const worldGroup = createGroup(body, 'World');

  worldGroup.appendChild(createToggleRow({
    label: 'Hide Bunny NPCs',
    desc: 'Block the bunny NPC models that spawn in public matches',
    checked: game.hideBunnies ?? false, refreshOnly: true,
    onChange: (v) => { game.hideBunnies = v; saveGame(); },
  }));

  worldGroup.appendChild(createToggleRow({
    label: 'Hide Turf War Banners',
    desc: 'Block the clan banner decorations placed on official maps by Turf Wars',
    checked: game.hideTurfBanners ?? false, refreshOnly: true,
    onChange: (v) => { game.hideTurfBanners = v; saveGame(); },
  }));

  worldGroup.appendChild(createToggleRow({
    label: 'Block Death Screen Animation',
    desc: 'Disable the slide-in animation on the death screen',
    checked: ui.deathscreenAnimation, instant: true,
    onChange: (v) => { ui.deathscreenAnimation = v; saveUI(); setDeathAnimBlock(v); },
  }));

  const menuGroup = createGroup(body, 'Menu');

  menuGroup.appendChild(createToggleRow({
    label: 'Hide Menu Popups',
    desc: 'Hide promotional notifications, offers, and streams on the main menu',
    checked: ui.hideMenuPopups, instant: true,
    onChange: (v) => {
      ui.hideMenuPopups = v; saveUI();
      if (v) startHidePopups(); else stopHidePopups();
    },
  }));

  menuGroup.appendChild(createToggleRow({
    label: 'Menu Timer',
    desc: 'Show the game/spectate timer on the menu screen',
    checked: ui.menuTimer ?? true, instant: true,
    onChange: (v) => { ui.menuTimer = v; saveUI(); setMenuTimer(v); },
  }));

  menuGroup.appendChild(createToggleRow({
    label: 'KCC Watermark',
    desc: 'Show the KCC version watermark in-game and on the menu, and the brand header in this menu and the ranked queue',
    checked: ui.watermark ?? true, instant: true,
    onChange: (v) => {
      ui.watermark = v; saveUI(); setWatermark(v);
      const brandHeader = document.querySelector('.kcc-settings .kcc-header') as HTMLElement | null;
      if (brandHeader) brandHeader.style.display = v ? '' : 'none';
    },
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

  const overlayGroup = createGroup(body, 'Overlay');

  const enableRow = createToggleRow({
    label: 'Keystrokes Overlay',
    desc: 'Show on-screen WASD/Shift/Space + 2 aux keys (great for streaming)',
    checked: false, instant: true,
    onChange: (v) => { ks.enabled = v; save(); },
  });
  overlayGroup.appendChild(enableRow);

  const mouseRow = createToggleRow({
    label: 'Mouse Overlay',
    desc: 'Show on-screen mouse buttons (L/M/R) and scroll wheel direction',
    checked: false, instant: true,
    onChange: (v) => { ks.mouseEnabled = v; save(); },
  });
  overlayGroup.appendChild(mouseRow);

  const sizeRow = createNumberRow({
    label: 'Overlay Size',
    desc: 'Visual scale of the keystroke and mouse indicators (rem)',
    min: 1, max: 6, step: 0.1, value: 2.5, instant: true,
    onChange: (v) => { ks.size = v; save(); },
  });
  overlayGroup.appendChild(sizeRow);

  const auxGroup = createGroup(body, 'Aux Keys');

  const showAuxRow = createToggleRow({
    label: 'Show Aux Keys',
    desc: 'Display the two configurable aux key indicators in the keyboard overlay',
    checked: true, instant: true,
    onChange: (v) => { ks.showAuxKeys = v; save(); },
  });
  auxGroup.appendChild(showAuxRow);

  const aux1Row = createSimpleKeyRow({
    label: 'Aux Key 1',
    desc: 'First configurable key (default R, e.g. weapon switch). Click to rebind.',
    value: 'r', instant: true,
    onChange: (v) => { ks.auxKey1 = v; save(); },
  });
  auxGroup.appendChild(aux1Row);

  const aux2Row = createSimpleKeyRow({
    label: 'Aux Key 2',
    desc: 'Second configurable key (default N, e.g. knife). Click to rebind.',
    value: 'n', instant: true,
    onChange: (v) => { ks.auxKey2 = v; save(); },
  });
  auxGroup.appendChild(aux2Row);

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

// Merged Performance category: frame rate, system (priority + graphics backend),
// the consolidated Chromium flag toggles, and debugging. Covers both the
// `performance` and `advanced` config sections.
export function buildPerformanceSection(
  body: HTMLElement, perfConf: any, advConf: any, isWindows: boolean,
): void {
  const perf = { ...DEFAULT_CONFIG.performance, ...perfConf };
  const adv = { ...DEFAULT_CONFIG.advanced, ...advConf };

  function savePerf(): void {
    ipcRenderer.invoke('set-config', 'performance', perf);
  }

  function saveAdv(): void {
    ipcRenderer.invoke('set-config', 'advanced', adv);
  }

  const fpsGroup = createGroup(body, 'Frame Rate');

  // Mode is derived from the two stored keys: vsync = !fpsUnlocked,
  // custom = fpsUnlocked + frameCap > 0, unlimited = fpsUnlocked + frameCap 0.
  const frameMode = (): 'vsync' | 'custom' | 'unlimited' => !perf.fpsUnlocked ? 'vsync' : (perf.frameCap > 0 ? 'custom' : 'unlimited');
  let lastCustomCap = Math.min(1000, Math.max(30, Math.round(Number(perf.frameCap)) || 240));
  // Re-clamp hand-edited configs so the slider shows what will be stored
  if (frameMode() === 'custom') perf.frameCap = lastCustomCap;

  const applyPerf = (crossedVsync: boolean): void => {
    ipcRenderer.invoke('set-config', 'performance', perf).then((needsRestart) => {
      if (needsRestart || crossedVsync) onSettingChanged('restart');
    });
  };

  const capRow = createNumberRow({
    label: 'FPS Cap',
    desc: 'Exact frame rate to hold. Applies live in most sessions (may need a restart)',
    min: 30, max: 1000, step: 1, value: lastCustomCap, instant: true,
    onChange: (v) => {
      perf.frameCap = v;
      lastCustomCap = v;
      applyPerf(false);
    },
  });

  const higherMaxRow = createToggleRow({
    label: 'Higher Max FPS',
    desc: 'Lets powerful machines reach higher framerates. Only active while Frame Rate Limit is Unlimited. May cause input lag or stutter on low-end hardware. Recommended to keep disabled (requires restart)',
    checked: perf.higherMaxFps, restart: true, safety: 4,
    onChange: (v) => { perf.higherMaxFps = v; savePerf(); },
  });

  const higherMaxCheckbox = higherMaxRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
  const syncFrameRows = (): void => {
    const mode = frameMode();
    capRow.classList.toggle('kcc-row-hidden', mode !== 'custom');
    higherMaxRow.classList.toggle('kcc-row-dim', mode !== 'unlimited');
    higherMaxCheckbox.disabled = mode !== 'unlimited';
  };

  fpsGroup.appendChild(createSelectRow({
    label: 'Frame Rate Limit',
    desc: 'Vsync syncs to the monitor refresh rate; switching it on or off requires a restart. Custom Cap holds an exact frame rate',
    options: [
      { value: 'unlimited', label: 'Unlimited' },
      { value: 'custom', label: 'Custom Cap' },
      { value: 'vsync', label: 'Vsync' },
    ],
    value: frameMode(),
    onChange: (mode) => {
      const wasVsync = !perf.fpsUnlocked;
      if (perf.frameCap > 0) lastCustomCap = perf.frameCap;
      perf.fpsUnlocked = mode !== 'vsync';
      // Vsync leaves frameCap untouched so switching back restores it
      if (mode !== 'vsync') perf.frameCap = mode === 'custom' ? lastCustomCap : 0;
      syncFrameRows();
      applyPerf(wasVsync !== (mode === 'vsync'));
    },
  }));
  fpsGroup.appendChild(capRow);
  fpsGroup.appendChild(higherMaxRow);
  syncFrameRows();


  const sysGroup = createGroup(body, 'System');

  if (isWindows) {
    sysGroup.appendChild(createSelectRow({
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
      ];
  // ANGLE has no Vulkan backend on macOS
  if (process.platform === 'linux') angleOptions.push({ value: 'vulkan', label: 'Vulkan' });

  sysGroup.appendChild(createSelectRow({
    label: 'ANGLE Backend',
    desc: 'Graphics API used for WebGL rendering',
    options: angleOptions,
    value: adv.angleBackend, restart: true,
    onChange: (v) => { adv.angleBackend = v; saveAdv(); },
  }));

  const flagsGroup = createGroup(body, 'Chromium Flags');

  flagsGroup.appendChild(createToggleRow({
    label: 'Remove Useless Features',
    desc: 'Disables crash dump reporting, Chromium logging, the renderer hang monitor, and other unused features',
    checked: !!adv.removeUselessFeatures, restart: true, safety: 1,
    onChange: (v) => { adv.removeUselessFeatures = v; saveAdv(); },
  }));

  flagsGroup.appendChild(createToggleRow({
    label: 'Extra Performance Tweaks',
    desc: 'Forces GPU rasterization past the driver blocklist, disables driver bug workarounds and the software fallback, prefers the high-performance GPU, and skips proxy resolution (breaks VPN/proxy setups)',
    checked: !!adv.perfTweaks, restart: true, safety: 3,
    onChange: (v) => { adv.perfTweaks = v; saveAdv(); },
  }));

  const debugGroup = createGroup(body, 'Debugging');

  debugGroup.appendChild(createToggleRow({
    label: 'Verbose Logging',
    desc: 'Forward all preload console output to the Electron log file',
    checked: adv.verboseLogging, instant: true,
    onChange: (v) => {
      adv.verboseLogging = v; saveAdv();
      setVerbose(v);
    },
  }));
}

export function buildSwapperSection(body: HTMLElement, swapperConf: any, uiConfRaw: any): void {
  const swapEnabled = swapperConf ? swapperConf.enabled : DEFAULT_CONFIG.swapper.enabled;
  const ui = uiConfRaw;

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  const group = createGroup(body);

  group.appendChild(createToggleRow({
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

  group.appendChild(createButtonRow({
    label: 'Swapper Folder',
    desc: 'Place replacement assets here (textures/, sound/, models/)',
    buttons: [{ icon: 'folder', label: 'Swapper', title: 'Open Folder', onClick: () => ipcRenderer.invoke('open-swap-folder') }],
  }).row);

  // ── Sky ──
  // Applies on the next map load; the map being played is already built.
  const skyGroup = createGroup(body, 'Sky');

  const skyToggle = createToggleRow({
    label: 'Sky Override',
    desc: 'Recolour the in-game sky gradient',
    checked: ui.skyOverride ?? DEFAULT_CONFIG.ui.skyOverride,
    refreshOnly: true,
    onChange: (v) => { ui.skyOverride = v; saveUI(); },
  });
  skyGroup.appendChild(skyToggle);

  skyGroup.appendChild(createColorRow({
    label: 'Sky Top',
    desc: 'Colour directly overhead',
    value: ui.skyZenith || DEFAULT_CONFIG.ui.skyZenith,
    defaultValue: DEFAULT_CONFIG.ui.skyZenith,
    refreshOnly: true,
    onChange: (v) => { ui.skyZenith = v; saveUI(); },
  }));

  skyGroup.appendChild(createColorRow({
    label: 'Sky Horizon',
    desc: 'Colour at the horizon',
    value: ui.skyHorizon || DEFAULT_CONFIG.ui.skyHorizon,
    defaultValue: DEFAULT_CONFIG.ui.skyHorizon,
    refreshOnly: true,
    onChange: (v) => { ui.skyHorizon = v; saveUI(); },
  }));

  // ── Sky Image (populated from swap/skies/) ──
  // The image is wrapped around a dome, so flat photos distort badly.
  const skyImgR = createRowShell('Sky Image', 'Use an image instead of the gradient — browse for one, or drop files into swap/skies/. Panoramic (equirectangular) images work best — ordinary photos will stretch');
  const skyImgSelect = createSelect([{ value: 'disabled', label: 'Loading...' }], 'disabled');
  skyImgR.control.appendChild(skyImgSelect);

  const populateSkies = async (): Promise<void> => {
    const images: Array<{ id: string; label: string }> = await ipcRenderer.invoke('list-sky-images');
    skyImgSelect.innerHTML = '';
    for (const img of images) {
      const opt = document.createElement('option');
      opt.value = img.id;
      opt.textContent = img.label;
      if (img.id === ui.skyImage) opt.selected = true;
      skyImgSelect.appendChild(opt);
    }
  };

  skyImgR.control.appendChild(makeButton({ icon: 'folder_open', title: 'Browse for Image', onClick: async () => {
    let id: string;
    try {
      id = await ipcRenderer.invoke('pick-sky-image');
    } catch {
      showToast('Couldn\'t add that sky image. Pick a .png, .jpg, or .webp file.');
      return;
    }
    if (!id) return;
    ui.skyImage = id;
    // The override is off by default, so without this the pick would do nothing
    ui.skyOverride = true;
    const cb = skyToggle.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (cb) cb.checked = true;
    saveUI();
    await populateSkies();
    onSettingChanged('refresh');
  } }));
  skyImgR.control.appendChild(makeButton({ icon: 'folder', title: 'Open Skies Folder', onClick: () => ipcRenderer.invoke('open-skies-folder') }));
  skyGroup.appendChild(skyImgR.row);

  populateSkies();

  skyImgSelect.addEventListener('change', () => {
    ui.skyImage = skyImgSelect.value;
    saveUI();
    onSettingChanged('refresh');
  });
}

export function buildAppearanceSection(body: HTMLElement, uiConfRaw: any): void {
  const ui = uiConfRaw;

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  const themeGroup = createGroup(body, 'Theme');

  // ── CSS Theme selector (populated from swap/themes/) ──
  const themeRowR = createRowShell('CSS Theme', 'Load a custom CSS theme from swap/themes/');
  const themeSelect = createSelect([{ value: 'disabled', label: 'Loading...' }], 'disabled');
  themeRowR.control.appendChild(themeSelect);
  themeRowR.control.appendChild(makeButton({ icon: 'folder', title: 'Open Themes Folder', onClick: () => ipcRenderer.invoke('open-themes-folder') }));
  themeGroup.appendChild(themeRowR.row);

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

  // ── Social CSS Theme selector (populated from swap/socialthemes/) ──
  const socialThemeRowR = createRowShell('Social CSS Theme', 'Load a custom CSS theme for social/hub tabs from swap/socialthemes/');
  const socialThemeSelect = createSelect([{ value: 'disabled', label: 'Loading...' }], 'disabled');
  socialThemeRowR.control.appendChild(socialThemeSelect);
  socialThemeRowR.control.appendChild(makeButton({ icon: 'folder', title: 'Open Social Themes Folder', onClick: () => ipcRenderer.invoke('open-social-themes-folder') }));
  themeGroup.appendChild(socialThemeRowR.row);

  ipcRenderer.invoke('list-social-themes').then((themes: Array<{ id: string; label: string }>) => {
    socialThemeSelect.innerHTML = '';
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === ui.socialCssTheme) opt.selected = true;
      socialThemeSelect.appendChild(opt);
    }
  });

  // Applies live to open tabs — no refresh needed
  socialThemeSelect.addEventListener('change', () => {
    ui.socialCssTheme = socialThemeSelect.value;
    saveUI();
  });

  // ── Menu Music ──
  const musicGroup = createGroup(body, 'Menu Music');

  const applyMusic = (): void => {
    saveUI();
    updateSocialMusicConfig({
      source: ui.socialMusic || '',
      volume: ui.socialMusicVolume ?? 40,
      onSocial: ui.socialMusicOnSocial ?? DEFAULT_CONFIG.ui.socialMusicOnSocial,
      onMarket: ui.socialMusicOnMarket ?? DEFAULT_CONFIG.ui.socialMusicOnMarket,
    });
  };

  musicGroup.appendChild(createToggleRow({
    label: 'Play in Social Hub',
    desc: 'Loop the music while the social hub is open',
    checked: ui.socialMusicOnSocial ?? DEFAULT_CONFIG.ui.socialMusicOnSocial,
    instant: true,
    onChange: (v) => { ui.socialMusicOnSocial = v; applyMusic(); },
  }));

  musicGroup.appendChild(createToggleRow({
    label: 'Play in Market',
    desc: 'Loop the music while the Market & Trading menu is open',
    checked: ui.socialMusicOnMarket ?? DEFAULT_CONFIG.ui.socialMusicOnMarket,
    instant: true,
    onChange: (v) => { ui.socialMusicOnMarket = v; applyMusic(); },
  }));

  const musicR = createTextRow({
    label: 'Music Source',
    desc: 'Loops while an enabled menu (above) is open, and fades out when you close it. Use a direct audio file link ending in .mp3, .ogg, or .wav — page links (Pixabay, YouTube, etc.) will not work. The easiest way is to download the file and pick it with the browse button (local files must be under 30 MB). Leave blank to disable.',
    value: ui.socialMusic || '',
    placeholder: 'https://example.com/track.mp3  or  C:\\path\\to\\file.mp3',
    onChange: (v) => { ui.socialMusic = v; applyMusic(); },
  });
  const musicInput = musicR.input;
  const musicControl = musicR.row.querySelector('.kcc-row-control') as HTMLElement;
  musicControl.appendChild(makeButton({ icon: 'folder_open', title: 'Browse for Audio File', onClick: async () => {
    const path: string = await ipcRenderer.invoke('pick-audio-file');
    if (path) { musicInput.value = path; ui.socialMusic = path; applyMusic(); }
  } }));

  stopMusicPreview(); // this panel is rebuilt on every open
  const resetMusicBtn = (failed?: boolean): void => {
    stopMusicPreview();
    musicPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    if (failed) showToast('Couldn\'t load that music. Use a direct audio file link (.mp3/.ogg/.wav) or download it and pick the file — page links won\'t work.');
  };
  const musicPlayBtn = makeButton({ icon: 'play_arrow', title: 'Preview Music', onClick: async () => {
    if (musicPreview) { resetMusicBtn(); return; }
    const src = (await ipcRenderer.invoke('resolve-social-music', musicInput.value.trim())) as SocialMusicSource;
    let url = '';
    if (src && 'url' in src) {
      url = src.url;
    } else if (src && 'bytes' in src) {
      musicPreviewUrl = URL.createObjectURL(new Blob([src.bytes as unknown as BlobPart], { type: src.mime }));
      url = musicPreviewUrl;
    }
    if (!url) { resetMusicBtn(true); return; }
    musicPreview = new Audio(url);
    musicPreview.volume = Math.min(1, Math.max(0, (ui.socialMusicVolume ?? 40) / 100));
    musicPlayBtn.innerHTML = '<span class="material-icons">stop</span>';
    musicPreview.onended = () => resetMusicBtn();
    musicPreview.onerror = () => resetMusicBtn(true);
    musicPreview.play().catch(() => resetMusicBtn(true));
  } });
  musicControl.appendChild(musicPlayBtn);
  musicGroup.appendChild(musicR.row);

  musicGroup.appendChild(createNumberRow({
    label: 'Music Volume',
    desc: 'Playback volume (0-100)',
    min: 0, max: 100, value: ui.socialMusicVolume ?? 40, instant: true,
    onChange: (v) => { ui.socialMusicVolume = v; applyMusic(); },
  }));

  const loadingGroup = createGroup(body, 'Loading Screen');

  // ── Loading Screen Background ──
  const bgRowR = createRowShell('Loading Background', 'Custom background image for the loading screen (swap/backgrounds/)');
  const bgSelect = createSelect([{ value: 'disabled', label: 'Loading...' }], 'disabled');
  bgRowR.control.appendChild(bgSelect);
  bgRowR.control.appendChild(makeButton({ icon: 'folder', title: 'Open Backgrounds Folder', onClick: () => ipcRenderer.invoke('open-backgrounds-folder') }));
  loadingGroup.appendChild(bgRowR.row);

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
  loadingGroup.appendChild(createTextRow({
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

  const mmGroup = createGroup(body, 'Matchmaking');

  mmGroup.appendChild(createToggleRow({
    label: 'Custom Matchmaker',
    desc: 'Use the matchmaker hotkey to find a game matching your criteria',
    checked: mm.enabled, instant: true,
    onChange: (v) => { mm.enabled = v; saveMM(); },
  }));

  mmGroup.appendChild(createToggleRow({
    label: 'Open Server Browser on Cancel',
    desc: 'Opens the server browser when no game is found and you cancel',
    checked: mm.openServerBrowser, instant: true,
    onChange: (v) => { mm.openServerBrowser = v; saveMM(); },
  }));

  mmGroup.appendChild(createToggleRow({
    label: 'Prioritize Player Count',
    desc: 'Sort results by most players first, then by ping (default is ping first)',
    checked: mm.sortByPlayers ?? false, instant: true,
    onChange: (v) => { mm.sortByPlayers = v; saveMM(); },
  }));

  mmGroup.appendChild(createToggleRow({
    label: 'Hide Search Overlay',
    desc: 'Skip the lobby search animation and join the match instantly',
    checked: mm.hideSearchOverlay ?? false, instant: true,
    onChange: (v) => { mm.hideSearchOverlay = v; saveMM(); },
  }));

  const hkGroup = createGroup(body, 'Hotkeys');

  hkGroup.appendChild(createKeybindRow('Matchmaker Hotkey', 'Key to trigger the custom matchmaker', bag.binds.matchmaker, (b) => {
    bag.binds.matchmaker = b;
    bag.saveBinds();
  }, undefined, true));
  hkGroup.appendChild(createKeybindRow('Matchmaker Cancel', 'Key to dismiss the matchmaker popup', bag.binds.matchmakerCancel, (b) => {
    bag.binds.matchmakerCancel = b;
    bag.saveBinds();
  }, undefined, true));

  const filtersGroup = createGroup(body, 'Filters');

  filtersGroup.appendChild(createNumberRow({
    label: 'Min Players', desc: 'Minimum player count in lobby (0-7)',
    min: 0, max: 7, value: mm.minPlayers, instant: true,
    onChange: (v) => { mm.minPlayers = v; saveMM(); },
  }));

  filtersGroup.appendChild(createNumberRow({
    label: 'Max Players', desc: 'Maximum player count in lobby (0-7)',
    min: 0, max: 7, value: mm.maxPlayers, instant: true,
    onChange: (v) => { mm.maxPlayers = v; saveMM(); },
  }));

  filtersGroup.appendChild(createNumberRow({
    label: 'Min Remaining Time', desc: 'Minimum seconds remaining in match (0-480)',
    min: 0, max: 480, value: mm.minRemainingTime, instant: true,
    onChange: (v) => { mm.minRemainingTime = v; saveMM(); },
  }));

  filtersGroup.appendChild(createCheckboxGrid({
    header: 'Regions (none selected = all)',
    items: MATCHMAKER_REGIONS.map(r => ({ value: r, label: MATCHMAKER_REGION_NAMES[r] || r })),
    selected: mm.regions,
    onChange: () => saveMM(),
  }));

  filtersGroup.appendChild(createCheckboxGrid({
    header: 'Gamemodes (none selected = all)',
    items: MATCHMAKER_GAMEMODE_FILTER.map(gm => ({ value: gm, label: gm })),
    selected: mm.gamemodes,
    onChange: () => saveMM(),
  }));

  filtersGroup.appendChild(createCheckboxGrid({
    header: 'Maps (none selected = all)',
    items: MATCHMAKER_MAP_FILTER.map(m => ({ value: m, label: MATCHMAKER_MAP_NAMES[m] || m, icon: mapIconUrl(m) ?? undefined })),
    selected: mm.maps,
    onChange: () => saveMM(),
  }));

  // ── Ranked Match Sound (URL or local file path; empty = default) ──
  const soundR = createTextRow({
    label: 'Ranked Match Sound',
    desc: 'Plays when a ranked match is found. Use a direct audio file link ending in .mp3, .ogg, or .wav — page links (Pixabay, YouTube, etc.) will not work. The easiest way is to download the file and pick it with the browse button. Leave blank for the default.',
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
  const resetPlayBtn = (failed?: boolean): void => {
    previewAudio = null;
    soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    if (failed) showToast('Couldn\'t load that sound. Use a direct audio file link (.mp3/.ogg/.wav) or download it and pick the file — page links won\'t work.');
  };
  const soundPlayBtn = makeButton({ icon: 'play_arrow', title: 'Preview Sound', onClick: async () => {
    if (previewAudio) { previewAudio.pause(); resetPlayBtn(); return; }
    const url: string = await ipcRenderer.invoke('resolve-ranked-sound', soundInput.value.trim());
    previewAudio = new Audio(url);
    soundPlayBtn.innerHTML = '<span class="material-icons">stop</span>';
    previewAudio.onended = () => resetPlayBtn();
    previewAudio.onerror = () => resetPlayBtn(true);
    previewAudio.play().catch(() => resetPlayBtn(true));
  } });
  soundControl.appendChild(soundPlayBtn);
  const rankedGroup = createGroup(body, 'Ranked');
  rankedGroup.appendChild(soundR.row);
}

export function buildDiscordSection(body: HTMLElement, discordConf: any): void {
  const discord = { ...DEFAULT_CONFIG.discord, ...discordConf };

  const mainGroup = createGroup(body);

  mainGroup.appendChild(createToggleRow({
    label: 'Discord Rich Presence',
    desc: 'Show game activity in your Discord profile',
    checked: discord.enabled,
    restart: true,
    onChange: (v) => {
      discord.enabled = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  const displayGroup = createGroup(body, 'Display');

  displayGroup.appendChild(createToggleRow({
    label: 'Show Map & Gamemode',
    desc: 'Display the current map and gamemode',
    checked: discord.showMapMode,
    refreshOnly: true,
    onChange: (v) => {
      discord.showMapMode = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  displayGroup.appendChild(createToggleRow({
    label: 'Show Class',
    desc: 'Display your current class name',
    checked: discord.showClass,
    refreshOnly: true,
    onChange: (v) => {
      discord.showClass = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  displayGroup.appendChild(createToggleRow({
    label: 'Show Elapsed Time',
    desc: 'Display how long you\'ve been in the current match',
    checked: discord.showTimer,
    refreshOnly: true,
    onChange: (v) => {
      discord.showTimer = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  displayGroup.appendChild(createToggleRow({
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
  const game = gameConf;

  function saveGame(): void {
    ipcRenderer.invoke('set-config', 'game', game);
  }

  const chatGroup = createGroup(body, 'Chat');

  chatGroup.appendChild(createToggleRow({
    label: 'Better Chat',
    desc: 'Merge team and all-chat with colored [T]/[M] prefixes',
    checked: game.betterChat, instant: true,
    onChange: (v) => { game.betterChat = v; saveGame(); setBetterChat(v); },
  }));

  chatGroup.appendChild(createNumberRow({
    label: 'Chat History Size', desc: 'Maximum chat messages to keep (0 to disable history preservation)',
    min: 0, max: 1000, value: game.chatHistorySize, instant: true,
    onChange: (v) => { game.chatHistorySize = v; saveGame(); setChatHistorySize(v); },
  }));

  // Translator settings inline
  const tl = { ...DEFAULT_CONFIG.translator, ...translatorConf };

  function saveTL(): void {
    ipcRenderer.invoke('set-config', 'translator', tl);
  }

  const tlGroup = createGroup(body, 'Translator');

  // Live preview — the .kcc-translation line tracks the --kcc-tl-* vars, so it
  // restyles in real time (even while dragging inside the color picker).
  // Built before the rows so their handlers can refresh the tag text.
  const pvShell = createRowShell('Preview', 'How translations appear in chat', { block: true });
  const pvBox = document.createElement('div');
  pvBox.className = 'kcc-tl-preview';
  const pvChat = document.createElement('div');
  pvChat.textContent = 'Player_One: bonjour tout le monde';
  const pvTl = document.createElement('div');
  pvTl.className = 'kcc-translation';
  const refreshPreview = (): void => {
    pvTl.textContent = '\u{1F310} Player_One: hello everyone' + (tl.showLanguageTag ? ' [FR]' : '');
  };
  refreshPreview();
  pvBox.appendChild(pvChat);
  pvBox.appendChild(pvTl);
  pvShell.control.appendChild(pvBox);

  tlGroup.appendChild(createToggleRow({
    label: 'Chat Translator',
    desc: 'Automatically translate non-English chat messages',
    checked: tl.enabled, instant: true,
    onChange: (v) => {
      tl.enabled = v;
      saveTL();
      updateTranslatorConfig({ enabled: v });
    },
  }));

  tlGroup.appendChild(createSelectRow({
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

  tlGroup.appendChild(createToggleRow({
    label: 'Show Language Tag',
    desc: 'Show detected language code before translations (e.g. [FR])',
    checked: tl.showLanguageTag, instant: true,
    onChange: (v) => {
      tl.showLanguageTag = v;
      saveTL();
      updateTranslatorConfig({ showLanguageTag: v });
      refreshPreview();
    },
  }));

  tlGroup.appendChild(createColorRow({
    label: 'Translation Color',
    desc: 'Text color of translated messages',
    value: tl.textColor, defaultValue: DEFAULT_CONFIG.translator.textColor, instant: true,
    onInput: (v) => updateTranslatorConfig({ textColor: v }),
    onChange: (v) => {
      tl.textColor = v;
      saveTL();
      updateTranslatorConfig({ textColor: v });
    },
  }));

  tlGroup.appendChild(createSelectRow({
    label: 'Translation Style',
    desc: 'Font style of translated messages', instant: true,
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'italic', label: 'Italic' },
      { value: 'bold', label: 'Bold' },
      { value: 'bold-italic', label: 'Bold + Italic' },
    ],
    value: tl.textStyle,
    onChange: (v) => {
      tl.textStyle = v;
      saveTL();
      updateTranslatorConfig({ textStyle: v });
    },
  }));

  tlGroup.appendChild(pvShell.row);

  // Custom skip words — messages made entirely of these (plus built-in skip terms) won't be translated.
  tlGroup.appendChild(createTextRow({
    label: 'Custom Skip Words',
    desc: 'Comma-separated words to ignore (e.g. your nickname, friends\' names). Applies instantly.',
    value: tl.customSkipWords || '',
    placeholder: 'jakk, bigj, etc.',
    onChange: (v) => { tl.customSkipWords = v; saveTL(); updateTranslatorConfig({ customSkipWords: v }); },
  }).row);
}
