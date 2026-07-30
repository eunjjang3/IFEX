import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileOriginReport } from '../types/forensics';
import type { PhotoAnalysisWorkerRequest, PhotoAnalysisWorkerResponse } from '../types/photoAnalysis';
import { firmwareFromExif, flashFromExif, maxApertureFromApex, parsePhotoFile, runAnalysisWorker } from './exifParser';

function controlledWorker() {
  const posted: PhotoAnalysisWorkerRequest[] = [];
  let terminated = false;
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request: PhotoAnalysisWorkerRequest) => { posted.push(request); },
    terminate: () => { terminated = true; },
  } as unknown as Worker;
  return { worker, posted, wasTerminated: () => terminated };
}

const fileOrigin: FileOriginReport = {
  sha256: '0'.repeat(64),
  fileType: {
    actualMime: 'image/jpeg',
    formatName: 'JPEG',
    extension: 'jpg',
    declaredMime: 'image/jpeg',
    extensionMatches: true,
    mimeMatches: true,
    signatureHex: 'ff d8 ff',
  },
  metadata: { exif: 8, iptc: 0, xmp: 0, icc: 0, editingSoftware: [], hasEmbeddedThumbnail: false },
  c2pa: {
    state: 'absent',
    manifestCount: 0,
    assertionLabels: [],
    ingredientCount: 0,
    validationMessages: [],
    aiGenerated: false,
    aiEdited: false,
    explanation: 'No Content Credentials manifest was found.',
  },
  aigc: { state: 'absent' },
  findings: [],
  generatedAt: '2026-07-30T00:00:00.000Z',
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('runAnalysisWorker', () => {
  it('terminates a worker that exceeds the configured analysis timeout', async () => {
    vi.useFakeTimers();
    const controlled = controlledWorker();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'timeout.jpg', { type: 'image/jpeg' });
    const result = runAnalysisWorker(file, { workerFactory: () => controlled.worker, timeoutMs: 5 });
    const rejection = expect(result).rejects.toThrow('timed out (5 ms)');

    await vi.advanceTimersByTimeAsync(5);

    await rejection;
    expect(controlled.wasTerminated()).toBe(true);
  });

  it('posts bounded limits, ignores stale responses, and resolves the matching response', async () => {
    const controlled = controlledWorker();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'success.jpg', { type: 'image/jpeg' });
    const result = runAnalysisWorker(file, { workerFactory: () => controlled.worker, timeoutMs: 1_000 });
    const request = controlled.posted[0];

    expect(request.file).toBe(file);
    expect(request.requestId).toEqual(expect.any(String));
    expect(request.limits).toMatchObject({
      maxImageMegapixels: 40,
      maxPreviewDimension: 2_048,
      maxMetadataTags: 2_000,
    });

    controlled.worker.onmessage?.({ data: { requestId: 'stale', ok: true } } as MessageEvent<PhotoAnalysisWorkerResponse>);
    expect(controlled.wasTerminated()).toBe(false);

    const response: PhotoAnalysisWorkerResponse = { requestId: request.requestId, ok: true, rawTags: {} };
    controlled.worker.onmessage?.({ data: response } as MessageEvent<PhotoAnalysisWorkerResponse>);

    await expect(result).resolves.toBe(response);
    expect(controlled.wasTerminated()).toBe(true);
  });

  it('rejects worker-reported and unreadable responses and always terminates the worker', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'broken.jpg', { type: 'image/jpeg' });
    const reported = controlledWorker();
    const reportedResult = runAnalysisWorker(file, { workerFactory: () => reported.worker, timeoutMs: 1_000 });
    reported.worker.onmessage?.({
      data: { requestId: reported.posted[0].requestId, ok: false, error: 'decoder failed' },
    } as MessageEvent<PhotoAnalysisWorkerResponse>);

    await expect(reportedResult).rejects.toThrow('decoder failed');
    expect(reported.wasTerminated()).toBe(true);

    const unreadable = controlledWorker();
    const unreadableResult = runAnalysisWorker(file, { workerFactory: () => unreadable.worker, timeoutMs: 1_000 });
    unreadable.worker.onmessageerror?.({} as MessageEvent);

    await expect(unreadableResult).rejects.toThrow('unreadable response');
    expect(unreadable.wasTerminated()).toBe(true);
  });
});

