// ── Keystrokes + Mouse overlay ──
// Keyboard layout adapted from KraXen72's Crankshaft userscript
// (https://gist.github.com/KraXen72/2ea1332440b0c66b83ca9b73afc38269)

export interface KeystrokesConfig {
    enabled: boolean;
    size: number;
    auxKey1: string;
    auxKey2: string;
    showAuxKeys: boolean;
    mouseEnabled: boolean;
}

const STYLE_ID = 'kcc-keystrokes-css';
const KB_HOLD_CLASS = 'kcc-keystrokes-hold';
const MS_HOLD_CLASS = 'kcc-mouse-hold';
const KB_HOLD_ID = 'kcc-keystrokes-hold';
const MS_HOLD_ID = 'kcc-mouse-hold';

let kbHoldEl: HTMLElement | null = null;
let msHoldEl: HTMLElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let kbDown: ((e: KeyboardEvent) => void) | null = null;
let kbUp: ((e: KeyboardEvent) => void) | null = null;
let msDown: ((e: MouseEvent) => void) | null = null;
let msUp: ((e: MouseEvent) => void) | null = null;
let msWheel: ((e: WheelEvent) => void) | null = null;
let parentPoll: ReturnType<typeof setInterval> | null = null;
let currentConfig: KeystrokesConfig | null = null;
let scrollUpTimer: ReturnType<typeof setTimeout> | null = null;
let scrollDownTimer: ReturnType<typeof setTimeout> | null = null;

function precisionRound(n: number, p = 2): number {
    const f = Math.pow(10, p);
    return Math.round(n * f) / f;
}

function normalizeKey(raw: string, fallback: string): string {
    if (!raw || typeof raw !== 'string') return fallback;
    const trimmed = raw.trim();
    return trimmed || fallback;
}

const KEY_DISPLAY_MAP: Record<string, string> = {
    'Tab': 'TAB',
    'Escape': 'ESC',
    'Enter': 'ENT',
    'Backspace': 'BSP',
    'CapsLock': 'CAP',
    'ContextMenu': 'MEN',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    ' ': '__',
    'Spacebar': '__',
};

