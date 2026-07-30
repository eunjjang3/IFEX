export interface ScalarAnalysisMap {
  values: Float32Array;
  mean: number;
  p95: number;
  strongCount: number;
}

export interface CopyMoveMatch {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  score: number;
}

export interface CopyMoveAnalysis {
  matches: CopyMoveMatch[];
  clusterCount: number;
  candidateCount: number;
  analyzedBlockCount: number;
  blockSize: number;
  step: number;
}

export interface CfaPhaseAnalysis {
  anomalyScores: Float32Array;
  informationWeights: Float32Array;
  tileColumns: number;
  tileRows: number;
  tileSize: number;
  globalSignature: number;
  globalPhaseStrength: number;
  informativeTileCount: number;
  disruptedTileCount: number;
}

export interface ChromaChannels {
  cb: Float32Array;
  cr: Float32Array;
}

export interface DctEnergyAnalysis {
  highFrequencyRms: Float32Array;
  highFrequencyShare: Float32Array;
  blockColumns: number;
  blockRows: number;
  blockSize: number;
  meanHighFrequencyRms: number;
  meanHighFrequencyShare: number;
  p95HighFrequencyRms: number;
}

export interface JpegGhostSummary {
  anomalyScores: Float32Array;
  bestQualities: Uint8Array;
  dominantQuality: number;
  anomalousTileCount: number;
}

interface BlockDescriptor {
  x: number;
  y: number;
  deviation: number;
}

interface DescriptorValues {
  values: Float32Array;
  mean: number;
  deviation: number;
  signature: number;
}

interface CandidateMatch extends CopyMoveMatch {
  displacementKey: string;
}

const COPY_BLOCK_SIZE = 16;
const DESCRIPTOR_GRID = 4;
const MAX_BUCKET_SIZE = 24;
const MAX_CANDIDATE_MATCHES = 6_000;
const MAX_REPORTED_MATCHES = 160;
const CFA_TILE_SIZE = 16;
const DCT_BLOCK_SIZE = 8;
const DCT_COSINES = new Float32Array(DCT_BLOCK_SIZE * DCT_BLOCK_SIZE);

for (let frequency = 0; frequency < DCT_BLOCK_SIZE; frequency += 1) {
  for (let position = 0; position < DCT_BLOCK_SIZE; position += 1) {
    DCT_COSINES[frequency * DCT_BLOCK_SIZE + position] = Math.cos(((2 * position + 1) * frequency * Math.PI) / 16);
  }
}

export function luminanceFromRgba(data: Uint8ClampedArray): Float32Array {
  const luminance = new Float32Array(Math.floor(data.length / 4));
  for (let pixel = 0, index = 0; pixel < luminance.length; pixel += 1, index += 4) {
    luminance[pixel] = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  }
  return luminance;
}

export function chromaFromRgba(data: Uint8ClampedArray): ChromaChannels {
  const pixelCount = Math.floor(data.length / 4);
  const cb = new Float32Array(pixelCount);
  const cr = new Float32Array(pixelCount);
  for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    cb[pixel] = Math.min(255, Math.max(0, 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue));
    cr[pixel] = Math.min(255, Math.max(0, 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue));
  }
  return { cb, cr };
}

function percentile95(values: Float32Array): number {
  if (values.length === 0) return 0;
  const histogram = new Uint32Array(1_024);
  for (const value of values) histogram[Math.min(histogram.length - 1, Math.max(0, Math.round(Math.abs(value))))] += 1;
  const target = Math.ceil(values.length * 0.95);
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen >= target) return index;
  }
  return histogram.length - 1;
}

export function sobelMagnitudeMap(luminance: Float32Array, width: number, height: number): ScalarAnalysisMap {
  const values = new Float32Array(luminance.length);
  let sum = 0;
  let strongCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const topLeft = luminance[pixel - width - 1];
      const top = luminance[pixel - width];
      const topRight = luminance[pixel - width + 1];
      const left = luminance[pixel - 1];
      const right = luminance[pixel + 1];
      const bottomLeft = luminance[pixel + width - 1];
      const bottom = luminance[pixel + width];
      const bottomRight = luminance[pixel + width + 1];
      const horizontal = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
      const vertical = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
      const magnitude = Math.hypot(horizontal, vertical);
      values[pixel] = magnitude;
      sum += magnitude;
      if (magnitude >= 128) strongCount += 1;
    }
  }

  return {
    values,
    mean: luminance.length > 0 ? sum / luminance.length : 0,
    p95: percentile95(values),
    strongCount,
  };
}

