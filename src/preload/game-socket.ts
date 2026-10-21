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

/** Decode a whole frame to [eventName, …payload]. Throws on malformed input; bin and ext values come back null. */
export function decodeFrame(bytes: Uint8Array): unknown[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const take = (n: number): number => { const at = off; off += n; return at; };
  const str = (n: number): string => td.decode(bytes.subarray(take(n), off));
  const skip = (n: number): null => { off += n; return null; };
  const arr = (n: number): unknown[] => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = read(); return a; };
  const map = (n: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) { const k = read(); o[String(k)] = read(); }
    return o;
  };
  function read(): unknown {
    const b = bytes[off++];
    if (b <= 0x7f) return b;
    if (b >= 0xe0) return b - 256;
    if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
    if (b >= 0x90 && b <= 0x9f) return arr(b & 0x0f);
    if (b >= 0x80 && b <= 0x8f) return map(b & 0x0f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return view.getUint8(take(1));
      case 0xcd: return view.getUint16(take(2));
      case 0xce: return view.getUint32(take(4));
      case 0xcf: return view.getUint32(take(4)) * 4294967296 + view.getUint32(take(4));
      case 0xd0: return view.getInt8(take(1));
      case 0xd1: return view.getInt16(take(2));
      case 0xd2: return view.getInt32(take(4));
      case 0xd3: return view.getInt32(take(4)) * 4294967296 + view.getUint32(take(4));
      case 0xca: return view.getFloat32(take(4));
      case 0xcb: return view.getFloat64(take(8));
      case 0xd9: return str(view.getUint8(take(1)));
      case 0xda: return str(view.getUint16(take(2)));
      case 0xdb: return str(view.getUint32(take(4)));
      case 0xc4: return skip(view.getUint8(take(1)));
      case 0xc5: return skip(view.getUint16(take(2)));
      case 0xc6: return skip(view.getUint32(take(4)));
      case 0xdc: return arr(view.getUint16(take(2)));
      case 0xdd: return arr(view.getUint32(take(4)));
      case 0xde: return map(view.getUint16(take(2)));
      case 0xdf: return map(view.getUint32(take(4)));
      case 0xd4: return skip(2);
      case 0xd5: return skip(3);
      case 0xd6: return skip(5);
      case 0xd7: return skip(9);
      case 0xd8: return skip(17);
      case 0xc7: return skip(view.getUint8(take(1)) + 1);
      case 0xc8: return skip(view.getUint16(take(2)) + 1);
      case 0xc9: return skip(view.getUint32(take(4)) + 1);
      default: throw new Error('msgpack: unknown byte 0x' + b.toString(16));
    }
  }
  const v = read();
  return Array.isArray(v) ? v : null;
}
