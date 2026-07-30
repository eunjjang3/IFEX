/// <reference lib="webworker" />

import type { PixelMetric, PixelOverlayMode, PixelOverlayWorkerRequest, PixelOverlayWorkerResponse } from '../types/pixelForensics';
import {
  analyzeCfaPhase,
  analyzeDctEnergy,
  chromaFromRgba,
  detectCopyMove,
  luminanceFromRgba,
  medianResidualMap,
  sobelMagnitudeMap,
  summarizeJpegGhosts,
} from '../utils/pixelAnalysis';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const VALID_MODES = new Set<PixelOverlayMode>([
  'clipping', 'ela', 'noise', 'gradient', 'median', 'copyMove', 'cfa', 'chromaCb', 'chromaCr', 'jpegGhost', 'dct',
]);
const JPEG_GHOST_QUALITIES = [50, 60, 70, 80, 85, 90, 95, 100] as const;
const JPEG_GHOST_TILE_SIZE = 16;

async function loadPixels(file: File, maxDimension: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error('The image has invalid decoded dimensions');
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D analysis context is unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    return { canvas, pixels: context.getImageData(0, 0, width, height), width, height };
  } finally {
    bitmap.close();
  }
}

function makeOutput(width: number, height: number, data: Uint8ClampedArray) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Overlay context is unavailable');
  context.putImageData(new ImageData(Uint8ClampedArray.from(data), width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function analyzeClipping(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const output = new Uint8ClampedArray(pixels.data.length);
  let highlightCount = 0;
  let shadowCount = 0;
  const total = width * height;

  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    if (Math.max(red, green, blue) >= 250) {
      output[index] = 255;
      output[index + 1] = 46;
      output[index + 2] = 46;
      output[index + 3] = 190;
      highlightCount += 1;
    } else if (Math.max(red, green, blue) <= 5) {
      output[index] = 35;
      output[index + 1] = 105;
      output[index + 2] = 255;
      output[index + 3] = 200;
      shadowCount += 1;
    }
  }

  const metrics: PixelMetric[] = [
    { label: 'Highlight clipping', value: `${((highlightCount / total) * 100).toFixed(2)}%` },
    { label: 'Shadow clipping', value: `${((shadowCount / total) * 100).toFixed(2)}%` },
    { label: 'Thresholds', value: '≥250 / ≤5' },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeEla(file: File, mimeType: string, maxDimension: number) {
  if (mimeType !== 'image/jpeg') throw new Error('ELA is available only for JPEG files');
  const { canvas, pixels, width, height } = await loadPixels(file, maxDimension);
  const recompressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const recompressed = await createImageBitmap(recompressedBlob);
  const comparisonCanvas = new OffscreenCanvas(width, height);
  const comparisonContext = comparisonCanvas.getContext('2d', { willReadFrequently: true });
  if (!comparisonContext) {
    recompressed.close();
    throw new Error('ELA comparison context is unavailable');
  }
  comparisonContext.drawImage(recompressed, 0, 0, width, height);
  recompressed.close();
  const comparison = comparisonContext.getImageData(0, 0, width, height);
  const output = new Uint8ClampedArray(pixels.data.length);
  let differenceSum = 0;
  let highResponseCount = 0;
  const total = width * height;

  for (let index = 0; index < pixels.data.length; index += 4) {
    const difference = Math.max(
      Math.abs(pixels.data[index] - comparison.data[index]),
      Math.abs(pixels.data[index + 1] - comparison.data[index + 1]),
      Math.abs(pixels.data[index + 2] - comparison.data[index + 2]),
    );
    differenceSum += difference;
    if (difference >= 12) highResponseCount += 1;
    const strength = Math.min(255, difference * 14);
    output[index] = 255;
    output[index + 1] = Math.min(220, strength);
    output[index + 2] = 24;
    output[index + 3] = strength;
  }

  const metrics: PixelMetric[] = [
    { label: 'Mean JPEG response', value: `${(differenceSum / total).toFixed(2)} / 255` },
    { label: 'High-response pixels', value: `${((highResponseCount / total) * 100).toFixed(2)}%` },
    { label: 'Comparison encode', value: 'JPEG quality 90' },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeNoise(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const total = width * height;
  const grayscale = new Float32Array(total);
  const residual = new Float32Array(total);
  const output = new Uint8ClampedArray(pixels.data.length);

  for (let pixel = 0, index = 0; pixel < total; pixel += 1, index += 4) {
    grayscale[pixel] = pixels.data[index] * 0.2126 + pixels.data[index + 1] * 0.7152 + pixels.data[index + 2] * 0.0722;
  }

  let residualSum = 0;
  let strongResidualCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      let neighborhood = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          neighborhood += grayscale[pixel + offsetY * width + offsetX];
        }
      }
      const value = Math.abs(grayscale[pixel] - neighborhood / 9);
      residual[pixel] = value;
      residualSum += value;
      if (value >= 8) strongResidualCount += 1;
    }
  }

  for (let pixel = 0, index = 0; pixel < total; pixel += 1, index += 4) {
    const strength = Math.min(255, residual[pixel] * 12);
    output[index] = 80;
    output[index + 1] = 220;
    output[index + 2] = 255;
    output[index + 3] = strength;
  }

  const metrics: PixelMetric[] = [
    { label: 'Mean residual', value: `${(residualSum / total).toFixed(2)} / 255` },
    { label: 'Strong residual pixels', value: `${((strongResidualCount / total) * 100).toFixed(2)}%` },
    { label: 'Residual filter', value: '3×3 local mean' },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeGradient(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const total = width * height;
  const analysis = sobelMagnitudeMap(luminanceFromRgba(pixels.data), width, height);
  const output = new Uint8ClampedArray(pixels.data.length);
  const displayCeiling = Math.max(32, analysis.p95);

  for (let pixel = 0, index = 0; pixel < total; pixel += 1, index += 4) {
    const strength = Math.min(255, Math.round((Math.log1p(analysis.values[pixel]) / Math.log1p(displayCeiling)) * 255));
    output[index] = Math.round(strength * 0.72);
    output[index + 1] = Math.min(255, Math.round(strength * 1.05));
    output[index + 2] = Math.min(255, 36 + Math.round(strength * 1.08));
    output[index + 3] = 238;
  }

  const metrics: PixelMetric[] = [
    { label: 'Mean gradient', value: `${analysis.mean.toFixed(2)} Sobel units` },
    { label: 'Strong-edge pixels', value: `${((analysis.strongCount / total) * 100).toFixed(2)}%` },
    { label: '95th percentile', value: `${analysis.p95.toFixed(0)} Sobel units` },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeMedianResidual(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const total = width * height;
  const analysis = medianResidualMap(luminanceFromRgba(pixels.data), width, height);
  const output = new Uint8ClampedArray(pixels.data.length);
  const displayCeiling = Math.max(4, analysis.p95);

  for (let pixel = 0, index = 0; pixel < total; pixel += 1, index += 4) {
    const residual = analysis.values[pixel];
    const strength = Math.min(255, Math.round((Math.abs(residual) / displayCeiling) * 220));
    if (residual >= 0) {
      output[index] = Math.min(255, 20 + strength);
      output[index + 1] = Math.min(255, 12 + Math.round(strength * 0.64));
      output[index + 2] = 8;
    } else {
      output[index] = 8;
      output[index + 1] = Math.min(255, 16 + Math.round(strength * 0.72));
      output[index + 2] = Math.min(255, 28 + strength);
    }
    output[index + 3] = 238;
  }

  const metrics: PixelMetric[] = [
    { label: 'Mean median residual', value: `${analysis.mean.toFixed(2)} / 255` },
    { label: 'Strong-detail pixels', value: `${((analysis.strongCount / total) * 100).toFixed(2)}%` },
    { label: 'Residual filter', value: '3×3 median subtraction' },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

function paintPixel(output: Uint8ClampedArray, width: number, height: number, x: number, y: number, color: readonly [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (Math.round(y) * width + Math.round(x)) * 4;
  output[index] = color[0];
  output[index + 1] = color[1];
  output[index + 2] = color[2];
  output[index + 3] = color[3];
}

function drawLine(output: Uint8ClampedArray, width: number, height: number, startX: number, startY: number, endX: number, endY: number) {
  const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY), 1);
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(startX + ((endX - startX) * step) / steps);
    const y = Math.round(startY + ((endY - startY) * step) / steps);
    paintPixel(output, width, height, x, y, [255, 214, 48, 190]);
  }
}

function drawBox(output: Uint8ClampedArray, width: number, height: number, x: number, y: number, size: number, color: readonly [number, number, number, number]) {
  for (let offset = 0; offset < size; offset += 1) {
    paintPixel(output, width, height, x + offset, y, color);
    paintPixel(output, width, height, x + offset, y + size - 1, color);
    paintPixel(output, width, height, x, y + offset, color);
    paintPixel(output, width, height, x + size - 1, y + offset, color);
  }
}

async function analyzeCopyMove(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const analysis = detectCopyMove(luminanceFromRgba(pixels.data), width, height);
  const output = new Uint8ClampedArray(pixels.data.length);

  for (const match of analysis.matches) {
    const halfBlock = analysis.blockSize / 2;
    drawLine(
      output,
      width,
      height,
      match.sourceX + halfBlock,
      match.sourceY + halfBlock,
      match.targetX + halfBlock,
      match.targetY + halfBlock,
    );
    drawBox(output, width, height, match.sourceX, match.sourceY, analysis.blockSize, [255, 64, 180, 230]);
    drawBox(output, width, height, match.targetX, match.targetY, analysis.blockSize, [48, 220, 255, 230]);
  }

  const metrics: PixelMetric[] = [
    { label: 'Matched block pairs', value: analysis.matches.length.toLocaleString() },
    { label: 'Displacement clusters', value: analysis.clusterCount.toLocaleString() },
    { label: 'Matcher geometry', value: `${analysis.blockSize}×${analysis.blockSize} / ${analysis.step}px step` },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeCfa(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const total = width * height;
  const green = new Float32Array(total);
  const output = new Uint8ClampedArray(pixels.data.length);

  for (let pixel = 0, index = 0; pixel < total; pixel += 1, index += 4) green[pixel] = pixels.data[index + 1];
  const analysis = analyzeCfaPhase(green, width, height);

  for (let y = 0; y < height; y += 1) {
    const tileY = Math.min(analysis.tileRows - 1, Math.floor(y / analysis.tileSize));
    for (let x = 0; x < width; x += 1) {
      const tileX = Math.min(analysis.tileColumns - 1, Math.floor(x / analysis.tileSize));
      const tile = tileY * analysis.tileColumns + tileX;
      const information = analysis.informationWeights[tile];
      if (information < 0.2) continue;
      const anomaly = analysis.anomalyScores[tile];
      const normalizedAnomaly = Math.min(1, anomaly / Math.max(0.001, information));
      const index = (y * width + x) * 4;
      if (normalizedAnomaly < 0.5) {
        const blend = normalizedAnomaly * 2;
        output[index] = Math.round(24 + 231 * blend);
        output[index + 1] = Math.round(180 + 38 * blend);
        output[index + 2] = Math.round(255 - 207 * blend);
      } else {
        const blend = (normalizedAnomaly - 0.5) * 2;
        output[index] = 255;
        output[index + 1] = Math.round(218 - 174 * blend);
        output[index + 2] = Math.round(48 - 32 * blend);
      }
      output[index + 3] = Math.round(Math.min(235, 35 + information * 45 + anomaly * 175));
    }
  }

  const disruptedRatio = analysis.informativeTileCount > 0
    ? (analysis.disruptedTileCount / analysis.informativeTileCount) * 100
    : 0;
  const dominantPhase = analysis.globalPhaseStrength < 0.08
    ? 'Weak / undetermined'
    : analysis.globalSignature >= 0
      ? '00/11 high-variance'
      : '01/10 high-variance';
  const tileMetricLabel = analysis.globalPhaseStrength < 0.08 ? 'Weak-phase tiles' : 'Disrupted tiles';
  const metrics: PixelMetric[] = [
    { label: 'Global phase strength', value: `${(analysis.globalPhaseStrength * 100).toFixed(1)}%` },
    { label: 'Dominant 2×2 phase', value: dominantPhase },
    { label: tileMetricLabel, value: `${analysis.disruptedTileCount}/${analysis.informativeTileCount} (${disruptedRatio.toFixed(1)}%)` },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeChroma(file: File, maxDimension: number, channel: 'cb' | 'cr') {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const channels = chromaFromRgba(pixels.data);
  const values = channel === 'cb' ? channels.cb : channels.cr;
  const output = new Uint8ClampedArray(pixels.data.length);
  let sum = 0;
  let squaredSum = 0;
  let minimum = 255;
  let maximum = 0;

  for (let pixel = 0, index = 0; pixel < values.length; pixel += 1, index += 4) {
    const value = values[pixel];
    const display = Math.round(value);
    output[index] = display;
    output[index + 1] = display;
    output[index + 2] = display;
    output[index + 3] = 238;
    sum += value;
    squaredSum += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  const mean = sum / Math.max(1, values.length);
  const deviation = Math.sqrt(Math.max(0, squaredSum / Math.max(1, values.length) - mean * mean));
  const label = channel === 'cb' ? 'Cb' : 'Cr';
  const metrics: PixelMetric[] = [
    { label: `${label} mean`, value: mean.toFixed(2) },
    { label: `${label} deviation`, value: deviation.toFixed(2) },
    { label: `${label} range`, value: `${minimum.toFixed(0)}–${maximum.toFixed(0)}` },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeJpegGhost(file: File, mimeType: string, maxDimension: number) {
  if (mimeType !== 'image/jpeg') throw new Error('JPEG Ghost is available only for JPEG files');
  const { canvas, pixels, width, height } = await loadPixels(file, Math.min(maxDimension, 1280));
  const tileColumns = Math.ceil(width / JPEG_GHOST_TILE_SIZE);
  const tileRows = Math.ceil(height / JPEG_GHOST_TILE_SIZE);
  const tileCount = tileColumns * tileRows;
  const errors = new Float32Array(tileCount * JPEG_GHOST_QUALITIES.length);
  const counts = new Uint32Array(tileCount);
  const comparisonCanvas = new OffscreenCanvas(width, height);
  const comparisonContext = comparisonCanvas.getContext('2d', { willReadFrequently: true });
  if (!comparisonContext) throw new Error('JPEG Ghost comparison context is unavailable');

  for (let qualityIndex = 0; qualityIndex < JPEG_GHOST_QUALITIES.length; qualityIndex += 1) {
    const quality = JPEG_GHOST_QUALITIES[qualityIndex];
    const recompressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
    const recompressed = await createImageBitmap(recompressedBlob);
    comparisonContext.clearRect(0, 0, width, height);
    comparisonContext.drawImage(recompressed, 0, 0, width, height);
    recompressed.close();
    const comparison = comparisonContext.getImageData(0, 0, width, height).data;
    const qualityOffset = qualityIndex * tileCount;

    for (let y = 0; y < height; y += 1) {
      const tileY = Math.floor(y / JPEG_GHOST_TILE_SIZE);
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const index = pixel * 4;
        const tile = tileY * tileColumns + Math.floor(x / JPEG_GHOST_TILE_SIZE);
        errors[qualityOffset + tile] += (
          Math.abs(pixels.data[index] - comparison[index])
          + Math.abs(pixels.data[index + 1] - comparison[index + 1])
          + Math.abs(pixels.data[index + 2] - comparison[index + 2])
        ) / 3;
        if (qualityIndex === 0) counts[tile] += 1;
      }
    }
    for (let tile = 0; tile < tileCount; tile += 1) errors[qualityOffset + tile] /= Math.max(1, counts[tile]);
  }

  const summary = summarizeJpegGhosts(errors, tileCount, JPEG_GHOST_QUALITIES);
  const output = new Uint8ClampedArray(pixels.data.length);
  for (let y = 0; y < height; y += 1) {
    const tileY = Math.floor(y / JPEG_GHOST_TILE_SIZE);
    for (let x = 0; x < width; x += 1) {
      const tile = tileY * tileColumns + Math.floor(x / JPEG_GHOST_TILE_SIZE);
      const score = summary.anomalyScores[tile];
      if (score < 0.03) continue;
      const index = (y * width + x) * 4;
      const lowerQuality = summary.bestQualities[tile] < summary.dominantQuality;
      output[index] = 255;
      output[index + 1] = lowerQuality ? Math.round(190 - score * 130) : Math.round(70 + score * 40);
      output[index + 2] = lowerQuality ? 24 : Math.round(150 + score * 100);
      output[index + 3] = Math.round(Math.min(235, 45 + score * 210));
    }
  }

  const anomalousRatio = (summary.anomalousTileCount / Math.max(1, tileCount)) * 100;
  const metrics: PixelMetric[] = [
    { label: 'Dominant interior quality', value: `Q${summary.dominantQuality} browser estimate` },
    { label: 'Ghost-response tiles', value: `${summary.anomalousTileCount}/${tileCount} (${anomalousRatio.toFixed(1)}%)` },
    { label: 'Quality scan', value: `Q50–Q100 / ${JPEG_GHOST_QUALITIES.length} passes` },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

async function analyzeDct(file: File, maxDimension: number) {
  const { pixels, width, height } = await loadPixels(file, maxDimension);
  const analysis = analyzeDctEnergy(luminanceFromRgba(pixels.data), width, height);
  const output = new Uint8ClampedArray(pixels.data.length);
  const displayCeiling = Math.max(1, analysis.p95HighFrequencyRms);

  for (let y = 0; y < height; y += 1) {
    const blockY = Math.min(analysis.blockRows - 1, Math.floor(y / analysis.blockSize));
    for (let x = 0; x < width; x += 1) {
      const blockX = Math.min(analysis.blockColumns - 1, Math.floor(x / analysis.blockSize));
      const block = blockY * analysis.blockColumns + blockX;
      const strength = Math.min(1, Math.log1p(analysis.highFrequencyRms[block]) / Math.log1p(displayCeiling));
      const index = (y * width + x) * 4;
      output[index] = Math.round(36 + strength * 219);
      output[index + 1] = Math.round(12 + strength * 202);
      output[index + 2] = Math.round(92 - strength * 56);
      output[index + 3] = 238;
    }
  }

  const metrics: PixelMetric[] = [
    { label: 'Mean high-frequency RMS', value: analysis.meanHighFrequencyRms.toFixed(2) },
    { label: 'Mean high-frequency share', value: `${(analysis.meanHighFrequencyShare * 100).toFixed(1)}%` },
    { label: 'DCT geometry', value: 'Decoded Y · 8×8 blocks' },
  ];
  return { blob: await makeOutput(width, height, output), width, height, metrics };
}

function requestIdOf(value: unknown): string {
  if (value && typeof value === 'object' && 'requestId' in value && typeof value.requestId === 'string') return value.requestId;
  return 'invalid-request';
}

function validateRequest(value: unknown): asserts value is PixelOverlayWorkerRequest {
  if (!value || typeof value !== 'object') throw new Error('Pixel analysis request is missing');
  const request = value as Partial<PixelOverlayWorkerRequest>;
  if (!request.requestId || typeof request.requestId !== 'string') throw new Error('Pixel analysis request ID is invalid');
  if (!(request.file instanceof File)) throw new Error('Pixel analysis file is invalid');
  if (!request.mode || !VALID_MODES.has(request.mode)) throw new Error('Pixel analysis mode is invalid');
  if (!request.mimeType || typeof request.mimeType !== 'string') throw new Error('Pixel analysis MIME type is invalid');
  const maxDimension = request.maxDimension;
  if (typeof maxDimension !== 'number' || !Number.isInteger(maxDimension) || maxDimension < 256 || maxDimension > 4096) throw new Error('Pixel analysis dimension limit is invalid');
}

scope.onmessage = async (event: MessageEvent<unknown>) => {
  const requestId = requestIdOf(event.data);
  try {
    validateRequest(event.data);
    const { file, mode, mimeType, maxDimension } = event.data;
    const result = mode === 'clipping' ? await analyzeClipping(file, maxDimension)
      : mode === 'ela' ? await analyzeEla(file, mimeType, maxDimension)
        : mode === 'noise' ? await analyzeNoise(file, maxDimension)
          : mode === 'gradient' ? await analyzeGradient(file, maxDimension)
            : mode === 'median' ? await analyzeMedianResidual(file, maxDimension)
              : mode === 'copyMove' ? await analyzeCopyMove(file, maxDimension)
                : mode === 'cfa' ? await analyzeCfa(file, maxDimension)
                  : mode === 'chromaCb' ? await analyzeChroma(file, maxDimension, 'cb')
                    : mode === 'chromaCr' ? await analyzeChroma(file, maxDimension, 'cr')
                      : mode === 'jpegGhost' ? await analyzeJpegGhost(file, mimeType, maxDimension)
                        : await analyzeDct(file, maxDimension);
    const response: PixelOverlayWorkerResponse = { requestId, ok: true, ...result };
    scope.postMessage(response);
  } catch (error) {
    const response: PixelOverlayWorkerResponse = {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Pixel analysis failed',
    };
    scope.postMessage(response);
  }
};