function medianOfNine(values: number[]): number {
  values.sort((left, right) => left - right);
  return values[4];
}

export function medianResidualMap(luminance: Float32Array, width: number, height: number): ScalarAnalysisMap {
  const values = new Float32Array(luminance.length);
  const neighborhood = new Array<number>(9);
  let sum = 0;
  let strongCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      let cursor = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          neighborhood[cursor] = luminance[pixel + offsetY * width + offsetX];
          cursor += 1;
        }
      }
      const residual = luminance[pixel] - medianOfNine(neighborhood);
      values[pixel] = residual;
      const magnitude = Math.abs(residual);
      sum += magnitude;
      if (magnitude >= 8) strongCount += 1;
    }
  }

  return {
    values,
    mean: luminance.length > 0 ? sum / luminance.length : 0,
    p95: percentile95(values),
    strongCount,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Lightweight local 2×2 phase-residual heuristic inspired by CFA-correlation
 * forensics. This intentionally does not claim to implement the Popescu–Farid
 * expectation-maximization probability-map detector.
 */
export function analyzeCfaPhase(green: Float32Array, width: number, height: number, tileSize = CFA_TILE_SIZE): CfaPhaseAnalysis {
  const normalizedTileSize = Math.max(8, Math.floor(tileSize / 2) * 2);
  const tileColumns = Math.ceil(width / normalizedTileSize);
  const tileRows = Math.ceil(height / normalizedTileSize);
  const tileCount = tileColumns * tileRows;
  const signatures = new Float32Array(tileCount);
  const energies = new Float32Array(tileCount);
  const error = new Float32Array(green.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const prediction = (green[pixel - width] + green[pixel + width] + green[pixel - 1] + green[pixel + 1]) * 0.25;
      error[pixel] = green[pixel] - prediction;
    }
  }

  const robustSignatures: number[] = [];
  for (let tileY = 0; tileY < tileRows; tileY += 1) {
    for (let tileX = 0; tileX < tileColumns; tileX += 1) {
      const sums = new Float64Array(4);
      const squaredSums = new Float64Array(4);
      const counts = new Uint32Array(4);
      const startX = Math.max(1, tileX * normalizedTileSize);
      const startY = Math.max(1, tileY * normalizedTileSize);
      const endX = Math.min(width - 1, (tileX + 1) * normalizedTileSize);
      const endY = Math.min(height - 1, (tileY + 1) * normalizedTileSize);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const phase = ((y & 1) << 1) | (x & 1);
          const value = error[y * width + x];
          sums[phase] += value;
          squaredSums[phase] += value * value;
          counts[phase] += 1;
        }
      }

      const variances = new Float64Array(4);
      for (let phase = 0; phase < 4; phase += 1) {
        if (counts[phase] === 0) continue;
        const mean = sums[phase] / counts[phase];
        variances[phase] = Math.max(0, squaredSums[phase] / counts[phase] - mean * mean);
      }
      const diagonal = variances[0] + variances[3];
      const offDiagonal = variances[1] + variances[2];
      const totalVariance = diagonal + offDiagonal;
      const tile = tileY * tileColumns + tileX;
      signatures[tile] = totalVariance > 0 ? (diagonal - offDiagonal) / totalVariance : 0;
      energies[tile] = totalVariance * 0.25;
      if (energies[tile] >= 0.5 && counts.every((count) => count >= 8)) robustSignatures.push(signatures[tile]);
    }
  }

  const globalSignature = median(robustSignatures);
  const globalPhaseStrength = Math.abs(globalSignature);
  const expectedPolarity = globalSignature < 0 ? -1 : 1;
  const anomalyScores = new Float32Array(tileCount);
  const informationWeights = new Float32Array(tileCount);
  let informativeTileCount = 0;
  let disruptedTileCount = 0;

  for (let tile = 0; tile < tileCount; tile += 1) {
    const information = clamp01(Math.sqrt(energies[tile]) / 4);
    informationWeights[tile] = information;
    if (information < 0.2) continue;
    informativeTileCount += 1;
    const alignedStrength = Math.max(0, signatures[tile] * expectedPolarity);
    const referenceStrength = Math.max(0.12, globalPhaseStrength);
    const anomaly = clamp01(1 - alignedStrength / referenceStrength) * information;
    anomalyScores[tile] = anomaly;
    if (anomaly >= 0.6) disruptedTileCount += 1;
  }

  return {
    anomalyScores,
    informationWeights,
    tileColumns,
    tileRows,
    tileSize: normalizedTileSize,
    globalSignature,
    globalPhaseStrength,
    informativeTileCount,
    disruptedTileCount,
  };
}

