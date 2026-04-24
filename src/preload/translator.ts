import type { SavedConsole } from './utils';

// ── Config ──

interface TranslatorConfig {
  enabled: boolean;
  targetLanguage: string;
  showLanguageTag: boolean;
  customSkipWords: string;
}

const DEFAULTS: TranslatorConfig = {
  enabled: true,
  targetLanguage: 'en',
  showLanguageTag: true,
  customSkipWords: '',
};

// ── Module state ──

let _con: SavedConsole;
let cfg: TranslatorConfig = { ...DEFAULTS };
let chatObserver: MutationObserver | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Translation cache (sessionStorage, 10-min expiry) ──

const CACHE_KEY_PREFIX = 'kccTL_';
const CACHE_EXPIRY_MS = 10 * 60 * 1000;

interface CacheEntry {
  t: string;   // translation
  l: string;   // source language
  ts: number;  // timestamp
}

function cacheGet(text: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + text.toLowerCase().trim());
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_EXPIRY_MS) return null;
    return entry;
  } catch { return null; }
}

function cacheSet(text: string, translation: string, srcLang: string): void {
  try {
    const entry: CacheEntry = { t: translation, l: srcLang, ts: Date.now() };
    sessionStorage.setItem(CACHE_KEY_PREFIX + text.toLowerCase().trim(), JSON.stringify(entry));
  } catch { /* sessionStorage full */ }
}

// ── Skip terms (gaming/chat slang — never sent for translation) ──

const SKIP_TERMS = new Set([
  // Greetings & basics
  'hi', 'hey', 'hello', 'yo', 'sup', 'bye', 'cya', 'gn', 'gm',
  'yes', 'no', 'yep', 'yea', 'yeah', 'nah', 'nope', 'ok', 'okay', 'kk',
  // Chat abbreviations
  'lol', 'lmao', 'lmfao', 'rofl', 'omg', 'omfg', 'wtf', 'wth',
  'bruh', 'bro', 'dude', 'man', 'brb', 'afk', 'gtg', 'g2g',
  'smh', 'tbh', 'imo', 'imho', 'ngl', 'fr', 'frfr', 'fax',
  'idk', 'idc', 'idgaf', 'nvm', 'stfu', 'pls', 'plz',
  'thx', 'ty', 'tysm', 'np', 'yw', 'mb', 'sry', 'sorry',
  'bet', 'cap', 'nocap', 'sus', 'mid', 'based', 'cringe', 'ratio',
  'rip', 'oof', 'uwu', 'owo', 'xd', 'xdd', 'xddd', 'lel', 'kek',
  'damn', 'dang', 'boi', 'fam', 'goat', 'goated',
  'lit', 'vibe', 'vibes', 'lowkey', 'highkey', 'deadass',
  'nice', 'cool', 'sick', 'fire', 'trash', 'ass', 'toxic',
  'wow', 'whoa', 'wha', 'huh', 'wat', 'wut', 'hmm',
  // Gaming general
  'gg', 'ggwp', 'ggez', 'wp', 'ez', 'gl', 'hf', 'glhf',
  'nt', 'ns', 'gj', 'mvp', 'clutch', 'ace', 'carry',
  'noob', 'newb', 'n00b', 'bot', 'tryhard', 'sweat', 'sweaty',
  'hack', 'hacks', 'hacker', 'hax', 'cheater', 'cheats',
  'lag', 'laggy', 'ping', 'fps', 'dc', 'disconnect',
  'nerf', 'buff', 'op', 'broken', 'meta', 'spam', 'camp', 'camper',
  'aim', 'aimbot', 'wh', 'wallhack', 'esp',
  'rush', 'push', 'rotate', 'flank', 'peek', 'hold',
  'one', 'low', 'dead', 'down', 'res', 'revive',
  'w', 'l', 'dub', 'win', 'loss', 'f', 'ggs',
  // Krunker-specific
  'kr', 'ak', 'smg', 'sniper', 'shotty', 'rev', 'semi',
  'crossy', 'famas', 'rpg', 'lmg', 'deagle', 'comp',
  'pub', 'pubs', 'ranked', 'nuke', 'nuked', 'nuking',
  'kpd', 'bhop', 'bhopping', 'slidehopping', 'slidehop',
  'krunker', 'krunky', 'yendis', 'krunkitis',
  'contra', 'relic', 'unob', 'unobtainable', 'spin',
  'market', 'trade', 'gift', 'drop', 'drops', 'skin', 'skins',
  'clan', 'verified', 'lvl', 'level',
  'trig', 'trigger', 'runner', 'det', 'detective',
  'vince', 'bowman', 'spray', 'agent', 'rocketeer',
  'streamer', 'ttv',
  // Emoticons
  ':)', ':(', ':d', ':p', ':o', '<3',
]);

