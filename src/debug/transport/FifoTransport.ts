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
  private connectionFilePath: string = '';
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
    // Use instance-specific connection file to avoid conflicts with multiple VS Code windows
    this.connectionFilePath = path.join(os.tmpdir(), `.pbdebugger-${id}.out`);

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
      let inRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let outRetryTimer: ReturnType<typeof setTimeout> | null = null;

      const timeout = setTimeout(() => {
        // Cancel any pending retry timers to prevent resource leak
        if (inRetryTimer) {
          clearTimeout(inRetryTimer);
          inRetryTimer = null;
        }
        if (outRetryTimer) {
          clearTimeout(outRetryTimer);
          outRetryTimer = null;
        }
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
              inRetryTimer = setTimeout(tryOpenIn, 100);
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
              outRetryTimer = setTimeout(tryOpenOut, 100);
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
   *
   * Uses async fs.read() to avoid blocking the event loop.
   */
  private startPolling(): void {
    const POLL_INTERVAL = 20; // ms
    const READ_BUF_SIZE = 8192;

    const poll = () => {
      if (this.inFd === null) {
        this.pollTimer = null;
        return;
      }

      const buf = Buffer.alloc(READ_BUF_SIZE);
      fs.read(this.inFd, buf, 0, READ_BUF_SIZE, null, (err, bytesRead) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'EAGAIN' ||
              (err as NodeJS.ErrnoException).code === 'EWOULDBLOCK') {
            // No data available right now — perfectly normal, schedule next poll
            this.pollTimer = setTimeout(poll, POLL_INTERVAL);
            return;
          }
          this.log(`Poll read error: ${err.message}`);
          if ((err as NodeJS.ErrnoException).code !== 'EPIPE' &&
              (err as NodeJS.ErrnoException).code !== 'ECONNRESET') {
            this.emit('error', err);
          }
          // Continue polling even after non-fatal errors
          this.pollTimer = setTimeout(poll, POLL_INTERVAL);
          return;
        }

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

        // Schedule next poll
        this.pollTimer = setTimeout(poll, POLL_INTERVAL);
      });
    };

    // Start the first poll
    poll();
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private createFifo(fifoPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      execFile('mkfifo', [fifoPath], (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async writeConnectionFile(): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const info = `FifoFiles;${this.inFifoPath};${this.outFifoPath}`;
    const options = `1;1;0;0`;

    const content = `PB_DEBUGGER_Communication\n${timestamp}\n${info}\n${options}\n`;

    await fs.promises.writeFile(this.connectionFilePath, content, 'utf8');
    this.log(`Connection file written: ${this.connectionFilePath} with timestamp ${timestamp}`);

    const stats = await fs.promises.stat(this.connectionFilePath);
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
    if (!this._connected || !this.outStream) {
      throw new Error('FIFO transport not connected');
    }

    const data = serialize(info);
    const success = this.outStream.write(data);
    this.log(`Sent message: cmd=${info.command}, size=${data.length}, queued=${!success}`);
  }

  close(): void {
    this.stopPolling();

    try {
      this.outStream?.destroy();
    } catch {}
    this.outStream = null;
    // outFd 已被 outStream.destroy() 关闭（autoClose 默认为 true），不要再 closeSync
    this.outFd = null;

    if (this.inFd !== null) {
      try { fs.closeSync(this.inFd); } catch {}
      this.inFd = null;
    }

    try { fs.unlinkSync(this.inFifoPath); } catch {}
    try { fs.unlinkSync(this.outFifoPath); } catch {}
    if (this.connectionFilePath) {
      try { fs.unlinkSync(this.connectionFilePath); } catch {}
    }

    this._connected = false;
    this.buffer = Buffer.alloc(0);
  }

  private log(msg: string): void {
    this.emit('log', msg);
  }
}
