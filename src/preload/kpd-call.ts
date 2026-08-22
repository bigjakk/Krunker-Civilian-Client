// Suspect + own ping readout on Krunker's KPD call spectate UI.
import { ipcRenderer } from 'electron';

const PING_ID = 'kccSuspectPing';
const PLACEHOLDER_TITLE = /^Is Suspect hacking\?$/i;

let watch: ReturnType<typeof setInterval> | null = null;
let tick = 0;
let resolved = false;
let suspectVal: HTMLElement | null = null;
let ownVal: HTMLElement | null = null;
let regionVal: HTMLElement | null = null;

function onKPDCall(): boolean {
    const txt = document.getElementById('specKPDTxt');
    return !!txt && (txt.textContent ?? '').includes('hacking?') && !!document.getElementById('specKRHid');
}

function gameRegion(): string {
    const label = document.getElementById('menuRegionLabel')?.textContent?.trim();
    if (label && label !== '...') return label;
    const game = new URLSearchParams(window.location.search).get('game');
    return game && game.includes(':') ? game.split(':')[0] : '';
}

function pingColor(ms: number): string {
    if (ms >= 150) return 'rgb(255,75,66)';
    if (ms >= 50) return 'rgb(255,213,66)';
    return 'rgb(158,235,86)';
}

// Krunker blanks or zeroes the HUD ping during a call, so fall back to a measured round-trip.
function updateOwnPing(): void {
    const target = ownVal;
    if (!target) return;
    // innerText, not textContent: the Direct Server Ping lock replaces that setter with no getter.
    const hud = parseInt(/\d+/.exec(document.getElementById('pingText')?.innerText ?? '')?.[0] ?? '', 10);
    if (hud > 0) { target.textContent = `${hud}ms`; return; }
    ipcRenderer.invoke('game-server-ping').then((ms: number) => {
        if (target !== ownVal) return;
        target.textContent = ms > 0 ? `${ms}ms` : '?';
    }).catch(() => {
        if (target === ownVal) target.textContent = '?';
    });
}

function suspectName(): string {
    const el = document.querySelector('.specKPDSuspect .specPlayerName') as HTMLElement | null;
    return el?.innerText?.trim() ?? '';
}

// Krunker resolves the name itself but only repaints the title on focus change.
function fillTitleName(name: string): void {
    const txt = document.getElementById('specKPDTxt');
    if (!txt || !name) return;
    if (!PLACEHOLDER_TITLE.test((txt.textContent ?? '').trim())) return;
    txt.textContent = `Is ${name} hacking?`;
}

function suspectPing(target: string): number {
    const list = (window as any).windows?.[22];
    if (!target || !list) return -1;

    let html: string;
    try { html = list.gen(); } catch { return -1; }

    for (const row of new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.pListName')) {
        const anchor = row.querySelector('a');
        if (!anchor) continue;
        const text = (anchor.textContent ?? '').trim();
        const named = /openPlayerProfile\s*\(\s*["'`]([^"'`]+)["'`]/.exec(anchor.getAttribute('onclick') ?? '');
        if ((named ? named[1] : text) !== target && text !== target) continue;
        const pingEl = row.querySelector('[data-ping], .pListPing');
        const ms = parseInt(pingEl?.getAttribute('data-ping') ?? pingEl?.getAttribute('title') ?? '', 10);
        return isNaN(ms) ? -1 : ms;
    }
    return -1;
}

function mount(): boolean {
    const hider = document.getElementById('specKRHid');
    if (!hider) return false;

    suspectVal = document.createElement('span');
    ownVal = document.createElement('span');
    regionVal = document.createElement('span');
    suspectVal.textContent = 'Loading...';
    ownVal.textContent = 'Loading...';
    const region = gameRegion();
    regionVal.textContent = region ? `(${region})` : '';

    const row = document.createElement('p');
    row.id = PING_ID;
    row.style.cssText = 'font-size:14px;margin:4px 14px;color:#fff';
    row.append('Suspect Ping: ', suspectVal, ' / Your ping: ', ownVal, ' ', regionVal);
    hider.insertAdjacentElement('afterbegin', row);
    return true;
}

function unmount(): void {
    document.getElementById(PING_ID)?.remove();
    suspectVal = ownVal = regionVal = null;
    resolved = false;
}

function update(): void {
    const name = suspectName();
    fillTitleName(name);
    const ms = suspectPing(name);
    resolved = ms >= 0;
    if (suspectVal) {
        suspectVal.textContent = ms >= 0 ? `${ms}ms` : 'Loading...';
        suspectVal.style.color = ms >= 0 ? pingColor(ms) : '';
    }
    updateOwnPing();
    if (regionVal) {
        const region = gameRegion();
        regionVal.textContent = region ? `(${region})` : '';
    }
}

export function initSuspectPing(): void {
    if (watch) return;
    watch = setInterval(() => {
        if (!onKPDCall()) {
            if (suspectVal) unmount();
            return;
        }
        // Krunker rebuilds #specKRHid between calls and ranked rounds, taking our row with it.
        if (!document.getElementById(PING_ID)) {
            if (!mount()) return;
            tick = 0;
        }
        if (!resolved || tick++ % 3 === 0) update();
    }, 1000);
}

export function destroySuspectPing(): void {
    if (watch) { clearInterval(watch); watch = null; }
    unmount();
}
