// ── Menu state reporting (main applies the menu FPS cap from it) ──

import { ipcRenderer } from 'electron';

export function reportMenuShowing(): void {
  const uiBase = document.getElementById('uiBase');
  if (!uiBase) return;
  let showing: boolean | null = null;
  const report = (): void => {
    const now = uiBase.classList.contains('onMenu');
    if (now === showing) return;
    showing = now;
    ipcRenderer.send('menu-showing', now);
  };
  new MutationObserver(report).observe(uiBase, { attributes: true, attributeFilter: ['class'] });
  report();
}
