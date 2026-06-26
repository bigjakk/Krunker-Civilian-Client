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
:root {
  --accent: #46b6ff;
  --accent-hover: #6cc6ff;
  --accent-soft: rgba(70,182,255,0.14);
  --on-accent: #06243a;
  --bg: #141414;
  --card: #1a1a1a;
  --input: rgba(255,255,255,0.05);
  --hover: rgba(255,255,255,0.1);
  --t1: rgba(255,255,255,0.92);
  --t2: rgba(255,255,255,0.6);
  --t3: rgba(255,255,255,0.4);
  --bd: rgba(255,255,255,0.08);
  --bd2: rgba(255,255,255,0.14);
  --focus: rgba(255,255,255,0.35);
}
* { user-select: none; margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Trebuchet MS', sans-serif;
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--t1);
  overflow: hidden;
  padding: 20px;
}
.queuer-card {
  width: 100%;
  max-width: 720px;
  background: var(--card);
  border: 1px solid var(--bd);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}

/* header band */
.queue-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--bd);
  background: linear-gradient(180deg, #1f2733, #1a1a1a);
}
.queue-mark {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--on-accent);
}
.queue-mark svg { width: 20px; height: 20px; display: block; }
.queue-head-text { flex: 1; }
.queue-title { font-size: 15px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.queue-sub { font-size: 11px; color: var(--t3); margin-top: 1px; }
.queue-status { display: flex; align-items: center; gap: 8px; padding-left: 15px; position: relative; }
.queue-status::before {
  content: "";
  position: absolute;
  left: 0;
  width: 8px;
  height: 8px;
  background: var(--t3);
  border-radius: 50%;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}
.queue-status.active::before { background: var(--accent); box-shadow: 0 0 10px rgba(70,182,255,0.6); }
#queueStatus {
  font-size: 12px;
  font-weight: 600;
  color: var(--t3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  transition: color 0.3s ease;
}
#queueStatus.active { color: var(--accent); }

/* body */
.queue-body { display: flex; align-items: center; gap: 40px; padding: 28px 32px; }
.queue-left { flex: 1; display: flex; flex-direction: column; gap: 20px; }
.timer-display {
  font-size: 48px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  padding: 12px 18px;
  background: var(--input);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
}
.region-controls { display: flex; gap: 10px; }
.region-option input { display: none; }
.region-option label {
  display: block;
  padding: 11px 22px;
  background: var(--input);
  border: 1px solid var(--bd2);
  border-radius: 8px;
  color: var(--t2);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.region-option label:hover { background: var(--hover); border-color: var(--focus); color: var(--t1); }
.region-option input:checked + label { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.divider { width: 1px; align-self: stretch; background: var(--bd); }
.queue-right { display: flex; flex-direction: column; gap: 12px; }
.btn {
  padding: 15px 38px;
  border: 1px solid transparent;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: 8px;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-primary:active:not(:disabled) { transform: scale(0.98); }
.btn-primary.in-queue { background: var(--input); border-color: var(--accent); color: var(--accent); }
.btn-primary.in-queue:hover:not(:disabled) { background: var(--accent-soft); }

/* match-found popup */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease;
  z-index: 1000;
}
.overlay.active { opacity: 1; visibility: visible; }
.popup {
  position: relative;
  background: var(--card);
  border: 1px solid var(--bd);
  border-radius: 14px;
  max-width: 480px;
  width: 90vw;
  padding: 28px 32px 32px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7);
  text-align: center;
  transform: scale(0.96);
  transition: transform 0.25s ease;
}
.overlay.active .popup { transform: scale(1); }
.popup h2 { font-size: 24px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; }
.popup-content { margin-top: 18px; }
.region-found {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: inline-block;
  padding: 10px 20px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-radius: 8px;
}
#matchFoundMessage {
  margin-top: 14px;
  font-size: 14px;
  color: var(--t2);
  line-height: 1.5;
  max-width: 340px;
  margin-left: auto;
  margin-right: auto;
}
.countdown-large { font-size: 44px; font-weight: 700; color: var(--accent); margin-top: 16px; font-variant-numeric: tabular-nums; line-height: 1; }
#closeButton {
  position: absolute;
  right: 16px;
  top: 14px;
  font-size: 15px;
  color: var(--t3);
  cursor: pointer;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
#closeButton:hover { background: var(--hover); color: var(--t1); }
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
let notificationAudio = null;
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

function loadNotificationAudio(url) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    return audio;
}

function initializeAudio() {
    // Use an HTMLAudioElement (same mechanism as the in-client preview button).
    // A Web Audio AudioContext gets throttled/suspended when this window sits
    // backgrounded during a long queue under game load, so start() plays silently;
    // a media element keeps playing reliably in the background.
    notificationAudio = loadNotificationAudio(AUDIO_URL);
    notificationAudio.onerror = () => {
        if (AUDIO_URL !== FALLBACK_AUDIO_URL) notificationAudio = loadNotificationAudio(FALLBACK_AUDIO_URL);
    };
    audioInitialized = true;
}

function playNotificationSound() {
    if (!notificationAudio) return;
    try {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch((e) => console.error('Audio play error:', e));
    } catch (e) { console.error('Audio play error:', e); }
}

function stopNotificationSound() {
    if (notificationAudio) {
        try { notificationAudio.pause(); notificationAudio.currentTime = 0; } catch {}
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
        if (!audioInitialized) initializeAudio();
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

function buildQueueHtml(token: string, region: string, allRegions: boolean, audioUrl: string, showHeader: boolean): string {
    const header = showHeader ? `  <div class="queue-header">
    <div class="queue-mark"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3z"/></svg></div>
    <div class="queue-head-text">
      <div class="queue-title">Civilian Client</div>
      <div class="queue-sub">Ranked queue</div>
    </div>
  </div>
` : '';
    return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<title>Ranked Queue</title>
<style>${QUEUE_CSS}</style>
</head>
<body>
<div class="queuer-card">
${header}  <div class="queue-body">
    <div class="queue-left">
      <div class="queue-status" id="statusArea"><span id="queueStatus">Ready</span></div>
      <div class="timer-display" id="queueTimerDisplay">00:00:00</div>
      <div class="region-controls" id="regionCheckboxes">
        ${buildRegionCheckboxes()}
      </div>
    </div>
    <div class="divider"></div>
    <div class="queue-right">
      <button type="button" class="btn btn-primary" id="queueButton">Start Queue</button>
    </div>
  </div>
</div>
<div class="overlay" id="matchPopupOverlay">
  <div class="popup">
    <div id="closeButton">✕</div>
    <h2>Match Found</h2>
    <div class="popup-content">
      <div class="region-found" id="foundRegion">Region: </div>
      <div id="matchFoundMessage">Open the client and rejoin the game from the ranked menu.</div>
      <div class="countdown-large" id="countDownTimer">00:00:60</div>
    </div>
  </div>
</div>
<script>${buildQueueScript(token, region, allRegions, audioUrl)}</script>
</body>
</html>`;
}

export function openRankedQueue(
    token: string,
    region: string,
    allRegions: boolean,
    audioUrl: string,
    showHeader: boolean,
): void {
    if (queueWindow && !queueWindow.isDestroyed()) {
        queueWindow.focus();
        return;
    }

    const win = new BrowserWindow({
        width: 780,
        height: showHeader ? 400 : 330,
        resizable: false,
        autoHideMenuBar: true,
        backgroundColor: '#141414',
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

    const html = buildQueueHtml(token, region, allRegions, audioUrl, showHeader);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}
