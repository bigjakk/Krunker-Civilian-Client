// Sky override. Krunker re-fetches map config from gapi.svc.krunker.io/maps/<id> on
// every match join; rewriting the dome fields under `data` recolours the sky.

import { ipcRenderer } from 'electron';
import { SKY_SENTINEL_ID } from '../main/config-defaults';
import { savedConsole as _console } from './saved-console';

const MAP_URL_RE = /gapi\.svc\.krunker\.io\/maps\/\d/;
const WHITE = '#FFFFFF';

interface SkyConfig {
  enabled: boolean;
  zenith: string;
  horizon: string;
  useImage: boolean;
}

/** '#RRGGBB' -> 0xRRGGBB. sky/fog/ambient/light hold the int form of the same value. */
function toInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function patchDome(data: Record<string, unknown>, sky: SkyConfig): void {
  data.skyDome = true;
  data.skyDomeTex = sky.useImage;

  if (sky.useImage) {
    data.skyDomeTexA = SKY_SENTINEL_ID;
    // Maps that ship their own emissive sky texture keep rendering it over ours
    data.skyDomeEmisTex = 0;
    // The dome tints its texture by the gradient colours, so they go neutral
    data.skyDomeCol0 = WHITE;
    data.skyDomeCol1 = WHITE;
    data.skyDomeCol2 = WHITE;
    data.sky = toInt(WHITE);
    return;
  }

  data.skyDomeCol0 = sky.zenith;
  data.skyDomeCol1 = sky.horizon;
  data.skyDomeCol2 = sky.horizon; // stock maps set Col2 === Col1
  data.sky = toInt(sky.horizon);  // clear colour, sits behind the dome
}

/** Wrap window.fetch once, at preload top level — the map fetch lands ~2.8s in. */
export function installSkyHook(): void {
  // The sky controls are refreshOnly, so one read holds for the life of the document.
  let sky: SkyConfig | undefined;
  try {
    sky = ipcRenderer.sendSync('get-sky-config');
  } catch (err) {
    _console.warn('[KCC-Sky] config read failed:', err);
    return;
  }
  if (!sky?.enabled) return;
  const origFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await origFetch.call(window, input, init);
    try {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
          : (input as Request).url;
      if (!MAP_URL_RE.test(url) || !res.ok) return res;

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
      return new Response(JSON.stringify(map), { status: res.status, statusText: res.statusText });
    } catch (err) {
      _console.warn('[KCC-Sky] patch failed, passing through:', err);
      return res;
    }
  };
}
