import { describe, expect, it } from 'vitest';
import { sanitizeMetadata } from './metadataSanitizer';

describe('sanitizeMetadata', () => {
  it('summarizes binary values and truncates oversized strings', () => {
    const result = sanitizeMetadata({
      MakerNote: new Uint8Array(512),
      Comment: 'x'.repeat(40),
    }, { maxTags: 10, maxValueChars: 16, maxTotalChars: 1024 });
    expect(result.tags.MakerNote).toBe('[Binary Uint8Array: 512 bytes]');
    expect(String(result.tags.Comment)).toContain('[truncated 24 chars]');
    expect(result.status.truncated).toBe(true);
    expect(result.status.summarizedBinaryValueCount).toBe(1);
  });

  it('enforces the tag-count budget independently of the serialization budget', () => {
    const result = sanitizeMetadata({ a: '1', b: '2', c: '3' }, {
      maxTags: 2,
      maxValueChars: 32,
      maxTotalChars: 10_000,
    });
    expect(result.tags).toEqual({ a: '1', b: '2' });
    expect(result.status).toMatchObject({
      truncated: true,
      originalTagCount: 3,
      retainedTagCount: 2,
      omittedTagCount: 1,
    });
  });

  it('enforces the total serialization budget independently of the tag-count budget', () => {
    const result = sanitizeMetadata({ a: '12345678', b: '12345678', c: '12345678' }, {
      maxTags: 10,
      maxValueChars: 32,
      maxTotalChars: 20,
    });
    expect(result.tags).toEqual({ a: '12345678' });
    expect(JSON.stringify(result.tags).length).toBeLessThanOrEqual(20);
    expect(result.status).toMatchObject({ retainedTagCount: 1, omittedTagCount: 2 });
  });

  it('contains circular and excessively nested metadata without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const deeplyNested = { value: 'leaf' };
    let current: Record<string, unknown> = deeplyNested;
    for (let depth = 0; depth < 8; depth += 1) {
      current = { child: current };
    }

    const result = sanitizeMetadata({ circular, deeplyNested: current }, {
      maxTags: 10,
      maxValueChars: 128,
      maxTotalChars: 10_000,
    });

    expect(result.tags.circular).toEqual({ self: '[Circular metadata reference omitted]' });
    expect(JSON.stringify(result.tags.deeplyNested)).toContain('[Nested metadata omitted after 6 levels]');
    expect(result.status.truncatedValueCount).toBe(2);
  });
});
