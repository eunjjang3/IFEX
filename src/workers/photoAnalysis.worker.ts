/// <reference lib="webworker" />

import exifr from 'exifr';
import type { ColorPaletteItem, HistogramData } from '../types/exif';
import type { PhotoAnalysisWorkerRequest, PhotoAnalysisWorkerResponse } from '../types/photoAnalysis';
import { analyzeFileOrigin } from '../utils/fileOriginAnalyzer';
import { assertImagePixelLimit } from '../utils/imageLimits';
import { encodedImageDimensions } from '../utils/encodedImageDimensions';
import { sanitizeMetadata } from '../utils/metadataSanitizer';
import { estimateJpegQuality } from '../utils/sensorQuality';
import { normalizeStructuredMetadata } from '../utils/metadataNamespaces';

const scope = self as unknown as DedicatedWorkerGlobalScope;
function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function metadataDimensions(raw: Record<string, unknown>): { width?: number; height?: number } {
  return {
    width: finiteNumber(raw.ExifImageWidth ?? raw.PixelXDimension ?? raw.ImageWidth),
    height: finiteNumber(raw.ExifImageHeight ?? raw.PixelYDimension ?? raw.ImageHeight),
  };
}

function statistics(canvas: OffscreenCanvas, sampleDimension: number): { histogram: HistogramData; palette: ColorPaletteItem[] } {
  const scale = Math.min(1, sampleDimension / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const sample = new OffscreenCanvas(width, height);
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Preview statistics context is unavailable.');
  context.drawImage(canvas, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const red = new Array<number>(256).fill(0);
  const green = new Array<number>(256).fill(0);
  const blue = new Array<number>(256).fill(0);
  const luminance = new Array<number>(256).fill(0);
  const buckets = new Map<string, { red: number; green: number; blue: number; count: number }>();
  let opaquePixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const alpha = pixels[index + 3];
    red[r] += 1;
    green[g] += 1;
    blue[b] += 1;
    luminance[Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)] += 1;
    if (alpha < 128) continue;
    opaquePixels += 1;
    const key = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.red += r;
      bucket.green += g;
      bucket.blue += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { red: r, green: g, blue: b, count: 1 });
    }
  }

  const palette = Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((bucket) => {
      const r = Math.round(bucket.red / bucket.count);
      const g = Math.round(bucket.green / bucket.count);
      const b = Math.round(bucket.blue / bucket.count);
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
      return { hex, rgb: [r, g, b] as [number, number, number], percentage: opaquePixels ? Math.round((bucket.count / opaquePixels) * 1000) / 10 : 0 };
    });

  return { histogram: { red, green, blue, luminance }, palette };
}

async function safePngPreview(blob: Blob, maxDimension: number, sampleDimension: number, maxMegapixels?: number) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error('The image has invalid decoded dimensions.');
    if (maxMegapixels !== undefined) assertImagePixelLimit(bitmap.width, bitmap.height, maxMegapixels);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Safe preview context is unavailable.');
    context.drawImage(bitmap, 0, 0, width, height);
    return {
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      ...statistics(canvas, sampleDimension),
    };
  } finally {
    bitmap.close();
  }
}

function requestIdOf(value: unknown): string {
  if (value && typeof value === 'object' && 'requestId' in value && typeof value.requestId === 'string') return value.requestId;
  return 'invalid-request';
}

function validateRequest(value: unknown): asserts value is PhotoAnalysisWorkerRequest {
  if (!value || typeof value !== 'object') throw new Error('Photo analysis request is missing.');
  const request = value as Partial<PhotoAnalysisWorkerRequest>;
  if (!request.requestId || typeof request.requestId !== 'string') throw new Error('Photo analysis request ID is invalid.');
  if (!(request.file instanceof File)) throw new Error('Photo analysis file is invalid.');
  if (!request.limits || typeof request.limits !== 'object') throw new Error('Photo analysis limits are invalid.');
}

