// ── HUD move mode ── the HUD is hidden on the menu, so editing shows it in place of the menu and makes our overlays draggable

import { ipcRenderer } from 'electron';
import { showToast } from './utils';

export type HudPos = { x: number; y: number };

export interface HudOwner {
  open?(): void;
  close?(): void;
  grab?(el: HTMLElement): void;
  move?(el: HTMLElement, pos: HudPos): void;
  drop?(el: HTMLElement, pos: HudPos | null): void;
  reset?(el: HTMLElement): void;
}

export const HUD_EDIT_CLASS = 'kcc-hud-editing';

const CSS = `
html.${HUD_EDIT_CLASS} #inGameUI { display: block !important; }
html.${HUD_EDIT_CLASS} #menuHolder { display: none !important; }
html.${HUD_EDIT_CLASS} #instructionHolder { visibility: hidden !important; }
html.${HUD_EDIT_CLASS} [data-kcc-hud] { pointer-events: auto; cursor: move; outline: 2px dashed rgba(255, 255, 255, 0.7); outline-offset: 4px; }
#kcc-hud-dim { position: absolute; inset: 0; z-index: 9; background: rgba(0, 0, 0, 0.3); pointer-events: none; }
#kcc-hud-hint {
  position: absolute; left: 50%; top: 14%; transform: translateX(-50%); z-index: 2147483646;
  display: flex; align-items: center; gap: 24px; padding: 14px 28px; border-radius: 8px;
  background: rgba(0, 0, 0, 0.8); color: #fff; font-size: 26px; white-space: nowrap; pointer-events: none;
}
#kcc-hud-done { padding: 8px 24px; border-radius: 6px; background: #ffc107; color: #000; cursor: pointer; pointer-events: auto; }
`;

const EDIT_MOUSE_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;

const owners = new Map<string, HudOwner>();
let positions: Record<string, HudPos> = {};
let editing = false;
let editorEls: HTMLElement[] = [];
let endDrag: (() => void) | null = null;

const clampPct = (v: number): number => Math.min(100, Math.max(0, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function registerHudOwner(key: string, owner: HudOwner): void {
  owners.set(key, owner);
}

export function initHudPositions(raw: unknown): void {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, HudPos>;
  positions = Object.fromEntries(Object.entries(saved)
    .filter(([, p]) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map(([key, p]) => [key, { x: clampPct(p.x), y: clampPct(p.y) }]));
}

function savePos(key: string, pos: HudPos | null): void {
  if (pos) positions[key] = pos;
  else delete positions[key];
  ipcRenderer.invoke('set-config', 'hudPositions', positions);
}

// fixed, not absolute, so it escapes positioned panels like #topRight: #uiBase fills the viewport, and contains it once Krunker scales the UI
function applyHudPos(el: HTMLElement, pos: HudPos | null): void {
  el.style.position = pos ? 'fixed' : '';
  el.style.left = pos ? pos.x + '%' : '';
  el.style.top = pos ? pos.y + '%' : '';
  el.style.bottom = pos ? 'auto' : '';
  el.style.transform = pos ? 'translate(-50%, -50%)' : '';
}

export function makeMovable(el: HTMLElement, key: string): void {
  el.dataset.kccHud = key;
  applyHudPos(el, positions[key] ?? null);
}

function startDrag(e: MouseEvent, el: HTMLElement): void {
  endDrag?.();
  const key = el.dataset.kccHud!;
  const owner = owners.get(key);
  const base = document.getElementById('uiBase')!.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const offX = e.clientX - (rect.left + rect.width / 2);
  const offY = e.clientY - (rect.top + rect.height / 2);
  const halfX = rect.width / 2 / base.width * 100;
  const halfY = rect.height / 2 / base.height * 100;
  const fit = (v: number, half: number): number => round2(Math.min(100 - half, Math.max(half, v)));
  let pos: HudPos | null = null;
  owner?.grab?.(el);
  const move = (ev: MouseEvent): void => {
    // The mouseup is lost if focus leaves mid-drag (Alt-Tab with the button held)
    if (!(ev.buttons & 1)) return up();
    pos = {
      x: fit((ev.clientX - offX - base.left) / base.width * 100, halfX),
      y: fit((ev.clientY - offY - base.top) / base.height * 100, halfY),
    };
    if (owner?.move) owner.move(el, pos);
    else applyHudPos(el, pos);
  };
  const up = (): void => {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    endDrag = null;
    if (owner?.drop) owner.drop(el, pos);
    else if (pos) savePos(key, pos);
  };
  endDrag = up;
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
}

function resetEl(el: HTMLElement): void {
  const key = el.dataset.kccHud!;
  const owner = owners.get(key);
  if (owner?.reset) {
    owner.reset(el);
  } else {
    savePos(key, null);
    applyHudPos(el, null);
  }
}

// Every press is swallowed while editing so none reaches Krunker's click-to-play
function onEditMouse(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  const target = e.target as Element | null;
  if (target?.closest?.('#kcc-hud-done')) {
    if (e.type === 'click') closeHudEditor(true);
    return;
  }
  const el = target?.closest?.('[data-kcc-hud]') as HTMLElement | null;
  if (!el || e.type !== 'mousedown' || e.button !== 0) return;
  // The second press rather than dblclick: Chromium fires no dblclick once a re-render has replaced the pressed element
  if (e.detail === 2) resetEl(el);
  else startDrag(e, el);
}

function onEditKey(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') closeHudEditor(true);
}

function onEditLock(): void {
  if (document.pointerLockElement) closeHudEditor(false);
}

function closeHudEditor(reopenSettings: boolean): void {
  if (!editing) return;
  endDrag?.();
  editing = false;
  for (const type of EDIT_MOUSE_EVENTS) document.removeEventListener(type, onEditMouse, true);
  document.removeEventListener('keydown', onEditKey, true);
  document.removeEventListener('pointerlockchange', onEditLock);
  for (const el of editorEls) el.remove();
  editorEls = [];
  document.documentElement.classList.remove(HUD_EDIT_CLASS);
  for (const owner of owners.values()) owner.close?.();
  if (reopenSettings) (window as any).showWindow?.(1);
}

export function openHudEditor(): void {
  const base = document.getElementById('uiBase');
  if (editing || !base) return;
  for (const owner of owners.values()) owner.open?.();
  if (!document.querySelector('[data-kcc-hud]')) {
    for (const owner of owners.values()) owner.close?.();
    showToast('Nothing to move: turn on an overlay first');
    return;
  }
  (window as any).closWind?.();
  editing = true;
  document.documentElement.classList.add(HUD_EDIT_CLASS);
  const style = document.createElement('style');
  style.textContent = CSS;
  const dim = document.createElement('div');
  dim.id = 'kcc-hud-dim';
  const hint = document.createElement('div');
  hint.id = 'kcc-hud-hint';
  hint.innerHTML = '<span>Drag to move · Double-click to reset · Esc to finish</span><span id="kcc-hud-done">Done</span>';
  document.head.appendChild(style);
  base.append(dim, hint);
  editorEls = [style, dim, hint];
  for (const type of EDIT_MOUSE_EVENTS) document.addEventListener(type, onEditMouse, true);
  document.addEventListener('keydown', onEditKey, true);
  document.addEventListener('pointerlockchange', onEditLock);
}
