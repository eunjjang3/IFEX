import { describe, expect, it } from 'vitest';
import {
  analyzeCfaPhase,
  analyzeDctEnergy,
  chromaFromRgba,
  detectCopyMove,
  luminanceFromRgba,
  medianResidualMap,
  sobelMagnitudeMap,
  summarizeJpegGhosts,
} from './pixelAnalysis';

describe('pixel analysis maps', () => {
  it('converts RGBA pixels to perceptual luminance', () => {
    const result = luminanceFromRgba(new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 255, 255, 255,
    ]));
    expect(result[0]).toBeCloseTo(54.213, 2);
    expect(result[1]).toBeCloseTo(255, 4);
  });

  it('maps a sharp vertical boundary with the Sobel operator', () => {
    const width = 9;
    const height = 7;
    const luminance = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 5; x < width; x += 1) luminance[y * width + x] = 255;
    }

    const result = sobelMagnitudeMap(luminance, width, height);
    expect(result.values[3 * width + 4]).toBeGreaterThan(900);
    expect(result.values[3 * width + 2]).toBe(0);
    expect(result.strongCount).toBeGreaterThan(0);
  });

  it('isolates an impulse with median subtraction', () => {
    const width = 5;
    const height = 5;
    const luminance = new Float32Array(width * height).fill(10);
    luminance[2 * width + 2] = 100;

    const result = medianResidualMap(luminance, width, height);
    expect(result.values[2 * width + 2]).toBe(90);
    expect(result.values[2 * width + 1]).toBe(0);
    expect(result.strongCount).toBe(1);
  });
});

describe('copy-move block matching', () => {
  it('finds a copied textured region through repeated displacement votes', () => {
    const width = 128;
    const height = 96;
    const luminance = new Float32Array(width * height);
    let randomState = 0x12345678;
    for (let index = 0; index < luminance.length; index += 1) {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      luminance[index] = (randomState >>> 24) & 0xff;
    }

    const sourceX = 16;
    const sourceY = 16;
    const targetX = 80;
    const targetY = 48;
    for (let offsetY = 0; offsetY < 32; offsetY += 1) {
      for (let offsetX = 0; offsetX < 32; offsetX += 1) {
        luminance[(targetY + offsetY) * width + targetX + offsetX] = luminance[(sourceY + offsetY) * width + sourceX + offsetX];
      }
    }

    const result = detectCopyMove(luminance, width, height);
    expect(result.clusterCount).toBeGreaterThan(0);
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    expect(result.matches.some((match) => Math.abs(match.targetX - match.sourceX) === 64 && Math.abs(match.targetY - match.sourceY) === 32)).toBe(true);
  });

  it('ignores featureless images', () => {
    const result = detectCopyMove(new Float32Array(64 * 64).fill(128), 64, 64);
    expect(result.matches).toHaveLength(0);
    expect(result.clusterCount).toBe(0);
  });
});

describe('Bayer CFA phase residuals', () => {
  it('raises the anomaly score where an otherwise periodic 2×2 phase is disrupted', () => {
    const width = 64;
    const height = 64;
    const green = new Float32Array(width * height);
    let randomState = 0x9e3779b9;
    const noise = () => {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      return ((randomState >>> 8) / 0x00ffffff) * 2 - 1;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const phaseAmplitude = (x + y) % 2 === 0 ? 22 : 2;
        green[y * width + x] = 112 + x * 0.18 + y * 0.12 + noise() * phaseAmplitude;
      }
    }

    for (let y = 32; y < 48; y += 1) {
      for (let x = 32; x < 48; x += 1) green[y * width + x] = 122 + noise() * 12;
    }

    const result = analyzeCfaPhase(green, width, height, 16);
    const disruptedTile = 2 * result.tileColumns + 2;
    const consistentTile = result.tileColumns + 1;
    expect(result.globalPhaseStrength).toBeGreaterThan(0.2);
    expect(result.anomalyScores[disruptedTile]).toBeGreaterThan(0.5);
    expect(result.anomalyScores[consistentTile]).toBeLessThan(0.25);
    expect(result.disruptedTileCount).toBeGreaterThan(0);
  });

  it('reports a featureless image as uninformative instead of manipulated', () => {
    const result = analyzeCfaPhase(new Float32Array(32 * 32).fill(128), 32, 32);
    expect(result.informativeTileCount).toBe(0);
    expect(result.disruptedTileCount).toBe(0);
  });
});

describe('YCbCr chroma channels', () => {
  it('separates neutral, blue, and red pixels into JPEG-range Cb and Cr values', () => {
    const result = chromaFromRgba(new Uint8ClampedArray([
      128, 128, 128, 255,
      0, 0, 255, 255,
      255, 0, 0, 255,
    ]));
    expect(result.cb[0]).toBeCloseTo(128, 3);
    expect(result.cr[0]).toBeCloseTo(128, 3);
    expect(result.cb[1]).toBe(255);
    expect(result.cr[2]).toBe(255);
    expect(result.cb[2]).toBeLessThan(100);
    expect(result.cr[1]).toBeLessThan(128);
  });
});

describe('decoded 8×8 DCT energy', () => {
  it('distinguishes a flat block from a high-frequency checkerboard', () => {
    const flat = analyzeDctEnergy(new Float32Array(8 * 8).fill(128), 8, 8);
    const checkerboardPixels = new Float32Array(8 * 8);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) checkerboardPixels[y * 8 + x] = (x + y) % 2 === 0 ? 0 : 255;
    }
    const checkerboard = analyzeDctEnergy(checkerboardPixels, 8, 8);
    expect(flat.highFrequencyRms[0]).toBeCloseTo(0, 6);
    expect(checkerboard.highFrequencyRms[0]).toBeGreaterThan(10);
    expect(checkerboard.highFrequencyShare[0]).toBeGreaterThan(0.8);
  });
});

describe('multi-pass JPEG Ghost summary', () => {
  it('finds a tile whose local error minimum differs from the dominant quality', () => {
    const qualities = [70, 90, 100] as const;
    const result = summarizeJpegGhosts(new Float32Array([
      3, 3, 3, 1,
      1, 1, 1, 4,
      2, 2, 2, 3,
    ]), 4, qualities);
    expect(result.dominantQuality).toBe(90);
    expect([...result.bestQualities]).toEqual([90, 90, 90, 70]);
    expect(result.anomalyScores[3]).toBeGreaterThan(0.7);
    expect(result.anomalousTileCount).toBe(1);
  });
});
