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
export const MATCHMAKER_REGIONS = ['MBI', 'NY', 'FRA', 'SIN', 'DAL', 'SYD', 'MIA', 'BHN', 'TOK', 'BRZ', 'AFR', 'LON', 'CHI', 'SV', 'STL', 'MX'];
export const MATCHMAKER_REGION_NAMES: Record<string, string> = { MBI: 'Mumbai', NY: 'New York', FRA: 'Frankfurt', SIN: 'Singapore', DAL: 'Dallas', SYD: 'Sydney', MIA: 'Miami', BHN: 'Middle East', TOK: 'Tokyo', BRZ: 'Brazil', AFR: 'South Africa', LON: 'London', CHI: 'China', SV: 'Silicon Valley', STL: 'Seattle', MX: 'Mexico' };
export const MAP_ICON_INDICES = ['Burg', 'Littletown', 'Sandstorm', 'Subzero', 'Undergrowth', 'Shipment', 'Freight', 'Lostworld', 'Citadel', 'Oasis', 'Kanji', 'Industry', 'Lumber', 'Evacuation', 'Site', 'SkyTemple', 'Lagoon', 'Bureau', 'Tortuga', 'Tropicano', 'Krunk_Plaza', 'Arena', 'Habitat', 'Atomic', 'Old_Burg', 'Throwback', 'Stockade', 'Facility', 'Clockwork', 'Laboratory', 'Shipyard', 'Soul Sanctum', 'Bazaar', 'Erupt', 'HQ', 'Khepri', 'Lush', 'Vivo', 'Slide Moonlight', 'Eterno Sim'];
export const MATCHMAKER_MAP_NAMES: Record<string, string> = {
    SkyTemple: 'Sky Temple', Krunk_Plaza: 'Krunk Plaza', Old_Burg: 'Old Burg',
    'Soul Sanctum': 'Soul Sanctum', 'Slide Moonlight': 'Slide Moonlight', 'Eterno Sim': 'Eterno Sim',
};

// Official maps shown in matchmaker settings
export const MATCHMAKER_MAP_FILTER = [
    'Burg', 'Littletown', 'Sandstorm', 'Subzero', 'Undergrowth', 'Freight',
    'Lostworld', 'Citadel', 'Oasis', 'Kanji', 'Industry', 'Lumber', 'Evacuation',
    'Site', 'SkyTemple', 'Lagoon', 'Tropicano', 'Habitat', 'Atomic', 'Old_Burg',
    'Throwback', 'Clockwork', 'Bazaar', 'Erupt', 'HQ', 'Lush', 'Vivo',
    'Slide Moonlight', 'Eterno Sim',
];

// ── Animation constants ──
const MAX_FEED_ENTRIES = 4;
const MAX_ANIMATION_MS = 2000;
const BASE_TICK_MS = 80;
const MIN_TICK_MS = 20;
const POST_SCAN_PAUSE_MS = 300;
const SCAN_FLASH_MS = 800;

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
    autoJoin: boolean;
    acceptKey: Keybind;
    cancelKey: Keybind;
}

