// ── Alt Manager ──
// Saved-account quick switching: the credential login flow, the shared IPC data
// operations, the settings-panel section, and the in-game header popup.

import { ipcRenderer } from 'electron';
import { escapeHtml } from './utils';

function switchToAccount(account: { username: string; password: string }): void {
  const w = window as any;
  if (typeof w.loginOrRegister !== 'function') return;

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
function altList(): Promise<{ label: string }[]> {
  return ipcRenderer.invoke('alt-list').then((list: { label: string }[] | null) => list || []);
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
  });
}

// ── Settings-panel section ──
export function buildAccountsSection(body: HTMLElement): void {
  // Labels only — fetched via alt-list (never the generic config getter, which
  // no longer exposes the 'accounts' key). Indices line up with the stored array.
  const accounts: { label: string }[] = [];

  const addBtn = document.createElement('div');
  addBtn.className = 'setting settName safety-0 has-button';
  addBtn.innerHTML =
    '<span class="setting-title">Add Account</span>' +
    '<button class="kcc-acc-save" style="margin-left:auto;padding:4px 14px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:var(--kcc-accent);color:#fff;">+ Add</button>' +
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
      '<button class="kcc-acc-save">Save</button>' +
      '<button class="kcc-acc-cancel">Cancel</button>' +
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
        '<div class="kcc-acc-item-info">' +
          '<span class="kcc-acc-item-label">' + escapeHtml(acc.label) + '</span>' +
        '</div>' +
        '<div class="kcc-acc-item-actions">' +
          '<button class="kcc-acc-switch">Switch</button>' +
          '<button class="kcc-acc-delete">Delete</button>' +
        '</div>';
      row.querySelector('.kcc-acc-switch')!.addEventListener('click', () => {
        altSwitch(i);
      });
      row.querySelector('.kcc-acc-delete')!.addEventListener('click', () => {
        altRemove(i).then(() => {
          accounts.splice(i, 1);
          renderList();
        });
      });
      listEl.appendChild(row);
    });
  }
  altList().then((list) => {
    accounts.push(...list);
    renderList();
  });

  form.querySelector('.kcc-acc-save')!.addEventListener('click', () => {
    const label = labelIn.value.trim();
    const user = userIn.value.trim();
    const pass = passIn.value;
    if (!label || !user || !pass) return;
    altSave(label, user, pass).then(() => {
      accounts.push({ label });
      labelIn.value = '';
      userIn.value = '';
      passIn.value = '';
      form.style.display = 'none';
      renderList();
    });
  });
}

