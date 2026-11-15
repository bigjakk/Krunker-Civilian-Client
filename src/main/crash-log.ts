import { app } from 'electron';
import { electronLog } from './logger';

// Call before app.ready so a GPU process that dies during startup is logged too
export function logProcessCrashes(): void {
  app.on('render-process-gone', (_e, wc, details) => {
    const url = wc.isDestroyed() ? '' : wc.getURL().slice(0, 120);
    electronLog.error(`[KCC] Renderer gone: reason=${details.reason} exitCode=${details.exitCode} url=${url}`);
  });
  app.on('child-process-gone', (_e, details) => {
    const name = details.name ? ` (${details.name})` : '';
    electronLog.error(`[KCC] ${details.type} process${name} gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });
}
