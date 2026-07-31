import type { ParsedPhotoData, FileMetrics, CameraDetails, ShootingParams, LocationData, AdvancedData } from '../types/exif';
import type { PhotoAnalysisWorkerRequest, PhotoAnalysisWorkerResponse } from '../types/photoAnalysis';
import { detectMetadataLeakage } from './leakageEngine';
import { analyzeResolution, estimateJpegQuality } from './sensorQuality';
import { classifyImageType } from './imageClassifier';
import { securityConfig } from './securityConfig';
import { normalizeStructuredMetadata } from './metadataNamespaces';
import { detectAiGenerationMetadata, pngTextForRawTags } from './aiMetadata';
import { extractPngTextMetadata } from './pngTextMetadata';

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatShutterSpeed(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'N/A';
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function calculateAspectRatio(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function firmwareFromExif(rawTags: Record<string, unknown>): string | undefined {
  const explicit = rawTags.Firmware ?? rawTags.FirmwareVersion ?? rawTags.FirmwareRevision;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) return String(explicit).trim();
  return undefined;
}

export function maxApertureFromApex(value: unknown): number | undefined {
  const apex = finiteNumber(value);
  if (apex === undefined) return undefined;
  const fNumber = 2 ** (apex / 2);
  return Number.isFinite(fNumber) && fNumber > 0 && fNumber <= 128 ? fNumber : undefined;
}

export function flashFromExif(value: unknown): Pick<ShootingParams, 'flash' | 'flashMode'> {
  const numeric = finiteNumber(value);
  if (numeric !== undefined) {
    return {
      flash: (numeric & 1) === 1 ? 'Fired' : 'Did not fire',
      flashMode: numeric,
    };
  }
  if (typeof value === 'string' && value.trim()) return { flash: value.trim() };
  return {};
}

function validDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function createPhotoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function revokeObjectUrl(url: string | undefined) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Best-effort cleanup after a failed parse.
  }
}

function safeWorkerSupportError(): string | undefined {
  if (typeof Worker === 'undefined') return 'Web Workers are unavailable.';
  if (typeof OffscreenCanvas === 'undefined' || typeof OffscreenCanvas.prototype.convertToBlob !== 'function') return 'OffscreenCanvas is unavailable.';
  if (typeof createImageBitmap === 'undefined') return 'createImageBitmap is unavailable.';
  return undefined;
}

function workerLimits(): PhotoAnalysisWorkerRequest['limits'] {
  return {
    maxImageMegapixels: securityConfig.maxImageMegapixels,
    maxPreviewDimension: securityConfig.maxPreviewDimension,
    statisticsSampleDimension: securityConfig.statisticsSampleDimension,
    maxEmbeddedThumbnailDimension: securityConfig.maxEmbeddedThumbnailDimension,
    maxMetadataTags: securityConfig.maxMetadataTags,
    maxMetadataValueChars: securityConfig.maxMetadataValueChars,
    maxMetadataTotalChars: securityConfig.maxMetadataTotalChars,
  };
}

interface AnalysisWorkerOptions {
  workerFactory?: () => Worker;
  timeoutMs?: number;
}

export function runAnalysisWorker(file: File, options: AnalysisWorkerOptions = {}): Promise<PhotoAnalysisWorkerResponse> {
  return new Promise((resolve, reject) => {
    const requestId = createRequestId();
    const worker = options.workerFactory?.() ?? new Worker(new URL('../workers/photoAnalysis.worker.ts', import.meta.url), { type: 'module' });
    const timeoutMs = options.timeoutMs ?? securityConfig.parseTimeoutMs;
    const timeout = globalThis.setTimeout(() => {
      worker.terminate();
      reject(new Error(`Photo analysis timed out (${timeoutMs} ms).`));
    }, timeoutMs);
    const finish = () => {
      globalThis.clearTimeout(timeout);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<PhotoAnalysisWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      finish();
      if (!event.data.ok) reject(new Error(event.data.error || 'Photo analysis failed.'));
      else resolve(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error(event.message || 'Photo analysis worker stopped unexpectedly.'));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error('Photo analysis worker returned an unreadable response.'));
    };
    worker.postMessage({ requestId, file, limits: workerLimits() } satisfies PhotoAnalysisWorkerRequest);
  });
}

