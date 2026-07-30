export function assertImagePixelLimit(
  width: number | undefined,
  height: number | undefined,
  maxMegapixels: number,
): void {
  if (width === undefined || height === undefined) return;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('The image declares invalid pixel dimensions.');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maxMegapixels * 1_000_000) {
    throw new Error(`The image exceeds the ${maxMegapixels} megapixel safety limit.`);
  }
}
