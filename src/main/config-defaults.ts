// Canonical config types and default values.
//
// This module has NO electron-store dependency on purpose: the preload bundle is
// sandboxed and can't pull Node modules, but it can import this for the single
// source of truth on defaults. config.ts wraps DEFAULT_CONFIG in the actual Store.

// Sky dome textures are referenced by user-asset ID. This one is deliberately not a
// real asset: the preload writes it into the map config, and main redirects the
// resulting texture request to a local file, so it never reaches the network.
// Shared here because both processes need the same number.
export const SKY_SENTINEL_ID = 9900001;

export interface Keybind {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface SavedAccount {
  label: string;
  username: string;
  password: string;
  // Account avatar image URL, captured from Krunker's rendered header (.ph-avatar)
  // after logging into the account — the custom picture for premium accounts, or
  // Krunker's default avatar for non-premium ones. Public asset URL, never a credential.
  avatarUrl?: string;
}

export interface AppConfig {
  window: {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
    maximized: boolean;
    fullscreen: boolean;
  };
  performance: {
    fpsUnlocked: boolean;
    higherMaxFps: boolean;
    processPriority: string;
  };
  game: {
    lastServer: string;
    socialTabBehaviour: 'New Window' | 'Same Window';
    rememberTabs: boolean;
    joinAsSpectator: boolean;
    rawInput: boolean;
    betterChat: boolean;
    chatHistorySize: number;
    showPing: boolean;
    hpEnemyCounter: boolean;
    hideBunnies: boolean;
    hideTurfBanners: boolean;
    screenshotSave: boolean;
    headshotSound: 'off' | 'kill' | 'hit';
  };
  keystrokes: {
    enabled: boolean;
    size: number;
    auxKey1: string;
    auxKey2: string;
    showAuxKeys: boolean;
    mouseEnabled: boolean;
  };
  swapper: {
    enabled: boolean;
    path: string;
  };
  matchmaker: {
    enabled: boolean;
    regions: string[];
    gamemodes: string[];
    maps: string[];
    minPlayers: number;
    maxPlayers: number;
    minRemainingTime: number;
    openServerBrowser: boolean;
    sortByPlayers: boolean;
    hideSearchOverlay: boolean;
    rankedMatchSound: string;
  };
  keybinds: {
    reload: Keybind;
    newMatch: Keybind;
    copyGameLink: Keybind;
    joinFromClipboard: Keybind;
    devTools: Keybind;
    matchmaker: Keybind;
    matchmakerCancel: Keybind;
    fullscreenToggle: Keybind;
    screenshot: Keybind;
  };
  userscripts: {
    enabled: boolean;
    path: string;
  };
  ui: {
    showExitButton: boolean;
    deathscreenAnimation: boolean;
    hideMenuPopups: boolean;
    menuTimer: boolean;
    watermark: boolean;
    directServerPing: boolean;
    classicSocial: boolean;
    cssTheme: string;
    socialCssTheme: string;
    skyOverride: boolean;
    skyZenith: string;
    skyHorizon: string;
    skyImage: string;
    socialMusic: string;
    socialMusicVolume: number;
    loadingTheme: string;
    backgroundUrl: string;
    showChangelog: boolean;
    lastSeenVersion: string;
  };
  discord: {
    enabled: boolean;
    showMapMode: boolean;
    showClass: boolean;
    showTimer: boolean;
    showStatus: boolean;
  };
  translator: {
    enabled: boolean;
    targetLanguage: string;
    showLanguageTag: boolean;
    customSkipWords: string;
    textColor: string;
    textStyle: 'normal' | 'italic' | 'bold' | 'bold-italic';
  };
  advanced: {
    removeUselessFeatures: boolean;
    perfTweaks: boolean;
    angleBackend: string;
    verboseLogging: boolean;
  };
  accounts: SavedAccount[];
  tabWindow: {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
    maximized: boolean;
  };
  savedTabs: string[];
}

export const DEFAULT_KEYBINDS: AppConfig['keybinds'] = {
  reload:            { key: 'F5',     ctrl: false, shift: false, alt: false },
  newMatch:          { key: 'F4',     ctrl: false, shift: false, alt: false },
  copyGameLink:      { key: 'l',      ctrl: true,  shift: false, alt: false },
  joinFromClipboard: { key: 'j',      ctrl: true,  shift: false, alt: false },
  devTools:          { key: 'F12',    ctrl: false, shift: false, alt: false },
  matchmaker:        { key: 'F6',     ctrl: false, shift: false, alt: false },
  matchmakerCancel:  { key: 'Escape', ctrl: false, shift: false, alt: false },
  fullscreenToggle:  { key: 'F11',    ctrl: false, shift: false, alt: false },
  screenshot:        { key: 'F9',     ctrl: false, shift: false, alt: false },
};

export const DEFAULT_CONFIG: AppConfig = {
  window: {
    width: 1600,
    height: 900,
    x: undefined,
    y: undefined,
    maximized: false,
    fullscreen: false,
  },
  performance: {
    fpsUnlocked: true,
    higherMaxFps: false,
    processPriority: 'Normal',
  },
  game: {
    lastServer: '',
    socialTabBehaviour: 'New Window',
    rememberTabs: false,
    joinAsSpectator: false,
    rawInput: true,
    betterChat: true,
    chatHistorySize: 200,
    showPing: true,
    hpEnemyCounter: true,
    hideBunnies: false,
    hideTurfBanners: false,
    screenshotSave: false,
    headshotSound: 'off',
  },
  keystrokes: {
    enabled: false,
    size: 2.5,
    auxKey1: 'r',
    auxKey2: 'n',
    showAuxKeys: true,
    mouseEnabled: false,
  },
  swapper: {
    enabled: false,
    path: '',
  },
  matchmaker: {
    enabled: true,
    regions: [],
    gamemodes: [],
    maps: [],
    minPlayers: 1,
    maxPlayers: 6,
    minRemainingTime: 120,
    openServerBrowser: true,
    sortByPlayers: false,
    hideSearchOverlay: false,
    rankedMatchSound: '',
  },
  keybinds: DEFAULT_KEYBINDS,
  userscripts: {
    enabled: false,
    path: '',
  },
  ui: {
    showExitButton: true,
    deathscreenAnimation: true,
    hideMenuPopups: false,
    menuTimer: true,
    watermark: true,
    directServerPing: false,
    classicSocial: false,
    cssTheme: 'disabled',
    socialCssTheme: 'disabled',
    skyOverride: false,
    skyZenith: '#1E5AA8',
    skyHorizon: '#9FD0F0',
    skyImage: 'disabled',
    socialMusic: '',
    socialMusicVolume: 40,
    loadingTheme: 'disabled',
    backgroundUrl: '',
    showChangelog: true,
    lastSeenVersion: '',
  },
  discord: {
    enabled: true,
    showMapMode: true,
    showClass: true,
    showTimer: true,
    showStatus: true,
  },
  translator: {
    enabled: false,
    targetLanguage: 'en',
    showLanguageTag: true,
    customSkipWords: '',
    textColor: '#88ff88',
    textStyle: 'italic',
  },
  advanced: {
    removeUselessFeatures: true,
    perfTweaks: false,
    angleBackend: 'default',
    verboseLogging: false,
  },
  accounts: [],
  tabWindow: {
    width: 1280,
    height: 720,
    x: undefined,
    y: undefined,
    maximized: true,
  },
  savedTabs: [],
};
