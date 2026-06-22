// ── Alt Manager ──
// Saved-account quick switching: the credential login flow, the shared IPC data
// operations, the settings-panel section, and the in-game header popup.

import { ipcRenderer } from 'electron';
import { escapeHtml } from './utils';
import { savedConsole as _console } from './saved-console';
import { showConfirm } from './confirm-dialog';

// Tracks the open in-game Alt Manager modal so the header button can toggle it.
let altModalClose: (() => void) | null = null;

function switchToAccount(account: { username: string; password: string }): void {
  const w = window as any;
  if (typeof w.loginOrRegister !== 'function') {
    _console.warn('[KCC-Alt] loginOrRegister unavailable; cannot switch account');
    return;
  }

  function doLogin(): void {
    w.loginOrRegister();
    queueMicrotask(() => {
      const toggleBtn = document.querySelector('.auth-toggle-btn') as HTMLElement;
      if (toggleBtn && toggleBtn.textContent?.includes('username')) toggleBtn.click();
      queueMicrotask(() => {
        const nameInput = document.querySelector('#accName') as HTMLInputElement;
        const passInput = document.querySelector('#accPass') as HTMLInputElement;
        if (!nameInput || !passInput) return;
        nameInput.value = account.username;
        passInput.value = account.password;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        const submitBtn = document.querySelector('.io-button') as HTMLElement;
        if (submitBtn) submitBtn.click();
      });
    });
  }

  if (typeof w.logoutAcc === 'function') {
    w.logoutAcc();
    setTimeout(doLogin, 500);
  } else {
    doLogin();
  }
}

// ── Shared alt-manager data operations ──
// Both the settings-panel section and the in-game popup drive the same IPC
// handlers; keeping the calls here means the contract lives in one place.
type AltAccount = { label: string; avatarUrl: string | null };

function altList(): Promise<AltAccount[]> {
  return ipcRenderer.invoke('alt-list').then((list: AltAccount[] | null) => list || []);
}

// Tell main which saved account is currently logged in so it can store that
// account's avatar for next time. We read the username plus the avatar Krunker
// itself rendered in the header — the custom picture for premium accounts, or
// Krunker's default avatar for non-premium ones — and main matches the decrypted
// username. Only the current login is read, never other accounts' details.
function linkCurrentAccount(): Promise<unknown> {
  let username = '';
  try {
    username = localStorage.getItem('krunker_username') || '';
  } catch { /* localStorage unavailable */ }
  const avatar = document.querySelector('.ph-avatar') as HTMLImageElement | null;
  const avatarUrl = avatar?.src || '';
  if (!username || !avatarUrl) return Promise.resolve(null);
  return ipcRenderer.invoke('alt-link-current', username, avatarUrl).catch(() => null);
}

// Avatar <img> when we have the account's captured URL, else an initial-letter
// circle. wireAvatarFallback swaps the img back to initials if it fails to load.
function avatarMarkup(label: string, avatarUrl: string | null): string {
  const initial = escapeHtml((label[0] || '?').toUpperCase());
  if (avatarUrl) {
    return '<img class="kcc-acc-avatar kcc-acc-avatar-img" data-initial="' + initial +
      '" src="' + escapeHtml(avatarUrl) + '">';
  }
  return '<div class="kcc-acc-avatar">' + initial + '</div>';
}

function wireAvatarFallback(root: ParentNode): void {
  root.querySelectorAll('img.kcc-acc-avatar-img').forEach((img) => {
    img.addEventListener('error', () => {
      const div = document.createElement('div');
      div.className = 'kcc-acc-avatar';
      div.textContent = (img as HTMLElement).getAttribute('data-initial') || '?';
      img.replaceWith(div);
    }, { once: true });
  });
}

function altSave(label: string, username: string, password: string): Promise<unknown> {
  return ipcRenderer.invoke('alt-save', { label, username, password });
}

function altRemove(index: number): Promise<unknown> {
  return ipcRenderer.invoke('alt-remove', index);
}

function altSwitch(index: number): Promise<void> {
  return ipcRenderer.invoke('alt-get-credentials', index).then((creds: { username: string; password: string } | null) => {
    if (creds) switchToAccount(creds);
    else _console.warn('[KCC-Alt] No stored credentials for account index ' + index);
  });
}

