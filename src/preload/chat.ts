// ── Better Chat + Chat History ──
// Merges team/all chat with [T]/[M] prefixes and prevents Krunker from pruning old messages.

import type { SavedConsole } from './utils';

const TEAM_MODES = new Set([
    'Team Deathmatch', 'Hardpoint', 'Capture the Flag', 'Hide & Seek',
    'Infected', 'Last Man Standing', 'Simon Says', 'Prop Hunt',
    'Boss Hunt', 'Deposit', 'Stalker', 'Kill Confirmed',
    'Defuse', 'Traitor', 'Blitz', 'Domination',
    'Squad Deathmatch', 'Team Defender',
]);

let chatList: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let historyMax = 0;
let betterChatEnabled = false;
let reInsertGuard = false;
let scrollPaused = false;
let _con: SavedConsole | null = null;

const SCROLL_BOTTOM_THRESHOLD = 30; // px from bottom to consider "at bottom"

function isChatMessage(node: Node): node is HTMLElement {
    return node.nodeType === 1 && (node as HTMLElement).id?.startsWith('chatMsg_');
}

function isTeamMode(): boolean {
    const modeEl = document.getElementById('gameModeLabel') || document.getElementById('subGameMode');
    if (!modeEl) return false;
    return TEAM_MODES.has(modeEl.textContent?.trim() || '');
}

function handleMutations(mutations: MutationRecord[]): void {
    // ── Chat history: re-insert removed messages ──
    if (historyMax > 0 && chatList && observer) {
        const removed: HTMLElement[] = [];
        for (const mut of mutations) {
            if (reInsertGuard) break;
            for (const node of mut.removedNodes) {
                if (isChatMessage(node)) removed.push(node);
            }
        }
        if (removed.length > 0) {
            reInsertGuard = true;
            observer.disconnect();
            const firstLive = chatList.firstChild;
            for (const node of removed) {
                chatList.insertBefore(node, firstLive);
            }
            while (chatList.children.length > historyMax) {
                chatList.removeChild(chatList.firstChild!);
            }
            observer.observe(chatList, { childList: true });
            reInsertGuard = false;
        }
    }

    // ── Better chat: tag new messages ──
    if (betterChatEnabled) {
        const teamMode = isTeamMode();
        for (const mut of mutations) {
            for (const node of mut.addedNodes) {
                if (!isChatMessage(node)) continue;
                const chatMsg = node.querySelector('.chatMsg');
                if (!chatMsg) continue;

                // Remove "Text & Voice Chat" system messages
                if (chatMsg.textContent?.includes('Text & Voice Chat')) {
                    node.remove();
                    continue;
                }

                // Only tag in team modes with proper chat messages
                if (!teamMode) continue;
                if (!chatMsg.innerHTML.includes('\u202E:')) continue;
                if (!node.dataset.tab) continue;

                const isTeam = node.dataset.tab === '1';
                const tag = document.createElement('div');
                tag.style.cssText = 'float:left; margin-right:4px; font-weight:bold;';
                tag.style.color = isTeam ? '#00FF00' : '#FF0000';
                tag.textContent = isTeam ? '[T]' : '[M]';
                chatMsg.insertBefore(tag, chatMsg.firstChild);
            }
        }
    }

    // Auto-scroll to bottom unless the user has scrolled up
    if (chatList && !scrollPaused) {
        chatList.scrollTop = chatList.scrollHeight;
    }
}

function isNearBottom(el: HTMLElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
}

function updatePauseState(): void {
    if (!chatList) return;
    const atBottom = isNearBottom(chatList);
    if (scrollPaused && atBottom) {
        scrollPaused = false;
        chatList.classList.remove('kcc-chat-paused');
    } else if (!scrollPaused && !atBottom) {
        scrollPaused = true;
        chatList.classList.add('kcc-chat-paused');
    }
}

function tryAttach(): boolean {
    chatList = document.getElementById('chatList');
    if (!chatList) return false;

    observer = new MutationObserver(handleMutations);
    observer.observe(chatList, { childList: true });

    chatList.addEventListener('scroll', updatePauseState, { passive: true });

    _con?.log('[KCC-Chat] Observer attached to #chatList');
    return true;
}

