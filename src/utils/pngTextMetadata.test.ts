import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractPngTextMetadata } from './pngTextMetadata';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(new TextEncoder().encode(type), 4);
  output.set(data, 8);
  return output;
}

function png(...chunks: Uint8Array[]): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const size = signature.length + chunks.reduce((total, item) => total + item.length, 0);
  const output = new Uint8Array(size);
  output.set(signature);
  let offset = signature.length;
  for (const item of chunks) { output.set(item, offset); offset += item.length; }
  return output;
}

const limits = { maxEntries: 20, maxValueChars: 10_000, maxTotalChars: 20_000 };

describe('extractPngTextMetadata', () => {
  it('extracts Latin-1 tEXt and Unicode iTXt', async () => {
    const text = new TextEncoder().encode('parameters\0cat prompt');
    const international = new TextEncoder().encode('prompt\0\0\0\0\0고양이 프롬프트');
    const result = await extractPngTextMetadata(png(chunk('tEXt', text), chunk('iTXt', international), chunk('IEND', new Uint8Array())), limits);

    expect(result).toEqual({ parameters: 'cat prompt', prompt: '고양이 프롬프트' });
  });

  it('extracts compressed zTXt and compressed iTXt', async () => {
    const ztxt = new Uint8Array([...new TextEncoder().encode('parameters\0'), 0, ...deflateSync('compressed prompt')]);
    const itxt = new Uint8Array([...new TextEncoder().encode('workflow\0'), 1, 0, 0, 0, ...deflateSync('{"nodes":[]}')]);
    const result = await extractPngTextMetadata(png(chunk('zTXt', ztxt), chunk('iTXt', itxt), chunk('IEND', new Uint8Array())), limits);

    expect(result).toEqual({ parameters: 'compressed prompt', workflow: '{"nodes":[]}' });
  });

  it('preserves duplicate keys and ignores malformed chunk lengths', async () => {
    const first = new TextEncoder().encode('prompt\0one');
    const second = new TextEncoder().encode('prompt\0two');
    expect(await extractPngTextMetadata(png(chunk('tEXt', first), chunk('tEXt', second)), limits)).toEqual({ prompt: ['one', 'two'] });

    const malformed = png(chunk('tEXt', first));
    new DataView(malformed.buffer).setUint32(8, 0xfffffff0);
    expect(await extractPngTextMetadata(malformed, limits)).toEqual({});
  });

  it('enforces value and total character limits', async () => {
    const text = new TextEncoder().encode(`parameters\0${'x'.repeat(100)}`);
    const result = await extractPngTextMetadata(png(chunk('tEXt', text)), { maxEntries: 1, maxValueChars: 8, maxTotalChars: 30 });
    expect(result.parameters).toBe('xxxxxxxx');
  });
});
