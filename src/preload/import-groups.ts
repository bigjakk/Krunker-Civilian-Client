// Krunker settings (localStorage `kro_setngss_<id>`) grouped so an import can leave them out.

export type ImportGroup = 'keybinds' | 'sensitivity' | 'audio';

export interface ImportChoice {
  id: ImportGroup;
  label: string;
  checked: boolean;
}

const KRUNKER_PREFIX = 'kro_setngss_';
const AUDIO_IDS = ['sound', 'audioInput', 'micQuality', 'voiceDistance'];
const GROUPS: Array<{ id: ImportGroup; label: string }> = [
  { id: 'keybinds', label: 'Import keybinds' },
  { id: 'sensitivity', label: 'Import sensitivity' },
  { id: 'audio', label: 'Import audio' },
];

export function newImportChoices(): ImportChoice[] {
  return GROUPS.map((g) => ({ ...g, checked: true }));
}

export function skippedGroups(choices: ImportChoice[]): Set<ImportGroup> {
  return new Set(choices.filter((c) => !c.checked).map((c) => c.id));
}

function groupOfSetting(id: string): ImportGroup | null {
  if (id === 'controls') return 'keybinds';
  if (/sensitivity/i.test(id)) return 'sensitivity';
  if (AUDIO_IDS.includes(id) || /volume$/i.test(id)) return 'audio';
  return null;
}

export function isSkippedKey(key: string, skip: Set<ImportGroup>): boolean {
  if (skip.size === 0) return false;
  const id = key.startsWith(KRUNKER_PREFIX) ? key.slice(KRUNKER_PREFIX.length) : key;
  const group = groupOfSetting(id);
  return group !== null && skip.has(group);
}

// localStorage holds every value as a bare string, the payload holds them typed.
function coerce(raw: string, sample: unknown): string | number | boolean {
  if (typeof sample === 'boolean') return raw === 'true';
  if (typeof sample === 'number') return Number.isNaN(Number(raw)) ? raw : Number(raw);
  return raw;
}

// Krunker resets anything missing from the payload to its default, so a skipped group
// is re-pinned to the current values — except controls, which it leaves alone when absent.
export function applyNativeSkips(json: Record<string, unknown>, skip: Set<ImportGroup>): void {
  if (skip.size === 0) return;
  const ids = new Set(Object.keys(json));
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(KRUNKER_PREFIX)) ids.add(key.slice(KRUNKER_PREFIX.length));
  }
  for (const id of ids) {
    const group = groupOfSetting(id);
    if (group === null || !skip.has(group)) continue;
    const current = group === 'keybinds' ? null : localStorage.getItem(KRUNKER_PREFIX + id);
    if (current === null) delete json[id];
    else json[id] = coerce(current, json[id]);
  }
}