function displayKey(key: string): string {
    if (!key) return '?';
    if (KEY_DISPLAY_MAP[key]) return KEY_DISPLAY_MAP[key];
    return key.toUpperCase();
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildCSS(cfg: KeystrokesConfig): string {
    const size = cfg.size;
    const half = precisionRound(size / 2);
    const colGap = precisionRound(size / 10);
    const rowGap = precisionRound(size / 5);
    const fontKey = precisionRound((size / 2) * 1.5);
    const fontSpecial = half;
    const fontAux = precisionRound(fontKey * 0.85);
    const auxHide = cfg.showAuxKeys ? '' : `.${KB_HOLD_CLASS} .key-aux1, .${KB_HOLD_CLASS} .key-aux2 { display: none !important; }`;

    // Mouse silhouette sits to the right of the keyboard.
    // Keyboard width ≈ 8 × half + 7 × colGap = 4×size + 7×size/10 = 4.7×size rem
    const kbWidth = precisionRound(4 * size + 7 * (size / 10));
    const msLeft = precisionRound(28 + kbWidth + 1.5);
    const mouseW = precisionRound(size * 1.6);
    const mouseH = precisionRound(size * 2.6);
    const arrowFont = precisionRound(size * 0.45);

    return `
        ${auxHide}
        .${KB_HOLD_CLASS} {
            display: grid;
            grid-template: repeat(3, ${size}rem) / repeat(8, ${half}rem);
            grid-template-areas:
                "empty1 empty2 keyw keyw empty3 empty4 empty5 empty6"
                "keya keya keys keys keyd keyd aux1 aux1"
                "shift shift shift space space space aux2 aux2";
            position: absolute;
            column-gap: ${colGap}rem;
            row-gap: ${rowGap}rem;
            bottom: 2rem;
            left: 28rem;
            pointer-events: none;
            z-index: 10;
        }
        .${KB_HOLD_CLASS} .key {
            background: #262626;
            color: white;
            font-family: monospace;
            font-weight: bold;
            border: 2px solid black;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 80ms linear, color 80ms linear;
            font-size: ${fontKey}rem;
            min-width: ${size}rem;
            min-height: ${size}rem;
            padding: 0 ${precisionRound(size / 10)}rem;
        }
        .${KB_HOLD_CLASS} .key-sft, .${KB_HOLD_CLASS} .key-space {
            font-size: ${fontSpecial}rem;
        }
        .${KB_HOLD_CLASS} .key-aux1, .${KB_HOLD_CLASS} .key-aux2 {
            font-size: ${fontAux}rem;
        }
        .${KB_HOLD_CLASS} .key-w { grid-area: keyw; }
        .${KB_HOLD_CLASS} .key-a { grid-area: keya; }
        .${KB_HOLD_CLASS} .key-s { grid-area: keys; }
        .${KB_HOLD_CLASS} .key-d { grid-area: keyd; }
        .${KB_HOLD_CLASS} .key-sft { grid-area: shift; }
        .${KB_HOLD_CLASS} .key-space { grid-area: space; }
        .${KB_HOLD_CLASS} .key-aux1 { grid-area: aux1; }
        .${KB_HOLD_CLASS} .key-aux2 { grid-area: aux2; }
        .${KB_HOLD_CLASS} .key.active {
            background: #868686;
            color: #232323;
        }

        /* ── Mouse silhouette ── */
        .${MS_HOLD_CLASS} {
            position: absolute;
            bottom: 2rem;
            left: ${msLeft}rem;
            width: ${mouseW}rem;
            height: ${mouseH}rem;
            background: #262626;
            border: 2px solid black;
            /* Asymmetric border-radius: rounded top (button area), softer bottom */
            border-radius: 50% 50% 28% 28% / 38% 38% 18% 18%;
            pointer-events: none;
            z-index: 10;
            box-sizing: border-box;
            overflow: hidden;
        }
        .${MS_HOLD_CLASS} .ms-lmb,
        .${MS_HOLD_CLASS} .ms-rmb {
            position: absolute;
            top: 0;
            width: 50%;
            height: 50%;
            transition: background 80ms linear;
        }
        .${MS_HOLD_CLASS} .ms-lmb {
            left: 0;
            border-right: 1px solid rgba(255, 255, 255, 0.18);
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            border-top-left-radius: 100% 0 0 0 / 100% 0 0 0;
        }
        .${MS_HOLD_CLASS} .ms-rmb {
            right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            border-top-right-radius: 0 100% 0 0 / 0 100% 0 0;
        }
        .${MS_HOLD_CLASS} .ms-lmb.active,
        .${MS_HOLD_CLASS} .ms-rmb.active {
            background: rgba(255, 255, 255, 0.45);
        }
        /* Scroll wheel — vertical pill centered above the button split */
        .${MS_HOLD_CLASS} .ms-mmb {
            position: absolute;
            top: 14%;
            left: 50%;
            transform: translateX(-50%);
            width: 22%;
            height: 24%;
            background: repeating-linear-gradient(0deg, #555 0px, #555 2px, #2a2a2a 2px, #2a2a2a 4px);
            border: 1px solid #111;
            border-radius: 999px;
            z-index: 2;
            transition: background 80ms linear, box-shadow 80ms linear;
        }
        .${MS_HOLD_CLASS} .ms-mmb.active {
            background: #cccccc;
            box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
        }
        /* Scroll up/down indicators — hidden until scrolling, then flash yellow */
        .${MS_HOLD_CLASS} .ms-su,
        .${MS_HOLD_CLASS} .ms-sd {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            font-family: monospace;
            font-size: ${arrowFont}rem;
            color: #ffd54f;
            text-shadow: 0 0 6px rgba(255, 213, 79, 0.85);
            opacity: 0;
            transition: opacity 80ms linear;
            z-index: 3;
            line-height: 1;
            pointer-events: none;
        }
        .${MS_HOLD_CLASS} .ms-su { top: 4%; }
        .${MS_HOLD_CLASS} .ms-sd { top: 38%; }
        .${MS_HOLD_CLASS} .ms-su.active,
        .${MS_HOLD_CLASS} .ms-sd.active {
            opacity: 1;
        }
    `;
}

function buildKbHTML(aux1: string, aux2: string): string {
    return (
        `<span class="key key-w">W</span>` +
        `<span class="key key-a">A</span>` +
        `<span class="key key-s">S</span>` +
        `<span class="key key-d">D</span>` +
        `<span class="key key-sft">sft</span>` +
        `<span class="key key-space">__</span>` +
        `<span class="key key-aux1">${escapeHtml(displayKey(aux1))}</span>` +
        `<span class="key key-aux2">${escapeHtml(displayKey(aux2))}</span>`
    );
}

function buildMsHTML(): string {
    return (
        `<div class="ms-lmb"></div>` +
        `<div class="ms-rmb"></div>` +
        `<div class="ms-mmb"></div>` +
        `<div class="ms-su">▲</div>` +
        `<div class="ms-sd">▼</div>`
    );
}

interface KeyTarget {
    test: (e: KeyboardEvent) => boolean;
    el: HTMLElement;
}

let keyTargets: KeyTarget[] = [];

function buildKeyTargets(host: HTMLElement, aux1: string, aux2: string): KeyTarget[] {
    const q = (sel: string) => host.querySelector(sel) as HTMLElement;
    const matchAux = (key: string) => (e: KeyboardEvent) => !!key && e.key.toLowerCase() === key.toLowerCase();
    return [
        { test: (e) => e.code === 'KeyW', el: q('.key-w') },
        { test: (e) => e.code === 'KeyA', el: q('.key-a') },
        { test: (e) => e.code === 'KeyS', el: q('.key-s') },
        { test: (e) => e.code === 'KeyD', el: q('.key-d') },
        { test: (e) => e.key === 'Shift', el: q('.key-sft') },
        { test: (e) => e.code === 'Space', el: q('.key-space') },
        { test: matchAux(aux1), el: q('.key-aux1') },
        { test: matchAux(aux2), el: q('.key-aux2') },
    ].filter((t) => t.el);
}

function handleKeyDown(e: KeyboardEvent): void {
    for (const t of keyTargets) {
        if (t.test(e)) t.el.classList.add('active');
    }
}

function handleKeyUp(e: KeyboardEvent): void {
    for (const t of keyTargets) {
        if (t.test(e)) t.el.classList.remove('active');
    }
}

function setMouseBtnActive(button: number, active: boolean): void {
    if (!msHoldEl) return;
    let sel: string | null = null;
    if (button === 0) sel = '.ms-lmb';
    else if (button === 1) sel = '.ms-mmb';
    else if (button === 2) sel = '.ms-rmb';
    if (!sel) return;
    const el = msHoldEl.querySelector(sel);
    if (!el) return;
    if (active) el.classList.add('active');
    else el.classList.remove('active');
}

function handleMouseDown(e: MouseEvent): void {
    setMouseBtnActive(e.button, true);
}

function handleMouseUp(e: MouseEvent): void {
    setMouseBtnActive(e.button, false);
}

function handleWheel(e: WheelEvent): void {
    if (!msHoldEl) return;
    if (e.deltaY < 0) {
        const el = msHoldEl.querySelector('.ms-su');
        if (el) {
            el.classList.add('active');
            if (scrollUpTimer) clearTimeout(scrollUpTimer);
            scrollUpTimer = setTimeout(() => el.classList.remove('active'), 120);
        }
    } else if (e.deltaY > 0) {
        const el = msHoldEl.querySelector('.ms-sd');
        if (el) {
            el.classList.add('active');
            if (scrollDownTimer) clearTimeout(scrollDownTimer);
            scrollDownTimer = setTimeout(() => el.classList.remove('active'), 120);
        }
    }
}

function findHostParent(): HTMLElement | null {
    return (
        document.getElementById('inGameUI') ||
        document.getElementById('uiBase') ||
        document.body
    );
}

function injectStyle(cfg: KeystrokesConfig): void {
    if (styleEl) styleEl.remove();
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = buildCSS(cfg);
    document.head.appendChild(styleEl);
}

function injectKbHold(cfg: KeystrokesConfig): void {
    const host = findHostParent();
    if (!host) return;
    if (kbHoldEl && kbHoldEl.parentElement === host) return;
    if (kbHoldEl) kbHoldEl.remove();
    const aux1 = normalizeKey(cfg.auxKey1, 'R');
    const aux2 = normalizeKey(cfg.auxKey2, 'N');
    kbHoldEl = document.createElement('div');
    kbHoldEl.id = KB_HOLD_ID;
    kbHoldEl.className = KB_HOLD_CLASS;
    kbHoldEl.innerHTML = buildKbHTML(aux1, aux2);
    host.appendChild(kbHoldEl);
    keyTargets = buildKeyTargets(kbHoldEl, aux1, aux2);
}

function injectMsHold(): void {
    const host = findHostParent();
    if (!host) return;
    if (msHoldEl && msHoldEl.parentElement === host) return;
    if (msHoldEl) msHoldEl.remove();
    msHoldEl = document.createElement('div');
    msHoldEl.id = MS_HOLD_ID;
    msHoldEl.className = MS_HOLD_CLASS;
    msHoldEl.innerHTML = buildMsHTML();
    host.appendChild(msHoldEl);
}

function attachKeyboardListeners(): void {
    if (kbDown) return;
    kbDown = handleKeyDown;
    kbUp = handleKeyUp;
    document.addEventListener('keydown', kbDown);
    document.addEventListener('keyup', kbUp);
}

function detachKeyboardListeners(): void {
    if (kbDown) { document.removeEventListener('keydown', kbDown); kbDown = null; }
    if (kbUp) { document.removeEventListener('keyup', kbUp); kbUp = null; }
}

function attachMouseListeners(): void {
    if (msDown) return;
    msDown = handleMouseDown;
    msUp = handleMouseUp;
    msWheel = handleWheel;
    // Capture phase on window so we get events before Krunker's canvas listeners
    // can call stopPropagation. Mouseup must be capture too to clear "stuck" highlights
    // when pointer-locked drags release outside the target.
    window.addEventListener('mousedown', msDown, { capture: true });
    window.addEventListener('mouseup', msUp, { capture: true });
    window.addEventListener('pointerdown', msDown, { capture: true });
    window.addEventListener('pointerup', msUp, { capture: true });
    window.addEventListener('wheel', msWheel, { capture: true, passive: true });
}

function detachMouseListeners(): void {
    if (msDown) {
        window.removeEventListener('mousedown', msDown, { capture: true } as EventListenerOptions);
        window.removeEventListener('pointerdown', msDown, { capture: true } as EventListenerOptions);
        msDown = null;
    }
    if (msUp) {
        window.removeEventListener('mouseup', msUp, { capture: true } as EventListenerOptions);
        window.removeEventListener('pointerup', msUp, { capture: true } as EventListenerOptions);
        msUp = null;
    }
    if (msWheel) {
        window.removeEventListener('wheel', msWheel, { capture: true } as EventListenerOptions);
        msWheel = null;
    }
    if (scrollUpTimer) { clearTimeout(scrollUpTimer); scrollUpTimer = null; }
    if (scrollDownTimer) { clearTimeout(scrollDownTimer); scrollDownTimer = null; }
}

function ensureKbOverlay(cfg: KeystrokesConfig): void {
    if (cfg.enabled) {
        injectKbHold(cfg);
        attachKeyboardListeners();
    } else {
        if (kbHoldEl) { kbHoldEl.remove(); kbHoldEl = null; }
        keyTargets = [];
        detachKeyboardListeners();
    }
}

function ensureMsOverlay(cfg: KeystrokesConfig): void {
    if (cfg.mouseEnabled) {
        injectMsHold();
        attachMouseListeners();
    } else {
        if (msHoldEl) { msHoldEl.remove(); msHoldEl = null; }
        detachMouseListeners();
    }
}

function startParentPoll(): void {
    if (parentPoll) return;
    parentPoll = setInterval(() => {
        if (!currentConfig) return;
        if (currentConfig.enabled && (!kbHoldEl || !kbHoldEl.isConnected)) injectKbHold(currentConfig);
        if (currentConfig.mouseEnabled && (!msHoldEl || !msHoldEl.isConnected)) injectMsHold();
    }, 2000);
}

function stopParentPoll(): void {
    if (parentPoll) { clearInterval(parentPoll); parentPoll = null; }
}

export function initKeystrokes(cfg: KeystrokesConfig): void {
    currentConfig = cfg;
    if (!cfg.enabled && !cfg.mouseEnabled) return;
    injectStyle(cfg);
    ensureKbOverlay(cfg);
    ensureMsOverlay(cfg);
    startParentPoll();
}

export function destroyKeystrokes(): void {
    detachKeyboardListeners();
    detachMouseListeners();
    if (kbHoldEl) { kbHoldEl.remove(); kbHoldEl = null; }
    if (msHoldEl) { msHoldEl.remove(); msHoldEl = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
    stopParentPoll();
    keyTargets = [];
    currentConfig = null;
}

export function updateKeystrokes(cfg: KeystrokesConfig): void {
    currentConfig = cfg;
    if (!cfg.enabled && !cfg.mouseEnabled) {
        destroyKeystrokes();
        return;
    }
    injectStyle(cfg);
    // Force rebuild so aux key labels and layout reflect new config
    if (kbHoldEl) { kbHoldEl.remove(); kbHoldEl = null; }
    if (msHoldEl) { msHoldEl.remove(); msHoldEl = null; }
    ensureKbOverlay(cfg);
    ensureMsOverlay(cfg);
    startParentPoll();
}
