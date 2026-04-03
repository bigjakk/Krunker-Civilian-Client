import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, unlinkSync, createWriteStream, WriteStream } from 'fs';

const LOG_RETENTION_DAYS = 7;

let electronStream: WriteStream;
let electronPath: string;
let ready = false;

function dateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pruneOldLogs(logDir: string): void {
  try {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000;
    for (const file of readdirSync(logDir)) {
      const m = file.match(/^electron-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!m) continue;
      const fileDate = new Date(m[1] + 'T00:00:00').getTime();
      if (fileDate < cutoff) {
        try { unlinkSync(join(logDir, file)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function init(): void {
  if (ready) return;
  const logDir = join(app.getPath('userData'), 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  pruneOldLogs(logDir);

  const stamp = dateStamp();
  electronPath = join(logDir, `electron-${stamp}.log`);

  // Append to today's log — one file per day, multiple sessions
  electronStream = createWriteStream(electronPath, { flags: 'a' });

  const sep = `\n${'='.repeat(60)}\n  Session started ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
  electronStream.write(sep);
  ready = true;
}

function ts(): string {
  return new Date().toISOString();
}

function fmt(...args: unknown[]): string {
  return args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

function makeLogger(getStream: () => WriteStream) {
  return {
    log: (...args: unknown[]) => { init(); const m = fmt(...args); console.log(m); if (!closed) getStream().write(`[${ts()}] ${m}\n`); },
    warn: (...args: unknown[]) => { init(); const m = fmt(...args); console.warn(m); if (!closed) getStream().write(`[${ts()}] WARN: ${m}\n`); },
    error: (...args: unknown[]) => { init(); const m = fmt(...args); console.error(m); if (!closed) getStream().write(`[${ts()}] ERROR: ${m}\n`); },
  };
}

export const electronLog = makeLogger(() => electronStream);

export function getLogPath(_type: 'electron'): string {
  init();
  return electronPath;
}

let closed = false;

export function closeLogStreams(): void {
  closed = true;
  if (electronStream) electronStream.end();
}
