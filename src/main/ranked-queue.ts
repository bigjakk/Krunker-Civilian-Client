import { BrowserWindow } from 'electron';
import { QUEUE_NOTIFICATION_AUDIO } from './ranked-queue-audio';

export const DEFAULT_RANKED_AUDIO_URL = `data:audio/mpeg;base64,${QUEUE_NOTIFICATION_AUDIO}`;

let queueWindow: BrowserWindow | null = null;

const RANKED_QUEUE_WS = 'wss://gamefrontend.svc.krunker.io/v1/matchmaking/queue';

const RANKED_MAPS: Record<string, { number: number; image: string }> = {
    sandstorm_v3: { number: 2,  image: 'https://assets.krunker.io/img/maps/map_2.png' },
    undergrowth:  { number: 4,  image: 'https://assets.krunker.io/img/maps/map_4.png' },
    industry:     { number: 11, image: 'https://assets.krunker.io/img/maps/map_11.png' },
    site:         { number: 14, image: 'https://assets.krunker.io/img/maps/map_14.png' },
    bureau:       { number: 17, image: 'https://assets.krunker.io/img/maps/map_17.png' },
    burg_new:     { number: 0,  image: 'https://assets.krunker.io/img/maps/map_0.png' },
    eterno_sim:   { number: 39, image: 'https://assets.krunker.io/img/maps/map_39.png' },
};

const RANKED_REGIONS: Record<string, string> = {
    na: 'North America',
    eu: 'Europe',
    as: 'Asia',
};

const QUEUE_CSS = `
* { user-select: none; margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Trebuchet MS", sans-serif;
  background: #0d0d0d;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e0e0e0;
  overflow: hidden;
}
.queuer-container {
  position: relative;
  background: #1a1a1a;
  padding: 40px 52px;
  max-width: 1000px;
  width: 90vw;
  border: 2px solid #2a2a2a;
  border-top: 3px solid #06b6d4;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.7);
  border-radius: 4px;
}
.main-content { display: flex; align-items: center; gap: 56px; }
.left-section { flex: 1; display: flex; flex-direction: column; gap: 24px; }
.status-area {
  display: flex; align-items: center; gap: 14px;
  position: relative; padding-left: 18px;
}
.status-area::before {
  content: ""; position: absolute; left: 0;
  width: 8px; height: 8px; background: #666;
  border-radius: 50%; transition: background 0.3s ease;
}
.status-area.active::before {
  background: #06b6d4;
  box-shadow: 0 0 12px rgba(6, 182, 212, 0.6);
}
#queueStatus {
  font-size: 14px; font-weight: 600; color: #666;
  text-transform: uppercase; letter-spacing: 1px;
  transition: color 0.3s ease;
}
#queueStatus.active { color: #06b6d4; }
.timer-display {
  font-size: 52px; font-weight: 700; color: #fff;
  font-variant-numeric: tabular-nums; letter-spacing: 0.5px;
  padding: 12px 16px; background: #222;
  border-left: 3px solid #06b6d4; border-radius: 2px;
}
.region-controls { display: flex; gap: 12px; }
.region-option { position: relative; }
.region-option input { display: none; }
.region-option label {
  display: block; padding: 12px 24px; background: #222;
  border: 2px solid #2d2d2d; border-radius: 4px;
  color: #888; font-size: 16px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  cursor: pointer; transition: all 0.2s ease;
}
.region-option label:hover { background: #2a2a2a; border-color: #3a3a3a; }
.region-option input:checked + label {
  background: rgba(6, 182, 212, 0.1);
  border-color: #06b6d4; color: #06b6d4;
}
.divider { width: 1px; height: 120px; background: #2a2a2a; }
.right-section { display: flex; flex-direction: column; gap: 14px; }
.btn {
  padding: 16px 42px; border: 2px solid transparent;
  font-size: 20px; font-weight: 600; cursor: pointer;
  transition: all 0.2s ease; font-family: "Trebuchet MS", sans-serif;
  text-transform: uppercase; letter-spacing: 1px; border-radius: 4px;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-secondary { background: #222; color: #999; border-color: #2a2a2a; }
.btn-secondary:hover:not(:disabled) { background: #2a2a2a; border-color: #3a3a3a; }
.btn-primary { background: #06b6d4; color: #fff; border-color: #06b6d4; }
.btn-primary:hover:not(:disabled) { background: #0ea5ca; border-color: #0ea5ca; }
.btn-primary:active:not(:disabled) { transform: scale(0.98); }
.btn-primary.in-queue { background: #222; border-color: #06b6d4; color: #06b6d4; }
.btn-primary.in-queue:hover:not(:disabled) { background: rgba(6, 182, 212, 0.1); }
.overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.9); display: flex;
  align-items: center; justify-content: center;
  opacity: 0; visibility: hidden; transition: all 0.3s ease; z-index: 1000;
}
.overlay.active { opacity: 1; visibility: visible; }
.popup {
  background: #1a1a1a; border: 2px solid #2a2a2a;
  border-top: 3px solid #06b6d4; max-width: 560px; width: 90vw;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8);
  text-align: center; transform: scale(0.95);
  transition: transform 0.3s ease; border-radius: 4px;
}
.overlay.active .popup { transform: scale(1); }
.popup h2 {
  margin-top: 12px; font-size: 32px; font-weight: 700;
  color: #06b6d4; text-transform: uppercase; letter-spacing: 1.5px;
}
.popup-content { margin: 20px 0; }
.popup-content p {
  font-size: 15px; color: #888; margin-bottom: 12px;
  text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
}
.region-found {
  font-size: 18px; font-weight: 700; color: #fff;
  text-transform: uppercase; letter-spacing: 1px;
  display: inline-block; padding: 12px 24px;
  background: rgba(6, 182, 212, 0.15);
  border: 2px solid #06b6d4; border-radius: 4px;
}
.countdown-large {
  font-size: 48px; font-weight: 700; color: #06b6d4;
  margin: 16px 0; font-variant-numeric: tabular-nums; line-height: 1;
}
#matchFoundMessage {
  margin-top: 12px; font-size: 20px; color: #fff;
  text-align: center; width: 400px; margin-left: auto; margin-right: auto;
}
#closeButton {
  position: absolute; right: 0; top: 0;
  margin: 10px 20px 0 0; font-size: 20px; cursor: pointer;
}
`;

