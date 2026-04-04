// ── Competitive features: Hardpoint enemy counter + Rank progress tracker + Ranked queue ──
import { ipcRenderer } from 'electron';

let hpObserver: MutationObserver | null = null;
let hpCounterEl: HTMLElement | null = null;
let hpPointCounter: HTMLElement | null = null;
let hpEnemyOBJ = 0;
let hpTimeout: ReturnType<typeof setTimeout> | null = null;
let hpCheckInterval: ReturnType<typeof setInterval> | null = null;

// ── Hardpoint Enemy Counter ──

function processTeamScores(): void {
    const teams = document.querySelectorAll('#tScoreC1, #tScoreC2');
    for (const team of teams) {
        if (team.className.includes('you')) continue;
        const scoreEl = team.nextElementSibling;
        if (!scoreEl) continue;

        const currentScore = parseInt(scoreEl.textContent || '0', 10);
        if (currentScore > hpEnemyOBJ && hpPointCounter) {
            hpPointCounter.textContent = String((currentScore - hpEnemyOBJ) / 10);

            if (hpTimeout) clearTimeout(hpTimeout);
            hpTimeout = setTimeout(() => {
                if (hpPointCounter) hpPointCounter.textContent = '0';
                hpTimeout = null;
            }, 1600);
        }
        hpEnemyOBJ = currentScore;
    }
}

function setupHPDisplay(): void {
    const counters = document.querySelector('.topRightCounters');
    if (!counters || hpCounterEl) return;

    hpCounterEl = document.createElement('div');
    hpCounterEl.className = 'statIcon kpc-hp-counter';
    hpCounterEl.innerHTML =
        '<div class="greyInner" style="display:flex">' +
        '<span style="color:white;font-size:15px;margin-right:4px;">on</span>' +
        '<span class="pointVal">0</span></div>';
    hpPointCounter = hpCounterEl.querySelector('.pointVal');
    counters.appendChild(hpCounterEl);

    const teamScores = document.getElementById('teamScores');
    if (teamScores) {
        hpObserver = new MutationObserver(processTeamScores);
        hpObserver.observe(teamScores, { childList: true, subtree: true });
    }
}

function startHPCounter(): void {
    hpCheckInterval = setInterval(() => {
        if (document.querySelector('.cmpTmHed')) {
            if (hpCheckInterval) { clearInterval(hpCheckInterval); hpCheckInterval = null; }
            setupHPDisplay();
        }
    }, 2000);
}

function stopHPCounter(): void {
    if (hpCheckInterval) { clearInterval(hpCheckInterval); hpCheckInterval = null; }
    if (hpObserver) { hpObserver.disconnect(); hpObserver = null; }
    if (hpCounterEl) { hpCounterEl.remove(); hpCounterEl = null; }
    if (hpTimeout) { clearTimeout(hpTimeout); hpTimeout = null; }
    hpPointCounter = null;
    hpEnemyOBJ = 0;
}

export function initHPCounter(): void { startHPCounter(); }
export function destroyHPCounter(): void { stopHPCounter(); }

export function setHPCounterEnabled(enabled: boolean): void {
    stopHPCounter();
    if (enabled) startHPCounter();
}

// ── Rank Progress Tracker ──

interface RankInfo {
    rank: string;
    elo: number | null;
    color: string;
    image: string;
}

const RANKS: RankInfo[] = [
    { rank: 'Unranked',  elo: null, color: '#FFFFFF', image: 'rank_unranked.svg' },
    { rank: 'Bronze 1',  elo: 0,    color: '#CD7F32', image: 'rank_bronze.svg' },
    { rank: 'Bronze 2',  elo: 200,  color: '#CD7F32', image: 'rank_bronze.svg' },
    { rank: 'Bronze 3',  elo: 400,  color: '#CD7F32', image: 'rank_bronze.svg' },
    { rank: 'Silver 1',  elo: 700,  color: '#C0C0C0', image: 'rank_silver.svg' },
    { rank: 'Silver 2',  elo: 900,  color: '#C0C0C0', image: 'rank_silver.svg' },
    { rank: 'Silver 3',  elo: 1100, color: '#C0C0C0', image: 'rank_silver.svg' },
    { rank: 'Gold 1',    elo: 1300, color: '#FFD700', image: 'rank_gold.svg' },
    { rank: 'Gold 2',    elo: 1600, color: '#FFD700', image: 'rank_gold.svg' },
    { rank: 'Gold 3',    elo: 2000, color: '#FFD700', image: 'rank_gold.svg' },
    { rank: 'Platinum',  elo: 2300, color: '#4B69FF', image: 'rank_platinum.svg' },
    { rank: 'Diamond',   elo: 3000, color: '#4B69FF', image: 'rank_diamond.svg' },
    { rank: 'Master',    elo: 3300, color: '#EE7032', image: 'rank_master.svg' },
    { rank: 'Kracked',   elo: 4700, color: '#FF0000', image: 'rank_kracked.svg' },
];

const RANK_IMG_BASE = 'https://assets.krunker.io/img/ranked/ranks/';

function getRankData(currentElo: number): { current: RankInfo; next: RankInfo; progress: number; isMax: boolean } {
    let idx = 0;
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (RANKS[i].elo !== null && currentElo >= RANKS[i].elo!) { idx = i; break; }
    }
    const current = RANKS[idx];
    const next = RANKS[idx + 1] || current;
    const isMax = idx === RANKS.length - 1;
    let progress = 0;
    if (!isMax && current.elo !== null && next.elo !== null) {
        progress = Math.min(100, Math.max(0, ((currentElo - current.elo!) / (next.elo! - current.elo!)) * 100));
    } else if (isMax) {
        progress = 100;
    }
    return { current, next, progress, isMax };
}