// ── Dynamic max-height so chat never overlaps menu items KCC injects ──
// Krunker 9.2.1 added its own chat clamp based on the bottom of #menuItemContainer,
// but it's calibrated against Krunker's stock menu — our injected Classic Social
// pushes Community & Events and Exit below Krunker's expected bottom, so chat
// overlaps them. We measure the *actual* bottom (which includes our items),
// translate the visual gap into CSS pixels (#uiBase is transform-scaled), and
// apply a tighter cap via .kcc-chat-clamped only when our value is tighter
// than Krunker's would be.
const CHAT_MENU_PADDING = 10; // visual px gap between chat top and menu bottom
let _chatClampTimer: number | null = null;
let _chatClampObserver: MutationObserver | null = null;

function updateChatClamp(): void {
    const root = document.documentElement;
    const list = chatList ?? document.getElementById('chatList');
    const menu = document.getElementById('menuItemContainer');
    if (!list || !menu || menu.offsetHeight === 0) {
        // Menu hidden (in-game) — let Krunker manage the chat normally.
        list?.classList.remove('kcc-chat-clamped');
        root.style.removeProperty('--kcc-chat-max');
        return;
    }
    // getBoundingClientRect is post-transform (display px); max-height is CSS px.
    // Divide by --ui-scale to convert display → CSS. Krunker sets it on <body>;
    // fall back to <html> in case it moves, then 1 if absent.
    const scaleRaw = getComputedStyle(document.body).getPropertyValue('--ui-scale')
        || getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
    const scale = parseFloat(scaleRaw) || 1;
    const menuBottom = menu.getBoundingClientRect().bottom;
    const chatBottom = list.getBoundingClientRect().bottom;
    const ceilingDisplay = chatBottom - menuBottom - CHAT_MENU_PADDING;
    if (ceilingDisplay <= 0) {
        list.classList.remove('kcc-chat-clamped');
        root.style.removeProperty('--kcc-chat-max');
        return;
    }
    const ceilingCss = Math.floor(ceilingDisplay / scale);
    root.style.setProperty('--kcc-chat-max', ceilingCss + 'px');
    list.classList.add('kcc-chat-clamped');
}

function attachChatClampObserver(): void {
    if (_chatClampObserver) return;
    const menu = document.getElementById('menuItemContainer');
    const uiBase = document.getElementById('uiBase');
    if (!menu && !uiBase) return;
    // Targeted observation — no subtree+childList combo (safe per CLAUDE.md).
    // - menuItemContainer childList: catches button injection/removal.
    // - uiBase class attr: catches onMenu/onGame transitions instantly.
    _chatClampObserver = new MutationObserver(updateChatClamp);
    if (menu) _chatClampObserver.observe(menu, { childList: true });
    if (uiBase) _chatClampObserver.observe(uiBase, { attributes: true, attributeFilter: ['class'] });
}

function startChatClamp(): void {
    if (_chatClampTimer !== null) return;
    updateChatClamp();
    attachChatClampObserver();
    window.addEventListener('resize', updateChatClamp);
    // Poll as a safety net — catches Svelte attribute-driven show/hide of
    // individual menu items, which the targeted observers miss.
    _chatClampTimer = window.setInterval(() => {
        if (!_chatClampObserver) attachChatClampObserver();
        updateChatClamp();
    }, 250);
}

export function initChat(options: { betterChat: boolean; chatHistorySize: number }, con?: SavedConsole): void {
    _con = con ?? null;
    betterChatEnabled = options.betterChat;
    historyMax = options.chatHistorySize;

    if (tryAttach()) { startChatClamp(); return; }

    // Poll until #chatList appears
    let attempts = 0;
    const poll = setInterval(() => {
        if (++attempts > 120 || tryAttach()) {
            clearInterval(poll);
            if (chatList) startChatClamp();
        }
    }, 500);
}

export function setBetterChat(enabled: boolean): void {
    betterChatEnabled = enabled;
}

export function setChatHistorySize(size: number): void {
    historyMax = size;
}
