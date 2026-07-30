import { describe, expect, it } from 'vitest';
import { findLensfunCamera } from './lensfun';

describe('findLensfunCamera', () => {
  it('matches normalized EXIF maker names and exact Lensfun models', () => {
    expect(findLensfunCamera('SONY CORPORATION', 'ILCE-7M4')).toMatchObject({
      maker: 'Sony',
      model: 'ILCE-7M4',
      cropFactor: 1,
    });
  });

  it('uses translated model aliases', () => {
    expect(findLensfunCamera('Sony', 'Alpha 6000')).toMatchObject({
      model: 'ILCE-6000',
      cropFactor: 1.534,
    });
  });

  it('does not guess when the camera is absent', () => {
    expect(findLensfunCamera('Example', 'Definitely Not A Camera')).toBeUndefined();
  });
});
