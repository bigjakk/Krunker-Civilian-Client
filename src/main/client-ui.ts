// ── Shared CSS theme variables (used by both main page and tab bar) ──
export const THEME_CSS = `
:root {
  /* ── Surfaces ── */
  --kcc-surface-card: rgba(255,255,255,0.04);
  --kcc-surface-input: rgba(255,255,255,0.08);
  --kcc-surface-hover: rgba(255,255,255,0.1);
  --kcc-surface-hover-strong: rgba(255,255,255,0.15);
  --kcc-surface-dialog: #1a1a1a;
  --kcc-surface-raised: #212121;

  /* ── Text ── */
  --kcc-text-primary: rgba(255,255,255,0.9);
  --kcc-text-secondary: rgba(255,255,255,0.7);
  --kcc-text-muted: rgba(255,255,255,0.5);
  --kcc-text-faint: rgba(255,255,255,0.35);
  --kcc-text-dim: rgba(255,255,255,0.3);
  --kcc-text-info: #888;

  /* ── Borders ── */
  --kcc-border-subtle: rgba(255,255,255,0.06);
  --kcc-border-default: rgba(255,255,255,0.1);
  --kcc-border-medium: rgba(255,255,255,0.15);
  --kcc-border-focus: rgba(255,255,255,0.35);

  /* ── Accents ── */
  --kcc-accent: #2b82f6;
  --kcc-accent-hover: #4f97ff;
  --kcc-accent-soft: rgba(43,130,246,0.16);
  --kcc-green: #4CAF50;
  --kcc-green-hover: #66bb6a;
  --kcc-red: #ef5350;
  --kcc-red-hover: #e57373;
  --kcc-blue: #42a5f5;
  --kcc-blue-hover: #64b5f6;
  --kcc-orange: #ff9800;
  --kcc-orange-hover: #ffb74d;
  --kcc-yellow: #ffc107;
  --kcc-magenta: #fc03ec;

  /* ── Controls ── */
  --kcc-toggle-off: rgba(255,255,255,0.12);

  /* ── Modal / dialog surfaces (shared across popups) ── */
  --kcc-modal-bg: #1a1a1a;
  --kcc-modal-border: 1px solid rgba(255,255,255,0.08);
  --kcc-modal-radius: 14px;
  --kcc-modal-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02);
  --kcc-overlay-bg: rgba(0,0,0,0.6);
  --kcc-overlay-blur: 6px;

  /* ── Z-index layers ── */
  --kcc-z-notification: 100000;
  --kcc-z-overlay: 10000000;
  --kcc-z-popup: 10000001;
}
`;