function buildMapsJson(): string {
    const entries: string[] = [];
    for (const [name, data] of Object.entries(RANKED_MAPS)) {
        entries.push(`${JSON.stringify(name)}: { number: ${data.number}, image: ${JSON.stringify(data.image)} }`);
    }
    return `{ ${entries.join(', ')} }`;
}

function buildRegionsJson(): string {
    return JSON.stringify(RANKED_REGIONS);
}

function buildRegionCheckboxes(): string {
    return Object.entries(RANKED_REGIONS).map(([code, name]) => {
        const inputId = code === 'as' ? 'asia' : code;
        return `<div class="region-option"><input type="checkbox" id="${inputId}" value="${code}"><label for="${inputId}">${name === 'North America' ? 'NA' : name === 'Europe' ? 'EU' : 'Asia'}</label></div>`;
    }).join('\n');
}

function buildQueueScript(token: string, region: string, allRegions: boolean, audioUrl: string): string {
    return `
let isQueued = false;
let queueStartTime = null;
let queueInterval = null;
let queueConnection = null;
let countdownInterval = null;
let isConnecting = false;
let audioContext = null;
let notificationBuffer = null;
let currentSource = null;
let audioInitialized = false;
const selectedMaps = new Set();

const WS_URL = ${JSON.stringify(RANKED_QUEUE_WS)};
const INIT_TOKEN = ${JSON.stringify(token)};
const INIT_REGION = ${JSON.stringify(region)};
const INIT_ALL_REGIONS = ${JSON.stringify(allRegions)};
const AUDIO_URL = ${JSON.stringify(audioUrl)};
const FALLBACK_AUDIO_URL = ${JSON.stringify(DEFAULT_RANKED_AUDIO_URL)};
const maps = ${buildMapsJson()};
const regions = ${buildRegionsJson()};

const queueStatus = document.getElementById('queueStatus');
const statusArea = document.getElementById('statusArea');
const queueTimerDisplay = document.getElementById('queueTimerDisplay');
const regionCheckboxes = document.getElementById('regionCheckboxes');
const matchPopupOverlay = document.getElementById('matchPopupOverlay');
const countdownTimer = document.getElementById('countDownTimer');
const foundRegion = document.getElementById('foundRegion');
const queueButton = document.getElementById('queueButton');
const closeButton = document.getElementById('closeButton');

function saveSettings() {
    const selectedRegions = Array.from(document.querySelectorAll('#regionCheckboxes input:checked')).map(el => el.value);
    localStorage.setItem('queue_selectedRegions', JSON.stringify(selectedRegions));
}

function loadSettings() {
    const savedRegions = localStorage.getItem('queue_selectedRegions');
    if (savedRegions) {
        for (const regionId of JSON.parse(savedRegions)) {
            const checkbox = document.getElementById(regionId === 'as' ? 'asia' : regionId);
            if (checkbox) checkbox.checked = true;
        }
    } else if (INIT_REGION) {
        const checkbox = document.getElementById(INIT_REGION === 'as' ? 'asia' : INIT_REGION);
        if (checkbox) checkbox.checked = true;
        if (INIT_ALL_REGIONS) {
            for (const el of document.querySelectorAll('#regionCheckboxes input')) el.checked = true;
        }
    }
}

async function fetchAndDecode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    return await audioContext.decodeAudioData(buf);
}

async function initializeAudio() {
    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();
    try {
        notificationBuffer = await fetchAndDecode(AUDIO_URL);
    } catch (e) {
        console.warn('Custom ranked sound failed, using default:', e);
        if (AUDIO_URL !== FALLBACK_AUDIO_URL) {
            try { notificationBuffer = await fetchAndDecode(FALLBACK_AUDIO_URL); } catch {}
        }
    }
    audioInitialized = true;
}

function playNotificationSound() {
    if (!notificationBuffer || !audioContext) return;
    try {
        const source = audioContext.createBufferSource();
        source.buffer = notificationBuffer;
        source.connect(audioContext.destination);
        source.start(0);
        currentSource = source;
    } catch (e) { console.error('Audio play error:', e); }
}

function stopNotificationSound() {
    if (currentSource) {
        try { currentSource.stop(); currentSource.disconnect(); } catch {}
        currentSource = null;
    }
}

function formatTime(seconds) {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return h + ':' + m + ':' + s;
}

function updateCooldownTimer(ms) {
    const endTime = Date.now() + ms;
    function updateDisplay() {
        const remaining = Math.ceil((endTime - Date.now()) / 1000);
        if (remaining <= 0) {
            queueStatus.textContent = 'Ready';
            queueStatus.classList.remove('active');
            statusArea.classList.remove('active');
            queueButton.disabled = false;
            return;
        }
        queueStatus.textContent = 'Cooldown: ' + formatTime(remaining);
        queueButton.disabled = true;
        setTimeout(updateDisplay, 1000);
    }
    updateDisplay();
}

function updateQueueTimer() {
    if (queueStartTime) {
        const elapsed = Math.floor((Date.now() - queueStartTime) / 1000);
        queueTimerDisplay.textContent = formatTime(elapsed);
    }
}

function startQueue() {
    const selectedRegions = Array.from(document.querySelectorAll('#regionCheckboxes input:checked')).map(el => el.value);

    if (selectedRegions.length === 0) {
        queueStatus.textContent = 'Select at least one region';
        queueButton.disabled = false;
        isConnecting = false;
        return;
    }
    if (selectedMaps.size === 0) {
        queueStatus.textContent = 'Select at least one map';
        queueButton.disabled = false;
        isConnecting = false;
        return;
    }

    const wsUrl = WS_URL + '?token=' + INIT_TOKEN + '&maps=' + Array.from(selectedMaps).join(',') + '&regions=' + selectedRegions.join(',');

    try {
        queueConnection = new WebSocket(wsUrl);
    } catch (error) {
        console.error('WebSocket creation error:', error);
        queueStatus.textContent = 'Connection failed';
        queueButton.disabled = false;
        isConnecting = false;
        return;
    }

    queueConnection.onerror = (error) => {
        console.error('queueConnection error:', error);
        queueStatus.textContent = 'Connection error';
        queueStatus.classList.remove('active');
        statusArea.classList.remove('active');
        isQueued = false;
        isConnecting = false;
        queueButton.disabled = false;
    };

    queueConnection.onopen = () => {
        isQueued = true;
        isConnecting = false;
        queueStartTime = Date.now();
        queueButton.textContent = 'Leave Queue';
        queueButton.classList.add('in-queue');
        queueStatus.textContent = 'In queue';
        queueStatus.classList.add('active');
        statusArea.classList.add('active');
        updateQueueTimer();
        queueInterval = setInterval(updateQueueTimer, 1000);
        queueButton.disabled = false;
    };

    queueConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'QUEUE_STATUS':
                if (data.payload.status === 'MATCHED')
                    matchFound(data.payload.assignment.extensions.map.trim(), data.payload.assignment.extensions.region);
                break;
            case 'ERROR':
                if (data.payload.code === 'COOLDOWN') {
                    queueConnection.close();
                    isQueued = false;
                    isConnecting = false;
                    queueButton.disabled = false;
                    updateCooldownTimer(data.payload.payload.cooldown);
                }
                break;
            case 'INTERNAL_ERROR':
                queueConnection.close();
                isQueued = false;
                isConnecting = false;
                queueButton.disabled = false;
                break;
        }
    };

    queueConnection.onclose = () => {
        isQueued = false;
        isConnecting = false;
        clearInterval(queueInterval);
        queueButton.textContent = 'Start Queue';
        queueButton.classList.remove('in-queue');
        queueStatus.textContent = 'Ready';
        queueStatus.classList.remove('active');
        statusArea.classList.remove('active');
        queueTimerDisplay.textContent = '00:00:00';
        queueButton.disabled = false;
    };
}

function matchFound(map, region) {
    playNotificationSound();
    matchPopupOverlay.classList.add('active');
    region = region.slice(2);
    const regionName = regions[region] || region;
    let foundMapName = 'unknown';
    for (const [mapName, mapData] of Object.entries(maps)) {
        if (mapData.number === parseInt(map, 10)) { foundMapName = mapName; break; }
    }
    foundRegion.textContent = regionName + ', ' + foundMapName;

    const duration = 60;
    const startTime = Date.now();
    countdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, duration - elapsed);
        countdownTimer.textContent = formatTime(remaining);
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            matchPopupOverlay.classList.remove('active');
        }
    }, 1000);

    isQueued = false;
    isConnecting = false;
    clearInterval(queueInterval);
    queueButton.textContent = 'Start Queue';
    queueButton.classList.remove('in-queue');
    queueStatus.textContent = 'Ready';
    queueStatus.classList.remove('active');
    statusArea.classList.remove('active');
    queueTimerDisplay.textContent = '00:00:00';
    queueButton.disabled = false;
}

// Queue button
queueButton.onclick = async () => {
    if (isConnecting) return;
    queueButton.disabled = true;
    isConnecting = true;
    if (isQueued) {
        queueConnection.close();
    } else {
        if (!audioInitialized) await initializeAudio();
        startQueue();
    }
};

// Close match popup
closeButton.onclick = () => {
    matchPopupOverlay.classList.remove('active');
    stopNotificationSound();
    if (countdownInterval) clearInterval(countdownInterval);
};

// Region checkbox changes
for (const sel of regionCheckboxes.querySelectorAll('input')) {
    sel.onclick = () => {
        if (isQueued && queueConnection) queueConnection.close();
        saveSettings();
    };
}

// Init — select all maps unconditionally (ranked doesn't allow map choice)
for (const data of Object.values(maps)) selectedMaps.add(data.number);
loadSettings();
`;
}

