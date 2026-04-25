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
/* ── Crankshaft-style settings (Krunker-native classes) ── */

.kcc-settings .settName,
.kcc-settings .settName .setting-title {
	color: rgba(255,255,255,.6) !important;
}

.kcc-settings .settName {
	display: grid;
	grid-auto-columns: 1fr;
	grid-template-columns: 0fr 1fr 0fr;
	grid-template-areas:
	"icon title input"
	"desc desc desc";
	grid-template-rows: 0fr min-content;
	align-items: center;
}
.kcc-settings .settName.multisel {
	grid-template-rows: min-content 1fr;
	grid-template-columns: 0fr 1fr;
	grid-template-areas:
	"icon title"
	"input input";
}
.kcc-settings .settName.has-button {
	grid-template-areas:
	"icon title button input"
	"desc desc desc desc";
	grid-template-columns: 0fr 1fr min-content 0fr;
}
.kcc-settings .settName.has-button .settingsBtn {
	grid-area: button;
	margin: 0 .5rem;
}

.kcc-settings .settName.kcc-button-holder {
	grid-template-columns: 1fr;
	grid-auto-columns: min-content;
	column-gap: 0.25rem;
	grid-template-areas: unset;
	grid-template-rows: 0fr;
	grid-auto-flow: column;
}
.kcc-settings .kcc-button-holder .buttons-title, .material-icons { color: inherit; }
.kcc-settings .kcc-button-holder .settingsBtn,
.kcc-settings .settName.has-button .settingsBtn {
	width: max-content;
}

/* type: num */
.kcc-settings .settName.num .setting-input-wrapper {
	display: flex;
}
.kcc-settings .settName.num .setting-input-wrapper .slidecontainer {
	margin-top: -8px;
}

/* type: multisel */
.kcc-multisel-parent {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	grid-auto-rows: 1fr;
	gap: .25rem;
	background: #232323;
	border-radius: 10px;
	margin-top: 0.8rem;
}
.kcc-multisel-parent label.hostOpt {
	width: 100%;
	margin: 0;
	box-sizing: border-box;
}

.kcc-settings .settName.multisel label {
	font-size: 1.1rem;
}
.kcc-settings .settName.multisel input {
	margin-left: .25rem;
}

/* general settings */
.kcc-settings .settName .setting-title {
	grid-area: title;
}

.kcc-settings .settName .s-update:disabled,
.kcc-settings .settName .s-update:disabled+.slider.round {
	opacity: 0.5;
	pointer-events: none;
}

.kcc-settings .setting .switch {
	box-sizing: border-box;
}

