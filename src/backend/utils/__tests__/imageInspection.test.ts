import { inspectImage } from '../imageInspection';

const png = () =>
  Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
    ),
    (character) => character.charCodeAt(0),
  );

function ascii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1)
    bytes[offset + index] = value.charCodeAt(index);
}

function webpContainer(chunk: string, length: number) {
  const bytes = new Uint8Array(length);
  ascii(bytes, 0, 'RIFF');
  ascii(bytes, 8, 'WEBP');
  ascii(bytes, 12, chunk);
  return bytes;
}

function vp8x(width: number, height: number, animated = false) {
  const bytes = webpContainer('VP8X', 30);
  bytes[20] = animated ? 0x02 : 0;
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

function vp8l(width: number, height: number) {
  const bytes = webpContainer('VP8L', 25);
  bytes[20] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  bytes[21] = bits & 0xff;
  bytes[22] = (bits >> 8) & 0xff;
  bytes[23] = (bits >> 16) & 0xff;
  bytes[24] = (bits >> 24) & 0xff;
  return bytes;
}

describe('image inspection', () => {
  it('reads PNG dimensions without a native decode', () => {
    expect(inspectImage(png())).toEqual({ width: 1, height: 1, mediaType: 'image/png' });
  });

  it('rejects animated PNG and executable formats', () => {
    const animated = png();
    new DataView(animated.buffer).setUint32(37, 0x6163544c);
    expect(() => inspectImage(animated)).toThrow();
    expect(() => inspectImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toThrow();
  });

  it('reads extended, lossless WebP dimensions', () => {
    expect(inspectImage(vp8x(900, 1200))).toEqual({
      width: 900,
      height: 1200,
      mediaType: 'image/webp',
    });
    expect(inspectImage(vp8l(640, 480))).toEqual({
      width: 640,
      height: 480,
      mediaType: 'image/webp',
    });
  });

  it('rejects animated WebP', () => {
    expect(() => inspectImage(vp8x(900, 1200, true))).toThrow();
  });
});