function secondsToTimestring(num: number): string {
    const minutes = Math.floor(num / 60);
    const seconds = num % 60;
    if (minutes < 1) return `${num}s`;
    return `${minutes}m ${seconds}s`;
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

// Result-phase elements
const popupTitle = document.createElement('div');
popupTitle.id = 'matchmakerPopupTitle';
popupElement.appendChild(popupTitle);

const popupDescription = document.createElement('div');
popupDescription.id = 'matchmakerPopupDescription';
popupElement.appendChild(popupDescription);

const popupOptions = document.createElement('div');
popupOptions.id = 'matchmakerPopupOptions';

const popupConfirmBtn = document.createElement('div');
popupConfirmBtn.id = 'matchmakerConfirmButton';
popupConfirmBtn.className = 'matchmakerPopupButton bigShadowT';
popupConfirmBtn.textContent = 'Join';
popupConfirmBtn.setAttribute('onmouseenter', 'playTick()');
popupConfirmBtn.addEventListener('click', () => decideMatchmakerDecision(true));

const popupCancelBtn = document.createElement('div');
popupCancelBtn.id = 'matchmakerCancelButton';
popupCancelBtn.className = 'matchmakerPopupButton bigShadowT';
popupCancelBtn.textContent = 'Cancel';
popupCancelBtn.setAttribute('onmouseenter', 'playTick()');
popupCancelBtn.addEventListener('click', () => decideMatchmakerDecision(false));

popupOptions.appendChild(popupConfirmBtn);
popupOptions.appendChild(popupCancelBtn);
popupElement.appendChild(popupOptions);

// Search-phase elements
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
let popupGameID = '';
let popupCandidates: MatchmakerGame[] = [];
let openServerBrowser = true;
let confirmKey: Keybind = { key: 'Enter', ctrl: false, shift: false, alt: false };
let cancelKey: Keybind = { key: 'Escape', ctrl: false, shift: false, alt: false };
let searchAborted = false;

function abortSearch(): void {
    searchAborted = true;
    const w = window as any;
    if (typeof w.playSelect === 'function') w.playSelect();
    dismissPopup();
}

async function verifyAndJoin(gameID: string): Promise<void> {
    try {
        const resp = await fetch(`https://matchmaker.krunker.io/game-list?hostname=${window.location.hostname}`);
        const result = await resp.json();
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
        dismissPopup();
        window.location.href = `https://krunker.io/?game=${gameID}`;
    }
}

function dismissPopup(): void {
    document.removeEventListener('keydown', handleSearchBind, true);
    document.removeEventListener('keydown', handleMatchmakerBind, true);
    if (popupElement.parentNode) popupElement.remove();
    popupElement.classList.remove('searching');
}

function decideMatchmakerDecision(accept: boolean): void {
    const w = window as any;
    if (typeof w.playSelect === 'function') w.playSelect();

    if (accept && popupGameID !== 'none') {
        verifyAndJoin(popupGameID);
    } else {
        dismissPopup();
        if (popupGameID === 'none' && openServerBrowser && typeof w.openServerWindow === 'function') {
            w.openServerWindow(0);
        }
    }
}

function handleSearchBind(event: KeyboardEvent): void {
    if (document.pointerLockElement) return;
    if (matchesKey(cancelKey, event)) {
        event.preventDefault();
        event.stopPropagation();
        abortSearch();
    }
}

function handleMatchmakerBind(event: KeyboardEvent): void {
    if (document.pointerLockElement) return;
    const isAccept = matchesKey(confirmKey, event);
    const isCancel = matchesKey(cancelKey, event);
    if (isAccept || isCancel) {
        document.removeEventListener('keydown', handleMatchmakerBind, true);
        decideMatchmakerDecision(isAccept);
    }
}

function showResultPopup(game: MatchmakerGame): void {
    popupElement.classList.remove('searching');
    const mapIdx = MAP_ICON_INDICES.indexOf(game.map);
    popupElement.style.backgroundImage = `url(https://assets.krunker.io/img/maps/map_${mapIdx >= 0 ? mapIdx : 0}.png)`;

    popupGameID = game.gameID;
    if (game.gameID === 'none') {
        popupTitle.innerText = 'No Games Found...';
        popupDescription.innerHTML = 'Check the server browser to see other lobbies.';
        popupConfirmBtn.style.display = 'none';
    } else {
        popupTitle.innerText = 'Game Found!';
        const regionName = MATCHMAKER_REGION_NAMES[game.region] ?? 'Unknown Region';
        popupDescription.innerHTML = `${escapeHtml(game.gamemode)} on ${escapeHtml(game.map)} (${escapeHtml(regionName)})<br/>${game.playerCount}/${game.playerLimit} Players, ${secondsToTimestring(game.remainingTime)} Left`;
        popupConfirmBtn.style.display = 'block';
    }

    // Re-trigger slide animation
    popupElement.style.animation = 'none';
    void popupElement.offsetWidth;
    popupElement.style.animation = '';

    document.removeEventListener('keydown', handleSearchBind, true);
    document.addEventListener('keydown', handleMatchmakerBind, true);
}

function showSearchPopup(): void {
    searchAborted = false;
    popupElement.classList.add('searching');
    popupElement.style.backgroundImage = 'none';
    searchStatus.textContent = 'Connecting...';
    searchFeed.innerHTML = '';
    searchCounter.textContent = '';

    document.removeEventListener('keydown', handleMatchmakerBind, true);
    document.addEventListener('keydown', handleSearchBind, true);

    const uiBase = document.getElementById('uiBase');
    if (uiBase) uiBase.appendChild(popupElement);
}

function createFeedEntry(lobby: RawLobby): HTMLDivElement {
    const entry = document.createElement('div');
    entry.className = `mm-feed-entry ${lobby.passesFilter ? 'mm-pass' : 'mm-fail'}`;

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

async function animateLobbyScan(lobbies: RawLobby[]): Promise<void> {
    if (lobbies.length === 0) return;

    searchStatus.textContent = 'Scanning lobbies...';
    const total = lobbies.length;

    const maxEntries = Math.floor(MAX_ANIMATION_MS / BASE_TICK_MS);
    const step = total > maxEntries ? total / maxEntries : 1;
    const tickMs = total > maxEntries ? BASE_TICK_MS : Math.max(MIN_TICK_MS, Math.min(BASE_TICK_MS, MAX_ANIMATION_MS / total));

    for (let f = 0; f < total; f += step) {
        if (searchAborted) return;
        const i = Math.min(Math.floor(f), total - 1);

        const entry = createFeedEntry(lobbies[i]);
        searchFeed.appendChild(entry);

        while (searchFeed.children.length > MAX_FEED_ENTRIES) {
            searchFeed.removeChild(searchFeed.firstChild!);
        }

        searchCounter.textContent = `Checked: ${i + 1} / ${total} lobbies`;

        await new Promise(r => setTimeout(r, tickMs));
    }

    searchCounter.textContent = `Checked: ${total} / ${total} lobbies`;

    if (!searchAborted) {
        await new Promise(r => setTimeout(r, POST_SCAN_PAUSE_MS));
    }
}

async function fetchAllGames(mmConfig: MatchmakerConfig): Promise<{ all: RawLobby[]; filtered: MatchmakerGame[] }> {
    const response = await fetch(`https://matchmaker.krunker.io/game-list?hostname=${window.location.hostname}`);
    const result = await response.json();
    const all: RawLobby[] = [];
    const filtered: MatchmakerGame[] = [];

    for (const game of result.games) {
        const gameID: string = game[0];
        const region = gameID.split(':')[0];
        const playerCount: number = game[2];
        const playerLimit: number = game[3];
        const map: string = game[4].i;
        const gamemode = MATCHMAKER_GAMEMODES[game[4].g] ?? 'Unknown Gamemode';
        const remainingTime: number = game[5];

        let passesFilter = true;
        if (mmConfig.regions.length > 0 && !mmConfig.regions.includes(region)) passesFilter = false;
        else if (mmConfig.gamemodes.length > 0 && !mmConfig.gamemodes.includes(gamemode)) passesFilter = false;
        else if (mmConfig.maps.length > 0 && !mmConfig.maps.includes(map)) passesFilter = false;
        else if (playerCount < mmConfig.minPlayers) passesFilter = false;
        else if (playerCount > mmConfig.maxPlayers) passesFilter = false;
        else if (remainingTime < mmConfig.minRemainingTime) passesFilter = false;
        else if (playerCount === playerLimit) passesFilter = false;
        else if (window.location.href.includes(gameID)) passesFilter = false;

        const lobby = { gameID, region, playerCount, playerLimit, map, gamemode, remainingTime, passesFilter };
        all.push(lobby);
        if (passesFilter) filtered.push(lobby);
    }

    return { all, filtered };
}

function sortByPingThenPlayers(games: MatchmakerGame[], pings: Record<string, number>): MatchmakerGame[] {
    return games.sort((a, b) => {
        const pingA = pings[a.region] ?? 999;
        const pingB = pings[b.region] ?? 999;
        if (pingA !== pingB) return pingA - pingB;
        return b.playerCount - a.playerCount;
    });
}

export async function fetchGame(mmConfig: MatchmakerConfig, _con?: SavedConsole): Promise<void> {
    openServerBrowser = mmConfig.openServerBrowser;
    confirmKey = mmConfig.acceptKey;
    cancelKey = mmConfig.cancelKey;

    // Dismiss existing popup if active (also aborts in-flight search)
    searchAborted = true;
    dismissPopup();

    // Phase 1: Show search popup immediately
    showSearchPopup();
    _con?.log('[KCC-MM] Fetching game list + pings...');

    // Phase 2: Fetch data
    let allLobbies: RawLobby[];
    let filtered: MatchmakerGame[];
    let pings: Record<string, number>;
    try {
        const [fetchResult, pingResult] = await Promise.all([
            fetchAllGames(mmConfig),
            ipcRenderer.invoke('ping-regions').catch(() => ({} as Record<string, number>)),
        ]);
        allLobbies = fetchResult.all;
        filtered = fetchResult.filtered;
        pings = pingResult;
    } catch {
        if (!searchAborted) {
            searchStatus.textContent = 'Failed to fetch lobbies';
            await new Promise(r => setTimeout(r, 2000));
            dismissPopup();
        }
        return;
    }

    if (searchAborted) return;

    _con?.log('[KCC-MM]', filtered.length, '/', allLobbies.length, 'games passed filters');

    // Sort immediately — result is ready
    if (filtered.length > 0) sortByPingThenPlayers(filtered, pings);
    popupCandidates = filtered;

    // Fire animation in background (non-blocking eye candy)
    animateLobbyScan(allLobbies);

    // Brief visual flash of the feed before showing result
    await new Promise(r => setTimeout(r, SCAN_FLASH_MS));
    if (searchAborted) return;

    // Phase 3: Show result
    if (filtered.length > 0) {
        // Pick randomly from the top tier of comparable matches for variety
        const top = filtered[0];
        const topPing = pings[top.region] ?? 999;
        const pool = filtered.filter(g => {
            const gPing = pings[g.region] ?? 999;
            return Math.abs(gPing - topPing) <= 20
                && top.playerCount - g.playerCount <= 2;
        });
        const best = pool[Math.floor(Math.random() * pool.length)];
        _con?.log('[KCC-MM] Best match:', best.gameID, best.region, best.map, `(${pings[best.region] ?? '?'}ms, pool: ${pool.length})`);

        if (mmConfig.autoJoin) {
            // Brief "Lobby Found!" flash before joining
            const regionName = MATCHMAKER_REGION_NAMES[best.region] ?? best.region;
            searchStatus.textContent = 'Lobby Found!';
            searchFeed.innerHTML = '';
            const found = document.createElement('div');
            found.className = 'mm-feed-entry mm-pass';
            found.style.cssText = 'font-size:1.1em;justify-content:center;';
            found.innerHTML =
                `<span class="mm-feed-region">${escapeHtml(best.region)}</span>` +
                `<span class="mm-feed-map">${escapeHtml(best.map)}</span>` +
                `<span class="mm-feed-players">${best.playerCount}/${best.playerLimit}</span>`;
            searchFeed.appendChild(found);
            searchCounter.textContent = `${best.gamemode} \u00B7 ${regionName} \u00B7 ${pings[best.region] ?? '?'}ms`;
            await new Promise(r => setTimeout(r, 1200));
            await verifyAndJoin(best.gameID);
            return;
        }

        showResultPopup(best);
    } else {
        _con?.log('[KCC-MM] No matching games found');

        if (mmConfig.autoJoin) {
            dismissPopup();
            if (openServerBrowser && typeof (window as any).openServerWindow === 'function') {
                (window as any).openServerWindow(0);
            }
            return;
        }

        showResultPopup({
            gameID: 'none',
            region: 'none',
            playerCount: 0,
            playerLimit: 0,
            map: MAP_ICON_INDICES[0],
            gamemode: MATCHMAKER_GAMEMODES[0],
            remainingTime: 0,
        });
    }
}
