import { findLensfunCamera } from './lensfun';
import { firstLuminance8BitQuantizationTable, parseJpegStructure } from './jpegStructure';

export interface SensorEvidence {
  source: 'EXIF focal-plane resolution' | 'EXIF 35mm-equivalent focal length' | 'Lensfun camera database';
  cropFactor: number;
  sensorWidthMm?: number;
  sensorHeightMm?: number;
  details: string;
}

export interface ResolutionAnalysis {
  actualWidth: number;
  actualHeight: number;
  exifWidth?: number;
  exifHeight?: number;
  status: 'Native Sensor Resolution' | 'Cropped / Trimmed' | 'Resized / Degraded' | 'Unknown';
  details: string;
  sensorModelEstimate?: string;
  cropFactor?: number;
  sensorWidthMm?: number;
  sensorHeightMm?: number;
  sensorConfidence?: 'High' | 'Medium' | 'Low';
  sensorConflict?: boolean;
  sensorEvidence: SensorEvidence[];
}

export interface JpegQualityAnalysis {
  isJpeg: boolean;
  estimatedQuality?: number; // e.g. 92%
  qualityDescription?: string; // e.g. "High Quality (Low Compression)"
  compressionRatio?: string; // e.g. "12.4 : 1"
  rawBytesPerPixel?: string;
}

const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24);

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function focalPlaneUnitInMillimeters(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized.includes('inch')) return 25.4;
    if (normalized.includes('centimeter') || normalized === 'cm') return 10;
    if (normalized.includes('millimeter') || normalized === 'mm') return 1;
    if (normalized.includes('micrometer') || normalized.includes('micron') || normalized === 'µm') return 0.001;
  }
  const unit = finiteNumber(value);
  if (unit === 2) return 25.4;
  if (unit === 3) return 10;
  if (unit === 4) return 1;
  if (unit === 5) return 0.001;
  return undefined;
}

function dimensionsFromCropFactor(
  cropFactor: number,
  referenceWidth: number,
  referenceHeight: number,
): { width: number; height: number } | undefined {
  if (cropFactor <= 0 || referenceWidth <= 0 || referenceHeight <= 0) return undefined;
  const aspectRatio = referenceWidth / referenceHeight;
  const diagonal = FULL_FRAME_DIAGONAL_MM / cropFactor;
  const height = diagonal / Math.hypot(aspectRatio, 1);
  return { width: height * aspectRatio, height };
}

function analyzeSensorReference(
  actualWidth: number,
  actualHeight: number,
  exifWidth: number | undefined,
  exifHeight: number | undefined,
  rawTags: Record<string, any>,
  cameraMake?: string,
  cameraModel?: string,
): Pick<
  ResolutionAnalysis,
  | 'cropFactor'
  | 'sensorWidthMm'
  | 'sensorHeightMm'
  | 'sensorConfidence'
  | 'sensorConflict'
  | 'sensorEvidence'