// ── Custom (user-provided) skip words ──

let customSkipWords: Set<string> = new Set();

function parseCustomSkipWords(raw: string): Set<string> {
  return new Set(
    raw.split(/[,\s]+/)
      .map(w => w.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ── False-positive source languages ──

const FALSE_POSITIVE_LANGS = new Set([
  'so', 'cy', 'ht', 'hmn', 'ceb', 'haw', 'la', 'mg', 'mi',
  'ny', 'sm', 'st', 'su', 'sw', 'tl', 'yo', 'zu', 'sn',
  'ig', 'rw', 'co', 'fy', 'gd', 'lb', 'mt', 'eo',
]);

// ── Auto-suppression (repeated short phrases) ──

let suppressionCounts = new Map<string, number>();
const SUPPRESS_THRESHOLD = 3;
const MIN_LATIN_WORDS = 3;
const SHORT_TEXT_THRESHOLD = 15;

// ── Concurrency control ──

let activeRequests = 0;
const MAX_CONCURRENT = 3;
const MAX_QUEUE = 15;
const pendingQueue: Array<() => void> = [];

function enqueue(fn: () => Promise<void>): void {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    fn().finally(() => {
      activeRequests--;
      if (pendingQueue.length > 0) pendingQueue.shift()!();
    });
  } else {
    // Drop oldest if queue is full — old messages have already scrolled off-screen
    if (pendingQueue.length >= MAX_QUEUE) pendingQueue.shift();
    pendingQueue.push(() => enqueue(fn));
  }
}

// ── Periodic cleanup (prevents unbounded memory growth in long sessions) ──

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    // Reset suppression counts (re-learned naturally from fresh messages)
    suppressionCounts = new Map();

    // Prune expired sessionStorage cache entries
    const now = Date.now();
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(CACHE_KEY_PREFIX)) continue;
      try {
        const entry: CacheEntry = JSON.parse(sessionStorage.getItem(key) || '');
        if (now - entry.ts > CACHE_EXPIRY_MS) keysToRemove.push(key);
      } catch { keysToRemove.push(key); }
    }
    for (const key of keysToRemove) sessionStorage.removeItem(key);
  }, CLEANUP_INTERVAL_MS);
}

function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ── System message patterns to skip ──

const SYSTEM_PATTERNS = [
  'joined the game', 'left the game', 'has been kicked', 'has been banned',
  'vote to kick', 'press f1', 'connecting', 'connected', 'was arrested',
  'started a vote', 'was kicked', 'was banned',
];

// ── Pre-translation filtering ──

function isLatinOnly(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF\s\d.,!?;:'"()\-/@#$%^&*+=~`[\]{}|\\<>]+$/u.test(text);
}

function shouldTranslate(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 2) return false;

  // Tokenize for skip-term checking
  const words = cleaned.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return false;
  if (words.every(w => SKIP_TERMS.has(w) || customSkipWords.has(w))) return false;

  // Auto-suppressed phrases
  const key = cleaned.toLowerCase();
  if ((suppressionCounts.get(key) ?? 0) >= SUPPRESS_THRESHOLD) return false;

  // Non-Latin characters = almost certainly needs translation
  if (!isLatinOnly(cleaned)) return true;

  // Latin-only: require minimum word count (short English slang triggers false positives)
  if (words.length < MIN_LATIN_WORDS) {
    // Allow if accented characters suggest non-English
    if (!/[À-ÿ]/.test(cleaned)) return false;
  }

  return true;
}

// ── Chat text extraction ──

interface ChatExtraction {
  message: string;
  username: string;  // "Username:" prefix or empty
}

function extractChatText(node: HTMLElement): ChatExtraction | null {
  const text = node.textContent?.trim();
  if (!text || text.length < 2) return null;

  // Skip nodes with images (kill feed has weapon/skull icons)
  if (node.querySelector('img')) return null;

  // Skip commands
  if (text.startsWith('/')) return null;

  // Skip system messages
  const lower = text.toLowerCase();
  if (SYSTEM_PATTERNS.some(p => lower.includes(p))) return null;

  // Extract message content after "Username: " prefix
  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx < 25) {
    const username = text.substring(0, colonIdx + 1);
    const msg = text.substring(colonIdx + 1).trim();
    return msg.length >= 2 ? { message: msg, username } : null;
  }

  return { message: text, username: '' };
}

// ── Google Translate API ──