function buildQueueHtml(token: string, region: string, allRegions: boolean, audioUrl: string): string {
    return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<title>Ranked Queue</title>
<style>${QUEUE_CSS}</style>
</head>
<body>
<div class="queuer-container">
  <div class="main-content">
    <div class="left-section">
      <div class="status-area" id="statusArea">
        <span id="queueStatus">Ready</span>
      </div>
      <div class="timer-display" id="queueTimerDisplay">00:00:00</div>
      <div class="region-controls" id="regionCheckboxes">
        ${buildRegionCheckboxes()}
      </div>
    </div>
    <div class="divider"></div>
    <div class="right-section">
      <button type="button" class="btn btn-primary" id="queueButton">Start Queue</button>
    </div>
  </div>
</div>
<div class="overlay" id="matchPopupOverlay">
  <div class="popup">
    <h2>Match Found</h2>
    <div class="popup-content">
      <div id="closeButton">X</div>
      <div class="region-found" id="foundRegion">Region: </div>
      <div id="matchFoundMessage">open the client and rejoin the game from the ranked menu</div>
      <div class="countdown-large" id="countDownTimer">00:00:60</div>
    </div>
  </div>
</div>
<script>${buildQueueScript(token, region, allRegions, audioUrl)}</script>
</body>
</html>`;
}

// Re-apply throttle to the open queue window (if any). No-op if not open.
export function reapplyRankedQueueThrottle(
    applyCpuThrottle: (wc: Electron.WebContents, rate: number) => void,
    rate: number,
): void {
    if (queueWindow && !queueWindow.isDestroyed()) {
        applyCpuThrottle(queueWindow.webContents, rate);
    }
}

export function openRankedQueue(
    token: string,
    region: string,
    allRegions: boolean,
    audioUrl: string,
    applyCpuThrottle?: (wc: Electron.WebContents, rate: number) => void,
    getMenuRate?: () => number,
): void {
    if (queueWindow && !queueWindow.isDestroyed()) {
        queueWindow.focus();
        return;
    }

    const win = new BrowserWindow({
        width: 850,
        height: 350,
        resizable: false,
        autoHideMenuBar: true,
        backgroundColor: '#0d0d0d',
        title: 'Ranked Queue',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });
    win.removeMenu();

    queueWindow = win;
    win.on('closed', () => { queueWindow = null; });

    const html = buildQueueHtml(token, region, allRegions, audioUrl);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Throttle the queue UI — user stares at it for minutes while waiting for a match
    if (applyCpuThrottle && getMenuRate) {
        const apply = () => {
            if (!win.isDestroyed()) applyCpuThrottle(win.webContents, getMenuRate());
        };
        win.webContents.once('did-finish-load', apply);
        win.webContents.on('render-process-gone', () => setTimeout(apply, 500));
        win.webContents.on('devtools-closed', apply);
    }
}
