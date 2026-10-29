/**
 * Header inspection before any native decoder sees external bytes. Admits still
 * PNG, JPEG, and WebP; rejects formats that can execute or animate.
 */
export type InspectedImage = { width: number; height: number; mediaType: string };

const WEBP_ANIMATION_FLAG = 0x02;

export function inspectImage(bytes: Uint8Array): InspectedImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 33 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    let position = 8;
    let hasEnd = false;
    while (position + 12 <= bytes.length) {
      const size = view.getUint32(position);
      const kind = view.getUint32(position + 4);
      if (
        position + size + 12 > bytes.length ||
        kind === 0x6163544c ||
        (position !== 8 && kind === 0x49484452)
      )
        throw new Error('Invalid or animated PNG');
      if (kind === 0x49454e44) {
        hasEnd = true;
        break;
      }
      position += size + 12;
    }
    if (!hasEnd) throw new Error('Incomplete PNG');
    return { width: view.getUint32(16), height: view.getUint32(20), mediaType: 'image/png' };
  }
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let position = 2;
    while (position + 4 <= bytes.length) {
      if (bytes[position++] !== 0xff) break;
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xd9 || marker === 0xda) break;
      const size = view.getUint16(position);
      if (size < 2 || position + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) {
        return {
          height: view.getUint16(position + 3),
          width: view.getUint16(position + 5),
          mediaType: 'image/jpeg',
        };
      }
      position += size;
    }
  }
  if (isWebp(bytes)) return inspectWebp(bytes);
  throw new Error('Unsupported image');
}

/** RIFF container with a WEBP form type; the chunk that follows carries the size. */
function isWebp(bytes: Uint8Array) {
  return bytes.length >= 16 && fourCc(bytes, 0) === 'RIFF' && fourCc(bytes, 8) === 'WEBP';
}

function inspectWebp(bytes: Uint8Array): InspectedImage {
  const chunk = fourCc(bytes, 12);
  if (chunk === 'VP8X') {
    if (bytes.length < 30) throw new Error('Incomplete WebP');
    // The animation flag means the first frame is not the whole picture.
    if ((bytes[20]! & WEBP_ANIMATION_FLAG) !== 0) throw new Error('Animated WebP');
    return {
      width: 1 + readUint24(bytes, 24),
      height: 1 + readUint24(bytes, 27),
      mediaType: 'image/webp',
    };
  }
  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) throw new Error('Incomplete WebP');
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      mediaType: 'image/webp',
    };
  }
  if (chunk === 'VP8 ') {
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a)
      throw new Error('Incomplete WebP');
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff || 0,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff || 0,
      mediaType: 'image/webp',
    };
  }
  throw new Error('Unsupported WebP');
}

function fourCc(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function readUint24(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}
