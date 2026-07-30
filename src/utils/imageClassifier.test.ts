import { describe, expect, it } from 'vitest';
import { classifyImageType } from './imageClassifier';

function imageFile(name: string, type: string): File {
  return new File([new Uint8Array([1])], name, { type });
}

describe('classifyImageType', () => {
  it('does not call an ordinary 1920x1080 PNG a screenshot', () => {
    const result = classifyImageType(imageFile('wallpaper.png', 'image/png'), 1920, 1080, {});
    expect(result.type).toBe('Unclassified Image');
  });

  it('requires more than one isolated camera tag', () => {
    const result = classifyImageType(imageFile('image.jpg', 'image/jpeg'), 4000, 3000, { FNumber: 2.8 });
    expect(result.type).toBe('Unclassified Image');
  });

  it('classifies coherent camera identity and exposure evidence', () => {
    const result = classifyImageType(
      imageFile('DSC0001.jpg', 'image/jpeg'),
      7008,
      4672,
      { FNumber: 2.8, ExposureTime: 1 / 125, ISO: 100, FocalLength: 50, LensModel: 'FE 50mm F1.8' },
      'SONY',
      'ILCE-7M4',
    );
    expect(result.type).toBe('Camera Photo');
    expect(result.confidence).toBe('High');
  });

  it('classifies a screenshot only from combined filename, container, and screen-size evidence', () => {
    const result = classifyImageType(imageFile('Screenshot 2026-07-29.png', 'image/png'), 1920, 1080, {});
    expect(result.type).toBe('Device Screenshot');
    expect(result.confidence).toBe('Medium');
  });

  it('lets coherent camera EXIF override a misleading screenshot filename', () => {
    const result = classifyImageType(
      imageFile('Screenshot.png', 'image/png'),
      1920,
      1080,
      { FNumber: 4, ExposureTime: 1 / 60, Model: 'Camera Model' },
    );
    expect(result.type).toBe('Camera Photo');
  });
});
