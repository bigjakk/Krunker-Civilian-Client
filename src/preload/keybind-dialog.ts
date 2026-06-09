// ── Keybind capture dialog (Crankshaft-style) ──
// A reusable modal that captures the next key (or key+modifiers) the user
// presses and resolves it as a Keybind. `simple` mode captures a single key
// with no modifiers — used for the keystroke-overlay aux keys.

import { ipcRenderer } from 'electron';
import type { Keybind } from '../main/config';

export function keybindDisplayString(bind: Keybind): string {
  return (bind.shift ? 'Shift+' : '') + (bind.ctrl ? 'Ctrl+' : '') + (bind.alt ? 'Alt+' : '') + bind.key.toUpperCase();
}

let capturingKeybind: { resolve: (bind: Keybind) => void; simple: boolean } | null = null;

const kbOverlay = document.createElement('div');
kbOverlay.className = 'kcc-keybind-overlay';
const kbDialog = document.createElement('div');
kbDialog.className = 'kcc-keybind-dialog';
const kbTitle = document.createElement('div');
kbTitle.className = 'kcc-keybind-dialog-title';
const kbSub = document.createElement('div');
kbSub.className = 'kcc-keybind-dialog-sub';
kbSub.innerHTML = 'Press any key. Press <code>Shift+Escape</code> to cancel.';
const kbModifiers = document.createElement('div');
kbModifiers.className = 'kcc-keybind-dialog-modifiers';
const kbShift = document.createElement('div');
kbShift.className = 'kcc-keybind-modifier';
kbShift.textContent = 'Shift';
const kbCtrl = document.createElement('div');
kbCtrl.className = 'kcc-keybind-modifier';
kbCtrl.textContent = 'Control';
const kbAlt = document.createElement('div');
kbAlt.className = 'kcc-keybind-modifier';
kbAlt.textContent = 'Alt';
const kbCancel = document.createElement('div');
kbCancel.className = 'kcc-keybind-dialog-cancel';
kbCancel.textContent = 'Cancel';
kbCancel.addEventListener('click', dismissKeybindDialog);

kbModifiers.appendChild(kbShift);
kbModifiers.appendChild(kbCtrl);
kbModifiers.appendChild(kbAlt);
kbDialog.appendChild(kbCancel);
kbDialog.appendChild(kbTitle);
kbDialog.appendChild(kbSub);
kbDialog.appendChild(kbModifiers);
kbOverlay.appendChild(kbDialog);

function dismissKeybindDialog(): void {
  kbShift.classList.remove('active');
  kbCtrl.classList.remove('active');
  kbAlt.classList.remove('active');
  document.removeEventListener('keydown', kbKeydownHandler, true);
  document.removeEventListener('keyup', kbKeyupHandler, true);
  if (kbOverlay.parentNode) kbOverlay.remove();
  capturingKeybind = null;
  ipcRenderer.send('keybind-capture', false);
}

function kbKeydownHandler(event: KeyboardEvent): void {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (capturingKeybind?.simple) return;
  if (event.key === 'Control') kbCtrl.classList.add('active');
  else if (event.key === 'Shift') kbShift.classList.add('active');
  else if (event.key === 'Alt') kbAlt.classList.add('active');
}

function kbKeyupHandler(event: KeyboardEvent): void {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (!capturingKeybind) return;

  if (event.key === 'Escape' && event.shiftKey) {
    dismissKeybindDialog();
    return;
  }

  const isModifier = event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt';
  if (capturingKeybind.simple) {
    // Single-key picker: ignore modifier presses entirely, never capture them
    if (isModifier) return;
    capturingKeybind.resolve({ key: event.key, ctrl: false, shift: false, alt: false });
    dismissKeybindDialog();
    return;
  }

  if (isModifier) {
    // Modifier-only release returns the modifier as the bound key (full keybind mode)
    capturingKeybind.resolve({ key: event.key, ctrl: false, shift: false, alt: false });
    dismissKeybindDialog();
    return;
  }

  capturingKeybind.resolve({
    key: event.key,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  });
  dismissKeybindDialog();
}

export function openKeybindDialog(title: string, opts?: { simple?: boolean }): Promise<Keybind> {
  const simple = !!opts?.simple;
  return new Promise((resolve) => {
    capturingKeybind = { resolve, simple };
    kbTitle.textContent = (simple ? 'Set Key: ' : 'Edit Keybind: ') + title;
    kbSub.innerHTML = simple
      ? 'Press any key. Press <code>Shift+Escape</code> to cancel.'
      : 'Press any key. Press <code>Shift+Escape</code> to cancel.';
    kbModifiers.style.display = simple ? 'none' : '';
    kbShift.classList.remove('active');
    kbCtrl.classList.remove('active');
    kbAlt.classList.remove('active');
    ipcRenderer.send('keybind-capture', true);
    document.addEventListener('keydown', kbKeydownHandler, true);
    document.addEventListener('keyup', kbKeyupHandler, true);
    document.body.appendChild(kbOverlay);
  });
}