// ── Injected CSS for client settings in Krunker's settings panel ──
export const CLIENT_SETTINGS_CSS = `
${THEME_CSS}
/* -- Self-contained client settings design system (kcc-* namespace) -- */
/* Deliberately avoids Krunker's own control classes so a Krunker restyle cannot
   leak into our settings. */

.kcc-settings {
  /* Krunker's UI font so the menu reads as native (matches the matchmaker feed). */
  font-family: 'GameFont', sans-serif;
  color: var(--kcc-text-secondary);
  font-size: 14px;
}

/* -- Header band -- */
.kcc-header {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 6px 16px;
  border-bottom: 1px solid var(--kcc-border-default);
}
.kcc-header-mark {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--kcc-accent);
  color: #fff;
}
.kcc-header-mark .material-icons { font-size: 20px; }
.kcc-header-name {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--kcc-text-primary);
}
.kcc-header-ver { font-size: 11px; color: var(--kcc-text-muted); }

/* -- Shell: category rail + content pane -- */
.kcc-shell { display: flex; align-items: flex-start; }
.kcc-rail {
  flex: none;
  width: 170px;
  padding: 12px 8px;
  border-right: 1px solid var(--kcc-border-default);
}
.kcc-rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  margin-bottom: 1px;
  border-radius: 7px;
  border-left: 2px solid transparent;
  cursor: pointer;
  user-select: none;
  color: var(--kcc-text-secondary);
  transition: background 0.12s, color 0.12s;
}
.kcc-rail-item .material-icons { font-size: 18px; color: var(--kcc-text-muted); }
.kcc-rail-label { font-size: 12.5px; }
.kcc-rail-item:hover { background: var(--kcc-surface-hover); }
.kcc-rail-item.kcc-active { background: var(--kcc-accent-soft); border-left-color: var(--kcc-accent); }
.kcc-rail-item.kcc-active .material-icons { color: var(--kcc-accent); }
.kcc-rail-item.kcc-active .kcc-rail-label { color: var(--kcc-text-primary); }

.kcc-pane { flex: 1; min-width: 0; padding: 4px 4px 8px 18px; }
.kcc-cat-head {
  display: none;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--kcc-text-muted);
  padding: 12px 0 4px;
  margin-top: 8px;
  border-bottom: 1px solid var(--kcc-border-default);
}

/* search mode: hide the rail and stack every category with its heading */
.kcc-settings.kcc-searching .kcc-rail { display: none; }
.kcc-settings.kcc-searching .kcc-pane { padding-left: 4px; }
.kcc-settings.kcc-searching .kcc-cat-head { display: block; }

/* -- Group cards -- */
.kcc-group {
  background: rgba(255,255,255,0.024);
  border: 1px solid var(--kcc-border-subtle);
  border-radius: 10px;
  padding: 2px 6px;
  margin-bottom: 10px;
}
.kcc-group-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--kcc-text-dim);
  padding: 12px 11px 3px;
}
/* search mode: flatten the cards so results read as one plain list */
.kcc-settings.kcc-searching .kcc-group { display: contents; }
.kcc-settings.kcc-searching .kcc-group-label { display: none; }

/* -- Row -- */
.kcc-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 6px 12px 11px;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--kcc-border-subtle);
  border-radius: 8px;
  transition: background 0.12s;
}
.kcc-row:hover { background: rgba(255,255,255,0.035); }
.kcc-row:last-child,
.kcc-group > :last-child > .kcc-row:last-child,
.kcc-group > .kcc-row:has(+ .kcc-us-settings:empty:last-child) { border-bottom: none; }
.kcc-row-main { flex: 1; min-width: 0; }
.kcc-row-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  /* !important so Krunker's own settings text rules can't override the size. */
  font-size: 20px !important;
  font-weight: 700 !important;
  color: var(--kcc-text-primary);
}
.kcc-row-desc {
  font-size: 15px !important;
  letter-spacing: 0.5px;
  line-height: 1.6;
  /* dimmer than --kcc-text-muted, matching the old crankshaft description shade */
  color: rgba(255, 255, 255, 0.4) !important;
  margin-top: 4px;
  max-width: 56ch;
  word-wrap: break-word;
}
.kcc-row-desc a { color: var(--kcc-blue); cursor: pointer; }
.kcc-row-control {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.kcc-row-block { flex-direction: column; align-items: stretch; }
.kcc-row-block .kcc-row-control { margin-top: 6px; }
.kcc-row-info { color: var(--kcc-text-muted); }

/* flagged-row left edge (mirrors the strongest tag) */
.kcc-row.kcc-flag-reload  { border-left-color: var(--kcc-blue); }
.kcc-row.kcc-flag-restart { border-left-color: var(--kcc-orange); }
.kcc-row.kcc-flag-warn    { border-left-color: var(--kcc-yellow); }
.kcc-row.kcc-flag-exp     { border-left-color: #ff8a3d; }
.kcc-row.kcc-flag-danger  { border-left-color: var(--kcc-red); }

/* -- Tags -- */
.kcc-tag {
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.5;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.kcc-tag-reload  { background: rgba(66,165,245,0.16); color: var(--kcc-blue); }
.kcc-tag-restart { background: rgba(255,152,0,0.16);  color: var(--kcc-orange); }
.kcc-tag-warn    { background: rgba(255,193,7,0.16);  color: var(--kcc-yellow); }
.kcc-tag-exp     { background: rgba(255,138,61,0.16); color: #ff9a5a; }
.kcc-tag-danger  { background: rgba(239,83,80,0.16);  color: var(--kcc-red); }

/* -- Toggle -- */
.kcc-toggle {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 23px;
  flex: none;
}
.kcc-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.kcc-toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 23px;
  background: var(--kcc-toggle-off);
  cursor: pointer;
  transition: background 0.15s;
}
.kcc-toggle-track::before {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}
.kcc-toggle input:checked + .kcc-toggle-track { background: var(--kcc-accent); }
.kcc-toggle input:checked + .kcc-toggle-track::before { left: 22px; }
.kcc-toggle input:disabled + .kcc-toggle-track { opacity: 0.5; pointer-events: none; }

/* -- Select + text input -- */
.kcc-select, .kcc-input {
  background: var(--kcc-surface-input);
  border: 1px solid var(--kcc-border-default);
  border-radius: 6px;
  color: var(--kcc-text-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
.kcc-select { cursor: pointer; min-width: 150px; }
.kcc-input { min-width: 240px; }
.kcc-select:hover, .kcc-input:hover { border-color: var(--kcc-border-medium); }
.kcc-select:focus, .kcc-input:focus { border-color: var(--kcc-border-focus); }
.kcc-select option { background: var(--kcc-surface-raised); color: var(--kcc-text-primary); }
.kcc-input::placeholder { color: var(--kcc-text-faint); }

/* -- Number (range + value) -- */
.kcc-num { display: flex; align-items: center; gap: 12px; }
.kcc-range {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 4px;
  border-radius: 3px;
  background: var(--kcc-surface-hover);
  outline: none;
  cursor: pointer;
}
.kcc-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--kcc-blue);
  cursor: pointer;
}
.kcc-num-val {
  width: 58px;
  text-align: center;
  background: var(--kcc-surface-input);
  border: 1px solid var(--kcc-border-default);
  border-radius: 6px;
  color: var(--kcc-text-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 6px 4px;
  outline: none;
}
.kcc-num-val:focus { border-color: var(--kcc-border-focus); }

/* -- Keybind chip -- */
.kcc-keyIcon {
  display: inline-block;
  min-width: 36px;
  text-align: center;
  background: var(--kcc-surface-input);
  border: 1px solid var(--kcc-border-medium);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--kcc-text-secondary);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.kcc-keyIcon:hover { border-color: var(--kcc-border-focus); color: var(--kcc-text-primary); }

/* -- Button -- */
.kcc-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--kcc-surface-input);
  border: 1px solid var(--kcc-border-medium);
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12.5px;
  color: var(--kcc-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.kcc-btn:hover { background: var(--kcc-surface-hover); border-color: var(--kcc-border-focus); color: var(--kcc-text-primary); }
.kcc-btn:active { transform: scale(0.97); }
.kcc-btn .material-icons { font-size: 16px; }

/* -- Multi-select grid -- */
.kcc-multisel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.kcc-clear-btn {
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 5px 12px;
  border-radius: 5px;
  color: var(--kcc-text-muted);
  background: var(--kcc-surface-input);
  border: 1px solid var(--kcc-border-medium);
  white-space: nowrap;
  user-select: none;
}
.kcc-clear-btn:hover { color: #fff; border-color: var(--kcc-border-focus); }
.kcc-multisel {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  width: 100%;
}
.kcc-multisel-has-icons { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
.kcc-opt {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  background: var(--kcc-surface-card);
  border: 1px solid var(--kcc-border-default);
  border-radius: 7px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
}
.kcc-opt:hover { background: var(--kcc-surface-hover); }
.kcc-opt input { display: none; }
.kcc-opt-icon {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
  flex: none;
}
.kcc-opt-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--kcc-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kcc-opt-check {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--kcc-border-focus);
  position: relative;
}
.kcc-opt input:checked ~ .kcc-opt-name { color: var(--kcc-text-primary); }
.kcc-opt input:checked ~ .kcc-opt-check { background: var(--kcc-accent); border-color: var(--kcc-accent); }
.kcc-opt input:checked ~ .kcc-opt-check::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 1px;
  width: 4px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}


/* ── Backup & Reset page ── */
.kcc-manage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}
.kcc-manage-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  background: var(--kcc-surface-card);
  border: 1px solid var(--kcc-border-default);
  border-radius: 8px;
  font-size: 13px;
  color: var(--kcc-text-primary);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
}
.kcc-manage-btn:hover { background: var(--kcc-surface-hover); border-color: var(--kcc-border-focus); }
.kcc-manage-btn:active { transform: scale(0.98); }
.kcc-manage-btn .material-icons { font-size: 17px; color: var(--kcc-text-muted); }
.kcc-dzone-label { color: rgba(239,83,80,0.75); }
.kcc-dzone {
  border: 1px solid rgba(239,83,80,0.3);
  background: rgba(239,83,80,0.05);
  border-radius: 10px;
}
.kcc-drow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 13px;
  border-bottom: 1px solid rgba(239,83,80,0.12);
}
.kcc-drow:last-child { border-bottom: none; }
.kcc-drow-main { flex: 1; min-width: 0; }
.kcc-drow-title { font-size: 16px; color: var(--kcc-text-primary); }
.kcc-drow-desc { font-size: 13px; line-height: 1.4; color: var(--kcc-text-muted); margin-top: 2px; }
.kcc-dbtn {
  flex: none;
  background: transparent;
  color: var(--kcc-red);
  border: 1px solid rgba(239,83,80,0.45);
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.kcc-dbtn:hover { background: rgba(239,83,80,0.12); }

/* floating toasts css that is required */
.kcc-holder-update {
	position: absolute;
	font-size: 1.125rem !important;
	color: rgba(255, 255, 255, 0.7);
	display: block !important;
	top: 20px;
	left: 20px;
	background-color: black;
	padding: 1rem;
	border-radius: 0.5rem;
	width: max-content;
	z-index: 10;
}

/* settings refresh popup */
.refresh-popup {
	height: min-content;
	left: 50%;
	transform: translateX(-50%);
	color: rgba(255,255,255,0.6)
}
.refresh-popup span {
	display: flex;
	align-items: center;
	column-gap: 0.5rem;
	color: rgba(255,255,255,0.6);
}
.refresh-popup,
.refresh-popup span,
.refresh-popup a {
	vertical-align: middle;
	font-size: .8rem;
	line-height: .8rem;
	z-index: 12;
}
.refresh-popup svg { fill: rgba(255,255,255,0.6); }
.refresh-popup code {
    color: white;
    font-size: 1.2rem;
    line-height: 1.2rem;
	font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
    background-color: #232323;
    padding: 0.08rem 0.4rem;
    border-radius: 3px;
    border: 2px solid #333333
}
/* ── Keybind capture dialog ── */
.kcc-keybind-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: var(--kcc-z-overlay);
  background: var(--kcc-overlay-bg);
  backdrop-filter: blur(var(--kcc-overlay-blur));
  -webkit-backdrop-filter: blur(var(--kcc-overlay-blur));
  display: flex;
  align-items: center;
  justify-content: center;
}
.kcc-keybind-dialog {
  background: var(--kcc-modal-bg);
  border: var(--kcc-modal-border);
  border-radius: var(--kcc-modal-radius);
  box-shadow: var(--kcc-modal-shadow);
  padding: 24px 32px;
  min-width: 400px;
  position: relative;
}
.kcc-keybind-dialog-title {
  color: var(--kcc-text-primary);
  font-size: 18px;
  margin-bottom: 6px;
}
.kcc-keybind-dialog-sub {
  color: var(--kcc-text-muted);
  font-size: 13px;
  margin-bottom: 16px;
}
.kcc-keybind-dialog-sub code {
  color: #64b5f6;
}
.kcc-keybind-dialog-modifiers {
  display: flex;
  gap: 8px;
  font-size: 14px;
}
.kcc-keybind-modifier {
  background: var(--kcc-surface-raised);
  color: var(--kcc-text-faint);
  flex: 1;
  text-align: center;
  padding: 10px 0;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
.kcc-keybind-modifier.active {
  background: #1976d2;
  color: #fff;
}
.kcc-keybind-dialog-cancel {
  position: absolute;
  top: 12px;
  right: 16px;
  color: #64b5f6;
  cursor: pointer;
  font-size: 14px;
}
.kcc-keybind-dialog-cancel:hover {
  text-decoration: underline;
}
/* ── Preserved: color input, userscript meta ── */
.kcc-color-input {
  width: 36px;
  height: 28px;
  border: 1px solid var(--kcc-border-default);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.kcc-color-input::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.kcc-color-input::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}
.kcc-us-meta {
  color: var(--kcc-text-dim);
  font-size: 11px;
  margin-top: 2px;
}
.kcc-us-settings {
  padding: 4px 0 4px 20px;
}
#chatList, #chatList * {
  user-select: text !important;
  cursor: text;
}
#chatList.kcc-chat-paused {
  border-left: 2px solid var(--kcc-yellow);
}
/* Dynamic chat clamp so the message list never overlaps menu items injected
   by KCC (e.g. Classic Social). Only applies when chat.ts adds the
   .kcc-chat-clamped class, so Krunker's own clamp wins when ours is unset. */
#chatList.kcc-chat-clamped {
  max-height: var(--kcc-chat-max) !important;
}
`;