// ── In-game header popup (the "Accounts" button + Alt Manager window) ──
export function initAltManagerButton(): void {
  altList().then(() => {
    const altBtn = document.createElement('div');
    altBtn.id = 'kccAltBtn';
    altBtn.setAttribute('onmouseenter', 'playTick()');

    function showAltManager(): void {
      const windowHolder = document.getElementById('windowHolder') as HTMLElement;
      const menuWindow = document.getElementById('menuWindow') as HTMLElement;
      const windowHeader = document.getElementById('windowHeader') as HTMLElement;
      if (!windowHolder || !menuWindow || !windowHeader) return;

      if (windowHolder.style.display !== 'none' && windowHeader.innerText === 'Alt Manager') {
        windowHolder.style.display = 'none';
        return;
      }

      windowHolder.className = 'popupWin';
      windowHolder.style.display = 'block';
      menuWindow.classList.value = 'dark';
      menuWindow.style.cssText = 'width:800px;max-height:calc(100% - 330px);overflow-y:auto;top:50%;transform:translate(-50%,-50%);';
      windowHeader.innerText = 'Alt Manager';

      function renderAccountList(): void {
        altList().then((accs) => {
          let html =
            '<div style="font-size:30px;text-align:center;margin:3px;font-weight:700;color:#fff;">Alt Manager</div>' +
            '<hr style="color:rgba(28,28,28,.5);">' +
            '<div class="button buttonPI lgn" id="kccAltAddBtn" style="text-align:center;width:98%;margin:3px;padding-top:5px;padding-bottom:13px;">Add Account</div>' +
            '<div class="amHolder" style="display:flex;flex-direction:column;justify-content:center;">';

          if (!accs || accs.length === 0) {
            html += '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px 0;font-size:18px;">No saved accounts</div>';
          } else {
            accs.forEach((acc, i) => {
              html +=
                '<div class="amAccName" style="display:flex;justify-content:flex-end;align-items:center;padding:4px 0;">' +
                  '<span style="margin-right:auto;color:#fff;font-size:18px;">' + escapeHtml(acc.label) + '</span>' +
                  '<div class="button buttonG lgn kcc-alt-login" data-idx="' + i + '" style="width:70px;margin-right:0;padding-top:3px;padding-bottom:15px;transform:scale(0.75);">' +
                    '<span class="material-icons" style="vertical-align:bottom;color:#fff;font-size:30px;margin-bottom:-1px;">login</span>' +
                  '</div>' +
                  '<div class="verticalSeparator" style="height:35px;background:rgba(28,28,28,.3);"></div>' +
                  '<div class="button buttonR lgn kcc-alt-del" data-idx="' + i + '" style="width:70px;margin-right:0;padding-top:3px;padding-bottom:15px;transform:scale(0.75);">' +
                    '<span class="material-icons" style="vertical-align:bottom;color:#fff;font-size:30px;margin-bottom:-1px;">delete</span>' +
                  '</div>' +
                '</div>';
            });
          }
          html += '</div>';
          menuWindow.innerHTML = html;

          const addBtn = document.getElementById('kccAltAddBtn');
          if (addBtn) addBtn.addEventListener('click', showAddForm);

          menuWindow.querySelectorAll('.kcc-alt-login').forEach((el) => {
            el.addEventListener('click', () => {
              const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
              if (accs[idx]) {
                windowHolder.style.display = 'none';
                altSwitch(idx);
              }
            });
          });

          menuWindow.querySelectorAll('.kcc-alt-del').forEach((el) => {
            el.addEventListener('click', () => {
              const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
              if (confirm('Delete account "' + (accs[idx]?.label || '') + '"?')) {
                altRemove(idx).then(() => renderAccountList());
              }
            });
          });
        });
      }

      function showAddForm(): void {
        menuWindow.innerHTML =
          '<div class="setBodH" style="padding:20px;">' +
            '<div style="font-size:25px;text-align:center;margin-bottom:15px;color:#fff;">Add Account</div>' +
            '<input class="accountInput" id="kccAltLabel" type="text" placeholder="Label (e.g. Main, Alt1)" style="width:100%;margin-bottom:8px;">' +
            '<input class="accountInput" id="kccAltUser" type="text" placeholder="Krunker Username" style="width:100%;margin-bottom:8px;">' +
            '<input class="accountInput" id="kccAltPass" type="password" placeholder="Krunker Password" style="width:100%;margin-bottom:15px;">' +
            '<div style="display:flex;gap:8px;">' +
              '<div class="button buttonG lgn" id="kccAltSaveBtn" style="flex:1;text-align:center;padding-top:5px;padding-bottom:13px;">Add Account</div>' +
              '<div class="button buttonR lgn" id="kccAltBackBtn" style="width:120px;text-align:center;padding-top:5px;padding-bottom:13px;">Back</div>' +
            '</div>' +
          '</div>';

        // Stop Krunker's global keydown handler from eating keystrokes in our inputs
        menuWindow.querySelectorAll('input.accountInput').forEach((input) => {
          input.addEventListener('keydown', (e) => e.stopPropagation());
        });

        document.getElementById('kccAltBackBtn')!.addEventListener('click', renderAccountList);
        document.getElementById('kccAltSaveBtn')!.addEventListener('click', () => {
          const label = (document.getElementById('kccAltLabel') as HTMLInputElement).value.trim();
          const user = (document.getElementById('kccAltUser') as HTMLInputElement).value.trim();
          const pass = (document.getElementById('kccAltPass') as HTMLInputElement).value;
          if (!label || !user || !pass) return;
          altSave(label, user, pass).then(() => renderAccountList());
        });
      }

      renderAccountList();
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
