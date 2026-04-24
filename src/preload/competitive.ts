// ── Competitive features: Hardpoint enemy counter + Rank progress tracker + Ranked queue ──
import { ipcRenderer } from 'electron';

// ── Hardpoint Enemy Counter ──

let hpObserver: MutationObserver | null = null;
let hpCounterEl: HTMLElement | null = null;
let hpPointCounter: HTMLElement | null = null;
const hpEnemyScores = new Map<string, number>();
let hpInitialized = false;
let hpTimeout: ReturnType<typeof setTimeout> | null = null;
let hpCheckInterval: ReturnType<typeof setInterval> | null = null;

// Hardpoint scores 10 pts/sec per enemy on point. Max realistic team size ~8.
// Anything bigger is a capture bonus, score reset, or stale baseline — ignore.
const HP_MAX_SANE_DELTA = 80;

function isHardpoint(): boolean {
    try {
        const activity = (window as any).getGameActivity?.();
        if (activity?.mode === 'Hardpoint') return true;
    } catch { /* ignore */ }
    return !!document.querySelector('.cmpTmHed');
}

function resetHPBaseline(): void {
    hpEnemyScores.clear();
    hpInitialized = false;
    if (hpPointCounter) hpPointCounter.textContent = '0';
    if (hpTimeout) { clearTimeout(hpTimeout); hpTimeout = null; }
}

function processTeamScores(): void {
    const teams = document.querySelectorAll('#tScoreC1, #tScoreC2');
    let maxDelta = 0;
    for (const team of teams) {
        if (team.className.includes('you')) continue;
        const scoreEl = team.nextElementSibling;
        if (!scoreEl) continue;
        const currentScore = parseInt(scoreEl.textContent || '0', 10);
        if (isNaN(currentScore)) continue;

        const teamId = team.id;
        const prevScore = hpEnemyScores.get(teamId);
        hpEnemyScores.set(teamId, currentScore);

        // No baseline yet, or score reset (new round) — just record, don't display.
        if (prevScore === undefined || currentScore < prevScore) continue;

        const delta = currentScore - prevScore;
        if (delta > maxDelta) maxDelta = delta;
    }

    // Skip first observation pass — we now have a baseline for next tick.
    if (!hpInitialized) {
        hpInitialized = true;
        return;
    }

    if (maxDelta > 0 && maxDelta <= HP_MAX_SANE_DELTA && hpPointCounter) {
        hpPointCounter.textContent = String(maxDelta / 10);
        if (hpTimeout) clearTimeout(hpTimeout);
        hpTimeout = setTimeout(() => {
            if (hpPointCounter) hpPointCounter.textContent = '0';
            hpTimeout = null;
        }, 1600);
    }
}

function setupHPDisplay(): void {
    const counters = document.querySelector('.topRightCounters');
    if (!counters || hpCounterEl) return;

    hpCounterEl = document.createElement('div');
    hpCounterEl.className = 'statIcon kcc-hp-counter';
    hpCounterEl.innerHTML =
        '<div class="greyInner" style="display:flex;align-items:center;border:2px solid #ffc107;box-shadow:0 0 6px rgba(255,193,7,0.5);">' +
        '<span style="color:#ffffff;font-size:15px;margin-right:6px;font-weight:600;text-shadow:1px 1px 2px rgba(0,0,0,0.9);">on</span>' +
        '<span class="pointVal" style="color:#ffc107;font-size:22px;font-weight:bold;text-shadow:1px 1px 3px rgba(0,0,0,0.9);">0</span></div>';
    hpPointCounter = hpCounterEl.querySelector('.pointVal');
    counters.appendChild(hpCounterEl);

    const teamScores = document.getElementById('teamScores');
    if (teamScores) {
        hpObserver = new MutationObserver(processTeamScores);
        hpObserver.observe(teamScores, { childList: true, subtree: true });
    }
}

