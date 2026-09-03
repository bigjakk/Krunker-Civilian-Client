// ── Custom Matchmaker (ported from Crankshaft) ──
// Fetches live lobby list from matchmaker.krunker.io, filters by user criteria,
// sorts by lowest ping then highest player count, and joins the best match.
// Shows a live lobby-cycling search popup while scanning.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';
import { escapeHtml, type SavedConsole } from './utils';

// Full array — indices must match the server's gamemode IDs (game[4].g)
export const MATCHMAKER_GAMEMODES = ['Free for All', 'Team Deathmatch', 'Hardpoint', 'Capture the Flag', 'Parkour', 'Hide & Seek', 'Infected', 'Race', 'Last Man Standing', 'Simon Says', 'Gun Game', 'Prop Hunt', 'Boss Hunt', 'Classic FFA', 'Deposit', 'Stalker', 'King of the Hill', 'One in the Chamber', 'Trade', 'Kill Confirmed', 'Defuse', 'Sharp Shooter', 'Traitor', 'Raid', 'Blitz', 'Domination', 'Squad Deathmatch', 'Kranked FFA', 'Team Defender', 'Deposit FFA', 'Chaos Snipers', 'Bighead FFA'];

// Modes shown in matchmaker settings
export const MATCHMAKER_GAMEMODE_FILTER = [
    'Free for All', 'Team Deathmatch', 'Hardpoint', 'Capture the Flag', 'Parkour',
    'Gun Game', 'Classic FFA', 'Deposit', 'Kill Confirmed', 'Sharp Shooter',
    'Domination', 'Kranked FFA', 'Team Defender', 'Deposit FFA', 'Chaos Snipers',
    'Bighead FFA',
];
export const MATCHMAKER_REGIONS = ['SV', 'TOK', 'FRA', 'MBI', 'SYD', 'SIN', 'DAL', 'BHN', 'BRZ', 'NY'];
export const MATCHMAKER_REGION_NAMES: Record<string, string> = { SV: 'Silicon Valley', TOK: 'Tokyo', FRA: 'Frankfurt', MBI: 'Mumbai', SYD: 'Sydney', SIN: 'Singapore', DAL: 'Dallas', BHN: 'Bahrain', BRZ: 'Brazil', NY: 'New York' };
export const MAP_ICON_INDICES = ['Burg', 'Littletown', 'Sandstorm', 'Subzero', 'Undergrowth', 'Shipment', 'Freight', 'Lostworld', 'Citadel', 'Oasis', 'Kanji', 'Industry', 'Lumber', 'Evacuation', 'Site', 'SkyTemple', 'Lagoon', 'Bureau', 'Tortuga', 'Tropicano', 'Krunk_Plaza', 'Arena', 'Habitat', 'Atomic', 'Old_Burg', 'Throwback', 'Stockade', 'Facility', 'Clockwork', 'Laboratory', 'Shipyard', 'Soul Sanctum', 'Bazaar', 'Erupt', 'HQ', 'Khepri', 'Lush', 'Vivo', 'Slide Moonlight', 'Eterno Simulator'];
export const MATCHMAKER_MAP_NAMES: Record<string, string> = {
    SkyTemple: 'Sky Temple', Krunk_Plaza: 'Krunk Plaza', Old_Burg: 'Old Burg',
};

// Official maps shown in matchmaker settings
export const MATCHMAKER_MAP_FILTER = [
    'Burg', 'Littletown', 'Sandstorm', 'Subzero', 'Undergrowth', 'Freight',
    'Lostworld', 'Citadel', 'Oasis', 'Kanji', 'Industry', 'Lumber', 'Evacuation',
    'Site', 'SkyTemple', 'Lagoon', 'Tropicano', 'Habitat', 'Atomic', 'Old_Burg',
    'Throwback', 'Clockwork', 'Bazaar', 'Erupt', 'HQ', 'Lush', 'Vivo',
    'Slide Moonlight', 'Eterno Simulator', 'Eterno Jump', 'Frontier',
];

