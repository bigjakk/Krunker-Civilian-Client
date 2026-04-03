import { mkdirSync, promises as fsp } from 'fs';
import { join, parse } from 'path';

export interface ScriptFile {
  filename: string;
  content: string;
  fullpath: string;
}

export type ScriptTracker = Record<string, boolean>;

/**
 * Manages userscript files, tracker state, and per-script preferences.
 * Scripts live in a `scripts/` subdirectory; tracker.json records enabled/disabled state;
 * per-script preferences are stored in `scripts/preferences/<name>.json`.
 */
export class UserscriptManager {
  private scriptsDir: string;
  private prefsDir: string;
  private trackerPath: string;

  constructor(baseDir: string) {
    this.scriptsDir = join(baseDir, 'scripts');
    this.prefsDir = join(this.scriptsDir, 'preferences');
    this.trackerPath = join(this.scriptsDir, 'tracker.json');
    mkdirSync(this.scriptsDir, { recursive: true });
    mkdirSync(this.prefsDir, { recursive: true });
  }

  get dir(): string {
    return this.scriptsDir;
  }

  /** Read all .js files from the scripts directory */
  async scanScripts(): Promise<ScriptFile[]> {
    const scripts: ScriptFile[] = [];
    try {
      for (const entry of await fsp.readdir(this.scriptsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const fullpath = join(this.scriptsDir, entry.name);
        try {
          const content = await fsp.readFile(fullpath, 'utf-8');
          scripts.push({ filename: entry.name, content, fullpath });
        } catch { /* skip unreadable files */ }
      }
    } catch { /* directory read failed */ }
    return scripts;
  }

  /** Load tracker.json, add new scripts as disabled, prune deleted scripts */
  async loadTracker(scripts: ScriptFile[]): Promise<ScriptTracker> {
    let tracker: ScriptTracker;
    try {
      tracker = JSON.parse(await fsp.readFile(this.trackerPath, 'utf-8'));
    } catch { tracker = {}; }

    const filenames = new Set(scripts.map(s => s.filename));
    let dirty = false;

    // Add new scripts as disabled
    for (const name of filenames) {
      if (!(name in tracker)) { tracker[name] = false; dirty = true; }
    }

    // Prune deleted scripts
    for (const name of Object.keys(tracker)) {
      if (!filenames.has(name)) { delete tracker[name]; dirty = true; }
    }

    if (dirty) await this.saveTracker(tracker);
    return tracker;
  }

  /** Write tracker.json */
  async saveTracker(tracker: ScriptTracker): Promise<void> {
    try {
      await fsp.writeFile(this.trackerPath, JSON.stringify(tracker, null, 2), 'utf-8');
    } catch { /* write failed */ }
  }

  /** Load per-script preferences from preferences/<name>.json */
  async loadScriptPrefs(filename: string): Promise<Record<string, unknown>> {
    const name = parse(filename).name;
    const prefsPath = join(this.prefsDir, name + '.json');
    try {
      return JSON.parse(await fsp.readFile(prefsPath, 'utf-8'));
    } catch { /* parse failed or file not found */ }
    return {};
  }

  /** Save per-script preferences to preferences/<name>.json */
  async saveScriptPrefs(filename: string, prefs: Record<string, unknown>): Promise<void> {
    const name = parse(filename).name;
    const prefsPath = join(this.prefsDir, name + '.json');
    try {
      await fsp.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
    } catch { /* write failed */ }
  }
}