async function loadUnsafeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error('Preview decode timed out.')), securityConfig.parseTimeoutMs);
    image.onload = () => {
      globalThis.clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      globalThis.clearTimeout(timeout);
      reject(new Error('Preview decode failed.'));
    };
    image.src = url;
  });
  return image;
}

async function runUnsafeAnalysis(file: File): Promise<PhotoAnalysisWorkerResponse> {
  const [{ default: exifr }, { analyzeFileOrigin }, { calculateHistogram }, { extractColorPalette }, { sanitizeMetadata }] = await Promise.all([
    import('exifr'),
    import('./fileOriginAnalyzer'),
    import('./histogram'),
    import('./colorPalette'),
    import('./metadataSanitizer'),
  ]);
  const parsedOutput = (await exifr.parse(file, {
    tiff: true, xmp: true, iptc: true, icc: true, makerNote: true, userComment: true, mergeOutput: false, reviveValues: true,
  })) || {};
  const normalized = normalizeStructuredMetadata(parsedOutput);
  const rawOutput = normalized.flatTags;
  const url = URL.createObjectURL(file);
  let image: HTMLImageElement | undefined;
  try {
    image = await loadUnsafeImage(url);
    const width = image.naturalWidth || finiteNumber(rawOutput.ExifImageWidth) || finiteNumber(rawOutput.ImageWidth);
    const height = image.naturalHeight || finiteNumber(rawOutput.ExifImageHeight) || finiteNumber(rawOutput.ImageHeight);
    if (width && height && width * height > securityConfig.maxImageMegapixels * 1_000_000) {
      throw new Error(`Image exceeds ${securityConfig.maxImageMegapixels} megapixel limit.`);
    }
    const buffer = await file.arrayBuffer();
    const pngText = await extractPngTextMetadata(new Uint8Array(buffer), {
      maxEntries: securityConfig.maxMetadataTags,
      maxValueChars: securityConfig.maxMetadataValueChars,
      maxTotalChars: securityConfig.maxMetadataTotalChars,
    });
    const pngTextTags = pngTextForRawTags(pngText);
    if (pngTextTags) Object.assign(rawOutput, { PNGText: pngTextTags });
    const sanitized = sanitizeMetadata(rawOutput, {
      maxTags: securityConfig.maxMetadataTags,
      maxValueChars: securityConfig.maxMetadataValueChars,
      maxTotalChars: securityConfig.maxMetadataTotalChars,
    });
    const aiGeneration = detectAiGenerationMetadata(sanitized.tags, pngText);
    const fileOrigin = await analyzeFileOrigin(file, buffer, rawOutput, false, normalized.namespaceCounts, aiGeneration);
    return {
      requestId: 'unsafe-fallback',
      ok: true,
      rawTags: sanitized.tags,
      metadataLimit: sanitized.status,
      previewBlob: file,
      width,
      height,
      histogram: await calculateHistogram(image),
      palette: await extractColorPalette(image, 6),
      fileOrigin,
      jpegQuality: estimateJpegQuality(buffer, file.size, width, height, fileOrigin.jpeg),
      aiGeneration,
    };
  } finally {
    if (image) image.src = '';
    revokeObjectUrl(url);
  }
}

async function analyzePhoto(file: File): Promise<PhotoAnalysisWorkerResponse> {
  const supportError = safeWorkerSupportError();
  if (!supportError) return runAnalysisWorker(file);
  if (!securityConfig.allowUnsafePreview) {
    throw new Error(`Safe local analysis is unavailable: ${supportError} Enable IFEX_ALLOW_UNSAFE_PREVIEW only if direct browser decoding is acceptable.`);
  }
  console.warn(`[IFEX security] Using explicitly enabled unsafe preview fallback: ${supportError}`);
  return runUnsafeAnalysis(file);
}

