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
  private textBuffer = Buffer.alloc(0);
  private handshakeComplete = false;
  private handshakeStarted = false;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private connectionHandlerRegistered = false;
  private readonly HANDSHAKE_TIMEOUT_MS = 1000; // Timeout for text handshake detection

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
    if (!this.connectionHandlerRegistered) {
      this.server.on('connection', (socket) => this.handleConnection(socket));
      this.connectionHandlerRegistered = true;
    }

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
  }

  private handleConnection(socket: net.Socket): void {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    this.log(`Client connected from ${remoteAddr}`);

    // Keep one debuggee connection at a time.
    if (this.socket) {
      this.log(`Rejecting connection, already have a client`);
      socket.destroy();
      return;
    }

    this.socket = socket;
    this.handshakeStarted = false;
    this.handshakeComplete = false;

    // Start handshake timeout timer for Windows direct binary detection
    this.handshakeTimer = setTimeout(() => {
      if (!this.handshakeComplete && this.textBuffer.length > 0) {
        this.log('Handshake timeout - assuming Windows direct binary mode');
        this.skipHandshakeAndProcessBinary();
      } else if (!this.handshakeComplete) {
        this.log('Handshake timeout - no data received, emitting error');
        this.emit('error', new Error('Handshake timeout: no data received from debuggee'));
      }
    }, this.HANDSHAKE_TIMEOUT_MS);

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
      if (this.handshakeTimer) {
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
      }
    });
  }

  /**
   * Skip text handshake and process accumulated buffer as binary data.
   * Used for Windows direct binary protocol (no CONNECT handshake).
   */
  private skipHandshakeAndProcessBinary(): void {
    if (!this.socket) return;

    this.handshakeComplete = true;
    this._connected = true;
    this.log('Skipping handshake, entering binary mode directly');

    // Clear handshake timer
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }

    // Process any accumulated data as binary
    if (this.textBuffer.length > 0) {
      this.log(`Processing ${this.textBuffer.length} bytes as binary data`);
      const data = this.textBuffer;
      this.textBuffer = Buffer.alloc(0);
      this.handleBinaryData(data);
    }

    this.emit('connected');
  }

  /**
   * Handle text-based handshake protocol (macOS/Linux).
   * Format: "CONNECT <version> DEBUGGER\n\n"
   *
   * Falls back to binary mode if data doesn't look like a handshake (Windows direct binary).
   */
  private handleTextHandshake(chunk: Buffer): void {
    // Accumulate raw buffer chunks to avoid binary data corruption from string conversion
    this.textBuffer = Buffer.concat([this.textBuffer, chunk]);
    this.handshakeStarted = true;
    this.log(`Handshake buffer size: ${this.textBuffer.length} bytes`);

    // Check if this looks like binary data (non-ASCII or starts with binary header)
    // Binary protocol starts with 8-byte header: 4 bytes command + 4 bytes data size
    // If first byte is not printable ASCII (excluding common text chars), likely binary
    if (this.textBuffer.length >= 8) {
      const looksLikeBinary = this.detectBinaryData(this.textBuffer);
      if (looksLikeBinary) {
        this.log('Data appears to be binary (not text handshake), switching to binary mode');
        this.skipHandshakeAndProcessBinary();
        return;
      }
    }

    // Search for delimiter in raw buffer
    const delimiter = Buffer.from('\n\n');
    const crDelimiter = Buffer.from('\r\n\r\n');
    let endIndex = this.textBuffer.indexOf(delimiter);
    let delimiterLength = 2;

    if (endIndex === -1) {
      endIndex = this.textBuffer.indexOf(crDelimiter);
      delimiterLength = 4;
    }

    if (endIndex === -1) {
      // Incomplete handshake message, wait for more data
      return;
    }

    // Only decode the handshake message portion as UTF-8
    const message = this.textBuffer.slice(0, endIndex).toString('utf8').trim();

    // Save any remaining bytes after the delimiter (binary data)
    const remaining = this.textBuffer.slice(endIndex + delimiterLength);
    this.textBuffer = Buffer.alloc(0);

    this.log(`Received handshake: ${message}`);

    // Parse CONNECT message
    const connectMatch = message.match(/^CONNECT\s+(\d+)\s+DEBUGGER$/i);
    if (connectMatch) {
      const version = parseInt(connectMatch[1], 10);
      this.log(`Handshake successful, version=${version}`);

      // Clear handshake timer
      if (this.handshakeTimer) {
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
      }

      // Send response: version followed by newline (password if set)
      // Format: "<version>\n" or "<version>;<password>\n"
      let response = `${version}\n`;
      if (this.password) {
        response = `${version};${this.password}\n`;
      }
      this.log(`Sending handshake response: ${this.password ? '<version>;<redacted>' : '<version>'}`);
      this.socket?.write(Buffer.from(response, 'utf8'));

      // Mark handshake complete
      this.handshakeComplete = true;
      this._connected = true;
      this.log(`Handshake marked complete, _connected=${this._connected}, emitting connected event`);
      this.emit('connected');

      // Process any remaining data as binary (pass raw Buffer without string conversion)
      if (remaining.length > 0) {
        this.log(`Processing ${remaining.length} remaining bytes as binary`);
        this.handleBinaryData(remaining);
      }
    } else {
      this.log(`Unexpected handshake message: ${message}`);
      this.emit('error', new Error(`Unexpected handshake message: ${message}`));
    }
  }

  /**
   * Detect if buffer contains binary data (Windows direct binary protocol).
   * Heuristic: if buffer contains non-printable characters (except common whitespace),
   * it's likely binary data.
   */
  private detectBinaryData(buffer: Buffer): boolean {
    // Check first 8 bytes (minimum header size)
    const checkLength = Math.min(8, buffer.length);
    let nonPrintableCount = 0;

    for (let i = 0; i < checkLength; i++) {
      const byte = buffer[i];
      // Allow printable ASCII (32-126), tab (9), newline (10), carriage return (13)
      const isPrintable = (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13;
      if (!isPrintable) {
        nonPrintableCount++;
      }
    }

    // If more than 50% of first bytes are non-printable, likely binary
    return nonPrintableCount > checkLength / 2;
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
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    try { this.socket?.destroy(); } catch {}
    this.socket = null;
    this._connected = false;
    this.handshakeComplete = false;
    this.handshakeStarted = false;
    try { this.server.close(); } catch {}
    this.binaryBuffer.clear();
    this.textBuffer = Buffer.alloc(0);
    this.actualPort = null;
  }

  private log(msg: string): void {
    this.emit('log', msg);
  }
}