// Normalize a map identifier for comparison: lowercase, strip non-alphanumerics.
// Live game IDs use different casing/separators than the display names in
// MATCHMAKER_MAP_FILTER — e.g. the live ID "slide_moonlight" must match the
// filter entry "Slide Moonlight". Both sides are normalized before comparing.
function normalizeMapId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Krunker hosts a top-down preview image per official map at a fixed index — the
// map's position in MAP_ICON_INDICES. Community maps aren't indexed (no icon).
// Lookup is normalized so live IDs like "slide_moonlight" still resolve.
const MAP_ICON_INDEX_BY_NORM = new Map<string, number>(
    MAP_ICON_INDICES.map((name, i) => [normalizeMapId(name), i]),
);
// Official maps Krunker added after MAP_ICON_INDICES was last synced: their preview
// images (map_<idx>.png) exist beyond index 39. Registered explicitly with the icon
// index verified by inspecting the live image.
MAP_ICON_INDEX_BY_NORM.set(normalizeMapId('Eterno Jump'), 41);
MAP_ICON_INDEX_BY_NORM.set(normalizeMapId('Frontier'), 42);
// Normalized IDs of the maps offered in the picker. Used as the default map
// filter when the user selects no maps, so anything outside the curated list —
// community maps (e.g. "AIM_Room") and unlisted official maps (e.g. "Shipyard")
// — is never matched in "search all" mode.
const DEFAULT_MAP_NORMS = new Set(MATCHMAKER_MAP_FILTER.map(normalizeMapId));
// Always-on parkour maps that legitimately run with no round timer. An untimed
// lobby on any other map is a hosted custom game — never matched.
const PARKOUR_MAP_NORMS = new Set(['Eterno Jump', 'Slide Moonlight'].map(normalizeMapId));
export function mapIconUrl(mapName: string): string | null {
    const idx = MAP_ICON_INDEX_BY_NORM.get(normalizeMapId(mapName));
    return idx === undefined ? null : `https://assets.krunker.io/img/maps/map_${idx}.png`;
}

function createMapIcon(mapName: string, className: string): HTMLImageElement | null {
    const url = mapIconUrl(mapName);
    if (!url) return null;
    const img = document.createElement('img');
    img.className = className;
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    return img;
}

// ── Animation constants ──
const MAX_FEED_ENTRIES = 4;
const MAX_ANIMATION_MS = 1100;
const BASE_TICK_MS = 80;
const MIN_TICK_MS = 20;
const POST_SCAN_PAUSE_MS = 180;
const FOUND_HOLD_MS = 1200;
const NOT_FOUND_HOLD_MS = 1100;
const FETCH_TIMEOUT_MS = 10000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface MatchmakerGame {
    gameID: string;
    region: string;
    playerCount: number;
    playerLimit: number;
    map: string;
    gamemode: string;
    remainingTime: number;
}

interface RawLobby extends MatchmakerGame {
    passesFilter: boolean;
}

export interface MatchmakerConfig {
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
    cancelKey: Keybind;
}

function matchesKey(bind: Keybind, event: KeyboardEvent): boolean {
    if ((document.activeElement as HTMLElement)?.tagName === 'INPUT') return false;
    return event.key === bind.key
        && event.shiftKey === bind.shift
        && event.altKey === bind.alt
        && event.ctrlKey === bind.ctrl;
}

// ── Popup DOM (created once, reused) ──
const POPUP_ID = 'matchmakerPopupContainer';
const popupElement = document.createElement('div');
popupElement.id = POPUP_ID;

const searchContainer = document.createElement('div');
searchContainer.id = 'matchmakerSearchContainer';

const searchStatus = document.createElement('div');
searchStatus.id = 'matchmakerSearchStatus';
searchContainer.appendChild(searchStatus);

const searchFeed = document.createElement('div');
searchFeed.id = 'matchmakerSearchFeed';
searchContainer.appendChild(searchFeed);

const searchCounter = document.createElement('div');
searchCounter.id = 'matchmakerSearchCounter';
searchContainer.appendChild(searchCounter);

const searchCancelBtn = document.createElement('div');
searchCancelBtn.id = 'matchmakerSearchCancel';
searchCancelBtn.textContent = 'Cancel';
searchCancelBtn.setAttribute('onmouseenter', 'playTick()');
searchCancelBtn.addEventListener('click', () => abortSearch());
searchContainer.appendChild(searchCancelBtn);

popupElement.appendChild(searchContainer);

// ── State ──
let popupCandidates: MatchmakerGame[] = [];
let openServerBrowser = true;
let cancelKey: Keybind = { key: 'Escape', ctrl: false, shift: false, alt: false };
// id of the in-flight search (0 = idle); unique so a stale continuation can tell it was cancelled.
let activeRun = 0;
let runCounter = 0;

function cancelled(run: number): boolean {
    return run !== activeRun;
}

