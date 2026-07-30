import type { HistogramData } from '../types/exif';

export function calculateHistogram(imgElement: HTMLImageElement): Promise<HistogramData> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Downscale for performance while retaining color distribution accuracy
    const maxDim = 400;
    let width = imgElement.naturalWidth || imgElement.width || 300;
    let height = imgElement.naturalHeight || imgElement.height || 300;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;

    if (!ctx) {
      resolve({
        red: new Array(256).fill(0),
        green: new Array(256).fill(0),
        blue: new Array(256).fill(0),
        luminance: new Array(256).fill(0),
      });
      return;
    }

    ctx.drawImage(imgElement, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const red = new Array(256).fill(0);
    const green = new Array(256).fill(0);
    const blue = new Array(256).fill(0);
    const luminance = new Array(256).fill(0);

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Rec. 709 luminance formula
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

      red[r]++;
      green[g]++;
      blue[b]++;
      luminance[lum]++;
    }

    resolve({ red, green, blue, luminance });
  });
}