async function translateText(text: string): Promise<{ translation: string; srcLang: string } | null> {
  // Check cache
  const cached = cacheGet(text);
  if (cached) return { translation: cached.t, srcLang: cached.l };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='
      + cfg.targetLanguage + '&dt=t&q=' + encodeURIComponent(text);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      _con.warn('[KCC-TL] HTTP', response.status);
      return null;
    }

    const data = await response.json();
    if (!data?.[0]?.[0]) return null;

    const translation = (data[0] as any[]).map((item: any) => item[0]).join('');
    const srcLang: string = data[2] || 'unknown';

    // Already in target language
    if (srcLang === cfg.targetLanguage) return null;

    // Identical translation (strip punctuation/whitespace for robust comparison)
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm(translation) === norm(text)) return null;

    // Post-filter: false-positive languages on short text
    if (text.length < SHORT_TEXT_THRESHOLD && FALSE_POSITIVE_LANGS.has(srcLang)) {
      const key = text.toLowerCase().trim();
      suppressionCounts.set(key, (suppressionCounts.get(key) ?? 0) + 1);
      return null;
    }

    // Track short phrases for auto-suppression learning
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount <= 2) {
      const key = text.toLowerCase().trim();
      const count = (suppressionCounts.get(key) ?? 0) + 1;
      suppressionCounts.set(key, count);
      if (count >= SUPPRESS_THRESHOLD) return null;
    }

    cacheSet(text, translation, srcLang);
    return { translation, srcLang };
  } catch (err: any) {
    if (err.name !== 'AbortError') _con.warn('[KCC-TL] Error:', err.message);
    return null;
  }
}

// ── DOM manipulation ──

function appendTranslation(chatNode: HTMLElement, username: string, translation: string, srcLang: string): void {
  const div = document.createElement('div');
  div.className = 'kcc-translation';

  const langTag = (cfg.showLanguageTag && srcLang !== 'unknown') ? ' [' + srcLang.toUpperCase() + ']' : '';
  div.textContent = '\u{1F310} ' + (username ? username + ' ' : '') + translation + langTag;
  chatNode.appendChild(div);
}

// ── Message processing ──

function processMessage(node: HTMLElement): void {
  if (node.hasAttribute('data-kcc-translated')) return;
  node.setAttribute('data-kcc-translated', '1');

  const extracted = extractChatText(node);
  if (!extracted) return;
  if (!shouldTranslate(extracted.message)) return;

  const { message, username } = extracted;
  enqueue(async () => {
    // Node may have been removed by chat history trimming while queued
    if (!node.isConnected) return;
    const result = await translateText(message);
    if (result && node.isConnected) appendTranslation(node, username, result.translation, result.srcLang);
  });
}

// ── Observer lifecycle ──

function startObserver(): void {
  if (chatObserver) return;

  let attempts = 0;
  pollTimer = setInterval(() => {
    attempts++;
    const chatList = document.getElementById('chatList');
    if (!chatList) {
      if (attempts > 60) {
        clearInterval(pollTimer!);
        pollTimer = null;
        _con.warn('[KCC-TL] #chatList not found after 30s, giving up');
      }
      return;
    }

    clearInterval(pollTimer!);
    pollTimer = null;

    chatObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) processMessage(node as HTMLElement);
        }
      }
    });

    chatObserver.observe(chatList, { childList: true });
    startCleanup();
    _con.log('[KCC-TL] Chat observer active');
  }, 500);
}

function stopObserver(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
  stopCleanup();
  pendingQueue.length = 0;
}

// ── Public API ──

export function initTranslator(savedConsole: SavedConsole, initCfg: TranslatorConfig): void {
  _con = savedConsole;
  cfg = {
    enabled: initCfg.enabled ?? DEFAULTS.enabled,
    targetLanguage: initCfg.targetLanguage ?? DEFAULTS.targetLanguage,
    showLanguageTag: initCfg.showLanguageTag ?? DEFAULTS.showLanguageTag,
    customSkipWords: initCfg.customSkipWords ?? DEFAULTS.customSkipWords,
  };
  customSkipWords = parseCustomSkipWords(cfg.customSkipWords);

  if (!cfg.enabled) {
    _con.log('[KCC-TL] Translator disabled');
    return;
  }

  _con.log('[KCC-TL] Initializing (target: ' + cfg.targetLanguage + ')');
  startObserver();
}

export function updateTranslatorConfig(update: Partial<TranslatorConfig>): void {
  if (update.enabled !== undefined) {
    cfg.enabled = update.enabled;
    if (update.enabled && !chatObserver) startObserver();
    if (!update.enabled) stopObserver();
  }
  if (update.targetLanguage !== undefined) cfg.targetLanguage = update.targetLanguage;
  if (update.showLanguageTag !== undefined) cfg.showLanguageTag = update.showLanguageTag;
  if (update.customSkipWords !== undefined) {
    cfg.customSkipWords = update.customSkipWords;
    customSkipWords = parseCustomSkipWords(update.customSkipWords);
  }
}
