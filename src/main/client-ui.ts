// ── Shared CSS theme variables (used by both main page and tab bar) ──
export const THEME_CSS = `
:root {
  /* ── Surfaces ── */
  --kpc-surface-card: rgba(255,255,255,0.04);
  --kpc-surface-input: rgba(255,255,255,0.08);
  --kpc-surface-hover: rgba(255,255,255,0.1);
  --kpc-surface-hover-strong: rgba(255,255,255,0.15);
  --kpc-surface-dialog: #1a1a1a;
  --kpc-surface-raised: #212121;

  /* ── Text ── */
  --kpc-text-primary: rgba(255,255,255,0.9);
  --kpc-text-secondary: rgba(255,255,255,0.7);
  --kpc-text-muted: rgba(255,255,255,0.5);
  --kpc-text-faint: rgba(255,255,255,0.35);
  --kpc-text-dim: rgba(255,255,255,0.3);
  --kpc-text-info: #888;

  /* ── Borders ── */
  --kpc-border-subtle: rgba(255,255,255,0.06);
  --kpc-border-default: rgba(255,255,255,0.1);
  --kpc-border-medium: rgba(255,255,255,0.15);
  --kpc-border-focus: rgba(255,255,255,0.35);

  /* ── Accents ── */
  --kpc-green: #4CAF50;
  --kpc-green-hover: #66bb6a;
  --kpc-red: #ef5350;
  --kpc-red-hover: #e57373;
  --kpc-blue: #42a5f5;
  --kpc-blue-hover: #64b5f6;
  --kpc-orange: #ff9800;
  --kpc-orange-hover: #ffb74d;
  --kpc-yellow: #ffc107;
  --kpc-magenta: #fc03ec;

  /* ── Controls ── */
  --kpc-toggle-off: rgba(255,255,255,0.12);

  /* ── Z-index layers ── */
  --kpc-z-notification: 100000;
  --kpc-z-overlay: 10000000;
  --kpc-z-popup: 10000001;
}
`;

