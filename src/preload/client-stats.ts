// ── Client Stats ── the sidebar item and window for time on the client, and telling main who's signed in and when a save is safe

import { ipcRenderer } from 'electron';
import type { ClientStatsImport, ClientStatsRow, ClientStatsSnapshot } from '../main/client-stats';
import { dateStamp } from '../shared/date-stamp';
import { showConfirm } from './confirm-dialog';
import { sidebarItem } from './menu-tweaks';
import { escapeHtml } from './utils';

const ACCOUNT_POLL_MS = 5000;
const REFRESH_MS = 30000;
const MIN_GUEST_ROW_MS = 60000;
const BODY_ID = 'kccClientStats';
const STYLE_ID = 'kcc-client-stats-css';
const SHADES = [0.1, 0.22, 0.38, 0.58];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CALENDAR_WEEKS = 6;

const CSS = `
#${BODY_ID} { display: flex; flex-direction: column; min-height: 460px; }
.kcc-cs-top { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 10px 14px; }
.kcc-cs-title { font-size: 28px; }
.kcc-cs-tabs { display: flex; gap: 4px; }
.kcc-cs-tab { padding: 5px 12px; border-radius: 6px; color: rgba(255, 255, 255, 0.55); font-size: 16px; cursor: pointer; }
.kcc-cs-tab:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.kcc-cs-tab.kcc-cs-on { background: rgba(255, 193, 7, 0.12); color: #ffc107; }
.kcc-cs-nav { position: relative; display: flex; align-items: center; height: 44px; margin: 0 0 12px 14px; color: #fff; font-size: 19px; }
.kcc-cs-since { color: rgba(255, 255, 255, 0.55); font-size: 16px; }
.kcc-cs-date { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 6px; background: #2a2a2a; cursor: pointer; }
.kcc-cs-date:hover { border-color: rgba(255, 255, 255, 0.35); }
.kcc-cs-date .material-icons { color: rgba(255, 255, 255, 0.65); font-size: 20px; }
.kcc-cs-tag { margin-left: 10px; color: rgba(255, 255, 255, 0.45); font-size: 15px; }
.kcc-cs-tag.kcc-cs-link { color: #ffc107; cursor: pointer; }
.kcc-cs-tag.kcc-cs-link:hover { text-decoration: underline; }
.kcc-cs-pop { position: absolute; top: 46px; left: 0; z-index: 30; width: 372px; padding: 10px 12px 12px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; background: #252525; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55); font-size: 16px; }
.kcc-cs-pop-head { display: flex; align-items: center; justify-content: space-between; min-height: 30px; margin-bottom: 8px; font-size: 18px; }
.kcc-cs-arrow { padding: 2px; border-radius: 6px; color: rgba(255, 255, 255, 0.75); font-size: 26px; cursor: pointer; }
.kcc-cs-arrow:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.kcc-cs-arrow.kcc-cs-off { opacity: 0.22; pointer-events: none; }
.kcc-cs-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; padding: 2px; border: 2px solid transparent; border-radius: 7px; }
.kcc-cs-week[data-pick] { cursor: pointer; }
.kcc-cs-week[data-pick]:hover, .kcc-cs-tile[data-pick]:hover { border-color: rgba(255, 255, 255, 0.3); }
.kcc-cs-week.kcc-cs-on, .kcc-cs-week.kcc-cs-on:hover, .kcc-cs-tile.kcc-cs-on, .kcc-cs-tile.kcc-cs-on:hover { border-color: #ffc107; }
.kcc-cs-dow { color: rgba(255, 255, 255, 0.45); font-size: 13px; text-align: center; }
.kcc-cs-day { height: 32px; border-radius: 4px; font-size: 15px; line-height: 32px; text-align: center; }
.kcc-cs-day.kcc-cs-other { opacity: 0.35; }
.kcc-cs-day.kcc-cs-future, .kcc-cs-tile.kcc-cs-future { opacity: 0.2; }
.kcc-cs-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.kcc-cs-tile { display: flex; flex-direction: column; align-items: center; padding: 7px 4px; border: 2px solid transparent; border-radius: 7px; background-color: rgba(255, 255, 255, 0.04); }
.kcc-cs-tile[data-pick] { cursor: pointer; }
.kcc-cs-tile small { color: rgba(255, 255, 255, 0.65); font-size: 13px; }
.kcc-cs-table { width: 100%; border-collapse: separate; border-spacing: 0; color: #fff; font-size: 20px; }
.kcc-cs-table th { padding: 0 14px 8px 18px; border: 0; color: rgba(255, 255, 255, 0.55); font-size: 15px; font-weight: normal; text-align: right; white-space: nowrap; }
.kcc-cs-table td { padding: 10px 14px 10px 18px; text-align: right; white-space: nowrap; }
.kcc-cs-table td.kcc-cs-name { width: 100%; max-width: 0; padding-left: 14px; overflow: hidden; text-align: left; text-overflow: ellipsis; }
.kcc-cs-total ~ tr ~ tr td { border-top: 1px solid rgba(255, 255, 255, 0.08); }
.kcc-cs-total td { background: rgba(255, 193, 7, 0.12); color: #ffc107; }
.kcc-cs-total td:first-child { border-radius: 6px 0 0 6px; }
.kcc-cs-total td:last-child { border-radius: 0 6px 6px 0; }
.kcc-cs-guest td { color: rgba(255, 255, 255, 0.55); }
.kcc-cs-current td.kcc-cs-name { color: #9eeb56; }
.kcc-cs-note { margin: auto 0 2px 14px; padding-top: 14px; color: rgba(255, 255, 255, 0.45) !important; font-size: 15px; }
`;

