import { describe, expect, it } from 'vitest';
import { detectMetadataLeakage } from './leakageEngine';
import type { AdvancedData, CameraDetails, FileMetrics, LocationData } from '../types/exif';

const metrics: FileMetrics = {
  name: 'evidence.jpg',
  sizeBytes: 10,
  sizeFormatted: '10 Bytes',
  mimeType: 'image/jpeg',
  modifyDate: new Date('2026-07-26T00:00:00Z'),
};

describe('detectMetadataLeakage', () => {
  it('reports only fields observed in embedded metadata', () => {
    const report = detectMetadataLeakage(
      { latitude: 37.5, longitude: 127.0 } satisfies LocationData,
      { serialNumber: 'CAM-123', make: 'Example', model: 'Camera' } satisfies CameraDetails,
      { ...metrics, createDate: new Date('2025-01-02T03:04:05Z') },
      { iptc: { byline: 'Photographer' }, xmp: { creatorTool: 'Editor 1.0' } } satisfies AdvancedData,
      {},
    );
    expect(report.detectedCount).toBe(5);
    expect(report.summary).toBe('5 metadata leakage signals observed in this file.');
    expect(report.findings).toEqual([
      expect.objectContaining({
        id: 'gps', category: 'location', significance: 'high', detected: true,
        value: '37.500000°, 127.000000°',
      }),
      expect.objectContaining({
        id: 'hardware-identifiers', category: 'hardware', significance: 'high', detected: true,
        value: 'Camera: CAM-123',
      }),
      expect.objectContaining({
        id: 'author-identity', category: 'identity', significance: 'medium', detected: true,
        value: 'Photographer',
      }),
      expect.objectContaining({ id: 'capture-time', category: 'timestamp', significance: 'medium', detected: true }),
      expect.objectContaining({
        id: 'processing-environment', category: 'software', significance: 'low', detected: true,
        value: 'Device: Example Camera · Software: Editor 1.0',
      }),
    ]);
  });

  it('does not treat the local filesystem modified time as embedded leakage', () => {
    const report = detectMetadataLeakage({}, {}, metrics, {}, {});
    expect(report.detectedCount).toBe(0);
    expect(report.summary).toBe('No metadata leakage signals found.');
    expect(report.findings).toHaveLength(5);
    expect(report.findings.every((item) => item.detected === false && item.value === undefined)).toBe(true);
    expect(report.findings.find((item) => item.id === 'capture-time')).toMatchObject({
      category: 'timestamp', significance: 'medium', detected: false,
    });
  });
});