> {
  const evidence: SensorEvidence[] = [];
  const referenceWidth = exifWidth || actualWidth;
  const referenceHeight = exifHeight || actualHeight;
  const xResolution = finiteNumber(rawTags.FocalPlaneXResolution);
  const yResolution = finiteNumber(rawTags.FocalPlaneYResolution);
  const unitMm = focalPlaneUnitInMillimeters(rawTags.FocalPlaneResolutionUnit);

  if (xResolution && yResolution && unitMm && referenceWidth > 0 && referenceHeight > 0) {
    const sensorWidth = (referenceWidth / xResolution) * unitMm;
    const sensorHeight = (referenceHeight / yResolution) * unitMm;
    const diagonal = Math.hypot(sensorWidth, sensorHeight);
    if (sensorWidth > 0.1 && sensorHeight > 0.1 && sensorWidth < 200 && sensorHeight < 200 && diagonal > 0) {
      evidence.push({
        source: 'EXIF focal-plane resolution',
        cropFactor: FULL_FRAME_DIAGONAL_MM / diagonal,
        sensorWidthMm: sensorWidth,
        sensorHeightMm: sensorHeight,
        details: 'Calculated from EXIF pixel dimensions, focal-plane X/Y resolution, and its physical unit.',
      });
    }
  }

  const focalLength = finiteNumber(rawTags.FocalLength);
  const focalLength35 = finiteNumber(rawTags.FocalLengthIn35mmFormat ?? rawTags.FocalLengthIn35mmFilm);
  if (focalLength && focalLength35 && focalLength > 0 && focalLength35 > 0) {
    const cropFactor = focalLength35 / focalLength;
    if (cropFactor >= 0.1 && cropFactor <= 100) {
      const dimensions = dimensionsFromCropFactor(cropFactor, referenceWidth, referenceHeight);
      evidence.push({
        source: 'EXIF 35mm-equivalent focal length',
        cropFactor,
        sensorWidthMm: dimensions?.width,
        sensorHeightMm: dimensions?.height,
        details: `${focalLength35.toFixed(1)}mm equivalent divided by ${focalLength.toFixed(1)}mm actual focal length. Physical dimensions use the image aspect ratio.`,
      });
    }
  }

  const lensfunMatch = findLensfunCamera(cameraMake, cameraModel);
  if (lensfunMatch) {
    const dimensions = dimensionsFromCropFactor(lensfunMatch.cropFactor, referenceWidth, referenceHeight);
    evidence.push({
      source: 'Lensfun camera database',
      cropFactor: lensfunMatch.cropFactor,
      sensorWidthMm: dimensions?.width,
      sensorHeightMm: dimensions?.height,
      details: `Matched ${lensfunMatch.maker} ${lensfunMatch.model}; physical dimensions use the image aspect ratio.`,
    });
  }

  if (evidence.length === 0) return { sensorEvidence: [] };

  const primary = evidence[0];
  const conflict = evidence.some((item) =>
    Math.abs(item.cropFactor - primary.cropFactor) / primary.cropFactor > 0.08,
  );
  const agreement = evidence.length > 1 && evidence.every((item) =>
    Math.abs(item.cropFactor - primary.cropFactor) / primary.cropFactor <= 0.05,
  );

  return {
    cropFactor: primary.cropFactor,
    sensorWidthMm: primary.sensorWidthMm,
    sensorHeightMm: primary.sensorHeightMm,
    sensorConfidence: conflict ? 'Low' : agreement ? 'High' : 'Medium',
    sensorConflict: conflict,
    sensorEvidence: evidence,
  };
}

// Standard IJG Luminance Quantization Table at Quality 50
const stdLuminanceQuantTable50 = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const jpegZigZagToNatural = [
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

const stdLuminanceQuantTable50ZigZag = jpegZigZagToNatural.map((index) => stdLuminanceQuantTable50[index]);

function ijgLuminanceTable(quality: number): number[] {
  const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
  return stdLuminanceQuantTable50ZigZag.map((base) =>
    Math.max(1, Math.min(255, Math.floor((base * scale + 50) / 100))),
  );
}

export function estimateIjgQualityFromTable(table: readonly number[]): number | undefined {
  if (table.length !== 64 || table.some((value) => !Number.isInteger(value) || value < 1 || value > 255)) return undefined;
  let bestQuality: number | undefined;
  let bestMeanDifference = Number.POSITIVE_INFINITY;
  let bestExactMatches = 0;

  for (let quality = 1; quality <= 100; quality += 1) {
    const candidate = ijgLuminanceTable(quality);
    let difference = 0;
    let exactMatches = 0;
    for (let index = 0; index < 64; index += 1) {
      difference += Math.abs(table[index] - candidate[index]);
      if (table[index] === candidate[index]) exactMatches += 1;
    }
    const meanDifference = difference / 64;
    if (meanDifference < bestMeanDifference || (meanDifference === bestMeanDifference && exactMatches > bestExactMatches)) {
      bestQuality = quality;
      bestMeanDifference = meanDifference;
      bestExactMatches = exactMatches;
    }
  }

  return bestMeanDifference <= 1 && bestExactMatches >= 48 ? bestQuality : undefined;
}

export function estimateJpegQuality(
  buffer: ArrayBuffer,
  fileSizeBytes: number,
  width?: number,
  height?: number,
  parsedStructure = parseJpegStructure(new Uint8Array(buffer)),
): JpegQualityAnalysis {
  const bytes = new Uint8Array(buffer);
  let isJpeg = false;

  // Check JPEG SOI marker 0xFFD8
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    isJpeg = true;
  }

  if (!isJpeg) {
    return { isJpeg: false };
  }

  // Calculate Compression Ratio
  let compressionRatio: string | undefined = undefined;
  let rawBytesPerPixel: string | undefined = undefined;
  if (width && height && width > 0 && height > 0) {
    const uncompressedSize = width * height * 3; // 24-bit RGB
    const ratio = uncompressedSize / fileSizeBytes;
    compressionRatio = `${ratio.toFixed(1)}:1`;
    rawBytesPerPixel = `${(fileSizeBytes / (width * height)).toFixed(2)} bytes/pixel`;
  }

  // Estimate only when a valid 8-bit luminance DQT closely matches the IJG table family.
  const quantTable = firstLuminance8BitQuantizationTable(parsedStructure);
  const estimatedQuality = quantTable ? estimateIjgQualityFromTable(quantTable) : undefined;
  let qualityDescription: string | undefined = undefined;

  if (estimatedQuality !== undefined) {
    if (estimatedQuality >= 95) qualityDescription = 'Maximum Quality (Visually Lossless)';
    else if (estimatedQuality >= 85) qualityDescription = 'High Quality (Light Compression)';
    else if (estimatedQuality >= 70) qualityDescription = 'Medium Quality (Standard Web Compression)';
    else qualityDescription = 'Low Quality (Heavy Compression Artefacts)';
  }

  return {
    isJpeg: true,
    estimatedQuality,
    qualityDescription,
    compressionRatio,
    rawBytesPerPixel,
  };
}

