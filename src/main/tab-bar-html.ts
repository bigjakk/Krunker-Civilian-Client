// ── Inline HTML for the tab bar WebContentsView ──
// Rendered as a data URL. Communicates with TabManager via ipcRenderer.

import { THEME_CSS } from './client-ui';

export const TAB_BAR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${THEME_CSS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--kpc-surface-dialog);
    color: var(--kpc-text-primary);
    height: 40px;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    user-select: none;
    -webkit-app-region: no-drag;
  }

  /* ── Shared pill style for Game btn, tabs, and New Tab btn ── */
  .bar-pill {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    border: 1px solid var(--kpc-toggle-off);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.12s, border-color 0.12s;
    background: var(--kpc-surface-card);
    color: var(--kpc-text-secondary);
  }
  .bar-pill:hover {
    background: var(--kpc-surface-input);
    border-color: rgba(255,255,255,0.2);
  }

  /* ── Game button (green accent) ── */
  #gameBtn {
    background: rgba(76, 175, 80, 0.12);
    color: var(--kpc-green);
    border-color: rgba(76, 175, 80, 0.5);
    font-weight: 600;
  }
  #gameBtn:hover {
    background: rgba(76, 175, 80, 0.25);
    border-color: var(--kpc-green);
  }

  /* ── Tab strip ── */
  #tabStrip {
    flex: 1;
    display: flex;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: center;
    height: 100%;
    padding: 4px 0;
    scrollbar-width: none;
  }
  #tabStrip::-webkit-scrollbar { display: none; }

  /* ── Tab pills ── */
  .tab {
    position: relative;
    gap: 6px;
    max-width: 200px;
    min-width: 60px;
    height: 28px;
  }
  .tab.dragging {
    opacity: 0.4;
  }
  .tab.drop-before::before {
    content: '';
    position: absolute;
    left: -3px;
    top: 2px;
    bottom: 2px;
    width: 2px;
    background: var(--kpc-green);
    border-radius: 1px;
  }
  .tab.drop-after::after {
    content: '';
    position: absolute;
    right: -3px;
    top: 2px;
    bottom: 2px;
    width: 2px;
    background: var(--kpc-green);
    border-radius: 1px;
  }
  .tab.active {
    background: rgba(76, 175, 80, 0.12);
    border-color: rgba(76, 175, 80, 0.5);
    color: var(--kpc-text-primary);
  }
  .tab.active:hover {
    background: rgba(76, 175, 80, 0.2);
    border-color: var(--kpc-green);
  }

  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--kpc-border-medium);
    border-top-color: var(--kpc-green);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
    display: none;
  }
  .tab.loading .tab-spinner { display: block; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .tab-close {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    line-height: 15px;
    text-align: center;
    border-radius: 3px;
    font-size: 13px;
    color: var(--kpc-text-dim);
    transition: background 0.1s, color 0.1s;
  }
  .tab-close:hover {
    background: var(--kpc-toggle-off);
    color: #fff;
  }

  /* ── New Tab button ── */
  #newTabBtn {
    width: 28px;
    height: 28px;
    justify-content: center;
    font-size: 16px;
    font-weight: 400;
    color: var(--kpc-text-faint);
    padding: 0;
    border-style: dashed;
  }
  #newTabBtn:hover {
    color: var(--kpc-text-primary);
  }
</style>
</head>
<body>
  <button id="gameBtn" class="bar-pill">Game</button>
  <div id="tabStrip"></div>
  <button id="newTabBtn" class="bar-pill" title="New Tab (Ctrl+T)">+</button>
<script>
  const { ipcRenderer } = require('electron');
  const strip = document.getElementById('tabStrip');

  document.getElementById('gameBtn').addEventListener('click', () => {
    ipcRenderer.send('tab-back-to-game');
  });

  document.getElementById('newTabBtn').addEventListener('click', () => {
    ipcRenderer.send('tab-new');
  });

  /* ── Drag state ── */
  let dragId = null;
  let dragStartX = 0;
  let dragging = false;
  const DRAG_THRESHOLD = 5;

  function clearDropIndicators() {
    strip.querySelectorAll('.drop-before,.drop-after').forEach(
      el => el.classList.remove('drop-before', 'drop-after')
    );
  }

  function getDropTarget(clientX) {
    const tabs = Array.from(strip.querySelectorAll('.tab'));
    for (const tab of tabs) {
      if (Number(tab.dataset.id) === dragId) continue;
      const r = tab.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (clientX < mid) return { id: Number(tab.dataset.id), side: 'before', el: tab };
    }
    const last = tabs[tabs.length - 1];
    if (last && Number(last.dataset.id) !== dragId) {
      return { id: Number(last.dataset.id), side: 'after', el: last };
    }
    return null;
  }

  document.addEventListener('mousemove', (e) => {
    if (dragId === null) return;
    if (!dragging && Math.abs(e.clientX - dragStartX) >= DRAG_THRESHOLD) {
      dragging = true;
      const el = strip.querySelector('.tab[data-id="' + dragId + '"]');
      if (el) el.classList.add('dragging');
    }
    if (!dragging) return;
    clearDropIndicators();
    const target = getDropTarget(e.clientX);
    if (target) target.el.classList.add(target.side === 'before' ? 'drop-before' : 'drop-after');
  });

  document.addEventListener('mouseup', (e) => {
    if (dragId === null) return;
    const wasDragging = dragging;
    const srcId = dragId;
    clearDropIndicators();
    const dragEl = strip.querySelector('.tab.dragging');
    if (dragEl) dragEl.classList.remove('dragging');
    dragId = null;
    dragging = false;

    if (wasDragging) {
      const target = getDropTarget(e.clientX);
      if (target) {
        ipcRenderer.send('tab-reorder', srcId, target.id, target.side);
      }
    }
  });

  ipcRenderer.on('tabs-update', (_e, tabs) => {
    strip.innerHTML = '';
    for (const t of tabs) {
      const el = document.createElement('div');
      el.className = 'bar-pill tab' + (t.active ? ' active' : '') + (t.loading ? ' loading' : '');
      el.dataset.id = String(t.id);

      const spinner = document.createElement('div');
      spinner.className = 'tab-spinner';
      el.appendChild(spinner);

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = t.title || 'Loading...';
      title.title = t.title || '';
      el.appendChild(title);

      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '\\u00d7';
      close.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ipcRenderer.send('tab-close', t.id);
      });
      el.appendChild(close);

      el.addEventListener('mousedown', (ev) => {
        if (ev.target.classList.contains('tab-close')) return;
        dragId = t.id;
        dragStartX = ev.clientX;
        dragging = false;
      });

      el.addEventListener('click', () => {
        if (!dragging) ipcRenderer.send('tab-switch', t.id);
      });

      strip.appendChild(el);
    }

    const activeEl = strip.querySelector('.tab.active');
    if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
</script>
</body>
</html>`;

export const TAB_BAR_DATA_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(TAB_BAR_HTML);
