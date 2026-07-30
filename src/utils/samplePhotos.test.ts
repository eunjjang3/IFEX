import exifr from 'exifr';
import ExifReader from 'exifreader';
import { describe, expect, it } from 'vitest';
import { addSampleExif } from './samplePhotos';

const emptyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

async function parseSample(type: 'iphone_gps' | 'dslr_portrait') {
  const bytes = addSampleExif(emptyJpeg, type);
  return exifr.parse(bytes.slice().buffer as ArrayBuffer, {
    tiff: true, gps: true, xmp: true, mergeOutput: true, reviveValues: true,
  }) as Promise<Record<string, unknown>>;
}

function parseSampleWithIndependentReader(type: 'iphone_gps' | 'dslr_portrait') {
  const bytes = addSampleExif(emptyJpeg, type);
  return ExifReader.load(bytes.slice().buffer as ArrayBuffer, { computed: true });
}

function independentComputed(tags: unknown, name: string): unknown {
  const tag = (tags as Record<string, { computed?: unknown } | undefined>)[name];
  if (!tag || !('computed' in tag)) throw new Error(`ExifReader did not expose a computed ${name} tag.`);
  return tag.computed;
}

describe('synthetic sample EXIF', () => {
  it('embeds real camera and GPS tags in the iPhone scenario', async () => {
    const parsed = await parseSample('iphone_gps');
    const independent = parseSampleWithIndependentReader('iphone_gps');
    expect(parsed.Make).toBe('Apple');
    expect(parsed.Model).toBe('iPhone 15 Pro');
    expect(parsed.latitude).toBeCloseTo(37.5665, 4);
    expect(parsed.longitude).toBeCloseTo(126.978, 4);
    expect(parsed.FocalLength).toBeCloseTo(6.77, 2);
    expect(independentComputed(independent, 'Make')).toBe('Apple');
    expect(independentComputed(independent, 'Model')).toBe('iPhone 15 Pro');
    expect(independentComputed(independent, 'FocalLength')).toBeCloseTo(6.77, 2);
    expect(independentComputed(independent, 'GPSLatitudeRef')).toBe('N');
    expect(independentComputed(independent, 'GPSLongitudeRef')).toBe('E');
  });

  it('embeds real body, lens, serial, and focal-plane tags in the DSLR scenario', async () => {
    const parsed = await parseSample('dslr_portrait');
    const independent = parseSampleWithIndependentReader('dslr_portrait');
    expect(parsed.Make).toBe('SONY');
    expect(parsed.Model).toBe('ILCE-7M4');
    expect(parsed.SerialNumber).toBe('IFEX-SYNTH-0001');
    expect(parsed.LensModel).toBe('FE 85mm F1.8');
    expect(parsed.LensSerialNumber).toBe('IFEX-LENS-0001');
    expect(parsed.FocalPlaneResolutionUnit).toBe('Inch');
    expect(independentComputed(independent, 'Make')).toBe('SONY');
    expect(independentComputed(independent, 'Model')).toBe('ILCE-7M4');
    expect(independentComputed(independent, 'BodySerialNumber')).toBe('IFEX-SYNTH-0001');
    expect(independentComputed(independent, 'LensModel')).toBe('FE 85mm F1.8');
    expect(independentComputed(independent, 'FocalPlaneXResolution')).toBeCloseTo(4958.3, 1);
  });

  it('leaves the clean landscape JPEG byte-for-byte unchanged', () => {
    expect(addSampleExif(emptyJpeg, 'clean_landscape')).toEqual(emptyJpeg);
  });
});
