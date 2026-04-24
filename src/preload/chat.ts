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

export function initChat(options: { betterChat: boolean; chatHistorySize: number }, con?: SavedConsole): void {
    _con = con ?? null;
    betterChatEnabled = options.betterChat;
    historyMax = options.chatHistorySize;

    if (tryAttach()) return;

    // Poll until #chatList appears
    let attempts = 0;
    const poll = setInterval(() => {
        if (++attempts > 120 || tryAttach()) clearInterval(poll);
    }, 500);
}

export function setBetterChat(enabled: boolean): void {
    betterChatEnabled = enabled;
}

export function setChatHistorySize(size: number): void {
    historyMax = size;
}
