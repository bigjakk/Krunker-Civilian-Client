// ── Changelog Popup ──
// Shows release notes in a Shadow DOM modal when the client version changes.

import { ipcRenderer } from 'electron';
import { escapeHtml } from './utils';

function versionLessThan(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na < nb) return true;
        if (na > nb) return false;
    }
    return false;
}

function sanitizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return escapeHtml(url);
    } catch { /* invalid URL */ }
    return '#';
}

function renderMarkdown(md: string): string {
    // Escape all HTML first, then apply markdown formatting to the safe text
    const escaped = escapeHtml(md);
    const html = escaped
        .replace(/### (.+)/g, '<h3>$1</h3>')
        .replace(/## (.+)/g, '<h2>$1</h2>')
        .replace(/# (.+)/g, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
            `<a href="${sanitizeUrl(url)}" target="_blank">${text}</a>`);

    // Convert list items
    const lines = html.split('\n');
    let inList = false;
    const out: string[] = [];
    for (const line of lines) {
        if (line.trimStart().startsWith('- ')) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push('<li>' + line.trimStart().slice(2) + '</li>');
        } else {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(line);
        }
    }
    if (inList) out.push('</ul>');

    return out.join('\n').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}

function showChangelogPopup(version: string, body: string): void {
    const host = document.createElement('div');
    host.id = 'kcc-changelog-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        @keyframes kcc-cl-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes kcc-cl-rise { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            z-index: 99998;
            display: flex; justify-content: center; align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: rgba(255,255,255,0.9);
            animation: kcc-cl-fade 180ms ease-out;
        }
        .modal {
            position: relative;
            background: #1a1a1a;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 14px;
            width: min(560px, 90vw);
            max-height: 75vh;
            display: flex; flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02);
            overflow: hidden;
            animation: kcc-cl-rise 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
            background: linear-gradient(90deg, #42a5f5, #6ea8fe 50%, #42a5f5);
        }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 20px 24px 16px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .title-wrap { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
        .title {
            margin: 0; font-size: 1.15rem; font-weight: 600; color: #fff;
            letter-spacing: -0.01em;
        }
        .version-pill {
            font-size: 0.75rem; font-weight: 500;
            color: rgba(255,255,255,0.75);
            background: rgba(66,165,245,0.12);
            border: 1px solid rgba(66,165,245,0.25);
            padding: 2px 8px; border-radius: 999px;
            letter-spacing: 0.02em;
        }
        .close-btn {
            background: transparent; border: none; color: rgba(255,255,255,0.5);
            font-size: 1rem; cursor: pointer;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px; transition: all 120ms ease;
            flex-shrink: 0;
        }
        .close-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .body {
            overflow-y: auto; flex: 1; line-height: 1.55;
            padding: 18px 24px 22px;
            font-size: 0.9rem;
            color: rgba(255,255,255,0.8);
        }
        .body::-webkit-scrollbar { width: 8px; }
        .body::-webkit-scrollbar-track { background: transparent; }
        .body::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.1); border-radius: 4px;
        }
        .body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
        .body h1, .body h2, .body h3 {
            color: #fff; font-weight: 600; letter-spacing: -0.01em;
        }
        .body h1 { font-size: 1.1rem; margin: 14px 0 8px; }
        .body h2 { font-size: 1rem; margin: 12px 0 6px; }
        .body h3 { font-size: 0.9rem; margin: 10px 0 4px; color: rgba(255,255,255,0.85); }
        .body h1:first-child, .body h2:first-child, .body h3:first-child { margin-top: 0; }
        .body ul { padding-left: 18px; margin: 6px 0; }
        .body li { margin: 4px 0; }
        .body li::marker { color: rgba(66,165,245,0.7); }
        .body a { color: #6ea8fe; text-decoration: none; }
        .body a:hover { text-decoration: underline; }
        .body strong { color: #fff; font-weight: 600; }
        .body em { color: rgba(255,255,255,0.9); }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) host.remove();
    });

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML =
        '<div class="title-wrap">' +
            '<h2 class="title">What\'s New</h2>' +
            `<span class="version-pill">v${escapeHtml(version)}</span>` +
        '</div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => host.remove());
    header.appendChild(closeBtn);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'body';
    bodyDiv.innerHTML = renderMarkdown(body);

    modal.appendChild(header);
    modal.appendChild(bodyDiv);
    overlay.appendChild(modal);
    shadow.appendChild(style);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            host.remove();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}

export async function showChangelogNow(currentVersion: string): Promise<void> {
    try {
        const body = await ipcRenderer.invoke('changelog-fetch', currentVersion);
        if (body) showChangelogPopup(currentVersion, body);
    } catch { /* fetch failed — skip silently */ }
}

export async function checkChangelog(currentVersion: string, lastSeenVersion: string): Promise<void> {
    if (lastSeenVersion && !versionLessThan(lastSeenVersion, currentVersion)) return;

    // Update lastSeenVersion regardless of whether we can fetch notes
    ipcRenderer.invoke('set-config', 'ui', {
        ...await ipcRenderer.invoke('get-config', 'ui'),
        lastSeenVersion: currentVersion,
    });

    try {
        const body = await ipcRenderer.invoke('changelog-fetch', currentVersion);
        if (body) showChangelogPopup(currentVersion, body);
    } catch { /* fetch failed — skip silently */ }
}
