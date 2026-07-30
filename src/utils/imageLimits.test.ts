import { describe, expect, it } from 'vitest';
import { assertImagePixelLimit } from './imageLimits';

describe('assertImagePixelLimit', () => {
  it('allows dimensions within the configured limit', () => {
    expect(() => assertImagePixelLimit(6000, 4000, 40)).not.toThrow();
  });

  it('rejects decompression-bomb dimensions and invalid declarations', () => {
    expect(() => assertImagePixelLimit(20_000, 20_000, 40)).toThrow('40 megapixel');
    expect(() => assertImagePixelLimit(Number.MAX_SAFE_INTEGER, 2, 200)).toThrow();
    expect(() => assertImagePixelLimit(10.5, 10, 40)).toThrow('invalid pixel dimensions');
  });
});