function abortSearch(): void {
    activeRun = 0;
    const w = window as any;
    if (typeof w.playSelect === 'function') w.playSelect();
    dismissPopup();
}

async function verifyAndJoin(run: number, gameID: string): Promise<void> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const resp = await fetch(`https://matchmaker.krunker.io/game-list?hostname=${window.location.hostname}`, { signal: controller.signal });
        clearTimeout(timeout);
        const result = await resp.json();
        if (cancelled(run)) return;
        const liveMap = new Map<string, { players: number; limit: number }>();
        for (const g of result.games) {
            liveMap.set(g[0], { players: g[2], limit: g[3] });
        }

        const ordered = [gameID, ...popupCandidates.filter(c => c.gameID !== gameID).map(c => c.gameID)];
        for (const id of ordered) {
            const live = liveMap.get(id);
            if (live && live.players < live.limit) {
                dismissPopup();
                window.location.href = `https://krunker.io/?game=${id}`;
                return;
            }
        }

        dismissPopup();
        if (openServerBrowser && typeof (window as any).openServerWindow === 'function') {
            (window as any).openServerWindow(0);
        }
    } catch {
        if (cancelled(run)) return;
        dismissPopup();
        window.location.href = `https://krunker.io/?game=${gameID}`;
    }
}

function dismissPopup(): void {
    document.removeEventListener('keydown', handleSearchBind, true);
    if (popupElement.parentNode) popupElement.remove();
}

function handleSearchBind(event: KeyboardEvent): void {
    if (document.pointerLockElement) return;
    if (matchesKey(cancelKey, event)) {
        event.preventDefault();
        event.stopPropagation();
        abortSearch();
    }
}

function showSearchPopup(): void {
    searchStatus.textContent = 'Connecting...';
    searchStatus.classList.remove('mm-status-fail');
    searchFeed.innerHTML = '';
    searchFeed.classList.remove('mm-feed-found');
    searchCounter.textContent = '';

    document.addEventListener('keydown', handleSearchBind, true);

    const uiBase = document.getElementById('uiBase');
    if (uiBase) uiBase.appendChild(popupElement);
}

function createFeedEntry(lobby: RawLobby): HTMLDivElement {
    const entry = document.createElement('div');
    entry.className = `mm-feed-entry ${lobby.passesFilter ? 'mm-pass' : 'mm-fail'}`;

    const icon = createMapIcon(lobby.map, 'mm-feed-icon');
    if (icon) entry.appendChild(icon);

    const region = document.createElement('span');
    region.className = 'mm-feed-region';
    region.textContent = lobby.region;

    const map = document.createElement('span');
    map.className = 'mm-feed-map';
    map.textContent = lobby.map;

    const players = document.createElement('span');
    players.className = 'mm-feed-players';
    players.textContent = `${lobby.playerCount}/${lobby.playerLimit}`;

    entry.appendChild(region);
    entry.appendChild(map);
    entry.appendChild(players);
    return entry;
}

async function animateLobbyScan(run: number, lobbies: RawLobby[], finalLobby?: MatchmakerGame): Promise<void> {
    if (lobbies.length === 0) return;

    searchStatus.textContent = 'Scanning lobbies...';
    const total = lobbies.length;

    const maxEntries = Math.floor(MAX_ANIMATION_MS / BASE_TICK_MS);
    const step = total > maxEntries ? total / maxEntries : 1;
    const tickMs = total > maxEntries ? BASE_TICK_MS : Math.max(MIN_TICK_MS, Math.min(BASE_TICK_MS, MAX_ANIMATION_MS / total));

    for (let f = 0; f < total; f += step) {
        if (cancelled(run)) return;
        const i = Math.min(Math.floor(f), total - 1);

        const entry = createFeedEntry(lobbies[i]);
        searchFeed.appendChild(entry);

        while (searchFeed.children.length > MAX_FEED_ENTRIES) {
            searchFeed.removeChild(searchFeed.firstChild!);
        }

        searchCounter.textContent = `Checked: ${i + 1} / ${total} lobbies`;

        await sleep(tickMs);
    }

    if (cancelled(run)) return;
    searchCounter.textContent = `Checked: ${total} / ${total} lobbies`;

    // Settle the scroll on the matched lobby so it visibly "lands" on the result
    if (finalLobby) {
        const landed = createFeedEntry({ ...finalLobby, passesFilter: true });
        landed.classList.add('mm-feed-landed');
        searchFeed.appendChild(landed);
        while (searchFeed.children.length > MAX_FEED_ENTRIES) {
            searchFeed.removeChild(searchFeed.firstChild!);
        }
    }

    await sleep(POST_SCAN_PAUSE_MS);
}

