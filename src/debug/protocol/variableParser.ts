export const PB_TYPE_NAMES: Record<number, string> = {
  0:  'Uninitialized',
  1:  'Byte',
  2:  'Word',
  3:  'Long',
  4:  'Float',
  5:  'String',
  6:  'Double',
  7:  'Quad',
  8:  'Character',
  9:  'Pointer',
  10: 'Integer',
  21: 'Long', // Type .l
};

export interface ParsedVariable {
  name:     string;
  typeId:   number;
  typeName: string;
  value:    string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readUTF16LEZString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  let end = offset;
  while (end + 1 < buf.length) {
    if (buf[end] === 0 && buf[end + 1] === 0) break;
    end += 2;
  }
  return {
    value:      buf.slice(offset, end).toString('utf16le'),
    nextOffset: end + 2, // skip null terminator
  };
}

function readASCIIZString(buf: Buffer, offset: number): { value: string; nextOffset: number } | null {
  const end = buf.indexOf(0, offset);
  if (end === -1) return null;
  return {
    value: buf.toString('utf8', offset, end),
    nextOffset: end + 1,
  };
}

function normalizePBTypeForGlobalValue(rawType: number): number {
  const isPointer = (rawType & 0x80) !== 0;
  const baseType = rawType & 0x3F;

  if (isPointer) {
    return 9; // Pointer
  }

  switch (baseType) {
    case 1:  return 1;   // Byte
    case 3:  return 2;   // Word
    case 5:  return 3;   // Long
    case 8:  return 5;   // String
    case 10: return 5;   // FixedString -> show as string in globals
    case 9:  return 4;   // Float
    // In GlobalNames payloads we observed string-like globals reported with base type 11.
    // Mapping this to Character causes garbage values (for example 'ᔀ') from fixed-entry decoding.
    case 11: return 5;   // String
    case 12: return 6;   // Double
    case 13: return 7;   // Quad
    case 21: return 21;  // Integer/Long (.l in current handling)
    default: return baseType;
  }
}

function toHex32(value: number): string {
  return '0x' + value.toString(16).toUpperCase();
}