function checkHPMode(): void {
    if (isHardpoint()) {
        const wasHidden = !hpCounterEl || hpCounterEl.style.display === 'none';
        setupHPDisplay();
        if (hpCounterEl) hpCounterEl.style.display = '';
        if (wasHidden) resetHPBaseline();
    } else if (hpCounterEl) {
        hpCounterEl.style.display = 'none';
        resetHPBaseline();
    }
}

function startHPCounter(): void {
    if (hpCheckInterval) return;
    hpCheckInterval = setInterval(checkHPMode, 2000);
    checkHPMode();
}

function stopHPCounter(): void {
    if (hpCheckInterval) { clearInterval(hpCheckInterval); hpCheckInterval = null; }
    if (hpObserver) { hpObserver.disconnect(); hpObserver = null; }
    if (hpCounterEl) { hpCounterEl.remove(); hpCounterEl = null; }
    if (hpTimeout) { clearTimeout(hpTimeout); hpTimeout = null; }
    hpPointCounter = null;
    hpEnemyScores.clear();
    hpInitialized = false;
}

export function initHPCounter(): void { startHPCounter(); }
export function destroyHPCounter(): void { stopHPCounter(); }

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
    if (document.getElementById('kcc-rank-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'kcc-rank-overlay';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });

    let grid = '';
    for (const r of RANKS) {
        grid += `<div class="kcc-rank-grid-item">
            <img src="${RANK_IMG_BASE}${r.image}" loading="lazy">
            <div><div class="kcc-rank-name" style="color:${r.color}">${r.rank}</div>
            <div class="kcc-rank-elo">${r.elo !== null ? r.elo + '+' : 'Placement'}</div></div></div>`;
    }

    overlay.innerHTML = `<div class="kcc-rank-popup">
        <div class="kcc-rank-popup-header"><h2>Rank Distribution</h2>
        <div class="kcc-rank-popup-close" id="kcc-rank-close">\u2715</div></div>
        <div class="kcc-rank-grid">${grid}</div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('kcc-rank-close')?.addEventListener('click', () => overlay.remove());
}

function injectRankBar(container: Element): void {
    if (container.querySelector('#kcc-elo-tracker')) return;
    const statValues = container.querySelectorAll('.quick-stat-value');
    if (!statValues.length) return;
    const currentElo = Number(statValues[0].textContent);
    if (isNaN(currentElo)) return;

    const data = getRankData(currentElo);
    const wrapper = document.createElement('div');
    wrapper.id = 'kcc-elo-tracker';

    const nextHtml = data.isMax ? '' :
        `<div class="kcc-rank-container"><img src="${RANK_IMG_BASE}${data.next.image}" class="kcc-elo-rank-img"><span>${data.next.rank}</span></div>`;
    const barText = data.isMax ? `${currentElo}` : `${currentElo} / ${data.next.elo}`;

    wrapper.innerHTML = `<div class="kcc-elo-info-row">
        <div class="kcc-rank-container"><img src="${RANK_IMG_BASE}${data.current.image}" class="kcc-elo-rank-img"><span>${data.current.rank}</span></div>
        <div class="kcc-elo-bar-bg"><div class="kcc-elo-bar-fill" style="width:${data.progress}%"></div>
        <div class="kcc-elo-bar-text">${barText}</div></div>${nextHtml}</div>`;

    const statsBlock = container.querySelector('.quick-stats');
    if (statsBlock) container.insertBefore(wrapper, statsBlock);
    else container.appendChild(wrapper);
}

function injectRankButton(card: Element): void {
    if (card.querySelector('#kcc-rank-list-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'kcc-rank-list-btn';
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
    if (!footer || footer.querySelector('#kcc-ranked-queue-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'kcc-ranked-queue-btn';
    btn.className = 'kcc-ranked-queue-btn';
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
        if (origRanked && !origRanked.__kccRankPatched) {
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
            (patched as any).__kccRankPatched = true;
            (window as any).openRankedMenu = patched;
        } else if (++attempts > 75) { // 15s timeout
            clearInterval(poll);
        }
    }, 200);
}
