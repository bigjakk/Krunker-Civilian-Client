// Time on the client, overall and per Krunker account

import { app, BrowserWindow, powerMonitor } from 'electron';
import { dateStamp } from '../shared/date-stamp';
import { ClientTimeRecord, config } from './config';
import { electronLog } from './logger';

const TICK_MS = 60_000;
// A longer gap between ticks means the PC slept
const MAX_GAP_MS = 150_000;
const ACTIVE_IDLE_S = 300;

export interface ClientStatsRow {
  totalMs: number;
  sessionMs: number;
  longestSessionMs: number;
  days: Record<string, number>;
}

export interface ClientStatsSnapshot {
  since: number;
  weekStart: number;
  currentAccount: string;
  client: ClientStatsRow;
  guest: ClientStatsRow;
  accounts: Array<ClientStatsRow & { name: string }>;
}

export interface ClientStatsImport {
  totalMs: number;
  names: string[];
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
// Kept here so the page can only say yes or no, never supply the numbers
let pendingImport: any = null;

const validMs = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
// A key like "constructor" would merge against the method every object inherits
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Not navigator.language: that's the UI language and ignores the region. firstDay runs 1 (Mon) to 7 (Sun); getDay counts from 0 (Sun).
function systemWeekStart(): number {
  try { return (new Intl.Locale(app.getSystemLocale()) as any).getWeekInfo().firstDay % 7; } catch { return 1; }
}

function toRecord(raw: any): ClientTimeRecord {
  const rec = newRecord();
  rec.totalMs = validMs(raw?.totalMs);
  rec.activeMs = validMs(raw?.activeMs);
  rec.longestSessionMs = validMs(raw?.longestSessionMs);
  for (const [day, ms] of Object.entries(raw?.days ?? {})) {
    if (DAY_KEY.test(day) && validMs(ms)) rec.days[day] = validMs(ms);
  }
  return rec;
}

function load(): void {
  const raw: any = config.get('clientStats');
  since = validMs(raw?.since) || since;
  client = toRecord(raw?.client);
  guest = toRecord(raw?.guest);
  for (const [name, rec] of Object.entries(raw?.accounts ?? {})) accounts.set(name, toRecord(rec));
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
  return { totalMs: rec.totalMs, sessionMs: sessionMs.get(rec) ?? 0, longestSessionMs: rec.longestSessionMs, days: rec.days };
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
    weekStart: systemWeekStart(),
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

// The higher value wins instead of adding up, so a second import or an old backup changes nothing
function mergeRecord(into: ClientTimeRecord, raw: unknown): void {
  const from = toRecord(raw);
  for (const [day, ms] of Object.entries(from.days)) into.days[day] = Math.max(into.days[day] ?? 0, ms);
  const dayTotal = Object.values(into.days).reduce((sum, ms) => sum + ms, 0);
  // Infinity would save as null and read back as zero
  into.totalMs = Math.max(into.totalMs, from.totalMs, validMs(dayTotal));
  into.activeMs = Math.max(into.activeMs, from.activeMs);
  into.longestSessionMs = Math.max(into.longestSessionMs, from.longestSessionMs);
}

function mergeStats(raw: any): void {
  accrue();
  since = Math.min(since, validMs(raw.since) || since);
  mergeRecord(guest, raw.guest);
  for (const [name, rec] of Object.entries(raw.accounts ?? {})) {
    const into = accounts.get(name) ?? newRecord();
    accounts.set(name, into);
    mergeRecord(into, rec);
  }
  // Two accounts on the same day add up, which a per-day maximum on the client row alone would miss
  const dayParts: Record<string, number> = {};
  for (const part of [guest, ...accounts.values()]) {
    for (const [day, ms] of Object.entries(part.days)) dayParts[day] = (dayParts[day] ?? 0) + ms;
  }
  mergeRecord(client, { ...raw.client, days: dayParts });
  save();
}

export function prepareClientStatsImport(raw: any): ClientStatsImport | null {
  const totalMs = validMs(raw?.client?.totalMs);
  pendingImport = timer && totalMs ? raw : null;
  return pendingImport && { totalMs, names: Object.keys(raw.accounts ?? {}) };
}

export function applyClientStatsImport(): void {
  if (pendingImport) mergeStats(pendingImport);
  pendingImport = null;
}

export function stopClientStats(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