// ── Settings-panel section ──
export function buildAccountsSection(body: HTMLElement): void {
  // Labels only — fetched via alt-list (never the generic config getter, which
  // no longer exposes the 'accounts' key). Indices line up with the stored array.
  const accounts: AltAccount[] = [];

  const addBtn = document.createElement('div');
  addBtn.className = 'setting settName safety-0 has-button';
  addBtn.innerHTML =
    '<span class="setting-title">Add Account</span>' +
    '<button class="kcc-acc-add-toggle" style="margin-left:auto;padding:4px 14px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:var(--kcc-accent);color:#fff;">+ Add</button>' +
    '<div class="setting-desc-new">Save a Krunker account for quick switching</div>';
  body.appendChild(addBtn);

  const form = document.createElement('div');
  form.className = 'kcc-acc-form';
  form.style.display = 'none';
  form.innerHTML =
    '<input type="text" placeholder="Label (e.g. Main, Alt1)" class="kcc-acc-label">' +
    '<input type="text" placeholder="Krunker Username" class="kcc-acc-user">' +
    '<input type="password" placeholder="Krunker Password" class="kcc-acc-pass">' +
    '<div class="kcc-acc-form-buttons">' +
      '<button class="kcc-acc-cancel">Cancel</button>' +
      '<button class="kcc-acc-save">Save</button>' +
    '</div>';
  body.appendChild(form);

  const labelIn = form.querySelector('.kcc-acc-label') as HTMLInputElement;
  const userIn = form.querySelector('.kcc-acc-user') as HTMLInputElement;
  const passIn = form.querySelector('.kcc-acc-pass') as HTMLInputElement;

  // Stop Krunker's global keydown handler from eating keystrokes in our inputs
  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', (e) => e.stopPropagation());
  });

  addBtn.querySelector('button')!.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? '' : 'none';
  });

  form.querySelector('.kcc-acc-cancel')!.addEventListener('click', () => {
    form.style.display = 'none';
  });

  const listEl = document.createElement('div');
  body.appendChild(listEl);

  function renderList(): void {
    listEl.innerHTML = '';
    if (accounts.length === 0) {
      listEl.innerHTML = '<div class="kcc-acc-empty">No saved accounts</div>';
      return;
    }
    accounts.forEach((acc, i) => {
      const row = document.createElement('div');
      row.className = 'kcc-acc-item';
      row.innerHTML =
        avatarMarkup(acc.label, acc.avatarUrl) +
        '<span class="kcc-acc-item-label">' + escapeHtml(acc.label) + '</span>' +
        '<div class="kcc-acc-item-actions">' +
          '<button class="kcc-acc-switch">Switch</button>' +
          '<button class="kcc-acc-delete">Delete</button>' +
        '</div>';
      wireAvatarFallback(row);
      row.querySelector('.kcc-acc-switch')!.addEventListener('click', () => {
        altSwitch(i);
      });
      row.querySelector('.kcc-acc-delete')!.addEventListener('click', () => {
        showConfirm({
          title: 'Delete Account',
          message: 'Delete the saved account "' + (acc.label || '') + '"?',
          confirmLabel: 'Delete', danger: true,
        }).then((ok) => {
          if (!ok) return;
          altRemove(i).then(() => {
            accounts.splice(i, 1);
            renderList();
          });
        });
      });
      listEl.appendChild(row);
    });
  }
  linkCurrentAccount().then(altList).then((list) => {
    accounts.push(...list);
    renderList();
  });

  form.querySelector('.kcc-acc-save')!.addEventListener('click', () => {
    const label = labelIn.value.trim();
    const user = userIn.value.trim();
    const pass = passIn.value;
    if (!label || !user || !pass) return;
    altSave(label, user, pass).then(() => {
      accounts.push({ label, avatarUrl: null });
      labelIn.value = '';
      userIn.value = '';
      passIn.value = '';
      form.style.display = 'none';
      renderList();
    }).catch((err) => _console.error('[KCC-Alt] Failed to save account:', err));
  });
}

