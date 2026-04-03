// ── Hardpoint Enemy Counter ──
// Displays enemy capture points being scored in Hardpoint mode.

let hpObserver: MutationObserver | null = null;
let hpCounterEl: HTMLElement | null = null;
let hpPointCounter: HTMLElement | null = null;
let hpEnemyOBJ = 0;
let hpTimeout: ReturnType<typeof setTimeout> | null = null;
let hpCheckInterval: ReturnType<typeof setInterval> | null = null;

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

export function initHPCounter(): void {
    hpCheckInterval = setInterval(() => {
        if (document.querySelector('.cmpTmHed')) {
            if (hpCheckInterval) { clearInterval(hpCheckInterval); hpCheckInterval = null; }
            setupHPDisplay();
        }
    }, 2000);
}

export function destroyHPCounter(): void {
    if (hpCheckInterval) { clearInterval(hpCheckInterval); hpCheckInterval = null; }
    if (hpObserver) { hpObserver.disconnect(); hpObserver = null; }
    if (hpCounterEl) { hpCounterEl.remove(); hpCounterEl = null; }
    if (hpTimeout) { clearTimeout(hpTimeout); hpTimeout = null; }
    hpPointCounter = null;
    hpEnemyOBJ = 0;
}
