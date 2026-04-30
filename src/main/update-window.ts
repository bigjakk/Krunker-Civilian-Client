import { BrowserWindow } from 'electron';

// Shared base styling — both the prompt and the progress window use it so they
// feel like the same dialog at different states.
const SHARED_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a1a;
    color: rgba(255,255,255,0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 20px;
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 14px;
    color: #fff;
    letter-spacing: -0.01em;
  }
  #status {
    font-size: 13px;
    margin-bottom: 14px;
    color: rgba(255,255,255,0.65);
    text-align: center;
    line-height: 1.5;
  }
  .progress-container {
    width: 100%;
    height: 6px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #42a5f5, #6ea8fe);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .buttons {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  button {
    flex: 1;
    padding: 9px 12px;
    border: none;
    border-radius: 3px;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: filter 0.15s, background 0.15s;
  }
  button.primary { background: linear-gradient(90deg, #42a5f5, #6ea8fe); }
  button.primary:hover { filter: brightness(1.1); }
  button.secondary { background: rgba(255,255,255,0.08); }
  button.secondary:hover { background: rgba(255,255,255,0.15); }
`;

const PROGRESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_CSS}</style></head>
<body>
  <h2>Krunker Civilian Client</h2>
  <div id="status">Checking for updates...</div>
  <div class="progress-container">
    <div class="progress-bar" id="progressBar"></div>
  </div>
</body></html>`;

const PROGRESS_DATA_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(PROGRESS_HTML);

function buildPromptHTML(version: string, currentVersion: string): string {
  // Buttons signal choice via console.log — captured by webContents
  // 'console-message' in main. Works on data: URLs without needing a preload.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_CSS}</style></head>
<body>
  <h2>Update Available</h2>
  <div id="status">v${version} is ready to install.<br>You're currently on v${currentVersion}.</div>
  <div class="buttons">
    <button class="secondary" onclick="console.log('KCC_UPDATE:skip')">Skip</button>
    <button class="primary" onclick="console.log('KCC_UPDATE:accept')">Update Now</button>
  </div>
</body></html>`;
}

const BASE_WINDOW_OPTS = {
  width: 450,
  resizable: false,
  alwaysOnTop: true,
  backgroundColor: '#1a1a1a',
  autoHideMenuBar: true,
  webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
};

export function showUpdatePrompt(version: string, currentVersion: string): Promise<boolean> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      ...BASE_WINDOW_OPTS,
      height: 180,
      title: 'Krunker Civilian Client - Update Available',
    });
    win.removeMenu();

    let resolved = false;
    const finish = (accept: boolean) => {
      if (resolved) return;
      resolved = true;
      if (!win.isDestroyed()) win.close();
      resolve(accept);
    };

    // Capture button click via console.log (works on data: URLs without a preload).
    // Handle both old (event, level, message, ...) and new (event-object) signatures.
    win.webContents.on('console-message', (...args: unknown[]) => {
      let message = '';
      for (const arg of args) {
        if (typeof arg === 'string') { message = arg; break; }
        if (arg && typeof arg === 'object' && 'message' in arg && typeof (arg as { message: unknown }).message === 'string') {
          message = (arg as { message: string }).message;
          break;
        }
      }
      if (message === 'KCC_UPDATE:accept') finish(true);
      else if (message === 'KCC_UPDATE:skip') finish(false);
    });
    win.on('closed', () => finish(false));

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildPromptHTML(version, currentVersion)));
  });
}

export function showUpdateWindow(): { window: BrowserWindow; sendProgress: (message: string, percent?: number) => void } {
  const win = new BrowserWindow({
    ...BASE_WINDOW_OPTS,
    height: 160,
    title: 'Krunker Civilian Client - Update',
  });
  win.removeMenu();
  win.loadURL(PROGRESS_DATA_URL);

  function sendProgress(message: string, percent?: number): void {
    if (!win.isDestroyed()) {
      win.webContents.executeJavaScript(`(() => {
        const s = document.getElementById('status');
        const p = document.getElementById('progressBar');
        if (s) s.textContent = ${JSON.stringify(message)};
        if (p && typeof ${JSON.stringify(percent)} === 'number') p.style.width = ${JSON.stringify(percent)} + '%';
      })()`).catch(() => {});
    }
  }

  return { window: win, sendProgress };
}
