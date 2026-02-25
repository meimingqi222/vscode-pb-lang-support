import * as net from 'net';
import { EventEmitter } from 'events';
import { serialize } from '../protocol/CommandInfo';
import { MessageBuffer } from './MessageBuffer';
import { IDebugTransport } from './IDebugTransport';

/**
 * Cross-platform network transport for the PureBasic debugger protocol.
 *
 * Adapter listens on host:port; debuggee connects as a client.
 * 
 * Protocol variations:
 * - Windows: Direct binary protocol
 * - macOS/Linux: Text handshake "CONNECT <version> DEBUGGER\n\n" followed by binary
 */
export class NetworkTransport extends EventEmitter implements IDebugTransport {
  readonly kind = 'network' as const;

  private readonly host: string;
  private readonly requestedPort: number;
  private readonly password?: string;
  private server: net.Server;
  private socket: net.Socket | null = null;
  private actualPort: number | null = null;
  private binaryBuffer = new MessageBuffer();
  private textBuffer = '';
  private handshakeComplete = false;
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
      const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
      this.log(`Client connected from ${remoteAddr}`);
      
      // Keep one debuggee connection at a time.
      if (this.socket) {
        this.log(`Rejecting connection, already have a client`);
        socket.destroy();
        return;
      }

      this.socket = socket;

      socket.on('data', (chunk: Buffer) => {
        if (!this.handshakeComplete) {
          this.handleTextHandshake(chunk);
        } else {
          this.handleBinaryData(chunk);
        }
      });

      socket.on('error', (err) => {
        this.log(`Socket error: ${err.message}`);
        this.emit('error', err);
      });

      socket.on('end', () => {
        this.log(`Client disconnected (end)`);
        this._connected = false;
        this.emit('end');
      });

      socket.on('close', (hadError) => {
        this.log(`Socket closed (hadError=${hadError})`);
        this._connected = false;
        this.socket = null;
        this.handshakeComplete = false;
      });
    });
  }

  /**
   * Handle text-based handshake protocol (macOS/Linux).
   * Format: "CONNECT <version> DEBUGGER\n\n"
   */
  private handleTextHandshake(chunk: Buffer): void {
    this.textBuffer += chunk.toString('utf8');
    this.log(`Handshake buffer: ${JSON.stringify(this.textBuffer)}`);
    
    // Check for complete handshake message
    const doubleNl = this.textBuffer.indexOf('\n\n');
    const doubleCrnl = this.textBuffer.indexOf('\r\n\r\n');
    const endIndex = doubleNl !== -1 ? doubleNl : (doubleCrnl !== -1 ? doubleCrnl : -1);
    
    if (endIndex === -1) {
      // Incomplete handshake message, wait for more data
      return;
    }
    
    const message = this.textBuffer.substring(0, endIndex).trim();
    this.textBuffer = this.textBuffer.substring(endIndex + (doubleNl !== -1 ? 2 : 4));
    
    this.log(`Received handshake: ${message}`);
    
    // Parse CONNECT message
    const connectMatch = message.match(/^CONNECT\s+(\d+)\s+DEBUGGER$/i);
    if (connectMatch) {
      const version = parseInt(connectMatch[1], 10);
      this.log(`Handshake successful, version=${version}`);
      
      // Send response: version followed by newline (password if set)
      // Format: "<version>\n" or "<version>;<password>\n"
      let response = `${version}\n`;
      if (this.password) {
        response = `${version};${this.password}\n`;
      }
      this.log(`Sending handshake response: ${JSON.stringify(response)}`);
      this.socket?.write(Buffer.from(response, 'utf8'));
      
      // Mark handshake complete
      this.handshakeComplete = true;
      this._connected = true;
      this.log(`Handshake marked complete, _connected=${this._connected}, emitting connected event`);
      this.emit('connected');
      
      // Process any remaining data as binary
      if (this.textBuffer.length > 0) {
        this.log(`Processing ${this.textBuffer.length} remaining bytes as binary`);
        const remaining = Buffer.from(this.textBuffer, 'utf8');
        this.textBuffer = '';
        this.handleBinaryData(remaining);
      }
    } else {
      this.log(`Unexpected handshake message: ${message}`);
      this.emit('error', new Error(`Unexpected handshake message: ${message}`));
    }
  }

  private handleBinaryData(chunk: Buffer): void {
    this.log(`Received ${chunk.length} bytes binary data`);
    if (chunk.length > 0) {
      this.log(`Raw hex: ${chunk.slice(0, Math.min(40, chunk.length)).toString('hex')}`);
    }
    
    const messages = this.binaryBuffer.append(chunk);
    this.log(`Parsed ${messages.length} binary messages`);
    
    for (const msg of messages) {
      this.log(`Emitting message: cmd=${msg.command}, value1=${msg.value1}, value2=${msg.value2}`);
      this.emit('message', msg);
    }
  }

  getCommunicationString(): string {
    if (!this.actualPort) {
      throw new Error('Network transport is not listening yet');
    }
    // macOS/Linux use NetworkClient format
    return `NetworkClient;${this.host}:${this.actualPort}`;
  }

  send(info: Parameters<typeof serialize>[0]): void {
    if (!this.socket) {
      throw new Error('Network transport is not connected – cannot send command');
    }
    if (!this.handshakeComplete) {
      throw new Error('Handshake not complete – cannot send command');
    }
    this.socket.write(serialize(info));
  }

  close(): void {
    try { this.socket?.destroy(); } catch {}
    this.socket = null;
    this._connected = false;
    this.handshakeComplete = false;
    try { this.server.close(); } catch {}
    this.binaryBuffer.clear();
    this.textBuffer = '';
  }

  private log(msg: string): void {
    this.emit('log', msg);
  }
}