function toHex64(value: bigint): string {
  return '0x' + value.toString(16).toUpperCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GlobalNames / LocalNames response payload.
 *
 * Format:  [4B count] followed by entries
 * Entry: varies, need to determine exact format from data
 */
export function parseNames(data: Buffer): Array<{ name: string; typeId: number }> {
  if (data.length === 0) return [];

  // Format A (legacy tests): [4B count] + repeated [4B typeId] + [UTF16LEZ name]
  if (data.length >= 4) {
    const declaredCount = data.readUInt32LE(0);
    if (declaredCount === 0) return [];
    if (declaredCount > 0 && declaredCount <= 4096) {
      const strict: Array<{ name: string; typeId: number }> = [];
      let offset = 4;
      for (let i = 0; i < declaredCount; i++) {
        if (offset + 4 > data.length) {
          strict.length = 0;
          break;
        }

        const typeId = data.readUInt32LE(offset);
        offset += 4;

        const decoded = readUTF16LEZString(data, offset);
        if (decoded.nextOffset > data.length) {
          strict.length = 0;
          break;
        }

        strict.push({ name: decoded.value, typeId });
        offset = decoded.nextOffset;
      }

      if (strict.length === declaredCount) {
        return strict;
      }
    }
  }

  // Format B (real PB globals): repeated [7B header] + [ASCIIZ name] + [ASCIIZ module]
  // Header layout mirrors PB variable metadata prefix (type + flags/scope/sublevel).
  const names: Array<{ name: string; typeId: number }> = [];
  let offset = 0;
  while (offset + 7 <= data.length) {
    const rawType = data.readUInt8(offset);
    const typeId = normalizePBTypeForGlobalValue(rawType);
    const nameDecoded = readASCIIZString(data, offset + 7);
    if (!nameDecoded) break;
    const moduleDecoded = readASCIIZString(data, nameDecoded.nextOffset);
    if (!moduleDecoded) break;

    const baseName = nameDecoded.value.trim();
    const moduleName = moduleDecoded.value.trim();
    if (baseName) {
      const qualified = moduleName && !baseName.includes('::')
        ? `${moduleName}::${baseName}`
        : baseName;
      names.push({ name: qualified, typeId });
    }

    offset = moduleDecoded.nextOffset;
  }

  return names;
}

/**
 * Parse a Globals / Locals response payload into human-readable variable values.
 *
 * Format: Each entry is 8 bytes: [1B typeId] [3B padding] [4B value data] (32-bit)
 *         or 16 bytes for 64-bit values
 *
 * @param data    Raw payload from the Globals or Locals response.
 * @param names   Corresponding names list (same order, same count).
 * @param is64bit Whether the target process is 64-bit (affects Integer/Pointer size).
 */
export function parseValues(
  data:    Buffer,
  names:   Array<{ name: string; typeId: number }>,
  is64bit: boolean = false,
): ParsedVariable[] {
  const parseFixedEntries = (): ParsedVariable[] => {
    const result: ParsedVariable[] = [];
    const ENTRY_SIZE = 8;

    for (let i = 0; i < names.length; i++) {
      const { name, typeId } = names[i];
      if (!name) continue;

      const offset = i * ENTRY_SIZE;
      if (offset + ENTRY_SIZE > data.length) break;

      const valueOffset = offset + 4;
      let value: string;

      switch (typeId) {
        case 0:
          value = '<uninitialized>';
          break;
        case 1:
          if (valueOffset + 1 > data.length) return result;
          value = String(data.readInt8(valueOffset));
          break;
        case 2:
          if (valueOffset + 2 > data.length) return result;
          value = String(data.readInt16LE(valueOffset));
          break;
        case 3:
        case 21:
          if (valueOffset + 4 > data.length) return result;
          value = String(data.readInt32LE(valueOffset));
          break;
        case 4:
          if (valueOffset + 4 > data.length) return result;
          value = data.readFloatLE(valueOffset).toPrecision(7);
          break;
        case 5:
          value = '<string>';
          break;
        case 6:
          if (offset + 8 > data.length) return result;
          value = String(data.readDoubleLE(offset));
          break;
        case 7:
          if (offset + 8 > data.length) return result;
          value = String(data.readBigInt64LE(offset));
          break;
        case 8:
          if (valueOffset + 2 > data.length) return result;
          value = `'${String.fromCharCode(data.readUInt16LE(valueOffset))}'`;
          break;
        case 9:
          if (is64bit) {
            if (offset + 8 > data.length) return result;
            value = toHex64(data.readBigUInt64LE(offset));
          } else {
            if (valueOffset + 4 > data.length) return result;
            value = toHex32(data.readUInt32LE(valueOffset));
          }
          break;
        case 10:
          if (is64bit) {
            if (offset + 8 > data.length) return result;
            value = toHex64(data.readBigUInt64LE(offset));
          } else {
            if (valueOffset + 4 > data.length) return result;
            value = toHex32(data.readUInt32LE(valueOffset));
          }
          break;
        default:
          continue;
      }

      result.push({ name, typeId, typeName: PB_TYPE_NAMES[typeId] ?? `Type${typeId}`, value });
    }

    return result;
  };

  const parseSequential = (): ParsedVariable[] => {
    const result: ParsedVariable[] = [];
    let offset = 0;

    for (const { name, typeId } of names) {
      if (!name) continue;

      let value: string;

      switch (typeId) {
        case 0:
          value = '<uninitialized>';
          break;
        case 1:
          if (offset + 1 > data.length) return result;
          value = String(data.readInt8(offset));
          offset += 1;
          break;
        case 2:
          if (offset + 2 > data.length) return result;
          value = String(data.readInt16LE(offset));
          offset += 2;
          break;
        case 3:
        case 21:
          if (offset + 4 > data.length) return result;
          value = String(data.readInt32LE(offset));
          offset += 4;
          break;
        case 4:
          if (offset + 4 > data.length) return result;
          value = data.readFloatLE(offset).toPrecision(7);
          offset += 4;
          break;
        case 5: {
          if (offset + 4 > data.length) return result;
          const len = data.readUInt32LE(offset);
          offset += 4;
          const bytes = len * 2;
          if (offset + bytes > data.length) return result;
          const str = data.toString('utf16le', offset, offset + bytes);
          value = `"${str}"`;
          offset += bytes;
          break;
        }
        case 6:
          if (offset + 8 > data.length) return result;
          value = String(data.readDoubleLE(offset));
          offset += 8;
          break;
        case 7:
          if (offset + 8 > data.length) return result;
          value = String(data.readBigInt64LE(offset));
          offset += 8;
          break;
        case 8:
          if (offset + 2 > data.length) return result;
          value = `'${String.fromCharCode(data.readUInt16LE(offset))}'`;
          offset += 2;
          break;
        case 9:
          if (is64bit) {
            if (offset + 8 > data.length) return result;
            value = toHex64(data.readBigUInt64LE(offset));
            offset += 8;
          } else {
            if (offset + 4 > data.length) return result;
            value = toHex32(data.readUInt32LE(offset));
            offset += 4;
          }
          break;
        case 10:
          if (is64bit) {
            if (offset + 8 > data.length) return result;
            value = toHex64(data.readBigUInt64LE(offset));
            offset += 8;
          } else {
            if (offset + 4 > data.length) return result;
            value = toHex32(data.readUInt32LE(offset));
            offset += 4;
          }
          break;
        default:
          return result;
      }

      result.push({ name, typeId, typeName: PB_TYPE_NAMES[typeId] ?? `Type${typeId}`, value });
    }

    return result;
  };

  const fixed = parseFixedEntries();
  const sequential = parseSequential();

  if (fixed.length === names.length && sequential.length !== names.length) return fixed;
  if (sequential.length === names.length && fixed.length !== names.length) return sequential;

  if (names.some((n) => n.typeId === 5) && sequential.length === fixed.length && sequential.length > 0) {
    return sequential;
  }

  return sequential.length > fixed.length ? sequential : fixed;
}