// ── In-game header popup (the "Accounts" button + Alt Manager window) ──
export function initAltManagerButton(): void {
  altList().then(() => {
    const altBtn = document.createElement('div');
    altBtn.id = 'kccAltBtn';
    altBtn.setAttribute('onmouseenter', 'playTick()');

    function showAltManager(): void {
      // Toggle: clicking the header button again closes the open modal.
      if (altModalClose) { altModalClose(); return; }

      const backdrop = document.createElement('div');
      backdrop.id = 'kccAltModal';
      backdrop.className = 'kcc-alt-backdrop';
      const modal = document.createElement('div');
      modal.className = 'kcc-alt-modal';
      backdrop.appendChild(modal);

      function close(): void {
        document.removeEventListener('keydown', onKey, true);
        ipcRenderer.send('keybind-capture', false);
        backdrop.remove();
        altModalClose = null;
      }
      function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      }

      function headerHtml(title: string, withBack: boolean): string {
        return '<div class="kcc-alt-header">' +
          '<div class="kcc-alt-header-left">' +
            (withBack ? '<div class="kcc-alt-back" title="Back">‹</div>' : '') +
            '<h2>' + title + '</h2>' +
          '</div>' +
          '<div class="kcc-alt-close" title="Close">✕</div>' +
        '</div>';
      }

      function renderList(): void {
        linkCurrentAccount().then(altList).then((accs) => {
          let rows = '';
          if (!accs || accs.length === 0) {
            rows = '<div class="kcc-acc-empty">No saved accounts</div>';
          } else {
            accs.forEach((acc, i) => {
              rows +=
                '<div class="kcc-acc-item">' +
                  avatarMarkup(acc.label, acc.avatarUrl) +
                  '<span class="kcc-acc-item-label">' + escapeHtml(acc.label) + '</span>' +
                  '<div class="kcc-acc-item-actions">' +
                    '<button class="kcc-acc-switch" data-idx="' + i + '">Switch</button>' +
                    '<button class="kcc-acc-delete" data-idx="' + i + '">Delete</button>' +
                  '</div>' +
                '</div>';
            });
          }
          modal.innerHTML = headerHtml('Alt Manager', false) +
            '<div class="kcc-alt-body">' +
              '<button class="kcc-acc-add-btn">+ Add Account</button>' +
              rows +
            '</div>';
          wireAvatarFallback(modal);

          (modal.querySelector('.kcc-alt-close') as HTMLElement).addEventListener('click', close);
          (modal.querySelector('.kcc-acc-add-btn') as HTMLElement).addEventListener('click', renderForm);
          modal.querySelectorAll('.kcc-acc-switch').forEach((el) => {
            el.addEventListener('click', () => {
              const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
              if (accs[idx]) { close(); altSwitch(idx); }
            });
          });
          modal.querySelectorAll('.kcc-acc-delete').forEach((el) => {
            el.addEventListener('click', () => {
              const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
              showConfirm({
                title: 'Delete Account',
                message: 'Delete the saved account "' + (accs[idx]?.label || '') + '"?',
                confirmLabel: 'Delete', danger: true,
              }).then((ok) => { if (ok) altRemove(idx).then(() => renderList()); });
            });
          });
        });
      }

      function renderForm(): void {
        modal.innerHTML = headerHtml('Add Account', true) +
          '<div class="kcc-alt-body">' +
            '<div class="kcc-acc-form">' +
              '<input type="text" class="kcc-acc-label" placeholder="Label (e.g. Main, Alt1)">' +
              '<input type="text" class="kcc-acc-user" placeholder="Krunker Username">' +
              '<input type="password" class="kcc-acc-pass" placeholder="Krunker Password">' +
              '<div class="kcc-acc-form-buttons">' +
                '<button class="kcc-acc-cancel">Cancel</button>' +
                '<button class="kcc-acc-save">Add Account</button>' +
              '</div>' +
            '</div>' +
          '</div>';

        (modal.querySelector('.kcc-alt-close') as HTMLElement).addEventListener('click', close);
        (modal.querySelector('.kcc-alt-back') as HTMLElement).addEventListener('click', renderList);
        (modal.querySelector('.kcc-acc-cancel') as HTMLElement).addEventListener('click', renderList);

        const labelIn = modal.querySelector('.kcc-acc-label') as HTMLInputElement;
        const userIn = modal.querySelector('.kcc-acc-user') as HTMLInputElement;
        const passIn = modal.querySelector('.kcc-acc-pass') as HTMLInputElement;
        // Stop Krunker's global keydown handler from eating keystrokes in our inputs
        modal.querySelectorAll('input').forEach((input) => {
          input.addEventListener('keydown', (e) => e.stopPropagation());
        });

        (modal.querySelector('.kcc-acc-save') as HTMLElement).addEventListener('click', () => {
          const label = labelIn.value.trim();
          const user = userIn.value.trim();
          const pass = passIn.value;
          if (!label || !user || !pass) return;
          altSave(label, user, pass).then(() => renderList()).catch((err) => _console.error('[KCC-Alt] Failed to save account:', err));
        });
      }

      document.addEventListener('keydown', onKey, true);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      document.body.appendChild(backdrop);
      ipcRenderer.send('keybind-capture', true);
      altModalClose = close;
      renderList();
    }

    altBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      (window as any).playSelect?.();
      showAltManager();
    });

    function injectAltBtn(): boolean {
      if (document.getElementById('kccAltBtn')) return true;
      const headerRight = document.querySelector('.headerBarRight');
      if (!headerRight) return false;

      // Krunker's header items use Svelte-scoped classes (e.g. svelte-11p80bh).
      // Copy the hash off a sibling so our button picks up the same styles.
      const ref = headerRight.querySelector('.nav-item');
      const scoped = ref
        ? Array.from(ref.classList).find((c) => c.startsWith('svelte-')) || ''
        : '';
      const sfx = scoped ? ' ' + scoped : '';
      altBtn.className = 'nav-item' + sfx;
      altBtn.setAttribute('role', 'button');
      altBtn.setAttribute('tabindex', '0');
      altBtn.innerHTML =
        '<span class="material-icons nav-mat-icon' + sfx + '" style="color:#4fc3f7">people</span>' +
        '<span class="nav-label' + sfx + '">Accounts</span>';

      const sep = document.createElement('div');
      sep.id = 'kccAltBtnSep';
      sep.className = 'verticalSeparator';
      sep.setAttribute('style', 'height:35px;');

      headerRight.insertBefore(altBtn, headerRight.firstChild);
      headerRight.insertBefore(sep, altBtn.nextSibling);
      return true;
    }

    if (!injectAltBtn()) {
      let attempts = 0;
      const poll = setInterval(() => {
        if (injectAltBtn() || ++attempts > 60) clearInterval(poll);
      }, 500);
    }
  });
}
