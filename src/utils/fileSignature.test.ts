import { describe, expect, it } from 'vitest';
import {
  detectFileType,
  detectFileTypeFromBytes,
  detectFileTypeFromFile,
  SIGNATURE_PREFIX_BYTES,
} from './fileSignature';

const cases = [
  { name: 'photo.jpg', type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { name: 'photo.png', type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  { name: 'photo.webp', type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], mime: 'image/webp' },
  { name: 'photo.avif', type: 'image/avif', bytes: [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], mime: 'image/avif' },
  { name: 'photo.heic', type: 'image/heic', bytes: [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], mime: 'image/heic' },
  { name: 'photo.tiff', type: 'image/tiff', bytes: [0x49, 0x49, 0x2a, 0], mime: 'image/tiff' },
  { name: 'photo.cr2', type: 'image/x-canon-cr2', bytes: [0x49, 0x49, 0x2a, 0, 0x10, 0, 0, 0, 0x43, 0x52], mime: 'image/x-canon-cr2' },
] as const;

describe('detectFileType', () => {
  it.each(cases)('recognizes $name by signature', ({ name, type, bytes, mime }) => {
    const result = detectFileType({ name, type }, new Uint8Array(bytes));
    expect(result.actualMime).toBe(mime);
    expect(result.extensionMatches).toBe(true);
    expect(result.mimeMatches).toBe(true);
  });

  it('accepts DNG and NEF as TIFF-family files', () => {
    const bytes = new Uint8Array([0x49, 0x49, 0x2a, 0]);
    expect(detectFileType({ name: 'capture.dng', type: 'image/x-adobe-dng' }, bytes).mimeMatches).toBe(true);
    expect(detectFileType({ name: 'capture.nef', type: 'image/x-nikon-nef' }, bytes).extensionMatches).toBe(true);
  });

  it('does not treat an unknown binary as matching its claimed image type', () => {
    const result = detectFileType({ name: 'payload.jpg', type: 'image/jpeg' }, new Uint8Array([0x4d, 0x5a, 0x90, 0]));
    expect(result.actualMime).toBe('application/octet-stream');
    expect(result.extensionMatches).toBe(false);
    expect(result.mimeMatches).toBe(false);
  });

  it('does not admit a file type recognized by the external detector but outside the product allowlist', async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
    const result = await detectFileTypeFromBytes({ name: 'payload.jpg', type: 'image/jpeg' }, gif);
    expect(result.actualMime).toBe('application/octet-stream');
    expect(result.extensionMatches).toBe(false);
    expect(result.mimeMatches).toBe(false);
  });

  it('uses the independent detector to distinguish a DNG TIFF tag without widening accepted MIME types', async () => {
    const dng = new Uint8Array(26);
    dng.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0xc6], 0);
    const result = await detectFileTypeFromBytes({ name: 'capture.dng', type: 'image/x-adobe-dng' }, dng);
    expect(result.actualMime).toBe('image/tiff');
    expect(result.formatName).toBe('DNG');
    expect(result.extensionMatches).toBe(true);
    expect(result.mimeMatches).toBe(true);
  });

  it('reads only the bounded signature prefix during intake', async () => {
    let requestedEnd = 0;
    const file = {
      name: 'bounded.jpg',
      type: 'image/jpeg',
      slice: (_start: number, end: number) => {
        requestedEnd = end;
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff])]);
      },
    } as File;
    expect((await detectFileTypeFromFile(file)).actualMime).toBe('image/jpeg');
    expect(requestedEnd).toBe(SIGNATURE_PREFIX_BYTES);
  });
});
