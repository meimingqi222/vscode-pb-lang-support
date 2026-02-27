import { CommandInfo } from '../types/debugTypes';

export const HEADER_SIZE = 20;

/**
 * Serialise a CommandInfo into a binary Buffer (little-endian, 20-byte header + data).
 * Only `command` is required; all other fields default to 0 / empty.
 */
export function serialize(info: {
  command: number;
  value1?: number;
  value2?: number;
  timestamp?: number;
  data?: Buffer;
}): Buffer {
  const data = info.data ?? Buffer.alloc(0);
  const buf = Buffer.alloc(HEADER_SIZE + data.length);
  buf.writeUInt32LE(info.command,           0);
  buf.writeUInt32LE(data.length,            4);
  buf.writeUInt32LE(info.value1    ?? 0,    8);
  buf.writeUInt32LE(info.value2    ?? 0,   12);
  buf.writeUInt32LE(info.timestamp ?? 0,   16);
  if (data.length > 0) {
    data.copy(buf, HEADER_SIZE);
  }
  return buf;
}

/**
 * Deserialise a complete binary frame (header + data) into a CommandInfo.
 * The caller must ensure `buf.length >= HEADER_SIZE + dataSize`.
 */
export function deserialize(buf: Buffer): CommandInfo {
  const dataSize = buf.readUInt32LE(4);
  return {
    command:   buf.readUInt32LE(0),
    dataSize,
    value1:    buf.readUInt32LE(8),
    value2:    buf.readUInt32LE(12),
    timestamp: buf.readUInt32LE(16),
    data:      buf.slice(HEADER_SIZE, HEADER_SIZE + dataSize),
  };
}
