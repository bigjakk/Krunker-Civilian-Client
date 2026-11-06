// ── Client Stats ── the sidebar item and window for time on the client, and telling main who's signed in and when a save is safe

import { ipcRenderer } from 'electron';
import type { ClientStatsRow, ClientStatsSnapshot } from '../main/client-stats';
import { sidebarItem } from './menu-tweaks';
import { escapeHtml } from './utils';

const ACCOUNT_POLL_MS = 5000;
const REFRESH_MS = 30000;
const MIN_GUEST_ROW_MS = 60000;
const BODY_ID = 'kccClientStats';
const STYLE_ID = 'kcc-client-stats-css';

const CSS = `
.kcc-cs-title { margin: 2px 0 18px 14px; font-size: 28px; }
.kcc-cs-table { width: 100%; border-collapse: separate; border-spacing: 0; color: #fff; font-size: 20px; }
.kcc-cs-table th { padding: 0 14px 8px 18px; color: rgba(255, 255, 255, 0.55); font-size: 15px; font-weight: normal; text-align: right; white-space: nowrap; }
.kcc-cs-table td { padding: 10px 14px 10px 18px; text-align: right; white-space: nowrap; }
.kcc-cs-table td.kcc-cs-name { width: 100%; max-width: 0; padding-left: 14px; overflow: hidden; text-align: left; text-overflow: ellipsis; }
.kcc-cs-total ~ tr ~ tr td { border-top: 1px solid rgba(255, 255, 255, 0.08); }
.kcc-cs-total td { background: rgba(255, 193, 7, 0.12); color: #ffc107; }
.kcc-cs-total td:first-child { border-radius: 6px 0 0 6px; }
.kcc-cs-total td:last-child { border-radius: 0 6px 6px 0; }
.kcc-cs-guest td { color: rgba(255, 255, 255, 0.55); }
.kcc-cs-current td.kcc-cs-name { color: #9eeb56; }
.kcc-cs-note { margin: 14px 0 2px 14px; color: rgba(255, 255, 255, 0.45) !important; font-size: 15px; }
`;

let statsWindow: object | null = null;
let snapshot: ClientStatsSnapshot | null = null;
let refreshTimer: number | null = null;
let reported: string | null = null;

function fmtTime(ms: number): string {
  if (!ms) return '-';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours >= 100) return hours.toLocaleString('en-US') + 'h';
  const rest = mins % 60;
  return hours ? hours + 'h ' + String(rest).padStart(2, '0') + 'm' : rest + 'm';
}

function rowHtml(label: string, row: ClientStatsRow, cls: string): string {
  const cells = [row.totalMs, row.sessionMs, row.weekMs, row.longestSessionMs].map((ms) => '<td>' + fmtTime(ms) + '</td>');
  const name = escapeHtml(label);
  return '<tr class="' + cls + '"><td class="kcc-cs-name" title="' + name + '">' + name + '</td>' + cells.join('') + '</tr>';
}

function bodyHtml(s: ClientStatsSnapshot): string {
  const rows = [rowHtml('Client Total', s.client, 'kcc-cs-total')];
  for (const a of [...s.accounts].sort((x, y) => y.totalMs - x.totalMs)) {
    rows.push(rowHtml(a.name, a, a.name === s.currentAccount ? 'kcc-cs-current' : ''));
  }
  // Account switches pass through signed-out for a few seconds; that alone isn't worth a row
  if (!s.currentAccount || s.guest.totalMs >= MIN_GUEST_ROW_MS) {
    rows.push(rowHtml('Not Signed In', s.guest, s.currentAccount ? 'kcc-cs-guest' : 'kcc-cs-guest kcc-cs-current'));
  }
  const since = new Date(s.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return '<table class="kcc-cs-table"><tr><th></th><th>Total</th><th>This Session</th><th>Past Week</th><th title="Longest single session">Longest</th></tr>' +
    rows.join('') + '</table>' +
    '<div class="kcc-cs-note">Includes idle time. Counted on this PC since ' + since + '.</div>';
}

function stopRefresh(): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function refresh(): void {
  const display = document.getElementById('windowHolder')?.style.display;
  if (!document.getElementById(BODY_ID) || !display || display === 'none') {
    stopRefresh();
    return;
  }
  ipcRenderer.invoke('client-stats-get').then((s: ClientStatsSnapshot) => {
    const body = document.getElementById(BODY_ID);
    if (body) body.innerHTML = bodyHtml(s);
  });
}

export async function openStatsWindow(): Promise<void> {
  snapshot = await ipcRenderer.invoke('client-stats-get');
  const w = window as any;
  if (!statsWindow) {
    // No `label`: showWindow reports it to Krunker's analytics, and an unlabelled window reports as "home"
    const win = {
      header: 'Client Stats',
      html: '',
      width: 840,
      gen: () => '<div class="kcc-cs-title">Client Stats</div><div id="' + BODY_ID + '">' + bodyHtml(snapshot!) + '</div>',
    };
    w.windows.push(win);
    statsWindow = win;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  w.showWindow(w.windows.indexOf(statsWindow) + 1);
  if (refreshTimer === null) refreshTimer = window.setInterval(refresh, REFRESH_MS);
}

export const setClientStatsItem = sidebarItem({
  id: 'kccClientStatsBtn',
  icon: 'schedule',
  title: 'Client Stats',
  anchors: ['menuBtnSideCommunity', 'menuBtnSocial'],
  onClick: () => { void openStatsWindow(); },
});

function reportAccount(): void {
  let name = '';
  try { name = window.localStorage.getItem('krunker_username') || ''; } catch { /* storage unavailable */ }
  if (name === reported) return;
  reported = name;
  ipcRenderer.send('client-stats-account', name);
}

function reportMouse(): void {
  ipcRenderer.send('client-stats-mouse-free', !document.pointerLockElement);
}

export function initClientStats(showItem: boolean): void {
  reportAccount();
  setInterval(reportAccount, ACCOUNT_POLL_MS);
  reportMouse();
  document.addEventListener('pointerlockchange', reportMouse);
  setClientStatsItem(showItem);
}
