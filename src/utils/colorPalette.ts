import type { ColorPaletteItem } from '../types/exif';

export function extractColorPalette(imgElement: HTMLImageElement, colorCount = 6): Promise<ColorPaletteItem[]> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const sampleSize = 100;
    canvas.width = sampleSize;
    canvas.height = sampleSize;

    if (!ctx) {
      resolve([]);
      return;
    }

    ctx.drawImage(imgElement, 0, 0, sampleSize, sampleSize);
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    // Simple color quantization bucket map
    const colorBuckets = new Map<string, { rSum: number; gSum: number; bSum: number; count: number }>();
    const totalPixels = pixels.length / 4;

    const quantizeStep = 32; // Quantize RGB to 8 steps per channel

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      if (a < 128) continue; // Ignore transparent pixels

      const qr = Math.floor(r / quantizeStep) * quantizeStep;
      const qg = Math.floor(g / quantizeStep) * quantizeStep;
      const qb = Math.floor(b / quantizeStep) * quantizeStep;

      const key = `${qr},${qg},${qb}`;
      const existing = colorBuckets.get(key);

      if (existing) {
        existing.rSum += r;
        existing.gSum += g;
        existing.bSum += b;
        existing.count++;
      } else {
        colorBuckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
      }
    }

    const sortedBuckets = Array.from(colorBuckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, colorCount);

    const result: ColorPaletteItem[] = sortedBuckets.map((bucket) => {
      const rAvg = Math.round(bucket.rSum / bucket.count);
      const gAvg = Math.round(bucket.gSum / bucket.count);
      const bAvg = Math.round(bucket.bSum / bucket.count);

      const hex = `#${((1 << 24) + (rAvg << 16) + (gAvg << 8) + bAvg).toString(16).slice(1)}`;
      const percentage = Math.round((bucket.count / totalPixels) * 1000) / 10;

      return {
        hex: hex.toUpperCase(),
        rgb: [rAvg, gAvg, bAvg],
        percentage,
      };
    });

    resolve(result);
  });
}
