// Time on the client, overall and per Krunker account

import { BrowserWindow, powerMonitor } from 'electron';
import { ClientTimeRecord, config } from './config';
import { dateStamp, electronLog } from './logger';

const TICK_MS = 60_000;
// A longer gap between ticks means the PC slept
const MAX_GAP_MS = 150_000;
const ACTIVE_IDLE_S = 300;
const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface ClientStatsRow {
  totalMs: number;
  sessionMs: number;
  weekMs: number;
  longestSessionMs: number;
}

export interface ClientStatsSnapshot {
  since: number;
  currentAccount: string;
  client: ClientStatsRow;
  guest: ClientStatsRow;
  accounts: Array<ClientStatsRow & { name: string }>;
}

const newRecord = (): ClientTimeRecord => ({ totalMs: 0, activeMs: 0, longestSessionMs: 0, days: {} });

let since = Date.now();
let client = newRecord();
let guest = newRecord();
const accounts = new Map<string, ClientTimeRecord>();
const sessionMs = new Map<ClientTimeRecord, number>();
let current: ClientTimeRecord | null = null;
let currentName = '';
let lastAccrual = 0;
let mouseFree = false;
let lastSave = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const validMs = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function toRecord(raw: any, oldestDay: string): ClientTimeRecord {
  const rec = newRecord();
  rec.totalMs = validMs(raw?.totalMs);
  rec.activeMs = validMs(raw?.activeMs);
  rec.longestSessionMs = validMs(raw?.longestSessionMs);
  for (const [day, ms] of Object.entries(raw?.days ?? {})) {
    if (day >= oldestDay && validMs(ms)) rec.days[day] = validMs(ms);
  }
  return rec;
}

function load(): void {
  const raw: any = config.get('clientStats');
  const oldestDay = dateStamp(new Date(Date.now() - WEEK_DAYS * DAY_MS));
  since = validMs(raw?.since) || since;
  client = toRecord(raw?.client, oldestDay);
  guest = toRecord(raw?.guest, oldestDay);
  for (const [name, rec] of Object.entries(raw?.accounts ?? {})) accounts.set(name, toRecord(rec, oldestDay));
}

function addTime(rec: ClientTimeRecord, step: number, active: boolean): void {
  rec.totalMs += step;
  if (active) rec.activeMs += step;
  const session = (sessionMs.get(rec) ?? 0) + step;
  sessionMs.set(rec, session);
  rec.longestSessionMs = Math.max(rec.longestSessionMs, session);
  const day = dateStamp();
  rec.days[day] = (rec.days[day] ?? 0) + step;
}

function accrue(): void {
  if (!current) return;
  const now = Date.now();
  const step = now - lastAccrual;
  lastAccrual = now;
  if (step <= 0) return;
  if (step > MAX_GAP_MS) {
    sessionMs.clear();
    return;
  }
  const active = BrowserWindow.getFocusedWindow() !== null && powerMonitor.getSystemIdleTime() < ACTIVE_IDLE_S;
  addTime(client, step, active);
  addTime(current, step, active);
}

function save(): void {
  lastSave = Date.now();
  try {
    config.set('clientStats', { since, client, guest, accounts: Object.fromEntries(accounts) });
  } catch (err) {
    electronLog.warn('[KCC] Client stats save failed:', err);
  }
}

function toRow(rec: ClientTimeRecord): ClientStatsRow {
  const now = new Date();
  let weekMs = 0;
  for (let i = 0; i < WEEK_DAYS; i++) {
    weekMs += rec.days[dateStamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))] ?? 0;
  }
  return { totalMs: rec.totalMs, sessionMs: sessionMs.get(rec) ?? 0, weekMs, longestSessionMs: rec.longestSessionMs };
}

export function startClientStats(): void {
  lastAccrual = Date.now();
  try {
    load();
  } catch (err) {
    // Saving from here would replace the real totals with zeros
    electronLog.warn('[KCC] Client stats unreadable, not saving this session:', err);
    return;
  }
  // Each save is a blocking disk write on the thread that handles input, so none while the game has the mouse
  timer = setInterval(() => {
    if (!current) return;
    accrue();
    if (mouseFree) save();
  }, TICK_MS);
}

export function setClientStatsMouseFree(value: boolean): void {
  mouseFree = value;
  // The mouse can come and go every few seconds, so not on every release
  if (mouseFree && timer && current && Date.now() - lastSave >= TICK_MS) {
    accrue();
    save();
  }
}

export function setClientStatsAccount(name: string): void {
  if (current && name === currentName) return;
  accrue();
  let next = guest;
  if (name) {
    next = accounts.get(name) ?? newRecord();
    accounts.set(name, next);
  }
  current = next;
  currentName = name;
  // On the first report, the page load since startup belongs to this account
  accrue();
}

export function clientStatsSnapshot(): ClientStatsSnapshot {
  accrue();
  return {
    since,
    currentAccount: currentName,
    client: toRow(client),
    guest: toRow(guest),
    accounts: [...accounts].map(([name, rec]) => ({ name, ...toRow(rec) })),
  };
}

export function flushClientStats(): void {
  if (!timer) return;
  accrue();
  // Also what keeps stats through Reset Options: its config.clear() runs just before this
  save();
}

export function stopClientStats(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
