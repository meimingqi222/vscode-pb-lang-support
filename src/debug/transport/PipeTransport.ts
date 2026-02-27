import * as net from 'net';
import { EventEmitter } from 'events';
import { CommandInfo } from '../types/debugTypes';
import { serialize } from '../protocol/CommandInfo';
import { MessageBuffer } from './MessageBuffer';
import { IDebugTransport } from './IDebugTransport';

const PIPE_BASE = '\\\\.\\pipe\\PureBasic_Debugger';

/**
 * Manages the two Windows named pipes used by the PureBasic debug protocol.
 *
 *  PipeA  (Program → Debugger): we are the server; we READ from the connected socket.
 *  PipeB  (Debugger → Program): we are the server; we WRITE to the connected socket.
 *
 * The PureBasic IDE terminology:
 *  - PipeA is the IDE's "InPipe"  (receives events/responses from the debuggee)
 *  - PipeB is the IDE's "OutPipe" (sends commands to the debuggee)
 *
 * Events emitted:
 *  'connected'  – both pipes have a client connection
 *  'message'    – a complete CommandInfo frame arrived on PipeA (arg: CommandInfo)
 *  'end'        – PipeA was closed by the remote side
 *  'error'      – a socket/server error occurred (arg: Error)
 */
export class PipeTransport extends EventEmitter implements IDebugTransport {
  readonly kind = 'pipe' as const;
  private readonly pipeId: string;
  private serverA: net.Server;   // PipeA: program→debugger (read)
  private serverB: net.Server;   // PipeB: debugger→program (write)
  private socketA: net.Socket | null = null;   // read socket (PipeA)
  private socketB: net.Socket | null = null;   // write socket (PipeB)
  private bufferA = new MessageBuffer();
  private connectedA = false;
  private connectedB = false;
  private _connected = false;

  constructor(pipeId: string) {
    super();
    this.pipeId = pipeId;
    this.serverA = net.createServer();
    this.serverB = net.createServer();
  }

  /** PipeA name: program writes here, debugger reads. */
  get pipeNameA(): string {
    return `${PIPE_BASE}PipeA_${this.pipeId}`;
  }

  /** PipeB name: debugger writes here, program reads. */
  get pipeNameB(): string {
    return `${PIPE_BASE}PipeB_${this.pipeId}`;
  }

  getCommunicationString(): string {
    return `NamedPipes;${this.pipeNameA};${this.pipeNameB}`;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  /**
   * Start listening on both named pipes.
   * Must be called BEFORE launching the PureBasic executable.
   */
  async listen(): Promise<void> {
    await Promise.all([
      // PipeA: program→debugger — we read incoming frames
      this.listenPipe(this.serverA, this.pipeNameA, (socket) => {
        this.socketA = socket;
        socket.on('data', (chunk: Buffer) => {
          const messages = this.bufferA.append(chunk);
          for (const msg of messages) {
            this.emit('message', msg);
          }
        });
        socket.on('error', (err) => this.emit('error', err));
        socket.on('end', () => this.emit('end'));
        this.connectedA = true;
        this.checkBothConnected();
      }),
      // PipeB: debugger→program — we write commands to it
      this.listenPipe(this.serverB, this.pipeNameB, (socket) => {
        this.socketB = socket;
        socket.on('error', (err) => this.emit('error', err));
        this.connectedB = true;
        this.checkBothConnected();
      }),
    ]);
  }

  private listenPipe(
    server: net.Server,
    pipeName: string,
    onConnect: (socket: net.Socket) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(pipeName, () => {
        server.removeListener('error', reject);
        server.once('connection', (socket) => {
          onConnect(socket);
        });
        resolve();
      });
    });
  }

  private checkBothConnected(): void {
    if (this.connectedA && this.connectedB && !this._connected) {
      this._connected = true;
      this.emit('connected');
    }
  }

  /** Send a CommandInfo message to the PureBasic program over PipeB (debugger→program). */
  send(info: Parameters<typeof serialize>[0]): void {
    if (!this.socketB) {
      throw new Error('PipeB not connected – cannot send command');
    }
    this.socketB.write(serialize(info));
  }

  /** Destroy sockets and close pipe servers. */
  close(): void {
    try { this.socketA?.destroy(); } catch {}
    try { this.socketB?.destroy(); } catch {}
    try { this.serverA.close(); } catch {}
    try { this.serverB.close(); } catch {}
    this.bufferA.clear();
    this._connected = false;
  }
}
