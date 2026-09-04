import { applyNativeSkips, newImportChoices, skippedGroups } from './import-groups';
import { savedConsole as _console } from './saved-console';

const choices = newImportChoices();

function buildToggles(): HTMLElement {
  const holder = document.createElement('div');
  holder.className = 'kcc-import-groups';
  for (const choice of choices) {
    const row = document.createElement('label');
    row.className = 'kcc-import-group';
    const text = document.createElement('span');
    text.textContent = choice.label;
    const toggle = document.createElement('span');
    toggle.className = 'kcc-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = choice.checked;
    input.addEventListener('change', () => { choice.checked = input.checked; });
    const track = document.createElement('span');
    track.className = 'kcc-toggle-track';
    toggle.appendChild(input);
    toggle.appendChild(track);
    row.appendChild(text);
    row.appendChild(toggle);
    holder.appendChild(row);
  }
  return holder;
}

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hookNativeImport(): void {
  const w = window as any;
  if (typeof w.importSettingsPopup !== 'function' || typeof w.importSettings !== 'function') {
    _console.warn('[KCC] Krunker import functions not found, skip toggles unavailable');
    return;
  }

  const toggles = buildToggles();
  const originalPopup = w.importSettingsPopup.bind(w);
  const originalImport = w.importSettings.bind(w);

  w.importSettingsPopup = (...args: unknown[]) => {
    const result = originalPopup(...args);
    queueMicrotask(() => {
      const field = document.querySelector('#importTxt');
      field?.parentNode?.insertBefore(toggles, field.nextSibling);
    });
    return result;
  };

  // Stays synchronous: Krunker re-reads #importTxt itself, and the popup is gone by
  // the time anything deferred would run.
  w.importSettings = (...args: unknown[]) => {
    const field = document.querySelector('#importTxt') as HTMLTextAreaElement | null;
    const payload = field ? parsePayload(field.value) : null;
    const skip = skippedGroups(choices);
    if (field && payload && skip.size > 0) {
      try {
        applyNativeSkips(payload, skip);
        field.value = JSON.stringify(payload);
      } catch (err) {
        _console.warn('[KCC] Could not filter imported settings:', err);
      }
    }
    return originalImport(...args);
  };
}
