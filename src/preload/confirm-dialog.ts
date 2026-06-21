// ── Themed confirm dialog ──
// Drop-in replacement for window.confirm(), styled to match the changelog modal.
// Self-contained closed Shadow DOM so it's isolated from Krunker/theme CSS.
// Resolves true on confirm, false on cancel / overlay click / Escape.

import { ipcRenderer } from 'electron';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = 'kcc-confirm-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    const accent = opts.danger ? '#ef5350' : '#42a5f5';
    const accentMid = opts.danger ? '#ff7b73' : '#6ea8fe';
    const confirmBg = opts.danger ? 'rgba(239,83,80,0.15)' : 'rgba(66,165,245,0.15)';
    const confirmBgHover = opts.danger ? 'rgba(239,83,80,0.28)' : 'rgba(66,165,245,0.28)';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes kcc-cf-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes kcc-cf-rise { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        z-index: 99999;
        display: flex; justify-content: center; align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: rgba(255,255,255,0.9);
        animation: kcc-cf-fade 180ms ease-out;
      }
      .modal {
        position: relative;
        background: #1a1a1a;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        width: min(440px, 90vw);
        display: flex; flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02);
        overflow: hidden;
        animation: kcc-cf-rise 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .modal::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        background: linear-gradient(90deg, ${accent}, ${accentMid} 50%, ${accent});
      }
      .title {
        margin: 0; padding: 20px 24px 0;
        font-size: 1.15rem; font-weight: 600; color: #fff; letter-spacing: -0.01em;
      }
      .body {
        padding: 12px 24px 22px; line-height: 1.55; font-size: 0.9rem;
        color: rgba(255,255,255,0.8);
      }
      .footer { display: flex; justify-content: flex-end; gap: 10px; padding: 0 24px 22px; }
      .btn {
        font-family: inherit; font-size: 0.85rem; font-weight: 600;
        padding: 9px 18px; border-radius: 8px; cursor: pointer;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.85);
        transition: all 120ms ease;
      }
      .btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.2); }
      .btn:focus-visible { outline: 2px solid ${accentMid}; outline-offset: 2px; }
      .btn.confirm { border-color: ${accent}; color: #fff; background: ${confirmBg}; }
      .btn.confirm:hover { background: ${confirmBgHover}; border-color: ${accentMid}; }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const titleEl = document.createElement('h2');
    titleEl.className = 'title';
    titleEl.textContent = opts.title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'body';
    bodyEl.textContent = opts.message;

    const footer = document.createElement('div');
    footer.className = 'footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn cancel';
    cancelBtn.textContent = opts.cancelLabel || 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn confirm';
    confirmBtn.textContent = opts.confirmLabel || 'Confirm';

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(titleEl);
    modal.appendChild(bodyEl);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    shadow.appendChild(style);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    // For destructive actions the safe choice (Cancel) is the default, so Enter
    // and the initial focus ring land there instead of on the red confirm.
    const defaultBtn = opts.danger ? cancelBtn : confirmBtn;

    let settled = false;
    function close(result: boolean): void {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      ipcRenderer.send('keybind-capture', false);
      host.remove();
      resolve(result);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); defaultBtn.click(); }
    }

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);

    // Suppress game keybinds (F5 reload, etc.) while the dialog is open.
    ipcRenderer.send('keybind-capture', true);
    defaultBtn.focus();
  });
}