// ── Matchmaker popup CSS + settings extras (injected separately) ──
export const MATCHMAKER_SETTINGS_CSS = `
@keyframes matchmakerPopupSlideDown {
  0% { transform: translate(-50%, -500%); }
  100% { transform: translate(-50%, 0%); }
}
.onGame #matchmakerPopupContainer:not(.searching) {
  opacity: 0 !important;
}
#matchmakerPopupContainer {
  position: absolute;
  top: 8em;
  left: 50%;
  z-index: var(--kcc-z-popup);
  box-sizing: border-box;
  width: 32em;
  border-radius: var(--kcc-modal-radius);
  overflow: hidden;
  pointer-events: all;
  background-color: var(--kcc-modal-bg);
  border: var(--kcc-modal-border);
  box-shadow: var(--kcc-modal-shadow);
  display: flex;
  flex-direction: column;
  animation: matchmakerPopupSlideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
#matchmakerPopupTitle {
  font-size: 1.15rem;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.01em;
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
#matchmakerPopupDescription {
  color: var(--kcc-yellow);
  box-sizing: border-box;
  padding: 14px 20px;
  font-size: 0.95rem;
  line-height: 1.5;
}
#matchmakerPopupOptions {
  display: flex;
  padding: 8px 12px 12px;
  gap: 8px;
}
.matchmakerPopupButton {
  text-align: center;
  border: 2px solid;
  box-sizing: border-box;
  color: white;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  background-color: rgba(0,0,0,0.3);
  padding: 8px 20px;
  transition: all 0.1s ease;
}
#matchmakerConfirmButton {
  border-color: var(--kcc-green);
  flex-grow: 1;
}
#matchmakerCancelButton {
  border-color: var(--kcc-red);
}
.matchmakerPopupButton:hover {
  cursor: pointer;
  border-color: white !important;
  transform: scale(0.95);
}
.matchmakerPopupButton:active {
  transform: scale(0.85);
}

/* ── Search phase ── */
#matchmakerPopupContainer.searching {
  background-image: none !important;
  background: rgba(18,18,22,0.5);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  width: 24em;
  padding: 18px 22px;
}
#matchmakerPopupContainer.searching #matchmakerPopupTitle,
#matchmakerPopupContainer.searching #matchmakerPopupDescription,
#matchmakerPopupContainer.searching #matchmakerPopupOptions {
  display: none;
}
#matchmakerPopupContainer:not(.searching) #matchmakerSearchContainer {
  display: none;
}
#matchmakerSearchStatus {
  font-size: 1.4em;
  color: var(--kcc-blue);
  margin-bottom: 0.6em;
  text-align: center;
}
#matchmakerSearchFeed {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  overflow: hidden;
  min-height: 5.6em;
  margin-bottom: 0.6em;
}
@keyframes mmFeedSlideIn {
  from { opacity: 0; transform: translateX(1em); }
  to { opacity: 1; transform: translateX(0); }
}
.mm-feed-entry {
  display: flex;
  gap: 0.8em;
  padding: 0.2em 0.5em;
  font-size: 0.95em;
  font-family: 'GameFont', monospace;
  border-radius: 0.2em;
  animation: mmFeedSlideIn 0.12s ease forwards;
}
.mm-feed-entry.mm-pass { background: rgba(76,175,80,0.1); }
.mm-feed-entry.mm-pass .mm-feed-region { color: var(--kcc-blue); }
.mm-feed-entry.mm-pass .mm-feed-map { color: var(--kcc-text-primary, rgba(255,255,255,0.9)); }
.mm-feed-entry.mm-pass .mm-feed-players { color: var(--kcc-green); }
.mm-feed-entry.mm-fail { background: rgba(255,255,255,0.02); }
.mm-feed-entry.mm-fail .mm-feed-region { color: var(--kcc-text-dim, rgba(255,255,255,0.3)); }
.mm-feed-entry.mm-fail .mm-feed-map { color: var(--kcc-text-muted, rgba(255,255,255,0.5)); }
.mm-feed-entry.mm-fail .mm-feed-players { color: var(--kcc-red); }
.mm-feed-entry:last-child::before {
  content: '\\25B8 ';
  color: var(--kcc-yellow);
}
.mm-feed-region { min-width: 2.5em; font-weight: bold; }
.mm-feed-map { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-feed-players { min-width: 3em; text-align: right; font-weight: 600; }
.mm-feed-icon {
  width: 1.7em;
  height: 1.7em;
  flex: none;
  object-fit: cover;
  border-radius: 0.25em;
  align-self: center;
  background: rgba(255,255,255,0.06);
}
.mm-feed-entry.mm-fail .mm-feed-icon { opacity: 0.45; }
.mm-feed-icon-found {
  width: 2.4em;
  height: 2.4em;
  border-radius: 0.3em;
}
/* Found-lobby reveal: the scroll settles on the match, then it grows into focus */
#matchmakerSearchFeed.mm-feed-found {
  justify-content: center;
}
.mm-feed-entry.mm-feed-landed {
  box-shadow: inset 0 0 0 2px var(--kcc-blue);
}
@keyframes mmFoundGrow {
  0%   { opacity: 0; transform: scale(0.55); }
  65%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
.mm-feed-entry.mm-found {
  font-size: 1.25em;
  justify-content: center;
  gap: 0.7em;
  transform-origin: center;
  animation: mmFoundGrow 0.34s cubic-bezier(0.2, 0.85, 0.3, 1.25) forwards;
}
/* No-match reveal: parallels the found state before falling back to the server browser */
.mm-feed-entry.mm-notfound {
  font-size: 1.2em;
  justify-content: center;
  color: var(--kcc-text-muted, rgba(255,255,255,0.55));
  background: rgba(255,255,255,0.03);
  transform-origin: center;
  animation: mmFoundGrow 0.34s cubic-bezier(0.2, 0.85, 0.3, 1.25) forwards;
}
.mm-feed-entry.mm-notfound::before { content: none; }
#matchmakerSearchStatus.mm-status-fail { color: var(--kcc-red); }
#matchmakerSearchCounter {
  font-size: 0.85em;
  color: var(--kcc-yellow);
  text-align: center;
  margin-bottom: 0.5em;
}
#matchmakerSearchCancel {
  text-align: center;
  border: 0.2em solid var(--kcc-red);
  color: white;
  border-radius: 0.3em;
  font-size: 1.1em;
  background: rgba(0,0,0,0.3);
  padding: 0.2em 1.2em;
  cursor: pointer;
  margin: 0 auto;
  width: fit-content;
  transition: all 0.08s;
}
#matchmakerSearchCancel:hover {
  border-color: white;
  transform: scale(0.95);
}
#matchmakerSearchCancel:active {
  transform: scale(0.85);
}
`;

