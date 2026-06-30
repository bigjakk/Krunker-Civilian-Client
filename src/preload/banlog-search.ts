// ── Ban Log Search: add a search field to Krunker's native KPD popup ──
// Krunker's in-game KPD/police popup (#policePopC) has tabbed views — Active Calls,
// Ban Logs, etc. — sharing one table (#kpdCalls). This injects a search box above the
// table on the Ban Logs tab only and hides rows whose text doesn't match. Pure DOM
// filtering — no account, network, or API involved. The box is a sibling of the table
// (so it survives Krunker re-rendering rows on tab switch), which means we must remove
// it again whenever a different tab is active.
import { savedConsole as _console } from './saved-console';

const SEARCH_ID = 'kccBanlogSearch';
const HIDE_CLASS = 'kcc-banlog-hide';

let currentQuery = '';

// The active tab carries the `tabANew` class; the Ban Logs tab's label contains "ban"
// ("Active calls", "Stats", etc. do not), so that cleanly singles it out.
function isBanLogsTabActive(): boolean {
    for (const tab of document.querySelectorAll('#policePopC .menuTabNew')) {
        if (tab.className.includes('tabANew')) {
            return (tab.textContent || '').toLowerCase().includes('ban');
        }
    }
    return false;
}

function applyFilter(): void {
    const table = document.getElementById('kpdCalls');
    if (!table) return;
    const q = currentQuery.trim().toLowerCase();
    for (const row of table.querySelectorAll('tr')) {
        if (row.querySelector('th')) continue; // keep header row(s) visible
        const text = (row.textContent || '').toLowerCase();
        row.classList.toggle(HIDE_CLASS, q !== '' && !text.includes(q));
    }
}

function injectSearch(table: HTMLElement): void {
    const input = document.createElement('input');
    input.id = SEARCH_ID;
    input.type = 'text';
    input.placeholder = 'Search ban log…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => {
        currentQuery = input.value;
        applyFilter();
    });
    // Sit the box directly above the table, wherever it lives inside the popup.
    table.parentElement?.insertBefore(input, table);
    _console.log('[KCC] Ban log search injected');
}

function removeSearch(): void {
    document.getElementById(SEARCH_ID)?.remove();
    currentQuery = '';
}

function tick(): void {
    const popup = document.getElementById('policePopC');
    const table = document.getElementById('kpdCalls');
    // Only the Ban Logs tab gets the box — tear it down on every other tab / when closed.
    if (!popup || popup.childNodes.length === 0 || !table || !isBanLogsTabActive()) {
        removeSearch();
        return;
    }
    if (!document.getElementById(SEARCH_ID)) {
        injectSearch(table);
    } else if (currentQuery) {
        // Re-apply after a reload re-renders the rows.
        applyFilter();
    }
}

export function initBanlogSearch(): void {
    // Polling (not MutationObserver) per the main-frame WebGL constraint.
    setInterval(tick, 500);
}
