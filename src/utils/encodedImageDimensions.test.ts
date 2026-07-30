import { describe, expect, it } from 'vitest';
import { encodedImageDimensions } from './encodedImageDimensions';
import { JPEG_SEGMENT_LIMIT } from './jpegStructure';

describe('encodedImageDimensions', () => {
  it('reads JPEG frame dimensions without invoking a decoder', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x10, 0x00, 0x20, 0x00, 0x03,
      0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xff, 0xd9,
    ]);
    expect(encodedImageDimensions(jpeg)).toEqual({ width: 8_192, height: 4_096 });
  });

  it('reads PNG IHDR dimensions', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(png.buffer).setUint32(16, 12_000);
    new DataView(png.buffer).setUint32(20, 8_000);
    expect(encodedImageDimensions(png)).toEqual({ width: 12_000, height: 8_000 });
  });

  it('reads extended WebP canvas dimensions', () => {
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    webp.set([0x56, 0x50, 0x38, 0x58], 12);
    webp.set([0xff, 0x0f, 0x00], 24);
    webp.set([0xff, 0x07, 0x00], 27);
    expect(encodedImageDimensions(webp)).toEqual({ width: 4_096, height: 2_048 });
  });

  it('returns undefined for malformed or unsupported headers', () => {
    expect(encodedImageDimensions(new Uint8Array([0x89, 0x50]))).toBeUndefined();
    expect(encodedImageDimensions(new Uint8Array(30))).toBeUndefined();
  });

  it('fails closed when JPEG dimension preflight exceeds the segment budget', () => {
    const jpeg = new Uint8Array(2 + JPEG_SEGMENT_LIMIT * 4);
    jpeg.set([0xff, 0xd8]);
    for (let offset = 2; offset < jpeg.length; offset += 4) {
      jpeg.set([0xff, 0xe0, 0x00, 0x02], offset);
    }

    expect(() => encodedImageDimensions(jpeg)).toThrow('segment safety limit');
  });
});
