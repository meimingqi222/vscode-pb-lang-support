import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { serialize, deserialize, HEADER_SIZE } from '../protocol/CommandInfo';
import { IDebugTransport } from './IDebugTransport';
import { CommandInfo } from '../types/debugTypes';

/**
 * FIFO-based transport for macOS/Linux PureBasic debugger.
 *
 * Uses named pipes (FIFOs) for bidirectional communication.
 * Reading is done via manual polling with fs.read() + O_NONBLOCK
 * to avoid fs.createReadStream's fatal EAGAIN handling (it calls
 * destroy() which closes the fd, causing SIGPIPE on the debuggee).
 */
export class FifoTransport extends EventEmitter implements IDebugTransport {
  readonly kind = 'fifo' as const;

  private inFifoPath: string = '';
  private outFifoPath: string = '';
  private inFd: number | null = null;
  private outFd: number | null = null;
  private outStream: fs.WriteStream | null = null;
  private buffer = Buffer.alloc(0);
  private _connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async listen(): Promise<void> {
    const id = Math.random().toString(36).substring(2, 10);
    this.inFifoPath = path.join(os.tmpdir(), `.pb-fifo-in-${id}`);
    this.outFifoPath = path.join(os.tmpdir(), `.pb-fifo-out-${id}`);

    await this.createFifo(this.inFifoPath);
    await this.createFifo(this.outFifoPath);

    this.log(`FIFOs created: in=${this.inFifoPath}, out=${this.outFifoPath}`);

    await this.writeConnectionFile();

    this.log('FIFO transport ready, waiting for program to connect');
  }

  /**
   * Connect to FIFOs after the program has been started.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for FIFO connection'));
      }, 10000);

      this.log('Opening FIFOs...');

      const tryOpenIn = () => {
        // O_RDONLY | O_NONBLOCK: non-blocking open (won't hang if no writer yet)
        // and non-blocking reads (EAGAIN instead of blocking when no data).
        // We handle EAGAIN manually in the poll loop instead of using ReadStream.
        fs.open(this.inFifoPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK, (err, fd) => {
          if (err) {
            if (err.code === 'ENXIO' || err.code === 'EAGAIN') {
              setTimeout(tryOpenIn, 100);
              return;
            }
            clearTimeout(timeout);
            reject(err);
            return;
          }
          this.inFd = fd;
          this.log('Input FIFO (read) opened');
          tryOpenOut();
        });
      };

      const tryOpenOut = () => {
        fs.open(this.outFifoPath, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK, (err, fd) => {
          if (err) {
            if (err.code === 'ENXIO' || err.code === 'EAGAIN') {
              setTimeout(tryOpenOut, 100);
              return;
            }
            clearTimeout(timeout);
            reject(err);
            return;
          }
          this.outFd = fd;
          this.outStream = fs.createWriteStream('', { fd });
          this.log('Output FIFO (write) opened');

          this.outStream.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EPIPE') {
              this.log('Output stream EPIPE (program may have exited)');
              return;
            }
            this.log(`Output stream error: ${err.message}`);
          });

          // Start polling for incoming data
          this.startPolling();
          this._connected = true;
          clearTimeout(timeout);
          this.emit('connected');
          resolve();
        });
      };

      tryOpenIn();
    });
  }

  /**
   * Poll the input FIFO for data using non-blocking fs.read().
   * EAGAIN simply means "no data yet" — we just retry on the next tick.
   * This avoids the fatal destroy() that fs.createReadStream does on EAGAIN.
   */
  private startPolling(): void {
    const POLL_INTERVAL = 20; // ms
    const READ_BUF_SIZE = 8192;

    this.pollTimer = setInterval(() => {
      if (this.inFd === null) return;

      const buf = Buffer.alloc(READ_BUF_SIZE);
      try {
        const bytesRead = fs.readSync(this.inFd, buf, 0, READ_BUF_SIZE, null);
        if (bytesRead === 0) {
          // EOF — writer closed their end
          this.log('Input FIFO EOF');
          this.stopPolling();
          this._connected = false;
          this.emit('end');
          return;
        }
        this.buffer = Buffer.concat([this.buffer, buf.slice(0, bytesRead)]);
        this.processBuffer();
      } catch (err: any) {
        if (err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK') {
          // No data available right now — perfectly normal, just wait
          return;
        }
        this.log(`Poll read error: ${err.message}`);
        if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          this.emit('error', err);
        }
      }
    }, POLL_INTERVAL);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private createFifo(fifoPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(`mkfifo "${fifoPath}"`, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async writeConnectionFile(): Promise<void> {
    const filePath = '/tmp/.pbdebugger.out';
    const timestamp = Math.floor(Date.now() / 1000);
    const info = `FifoFiles;${this.inFifoPath};${this.outFifoPath}`;
    const options = `1;1;0;0`;

    const content = `PB_DEBUGGER_Communication\n${timestamp}\n${info}\n${options}\n`;

    await fs.promises.writeFile(filePath, content, 'utf8');
    this.log(`Connection file written: ${filePath} with timestamp ${timestamp}`);

    const stats = await fs.promises.stat(filePath);
    this.log(`File mtime: ${stats.mtime.getTime() / 1000}`);
  }

  private processBuffer(): void {
    while (this.buffer.length >= HEADER_SIZE) {
      const dataSize = this.buffer.readUInt32LE(4);
      const totalSize = HEADER_SIZE + dataSize;

      if (this.buffer.length < totalSize) {
        break;
      }

      const msg = deserialize(this.buffer.slice(0, totalSize));
      this.log(`Received message: cmd=${msg.command}`);
      this.emit('message', msg);

      this.buffer = this.buffer.slice(totalSize);
    }
  }

  getCommunicationString(): string {
    return `FifoFiles;${this.inFifoPath};${this.outFifoPath}`;
  }

  send(info: Parameters<typeof serialize>[0]): void {
    if (!this._connected) {
      throw new Error('FIFO transport not connected');
    }

    const data = serialize(info);

    if (this.outFd !== null) {
      try {
        fs.writeSync(this.outFd, data);
        this.log(`Sent message (sync): cmd=${info.command}, size=${data.length}`);
      } catch (err: any) {
        this.log(`Send error: ${err.message}`);
        throw err;
      }
    } else if (this.outStream) {
      const success = this.outStream.write(data);
      this.log(`Sent message (async): cmd=${info.command}, success=${success}`);
    } else {
      throw new Error('FIFO transport not connected');
    }
  }

  close(): void {
    this.stopPolling();

    try {
      this.outStream?.destroy();
    } catch {}

    if (this.inFd !== null) {
      try { fs.closeSync(this.inFd); } catch {}
      this.inFd = null;
    }
    if (this.outFd !== null) {
      try { fs.closeSync(this.outFd); } catch {}
      this.outFd = null;
    }

    try { fs.unlinkSync(this.inFifoPath); } catch {}
    try { fs.unlinkSync(this.outFifoPath); } catch {}
    try { fs.unlinkSync('/tmp/.pbdebugger.out'); } catch {}

    this._connected = false;
    this.buffer = Buffer.alloc(0);
  }

  private log(msg: string): void {
    this.emit('log', msg);
  }
}
