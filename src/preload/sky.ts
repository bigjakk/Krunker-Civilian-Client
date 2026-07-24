// ── Sky override ──
// Krunker fetches map config from gapi.svc.krunker.io/maps/<id> with fetch(), and
// re-fetches it on every match join. Every render field lives under `data`, so
// rewriting the dome fields there recolours the sky without touching the renderer.
//
// Scope is the dome only. fog, ambient, light and fogD are visibility knobs and
// stay stock.

import { ipcRenderer } from 'electron';
import { savedConsole as _console } from './saved-console';

const MAP_URL_RE = /gapi\.svc\.krunker\.io\/maps\/\d/;

interface SkyConfig {
  enabled: boolean;
  zenith: string;
  horizon: string;
}

let installed = false;

/** '#RRGGBB' -> 0xRRGGBB. sky/fog/ambient/light hold the int form of the same value. */
function toInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function patchDome(data: Record<string, unknown>, sky: SkyConfig): void {
  data.skyDome = true;
  data.skyDomeTex = false;
  data.skyDomeCol0 = sky.zenith;
  data.skyDomeCol1 = sky.horizon;
  data.skyDomeCol2 = sky.horizon; // stock maps set Col2 === Col1
  data.sky = toInt(sky.horizon);  // clear colour, sits behind the dome
}

/** Wrap window.fetch once, at preload top level — the map fetch lands ~2.8s in. */
export function installSkyHook(): void {
  if (installed) return;
  const origFetch = window.fetch;
  if (!origFetch) return;
  installed = true;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await origFetch.call(window, input, init);
    try {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
          : (input as Request).url;
      if (!MAP_URL_RE.test(url) || !res.ok) return res;

      // Read config per map load rather than caching it: this path has just
      // finished waiting on the network, so one IPC round-trip costs nothing and
      // a settings change needs no invalidation.
      const sky: SkyConfig = await ipcRenderer.invoke('get-sky-config');
      if (!sky.enabled) return res;

      // clone() so the original body stays unread if anything below throws
      const map = await res.clone().json();

      // data is an object on official maps; tolerate a JSON string blob
      const dataIsString = typeof map.data === 'string';
      const data = dataIsString ? JSON.parse(map.data) : map.data;
      if (!data || typeof data !== 'object') return res;

      patchDome(data, sky);
      if (dataIsString) map.data = JSON.stringify(data);

      _console.log(`[KCC-Sky] dome replaced on ${url}`);
      // NB: Response.url is not settable via the constructor — comes back ''
      return new Response(JSON.stringify(map), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (err) {
      _console.warn('[KCC-Sky] patch failed, passing through:', err);
      return res;
    }
  };
}