type Tab = 'week' | 'month' | 'year' | 'all';
interface Period { start: string; end: string; label: string }

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All Time' },
];

let firstWeekday = 1;
let tab: Tab = 'all';
let cursor = new Date();
let pickerOpen = false;
let pickerView = new Date();
let statsWindow: object | null = null;
let snapshot: ClientStatsSnapshot | null = null;
let refreshTimer: number | null = null;
let reported: string | null = null;

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekStart = (d: Date): Date => addDays(d, -((d.getDay() - firstWeekday + 7) % 7));
const monthKey = (d: Date): number => d.getFullYear() * 12 + d.getMonth();
const fmtDate = (d: Date): string => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function fmtTime(ms: number): string {
  if (!ms) return '-';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours >= 100) return hours.toLocaleString('en-US') + 'h';
  const rest = mins % 60;
  return hours ? hours + 'h ' + String(rest).padStart(2, '0') + 'm' : rest + 'm';
}

const fmtHours = (ms: number): string => (ms >= 3600000 ? Math.round(ms / 3600000).toLocaleString('en-US') + 'h' : fmtTime(ms));

function periodOf(t: Tab, c: Date): Period {
  const shortDay = (d: Date): string => MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  if (t === 'week') {
    const start = weekStart(c);
    const end = addDays(start, 6);
    const last = start.getMonth() === end.getMonth() ? String(end.getDate()) : shortDay(end);
    return { start: dateStamp(start), end: dateStamp(end), label: shortDay(start) + ' - ' + last + ', ' + end.getFullYear() };
  }
  if (t === 'month') {
    return {
      start: dateStamp(new Date(c.getFullYear(), c.getMonth(), 1)),
      end: dateStamp(new Date(c.getFullYear(), c.getMonth() + 1, 0)),
      label: MONTHS[c.getMonth()] + ' ' + c.getFullYear(),
    };
  }
  return { start: c.getFullYear() + '-01-01', end: c.getFullYear() + '-12-31', label: String(c.getFullYear()) };
}

function tally(row: ClientStatsRow, p: Period): { ms: number; days: number; best: number } {
  const out = { ms: 0, days: 0, best: 0 };
  for (const [day, ms] of Object.entries(row.days)) {
    if (day < p.start || day > p.end) continue;
    out.ms += ms;
    out.days++;
    out.best = Math.max(out.best, ms);
  }
  return out;
}

function shadeStyle(ms: number, max: number): string {
  if (!ms) return '';
  const level = Math.min(SHADES.length - 1, Math.floor((ms / max) * SHADES.length));
  return ' style="background-color: rgba(255, 193, 7, ' + SHADES[level] + ')"';
}

function pickerHead(title: string, canGoBack: boolean, canGoForward: boolean): string {
  const arrow = (dir: number, icon: string, enabled: boolean): string =>
    '<span class="material-icons kcc-cs-arrow' + (enabled ? '' : ' kcc-cs-off') + '" data-view="' + dir + '">' + icon + '</span>';
  return '<div class="kcc-cs-pop-head">' + arrow(-1, 'chevron_left', canGoBack) + '<span>' + title + '</span>' + arrow(1, 'chevron_right', canGoForward) + '</div>';
}

