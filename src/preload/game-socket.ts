// ── Game socket tap ──
// One read-only wrapper around window.WebSocket, shared so features never patch it
// twice. Subscribe with onGameFrame() to get each binary frame's event name + bytes.

import { savedConsole as _console } from './saved-console';

export type GameFrameHandler = (event: string, bytes: Uint8Array) => void;

const handlers = new Set<GameFrameHandler>();
let installed = false;

/** Subscribe to game frames. Returns an unsubscribe function. */
export function onGameFrame(handler: GameFrameHandler): () => void {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

/** Wrap window.WebSocket once, at preload top level (before the game socket opens). */
export function installGameSocketTap(): void {
  if (installed) return;
  const OrigWS = window.WebSocket;
  if (!OrigWS) return;
  installed = true;

  class HookedWebSocket extends OrigWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      try {
        this.addEventListener('message', onMessage);
      } catch (err) {
        _console.warn('[KCC-Socket] listener attach failed:', err);
      }
    }
  }
  (window as any).WebSocket = HookedWebSocket;
  _console.log('[KCC-Socket] game socket tap installed');
}

function onMessage(ev: MessageEvent): void {
  if (handlers.size === 0) return;
  const data = ev.data;
  if (typeof data === 'string') return; // game frames are binary
  if (data instanceof ArrayBuffer) {
    dispatch(new Uint8Array(data));
  } else if (data instanceof Uint8Array) {
    dispatch(data);
  } else if (data && typeof (data as Blob).arrayBuffer === 'function') {
    (data as Blob).arrayBuffer().then((buf) => dispatch(new Uint8Array(buf))).catch(() => { /* ignore */ });
  }
}

function dispatch(bytes: Uint8Array): void {
  if (bytes.length < 2) return;
  let event: string | null;
  try {
    event = peekEvent(bytes);
  } catch {
    return;
  }
  if (event === null) return;
  for (const handler of handlers) {
    try {
      handler(event, bytes);
    } catch (err) {
      _console.warn('[KCC-Socket] frame handler error:', err);
    }
  }
}

// Frames are msgpack([eventName, …]) + 2 trailer bytes; the event name is the first
// element, always a string. Read just the array header + that string.
const td = new TextDecoder('utf-8', { fatal: false });

function peekEvent(bytes: Uint8Array): string | null {
  const b0 = bytes[0];
  let off = 1;
  if (b0 === 0xdc) off += 2;                     // array16
  else if (b0 === 0xdd) off += 4;                // array32
  else if (b0 < 0x90 || b0 > 0x9f) return null;  // not an array

  const b1 = bytes[off++];
  let len: number;
  if (b1 >= 0xa0 && b1 <= 0xbf) len = b1 & 0x1f; // fixstr
  else if (b1 === 0xd9) len = bytes[off++];      // str8
  else return null;

  return td.decode(bytes.subarray(off, off + len));
}