.kcc-settings .setting .desc-icon {
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

.kcc-settings .setting .desc-icon.instant {
	background-color: rgba(1, 89, 220, 0.16);
	border: 2px solid rgba(3, 133, 255, 0.81);
}

.kcc-settings .setting .desc-icon.instant svg path {
	color: #0385ff;
	fill: currentColor;
}

.kcc-settings .setting.settName .inputGrey2,
.kcc-settings .setting.settName .switch,
.kcc-settings .setting.settName .kcc-multisel-parent,
.kcc-settings .setting.settName .setting-input-wrapper,
.kcc-settings .setting.settName .keyIcon {
	grid-area: input;
}

.kcc-settings .setting.safety-1 .desc-icon,
.kcc-settings .setting .desc-icon.refresh-icon,
.kcc-settings .setting .desc-icon.restart-icon {
	background-color: rgba(99, 99, 99, 0.16);
	border: 2px solid rgba(78, 78, 78, 0.81);
}

.kcc-settings .setting.safety-1 .desc-icon svg path,
.kcc-settings .setting .desc-icon.refresh-icon svg path,
.kcc-settings .setting .desc-icon.restart-icon svg path {
	color: #969696;
	fill: currentColor;
}

.kcc-settings .setting.safety-2 .desc-icon {
	background-color: rgba(220, 180, 1, 0.16);
	border: 2px solid rgba(241, 186, 6, 0.81);
}

.kcc-settings .setting.safety-2 .desc-icon svg path {
	color: #ffd903;
	fill: currentColor;
}

.kcc-settings .setting.safety-3 .desc-icon {
	background-color: rgba(220, 118, 1, 0.16);
	border: 2px solid rgba(241, 131, 6, 0.81);
}

.kcc-settings .setting.safety-3 .desc-icon svg path {
	color: #ff9203;
	fill: currentColor;
}

.kcc-settings .setting.safety-4 .desc-icon {
	background-color: rgba(220, 17, 1, 0.16);
	border: 2px solid rgba(239, 6, 6, 0.81);
}

.kcc-settings .setting.safety-4 .desc-icon svg path {
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
.keyIcon.kcc-keyIcon:hover {
	transform: scale(1.25);
	cursor: pointer;
}

.keyIcon.kcc-keyIcon {
	display: inline-block;
	transition: 0s;
}

/* ── KCC action button grid ── */
.kcc-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 12px 12px;
}
.kcc-action-btn {
  background: var(--kcc-surface-card);
  color: var(--kcc-text-primary);
  border: 2px solid var(--kcc-border-medium);
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
}
.kcc-action-btn:hover {
  background: var(--kcc-surface-hover);
  border-color: var(--kcc-border-focus);
}
.kcc-action-btn:active {
  transform: scale(0.97);
}
.kcc-action-btn.full {
  grid-column: 1 / -1;
}
.kcc-action-btn.kcc-ab-purple { border-color: #ab47bc; }
.kcc-action-btn.kcc-ab-purple:hover { border-color: #ce93d8; }
.kcc-action-btn.kcc-ab-cyan { border-color: #00bcd4; }
.kcc-action-btn.kcc-ab-cyan:hover { border-color: #4dd0e1; }
.kcc-action-btn.kcc-ab-pink { border-color: #ec407a; }
.kcc-action-btn.kcc-ab-pink:hover { border-color: #f48fb1; }
.kcc-action-btn.kcc-ab-red { border-color: var(--kcc-red); }
.kcc-action-btn.kcc-ab-red:hover { border-color: var(--kcc-red-hover); }
.kcc-action-btn.kcc-ab-orange { border-color: var(--kcc-orange); }
.kcc-action-btn.kcc-ab-orange:hover { border-color: var(--kcc-orange-hover); }

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
  background: var(--kcc-modal-bg);
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
.kcc-acc-form { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.kcc-acc-form input {
  background: var(--kcc-surface-input); border: 1px solid var(--kcc-border); border-radius: 4px;
  color: #fff; padding: 6px 10px; font-size: 13px; outline: none; font-family: inherit;
}
.kcc-acc-form input:focus { border-color: var(--kcc-accent); }
.kcc-acc-form input::placeholder { color: rgba(255,255,255,0.3); }
.kcc-acc-form-buttons { display: flex; gap: 8px; }
.kcc-acc-form-buttons button {
  padding: 6px 16px; border: none; border-radius: 4px; cursor: pointer;
  font-size: 13px; font-family: inherit;
}
.kcc-acc-form-buttons .kcc-acc-save {
  background: var(--kcc-accent); color: #fff;
}
.kcc-acc-form-buttons .kcc-acc-save:hover { filter: brightness(1.2); }
.kcc-acc-form-buttons .kcc-acc-cancel {
  background: var(--kcc-surface-hover); color: #fff;
}
.kcc-acc-form-buttons .kcc-acc-cancel:hover { background: var(--kcc-surface-hover-strong); }
.kcc-acc-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--kcc-surface-card); border-radius: 6px; margin-bottom: 6px;
}
.kcc-acc-item-info { display: flex; align-items: center; gap: 8px; }
.kcc-acc-item-label { color: #fff; font-size: 14px; font-weight: 500; }
.kcc-acc-item-role {
  font-size: 11px; padding: 2px 6px; border-radius: 3px;
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6);
}
.kcc-acc-item-actions { display: flex; gap: 6px; }
.kcc-acc-item-actions button {
  padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;
  font-size: 12px; font-family: inherit;
}
.kcc-acc-switch { background: var(--kcc-accent); color: #fff; }
.kcc-acc-switch:hover { filter: brightness(1.2); }
.kcc-acc-delete { background: rgba(255,80,80,0.2); color: #ff5050; }
.kcc-acc-delete:hover { background: rgba(255,80,80,0.35); }
.kcc-acc-empty { color: rgba(255,255,255,0.4); font-size: 13px; text-align: center; padding: 16px 0; }
.kcc-alt-overlay-backdrop {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99998;
  background: var(--kcc-overlay-bg);
  backdrop-filter: blur(var(--kcc-overlay-blur));
  -webkit-backdrop-filter: blur(var(--kcc-overlay-blur));
}
.kcc-alt-overlay {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: var(--kcc-modal-bg);
  border: var(--kcc-modal-border);
  border-radius: var(--kcc-modal-radius);
  padding: 20px; min-width: 280px; max-width: 360px; z-index: 99999;
  box-shadow: var(--kcc-modal-shadow);
}
.kcc-alt-overlay h3 {
  margin: 0 0 12px; color: #fff; font-size: 16px; font-weight: 600;
}
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

/** Pre-concatenated CSS for single-call injection (excludes HIDE_ADS_CSS which is separate) */
export const ALL_CLIENT_CSS = `${CLIENT_SETTINGS_CSS}\n${MATCHMAKER_SETTINGS_CSS}\n${TRANSLATOR_CSS}\n${ALT_MANAGER_CSS}\n${HP_COUNTER_CSS}\n${BP_CLAIM_ALL_CSS}\n${RANK_TRACKER_CSS}\n${WATERMARK_CSS}`;
