// ── Trade request ding ──
// Krunker has no push for incoming trades; they surface only when something GETs
// gapi.svc.krunker.io/trades/history (data.open[]). So we poll it, authenticated
// with the FRVR access token from localStorage (the same token ranked uses).
// A trade's `player` is the initiator; player === us means we sent it (no ding).

import { ipcRenderer } from 'electron';
import { savedConsole as _console } from './saved-console';

export interface TradeDingSettings {
  sound: string;      // 'off' | 'chime' | 'custom' | a window.SOUND name (tick_0, …)
  volume: number;     // 0–100
  soundFile?: string; // path or URL, used when sound === 'custom'
  intervalSec?: number;
}

const POLL_URL = 'https://gapi.svc.krunker.io/trades/history';
const COOLDOWN_MS = 2500;
const SEEN_CAP = 500;

let sound = 'off';
let volume = 0.4;
let soundFile = '';
let pollSec = 15;
let active = false;
let lastDing = 0;

function clampVolume(v: number | undefined): number { return Math.max(0, Math.min(1, (v ?? 40) / 100)); }
function clampInterval(v: number | undefined): number { return Math.max(5, Math.min(60, v ?? 15)); }

// ── Sound ──

let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (!audioCtx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    try { audioCtx = new AC(); } catch { return null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { /* ignore */ });
  }
  return audioCtx;
}

function unlock(): void { ensureAudio(); }

function strike(ctx: AudioContext, freq: number, at: number, dur: number, vol: number): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

function chime(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  strike(ctx, 987.77, t, 0.7, volume);
  strike(ctx, 1318.51, t + 0.1, 0.7, volume);
}

// ── Custom sound file (resolved to a playable URL by the main process) ──

let customUrl = '';
let customFor = '';   // the soundFile string customUrl was resolved from
let customReq = 0;
let customAudio: HTMLAudioElement | null = null;

async function resolveCustom(): Promise<void> {
  if (soundFile === customFor) return;
  const req = ++customReq;
  customFor = soundFile;
  customUrl = '';
  if (!soundFile) return;
  try {
    const url = (await ipcRenderer.invoke('resolve-audio-file', soundFile)) || '';
    if (req === customReq) customUrl = url;   // ignore a stale resolve if soundFile changed again
  } catch (err) {
    _console.warn('[KCC-Trade] custom sound resolve failed:', err);
  }
}

function playCustom(): void {
  if (!customUrl) { chime(); return; }
  try {
    if (!customAudio) customAudio = new Audio();
    if (customAudio.src !== customUrl) customAudio.src = customUrl;
    customAudio.volume = volume;
    customAudio.currentTime = 0;
    void customAudio.play().catch(() => { /* autoplay/gesture */ });
  } catch { chime(); }
}

function ding(reason: string): void {
  if (!active || sound === 'off' || volume <= 0) return;
  const now = Date.now();
  if (now - lastDing < COOLDOWN_MS) return;
  lastDing = now;
  if (sound === 'chime') {
    chime();
  } else if (sound === 'custom') {
    playCustom();
  } else {
    const S = (window as any).SOUND;
    if (S && typeof S.play === 'function') {
      try { S.play(sound, volume); } catch { chime(); }
    } else {
      chime();
    }
  }
  _console.warn('[KCC-Trade] ding —', reason);
}

// ── Auth ──
// FRVR access token, re-read every poll so it survives the token refreshing.
function frvrToken(): string {
  try { return (window.localStorage.getItem('__FRVR_auth_access_token') || '').replace(/"/g, ''); }
  catch { return ''; }
}

// ── Persistence (per-account seen trids in localStorage) ──

function myName(): string {
  try { return window.localStorage.getItem('krunker_username') || ''; } catch { return ''; }
}

function keyForName(name: string): string { return 'kcc_tradeding_seen_' + (name || 'default'); }

function readSeen(key: string): Record<string, 1> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;   // this account has never been baselined
    const arr = JSON.parse(raw);
    const set: Record<string, 1> = {};
    if (Array.isArray(arr)) for (const t of arr) set[String(t)] = 1;
    return set;
  } catch { return null; }
}

