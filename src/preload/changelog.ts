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
    host.id = 'kpc-changelog-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        .overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.75); z-index: 99998;
            display: flex; justify-content: center; align-items: center;
            font-family: 'Segoe UI', sans-serif; color: #e0e0e0;
        }
        .modal {
            background: #1a1a2e; border-radius: 12px; padding: 24px;
            min-width: 400px; max-width: 600px; max-height: 70vh;
            display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 16px;
        }
        .header h2 { margin: 0; font-size: 1.4rem; color: #fff; }
        .close-btn {
            background: none; border: none; color: #888; font-size: 1.5rem;
            cursor: pointer; padding: 4px 8px; border-radius: 4px;
        }
        .close-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .body {
            overflow-y: auto; flex: 1; line-height: 1.6;
        }
        .body h1 { font-size: 1.3rem; color: #fff; margin: 12px 0 6px; }
        .body h2 { font-size: 1.15rem; color: #fff; margin: 10px 0 6px; }
        .body h3 { font-size: 1rem; color: #ccc; margin: 8px 0 4px; }
        .body ul { padding-left: 20px; margin: 6px 0; }
        .body li { margin: 3px 0; }
        .body a { color: #6ea8fe; }
        .body strong { color: #fff; }
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
    header.innerHTML = `<h2>What's New in v${escapeHtml(version)}</h2>`;
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
