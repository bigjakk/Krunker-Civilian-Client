// ── Social hub music ──
// Background music while the new in-game social hub is open.
//
// The hub is a popup: Krunker reuses #genericPop for every popup and tags it per
// type (`socialModal` here, `claimPop` elsewhere — see menu-tweaks). A
// MutationObserver scoped to that one element tracks open/close; only main-frame
// childList+subtree observers break the WebGL engine, which this is not.
//
// Playback is gated on the hub being open AND the window actually being looked
// at (document visible + window focused), so alt-tabbing away doesn't leave
// music playing. Window focus comes from main over 'kcc-window-focus'.
//
// Losing focus hard-pauses and keeps position, so coming back resumes where you
// left off; closing the hub fades out and rewinds.

import { ipcRenderer } from 'electron';
import { savedConsole as _console } from './saved-console';

export interface SocialMusicConfig {
  source: string;
  volume: number; // 0-100
}

const FADE_MS = 1200;
const FADE_STEP_MS = 50;
const POLL_MS = 500;
const POLL_MAX = 60;
const HUB_CLASS = 'socialModal';

let source = '';
let volume = 0.4;
let resolvedUrl: string | null = null; // null = not resolved yet

let audio: HTMLAudioElement | null = null;
let loadedUrl: string | null = null;
let fadeTimer: number | null = null;

// ── Gate ──
let hubOpen = false;
let visible = true;
let windowFocused = true;
let trackFailed = false; // source is unplayable; don't retry until it changes

function clampVolume(v: number): number {
  return Math.min(1, Math.max(0, (Number(v) || 0) / 100));
}

async function resolveUrl(): Promise<string> {
  if (resolvedUrl !== null) return resolvedUrl;
  try {
    resolvedUrl = (await ipcRenderer.invoke('resolve-social-music', source)) as string;
  } catch (err) {
    _console.warn('[KCC-Music] failed to resolve source:', err);
    resolvedUrl = '';
  }
  return resolvedUrl;
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
  return hubOpen && visible && windowFocused && !trackFailed;
}

function applyGate(): void {
  // Looking away pauses outright rather than fading: the fade is the "you
  // closed the hub" gesture, and resuming mid-track is what you want on return.
  if (!visible || !windowFocused) {
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

function hubIsOpen(gp: HTMLElement): boolean {
  // getClientRects() is empty when the element or any ancestor is display:none,
  // and unlike offsetParent it still reports correctly for position:fixed popups.
  if (!gp.getClientRects().length) return false;
  return gp.classList.contains(HUB_CLASS) || !!gp.querySelector('.social-root');
}

function evaluateHub(): void {
  const gp = document.getElementById('genericPop');
  if (!gp) return;
  setHubOpen(hubIsOpen(gp));
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

function onVisibility(): void {
  visible = document.visibilityState === 'visible';
  applyGate();
}

function onWindowFocus(_e: unknown, focused: boolean): void {
  windowFocused = !!focused;
  applyGate();
}

let listenersBound = false;

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener('visibilitychange', onVisibility);
  ipcRenderer.on('kcc-window-focus', onWindowFocus);
}

function unbindListeners(): void {
  if (!listenersBound) return;
  listenersBound = false;
  document.removeEventListener('visibilitychange', onVisibility);
  ipcRenderer.off('kcc-window-focus', onWindowFocus);
}

// ── Public API ──

export function updateSocialMusicConfig(cfg: SocialMusicConfig): void {
  const nextSource = (cfg.source || '').trim();
  const sourceChanged = nextSource !== source;
  source = nextSource;
  volume = clampVolume(cfg.volume);
  if (audio && fadeTimer === null) audio.volume = volume;

  if (!source) {
    hubOpen = false;
    pauseNow();
    resolvedUrl = null;
    loadedUrl = null;
    return;
  }
  if (sourceChanged) {
    // Dropping loadedUrl makes the next play reassign src, which starts the new
    // track from the beginning.
    resolvedUrl = null;
    loadedUrl = null;
    trackFailed = false;
    applyGate(); // swap tracks immediately if the hub is open right now
  }
}

// Preload re-runs per document, so module state is normally fresh here; the
// teardown is defensive against 'main_did-finish-load' arriving twice for one
// document, which would otherwise stack observers and listeners.
export function initSocialMusic(cfg: SocialMusicConfig): void {
  destroySocialMusic();
  updateSocialMusicConfig(cfg); // sets state without starting (hubOpen is false)

  visible = document.visibilityState === 'visible';
  windowFocused = document.hasFocus();
  bindListeners();

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
