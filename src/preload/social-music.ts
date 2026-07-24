// Background music while the social hub or Market menu is open. Krunker reuses
// #genericPop for every popup and tags it per type, so a MutationObserver scoped to
// that one element tracks open/close — narrow enough not to hang the WebGL engine.

import { ipcRenderer } from 'electron';
import type { SocialMusicSource } from '../main/config-defaults';
import { savedConsole as _console } from './saved-console';

export interface SocialMusicConfig {
  source: string;
  volume: number; // 0-100
  onSocial: boolean;
  onMarket: boolean;
}

type Surface = 'social' | 'market';

const FADE_MS = 1200;
const FADE_STEP_MS = 50;
const POLL_MS = 500;
const POLL_MAX = 60;

let source = '';
let volume = 0.4;
let enableSocial = true;
let enableMarket = false;
let resolvedUrl: string | null = null; // null = not resolved yet
let objectUrl = '';                    // Blob URL for a local file, revoked on change
let resolving: Promise<string> | null = null;
let resolveToken: object | null = null; // identity of the read allowed to cache

let audio: HTMLAudioElement | null = null;
let loadedUrl: string | null = null;
let fadeTimer: number | null = null;

// ── Gate ──
let hubOpen = false;
let windowFocused = true;
let trackFailed = false; // source is unplayable; don't retry until it changes

function clampVolume(v: number): number {
  return Math.min(1, Math.max(0, (Number(v) || 0) / 100));
}

/** Drop the resolved URL so the next play re-resolves, freeing any Blob behind it. */
function clearResolved(): void {
  resolving = null; // any read still in flight is now stale
  resolveToken = null;
  resolvedUrl = null;
  loadedUrl = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
}

function resolveUrl(): Promise<string> {
  if (resolvedUrl !== null) return Promise.resolve(resolvedUrl);
  // Rapid focus flips call play() again mid-read and join the same promise; two
  // reads would orphan a Blob.
  if (resolving) return resolving;
  const token = {};
  resolveToken = token;
  resolving = (async (): Promise<string> => {
    let url = '';
    let isBlob = false;
    try {
      const src = (await ipcRenderer.invoke('resolve-social-music', source)) as SocialMusicSource;
      if (src && 'url' in src) {
        url = src.url;
      } else if (src && 'bytes' in src) {
        url = URL.createObjectURL(new Blob([src.bytes as unknown as BlobPart], { type: src.mime }));
        isBlob = true;
      }
    } catch (err) {
      _console.warn('[KCC-Music] failed to resolve source:', err);
    }
    if (resolveToken !== token) { // superseded mid-read — don't cache a stale track
      if (isBlob) URL.revokeObjectURL(url);
      return '';
    }
    if (isBlob) objectUrl = url;
    resolvedUrl = url;
    resolving = null;
    return url;
  })();
  return resolving;
}

// ── Playback ──

// Latched rather than flipping hubOpen, which would desync this module from the
// DOM the observer is reading — and would skip the pause below.
function onTrackError(): void {
  _console.warn('[KCC-Music] track failed to load:', source);
  trackFailed = true;
  pauseNow();
}

