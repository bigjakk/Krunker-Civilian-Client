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

const DEATH_ANIM_BLOCK_ID = 'kpc-animationBlock';
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

// ── Menu Timer ──
// Shows the native spectate/game timer prominently on the menu screen.
// CSS approach from crankshaft/glorp.

const MENU_TIMER_ID = 'kpc-menuTimer';
const MENU_TIMER_CSS = `
#uiBase.onMenu #spectateUI { display: block !important; }
#uiBase.onCompMenu.onMenu #specTimer,
#uiBase.onMenu #specGMessage,
#uiBase.onMenu #spec1,
#uiBase.onMenu #specGameInfo,
#uiBase.onMenu #spec0,
#uiBase.onMenu #specControlHolder,
#uiBase.onMenu #specNames { display: none !important; }
#uiBase.onMenu #spectateHUD {
  box-sizing: border-box; display: flex !important; justify-content: center;
  height: 0.5rem; white-space: nowrap; width: max-content;
  position: fixed; top: calc(50% + 140px);
}
#uiBase.onMenu #spectateHUD #specGMessage { top: 0; }
#uiBase.onMenu #spectateUI > #spectateHUD { z-index: 1; transform: unset; }
#uiBase.onMenu .spectateInfo {
  position: fixed; top: calc(50% + 80px); left: 50%; transform: translate(-50%, -50%);
}
#uiBase.onMenu #spectateUI div .spectateInfo #specTimer {
  background-color: transparent; padding: 25px; font-size: 42px; border-radius: 0.5em;
}
#uiBase.onMenu #specKPDContr { display: none; }
#uiBase.onMenu #spectateUI div#specStats {
  position: absolute; top: calc(50% + 13em); left: 50%; transform: translateX(-50%); z-index: 1;
}
#uiBase.onMenu #spectateUI div#specStats:before {
  content: "Spectating"; position: absolute; bottom: 100%; left: 50%;
  transform: translateX(-50%); font-size: 1.2em; padding-bottom: 0.5em;
}
`;

export function setMenuTimer(enabled: boolean): void {
    let el = document.getElementById(MENU_TIMER_ID);
    if (enabled) {
        if (!el) {
            el = document.createElement('style');
            el.id = MENU_TIMER_ID;
            el.textContent = MENU_TIMER_CSS;
            document.head.appendChild(el);
        }
    } else if (el) {
        el.remove();
    }
}

