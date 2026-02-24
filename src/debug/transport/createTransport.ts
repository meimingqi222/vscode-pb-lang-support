import { LaunchTransportMode } from '../types/debugTypes';
import { IDebugTransport } from './IDebugTransport';
import { NetworkTransport } from './NetworkTransport';
import { PipeTransport } from './PipeTransport';

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
  const resolved = requested === 'auto'
    ? (platform === 'win32' ? 'pipe' : 'network')
    : requested;

  if (resolved === 'native') {
    throw new Error(
      'transport "native" is planned but not implemented yet. Use "network" on Linux/macOS for now.',
    );
  }

  if (resolved === 'pipe') {
    if (platform !== 'win32') {
      throw new Error('transport "pipe" is only supported on Windows. Use "network" on Linux/macOS.');
    }
    return new PipeTransport(options.pipeId);
  }

  const host = (options.debugHost ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = options.debugPort ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid debugPort "${port}". Expected integer in range 0..65535.`);
  }
  return new NetworkTransport(host, port, options.debugPassword);
}