function cancelFade(): void {
  if (fadeTimer !== null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

async function play(): Promise<void> {
  if (!source) return;
  const url = await resolveUrl();
  if (!url) {
    _console.warn('[KCC-Music] source could not be resolved:', source);
    return;
  }
  if (!gateOpen()) return; // gate closed while resolving
  cancelFade();
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.addEventListener('error', onTrackError);
  }
  if (loadedUrl !== url) {
    audio.src = url;
    loadedUrl = url;
  }
  audio.volume = volume;
  audio.play().catch((err) => _console.warn('[KCC-Music] play failed:', err));
}

/** Immediate pause, keeping position so coming back resumes where you left. */
function pauseNow(): void {
  cancelFade();
  if (!audio) return;
  audio.pause();
  audio.volume = volume;
}

/** Fade to silence, then pause and rewind. Only safe while timers run. */
function fadeOut(): void {
  const a = audio;
  if (!a || a.paused) {
    // Already stopped — still rewind, otherwise a fade interrupted by losing
    // focus would leave the next open resuming mid-track.
    cancelFade();
    if (a) a.currentTime = 0;
    return;
  }
  if (fadeTimer !== null) return; // already fading
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  const delta = a.volume / steps;
  fadeTimer = window.setInterval(() => {
    const next = a.volume - delta;
    if (next <= 0.001) {
      cancelFade();
      a.pause();
      a.currentTime = 0; // a fresh open starts the track over
      a.volume = volume;
    } else {
      a.volume = next;
    }
  }, FADE_STEP_MS);
}

// ── Gate evaluation ──

function gateOpen(): boolean {
  return hubOpen && windowFocused && !trackFailed;
}

function applyGate(): void {
  // Looking away pauses outright rather than fading: the fade is the "you
  // closed the hub" gesture, and resuming mid-track is what you want on return.
  if (!windowFocused) {
    pauseNow();
    return;
  }
  if (hubOpen) {
    void play();
    return;
  }
  fadeOut();
}

function setHubOpen(next: boolean): void {
  if (next === hubOpen) return;
  hubOpen = next;
  if (next) trackFailed = false; // reopening retries a source that failed before
  applyGate();
}

// ── Hub open/close detection ──

let hubObserver: MutationObserver | null = null;
let evalTimer: number | null = null;
let hubPoll: number | null = null;

function openSurface(gp: HTMLElement): Surface | null {
  // getClientRects() is empty when the element or any ancestor is display:none,
  // and unlike offsetParent it still reports correctly for position:fixed popups.
  if (!gp.getClientRects().length) return null;
  if (gp.classList.contains('socialModal') || gp.querySelector('.social-root')) return 'social';
  if (gp.classList.contains('exchangeModal') || gp.querySelector('.market-container')) return 'market';
  return null;
}

function enabledFor(surface: Surface | null): boolean {
  if (surface === 'social') return enableSocial;
  if (surface === 'market') return enableMarket;
  return false;
}

function evaluateHub(): void {
  const gp = document.getElementById('genericPop');
  if (!gp) return;
  setHubOpen(enabledFor(openSurface(gp)));
}

// Class and style land as separate mutations; coalesce so one open doesn't
// evaluate three times.
function scheduleEvaluate(): void {
  if (evalTimer !== null) return;
  evalTimer = window.setTimeout(() => {
    evalTimer = null;
    evaluateHub();
  }, 60);
}

function attachHubObserver(): boolean {
  const gp = document.getElementById('genericPop');
  if (!gp) return false;
  hubObserver = new MutationObserver(scheduleEvaluate);
  hubObserver.observe(gp, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    childList: true,
  });
  evaluateHub(); // catch a hub that's already open
  return true;
}

// ── Environment listeners ──

function onWindowFocus(_e: unknown, focused: boolean): void {
  windowFocused = !!focused;
  applyGate();
}

let listenersBound = false;

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  ipcRenderer.on('kcc-window-focus', onWindowFocus);
}

function unbindListeners(): void {
  if (!listenersBound) return;
  listenersBound = false;
  ipcRenderer.off('kcc-window-focus', onWindowFocus);
}

// ── Public API ──

export function updateSocialMusicConfig(cfg: SocialMusicConfig): void {
  const nextSource = (cfg.source || '').trim();
  const sourceChanged = nextSource !== source;
  source = nextSource;
  volume = clampVolume(cfg.volume);
  enableSocial = cfg.onSocial;
  enableMarket = cfg.onMarket;
  if (audio && fadeTimer === null) audio.volume = volume;

  if (!source) {
    hubOpen = false;
    pauseNow();
    clearResolved();
    return;
  }
  if (sourceChanged) {
    clearResolved(); // dropping loadedUrl makes the next play start the new track over
    trackFailed = false;
  }
  // Re-read the live DOM: a toggle or a track swap changes nothing on the page, so
  // the observer won't fire for either.
  evaluateHub();
  applyGate();
}

// Teardown first, in case 'main_did-finish-load' arrives twice for one document —
// that would otherwise stack observers and listeners.
export function initSocialMusic(cfg: SocialMusicConfig): void {
  destroySocialMusic();

  // Before updateSocialMusicConfig, which may start playback immediately.
  windowFocused = document.hasFocus();
  bindListeners();
  updateSocialMusicConfig(cfg);

  if (attachHubObserver()) return;
  let attempts = 0;
  hubPoll = window.setInterval(() => {
    if (attachHubObserver() || ++attempts > POLL_MAX) {
      if (hubPoll !== null) clearInterval(hubPoll);
      hubPoll = null;
    }
  }, POLL_MS);
}

function destroySocialMusic(): void {
  hubOpen = false;
  trackFailed = false;
  pauseNow();
  clearResolved();
  unbindListeners();
  hubObserver?.disconnect();
  hubObserver = null;
  if (evalTimer !== null) {
    clearTimeout(evalTimer);
    evalTimer = null;
  }
  if (hubPoll !== null) {
    clearInterval(hubPoll);
    hubPoll = null;
  }
}