async function fetchAllGames(mmConfig: MatchmakerConfig): Promise<{ all: RawLobby[]; filtered: MatchmakerGame[] }> {
    const response = await fetch(`https://matchmaker.krunker.io/game-list?hostname=${window.location.hostname}`);
    const result = await response.json();
    const all: RawLobby[] = [];
    const filtered: MatchmakerGame[] = [];

    // Normalize configured maps once so live IDs (e.g. "slide_moonlight") match
    // the display names stored in config (e.g. "Slide Moonlight"). When the user
    // selects no maps, default to the picker's map list instead of "everything" —
    // this keeps custom/community maps (e.g. "AIM_Room") out of the results.
    const mapFilter = mmConfig.maps.length > 0
        ? new Set(mmConfig.maps.map(normalizeMapId))
        : DEFAULT_MAP_NORMS;

    for (const game of result.games) {
        const gameID: string = game[0];
        const region = gameID.split(':')[0];
        const playerCount: number = game[2];
        const playerLimit: number = game[3];
        const map: string = game[4].i;
        const gamemode = MATCHMAKER_GAMEMODES[game[4].g] ?? 'Unknown Gamemode';
        const remainingTime: number = game[5];
        const mapNorm = normalizeMapId(map);

        let passesFilter = true;
        if (mmConfig.regions.length > 0 && !mmConfig.regions.includes(region)) passesFilter = false;
        else if (mmConfig.gamemodes.length > 0 && !mmConfig.gamemodes.includes(gamemode)) passesFilter = false;
        else if (!mapFilter.has(mapNorm)) passesFilter = false;
        else if (playerCount < mmConfig.minPlayers) passesFilter = false;
        else if (playerCount > mmConfig.maxPlayers) passesFilter = false;
        // remainingTime of 0 means "no round timer / unlimited", not "0 seconds left".
        // Only the always-on parkour maps legitimately run untimed — an untimed lobby
        // on any other map is a hosted custom game. Timed lobbies honor the minimum.
        else if (remainingTime <= 0 && !PARKOUR_MAP_NORMS.has(mapNorm)) passesFilter = false;
        else if (remainingTime > 0 && remainingTime < mmConfig.minRemainingTime) passesFilter = false;
        else if (playerCount === playerLimit) passesFilter = false;
        else if (window.location.href.includes(gameID)) passesFilter = false;

        const lobby = { gameID, region, playerCount, playerLimit, map, gamemode, remainingTime, passesFilter };
        all.push(lobby);
        if (passesFilter) filtered.push(lobby);
    }

    return { all, filtered };
}

function sortGames(games: MatchmakerGame[], pings: Record<string, number>, sortByPlayers: boolean): MatchmakerGame[] {
    return games.sort((a, b) => {
        if (sortByPlayers) {
            if (a.playerCount !== b.playerCount) return b.playerCount - a.playerCount;
            return (pings[a.region] ?? 999) - (pings[b.region] ?? 999);
        }
        const pingA = pings[a.region] ?? 999;
        const pingB = pings[b.region] ?? 999;
        if (pingA !== pingB) return pingA - pingB;
        return b.playerCount - a.playerCount;
    });
}

// Repeat presses while a search is running are ignored; the cancel keybind stops it.
export async function fetchGame(mmConfig: MatchmakerConfig, _con?: SavedConsole): Promise<void> {
    if (activeRun !== 0) return;
    const myRun = ++runCounter;
    activeRun = myRun;
    try {
        await runSearch(myRun, mmConfig, _con);
    } finally {
        if (activeRun === myRun) activeRun = 0;
    }
}

