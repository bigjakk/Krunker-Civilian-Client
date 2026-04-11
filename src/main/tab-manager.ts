import { BrowserWindow, WebContentsView, View, Menu, clipboard, ipcMain, shell } from 'electron';
import { TAB_BAR_DATA_URL } from './tab-bar-html';
import { ALL_CLIENT_CSS } from './client-ui';
import { electronLog } from './logger';

const KRUNKER_SOCIAL = 'https://krunker.io/social.html';
const TAB_BAR_HEIGHT = 40;
const MAX_TABS = 20;

interface TabInfo {
    id: number;
    view: WebContentsView;
    title: string;
    url: string;
    loading: boolean;
}

interface TabWindowState {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
    maximized: boolean;
}

type TabMode = 'same' | 'new';

export class TabManager {
    private tabs: TabInfo[] = [];
    private activeTabId: number | null = null;
    private tabBarView: WebContentsView;
    private containerView: View;
    private tabWindow: BrowserWindow | null = null;
    private visible = false;
    private nextId = 1;
    private mode: TabMode;
    private mainWin: BrowserWindow;
    private ses: Electron.Session;
    private preloadPath: string;
    private isGameURL: (url: string) => boolean;
    private titlePolls = new Map<number, ReturnType<typeof setInterval>>();
    private recentlyClosed: { url: string; title: string }[] = [];
    private getTabWindowState: () => TabWindowState;
    private saveTabWindowState: (state: TabWindowState) => void;
    private getSavedTabs: () => string[];
    private saveTabs: (urls: string[]) => void;
    private isRememberEnabled: () => boolean;
    private tabSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private restoredTabs = false;

    constructor(
        win: BrowserWindow,
        ses: Electron.Session,
        preloadPath: string,
        mode: TabMode,
        isGameURL: (url: string) => boolean,
        getTabWindowState: () => TabWindowState,
        saveTabWindowState: (state: TabWindowState) => void,
        getSavedTabs: () => string[],
        saveTabs: (urls: string[]) => void,
        isRememberEnabled: () => boolean,
    ) {
        this.mainWin = win;
        this.ses = ses;
        this.preloadPath = preloadPath;
        this.mode = mode;
        this.isGameURL = isGameURL;
        this.getTabWindowState = getTabWindowState;
        this.saveTabWindowState = saveTabWindowState;
        this.getSavedTabs = getSavedTabs;
        this.saveTabs = saveTabs;
        this.isRememberEnabled = isRememberEnabled;

        // ── Tab bar view (shared between both modes) ──
        this.tabBarView = new WebContentsView({
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                sandbox: false,
            },
        });
        this.tabBarView.webContents.loadURL(TAB_BAR_DATA_URL);

        // ── Container view (holds tab bar + active tab content) ──
        this.containerView = new View();
        this.containerView.addChildView(this.tabBarView);