// ── Injected CSS for client settings in Krunker's settings panel ──
export const CLIENT_SETTINGS_CSS = `
${THEME_CSS}
/* ── Crankshaft-style settings (Krunker-native classes) ── */

.kpc-settings .settName,
.kpc-settings .settName .setting-title {
	color: rgba(255,255,255,.6) !important;
}

.kpc-settings .settName {
	display: grid;
	grid-auto-columns: 1fr;
	grid-template-columns: 0fr 1fr 0fr;
	grid-template-areas:
	"icon title input"
	"desc desc desc";
	grid-template-rows: 0fr min-content;
	align-items: center;
}
.kpc-settings .settName.multisel {
	grid-template-rows: min-content 1fr;
	grid-template-columns: 0fr 1fr;
	grid-template-areas:
	"icon title"
	"input input";
}
.kpc-settings .settName.has-button {
	grid-template-areas:
	"icon title button input"
	"desc desc desc desc";
	grid-template-columns: 0fr 1fr min-content 0fr;
}
.kpc-settings .settName.has-button .settingsBtn {
	grid-area: button;
	margin: 0 .5rem;
}

.kpc-settings .settName.kpc-button-holder {
	grid-template-columns: 1fr;
	grid-auto-columns: min-content;
	column-gap: 0.25rem;
	grid-template-areas: unset;
	grid-template-rows: 0fr;
	grid-auto-flow: column;
}
.kpc-settings .kpc-button-holder .buttons-title, .material-icons { color: inherit; }
.kpc-settings .kpc-button-holder .settingsBtn,
.kpc-settings .settName.has-button .settingsBtn {
	width: max-content;
}

/* type: num */
.kpc-settings .settName.num .setting-input-wrapper {
	display: flex;
}
.kpc-settings .settName.num .setting-input-wrapper .slidecontainer {
	margin-top: -8px;
}

/* type: multisel */
.kpc-multisel-parent {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	grid-auto-rows: 1fr;
	gap: .25rem;
	background: #232323;
	border-radius: 10px;
	margin-top: 0.8rem;
}
.kpc-multisel-parent label.hostOpt {
	width: 100%;
	margin: 0;
	box-sizing: border-box;
}

.kpc-settings .settName.multisel label {
	font-size: 1.1rem;
}
.kpc-settings .settName.multisel input {
	margin-left: .25rem;
}

/* general settings */
.kpc-settings .settName .setting-title {
	grid-area: title;
}

.kpc-settings .settName .s-update:disabled,
.kpc-settings .settName .s-update:disabled+.slider.round {
	opacity: 0.5;
	pointer-events: none;
}

.kpc-settings .setting .switch {
	box-sizing: border-box;
}

.kpc-settings .setting .desc-icon {
	grid-area: icon;
	cursor: pointer;
	font-size: 1rem;
	width: 2.2rem;
	height: 2.2rem;
	line-height: 2.2rem;
	border-radius: 5px !important;
	color: #969696;
	background-color: rgba(99, 99, 99, 0.16);
	border: 2px solid rgba(78, 78, 78, 0.81);
	margin-right: 10px;
	display: flex;
	justify-content: center;
	align-items: center;
}

.kpc-settings .setting .desc-icon.instant {
	background-color: rgba(1, 89, 220, 0.16);
	border: 2px solid rgba(3, 133, 255, 0.81);
}

.kpc-settings .setting .desc-icon.instant svg path {
	color: #0385ff;
	fill: currentColor;
}

.kpc-settings .setting.settName .inputGrey2,
.kpc-settings .setting.settName .switch,
.kpc-settings .setting.settName .kpc-multisel-parent,
.kpc-settings .setting.settName .setting-input-wrapper,
.kpc-settings .setting.settName .keyIcon {
	grid-area: input;
}

.kpc-settings .setting.safety-1 .desc-icon,
.kpc-settings .setting .desc-icon.refresh-icon,
.kpc-settings .setting .desc-icon.restart-icon {
	background-color: rgba(99, 99, 99, 0.16);
	border: 2px solid rgba(78, 78, 78, 0.81);
}

.kpc-settings .setting.safety-1 .desc-icon svg path,
.kpc-settings .setting .desc-icon.refresh-icon svg path,
.kpc-settings .setting .desc-icon.restart-icon svg path {
	color: #969696;
	fill: currentColor;
}

.kpc-settings .setting.safety-2 .desc-icon {
	background-color: rgba(220, 180, 1, 0.16);
	border: 2px solid rgba(241, 186, 6, 0.81);
}

.kpc-settings .setting.safety-2 .desc-icon svg path {
	color: #ffd903;
	fill: currentColor;
}

.kpc-settings .setting.safety-3 .desc-icon {
	background-color: rgba(220, 118, 1, 0.16);
	border: 2px solid rgba(241, 131, 6, 0.81);
}

.kpc-settings .setting.safety-3 .desc-icon svg path {
	color: #ff9203;
	fill: currentColor;
}

.kpc-settings .setting.safety-4 .desc-icon {
	background-color: rgba(220, 17, 1, 0.16);
	border: 2px solid rgba(239, 6, 6, 0.81);
}

.kpc-settings .setting.safety-4 .desc-icon svg path {
	color: #ff0303;
	fill: currentColor;
}

.desc-icon {
	position: relative;
}

.setting-desc-new {
	display: block;
	width: fit-content;
	max-width: 50ch;
	line-height: 30px;
	font-size: 15px;
	letter-spacing: 0.5px;
	word-wrap: break-word;
	color: rgba(255, 255, 255, 0.4) !important;
	overflow: hidden;
	max-height: 500px;
	margin-top: 6px;
	grid-area: desc;
}

.setting-desc-new a {
	font-size: inherit !important;
	font-family: inherit !important;
}

.setting-category-collapsed {
	display: none;
}

/* keybind display */
.keyIcon.kpc-keyIcon:hover {
	transform: scale(1.25);
	cursor: pointer;
}

.keyIcon.kpc-keyIcon {
	display: inline-block;
	transition: 0s;
}

/* ── KPC action button grid ── */
.kpc-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 12px 12px;
}
.kpc-action-btn {
  background: var(--kpc-surface-card);
  color: var(--kpc-text-primary);
  border: 2px solid var(--kpc-border-medium);
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
}
.kpc-action-btn:hover {
  background: var(--kpc-surface-hover);
  border-color: var(--kpc-border-focus);
}
.kpc-action-btn:active {
  transform: scale(0.97);
}
.kpc-action-btn.full {
  grid-column: 1 / -1;
}
.kpc-action-btn.kpc-ab-purple { border-color: #ab47bc; }
.kpc-action-btn.kpc-ab-purple:hover { border-color: #ce93d8; }
.kpc-action-btn.kpc-ab-cyan { border-color: #00bcd4; }
.kpc-action-btn.kpc-ab-cyan:hover { border-color: #4dd0e1; }
.kpc-action-btn.kpc-ab-pink { border-color: #ec407a; }
.kpc-action-btn.kpc-ab-pink:hover { border-color: #f48fb1; }
.kpc-action-btn.kpc-ab-red { border-color: var(--kpc-red); }
.kpc-action-btn.kpc-ab-red:hover { border-color: var(--kpc-red-hover); }
.kpc-action-btn.kpc-ab-orange { border-color: var(--kpc-orange); }
.kpc-action-btn.kpc-ab-orange:hover { border-color: var(--kpc-orange-hover); }

/* floating toasts css that is required */
.kpc-holder-update {
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
.kpc-keybind-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: var(--kpc-z-overlay);
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}
.kpc-keybind-dialog {
  background: var(--kpc-surface-dialog);
  border: 1px solid var(--kpc-border-medium);
  border-radius: 10px;
  padding: 24px 32px;
  min-width: 400px;
  position: relative;
}
.kpc-keybind-dialog-title {
  color: var(--kpc-text-primary);
  font-size: 18px;
  margin-bottom: 6px;
}
.kpc-keybind-dialog-sub {
  color: var(--kpc-text-muted);
  font-size: 13px;
  margin-bottom: 16px;
}
.kpc-keybind-dialog-sub code {
  color: #64b5f6;
}
.kpc-keybind-dialog-modifiers {
  display: flex;
  gap: 8px;
  font-size: 14px;
}
.kpc-keybind-modifier {
  background: var(--kpc-surface-raised);
  color: var(--kpc-text-faint);
  flex: 1;
  text-align: center;
  padding: 10px 0;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
.kpc-keybind-modifier.active {
  background: #1976d2;
  color: #fff;
}
.kpc-keybind-dialog-cancel {
  position: absolute;
  top: 12px;
  right: 16px;
  color: #64b5f6;
  cursor: pointer;
  font-size: 14px;
}
.kpc-keybind-dialog-cancel:hover {
  text-decoration: underline;
}
/* ── Preserved: color input, userscript meta ── */
.kpc-color-input {
  width: 36px;
  height: 28px;
  border: 1px solid var(--kpc-border-default);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.kpc-color-input::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.kpc-color-input::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}
.kpc-us-meta {
  color: var(--kpc-text-dim);
  font-size: 11px;
  margin-top: 2px;
}
.kpc-us-settings {
  padding: 4px 0 4px 20px;
}
#chatList, #chatList * {
  user-select: text !important;
  cursor: text;
}
#chatList.kpc-chat-paused {
  border-left: 2px solid var(--kpc-yellow);
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
  top: 10em;
  left: 50%;
  z-index: var(--kpc-z-popup);
  box-sizing: border-box;
  width: 35em;
  aspect-ratio: 2.5/1;
  border-radius: 1.2em;
  overflow: hidden;
  background-size: 100% 100%;
  pointer-events: all;
  background-color: var(--kpc-surface-raised);
  animation: matchmakerPopupSlideDown 0.5s ease forwards;
}
#matchmakerPopupTitle {
  font-size: 1.8em;
  color: white;
  padding: 0.3em 0.7em;
  background: rgba(0,0,0,0.5);
  margin-bottom: 0.3em;
}
#matchmakerPopupDescription {
  background: rgba(0,0,0,0.5);
  color: var(--kpc-yellow);
  box-sizing: border-box;
  padding: 0.6em 1em;
}
#matchmakerPopupOptions {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  display: flex;
}
.matchmakerPopupButton {
  text-align: center;
  border: 0.3em solid;
  box-sizing: border-box;
  margin: 0.5em;
  color: white;
  border-radius: 0.3em;
  font-size: 1.3em;
  background-color: rgba(0,0,0,0.5);
  padding: 0.2em 1.4em;
  transition: all 0.08s;
}
#matchmakerConfirmButton {
  border-color: var(--kpc-green);
  flex-grow: 1;
}
#matchmakerCancelButton {
  border-color: var(--kpc-red);
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
  background: var(--kpc-surface-raised);
  width: 24em;
  aspect-ratio: auto;
  padding: 1em 1.5em;
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
  color: var(--kpc-blue);
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
.mm-feed-entry.mm-pass .mm-feed-region { color: var(--kpc-blue); }
.mm-feed-entry.mm-pass .mm-feed-map { color: var(--kpc-text-primary, rgba(255,255,255,0.9)); }
.mm-feed-entry.mm-pass .mm-feed-players { color: var(--kpc-green); }
.mm-feed-entry.mm-fail { background: rgba(255,255,255,0.02); }
.mm-feed-entry.mm-fail .mm-feed-region { color: var(--kpc-text-dim, rgba(255,255,255,0.3)); }
.mm-feed-entry.mm-fail .mm-feed-map { color: var(--kpc-text-muted, rgba(255,255,255,0.5)); }
.mm-feed-entry.mm-fail .mm-feed-players { color: var(--kpc-red); }
.mm-feed-entry:last-child::before {
  content: '\\25B8 ';
  color: var(--kpc-yellow);
}
.mm-feed-region { min-width: 2.5em; font-weight: bold; }
.mm-feed-map { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-feed-players { min-width: 3em; text-align: right; font-weight: 600; }
#matchmakerSearchCounter {
  font-size: 0.85em;
  color: var(--kpc-yellow);
  text-align: center;
  margin-bottom: 0.5em;
}
#matchmakerSearchCancel {
  text-align: center;
  border: 0.2em solid var(--kpc-red);
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
}
`;