function writeSeen(key: string, set: Record<string, 1>): void {
  try {
    let trids = Object.keys(set).map(Number).filter((n) => !isNaN(n));
    trids.sort((a, b) => b - a);   // keep the newest ids if capped
    if (trids.length > SEEN_CAP) trids = trids.slice(0, SEEN_CAP);
    window.localStorage.setItem(key, JSON.stringify(trids));
  } catch { /* ignore */ }
}

// ── Poll ──

interface OpenTrade { trid: number; player?: string; buyer?: string; }

let pollTimer: ReturnType<typeof setInterval> | null = null;
let knownTrids: Record<string, 1> | null = null;
let seenKey: string | null = null;

function checkOpen(open: OpenTrade[]): void {
  const me = myName();
  const key = keyForName(me);
  if (key !== seenKey) {            // first poll, or the account was switched
    seenKey = key;
    knownTrids = readSeen(key);
  }

  const cur: Record<string, OpenTrade> = {};
  for (const o of open) if (o && o.trid != null) cur[String(o.trid)] = o;

  if (knownTrids === null) {        // first run for this account: baseline silently
    knownTrids = {};
    for (const k in cur) knownTrids[k] = 1;
    writeSeen(key, knownTrids);
    return;
  }

  const fresh: OpenTrade[] = [];
  for (const k in cur) if (!(k in knownTrids)) { fresh.push(cur[k]); knownTrids[k] = 1; }
  if (fresh.length) writeSeen(key, knownTrids);

  // Only ding trades someone else initiated; if we can't tell who we are, stay quiet.
  const incoming = me ? fresh.filter((o) => o.player !== me) : [];
  if (incoming.length) {
    ding('trade from ' + incoming.map((o) => o.player || o.buyer || '?').join(', '));
  }
}

function doPoll(): void {
  if (!active) return;
  const token = frvrToken();
  if (!token) return;   // not logged in yet; a later tick will pick it up
  window.fetch(POLL_URL, { method: 'GET', headers: { authorization: 'Bearer ' + token }, credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: any) => {
      if (!active || !d) return;
      const open = d.data && d.data.open;
      checkOpen(Array.isArray(open) ? open : []);
    })
    .catch((err) => _console.log('[KCC-Trade] poll failed:', err));   // transient (offline/closing); self-heals next tick
}

function startPolling(): void {
  if (pollTimer) return;
  doPoll();
  pollTimer = setInterval(doPoll, pollSec * 1000);
}

function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Public API ──

export function initTradeDing(settings: TradeDingSettings): void {
  sound = settings.sound || 'off';
  volume = clampVolume(settings.volume);
  soundFile = settings.soundFile || '';
  pollSec = clampInterval(settings.intervalSec);
  if (sound === 'off') return;
  if (active) return;
  active = true;
  void resolveCustom();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  startPolling();
  _console.log('[KCC-Trade] trade ding active');
}

export function setTradeDing(settings: TradeDingSettings): void {
  const nextSound = settings.sound || 'off';
  volume = clampVolume(settings.volume);
  soundFile = settings.soundFile || '';
  void resolveCustom();
  if (nextSound === 'off') {
    destroyTradeDing();
    return;
  }
  sound = nextSound;
  if (!active) { initTradeDing(settings); return; }
  const nextInterval = clampInterval(settings.intervalSec);
  if (nextInterval !== pollSec) { pollSec = nextInterval; stopPolling(); startPolling(); }
}

export function destroyTradeDing(): void {
  active = false;
  sound = 'off';
  stopPolling();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
  if (customAudio) { try { customAudio.pause(); } catch { /* ignore */ } }
  knownTrids = null;
  seenKey = null;
}