function openRankPopup(): void {
    if (document.getElementById('kpc-rank-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'kpc-rank-overlay';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });

    let grid = '';
    for (const r of RANKS) {
        grid += `<div class="kpc-rank-grid-item">
            <img src="${RANK_IMG_BASE}${r.image}" loading="lazy">
            <div><div class="kpc-rank-name" style="color:${r.color}">${r.rank}</div>
            <div class="kpc-rank-elo">${r.elo !== null ? r.elo + '+' : 'Placement'}</div></div></div>`;
    }

    overlay.innerHTML = `<div class="kpc-rank-popup">
        <div class="kpc-rank-popup-header"><h2>Rank Distribution</h2>
        <div class="kpc-rank-popup-close" id="kpc-rank-close">\u2715</div></div>
        <div class="kpc-rank-grid">${grid}</div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('kpc-rank-close')?.addEventListener('click', () => overlay.remove());
}

function injectRankBar(container: Element): void {
    if (container.querySelector('#kpc-elo-tracker')) return;
    const statValues = container.querySelectorAll('.quick-stat-value');
    if (!statValues.length) return;
    const currentElo = Number(statValues[0].textContent);
    if (isNaN(currentElo)) return;

    const data = getRankData(currentElo);
    const wrapper = document.createElement('div');
    wrapper.id = 'kpc-elo-tracker';

    const nextHtml = data.isMax ? '' :
        `<div class="kpc-rank-container"><img src="${RANK_IMG_BASE}${data.next.image}" class="kpc-elo-rank-img"><span>${data.next.rank}</span></div>`;
    const barText = data.isMax ? `${currentElo}` : `${currentElo} / ${data.next.elo}`;

    wrapper.innerHTML = `<div class="kpc-elo-info-row">
        <div class="kpc-rank-container"><img src="${RANK_IMG_BASE}${data.current.image}" class="kpc-elo-rank-img"><span>${data.current.rank}</span></div>
        <div class="kpc-elo-bar-bg"><div class="kpc-elo-bar-fill" style="width:${data.progress}%"></div>
        <div class="kpc-elo-bar-text">${barText}</div></div>${nextHtml}</div>`;

    const statsBlock = container.querySelector('.quick-stats');
    if (statsBlock) container.insertBefore(wrapper, statsBlock);
    else container.appendChild(wrapper);
}

function injectRankButton(card: Element): void {
    if (card.querySelector('#kpc-rank-list-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'kpc-rank-list-btn';
    btn.innerHTML = '<span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;">list</span> Ranks';
    btn.addEventListener('click', openRankPopup);
    if (getComputedStyle(card as HTMLElement).position === 'static') (card as HTMLElement).style.position = 'relative';
    card.appendChild(btn);
}

function checkRankedMenu(): void {
    const card = document.querySelector('.rank-card');
    const container = document.querySelector('.rank-and-stats');
    if (card && container) {
        injectRankBar(container);
        injectRankButton(card);
    }
}

// ── Ranked Queue Button ──

function injectQueueButton(): void {
    const footer = document.querySelector('.footer-controls');
    if (!footer || footer.querySelector('#kpc-ranked-queue-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'kpc-ranked-queue-btn';
    btn.className = 'kpc-ranked-queue-btn';
    btn.innerHTML = '<span class="material-icons" style="font-size:20px;vertical-align:middle;">open_in_new</span>';
    btn.title = 'Open External Queue';
    btn.addEventListener('click', () => {
        let token = localStorage.getItem('__FRVR_auth_access_token') || '';
        token = token.replace(/"/g, '').replace(/\//g, '');
        const regionEl = document.querySelector('.region-indicator');
        let region = 'na';
        if (regionEl) {
            const text = regionEl.textContent || '';
            const parts = text.split(': ');
            const regionName = parts[1] || parts[0];
            if (regionName.includes('Europe')) region = 'eu';
            else if (regionName.includes('Asia')) region = 'as';
        }
        const allRegions = localStorage.getItem('s_rankedAllRegions') === 'true';
        ipcRenderer.send('open-ranked-queue', token, region, allRegions);
    });

    const lastChild = footer.lastElementChild;
    if (lastChild) footer.insertBefore(btn, lastChild);
    else footer.appendChild(btn);
}

export function initRankProgress(): void {
    // Poll for window.openRankedMenu — Krunker defines it async after DOM load
    let attempts = 0;
    const poll = setInterval(() => {
        const origRanked = (window as any).openRankedMenu;
        if (origRanked && !origRanked.__kpcRankPatched) {
            clearInterval(poll);

            let rankObserver: MutationObserver | null = null;
            let cleanupInterval: ReturnType<typeof setInterval> | null = null;

            const patched = function (this: any, ...args: any[]) {
                origRanked.apply(this, args);

                const modal = document.querySelector('.rankedMenuModal');
                if (!modal) return;

                rankObserver = new MutationObserver(checkRankedMenu);
                rankObserver.observe(modal, { childList: true, subtree: true });
                checkRankedMenu();
                injectQueueButton();

                cleanupInterval = setInterval(() => {
                    if (!document.querySelector('.rankedMenuModal')) {
                        if (rankObserver) { rankObserver.disconnect(); rankObserver = null; }
                        if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
                    }
                }, 5000);
            };
            (patched as any).__kpcRankPatched = true;
            (window as any).openRankedMenu = patched;
        } else if (++attempts > 75) { // 15s timeout
            clearInterval(poll);
        }
    }, 200);
}
