import { net } from 'electron';
import { electronLog } from './logger';
import { OFFICIAL_MAPS, type OfficialMap } from './maps';

const MAPS_URL = 'https://gapi.svc.krunker.io/maps';
const BUNDLED: OfficialMap[] = OFFICIAL_MAPS.map((name, id) => ({ id, name }));

let live: Promise<OfficialMap[]> | null = null;

// Adds maps Krunker released after this build; known ids keep their bundled names so saved map filters still match
export function loadOfficialMaps(): Promise<OfficialMap[]> {
  live ??= net.fetch(MAPS_URL, { signal: AbortSignal.timeout(4000) })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((body: { data?: { id?: unknown; name?: unknown }[] }) => {
      if (!Array.isArray(body.data)) throw new Error('no map table');
      const added = body.data.filter((m): m is OfficialMap =>
        Number.isInteger(m.id) && (m.id as number) >= BUNDLED.length && typeof m.name === 'string');
      return [...BUNDLED, ...added.sort((a, b) => a.id - b.id)];
    })
    .catch((err) => {
      electronLog.warn('[KCC] Live map list unavailable, using the bundled one:', err);
      live = null;
      return BUNDLED;
    });
  return live;
}