        // Tab bar keybinds (when tab bar itself is focused)
        this.tabBarView.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            if (this.handleTabShortcut(event, input)) return;
        });

        if (mode === 'same') {
            this.initSameWindowMode();
        }
        // 'new' mode: tabWindow created lazily on first openTab()

        this.registerIPC();
    }

    // ── Same Window Mode Setup ──
    private initSameWindowMode(): void {
        this.mainWin.contentView.addChildView(this.containerView);
        this.containerView.setVisible(false);
        this.visible = false;
        this.mainWin.on('resize', () => this.updateLayout());
    }

    // ── New Window Mode: create/show the tab window ──
    private ensureTabWindow(): void {
        if (this.tabWindow && !this.tabWindow.isDestroyed()) return;

        const saved = this.getTabWindowState();

        this.tabWindow = new BrowserWindow({
            width: saved.width,
            height: saved.height,
            x: saved.x,
            y: saved.y,
            frame: true,
            backgroundColor: '#000000',
            autoHideMenuBar: true,
            title: 'KCC - Tabs',
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
            },
        });
        this.tabWindow.removeMenu();

        if (saved.maximized) this.tabWindow.maximize();

        this.tabWindow.contentView.addChildView(this.containerView);
        this.containerView.setVisible(true);

        this.tabWindow.on('resize', () => {
            this.updateLayout();
            this.debounceSaveTabWindow();
        });
        this.tabWindow.on('move', () => this.debounceSaveTabWindow());
        this.tabWindow.on('close', () => {
            // Flush pending save before the window is destroyed
            if (this.tabSaveTimer) clearTimeout(this.tabSaveTimer);
            if (this.tabWindow && !this.tabWindow.isDestroyed()) {
                const bounds = this.tabWindow.getBounds();
                this.saveTabWindowState({
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y,
                    maximized: this.tabWindow.isMaximized(),
                });
            }
        });
        this.tabWindow.on('closed', () => {
            this.destroyAllTabs();
            this.tabWindow = null;
        });

        this.tabWindow.show();
    }

    private debounceSaveTabWindow(): void {
        if (this.tabSaveTimer) clearTimeout(this.tabSaveTimer);
        this.tabSaveTimer = setTimeout(() => {
            if (!this.tabWindow || this.tabWindow.isDestroyed()) return;
            const bounds = this.tabWindow.getBounds();
            this.saveTabWindowState({
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                maximized: this.tabWindow.isMaximized(),
            });
        }, 1000);
    }

    // ── IPC from tab bar ──
    private registerIPC(): void {
        ipcMain.on('tab-switch', (_e, id: number) => this.switchToTab(id));
        ipcMain.on('tab-close', (_e, id: number) => this.closeTab(id));
        ipcMain.on('tab-new', () => this.openTab(KRUNKER_SOCIAL));
        ipcMain.on('tab-reorder', (_e, fromId: number, toId: number, side: string) => {
            this.reorderTab(fromId, toId, side as 'before' | 'after');
        });
        ipcMain.on('tab-back-to-game', () => {
            if (this.mode === 'same') {
                this.hideTabs();
            } else {
                this.mainWin.focus();
            }
        });
    }

    // ── Restore saved tabs on first open, then open the requested tab ──
    openTab(url: string): number {
        if (!this.restoredTabs) {
            this.restoredTabs = true;
            const saved = this.isRememberEnabled() ? this.getSavedTabs() : [];
            this.saveTabs([]);
            if (saved.length > 0) {
                for (const savedUrl of saved) {
                    this.openSingleTab(savedUrl);
                }
                // If the requested URL is already among the restored tabs, just activate it
                const existing = this.tabs.find(t => t.url === url);
                if (existing) {
                    this.switchToTab(existing.id);
                    this.showTabs();
                    return existing.id;
                }
            }
        }
        return this.openSingleTab(url);
    }

    // ── Open a single new tab ──
    private openSingleTab(url: string): number {
        if (this.tabs.length >= MAX_TABS) {
            const existing = this.tabs.find(t => t.url === url);
            if (existing) {
                this.switchToTab(existing.id);
                return existing.id;
            }
            electronLog.warn('[KCC-Tabs] Tab limit reached, ignoring openTab');
            return -1;
        }

        const id = this.nextId++;
        const view = this.createTabView(id);
        const tab: TabInfo = { id, view, title: this.titleFromUrl(url), url, loading: true };
        this.tabs.push(tab);

        if (this.mode === 'new') {
            this.ensureTabWindow();
        }

        this.switchToTab(id);
        this.showTabs();
        view.webContents.loadURL(url);

        return id;
    }

    // ── Create a WebContentsView for a tab ──
    private createTabView(tabId: number): WebContentsView {
        const view = new WebContentsView({
            webPreferences: {
                preload: this.preloadPath,
                session: this.ses,
                contextIsolation: false,
                nodeIntegration: false,
                sandbox: false,
                spellcheck: false,
            },
        });

        const wc = view.webContents;

        wc.on('did-finish-load', () => {
            wc.insertCSS(ALL_CLIENT_CSS).catch(() => {});
            wc.send('main_did-finish-load-tab');
            ipcMain.emit('throttle-state', { sender: wc } as any, 'menu');
            this.updateTabInfo(tabId, { loading: false });
            this.startTitleWatcher(tabId, wc);
        });

        wc.on('did-start-loading', () => {
            this.updateTabInfo(tabId, { loading: true });
        });

        wc.on('did-stop-loading', () => {
            this.updateTabInfo(tabId, { loading: false });
        });

        wc.on('page-title-updated', (_e, title) => {
            if (this.isGenericTitle(title)) return;
            this.updateTabInfo(tabId, { title });
        });

        wc.on('did-navigate', (_e, url) => {
            this.updateTabInfo(tabId, { url, title: this.titleFromUrl(url) });
        });

        wc.setWindowOpenHandler(({ url: linkUrl }) => {
            if (linkUrl.includes('krunker.io')) {
                if (this.isGameURL(linkUrl)) {
                    this.mainWin.loadURL(linkUrl);
                    if (this.mode === 'same') this.hideTabs();
                    else this.mainWin.focus();
                } else {
                    setImmediate(() => this.openTab(linkUrl));
                }
            } else {
                setImmediate(() => shell.openExternal(linkUrl));
            }
            return { action: 'deny' as const };
        });

        wc.on('will-navigate', (event, navUrl) => {
            if (navUrl.includes('krunker.io') && this.isGameURL(navUrl)) {
                event.preventDefault();
                this.mainWin.loadURL(navUrl);
                if (this.mode === 'same') this.hideTabs();
                else this.mainWin.focus();
            }
        });

        wc.on('context-menu', (_e, params) => {
            if (!params.linkURL) return;
            const items: Electron.MenuItemConstructorOptions[] = [];
            if (params.linkURL.includes('krunker.io') && !this.isGameURL(params.linkURL)) {
                items.push({ label: 'Open in New Tab', click: () => this.openTab(params.linkURL) });
            }
            items.push({ label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) });
            if (!params.linkURL.includes('krunker.io')) {
                items.push({ label: 'Open in Browser', click: () => shell.openExternal(params.linkURL) });
            }
            if (items.length) Menu.buildFromTemplate(items).popup();
        });

        wc.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            if (this.handleTabShortcut(event, input)) return;
            if (input.key === 'F12' && !input.control && !input.shift && !input.alt) {
                wc.toggleDevTools();
                event.preventDefault();
            }
        });

        return view;
    }

    // ── Switch active tab ──
    switchToTab(id: number): void {
        const tab = this.tabs.find(t => t.id === id);
        if (!tab) return;

        if (this.activeTabId !== null) {
            const prev = this.tabs.find(t => t.id === this.activeTabId);
            if (prev) {
                this.containerView.removeChildView(prev.view);
            }
        }

        this.activeTabId = id;
        this.containerView.addChildView(tab.view);
        this.updateLayout();
        this.broadcastTabState();
    }

    // ── Close a tab ──
    closeTab(id: number): void {
        const idx = this.tabs.findIndex(t => t.id === id);
        if (idx === -1) return;

        const tab = this.tabs[idx];

        if (this.activeTabId === id) {
            this.containerView.removeChildView(tab.view);
            this.activeTabId = null;
        }

        this.recentlyClosed.push({ url: tab.url, title: tab.title });
        if (this.recentlyClosed.length > 10) this.recentlyClosed.shift();

        this.stopTitleWatcher(id);
        tab.view.webContents.close();
        this.tabs.splice(idx, 1);

        if (this.tabs.length > 0) {
            const nextIdx = Math.min(idx, this.tabs.length - 1);
            this.switchToTab(this.tabs[nextIdx].id);
        } else {
            if (this.mode === 'same') {
                this.hideTabs();
            } else {
                if (this.tabWindow && !this.tabWindow.isDestroyed()) {
                    this.tabWindow.contentView.removeChildView(this.containerView);
                    this.tabWindow.close();
                }
            }
        }

        this.broadcastTabState();
    }

    // ── Show / hide tabs ──
    showTabs(): void {
        if (this.mode === 'same') {
            this.containerView.setVisible(true);
            this.visible = true;
            this.updateLayout();
        } else {
            this.ensureTabWindow();
            if (this.tabWindow && !this.tabWindow.isDestroyed()) {
                this.tabWindow.show();
                this.tabWindow.focus();
            }
            this.visible = true;
        }
    }

    hideTabs(): void {
        if (this.mode === 'same') {
            this.containerView.setVisible(false);
            this.visible = false;
            this.mainWin.focus();
        } else {
            this.mainWin.focus();
            this.visible = false;
        }
    }

    // ── Tab navigation ──
    nextTab(): void {
        if (this.tabs.length < 2 || this.activeTabId === null) return;
        const idx = this.tabs.findIndex(t => t.id === this.activeTabId);
        const next = (idx + 1) % this.tabs.length;
        this.switchToTab(this.tabs[next].id);
    }

    prevTab(): void {
        if (this.tabs.length < 2 || this.activeTabId === null) return;
        const idx = this.tabs.findIndex(t => t.id === this.activeTabId);
        const prev = (idx - 1 + this.tabs.length) % this.tabs.length;
        this.switchToTab(this.tabs[prev].id);
    }

    closeCurrentTab(): void {
        if (this.activeTabId !== null) this.closeTab(this.activeTabId);
    }

    // ── Reorder tabs via drag ──
    reorderTab(fromId: number, toId: number, side: 'before' | 'after'): void {
        const fromIdx = this.tabs.findIndex(t => t.id === fromId);
        const toIdx = this.tabs.findIndex(t => t.id === toId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        const [tab] = this.tabs.splice(fromIdx, 1);
        let insertIdx = this.tabs.findIndex(t => t.id === toId);
        if (side === 'after') insertIdx++;
        this.tabs.splice(insertIdx, 0, tab);
        this.broadcastTabState();
    }

    // ── Jump to tab by position (0-based, -1 = last) ──
    switchToTabByIndex(index: number): void {
        if (this.tabs.length === 0) return;
        if (index < 0 || index >= this.tabs.length) index = this.tabs.length - 1;
        this.switchToTab(this.tabs[index].id);
    }

    // ── Reopen last closed tab ──
    reopenTab(): void {
        const entry = this.recentlyClosed.pop();
        if (entry) this.openTab(entry.url);
    }

    // ── Shared shortcut handler (returns true if handled) ──
    private handleTabShortcut(event: Electron.Event, input: Electron.Input): boolean {
        if (input.key === 'Escape' && !input.control && !input.shift && !input.alt) {
            if (this.mode === 'same') this.hideTabs();
            else this.mainWin.focus();
            event.preventDefault();
            return true;
        } else if (input.key === 'w' && input.control && !input.shift && !input.alt) {
            this.closeCurrentTab();
            event.preventDefault();
            return true;
        } else if (input.key === 'Tab' && input.control && !input.shift && !input.alt) {
            this.nextTab();
            event.preventDefault();
            return true;
        } else if (input.key === 'Tab' && input.control && input.shift && !input.alt) {
            this.prevTab();
            event.preventDefault();
            return true;
        } else if (input.key === 't' && input.control && !input.shift && !input.alt) {
            this.openTab(KRUNKER_SOCIAL);
            event.preventDefault();
            return true;
        } else if (input.key === 'T' && input.control && input.shift && !input.alt) {
            this.reopenTab();
            event.preventDefault();
            return true;
        } else if (input.key >= '1' && input.key <= '8' && input.control && !input.shift && !input.alt) {
            this.switchToTabByIndex(parseInt(input.key) - 1);
            event.preventDefault();
            return true;
        } else if (input.key === '9' && input.control && !input.shift && !input.alt) {
            this.switchToTabByIndex(-1);
            event.preventDefault();
            return true;
        }
        return false;
    }

    // ── Cleanup ──
    destroyAll(): void {
        this.destroyAllTabs();

        ipcMain.removeAllListeners('tab-switch');
        ipcMain.removeAllListeners('tab-close');
        ipcMain.removeAllListeners('tab-new');
        ipcMain.removeAllListeners('tab-reorder');
        ipcMain.removeAllListeners('tab-back-to-game');

        if (this.tabWindow && !this.tabWindow.isDestroyed()) {
            this.tabWindow.contentView.removeChildView(this.containerView);
            this.tabWindow.close();
            this.tabWindow = null;
        }

        if (this.mode === 'same') {
            try { this.mainWin.contentView.removeChildView(this.containerView); } catch { /* may already be removed */ }
        }
    }

    private destroyAllTabs(): void {
        // Persist tab URLs so they can be restored later
        if (this.tabs.length > 0 && this.isRememberEnabled()) {
            this.saveTabs(this.tabs.map(t => t.url));
            this.restoredTabs = false;
        }

        for (const tab of this.tabs) {
            this.stopTitleWatcher(tab.id);
            if (this.activeTabId === tab.id) {
                this.containerView.removeChildView(tab.view);
            }
            if (!tab.view.webContents.isDestroyed()) {
                tab.view.webContents.close();
            }
        }
        this.tabs = [];
        this.activeTabId = null;
        this.broadcastTabState();
    }

    // ── Layout ──
    private updateLayout(): void {
        let bounds: { width: number; height: number };

        if (this.mode === 'same') {
            const [w, h] = this.mainWin.getContentSize();
            bounds = { width: w, height: h };
            this.containerView.setBounds({ x: 0, y: 0, width: w, height: h });
        } else if (this.tabWindow && !this.tabWindow.isDestroyed()) {
            const [w, h] = this.tabWindow.getContentSize();
            bounds = { width: w, height: h };
            this.containerView.setBounds({ x: 0, y: 0, width: w, height: h });
        } else {
            return;
        }

        this.tabBarView.setBounds({
            x: 0, y: 0,
            width: bounds.width,
            height: TAB_BAR_HEIGHT,
        });

        if (this.activeTabId !== null) {
            const tab = this.tabs.find(t => t.id === this.activeTabId);
            if (tab) {
                tab.view.setBounds({
                    x: 0,
                    y: TAB_BAR_HEIGHT,
                    width: bounds.width,
                    height: bounds.height - TAB_BAR_HEIGHT,
                });
            }
        }
    }

    // ── Update tab metadata and broadcast ──
    private updateTabInfo(id: number, updates: Partial<Pick<TabInfo, 'title' | 'url' | 'loading'>>): void {
        const tab = this.tabs.find(t => t.id === id);
        if (!tab) return;
        if (updates.title !== undefined) tab.title = updates.title;
        if (updates.url !== undefined) tab.url = updates.url;
        if (updates.loading !== undefined) tab.loading = updates.loading;
        this.broadcastTabState();
    }

    private broadcastTabState(): void {
        if (this.tabBarView.webContents.isDestroyed()) return;
        const data = this.tabs.map(t => ({
            id: t.id,
            title: t.title,
            active: t.id === this.activeTabId,
            loading: t.loading,
        }));
        this.tabBarView.webContents.send('tabs-update', data);
    }

    private static readonly GENERIC_TITLES = new Set([
        'krunker hub', 'krunker', 'krunker.io', '',
        'hub', 'social', 'profile', 'new tab', 'loading...',
    ]);

    private isGenericTitle(title: string): boolean {
        return TabManager.GENERIC_TITLES.has(title.toLowerCase().trim());
    }

    // ── Persistent URL watcher + DOM title extraction ──
    private startTitleWatcher(tabId: number, wc: Electron.WebContents): void {
        const existing = this.titlePolls.get(tabId);
        if (existing) clearInterval(existing);

        let lastUrl = '';
        let lastDom = '';
        const poll = setInterval(() => {
            if (wc.isDestroyed()) {
                clearInterval(poll);
                this.titlePolls.delete(tabId);
                return;
            }
            wc.executeJavaScript(
                `(function() {
                    var url = window.location.href;
                    var title = '';
                    var ph = document.getElementById('profileHolder');
                    if (ph && ph.style.display === 'block') {
                        var ns = document.getElementById('nameSwitch');
                        if (ns && ns.innerText) title = ns.innerText;
                    }
                    return JSON.stringify({ url: url, dom: title });
                })()`
            ).then((json: string) => {
                const { url, dom } = JSON.parse(json);
                if (url === lastUrl && dom === lastDom) return;
                lastUrl = url;
                lastDom = dom;

                const tab = this.tabs.find(t => t.id === tabId);
                if (!tab) return;

                if (dom) {
                    if (tab.title !== dom) {
                        this.updateTabInfo(tabId, { url, title: dom });
                    } else if (tab.url !== url) {
                        this.updateTabInfo(tabId, { url });
                    }
                    return;
                }

                if (tab.url !== url) {
                    this.updateTabInfo(tabId, { url, title: this.titleFromUrl(url) });
                }
            }).catch(() => {});
        }, 1000);
        this.titlePolls.set(tabId, poll);
    }

    private stopTitleWatcher(tabId: number): void {
        const poll = this.titlePolls.get(tabId);
        if (poll) {
            clearInterval(poll);
            this.titlePolls.delete(tabId);
        }
    }

    // ── Extract a display title from URL ──
    private titleFromUrl(url: string): string {
        try {
            const parsed = new URL(url);
            const p = parsed.searchParams.get('p');
            const q = parsed.searchParams.get('q');

            if (q) return q;

            if (p) {
                const pageMap: Record<string, string> = {
                    profile: 'Profile',
                    leaders: 'Leaderboard',
                    games: 'Games',
                    clans: 'Clans',
                    skins: 'Skins',
                    mods: 'Mods',
                    maps: 'Maps',
                    editor: 'Editor',
                    market: 'Market',
                    itemsales: 'Market Item',
                    inventory: 'Inventory',
                    settings: 'Settings',
                    feed: 'Hub',
                };
                return pageMap[p] || p.charAt(0).toUpperCase() + p.slice(1);
            }

            const path = parsed.pathname.replace(/\.html$/, '').replace(/^\//, '');
            if (path === 'social') return 'Hub';
            if (path) return path.charAt(0).toUpperCase() + path.slice(1);

            return 'New Tab';
        } catch {
            return 'New Tab';
        }
    }
}