function numericPair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const first = finiteNumber(value[0]);
  const second = finiteNumber(value[1]);
  return first !== undefined && second !== undefined ? [first, second] : undefined;
}

function numericQuad(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const numbers = value.slice(0, 4).map(finiteNumber);
  return numbers.every((item) => item !== undefined) ? numbers as [number, number, number, number] : undefined;
}

function dimensionsMatch(width: number, height: number, expectedWidth: number, expectedHeight: number): boolean {
  return (width === expectedWidth && height === expectedHeight) || (width === expectedHeight && height === expectedWidth);
}

function dngCropVerdict(
  actualWidth: number,
  actualHeight: number,
  rawTags: Record<string, any>,
): Pick<ResolutionAnalysis, 'status' | 'details'> | undefined {
  const activeArea = numericQuad(rawTags.ActiveArea);
  const cropOrigin = numericPair(rawTags.DefaultCropOrigin);
  const cropSize = numericPair(rawTags.DefaultCropSize);
  if (!activeArea || !cropOrigin || !cropSize) return undefined;

  const activeWidth = activeArea[3] - activeArea[1];
  const activeHeight = activeArea[2] - activeArea[0];
  const [cropWidth, cropHeight] = cropSize;
  if (activeWidth <= 0 || activeHeight <= 0 || cropWidth <= 0 || cropHeight <= 0) return undefined;
  if (!dimensionsMatch(actualWidth, actualHeight, cropWidth, cropHeight)) return undefined;

  const hasCrop = cropOrigin[0] !== 0 || cropOrigin[1] !== 0 || cropWidth < activeWidth || cropHeight < activeHeight;
  if (hasCrop) {
    return {
      status: 'Cropped / Trimmed',
      details: `DNG ActiveArea (${activeWidth} × ${activeHeight}), DefaultCropOrigin (${cropOrigin.join(', ')}), and DefaultCropSize (${cropWidth} × ${cropHeight}) identify the decoded crop.`,
    };
  }
  if (cropWidth === activeWidth && cropHeight === activeHeight) {
    return {
      status: 'Native Sensor Resolution',
      details: `DNG ActiveArea and zero-origin DefaultCropSize both identify the decoded ${actualWidth} × ${actualHeight} image as the full active area. Uncropped.`,
    };
  }
  return undefined;
}

function explicitResizeVerdict(
  actualWidth: number,
  actualHeight: number,
  rawTags: Record<string, any>,
): Pick<ResolutionAnalysis, 'status' | 'details'> | undefined {
  const originalWidth = finiteNumber(rawTags.OriginalImageWidth);
  const originalHeight = finiteNumber(rawTags.OriginalImageHeight);
  const history = [rawTags.HistoryAction, rawTags.HistoryParameters, rawTags.HistoryChanged]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .join(' ');
  if (!originalWidth || !originalHeight || !/resiz|resampl|scal(?:e|ed|ing)/i.test(history)) return undefined;
  if (actualWidth >= originalWidth && actualHeight >= originalHeight) return undefined;
  return {
    status: 'Resized / Degraded',
    details: `Embedded editing history declares a resize from ${originalWidth} × ${originalHeight} to ${actualWidth} × ${actualHeight}.`,
  };
}

