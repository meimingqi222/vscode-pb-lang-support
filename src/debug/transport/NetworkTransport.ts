import * as net from 'net';
import { EventEmitter } from 'events';
import { serialize } from '../protocol/CommandInfo';
import { MessageBuffer } from './MessageBuffer';
import { IDebugTransport } from './IDebugTransport';

/**
 * Cross-platform network transport for the PureBasic debugger protocol.
 *
 * Adapter listens on host:port; debuggee connects as a client.
 */
export class NetworkTransport extends EventEmitter implements IDebugTransport {
  readonly kind = 'network' as const;

  private readonly host: string;
  private readonly requestedPort: number;
  private readonly password?: string;
  private server: net.Server;
  private socket: net.Socket | null = null;
  private actualPort: number | null = null;
  private readonly buffer = new MessageBuffer();
  private _connected = false;

  constructor(host = '127.0.0.1', port = 0, password?: string) {
    super();
    this.host = host;
    this.requestedPort = port;
    this.password = password;
    this.server = net.createServer();
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.requestedPort, this.host, () => {
        this.server.removeListener('error', reject);
        const addr = this.server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to resolve network debug listen address'));
          return;
        }
        this.actualPort = addr.port;
        resolve();
      });
    });

    this.server.on('connection', (socket) => {
      // Keep one debuggee connection at a time.
      if (this.socket) {
        socket.destroy();
        return;
      }

      this.socket = socket;
      this._connected = true;
      this.emit('connected');

      socket.on('data', (chunk: Buffer) => {
        const messages = this.buffer.append(chunk);
        for (const msg of messages) {
          this.emit('message', msg);
        }
      });

      socket.on('error', (err) => this.emit('error', err));

      socket.on('end', () => {
        this._connected = false;
        this.emit('end');
      });

      socket.on('close', () => {
        this._connected = false;
        this.socket = null;
      });
    });
  }

  getCommunicationString(): string {
    if (!this.actualPort) {
      throw new Error('Network transport is not listening yet');
    }
    const credential = this.password ? `;${this.password}` : '';
    return `NetworkClient;${this.host}:${this.actualPort}${credential}`;
  }

  send(info: Parameters<typeof serialize>[0]): void {
    if (!this.socket) {
      throw new Error('Network transport is not connected – cannot send command');
    }
    this.socket.write(serialize(info));
  }

  close(): void {
    try { this.socket?.destroy(); } catch {}
    this.socket = null;
    this._connected = false;
    try { this.server.close(); } catch {}
    this.buffer.clear();
  }
}

