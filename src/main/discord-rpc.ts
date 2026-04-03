import { Socket } from 'net';
import { electronLog } from './logger';

const DISCORD_CLIENT_ID = '1477679025248800982';

// Discord IPC opcodes
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;

// Rate limit: Discord rejects updates faster than 15s
const RATE_LIMIT_MS = 5000;
const RECONNECT_INTERVAL_MS = 30000;

export interface ActivityPayload {
    details?: string;
    state?: string;
    startTimestamp?: number;
    largeImageKey?: string;
    largeImageText?: string;
}

function getPipePath(id: number): string {
    if (process.platform === 'win32') {
        return `\\\\?\\pipe\\discord-ipc-${id}`;
    }
    // Linux/macOS: check XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP, /tmp
    const dir = process.env.XDG_RUNTIME_DIR
        || process.env.TMPDIR
        || process.env.TMP
        || process.env.TEMP
        || '/tmp';
    return `${dir}/discord-ipc-${id}`;
}

function encodeFrame(opcode: number, payload: object): Buffer {
    const json = JSON.stringify(payload);
    const jsonBuf = Buffer.from(json);
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(jsonBuf.length, 4);
    return Buffer.concat([header, jsonBuf]);
}

export class DiscordRPC {
    private socket: Socket | null = null;
    private connected = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private lastUpdate = 0;
    private nonce = 0;
    private destroyed = false;
    private recvBuf = Buffer.alloc(0);
    private pendingActivity: ActivityPayload | null = null;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    get isConnected(): boolean {
        return this.connected;
    }

    connect(): void {
        if (this.destroyed) return;
        this.tryConnect(0);
    }

    private tryConnect(pipeIndex: number): void {
        if (this.destroyed || pipeIndex > 9) {
            this.scheduleReconnect();
            return;
        }

        const pipePath = getPipePath(pipeIndex);
        const sock = new Socket();
        let settled = false;

        const onError = () => {
            if (settled) return;
            settled = true;
            sock.destroy();
            // Try next pipe index
            this.tryConnect(pipeIndex + 1);
        };

        sock.once('error', onError);

        sock.connect(pipePath, () => {
            if (settled || this.destroyed) {
                sock.destroy();
                return;
            }
            settled = true;
            this.socket = sock;
            this.recvBuf = Buffer.alloc(0);

            // Remove the initial error handler and set up persistent ones
            sock.removeListener('error', onError);
            sock.on('error', (err) => {
                electronLog.warn('[KCC-Discord] Socket error:', err.message);
                this.handleDisconnect();
            });
            sock.on('close', () => {
                this.handleDisconnect();
            });
            sock.on('data', (data) => {
                this.onData(data);
            });

            // Send handshake
            const handshake = encodeFrame(OP_HANDSHAKE, {
                v: 1,
                client_id: DISCORD_CLIENT_ID,
            });
            sock.write(handshake);
        });

        // Connection timeout — 5s
        sock.setTimeout(5000, onError);
    }

    private onData(data: Buffer): void {
        this.recvBuf = Buffer.concat([this.recvBuf, data]);

        while (this.recvBuf.length >= 8) {
            const opcode = this.recvBuf.readUInt32LE(0);
            const length = this.recvBuf.readUInt32LE(4);

            if (this.recvBuf.length < 8 + length) break;

            const jsonBuf = this.recvBuf.slice(8, 8 + length);
            this.recvBuf = this.recvBuf.slice(8 + length);

            try {
                const payload = JSON.parse(jsonBuf.toString());
                this.handleMessage(opcode, payload);
            } catch {
                // Malformed JSON — ignore
            }
        }
    }

    private handleMessage(opcode: number, payload: any): void {
        if (opcode === OP_FRAME) {
            if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
                this.connected = true;
                electronLog.log('[KCC-Discord] Connected to Discord');
                // Flush any activity that was set before connection completed
                if (this.pendingActivity) {
                    this.sendActivity(this.pendingActivity);
                    this.pendingActivity = null;
                }
            }
        } else if (opcode === OP_CLOSE) {
            electronLog.warn('[KCC-Discord] Discord closed connection:', payload.message || '');
            this.handleDisconnect();
        }
    }

    private handleDisconnect(): void {
        if (!this.connected && !this.socket) return;
        this.connected = false;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.recvBuf = Buffer.alloc(0);
        electronLog.log('[KCC-Discord] Disconnected');
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.destroyed || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.destroyed && !this.connected) {
                this.tryConnect(0);
            }
        }, RECONNECT_INTERVAL_MS);
    }

    setActivity(activity: ActivityPayload): void {
        if (this.destroyed) return;

        // Always store latest activity so it can be sent on (re)connect
        this.pendingActivity = activity;

        if (!this.connected || !this.socket) return;

        const now = Date.now();
        const elapsed = now - this.lastUpdate;
        if (elapsed < RATE_LIMIT_MS) {
            // Schedule a flush after the rate limit window expires
            if (!this.flushTimer) {
                this.flushTimer = setTimeout(() => {
                    this.flushTimer = null;
                    if (this.pendingActivity && this.connected && this.socket) {
                        this.sendActivity(this.pendingActivity);
                        this.pendingActivity = null;
                    }
                }, RATE_LIMIT_MS - elapsed);
            }
            return;
        }

        this.sendActivity(activity);
        this.pendingActivity = null;
    }

    private sendActivity(activity: ActivityPayload): void {
        if (!this.socket || this.destroyed) return;
        this.lastUpdate = Date.now();

        const activityObj: any = {};
        if (activity.details) activityObj.details = activity.details;
        if (activity.state) activityObj.state = activity.state;
        if (activity.startTimestamp) {
            activityObj.timestamps = { start: activity.startTimestamp };
        }
        if (activity.largeImageKey) {
            activityObj.assets = {
                large_image: activity.largeImageKey,
                large_text: activity.largeImageText || 'Krunker Civilian Client',
            };
        }

        const frame = encodeFrame(OP_FRAME, {
            cmd: 'SET_ACTIVITY',
            args: {
                pid: process.pid,
                activity: activityObj,
            },
            nonce: String(++this.nonce),
        });

        try {
            this.socket.write(frame);
        } catch (err) {
            electronLog.warn('[KCC-Discord] Write error:', (err as Error).message);
        }
    }

    clearActivity(): void {
        if (!this.connected || !this.socket || this.destroyed) return;

        const frame = encodeFrame(OP_FRAME, {
            cmd: 'SET_ACTIVITY',
            args: {
                pid: process.pid,
                activity: null,
            },
            nonce: String(++this.nonce),
        });

        try {
            this.socket.write(frame);
        } catch {
            // Silent
        }
    }

    disconnect(): void {
        this.destroyed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.socket) {
            try {
                this.clearActivity();
            } catch {
                // Silent
            }
            this.socket.destroy();
            this.socket = null;
        }
        this.connected = false;
        this.recvBuf = Buffer.alloc(0);
    }
}