export function analyzeResolution(
  actualWidth: number,
  actualHeight: number,
  rawTags: Record<string, any>,
  cameraMake?: string,
  cameraModel?: string
): ResolutionAnalysis {
  const exifWidth = finiteNumber(rawTags.PixelXDimension || rawTags.ExifImageWidth || rawTags.ImageWidth);
  const exifHeight = finiteNumber(rawTags.PixelYDimension || rawTags.ExifImageHeight || rawTags.ImageHeight);
  const sensorReference = analyzeSensorReference(
    actualWidth,
    actualHeight,
    exifWidth,
    exifHeight,
    rawTags,
    cameraMake,
    cameraModel,
  );

  const modelStr = `${cameraMake || ''} ${cameraModel || ''}`.toLowerCase();

  let expectedNativeWidth: number | undefined = undefined;
  let expectedNativeHeight: number | undefined = undefined;
  let sensorModelEstimate: string | undefined = undefined;

  if (modelStr.includes('iphone 15 pro') || modelStr.includes('iphone 14 pro') || modelStr.includes('iphone 16 pro')) {
    expectedNativeWidth = 8064;
    expectedNativeHeight = 6048;
    sensorModelEstimate = '48MP Quad-Bayer Main Sensor (8064 × 6048)';
  } else if (modelStr.includes('iphone')) {
    expectedNativeWidth = 4032;
    expectedNativeHeight = 3024;
    sensorModelEstimate = '12MP iPhone Camera Sensor (4032 × 3024)';
  } else if (modelStr.includes('ilce-7m4') || modelStr.includes('a7m4') || modelStr.includes('a7 iv')) {
    expectedNativeWidth = 7008;
    expectedNativeHeight = 4672;
    sensorModelEstimate = '33MP Sony Full-Frame Sensor (7008 × 4672)';
  }

  const dngVerdict = dngCropVerdict(actualWidth, actualHeight, rawTags);
  if (dngVerdict) {
    return {
      actualWidth,
      actualHeight,
      exifWidth,
      exifHeight,
      ...dngVerdict,
      sensorModelEstimate,
      ...sensorReference,
    };
  }

  const resizeVerdict = explicitResizeVerdict(actualWidth, actualHeight, rawTags);
  if (resizeVerdict) {
    return {
      actualWidth,
      actualHeight,
      exifWidth,
      exifHeight,
      ...resizeVerdict,
      sensorModelEstimate,
      ...sensorReference,
    };
  }

  if (exifWidth && exifHeight && (actualWidth !== exifWidth || actualHeight !== exifHeight)) {
    return {
      actualWidth,
      actualHeight,
      exifWidth,
      exifHeight,
      status: 'Unknown',
      details: `Decoded dimensions (${actualWidth} × ${actualHeight}) disagree with EXIF dimensions (${exifWidth} × ${exifHeight}).`,
      sensorModelEstimate,
      ...sensorReference,
    };
  }

  // Check crop against known native sensor resolution
  if (expectedNativeWidth && expectedNativeHeight) {
    const isPixelBin24 = actualWidth === 5712 && actualHeight === 4284;
    const isPixelBin12 = actualWidth === 4032 && actualHeight === 3024;

    if (actualWidth === expectedNativeWidth && actualHeight === expectedNativeHeight) {
      return {
        actualWidth,
        actualHeight,
        exifWidth,
        exifHeight,
        status: 'Unknown',
        details: `Matches documented native sensor maximum (${actualWidth} × ${actualHeight}).`,
        sensorModelEstimate,
        ...sensorReference,
      };
    } else if (modelStr.includes('iphone') && isPixelBin24) {
      return {
        actualWidth,
        actualHeight,
        exifWidth,
        exifHeight,
        status: 'Unknown',
        details: `24MP Quad-Pixel output mode (${actualWidth} × ${actualHeight}).`,
        sensorModelEstimate,
        ...sensorReference,
      };
    } else if (modelStr.includes('iphone') && isPixelBin12) {
      return {
        actualWidth,
        actualHeight,
        exifWidth,
        exifHeight,
        status: 'Unknown',
        details: `12MP Quad-Pixel output mode (${actualWidth} × ${actualHeight}).`,
        sensorModelEstimate,
        ...sensorReference,
      };
    } else if (actualWidth < expectedNativeWidth || actualHeight < expectedNativeHeight) {
      return {
        actualWidth,
        actualHeight,
        exifWidth,
        exifHeight,
        status: 'Unknown',
        details: `Dimensions below sensor maximum (${expectedNativeWidth} × ${expectedNativeHeight}).`,
        sensorModelEstimate,
        ...sensorReference,
      };
    }
  }

  if (actualWidth < 1280 || actualHeight < 720) {
    return {
      actualWidth,
      actualHeight,
      exifWidth,
      exifHeight,
      status: 'Unknown',
      details: `Low resolution image (${actualWidth} × ${actualHeight}).`,
      sensorModelEstimate,
      ...sensorReference,
    };
  }

  return {
    actualWidth,
    actualHeight,
    exifWidth,
    exifHeight,
    status: 'Unknown',
    details: `No reliable camera-specific reference or conflicting EXIF dimensions were found.`,
    sensorModelEstimate,
    ...sensorReference,
  };
}