async function analyze(request: PhotoAnalysisWorkerRequest): Promise<PhotoAnalysisWorkerResponse> {
  const { file, limits, requestId } = request;
  let rawOutput: Record<string, unknown> = {};
  let namespaceCounts;
  try {
    const parsedOutput = (await exifr.parse(file, {
      tiff: true,
      xmp: true,
      iptc: true,
      icc: true,
      makerNote: true,
      userComment: true,
      mergeOutput: false,
      reviveValues: true,
    })) || {};
    const normalized = normalizeStructuredMetadata(parsedOutput);
    rawOutput = normalized.flatTags;
    namespaceCounts = normalized.namespaceCounts;
  } catch {
    // A damaged metadata block must not prevent structural analysis of a decodable image.
  }

  const declaredDimensions = metadataDimensions(rawOutput);
  assertImagePixelLimit(declaredDimensions.width, declaredDimensions.height, limits.maxImageMegapixels);
  const buffer = await file.arrayBuffer();
  const encodedDimensions = encodedImageDimensions(new Uint8Array(buffer));
  if (encodedDimensions) {
    assertImagePixelLimit(encodedDimensions.width, encodedDimensions.height, limits.maxImageMegapixels);
  }

  let thumbnailBuffer: Uint8Array | undefined;
  try {
    const extracted = await exifr.thumbnail(file);
    thumbnailBuffer = extracted ? new Uint8Array(extracted) : undefined;
  } catch {
    // Embedded thumbnails are optional and untrusted.
  }

  let embeddedThumbnailBlob: Blob | undefined;
  let previewBlob: Blob | undefined;
  let width = declaredDimensions.width;
  let height = declaredDimensions.height;
  let histogram: HistogramData | undefined;
  let palette: ColorPaletteItem[] | undefined;

  if (thumbnailBuffer) {
    try {
      const thumbnailDimensions = encodedImageDimensions(thumbnailBuffer);
      if (thumbnailDimensions) {
        assertImagePixelLimit(thumbnailDimensions.width, thumbnailDimensions.height, limits.maxImageMegapixels);
      }
      const safeThumbnail = await safePngPreview(
        new Blob([Uint8Array.from(thumbnailBuffer)]),
        Math.min(limits.maxPreviewDimension, limits.maxEmbeddedThumbnailDimension),
        limits.statisticsSampleDimension,
        limits.maxImageMegapixels,
      );
      embeddedThumbnailBlob = safeThumbnail.blob;
    } catch {
      thumbnailBuffer = undefined;
    }
  }

  try {
    const preview = await safePngPreview(file, limits.maxPreviewDimension, limits.statisticsSampleDimension, limits.maxImageMegapixels);
    previewBlob = preview.blob;
    width = preview.sourceWidth;
    height = preview.sourceHeight;
    histogram = preview.histogram;
    palette = preview.palette;
  } catch (originalDecodeError) {
    if (embeddedThumbnailBlob) {
      const preview = await safePngPreview(embeddedThumbnailBlob, limits.maxPreviewDimension, limits.statisticsSampleDimension);
      previewBlob = preview.blob;
      histogram = preview.histogram;
      palette = preview.palette;
    } else if (!width || !height) {
      const detail = originalDecodeError instanceof Error ? originalDecodeError.message : 'Unknown decode failure';
      throw new Error(`No safe preview or trustworthy image dimensions could be produced: ${detail}`);
    }
  }

  assertImagePixelLimit(width, height, limits.maxImageMegapixels);
  const fileOrigin = await analyzeFileOrigin(file, buffer, rawOutput, Boolean(embeddedThumbnailBlob), namespaceCounts);
  const jpegQuality = estimateJpegQuality(buffer, file.size, width, height, fileOrigin.jpeg);
  const sanitized = sanitizeMetadata(rawOutput, {
    maxTags: limits.maxMetadataTags,
    maxValueChars: limits.maxMetadataValueChars,
    maxTotalChars: limits.maxMetadataTotalChars,
  });

  return {
    requestId,
    ok: true,
    rawTags: sanitized.tags,
    metadataLimit: sanitized.status,
    previewBlob,
    embeddedThumbnailBlob,
    width,
    height,
    histogram,
    palette,
    fileOrigin,
    jpegQuality,
  };
}

scope.onmessage = async (event: MessageEvent<unknown>) => {
  const requestId = requestIdOf(event.data);
  try {
    validateRequest(event.data);
    scope.postMessage(await analyze(event.data));
  } catch (error) {
    const response: PhotoAnalysisWorkerResponse = {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Photo analysis failed.',
    };
    scope.postMessage(response);
  }
};