function weekPicker(s: ClientStatsSnapshot, selected: Period): string {
  const now = new Date();
  const today = dateStamp(now);
  const since = new Date(s.since);
  const firstDay = weekStart(new Date(pickerView.getFullYear(), pickerView.getMonth(), 1));
  const dates = Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => addDays(firstDay, i));
  const max = Math.max(...dates.map((d) => s.client.days[dateStamp(d)] ?? 0));

  let rows = '<div class="kcc-cs-week">' + Array.from({ length: 7 }, (_, i) => '<span class="kcc-cs-dow">' + WEEKDAYS[(firstWeekday + i) % 7] + '</span>').join('') + '</div>';
  for (let w = 0; w < CALENDAR_WEEKS; w++) {
    const days = dates.slice(w * 7, (w + 1) * 7);
    const start = dateStamp(days[0]);
    const selectable = start <= today && dateStamp(days[6]) >= dateStamp(since);
    const cells = days.map((d) => {
      const key = dateStamp(d);
      const ms = s.client.days[key] ?? 0;
      const cls = (d.getMonth() === pickerView.getMonth() ? '' : ' kcc-cs-other') + (key > today ? ' kcc-cs-future' : '');
      return '<span class="kcc-cs-day' + cls + '"' + shadeStyle(ms, max) + ' title="' + key + (ms ? ': ' + fmtTime(ms) : '') + '">' + d.getDate() + '</span>';
    });
    rows += '<div class="kcc-cs-week' + (start === selected.start ? ' kcc-cs-on' : '') + '"' + (selectable ? ' data-pick="' + start + '"' : '') + '>' + cells.join('') + '</div>';
  }
  const title = MONTHS[pickerView.getMonth()] + ' ' + pickerView.getFullYear();
  return pickerHead(title, monthKey(pickerView) > monthKey(since), monthKey(pickerView) < monthKey(now)) + rows;
}

function tiles(s: ClientStatsSnapshot, selected: Period, dates: Date[], text: (d: Date) => string): string {
  const today = dateStamp();
  const since = dateStamp(new Date(s.since));
  const periods = dates.map((d) => periodOf(tab, d));
  const times = periods.map((p) => tally(s.client, p).ms);
  const max = Math.max(...times);
  return '<div class="kcc-cs-tiles">' + periods.map((p, i) => {
    const future = p.start > today;
    const selectable = !future && p.end >= since;
    const cls = (p.start === selected.start ? ' kcc-cs-on' : '') + (future ? ' kcc-cs-future' : '');
    return '<div class="kcc-cs-tile' + cls + '"' + shadeStyle(times[i], max) + (selectable ? ' data-pick="' + p.start + '"' : '') + '><span>' + text(dates[i]) + '</span><small>' + fmtHours(times[i]) + '</small></div>';
  }).join('') + '</div>';
}

function pickerHtml(s: ClientStatsSnapshot, selected: Period): string {
  const now = new Date();
  const since = new Date(s.since);
  let content: string;
  if (tab === 'week') {
    content = weekPicker(s, selected);
  } else if (tab === 'month') {
    const year = pickerView.getFullYear();
    const months = MONTHS.map((_, m) => new Date(year, m, 1));
    content = pickerHead(String(year), year > since.getFullYear(), year < now.getFullYear()) + tiles(s, selected, months, (d) => MONTHS[d.getMonth()].slice(0, 3));
  } else {
    const years: Date[] = [];
    for (let y = now.getFullYear(); y >= since.getFullYear(); y--) years.push(new Date(y, 0, 1));
    content = '<div class="kcc-cs-pop-head"><span>Pick a Year</span></div>' + tiles(s, selected, years, (d) => String(d.getFullYear()));
  }
  return '<div class="kcc-cs-pop">' + content + '</div>';
}

function navHtml(s: ClientStatsSnapshot, p: Period | null): string {
  if (!p) return '<span class="kcc-cs-since">Since ' + fmtDate(new Date(s.since)) + '</span>';
  const current = p.start === periodOf(tab, new Date()).start;
  return '<span class="kcc-cs-date" data-picker="1"><span class="material-icons">calendar_month</span>' + p.label + '<span class="material-icons">expand_more</span></span>' +
    (current
      ? '<span class="kcc-cs-tag">This ' + TABS.find((t) => t.id === tab)!.label + '</span>'
      : '<span class="kcc-cs-tag kcc-cs-link" data-now="1">Back to Now</span>') +
    (pickerOpen ? pickerHtml(s, p) : '');
}

