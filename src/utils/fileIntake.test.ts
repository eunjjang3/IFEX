import { describe, expect, it } from 'vitest';
import { fileIdentity, validateImageFiles } from './fileIntake';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const cr2 = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x10, 0x00, 0x00, 0x00, 0x43, 0x52]);

function imageFile(name: string, content: Uint8Array = jpeg, options: { type?: string; lastModified?: number } = {}) {
  return new File([Uint8Array.from(content)], name, {
    type: options.type ?? 'image/jpeg',
    lastModified: options.lastModified ?? 123,
  });
}

describe('validateImageFiles', () => {
  it('accepts supported signatures and rejects active-content formats', async () => {
    const raw = imageFile('capture.CR2', cr2, { type: '' });
    const svg = imageFile('vector.svg', new TextEncoder().encode('<svg><script/></svg>'), { type: 'image/svg+xml' });
    const result = await validateImageFiles([raw, svg]);
    expect(result.accepted).toEqual([raw]);
    expect(result.rejected).toEqual([expect.objectContaining({ file: svg, code: 'unsupported' })]);
  });

  it('rejects spoofed extensions, MIME mismatches, and unknown RAW signatures', async () => {
    const renamedExecutable = imageFile('payload.jpg', new Uint8Array([0x4d, 0x5a, 0x90, 0]), { type: 'image/jpeg' });
    const renamedJpeg = imageFile('payload.png', jpeg, { type: 'image/png' });
    const genericRaw = imageFile('sensor.raw', new Uint8Array([1, 2, 3, 4]), { type: '' });
    const result = await validateImageFiles([renamedExecutable, renamedJpeg, genericRaw]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map((item) => item.code)).toEqual(['invalid-signature', 'type-mismatch', 'invalid-signature']);
  });

  it('allows an operator to opt out of strict signature policy', async () => {
    const genericRaw = imageFile('sensor.raw', new Uint8Array([1, 2, 3, 4]), { type: '' });
    expect((await validateImageFiles([genericRaw], { strictFileTypes: false })).accepted).toEqual([genericRaw]);
  });

  it('rejects empty, oversized, and duplicate files independently', async () => {
    const empty = imageFile('empty.jpg', new Uint8Array());
    const oversized = imageFile('large.png', new Uint8Array([...png, 0, 0, 0]));
    const duplicate = imageFile('same.jpg');
    const result = await validateImageFiles([empty, oversized, duplicate], {
      maxFileBytes: 10,
      existingKeys: new Set([fileIdentity(duplicate)]),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map((item) => item.code)).toEqual(['empty', 'too-large', 'duplicate']);
  });

  it('applies active count and total-byte limits across batches', async () => {
    const first = imageFile('first.jpg');
    const second = imageFile('second.jpg');
    const countLimited = await validateImageFiles([first], { activeFileCount: 1, maxFiles: 1 });
    const bytesLimited = await validateImageFiles([second], { activeBytes: 8, maxActiveBytes: 12 });
    expect(countLimited.rejected[0]).toEqual(expect.objectContaining({ code: 'active-limit' }));
    expect(bytesLimited.rejected[0]).toEqual(expect.objectContaining({ code: 'active-bytes' }));
  });

  it('accounts for files accepted earlier in the same selection', async () => {
    const first = imageFile('first.jpg');
    const second = imageFile('second.jpg');
    const result = await validateImageFiles([first, second], { maxFiles: 1 });
    expect(result.accepted).toEqual([first]);
    expect(result.rejected[0]).toEqual(expect.objectContaining({ file: second, code: 'active-limit' }));
  });
});
