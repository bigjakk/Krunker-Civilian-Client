import Store from 'electron-store';

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
    hardwareAccel: boolean;
    gpuPreference: 'high-performance' | 'low-power' | 'default';
    cpuThrottleGame: number;
    cpuThrottleMenu: number;
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
    doublePing: boolean;
    cssTheme: string;
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
  };
  advanced: {
    removeUselessFeatures: boolean;
    gpuRasterizing: boolean;
    helpfulFlags: boolean;
    increaseLimits: boolean;
    lowLatency: boolean;
    experimentalFlags: boolean;
    angleBackend: string;
    verboseLogging: boolean;
  };
  accounts: SavedAccount[];
  collapsedSections: Record<string, boolean>;
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
};


export const config = new Store<AppConfig>({
  name: 'krunker-civilian-config',
  defaults: {
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
      hardwareAccel: true,
      gpuPreference: 'high-performance',
      cpuThrottleGame: 1,
      cpuThrottleMenu: 1.5,
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
      doublePing: true,
      cssTheme: 'disabled',
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
      enabled: true,
      targetLanguage: 'en',
      showLanguageTag: true,
      customSkipWords: '',
    },
    advanced: {
      removeUselessFeatures: true,
      gpuRasterizing: false,
      helpfulFlags: true,
      increaseLimits: false,
      lowLatency: false,
      experimentalFlags: false,
      angleBackend: 'default',
      verboseLogging: false,
    },
    accounts: [],
    collapsedSections: {},
    tabWindow: {
      width: 1280,
      height: 720,
      x: undefined,
      y: undefined,
      maximized: true,
    },
    savedTabs: [],
  },
});
