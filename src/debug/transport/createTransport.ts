import { LaunchTransportMode } from '../types/debugTypes';
import { IDebugTransport, DebugTransportKind } from './IDebugTransport';
import { NetworkTransport } from './NetworkTransport';
import { PipeTransport } from './PipeTransport';
import { FifoTransport } from './FifoTransport';

export interface CreateTransportOptions {
  platform?: NodeJS.Platform;
  transport?: LaunchTransportMode;
  pipeId: string;
  debugHost?: string;
  debugPort?: number;
  debugPassword?: string;
}

export function createTransport(options: CreateTransportOptions): IDebugTransport {
  const platform = options.platform ?? process.platform;
  const requested = options.transport ?? 'auto';

  // Explicit transport selection
  if (requested === 'fifo') {
    return new FifoTransport();
  }

  if (requested === 'pipe') {
    if (platform !== 'win32') {
      throw new Error('transport "pipe" is only supported on Windows. Use "fifo" on Linux/macOS.');
    }
    return new PipeTransport(options.pipeId);
  }

  if (requested === 'network') {
    const host = (options.debugHost ?? '127.0.0.1').trim() || '127.0.0.1';
    const port = options.debugPort ?? 0;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`Invalid debugPort "${port}". Expected integer in range 0..65535.`);
    }
    return new NetworkTransport(host, port, options.debugPassword);
  }

  // Auto/Native mode: Windows uses Pipe, macOS/Linux uses FIFO
  if (requested === 'auto' || requested === 'native') {
    if (platform === 'win32') {
      return new PipeTransport(options.pipeId);
    }
    return new FifoTransport();
  }

  throw new Error(`Unknown transport mode: ${requested}`);
}