// ── Alt Manager CSS ──
export const ALT_MANAGER_CSS = `
.kpc-acc-form { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.kpc-acc-form input {
  background: var(--kpc-surface-input); border: 1px solid var(--kpc-border); border-radius: 4px;
  color: #fff; padding: 6px 10px; font-size: 13px; outline: none; font-family: inherit;
}
.kpc-acc-form input:focus { border-color: var(--kpc-accent); }
.kpc-acc-form input::placeholder { color: rgba(255,255,255,0.3); }
.kpc-acc-form-buttons { display: flex; gap: 8px; }
.kpc-acc-form-buttons button {
  padding: 6px 16px; border: none; border-radius: 4px; cursor: pointer;
  font-size: 13px; font-family: inherit;
}
.kpc-acc-form-buttons .kpc-acc-save {
  background: var(--kpc-accent); color: #fff;
}
.kpc-acc-form-buttons .kpc-acc-save:hover { filter: brightness(1.2); }
.kpc-acc-form-buttons .kpc-acc-cancel {
  background: var(--kpc-surface-hover); color: #fff;
}
.kpc-acc-form-buttons .kpc-acc-cancel:hover { background: var(--kpc-surface-hover-strong); }
.kpc-acc-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--kpc-surface-card); border-radius: 6px; margin-bottom: 6px;
}
.kpc-acc-item-info { display: flex; align-items: center; gap: 8px; }
.kpc-acc-item-label { color: #fff; font-size: 14px; font-weight: 500; }
.kpc-acc-item-role {
  font-size: 11px; padding: 2px 6px; border-radius: 3px;
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6);
}
.kpc-acc-item-actions { display: flex; gap: 6px; }
.kpc-acc-item-actions button {
  padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;
  font-size: 12px; font-family: inherit;
}
.kpc-acc-switch { background: var(--kpc-accent); color: #fff; }
.kpc-acc-switch:hover { filter: brightness(1.2); }
.kpc-acc-delete { background: rgba(255,80,80,0.2); color: #ff5050; }
.kpc-acc-delete:hover { background: rgba(255,80,80,0.35); }
.kpc-acc-empty { color: rgba(255,255,255,0.4); font-size: 13px; text-align: center; padding: 16px 0; }
.kpc-alt-overlay-backdrop {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99998;
  background: rgba(0,0,0,0.5);
}
.kpc-alt-overlay {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: var(--kpc-surface-dialog, #1a1a1a); border-radius: 8px;
  padding: 16px; min-width: 280px; max-width: 360px; z-index: 99999;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.kpc-alt-overlay h3 {
  margin: 0 0 12px; color: #fff; font-size: 16px; font-weight: 600;
}
`;

// ── HP enemy counter CSS ──
export const HP_COUNTER_CSS = `
.kpc-hp-counter .pointVal {
  color: #ff4444; font-size: 15px; font-weight: bold;
}
`;

/** Pre-concatenated CSS for single-call injection (excludes HIDE_ADS_CSS which is separate) */
export const ALL_CLIENT_CSS = `${CLIENT_SETTINGS_CSS}\n${MATCHMAKER_SETTINGS_CSS}\n${TRANSLATOR_CSS}\n${ALT_MANAGER_CSS}\n${HP_COUNTER_CSS}`;
