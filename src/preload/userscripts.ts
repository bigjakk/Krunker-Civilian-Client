import { ipcRenderer, webFrame } from 'electron';

// ── Types ──

export interface ScriptMetadata {
  name: string;
  author: string;
  version: string;
  desc: string;
  src: string;
  license: string;
  runAt: 'document-start' | 'document-end';
  priority: number;
}

export interface UserscriptSetting {
  title: string;
  type: 'bool' | 'num' | 'sel' | 'color' | 'keybind';
  value: unknown;
  desc?: string;
  min?: number;
  max?: number;
  step?: number;
  opts?: (string | number)[];
  changed?: (value: unknown) => void;
}

export interface UserscriptInstance {
  filename: string;
  content: string;
  meta: ScriptMetadata;
  enabled: boolean;
  executed: boolean;
  unload: (() => void) | null;
  settings: Record<string, UserscriptSetting> | null;
}

// ── State ──

const instances: UserscriptInstance[] = [];
const cssHandles = new Map<string, string>(); // identifier -> webFrame CSS key

// ── Metadata parser ──

export function parseMetadata(code: string): ScriptMetadata {
  const meta: ScriptMetadata = {
    name: '',
    author: '',
    version: '',
    desc: '',
    src: '',
    license: '',
    runAt: 'document-end',
    priority: 0,
  };

  const startMatch = code.match(/\/\/\s*==UserScript==/);
  const endMatch = code.match(/\/\/\s*==\/UserScript==/);
  if (!startMatch || !endMatch) return meta;

  const block = code.substring(
    startMatch.index! + startMatch[0].length,
    endMatch.index!,
  );

  for (const line of block.split('\n')) {
    const m = line.match(/\/\/\s*@(\S+)\s+(.*)/);
    if (!m) continue;
    const [, tag, val] = m;
    const v = val.trim();
    switch (tag) {
      case 'name': meta.name = v; break;
      case 'author': meta.author = v; break;
      case 'version': meta.version = v; break;
      case 'desc':
      case 'description': meta.desc = v; break;
      case 'src': meta.src = v; break;
      case 'license': meta.license = v; break;
      case 'run-at':
        if (v === 'document-start') meta.runAt = 'document-start';
        else meta.runAt = 'document-end';
        break;
      case 'priority':
        meta.priority = parseInt(v, 10) || 0;
        break;
    }
  }

  return meta;
}

// ── CSS injection via webFrame ──

function toggleCSS(css: string, identifier: string, value: boolean): void {
  const existing = cssHandles.get(identifier);
  if (value) {
    if (existing) return; // already inserted
    const key = webFrame.insertCSS(css);
    cssHandles.set(identifier, key);
  } else {
    if (!existing) return;
    webFrame.removeInsertedCSS(existing);
    cssHandles.delete(identifier);
  }
}

// ── Script execution ──

function executeScript(
  instance: UserscriptInstance,
  _console: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): void {
  if (instance.executed) return;

  const context: Record<string, unknown> = {
    _console,
    _css(css: string, identifier: string, value: boolean) {
      toggleCSS(css, instance.filename + ':' + identifier, value);
    },
    unload: null as (() => void) | null,
    settings: null as Record<string, UserscriptSetting> | null,
  };

  try {
    const fn = new Function(instance.content);
    const result = fn.apply(context);

    // Script returned `this` — capture settings and unload
    if (result === context) {
      instance.unload = (typeof context.unload === 'function') ? context.unload as () => void : null;
      instance.settings = context.settings as Record<string, UserscriptSetting> | null;
    } else {
      instance.unload = null;
      instance.settings = null;
    }

    instance.executed = true;
    _console.log('[KCC] Userscript executed:', instance.meta.name || instance.filename);
  } catch (err) {
    _console.error('[KCC] Userscript error in', instance.filename, ':', err);
  }
}

// ── Apply saved preferences ──

async function applyPreferences(instance: UserscriptInstance): Promise<void> {
  if (!instance.settings) return;
  const saved = await ipcRenderer.invoke('userscripts-load-prefs', instance.filename);
  for (const key of Object.keys(instance.settings)) {
    if (key in saved) {
      const setting = instance.settings[key];
      setting.value = saved[key];
      if (typeof setting.changed === 'function') {
        try { setting.changed(setting.value); } catch { /* ignore callback errors */ }
      }
    }
  }
}

// ── Public API ──

export function getInstances(): UserscriptInstance[] {
  return instances;
}

export async function initUserscripts(
  _console: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): Promise<void> {
  const { scripts, tracker } = await ipcRenderer.invoke('userscripts-scan');
  if (!scripts || scripts.length === 0) {
    _console.log('[KCC] No userscripts found');
    return;
  }

  // Build instances
  for (const script of scripts) {
    const meta = parseMetadata(script.content);
    instances.push({
      filename: script.filename,
      content: script.content,
      meta,
      enabled: tracker[script.filename] === true,
      executed: false,
      unload: null,
      settings: null,
    });
  }

  // Sort by priority descending
  instances.sort((a, b) => b.meta.priority - a.meta.priority);

  // Execute document-start scripts
  for (const inst of instances) {
    if (inst.enabled && inst.meta.runAt === 'document-start') {
      executeScript(inst, _console);
      await applyPreferences(inst);
    }
  }

  // Execute document-end scripts
  const runDocEnd = () => {
    for (const inst of instances) {
      if (inst.enabled && inst.meta.runAt === 'document-end' && !inst.executed) {
        executeScript(inst, _console);
        applyPreferences(inst);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDocEnd, { once: true });
  } else {
    runDocEnd();
  }

  _console.log('[KCC] Userscripts initialized:', instances.length, 'scripts loaded');
}

export function setScriptEnabled(
  filename: string,
  enabled: boolean,
  _console: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): { needsReload: boolean } {
  const inst = instances.find(i => i.filename === filename);
  if (!inst) return { needsReload: false };

  inst.enabled = enabled;

  // Update tracker
  const tracker: Record<string, boolean> = {};
  for (const i of instances) tracker[i.filename] = i.enabled;
  ipcRenderer.invoke('userscripts-set-tracker', tracker);

  if (!enabled) {
    if (inst.unload && inst.executed) {
      try {
        inst.unload();
        _console.log('[KCC] Userscript unloaded:', inst.meta.name || inst.filename);
      } catch (err) {
        _console.error('[KCC] Userscript unload error:', err);
      }
      inst.executed = false;
      inst.unload = null;
      inst.settings = null;
      return { needsReload: false };
    }
    // No unload function — need page reload to fully disable
    return { needsReload: inst.executed };
  } else {
    // Enabling
    if (!inst.executed) {
      executeScript(inst, _console);
      applyPreferences(inst);
      return { needsReload: false };
    }
    return { needsReload: false };
  }
}
