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

// ── Chat message injection ──
// Creates messages in #chatHolder inside a persistent #kpcMessageHolder div.
// timeout=0 means the message is persistent (not auto-removed).

export function genChatMsg(text: string, timeout = 2.25): HTMLElement | null {
  const chatHolder = document.getElementById('chatHolder');
  if (!chatHolder) return null;
  if (!document.getElementById('kpcMessageHolder')) {
    chatHolder.insertAdjacentHTML('afterbegin', '<div id="kpcMessageHolder"></div>');
  }
  const holder = document.getElementById('kpcMessageHolder')!;
  holder.insertAdjacentHTML('beforeend',
    '<div class="chatHolder_kpc"><div class="chatItem_kpc"><span class="chatMsg_kpc">' +
    escapeHtml(text) + '</span></div></div>');
  const elem = holder.lastElementChild as HTMLElement;
  if (timeout !== 0) {
    setTimeout(() => { elem.remove(); }, timeout * 1000);
  }
  return elem;
}

// ── Filename sanitisation ──

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── Shared CSS constants ──

export const DEATH_ANIM_BLOCK_ID = 'kpc-animationBlock';
export const DEATH_ANIM_BLOCK_CSS =
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

// ── Cleaner Menu ──
// Hides clutter from the main menu for a streamlined look.

const CLEANER_MENU_ID = 'kpc-cleanerMenu';
const CLEANER_MENU_CSS = `
*::-webkit-scrollbar { display: none !important; }
.settingsBtn[style*="width:auto;background-color:#994cd1"] { display: none !important; }
.setSugBox2 { display: none !important; }
.advancedSwitch { display: none !important; }
.menuSocialB { display: none !important; }
.serverHostOpH { display: none !important; }
.signup-rewards-container { display: none !important; }
#tlInfHold { display: none !important; }
#gameNameHolder { display: none !important; }
#termsInfo { display: none !important; }
#bubbleContainer { display: none !important; }
#instructions:only-child { display: none !important; }
#mapInfoHld { display: none !important; }
#krDiscountAd { display: none !important; }
#classPreviewCanvas { display: none !important; }
#menuClassSubtext { display: none !important; }
#settingsPreset { display: none !important; }
#menuClassName { display: none !important; }
#menuBtnQuickMatch { display: none !important; }
#menuClassIcn { display: none !important; }
#streamContainerNew { display: none !important; }
#editorBtnM { display: none !important; }
.verticalSeparator { visibility: hidden !important; }
#mLevelCont { background-color: transparent; }
#uiBase.onMenu #spectButton { top: 94% !important; }
.headerBarL, .headerBar, .menuBtnHL { background-color: transparent; }
.headerBarR { right: -23px !important; }
`;

export function setCleanerMenu(enabled: boolean): void {
    let el = document.getElementById(CLEANER_MENU_ID);
    if (enabled) {
        if (!el) {
            el = document.createElement('style');
            el.id = CLEANER_MENU_ID;
            el.textContent = CLEANER_MENU_CSS;
            document.head.appendChild(el);
        }
    } else if (el) {
        el.remove();
    }
}
