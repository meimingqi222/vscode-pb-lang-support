import { CommandInfo } from '../types/debugTypes';
import { deserialize, HEADER_SIZE } from '../protocol/CommandInfo';

/**
 * Accumulates raw bytes from a stream and extracts complete CommandInfo frames.
 * Handles TCP/pipe streaming by buffering until a full frame (header + data) is available.
 */
export class MessageBuffer {
  private buffer: Buffer = Buffer.alloc(0);

  /** Append a new chunk and return all complete CommandInfo frames extracted so far. */
  append(chunk: Buffer): CommandInfo[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: CommandInfo[] = [];

    while (this.buffer.length >= HEADER_SIZE) {
      const dataSize = this.buffer.readUInt32LE(4);
      const totalSize = HEADER_SIZE + dataSize;

      if (this.buffer.length < totalSize) {
        break; // not enough data yet
      }

      messages.push(deserialize(this.buffer.slice(0, totalSize)));
      this.buffer = this.buffer.slice(totalSize);
    }

    return messages;
  }

  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}