function bodyHtml(s: ClientStatsSnapshot): string {
  const p = tab === 'all' ? null : periodOf(tab, cursor);
  const timeIn = (row: ClientStatsRow): number => (p ? tally(row, p).ms : row.totalMs);
  const cellsOf = (row: ClientStatsRow): string[] => {
    if (!p) return [fmtTime(row.totalMs), fmtTime(row.sessionMs), fmtTime(row.longestSessionMs)];
    const t = tally(row, p);
    return [fmtTime(t.ms), t.days ? String(t.days) : '-', fmtTime(t.best)];
  };
  const rowHtml = (label: string, row: ClientStatsRow, cls: string): string => {
    const name = escapeHtml(label);
    return '<tr class="' + cls + '"><td class="kcc-cs-name" title="' + name + '">' + name + '</td>' + cellsOf(row).map((c) => '<td>' + c + '</td>').join('') + '</tr>';
  };

  const rows = [rowHtml('Client Total', s.client, 'kcc-cs-total')];
  // Every account stays listed in every period: the window is vertically centred, so a changing row count would move the tabs under the cursor
  for (const a of [...s.accounts].sort((x, y) => timeIn(y) - timeIn(x) || y.totalMs - x.totalMs)) {
    rows.push(rowHtml(a.name, a, a.name === s.currentAccount ? 'kcc-cs-current' : ''));
  }
  // Account switches pass through signed-out for a few seconds; that alone isn't worth a row
  if (!s.currentAccount || s.guest.totalMs >= MIN_GUEST_ROW_MS) {
    rows.push(rowHtml('Not Signed In', s.guest, s.currentAccount ? 'kcc-cs-guest' : 'kcc-cs-guest kcc-cs-current'));
  }

  const tabsHtml = TABS.map((t) => '<span class="kcc-cs-tab' + (t.id === tab ? ' kcc-cs-on' : '') + '" data-tab="' + t.id + '">' + t.label + '</span>').join('');
  const heads = p ? ['Time', 'Days Played', 'Best Day'] : ['Total', 'This Session', '<span title="Longest single session">Longest</span>'];
  return '<div class="kcc-cs-top"><div class="kcc-cs-title">Client Stats</div><div class="kcc-cs-tabs">' + tabsHtml + '</div></div>' +
    '<div class="kcc-cs-nav">' + navHtml(s, p) + '</div>' +
    '<table class="kcc-cs-table"><tr><th></th>' + heads.map((h) => '<th>' + h + '</th>').join('') + '</tr>' + rows.join('') + '</table>' +
    '<div class="kcc-cs-note">Includes idle time.' + (p ? ' Counted since ' + fmtDate(new Date(s.since)) + '.' : '') + '</div>';
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
    snapshot = s;
    const body = document.getElementById(BODY_ID);
    if (body) body.innerHTML = bodyHtml(s);
  });
}

function onWindowClick(e: Event): void {
  const body = document.getElementById(BODY_ID);
  const target = e.target as Element;
  if (!body || !snapshot || !body.contains(target)) return;
  const hit = (attr: string): HTMLElement | null => target.closest<HTMLElement>('[data-' + attr + ']');

  const tabEl = hit('tab');
  const viewEl = hit('view');
  const pickEl = hit('pick');
  if (tabEl) {
    tab = tabEl.dataset.tab as Tab;
    cursor = new Date();
    pickerOpen = false;
  } else if (hit('picker')) {
    pickerOpen = !pickerOpen;
    pickerView = new Date(cursor);
  } else if (viewEl) {
    const dir = Number(viewEl.dataset.view);
    pickerView = tab === 'week'
      ? new Date(pickerView.getFullYear(), pickerView.getMonth() + dir, 1)
      : new Date(pickerView.getFullYear() + dir, 0, 1);
  } else if (pickEl) {
    cursor = new Date(pickEl.dataset.pick + 'T00:00:00');
    pickerOpen = false;
  } else if (hit('now')) {
    cursor = new Date();
    pickerOpen = false;
  } else if (pickerOpen && !target.closest('.kcc-cs-pop')) {
    pickerOpen = false;
  } else {
    return;
  }
  (window as any).playSelect?.();
  body.innerHTML = bodyHtml(snapshot);
}

export async function openStatsWindow(): Promise<void> {
  const s: ClientStatsSnapshot = await ipcRenderer.invoke('client-stats-get');
  snapshot = s;
  firstWeekday = s.weekStart;
  cursor = new Date();
  pickerOpen = false;
  const w = window as any;
  if (!statsWindow) {
    // No `label`: showWindow reports it to Krunker's analytics, and an unlabelled window reports as "home"
    const win = {
      header: 'Client Stats',
      html: '',
      width: 720,
      gen: () => '<div id="' + BODY_ID + '">' + bodyHtml(snapshot!) + '</div>',
    };
    w.windows.push(win);
    statsWindow = win;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  document.getElementById('menuWindow')?.addEventListener('click', onWindowClick);
  w.showWindow(w.windows.indexOf(statsWindow) + 1);
  if (refreshTimer === null) refreshTimer = window.setInterval(refresh, REFRESH_MS);
}

export function confirmStatsImport({ totalMs, names }: ClientStatsImport): Promise<boolean> {
  const listed = names.slice(0, 12);
  if (names.length > 12) listed.push((names.length - 12) + ' more');
  const who = listed.length ? ' on ' + new Intl.ListFormat('en').format(listed) : '';
  return showConfirm({
    title: 'Import Client Stats',
    message: 'Add the time in this file to your client stats? It has ' + fmtHours(totalMs) + who + '. Only add it if it\'s your own backup, because it can\'t be undone without deleting all data.',
    confirmLabel: 'Add',
    cancelLabel: 'Skip',
  });
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
