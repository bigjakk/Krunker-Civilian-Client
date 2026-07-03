// ── Headshot sound ──
// Plays Krunker's headshot ding (`headshot_0`) via window.SOUND.play. Modes (config
// game.headshotSound):
//   'kill' — ding on your kills only; the native headshot ding is suppressed
//   'hit'  — every hit (hit_0/crit_0) plays the ding; native duplicate suppressed
// The native headshot ding is the only headshot_0 call with no volume arg, which is
// how we tell it apart from our own replays.

import { savedConsole as _console } from './saved-console';
import { onGameFrame } from './game-socket';

export type HeadshotSoundMode = 'off' | 'kill' | 'hit';

const HS = 'headshot_0';
const HIT_SOUNDS = new Set(['hit_0', 'crit_0']);

let mode: HeadshotSoundMode = 'off';

export function setHeadshotSoundMode(next: HeadshotSoundMode): void {
  mode = next === 'kill' || next === 'hit' ? next : 'off';
}

// ── Sound manager wrapper (remap + suppress) ──

let soundHooked = false;
let soundAttempts = 0;

export function installSoundHook(): void {
  if (soundHooked) return;
  const S = (window as any).SOUND;
  if (!S || typeof S.play !== 'function') { // SOUND is created lazily once the game boots
    if (++soundAttempts > 100) {
      _console.warn('[KCC-HS] window.SOUND never appeared; headshot sound inactive');
      return;
    }
    setTimeout(installSoundHook, 200);
    return;
  }
  soundHooked = true;

  const orig = S.play.bind(S) as (name: string, ...rest: unknown[]) => unknown;
  S.play = function (name: string, ...rest: unknown[]): unknown {
    if (mode === 'hit') {
      if (HIT_SOUNDS.has(name)) return orig(HS, ...rest);          // every hit → headshot ding
      if (name === HS && rest[0] === undefined) return undefined;  // drop native duplicate
    } else if (mode === 'kill') {
      if (name === HS && rest[0] === undefined) return undefined;  // suppress native ding; kills replay it
    }
    return orig(name, ...rest);
  };
  _console.log('[KCC-HS] sound manager hooked');
}

// Replay the ding on '6' (GetKill).
onGameFrame((event) => {
  if (event !== '6' || mode !== 'kill') return;
  const S = (window as any).SOUND;
  if (S && typeof S.play === 'function') S.play(HS, 1, false);
});