export async function parsePhotoFile(file: File): Promise<ParsedPhotoData> {
  let previewUrl: string | undefined;
  let embeddedThumbnailUrl: string | undefined;
  try {
    const analysis = await analyzePhoto(file);
    if (!analysis.rawTags || !analysis.metadataLimit || !analysis.fileOrigin) throw new Error('Photo analysis returned incomplete data.');
    if (analysis.previewBlob) previewUrl = URL.createObjectURL(analysis.previewBlob);
    if (analysis.embeddedThumbnailBlob) embeddedThumbnailUrl = URL.createObjectURL(analysis.embeddedThumbnailBlob);

    const rawOutput = analysis.rawTags as Record<string, any>;
    const aiGeneration = analysis.aiGeneration ?? detectAiGenerationMetadata(rawOutput);
    const width = analysis.width || finiteNumber(rawOutput.ExifImageWidth) || finiteNumber(rawOutput.ImageWidth);
    const height = analysis.height || finiteNumber(rawOutput.ExifImageHeight) || finiteNumber(rawOutput.ImageHeight);
    const megapixels = width && height ? `${((width * height) / 1_000_000).toFixed(1)} MP` : undefined;
    const detectedMime = analysis.fileOrigin.fileType.actualMime;
    const fileMetrics: FileMetrics = {
      name: file.name,
      sizeBytes: file.size,
      sizeFormatted: formatBytes(file.size),
      mimeType: detectedMime !== 'application/octet-stream' ? detectedMime : file.type || 'application/octet-stream',
      width,
      height,
      megapixels,
      aspectRatio: calculateAspectRatio(width, height),
      colorSpace: rawOutput.ColorSpace === 1 ? 'sRGB' : rawOutput.ColorSpace === 65535 ? 'Uncalibrated / Adobe RGB' : rawOutput.ColorSpace ? String(rawOutput.ColorSpace) : 'Not declared',
      bitDepth: finiteNumber(Array.isArray(rawOutput.BitsPerSample) ? rawOutput.BitsPerSample[0] : rawOutput.BitsPerSample),
      orientation: finiteNumber(rawOutput.Orientation),
      createDate: validDate(rawOutput.DateTimeOriginal || rawOutput.CreateDate),
      modifyDate: validDate(rawOutput.ModifyDate) || (file.lastModified > 0 ? validDate(file.lastModified) : undefined),
      offsetTime: rawOutput.OffsetTimeOriginal || rawOutput.OffsetTime,
    };

    const camera: CameraDetails = {
      make: rawOutput.Make ? String(rawOutput.Make).trim() : undefined,
      model: rawOutput.Model ? String(rawOutput.Model).trim() : undefined,
      serialNumber: rawOutput.SerialNumber || rawOutput.BodySerialNumber || rawOutput.CameraSerialNumber ? String(rawOutput.SerialNumber || rawOutput.BodySerialNumber || rawOutput.CameraSerialNumber) : undefined,
      firmware: firmwareFromExif(rawOutput),
      lensMake: rawOutput.LensMake ? String(rawOutput.LensMake).trim() : undefined,
      lensModel: rawOutput.LensModel || rawOutput.LensInfo ? String(rawOutput.LensModel || rawOutput.LensInfo).trim() : undefined,
      lensSerialNumber: rawOutput.LensSerialNumber ? String(rawOutput.LensSerialNumber) : undefined,
      lensSpecification: rawOutput.LensSpecification ? String(rawOutput.LensSpecification) : undefined,
      focalLength: finiteNumber(rawOutput.FocalLength),
      focalLengthIn35mm: finiteNumber(rawOutput.FocalLengthIn35mmFormat),
      maxAperture: maxApertureFromApex(rawOutput.MaxApertureValue),
    };
    const resolutionAnalysis = analyzeResolution(width || 0, height || 0, rawOutput, camera.make, camera.model);
    const classification = classifyImageType(file, width, height, rawOutput, camera.make, camera.model, aiGeneration);
    const exposureTime = finiteNumber(rawOutput.ExposureTime);
    const flash = flashFromExif(rawOutput.Flash);
    const shooting: ShootingParams = {
      fNumber: finiteNumber(rawOutput.FNumber), exposureTime, exposureTimeString: formatShutterSpeed(exposureTime),
      iso: finiteNumber(rawOutput.ISO || rawOutput.ISOSpeedRatings), exposureBias: finiteNumber(rawOutput.ExposureBiasValue),
      meteringMode: rawOutput.MeteringMode !== undefined ? String(rawOutput.MeteringMode) : undefined,
      ...flash,
      whiteBalance: rawOutput.WhiteBalance === 0 ? 'Auto' : rawOutput.WhiteBalance === 1 ? 'Manual' : rawOutput.WhiteBalance ? String(rawOutput.WhiteBalance) : undefined,
      exposureProgram: rawOutput.ExposureProgram !== undefined ? String(rawOutput.ExposureProgram) : undefined,
      digitalZoomRatio: finiteNumber(rawOutput.DigitalZoomRatio),
      sceneCaptureType: rawOutput.SceneCaptureType !== undefined ? String(rawOutput.SceneCaptureType) : undefined,
    };
    const location: LocationData = {
      latitude: finiteNumber(rawOutput.latitude) ?? finiteNumber(rawOutput.GPSLatitude),
      longitude: finiteNumber(rawOutput.longitude) ?? finiteNumber(rawOutput.GPSLongitude),
      altitude: finiteNumber(rawOutput.GPSAltitude), heading: finiteNumber(rawOutput.GPSImgDirection), speed: finiteNumber(rawOutput.GPSSpeed),
      timestamp: rawOutput.GPSDateStamp ? String(rawOutput.GPSDateStamp) : undefined,
    };
    const advanced: AdvancedData = {
      iptc: {
        byline: rawOutput.byline || rawOutput.Artist || rawOutput.Creator, copyright: rawOutput.copyright || rawOutput.Copyright,
        caption: rawOutput.caption || rawOutput.ImageDescription,
        keywords: rawOutput.keywords ? (Array.isArray(rawOutput.keywords) ? rawOutput.keywords : [rawOutput.keywords]) : undefined,
        credit: rawOutput.credit, source: rawOutput.source, objectName: rawOutput.objectName,
      },
      xmp: { creatorTool: rawOutput.CreatorTool || rawOutput.Software, rating: finiteNumber(rawOutput.Rating), subjectDistance: finiteNumber(rawOutput.SubjectDistance) },
      iccProfile: { profileName: rawOutput.ProfileDescription || rawOutput.ProfileName || rawOutput.deviceModelDesc, colorSpace: rawOutput.ProfileColorSpace || fileMetrics.colorSpace },
      embeddedThumbnailUrl,
    };
    const leakage = detectMetadataLeakage(location, camera, fileMetrics, advanced, rawOutput);

    return {
      id: createPhotoId(), file, previewUrl, fileMetrics, camera, shooting, location, advanced, leakage,
      rawTags: rawOutput, metadataLimit: analysis.metadataLimit, histogram: analysis.histogram, palette: analysis.palette,
      resolutionAnalysis, jpegQuality: analysis.jpegQuality, classification, fileOrigin: analysis.fileOrigin,
      aiGeneration,
    };
  } catch (error) {
    revokeObjectUrl(previewUrl);
    revokeObjectUrl(embeddedThumbnailUrl);
    const detail = error instanceof Error && error.message ? error.message : 'Unknown analysis failure';
    throw new Error(detail, { cause: error });
  }
}
