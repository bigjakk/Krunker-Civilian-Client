// ── Ban Log enhancements for Krunker's native KPD popup ──
// Krunker's in-game KPD/police popup (#policePopC) has tabbed views — Active Calls,
// Ban Logs, etc. — sharing one table (#kpdCalls). On the Ban Logs tab this adds:
//   • a search box above the table that hides rows whose text doesn't match, and
//   • relative timestamps ("5 minutes ago") on the time column, kept fresh over time.
// Pure DOM work — no account, network, or API involved. Everything is gated to the
// Ban Logs tab and torn down elsewhere. A MutationObserver on the popup (a bounded,
// targeted subtree — NOT the main frame the WebGL constraint warns about) makes
// conversion instant when the ban log renders; a slow poll backs it up and keeps the
// "x ago" text fresh.

const SEARCH_ID = 'kccBanlogSearch';
const HIDE_CLASS = 'kcc-banlog-hide';
const TIME_ATTR = 'data-kcc-bantime';

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

// ── Search ──

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
}

function removeSearch(): void {
    document.getElementById(SEARCH_ID)?.remove();
    currentQuery = '';
}

// ── Relative timestamps ──
// Krunker prints the ban time as a UTC wall-clock string. Comparing "now shifted into
// UTC" against that string (parsed as local) yields the correct elapsed time regardless
// of the viewer's timezone.

function pluralize(n: number, unit: string): string {
    return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function minsToRelative(minutes: number): string {
    let m = Math.floor(minutes);
    if (isNaN(m) || m < 0) m = 0; // future stamp / clock skew → clamp to now
    if (m < 1) return 'just now';
    const days = Math.floor(m / 1440);
    const hours = Math.floor((m % 1440) / 60);
    const mins = m % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(pluralize(days, 'day'));
    if (hours > 0) parts.push(pluralize(hours, 'hour'));
    if (mins > 0) parts.push(pluralize(mins, 'minute'));
    return parts.join(' ') + ' ago';
}

// A plausible ban timestamp has a time component (":") and a sane year, so we never
// mistake a name/reason cell that happens to look date-ish for the time column.
function looksLikeBanTime(text: string, curYear: number): boolean {
    if (!text.includes(':')) return false;
    const d = new Date(text.replace(' ago', '').trim());
    if (isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    return y >= 2015 && y <= curYear + 1;
}

function convertTimes(table: HTMLElement): void {
    const now = new Date();
    const nowUTCms = now.getTime() + now.getTimezoneOffset() * 60000;
    const curYear = now.getFullYear();
    for (const row of table.querySelectorAll('tr')) {
        // Reuse the captured original on already-converted rows so the "ago" stays fresh;
        // otherwise locate the time cell by content (column index is not relied upon).
        let span = row.querySelector<HTMLElement>(`span[${TIME_ATTR}]`);
        if (!span) {
            for (const s of row.querySelectorAll<HTMLElement>('td > span')) {
                if (looksLikeBanTime(s.textContent || '', curYear)) {
                    span = s;
                    span.setAttribute(TIME_ATTR, (s.textContent || '').trim());
                    break;
                }
            }
        }
        if (!span) continue;
        const stamp = (span.getAttribute(TIME_ATTR) || '').replace(' ago', '').trim();
        const logMs = new Date(stamp).getTime();
        if (isNaN(logMs)) continue;
        const rel = minsToRelative((nowUTCms - logMs) / 60000);
        if (span.textContent !== rel) {
            span.textContent = rel;
            span.title = stamp; // keep the exact stamp on hover
        }
    }
}

// ── Apply ──

function enhance(): void {
    const popup = document.getElementById('policePopC');
    const table = document.getElementById('kpdCalls');
    // Only the Ban Logs tab gets our additions — tear the box down on every other tab.
    if (!popup || popup.childNodes.length === 0 || !table || !isBanLogsTabActive()) {
        removeSearch();
        return;
    }
    if (!document.getElementById(SEARCH_ID)) {
        injectSearch(table);
    } else if (currentQuery) {
        applyFilter(); // re-apply after a reload re-renders the rows
    }
    convertTimes(table);
}

// ── Trigger ──
// Observe the popup so we react the instant Krunker renders the ban log, instead of
// waiting for the next poll. We disconnect around our own edits so they don't loop.

let observer: MutationObserver | null = null;
let observed: HTMLElement | null = null;

function runEnhance(): void {
    observer?.disconnect();
    enhance();
    if (observer && observed?.isConnected) {
        observer.observe(observed, { childList: true, subtree: true });
    }
}

function ensureObserver(): void {
    const popup = document.getElementById('policePopC');
    if (!popup) {
        observer?.disconnect();
        observer = null;
        observed = null;
        return;
    }
    if (observer && observed === popup) return; // already watching this popup
    observer?.disconnect();
    observed = popup;
    observer = new MutationObserver(runEnhance);
    observer.observe(popup, { childList: true, subtree: true });
}

export function initBanlog(): void {
    // The observer gives instant conversion; the poll (re)attaches it as the popup
    // opens/closes and keeps the "x ago" text fresh over time.
    setInterval(() => {
        ensureObserver();
        runEnhance();
    }, 500);
}
