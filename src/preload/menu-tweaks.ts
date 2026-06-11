// ── Menu tweaks ──
// Two opt-in main-menu features: hiding promotional popups, and the "Classic
// Social" menu item. Both are pure DOM/Krunker-global code (no IPC).

// ── Hide menu popups ──
// Bundle/claim popups need clearPops(), not CSS — Krunker renders them via
// #popupHolder + #popupBack (the dim backdrop), so CSS-only hiding leaves the
// backdrop visible (the "dark screen") and breaks user-clicked bundles in the
// shop. Only unsolicited popups (pushed by the game with no recent user
// input) are dismissed: bundles opened by clicking — in the shop window, or
// directly on the main menu (home-store ad, KrunkCup widget) — must survive
// so they can be viewed and purchased.
// .nav-notif-section is the header "Notifications" widget; hide the whole
// section (not just its inner .webpush-container) plus its trailing
// .verticalSeparator, otherwise the collapsed section leaves a doubled-up
// pillar between Inbox and Settings.
const HIDE_POPUPS_CSS =
  '#leftTabsHolder > .youNewDiv:not(#battlepassAd), ' +
  '.nav-notif-section, .nav-notif-section + .verticalSeparator, ' +
  '#homeStoreAd, #streamContainerNew, .streams-overlay, ' +
  '#newsHolder, #streamContainer { display: none !important; }';
const USER_INTENT_WINDOW_MS = 2500;
let _hidePopupsStyle: HTMLStyleElement | null = null;
const _hidePopupsObservers: MutationObserver[] = [];
let _lastPointerDown = 0;

function notePointerDown(): void {
  // Pointer-locked clicks are gameplay (shooting), never popup-opening intent.
  if (document.pointerLockElement) return;
  _lastPointerDown = Date.now();
}

function dismissPromos(): void {
  // A popup appearing right after a click was opened by the user, not pushed.
  if (Date.now() - _lastPointerDown < USER_INTENT_WINDOW_MS) return;
  const wh = document.getElementById('windowHolder');
  if (wh && wh.style.display && wh.style.display !== 'none') return;
  const bp = document.getElementById('bundlePop');
  const gp = document.getElementById('genericPop');
  if (!bp?.children.length && !gp?.classList.contains('claimPop')) return;
  (window as any).clearPops?.();
}

export function startHidePopups(): void {
  if (_hidePopupsStyle) return;
  _hidePopupsStyle = document.createElement('style');
  _hidePopupsStyle.id = 'kcc-hideMenuPopups';
  _hidePopupsStyle.textContent = HIDE_POPUPS_CSS;
  document.head.appendChild(_hidePopupsStyle);

  document.addEventListener('pointerdown', notePointerDown, true);

  const bp = document.getElementById('bundlePop');
  if (bp) {
    const obs = new MutationObserver(dismissPromos);
    obs.observe(bp, { childList: true });
    _hidePopupsObservers.push(obs);
  }
  const gp = document.getElementById('genericPop');
  if (gp) {
    const obs = new MutationObserver(dismissPromos);
    obs.observe(gp, { attributes: true, attributeFilter: ['class'] });
    _hidePopupsObservers.push(obs);
  }
  dismissPromos(); // Catch popups already showing
}

export function stopHidePopups(): void {
  if (!_hidePopupsStyle) return;
  _hidePopupsStyle.remove();
  _hidePopupsStyle = null;
  document.removeEventListener('pointerdown', notePointerDown, true);
  for (const obs of _hidePopupsObservers) obs.disconnect();
  _hidePopupsObservers.length = 0;
}

// ── Classic Social ──
// Injects a second menu item below "Social" that opens the standalone
// /social.html page in a tab (pre-9.2 behaviour). Hidden by default;
// the setting toggles its visibility.
let _classicSocialPoll: number | null = null;

function injectClassicSocialBtn(): boolean {
  if (document.getElementById('kccClassicSocialBtn')) return true;
  const socialItem = document.getElementById('menuBtnSocial')?.closest('.menuItem');
  if (!socialItem || !socialItem.parentNode) return false;

  const scoped = Array.from(socialItem.classList).find((c) => c.startsWith('svelte-')) || '';
  const sfx = scoped ? ' ' + scoped : '';

  const btn = document.createElement('div');
  btn.id = 'kccClassicSocialBtn';
  btn.className = 'menuItem' + sfx;
  btn.setAttribute('onmouseenter', 'playTick()');
  btn.innerHTML =
    '<span class="material-icons-outlined menuItemIcon' + sfx + '">handshake</span>' +
    '<div class="menuItemTitle' + sfx + '">Classic Social</div>';
  btn.addEventListener('click', () => {
    (window as any).playSelect?.();
    window.open('https://krunker.io/social.html', '_blank');
  });

  socialItem.parentNode.insertBefore(btn, socialItem.nextSibling);
  return true;
}

function removeClassicSocialBtn(): void {
  document.getElementById('kccClassicSocialBtn')?.remove();
  if (_classicSocialPoll !== null) {
    clearInterval(_classicSocialPoll);
    _classicSocialPoll = null;
  }
}

export function setClassicSocial(enabled: boolean): void {
  if (!enabled) {
    removeClassicSocialBtn();
    return;
  }
  if (injectClassicSocialBtn()) return;
  if (_classicSocialPoll !== null) return;
  let attempts = 0;
  _classicSocialPoll = window.setInterval(() => {
    if (injectClassicSocialBtn() || ++attempts > 60) {
      if (_classicSocialPoll !== null) {
        clearInterval(_classicSocialPoll);
        _classicSocialPoll = null;
      }
    }
  }, 500);
}
