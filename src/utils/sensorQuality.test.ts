import { describe, expect, it } from 'vitest';
import { analyzeResolution, estimateIjgQualityFromTable, estimateJpegQuality } from './sensorQuality';

const quality50ZigZag = [
  16, 11, 12, 14, 12, 10, 16, 14,
  13, 14, 18, 17, 16, 19, 24, 40,
  26, 24, 22, 22, 24, 49, 35, 37,
  29, 40, 58, 51, 61, 60, 57, 51,
  56, 55, 64, 72, 92, 78, 64, 68,
  87, 69, 55, 56, 80, 109, 81, 87,
  95, 98, 103, 104, 103, 62, 77, 113,
  121, 112, 100, 120, 92, 101, 103, 99,
];

function jpegWithDqt(table: readonly number[], descriptor = 0): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xdb, 0x00, 0x43, descriptor, ...table,
    0xff, 0xda, 0x00, 0x02,
    0xff, 0xd9,
  ]);
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

describe('analyzeResolution sensor references', () => {
  it('derives physical sensor size from focal-plane EXIF tags', () => {
    const result = analyzeResolution(6000, 4000, {
      ExifImageWidth: 6000,
      ExifImageHeight: 4000,
      FocalPlaneXResolution: (6000 / 36) * 25.4,
      FocalPlaneYResolution: (4000 / 24) * 25.4,
      FocalPlaneResolutionUnit: 'Inch',
    });

    expect(result.sensorWidthMm).toBeCloseTo(36, 5);
    expect(result.sensorHeightMm).toBeCloseTo(24, 5);
    expect(result.cropFactor).toBeCloseTo(1, 5);
    expect(result.sensorEvidence[0].source).toBe('EXIF focal-plane resolution');
  });

  it('uses focal length equivalence as a secondary crop-factor axis', () => {
    const result = analyzeResolution(6000, 4000, {
      FocalLength: 50,
      FocalLengthIn35mmFormat: 75,
    });

    expect(result.cropFactor).toBeCloseTo(1.5, 5);
    expect(result.sensorEvidence[0].source).toBe('EXIF 35mm-equivalent focal length');
  });

  it('falls back to a matched Lensfun crop factor', () => {
    const result = analyzeResolution(7008, 4672, {}, 'SONY CORPORATION', 'ILCE-7M4');

    expect(result.cropFactor).toBe(1);
    expect(result.sensorEvidence).toContainEqual(expect.objectContaining({
      source: 'Lensfun camera database',
      cropFactor: 1,
    }));
  });

  it('flags conflicting EXIF sensor references', () => {
    const result = analyzeResolution(6000, 4000, {
      FocalPlaneXResolution: (6000 / 36) * 25.4,
      FocalPlaneYResolution: (4000 / 24) * 25.4,
      FocalPlaneResolutionUnit: 2,
      FocalLength: 50,
      FocalLengthIn35mmFormat: 75,
    });

    expect(result.sensorConflict).toBe(true);
    expect(result.sensorConfidence).toBe('Low');
  });

  it('does not treat Sony dimensions as an iPhone binned output', () => {
    const result = analyzeResolution(4032, 3024, {}, 'Sony', 'ILCE-7M4');

    expect(result.status).toBe('Unknown');
    expect(result.details).not.toContain('Binned');
  });

  it('does not call a decoded-versus-EXIF dimension mismatch a proven crop', () => {
    const result = analyzeResolution(3000, 2000, { ExifImageWidth: 6000, ExifImageHeight: 4000 });
    expect(result.status).toBe('Unknown');
    expect(result.details).toContain('disagree with EXIF dimensions');
  });

  it('uses DNG ActiveArea and DefaultCrop tags to prove a crop relationship', () => {
    const result = analyzeResolution(5800, 3800, {
      ActiveArea: [0, 0, 4000, 6000],
      DefaultCropOrigin: [100, 100],
      DefaultCropSize: [5800, 3800],
    });
    expect(result.status).toBe('Cropped / Trimmed');
    expect(result.details).toContain('DefaultCropOrigin');
  });

  it('uses a zero-origin full DNG crop definition to identify the active area', () => {
    const result = analyzeResolution(6000, 4000, {
      ActiveArea: [0, 0, 4000, 6000],
      DefaultCropOrigin: [0, 0],
      DefaultCropSize: [6000, 4000],
    });
    expect(result.status).toBe('Native Sensor Resolution');
    expect(result.details).toContain('full active area');
  });

  it('requires declared resize history before reporting resized or degraded', () => {
    const unsupported = analyzeResolution(640, 480, {});
    expect(unsupported.status).toBe('Unknown');

    const declared = analyzeResolution(1920, 1280, {
      OriginalImageWidth: 6000,
      OriginalImageHeight: 4000,
      HistoryAction: ['saved', 'resized'],
    });
    expect(declared.status).toBe('Resized / Degraded');
    expect(declared.details).toContain('declares a resize');
  });
});

describe('IJG JPEG quality estimation', () => {
  it('recognizes a standard IJG luminance table in JPEG zig-zag order', () => {
    expect(estimateIjgQualityFromTable(quality50ZigZag)).toBe(50);
    const jpeg = jpegWithDqt(quality50ZigZag);
    const result = estimateJpegQuality(arrayBuffer(jpeg), jpeg.byteLength, 32, 32);
    expect(result.estimatedQuality).toBe(50);
  });

  it('does not invent an IJG quality for a custom quantization table', () => {
    const custom = Array.from({ length: 64 }, (_, index) => (index * 37) % 255 + 1);
    expect(estimateIjgQualityFromTable(custom)).toBeUndefined();
    expect(estimateJpegQuality(arrayBuffer(jpegWithDqt(custom)), 1000, 32, 32).estimatedQuality).toBeUndefined();
  });

  it('ignores chroma-only and 16-bit DQT tables', () => {
    expect(estimateJpegQuality(arrayBuffer(jpegWithDqt(quality50ZigZag, 1)), 1000, 32, 32).estimatedQuality).toBeUndefined();
    const sixteenBitValues = quality50ZigZag.flatMap((value) => [0, value]);
    const sixteenBit = new Uint8Array([
      0xff, 0xd8, 0xff, 0xdb, 0x00, 0x83, 0x10, ...sixteenBitValues, 0xff, 0xda, 0x00, 0x02,
    ]);
    expect(estimateJpegQuality(arrayBuffer(sixteenBit), 1000, 32, 32).estimatedQuality).toBeUndefined();
  });

  it('uses a valid luminance table declared between entropy-coded scans', () => {
    const multiScan = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xda, 0x00, 0x02,
      0x01, 0xff, 0x00, 0x02, 0xff, 0xd0,
      0xff, 0xdb, 0x00, 0x43, 0x00, ...quality50ZigZag,
      0xff, 0xda, 0x00, 0x02,
      0x03, 0xff, 0x00, 0x04,
      0xff, 0xd9,
    ]);

    expect(estimateJpegQuality(arrayBuffer(multiScan), multiScan.byteLength, 32, 32).estimatedQuality).toBe(50);
  });
});
