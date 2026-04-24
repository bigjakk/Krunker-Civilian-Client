import { BrowserWindow } from 'electron';

const UPDATE_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
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
</style>
</head>
<body>
  <h2>Krunker Civilian Client</h2>
  <div id="status">Checking for updates...</div>
  <div class="progress-container">
    <div class="progress-bar" id="progressBar"></div>
  </div>
</body>
</html>`;

const UPDATE_DATA_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(UPDATE_HTML);

export function showUpdateWindow(): { window: BrowserWindow; sendProgress: (message: string, percent?: number) => void } {
  const win = new BrowserWindow({
    width: 450,
    height: 180,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
    title: 'Krunker Civilian Client - Update',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.removeMenu();

  win.loadURL(UPDATE_DATA_URL);

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