describe('parsePhotoFile', () => {
  it('assembles the public photo model from a successful Worker response', async () => {
    let terminated = false;
    class SuccessfulWorker {
      onmessage: ((event: MessageEvent<PhotoAnalysisWorkerResponse>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      postMessage(request: PhotoAnalysisWorkerRequest) {
        queueMicrotask(() => this.onmessage?.({
          data: {
            requestId: request.requestId,
            ok: true,
            rawTags: {
              Make: ' SONY ', Model: ' ILCE-7M4 ', LensModel: 'FE 50mm F1.8',
              FNumber: 2.8, ExposureTime: 1 / 125, ISO: 100, FocalLength: 50,
              latitude: 37.5665, longitude: 126.978, DateTimeOriginal: '2026-07-30T09:00:00Z',
            },
            metadataLimit: {
              truncated: false, originalTagCount: 10, retainedTagCount: 10, omittedTagCount: 0,
              truncatedValueCount: 0, summarizedBinaryValueCount: 0,
            },
            previewBlob: new Blob(['preview'], { type: 'image/png' }),
            width: 6_000,
            height: 4_000,
            fileOrigin,
          },
        } as unknown as MessageEvent<PhotoAnalysisWorkerResponse>));
      }

      terminate() { terminated = true; }
    }

    vi.stubGlobal('Worker', SuccessfulWorker);
    vi.stubGlobal('OffscreenCanvas', class { convertToBlob() { return Promise.resolve(new Blob()); } });
    vi.stubGlobal('createImageBitmap', vi.fn());
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'camera.jpg', {
      type: 'image/jpeg',
      lastModified: Date.parse('2026-07-30T10:00:00Z'),
    });

    const photo = await parsePhotoFile(file);

    expect(terminated).toBe(true);
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(photo).toMatchObject({
      file,
      previewUrl: 'blob:preview',
      fileMetrics: { mimeType: 'image/jpeg', width: 6_000, height: 4_000, megapixels: '24.0 MP', aspectRatio: '3:2' },
      camera: { make: 'SONY', model: 'ILCE-7M4', lensModel: 'FE 50mm F1.8', focalLength: 50 },
      shooting: { fNumber: 2.8, exposureTimeString: '1/125s', iso: 100 },
      location: { latitude: 37.5665, longitude: 126.978 },
      classification: { type: 'Camera Photo', confidence: 'High' },
      fileOrigin,
    });
    expect(photo.leakage.findings.find((finding) => finding.id === 'gps')).toMatchObject({
      detected: true,
      significance: 'high',
    });
  });
});

describe('EXIF semantic conversion', () => {
  it('converts MaxApertureValue from APEX to an f-number', () => {
    expect(maxApertureFromApex(3)).toBeCloseTo(2.828, 3);
    expect(maxApertureFromApex(undefined)).toBeUndefined();
  });

  it('preserves revived Flash descriptions and decodes numeric fired state', () => {
    expect(flashFromExif('Flash fired, auto mode')).toEqual({ flash: 'Flash fired, auto mode' });
    expect(flashFromExif(0x19)).toEqual({ flash: 'Fired', flashMode: 0x19 });
    expect(flashFromExif(0x18)).toEqual({ flash: 'Did not fire', flashMode: 0x18 });
  });

  it('does not present editing software as camera firmware', () => {
    expect(firmwareFromExif({ Software: 'Adobe Photoshop 25.0' })).toBeUndefined();
    expect(firmwareFromExif({ Software: '3.02', Make: 'SONY', Model: 'ILCE-7M4' })).toBeUndefined();
    expect(firmwareFromExif({ FirmwareVersion: 'ILCE-7M4 v3.02', Software: 'Adobe Photoshop' })).toBe('ILCE-7M4 v3.02');
    expect(firmwareFromExif({ Firmware: '  3.02  ' })).toBe('3.02');
  });
});