function percentile(values: Float32Array, fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

export function analyzeDctEnergy(luminance: Float32Array, width: number, height: number): DctEnergyAnalysis {
  const blockSize = DCT_BLOCK_SIZE;
  const blockColumns = Math.max(1, Math.ceil(width / blockSize));
  const blockRows = Math.max(1, Math.ceil(height / blockSize));
  const blockCount = blockColumns * blockRows;
  const highFrequencyRms = new Float32Array(blockCount);
  const highFrequencyShare = new Float32Array(blockCount);
  const horizontalTransform = new Float32Array(blockSize * blockSize);
  let rmsSum = 0;
  let shareSum = 0;

  for (let blockY = 0; blockY < blockRows; blockY += 1) {
    for (let blockX = 0; blockX < blockColumns; blockX += 1) {
      for (let y = 0; y < blockSize; y += 1) {
        const sourceY = Math.min(height - 1, blockY * blockSize + y);
        for (let horizontalFrequency = 0; horizontalFrequency < blockSize; horizontalFrequency += 1) {
          let transformed = 0;
          for (let x = 0; x < blockSize; x += 1) {
            const sourceX = Math.min(width - 1, blockX * blockSize + x);
            transformed += (luminance[sourceY * width + sourceX] - 128) * DCT_COSINES[horizontalFrequency * blockSize + x];
          }
          horizontalTransform[y * blockSize + horizontalFrequency] = transformed;
        }
      }

      let totalAcEnergy = 0;
      let highEnergy = 0;
      let highCoefficientCount = 0;
      for (let verticalFrequency = 0; verticalFrequency < blockSize; verticalFrequency += 1) {
        const verticalScale = verticalFrequency === 0 ? Math.SQRT1_2 : 1;
        for (let horizontalFrequency = 0; horizontalFrequency < blockSize; horizontalFrequency += 1) {
          if (verticalFrequency === 0 && horizontalFrequency === 0) continue;
          const horizontalScale = horizontalFrequency === 0 ? Math.SQRT1_2 : 1;
          let coefficient = 0;
          for (let y = 0; y < blockSize; y += 1) {
            coefficient += horizontalTransform[y * blockSize + horizontalFrequency] * DCT_COSINES[verticalFrequency * blockSize + y];
          }
          coefficient *= 0.25 * verticalScale * horizontalScale;
          const energy = coefficient * coefficient;
          totalAcEnergy += energy;
          if (horizontalFrequency + verticalFrequency >= 6) {
            highEnergy += energy;
            highCoefficientCount += 1;
          }
        }
      }
      const block = blockY * blockColumns + blockX;
      const rms = Math.sqrt(highEnergy / Math.max(1, highCoefficientCount));
      const share = highEnergy / Math.max(0.0001, totalAcEnergy);
      highFrequencyRms[block] = rms;
      highFrequencyShare[block] = share;
      rmsSum += rms;
      shareSum += share;
    }
  }

  return {
    highFrequencyRms,
    highFrequencyShare,
    blockColumns,
    blockRows,
    blockSize,
    meanHighFrequencyRms: rmsSum / blockCount,
    meanHighFrequencyShare: shareSum / blockCount,
    p95HighFrequencyRms: percentile(highFrequencyRms, 0.95),
  };
}

export function summarizeJpegGhosts(
  errorsByQuality: Float32Array,
  tileCount: number,
  qualities: readonly number[],
): JpegGhostSummary {
  if (tileCount < 1 || qualities.length < 1 || errorsByQuality.length !== tileCount * qualities.length) {
    return { anomalyScores: new Float32Array(Math.max(0, tileCount)), bestQualities: new Uint8Array(Math.max(0, tileCount)), dominantQuality: 0, anomalousTileCount: 0 };
  }

  // Q100 is retained as a comparison pass, but its near-lossless endpoint is
  // a trivial error minimum and is not treated as evidence of prior quality.
  const candidateQualityCount = qualities.length > 1 && qualities[qualities.length - 1] >= 100
    ? qualities.length - 1
    : qualities.length;
  let dominantIndex = 0;
  let dominantMedian = Number.POSITIVE_INFINITY;
  for (let qualityIndex = 0; qualityIndex < candidateQualityCount; qualityIndex += 1) {
    const start = qualityIndex * tileCount;
    const qualityErrors = errorsByQuality.slice(start, start + tileCount);
    const medianError = percentile(qualityErrors, 0.5);
    if (medianError < dominantMedian) {
      dominantMedian = medianError;
      dominantIndex = qualityIndex;
    }
  }

  const anomalyScores = new Float32Array(tileCount);
  const bestQualities = new Uint8Array(tileCount);
  let anomalousTileCount = 0;
  for (let tile = 0; tile < tileCount; tile += 1) {
    let bestIndex = 0;
    let bestError = Number.POSITIVE_INFINITY;
    for (let qualityIndex = 0; qualityIndex < candidateQualityCount; qualityIndex += 1) {
      const error = errorsByQuality[qualityIndex * tileCount + tile];
      if (error < bestError) {
        bestError = error;
        bestIndex = qualityIndex;
      }
    }
    const bestQuality = qualities[bestIndex];
    const dominantError = errorsByQuality[dominantIndex * tileCount + tile];
    const qualityDistance = Math.abs(bestQuality - qualities[dominantIndex]);
    const score = qualityDistance >= 10 ? clamp01((dominantError - bestError) / Math.max(0.5, dominantError)) : 0;
    bestQualities[tile] = bestQuality;
    anomalyScores[tile] = score;
    if (score >= 0.15) anomalousTileCount += 1;
  }

  return {
    anomalyScores,
    bestQualities,
    dominantQuality: qualities[dominantIndex],
    anomalousTileCount,
  };
}

function describeBlock(luminance: Float32Array, width: number, x: number, y: number, blockSize: number): DescriptorValues {
  const values = new Float32Array(DESCRIPTOR_GRID * DESCRIPTOR_GRID);
  const cellSize = blockSize / DESCRIPTOR_GRID;
  let total = 0;

  for (let cellY = 0; cellY < DESCRIPTOR_GRID; cellY += 1) {
    for (let cellX = 0; cellX < DESCRIPTOR_GRID; cellX += 1) {
      let cellTotal = 0;
      for (let offsetY = 0; offsetY < cellSize; offsetY += 1) {
        const row = (y + cellY * cellSize + offsetY) * width + x + cellX * cellSize;
        for (let offsetX = 0; offsetX < cellSize; offsetX += 1) cellTotal += luminance[row + offsetX];
      }
      const value = cellTotal / (cellSize * cellSize);
      const index = cellY * DESCRIPTOR_GRID + cellX;
      values[index] = value;
      total += value;
    }
  }

  const mean = total / values.length;
  let squaredDeviation = 0;
  let signature = 0;
  for (let index = 0; index < values.length; index += 1) {
    const centered = values[index] - mean;
    squaredDeviation += centered * centered;
    if (centered >= 0) signature |= 1 << index;
  }
  return { values, mean, deviation: Math.sqrt(squaredDeviation / values.length), signature };
}

function descriptorDistance(left: DescriptorValues, right: DescriptorValues): number {
  let squaredLeft = 0;
  let squaredRight = 0;
  let dot = 0;
  let centeredDifference = 0;
  for (let index = 0; index < left.values.length; index += 1) {
    const leftValue = left.values[index] - left.mean;
    const rightValue = right.values[index] - right.mean;
    squaredLeft += leftValue * leftValue;
    squaredRight += rightValue * rightValue;
    dot += leftValue * rightValue;
    centeredDifference += Math.abs(leftValue - rightValue);
  }
  const correlation = dot / Math.max(0.0001, Math.sqrt(squaredLeft * squaredRight));
  const meanDifference = centeredDifference / left.values.length;
  if (correlation < 0.985 || meanDifference > 8) return Number.POSITIVE_INFINITY;
  return (1 - correlation) * 100 + meanDifference;
}

export function detectCopyMove(luminance: Float32Array, width: number, height: number): CopyMoveAnalysis {
  const blockSize = COPY_BLOCK_SIZE;
  const step = Math.max(4, Math.ceil(Math.max(width, height) / 320));
  if (width < blockSize * 2 || height < blockSize * 2) {
    return { matches: [], clusterCount: 0, candidateCount: 0, analyzedBlockCount: 0, blockSize, step };
  }

  const buckets = new Map<number, BlockDescriptor[]>();
  const candidates: CandidateMatch[] = [];
  let candidateCount = 0;
  let analyzedBlockCount = 0;
  const minimumDistanceSquared = (blockSize * 1.5) ** 2;

  scan: for (let y = 0; y <= height - blockSize; y += step) {
    for (let x = 0; x <= width - blockSize; x += step) {
      const current = describeBlock(luminance, width, x, y, blockSize);
      analyzedBlockCount += 1;
      if (current.deviation < 4) continue;
      const bucket = buckets.get(current.signature) ?? [];

      for (let index = Math.max(0, bucket.length - MAX_BUCKET_SIZE); index < bucket.length; index += 1) {
        const previous = bucket[index];
        const deltaX = previous.x - x;
        const deltaY = previous.y - y;
        if (deltaX * deltaX + deltaY * deltaY < minimumDistanceSquared) continue;
        if (Math.abs(previous.deviation - current.deviation) > Math.max(4, current.deviation * 0.35)) continue;
        candidateCount += 1;
        const previousValues = describeBlock(luminance, width, previous.x, previous.y, blockSize);
        const score = descriptorDistance(previousValues, current);
        if (!Number.isFinite(score)) continue;
        candidates.push({
          sourceX: previous.x,
          sourceY: previous.y,
          targetX: x,
          targetY: y,
          score,
          displacementKey: `${deltaX},${deltaY}`,
        });
        if (candidates.length >= MAX_CANDIDATE_MATCHES) break scan;
      }

      bucket.push({ x, y, deviation: current.deviation });
      if (bucket.length > MAX_BUCKET_SIZE * 2) bucket.splice(0, MAX_BUCKET_SIZE);
      buckets.set(current.signature, bucket);
    }
  }

  const displacementGroups = new Map<string, CandidateMatch[]>();
  for (const candidate of candidates) {
    const group = displacementGroups.get(candidate.displacementKey) ?? [];
    group.push(candidate);
    displacementGroups.set(candidate.displacementKey, group);
  }

  const acceptedCandidates: CandidateMatch[] = [];
  let clusterCount = 0;
  for (const group of displacementGroups.values()) {
    if (group.length < 3) continue;
    const positions = new Map(group.map((candidate) => [`${candidate.sourceX},${candidate.sourceY}`, candidate]));
    const visited = new Set<string>();
    for (const [position, candidate] of positions) {
      if (visited.has(position)) continue;
      const component: CandidateMatch[] = [];
      const queue = [candidate];
      visited.add(position);
      while (queue.length > 0) {
        const current = queue.pop();
        if (!current) break;
        component.push(current);
        for (let offsetY = -step; offsetY <= step; offsetY += step) {
          for (let offsetX = -step; offsetX <= step; offsetX += step) {
            if (offsetX === 0 && offsetY === 0) continue;
            const neighborKey = `${current.sourceX + offsetX},${current.sourceY + offsetY}`;
            const neighbor = positions.get(neighborKey);
            if (!neighbor || visited.has(neighborKey)) continue;
            visited.add(neighborKey);
            queue.push(neighbor);
          }
        }
      }
      if (component.length >= 3) {
        acceptedCandidates.push(...component);
        clusterCount += 1;
      }
    }
  }

  const matches = acceptedCandidates
    .sort((left, right) => left.score - right.score)
    .slice(0, MAX_REPORTED_MATCHES)
    .map(({ displacementKey: _displacementKey, ...match }) => match);

  return {
    matches,
    clusterCount,
    candidateCount,
    analyzedBlockCount,
    blockSize,
    step,
  };
}
