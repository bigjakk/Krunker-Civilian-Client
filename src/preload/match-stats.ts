// ── Match stats ── your kills, deaths and kill types as they happen, plus the totals Krunker commits at match end

import { decodeFrame, onGameFrame } from './game-socket';

export interface MatchStatListener {
  /** A live event added `n` to a profile field ('player_kills', 'hs', …). */
  add(key: string, n: number): void;
  /** The match is over: its counts are either committed by a `totals` call or never count (custom games). */
  end(): void;
  /** Career totals as Krunker just committed them, keyed by profile field. */
  totals(values: Record<string, number>): void;
}

const EVENTS = new Set(['init', '3', '6', 'end', 'ua']);

// Kill medal ids (matched against the end screen's medal tally) → the profile field each counts toward
const MEDALS: Record<string, string> = { 9: 'hs', 10: 'wb', 4: 'tmk', 6: 'mk' };

/** Every profile field `add` can report. */
export const LIVE_KEYS = ['player_kills', 'player_deaths', ...Object.values(MEDALS)];

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// The player_stats object: any account that has played has shots, hits or a class score (c0…c15)
const isStats = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).some((k) => /^(s|h|c\d+)$/.test(k));

let listener: MatchStatListener | null = null;
let unsubscribe: (() => void) | null = null;
let matchKills = 0;

export function trackMatchStats(l: MatchStatListener | null): void {
  listener = l;
  if (l && !unsubscribe) unsubscribe = onGameFrame(onFrame);
  else if (!l && unsubscribe) { unsubscribe(); unsubscribe = null; }
}

function onFrame(event: string, bytes: Uint8Array): void {
  if (!listener || !EVENTS.has(event)) return;
  const f = decodeFrame(bytes);
  if (!f) return;
  switch (event) {
    case 'init':
      matchKills = 0;
      break;
    case '3':
      // Only the victim is sent the death card (killer's weapon, their life's stats), so a filled one is your death
      if (Array.isArray(f[4]) && f[4].length) listener.add('player_deaths', 1);
      break;
    case '6': {
      // total_kills is this match's running total, so a missed frame can't drift the count
      const total = num(f[3]);
      const gained = total !== null ? total - matchKills : 1;
      matchKills = total ?? matchKills + 1;
      if (gained > 0) listener.add('player_kills', gained);
      // medals come as flat [id, score, ?, count] groups
      const medals = f[1];
      if (Array.isArray(medals)) {
        for (let i = 0; i + 3 < medals.length; i += 4) {
          const key = MEDALS[String(medals[i])];
          if (key) listener.add(key, 1);
        }
      }
      break;
    }
    case 'end':
      listener.end();
      break;
    case 'ua': {
      // [player_id, kills, wins, games, deaths, …] with the whole player_stats object further in
      const a = f[1];
      if (!Array.isArray(a)) break;
      const values: Record<string, number> = {};
      for (const [key, i] of [['player_kills', 1], ['player_wins', 2], ['player_deaths', 4]] as const) {
        const v = num(a[i]);
        if (v !== null) values[key] = v;
      }
      const stats = a.find(isStats);
      if (stats) for (const [key, v] of Object.entries(stats)) if (typeof v === 'number') values[key] = v;
      listener.totals(values);
      break;
    }
  }
}