async function runSearch(myRun: number, mmConfig: MatchmakerConfig, _con?: SavedConsole): Promise<void> {
    openServerBrowser = mmConfig.openServerBrowser;
    cancelKey = mmConfig.cancelKey;
    const hideOverlay = mmConfig.hideSearchOverlay;

    // Phase 1: show the popup. Hidden runs skip it, so the cancel keybind is
    // intentionally inert — there's nothing to cancel during a silent search.
    if (!hideOverlay) showSearchPopup();
    _con?.log('[KCC-MM] Fetching game list + pings...');

    // Phase 2: Fetch data
    let allLobbies: RawLobby[];
    let filtered: MatchmakerGame[];
    let pings: Record<string, number>;
    try {
        const [fetchResult, pingResult] = await Promise.race([
            Promise.all([
                fetchAllGames(mmConfig),
                ipcRenderer.invoke('ping-regions').catch(() => ({} as Record<string, number>)),
            ]),
            sleep(FETCH_TIMEOUT_MS).then(() => { throw new Error('timed out'); }),
        ]);
        allLobbies = fetchResult.all;
        filtered = fetchResult.filtered;
        pings = pingResult;
    } catch (err) {
        _con?.error('[KCC-MM] Failed to fetch lobby list/pings:', err);
        if (!cancelled(myRun) && !hideOverlay) {
            searchStatus.textContent = 'Failed to fetch lobbies';
            await sleep(2000);
            if (cancelled(myRun)) return;
            dismissPopup();
        }
        return;
    }

    if (cancelled(myRun)) return;

    _con?.log('[KCC-MM]', filtered.length, '/', allLobbies.length, 'games passed filters');

    // Sort immediately — result is ready
    if (filtered.length > 0) sortGames(filtered, pings, mmConfig.sortByPlayers);
    popupCandidates = filtered;

    // Phase 3: pick the match (if any), then play the scan and reveal the result
    let best: MatchmakerGame | undefined;
    if (filtered.length > 0) {
        // Pick randomly from the top tier of comparable matches for variety
        const top = filtered[0];
        const topPing = pings[top.region] ?? 999;
        const pool = filtered.filter(g => {
            const gPing = pings[g.region] ?? 999;
            return Math.abs(gPing - topPing) <= 20
                && top.playerCount - g.playerCount <= 2;
        });
        best = pool[Math.floor(Math.random() * pool.length)];
        _con?.log('[KCC-MM] Best match:', best.gameID, best.region, best.map, `(${pings[best.region] ?? '?'}ms, pool: ${pool.length})`);
    }

    // Scan scrolls the lobbies and, when there's a match, settles on it before stopping
    if (!hideOverlay) await animateLobbyScan(myRun, allLobbies, best);
    if (cancelled(myRun)) return;

    if (best) {
        if (!hideOverlay) {
            // Grow the matched lobby into focus, then auto-join
            const regionName = MATCHMAKER_REGION_NAMES[best.region] ?? best.region;
            searchStatus.textContent = 'Lobby Found!';
            searchFeed.classList.add('mm-feed-found');
            searchFeed.innerHTML = '';
            const found = document.createElement('div');
            found.className = 'mm-feed-entry mm-pass mm-found';
            found.innerHTML =
                `<span class="mm-feed-region">${escapeHtml(best.region)}</span>` +
                `<span class="mm-feed-map">${escapeHtml(best.map)}</span>` +
                `<span class="mm-feed-players">${best.playerCount}/${best.playerLimit}</span>`;
            const foundIcon = createMapIcon(best.map, 'mm-feed-icon mm-feed-icon-found');
            if (foundIcon) found.prepend(foundIcon);
            searchFeed.appendChild(found);
            searchCounter.textContent = `${best.gamemode} \u00B7 ${regionName} \u00B7 ${pings[best.region] ?? '?'}ms`;
            await sleep(FOUND_HOLD_MS);
            if (cancelled(myRun)) return;
        }
        await verifyAndJoin(myRun, best.gameID);
    } else {
        _con?.log('[KCC-MM] No matching games found');
        if (!hideOverlay) {
            // Mirror the "Lobby Found!" reveal with a clear "not found" state before
            // falling back to the server browser.
            searchStatus.textContent = 'No Lobby Found';
            searchStatus.classList.add('mm-status-fail');
            searchFeed.classList.add('mm-feed-found');
            searchFeed.innerHTML = '';
            const notFound = document.createElement('div');
            notFound.className = 'mm-feed-entry mm-notfound';
            notFound.textContent = 'No matching lobbies';
            searchFeed.appendChild(notFound);
            searchCounter.textContent = openServerBrowser ? 'Opening server browser…' : '';
            await sleep(NOT_FOUND_HOLD_MS);
            if (cancelled(myRun)) return;
        }
        dismissPopup();
        if (openServerBrowser && typeof (window as any).openServerWindow === 'function') {
            (window as any).openServerWindow(0);
        }
    }
}