export const TRANSLATOR_CSS = `
.kcc-translation {
  color: #88ff88;
  font-style: italic;
  margin-left: 8px;
  margin-top: 2px;
  overflow-wrap: anywhere;
}
`;

// ── Alt Manager CSS ──
export const ALT_MANAGER_CSS = `
/* ── Shared account row (settings panel + in-game popup) ── */
.kcc-acc-item {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 2px; border-top: 1px solid rgba(255,255,255,0.06);
}
.kcc-acc-avatar {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(66,165,245,0.15); border: 1px solid rgba(66,165,245,0.3);
  color: #6ea8fe; font-weight: 600; font-size: 14px; overflow: hidden;
}
img.kcc-acc-avatar { object-fit: cover; }
.kcc-acc-item-label {
  flex: 1; min-width: 0; color: #fff; font-size: 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.kcc-acc-item-actions { display: flex; gap: 8px; flex-shrink: 0; }
.kcc-acc-switch, .kcc-acc-delete {
  font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 7px;
  cursor: pointer; font-family: inherit; transition: all 120ms ease;
}
.kcc-acc-switch { border: 1px solid #42a5f5; background: rgba(66,165,245,0.15); color: #fff; }
.kcc-acc-switch:hover { background: rgba(66,165,245,0.28); border-color: #6ea8fe; }
.kcc-acc-delete { border: 1px solid rgba(239,83,80,0.4); background: rgba(255,255,255,0.03); color: #ff7b73; }
.kcc-acc-delete:hover { background: rgba(239,83,80,0.18); border-color: #ff7b73; }
.kcc-acc-empty { color: rgba(255,255,255,0.4); font-size: 13px; text-align: center; padding: 18px 0; }
.kcc-acc-add-toggle {
  padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer;
  font-size: 12px; font-weight: 600; font-family: inherit;
  background: var(--kcc-accent); color: #fff;
}
.kcc-acc-add-toggle:hover { background: var(--kcc-accent-hover); }

/* ── Add Account form (themed inputs) ── */
.kcc-acc-form { display: flex; flex-direction: column; gap: 9px; margin: 10px 0 4px; }
.kcc-acc-form input {
  width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: #fff;
  font-size: 13px; font-family: inherit; outline: none; transition: border-color 120ms ease;
}
.kcc-acc-form input:focus { border-color: #42a5f5; }
.kcc-acc-form input::placeholder { color: rgba(255,255,255,0.3); }
.kcc-acc-form-buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.kcc-acc-form-buttons button {
  font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 8px;
  cursor: pointer; font-family: inherit; transition: all 120ms ease;
}
.kcc-acc-save { border: 1px solid #42a5f5; background: rgba(66,165,245,0.15); color: #fff; }
.kcc-acc-save:hover { background: rgba(66,165,245,0.28); border-color: #6ea8fe; }
.kcc-acc-cancel { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.85); }
.kcc-acc-cancel:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.2); }

/* Full-width "+ Add Account" button (in-game popup) */
.kcc-acc-add-btn {
  width: 100%; font-size: 13px; font-weight: 600; padding: 11px; border-radius: 8px; cursor: pointer;
  border: 1px dashed rgba(66,165,245,0.5); background: rgba(66,165,245,0.08); color: #6ea8fe;
  font-family: inherit; transition: all 120ms ease;
}
.kcc-acc-add-btn:hover { background: rgba(66,165,245,0.15); border-color: #6ea8fe; }

/* ── In-game Alt Manager modal (themed, matches changelog/confirm) ── */
.kcc-alt-backdrop {
  position: fixed; inset: 0; z-index: 99990;
  background: var(--kcc-overlay-bg);
  backdrop-filter: blur(var(--kcc-overlay-blur)); -webkit-backdrop-filter: blur(var(--kcc-overlay-blur));
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: kcc-alt-fade 180ms ease-out;
}
.kcc-alt-modal {
  position: relative; background: var(--kcc-modal-bg); border: var(--kcc-modal-border);
  border-radius: var(--kcc-modal-radius); box-shadow: var(--kcc-modal-shadow);
  width: min(440px, 92vw); max-height: 80vh; overflow: hidden;
  display: flex; flex-direction: column; animation: kcc-alt-rise 220ms cubic-bezier(0.16,1,0.3,1);
}
.kcc-alt-modal::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, #42a5f5, #6ea8fe 50%, #42a5f5);
}
.kcc-alt-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px 14px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.kcc-alt-header h2 { margin: 0; color: #fff; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.kcc-alt-header-left { display: flex; align-items: center; gap: 8px; }
.kcc-alt-back, .kcc-alt-close {
  cursor: pointer; color: rgba(255,255,255,0.5); width: 28px; height: 28px; font-size: 18px;
  display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 120ms ease;
}
.kcc-alt-back:hover, .kcc-alt-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
.kcc-alt-body { padding: 14px 22px 20px; overflow-y: auto; }
.kcc-alt-body::-webkit-scrollbar { width: 8px; }
.kcc-alt-body::-webkit-scrollbar-track { background: transparent; }
.kcc-alt-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.kcc-alt-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
@keyframes kcc-alt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes kcc-alt-rise { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

// ── HP enemy counter CSS ──
export const HP_COUNTER_CSS = `
.kcc-hp-counter .pointVal {
  color: #ff4444; font-size: 15px; font-weight: bold;
}
`;

// ── Battle Pass Claim All CSS ──
export const BP_CLAIM_ALL_CSS = `
#claimAllBtn.disabled { opacity: 0.4; pointer-events: none; }
`;

// ── Rank progress tracker CSS ──
export const RANK_TRACKER_CSS = `
#kcc-elo-tracker { width: 100%; margin: 8px 0; }
.kcc-elo-info-row { display: flex; align-items: center; gap: 8px; }
.kcc-rank-container { display: flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 12px; color: #ccc; }
.kcc-elo-rank-img { width: 20px; height: 20px; }
.kcc-elo-bar-bg { flex: 1; height: 14px; background: rgba(255,255,255,0.1); border-radius: 7px; position: relative; overflow: hidden; }
.kcc-elo-bar-fill { height: 100%; background: linear-gradient(90deg, #388E3C, #4CAF50); border-radius: 7px; transition: width 0.3s; }
.kcc-elo-bar-text { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
#kcc-rank-list-btn { position: absolute; bottom: 8px; right: 8px; cursor: pointer; padding: 6px 14px; border-radius: 6px; font-size: 12px; background: rgba(76,175,80,0.3); color: #4CAF50; border: 1px solid rgba(76,175,80,0.4); z-index: 1; }
#kcc-rank-list-btn:hover { background: rgba(76,175,80,0.5); color: #fff; }
#kcc-rank-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: var(--kcc-overlay-bg); backdrop-filter: blur(var(--kcc-overlay-blur)); -webkit-backdrop-filter: blur(var(--kcc-overlay-blur)); z-index: 9998; display: flex; justify-content: center; align-items: center; }
.kcc-rank-popup { background: var(--kcc-modal-bg); border: var(--kcc-modal-border); border-radius: var(--kcc-modal-radius); padding: 20px 24px; min-width: 340px; max-width: 500px; box-shadow: var(--kcc-modal-shadow); }
.kcc-rank-popup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.kcc-rank-popup-header h2 { margin: 0; color: #fff; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.kcc-rank-popup-close { cursor: pointer; color: rgba(255,255,255,0.5); font-size: 14px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 120ms ease; }
.kcc-rank-popup-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
.kcc-rank-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 60vh; overflow-y: auto; }
.kcc-rank-grid::-webkit-scrollbar { width: 8px; }
.kcc-rank-grid::-webkit-scrollbar-track { background: transparent; }
.kcc-rank-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.kcc-rank-grid::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
.kcc-rank-grid-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(255,255,255,0.05); border-radius: 6px; }
.kcc-rank-grid-item img { width: 28px; height: 28px; }
.kcc-rank-name { font-size: 13px; font-weight: 600; }
.kcc-rank-elo { font-size: 11px; color: #888; }

/* Ranked queue button in ranked menu footer */
#kcc-ranked-queue-btn {
  background-color: #5ce05a;
  color: #fff;
  border: none;
  border-radius: 9px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}
#kcc-ranked-queue-btn:hover { background-color: #4bc94a; }
`;

// ── KCC watermark CSS ──
// Font/shadow inherit from Krunker (topLeftOld class in-game, matchInfoHolder on menu).
export const WATERMARK_CSS = `
.kcc-watermark, .kcc-watermark-ver { color: #fff; }
.kcc-watermark-ver { margin-left: 6px; }
#kcc-watermark-menu {
  display: inline-block;
  margin-left: 12px;
  vertical-align: middle;
}
`;

// ── Ban log search CSS (search box injected into Krunker's native KPD popup) ──
export const BANLOG_SEARCH_CSS = `
#kccBanlogSearch {
  display: block;
  box-sizing: border-box;
  width: calc(100% - 24px);
  margin: 6px auto 10px;
  padding: 8px 12px;
  font-size: 15px;
  color: var(--kcc-text-primary);
  background: var(--kcc-surface-input);
  border: 1px solid var(--kcc-border-default);
  border-radius: 8px;
  outline: none;
  pointer-events: all;
}
#kccBanlogSearch::placeholder { color: var(--kcc-text-muted); }
#kccBanlogSearch:focus { border-color: var(--kcc-accent); background: var(--kcc-surface-hover); }
#kpdCalls tr.kcc-banlog-hide { display: none !important; }
`;

/** Pre-concatenated CSS for single-call injection */
export const ALL_CLIENT_CSS = `${CLIENT_SETTINGS_CSS}\n${MATCHMAKER_SETTINGS_CSS}\n${TRANSLATOR_CSS}\n${ALT_MANAGER_CSS}\n${HP_COUNTER_CSS}\n${BP_CLAIM_ALL_CSS}\n${RANK_TRACKER_CSS}\n${WATERMARK_CSS}\n${BANLOG_SEARCH_CSS}`;

/** Hides leftover ad container divs after the network-level URL block cancels their payloads. */
export const HIDE_ADS_CSS = `
.endAHolder,
#aHider,
#adCon,
#rightABox,
#aContainer,
#topRightAdHolder,
div#aContainer,
#braveWarning,
#topRightAdHolder {
  display: none !important;
}`;

/** Auto-clicks the cookie/GDPR consent banner so it doesn't block the UI. Polling-only — never use a MutationObserver here, see CLAUDE.md WebGL-hang note. */
export const CONSENT_DISMISS_JS = `
(function dismissConsent() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    const btn = document.querySelector('.fc-cta-consent, [aria-label="Consent"], .css-47sehv');
    if (btn) { btn.click(); clearInterval(timer); }
    if (attempts > 30) clearInterval(timer);
  }, 500);
})();`;
