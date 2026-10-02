// ── Shared preload utilities ──
// Common types, helpers, and constants used across preload modules.

// ── Shared interfaces ──

export interface SavedConsole {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// ── HTML escaping ──

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]);
}

// ── Shared CSS constants ──

const DEATH_ANIM_BLOCK_ID = 'kcc-animationBlock';
const DEATH_ANIM_BLOCK_CSS =
  '.death-ui-bottom, .death-ui-bottom-empty { animation: none !important; transition: none !important; }';

/** Inject or remove the death screen animation block style element. */
export function setDeathAnimBlock(enabled: boolean): void {
  let el = document.getElementById(DEATH_ANIM_BLOCK_ID);
  if (enabled) {
    if (!el) {
      el = document.createElement('style');
      el.id = DEATH_ANIM_BLOCK_ID;
      el.textContent = DEATH_ANIM_BLOCK_CSS;
      document.head.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

// ── Compositor-only death-screen animations ──
// Krunker's death-screen entrance animations — `chat-moveup` on
// #uiBase.onDeathScrn #chatHolder and `death-ui-moveup` on .death-ui-bottom* —
// animate `bottom`, a layout property, so every frame of their 1.5s run forces
// style+layout on the main thread right as the death UI appears. Redefining the
// keyframes to a translateY over the same distance keeps the exact motion
// (the elements' static `bottom` is already the keyframes' final value) but
// runs entirely on the compositor. Same-name @keyframes resolve to the last
// definition in document order; this is injected at did-finish-load, after
// Krunker's stylesheets. Distances from krunker main.css (2026-07-11):
// chat-moveup -300px→75px = 375px; death-ui-moveup -300px→40px = 340px.
// setDeathAnimBlock above still fully disables the .death-ui-bottom* panels
// when the deathscreenAnimation setting is on.

const COMPOSITOR_ANIM_ID = 'kcc-compositorAnim';
const COMPOSITOR_ANIM_CSS = `
@keyframes chat-moveup { 0% { transform: translateY(375px); } 100% { transform: translateY(0); } }
@keyframes death-ui-moveup { 0% { transform: translateY(340px); } 100% { transform: translateY(0); } }
`;

export function installCompositorAnimFix(): void {
    if (document.getElementById(COMPOSITOR_ANIM_ID)) return;
    const el = document.createElement('style');
    el.id = COMPOSITOR_ANIM_ID;
    el.textContent = COMPOSITOR_ANIM_CSS;
    document.head.appendChild(el);
}

// ── Menu Timer ──
// Shows the native spectate/game timer prominently on the menu screen.
// CSS approach from crankshaft/glorp.
// Krunker hides every #spectateUI child on the menu via
// `.onMenu #spectateUI > div:not(#replayControls) { display: none !important }`,
// so the rule that reveals #spectateHUD (the timer) must out-specify it.
// z-index 11 clears #menuHolder (10), whose character preview covers the screen centre, but stays under windows.

const MENU_TIMER_ID = 'kcc-menuTimer';
const MENU_TIMER_POS_KEY = 'kcc_menu_timer_pos';
const MENU_TIMER_CSS = `
#uiBase.onMenu #spectateUI { display: block !important; }
#uiBase.onCompMenu.onMenu #specTimer,
#uiBase.onMenu #specGMessage,
#uiBase.onMenu #spec1,
#uiBase.onMenu #specGameInfo,
#uiBase.onMenu #spec0,
#uiBase.onMenu #specControlHolder,
#uiBase.onMenu #specStats,
#uiBase.onMenu #specNames { display: none !important; }
#uiBase.onMenu #spectateUI #spectateHUD {
  box-sizing: border-box; display: flex !important; justify-content: center;
  height: 0.5rem; white-space: nowrap; width: max-content;
  position: fixed; top: calc(50% + 140px);
}
#uiBase.onMenu #spectateHUD #specGMessage { top: 0; }
#uiBase.onMenu #spectateUI > #spectateHUD { z-index: 11; transform: unset; }
#uiBase.onMenu .spectateInfo {
  position: fixed; left: var(--kcc-menu-timer-x, 50%); top: var(--kcc-menu-timer-y, 25%);
  transform: translate(-50%, -50%); pointer-events: auto; cursor: move;
}
#uiBase.onMenu #spectateUI div .spectateInfo #specTimer {
  background-color: transparent; padding: 25px; font-size: 42px; border-radius: 0.5em;
}
#uiBase.onMenu #specKPDContr { display: none; }
`;

type MenuTimerPos = { x: number; y: number };

function applyMenuTimerPos(pos: MenuTimerPos | null): void {
    const root = document.documentElement.style;
    if (pos) {
        root.setProperty('--kcc-menu-timer-x', pos.x + '%');
        root.setProperty('--kcc-menu-timer-y', pos.y + '%');
    } else {
        root.removeProperty('--kcc-menu-timer-x');
        root.removeProperty('--kcc-menu-timer-y');
    }
}

function loadMenuTimerPos(): MenuTimerPos | null {
    try {
        const pos = JSON.parse(localStorage.getItem(MENU_TIMER_POS_KEY) || 'null');
        return Number.isFinite(pos?.x) && Number.isFinite(pos?.y) ? pos : null;
    } catch {
        return null;
    }
}

// Drag to move, double-click to reset. Swallows the press so it never reaches Krunker's click-to-play.
function onMenuTimerPress(e: MouseEvent): void {
    const info = (e.target as Element | null)?.closest?.('#uiBase.onMenu .spectateInfo');
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dblclick') {
        try { localStorage.removeItem(MENU_TIMER_POS_KEY); } catch { /* storage unavailable */ }
        applyMenuTimerPos(null);
        return;
    }
    if (e.type !== 'mousedown' || e.button !== 0) return;
    const base = document.getElementById('uiBase')!.getBoundingClientRect();
    const box = info.getBoundingClientRect();
    const offX = e.clientX - (box.left + box.width / 2);
    const offY = e.clientY - (box.top + box.height / 2);
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    let pos: MenuTimerPos | null = null;
    const move = (ev: MouseEvent): void => {
        // The mouseup is lost if focus leaves mid-drag (Alt-Tab with the button held)
        if (!(ev.buttons & 1)) return up();
        pos = {
            x: clamp((ev.clientX - offX - base.left) / base.width * 100),
            y: clamp((ev.clientY - offY - base.top) / base.height * 100),
        };
        applyMenuTimerPos(pos);
    };
    const up = (): void => {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
        if (!pos) return;
        try { localStorage.setItem(MENU_TIMER_POS_KEY, JSON.stringify(pos)); } catch { /* storage unavailable */ }
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
}

const MENU_TIMER_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick'] as const;

export function setMenuTimer(enabled: boolean): void {
    let el = document.getElementById(MENU_TIMER_ID);
    if (enabled) {
        if (!el) {
            el = document.createElement('style');
            el.id = MENU_TIMER_ID;
            el.textContent = MENU_TIMER_CSS;
            document.head.appendChild(el);
            applyMenuTimerPos(loadMenuTimerPos());
            for (const type of MENU_TIMER_EVENTS) document.addEventListener(type, onMenuTimerPress, true);
        }
    } else if (el) {
        el.remove();
        for (const type of MENU_TIMER_EVENTS) document.removeEventListener(type, onMenuTimerPress, true);
    }
}

// ── KCC Watermark ──
// 'KCC vX.Y.Z' between the in-game timer and gamemode, and inline on the menu.

const WATERMARK_INGAME_ID = 'kcc-watermark-ingame';
const WATERMARK_MENU_ID = 'kcc-watermark-menu';
let watermarkVersion = '';

function makeWatermark(id: string, className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.id = id;
    el.className = className;
    el.textContent = 'KCC';
    if (watermarkVersion) {
        const ver = document.createElement('span');
        ver.className = 'kcc-watermark-ver';
        ver.textContent = 'V' + watermarkVersion;
        el.appendChild(ver);
    }
    return el;
}

function ensureWatermarks(): void {
    // In-game: between #timerHolder and #matchInfo. 'topLeftOld' is Krunker's
    // native styling token used on the surrounding elements.
    if (!document.getElementById(WATERMARK_INGAME_ID)) {
        const matchData = document.getElementById('topLeftMatchData');
        const matchInfo = document.getElementById('matchInfo');
        if (matchData && matchInfo?.parentElement === matchData) {
            matchData.insertBefore(makeWatermark(WATERMARK_INGAME_ID, 'kcc-watermark topLeftOld'), matchInfo);
        }
    }
    // Menu: appended to #matchInfoHolder so it sits on the "Now Playing" row.
    if (!document.getElementById(WATERMARK_MENU_ID)) {
        const holder = document.getElementById('matchInfoHolder');
        if (holder) holder.appendChild(makeWatermark(WATERMARK_MENU_ID, 'kcc-watermark'));
    }
}

let watermarkInterval: ReturnType<typeof setInterval> | null = null;

export function setWatermark(enabled: boolean, version?: string): void {
    if (version !== undefined) watermarkVersion = version;
    if (enabled) {
        ensureWatermarks();
        if (!watermarkInterval) watermarkInterval = setInterval(ensureWatermarks, 2000);
    } else {
        if (watermarkInterval) { clearInterval(watermarkInterval); watermarkInterval = null; }
        document.getElementById(WATERMARK_INGAME_ID)?.remove();
        document.getElementById(WATERMARK_MENU_ID)?.remove();
    }
}

// ── Transient toast ──
// Brief top-center confirmation (e.g. "Screenshot copied to clipboard"). Reuses a
// single element; styles inline so it needs no injected stylesheet.

const TOAST_ID = 'kcc-toast';
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
    let el = document.getElementById(TOAST_ID) as HTMLDivElement | null;
    if (!el) {
        el = document.createElement('div');
        el.id = TOAST_ID;
        el.style.cssText =
            'position:fixed;top:18px;left:50%;transform:translateX(-50%);' +
            'background:rgba(20,20,22,0.92);color:#fff;font-family:inherit;font-size:14px;font-weight:bold;' +
            'padding:9px 16px;border-radius:8px;z-index:100000;pointer-events:none;' +
            'box-shadow:0 2px 10px rgba(0,0,0,0.4);opacity:0;transition:opacity 160ms ease;';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    void el.offsetWidth; // force reflow so re-shows re-trigger the fade
    el.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (el) el.style.opacity = '0'; }, 1800);
}

