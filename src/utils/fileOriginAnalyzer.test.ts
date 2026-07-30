import { describe, expect, it, vi } from 'vitest';
import { analyzeFileOrigin, collectMetadataInventory, detectFileType, parseJpegStructure } from './fileOriginAnalyzer';
import { JPEG_SEGMENT_LIMIT } from './jpegStructure';
import { normalizeStructuredMetadata } from './metadataNamespaces';

vi.mock('./c2paVerifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./c2paVerifier')>();
  return {
    ...actual,
    verifyC2pa: vi.fn(async () => ({
      state: 'absent' as const,
      manifestCount: 0,
      assertionLabels: [],
      ingredientCount: 0,
      validationMessages: [],
      aiGenerated: false,
      aiEdited: false,
      explanation: 'No Content Credentials manifest was found.',
    })),
  };
});

const jpegBytes = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xdb, 0x00, 0x43, 0x00, ...Array(64).fill(16),
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03,
  0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00,
  0x01, 0x02, 0x03, 0xff, 0xd9,
]);

describe('detectFileType', () => {
  it('uses magic bytes instead of trusting the filename', () => {
    const detected = detectFileType({ name: 'evidence.png', type: 'image/png' }, jpegBytes);
    expect(detected.actualMime).toBe('image/jpeg');
    expect(detected.extensionMatches).toBe(false);
    expect(detected.mimeMatches).toBe(false);
  });

  it('detects an ISO BMFF HEIC brand', () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(detectFileType({ name: 'IMG_0001.HEIC', type: 'image/heic' }, bytes).formatName).toBe('HEIC');
  });

  it('treats HEIC and HEIF declared MIME types as the same format family', () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(detectFileType({ name: 'IMG_0001.HEIC', type: 'image/heif' }, bytes).mimeMatches).toBe(true);
  });
});

describe('parseJpegStructure', () => {
  it('extracts marker, frame, subsampling, and quantization evidence', () => {
    const parsed = parseJpegStructure(jpegBytes);
    expect(parsed).toBeDefined();
    expect(parsed?.width).toBe(32);
    expect(parsed?.height).toBe(16);
    expect(parsed?.chromaSubsampling).toBe('4:2:0');
    expect(parsed?.quantizationTables).toHaveLength(1);
    expect(parsed?.quantizationTables[0].values).toHaveLength(64);
    expect(parsed?.segments.some((segment) => segment.identifier === 'JFIF')).toBe(true);
    expect(parsed?.segments.find((segment) => segment.marker === 'FFDA')?.length).toBe(14);
  });

  it('stops safely on truncated marker and quantization data', () => {
    const malformed = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xdb, 0x00, 0x84, 0x10, 0x00, 0x01,
      0xff,
    ]);
    const parsed = parseJpegStructure(malformed);
    expect(parsed).toBeDefined();
    expect(parsed?.quantizationTables).toHaveLength(0);
    expect(parsed?.segments[0].marker).toBe('FFD8');
  });

  it('continues through entropy-coded scans to later markers and EOI', () => {
    const multiScan = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xda, 0x00, 0x02,
      0x01, 0xff, 0x00, 0x02, 0xff, 0xd0, 0x03,
      0xff, 0xc4, 0x00, 0x02,
      0xff, 0xda, 0x00, 0x02,
      0x04, 0xff, 0x00, 0x05,
      0xff, 0xd9,
    ]);
    const parsed = parseJpegStructure(multiScan);
    expect(parsed?.segments.filter((segment) => segment.marker === 'FFDA')).toHaveLength(2);
    expect(parsed?.segments.some((segment) => segment.marker === 'FFC4')).toBe(true);
    expect(parsed?.segments.at(-1)?.marker).toBe('FFD9');
  });

  it('rejects reserved DQT precision codes instead of treating them as 16-bit tables', () => {
    const malformedDqt = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xdb, 0x00, 0x43, 0x20, ...Array(64).fill(1),
      0xff, 0xd9,
    ]);

    expect(parseJpegStructure(malformedDqt)?.quantizationTables).toEqual([]);
  });

  it('counts bytes after the first parsed EOI even if trailing data contains another EOI pattern', () => {
    const trailing = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x01, 0xff, 0xd9]);
    const parsed = parseJpegStructure(trailing);

    expect(parsed?.trailingBytes).toBe(3);
    expect(parsed?.segments.filter((segment) => segment.marker === 'FFD9')).toHaveLength(1);

    const fillBeforeEoi = parseJpegStructure(new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xd9, 0x01]));
    expect(fillBeforeEoi?.trailingBytes).toBe(1);
  });

  it('does not relabel an unsupported sampling layout as 4:4:4', () => {
    const uncommonSampling = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03,
      0x01, 0x31, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xff, 0xd9,
    ]);

    expect(parseJpegStructure(uncommonSampling)?.chromaSubsampling).toBeUndefined();
  });

  it('caps attacker-controlled segment output before Worker transfer', () => {
    const bytes = new Uint8Array(2 + JPEG_SEGMENT_LIMIT * 4);
    bytes.set([0xff, 0xd8]);
    for (let offset = 2; offset < bytes.length; offset += 4) {
      bytes.set([0xff, 0xe0, 0x00, 0x02], offset);
    }

    const parsed = parseJpegStructure(bytes);

    expect(parsed?.segments).toHaveLength(JPEG_SEGMENT_LIMIT);
    expect(parsed?.segmentsTruncated).toBe(true);
  });
});

describe('collectMetadataInventory', () => {
  it('deduplicates software evidence and recognizes Photoshop resources', () => {
    const inventory = collectMetadataInventory(
      { Software: 'Adobe Photoshop', CreatorTool: 'Adobe Photoshop', ISO: 100 },
      { progressive: false, trailingBytes: 0, quantizationTables: [], segments: [{ marker: 'FFED', name: 'APP13', offset: 2, length: 10, identifier: 'Photoshop 3.0' }] },
      false,
    );
    expect(inventory.editingSoftware).toEqual(['Adobe Photoshop', 'Adobe Photoshop resource block']);
    expect(inventory.exif).toBeGreaterThan(0);
  });

  it('does not treat an IPTC schema version as editing software', () => {
    const inventory = collectMetadataInventory({ ApplicationRecordVersion: 4 }, undefined, false);
    expect(inventory.editingSoftware).toEqual([]);
  });

  it('uses parser namespace boundaries when they are available', () => {
    const normalized = normalizeStructuredMetadata({
      ifd0: { Make: 'SONY', Model: 'ILCE-7M4' },
      exif: { ISO: 100, FNumber: 2.8 },
      gps: { GPSLatitude: 37.5, GPSLongitude: 127 },
      iptc: { ApplicationRecordVersion: 4 },
      xmp: { CreatorTool: 'Example Editor', DocumentID: 'xmp.did:1' },
      icc: { ProfileDescription: 'Display P3' },
    });
    const inventory = collectMetadataInventory(normalized.flatTags, undefined, false, normalized.namespaceCounts);
    expect(inventory).toMatchObject({ exif: 6, iptc: 1, xmp: 2, icc: 1 });
    expect(normalized.flatTags.Make).toBe('SONY');
  });
});

describe('analyzeFileOrigin', () => {
  it('assembles signature, structure, metadata, provenance, hash, and findings into one report', async () => {
    const file = new File([jpegBytes], 'evidence.jpg', { type: 'image/jpeg' });

    const report = await analyzeFileOrigin(
      file,
      jpegBytes.slice().buffer as ArrayBuffer,
      { Make: 'SONY', Model: 'ILCE-7M4', ISO: 100, Software: 'Example Editor' },
      true,
    );

    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.fileType).toMatchObject({
      actualMime: 'image/jpeg',
      formatName: 'JPEG',
      extensionMatches: true,
      mimeMatches: true,
    });
    expect(report.metadata).toMatchObject({
      exif: 4,
      editingSoftware: ['Example Editor'],
      hasEmbeddedThumbnail: true,
    });
    expect(report.jpeg).toMatchObject({ width: 32, height: 16, chromaSubsampling: '4:2:0' });
    expect(report.c2pa.state).toBe('absent');
    expect(report.aigc.state).toBe('absent');
    expect(report.findings.map((finding) => finding.id)).toEqual([
      'file-identity',
      'metadata-inventory',
      'editing-software',
      'jpeg-structure',
      'c2pa',
    ]);
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  });

  it('promotes a valid GB 45438 AIGC declaration into provenance findings', async () => {
    const file = new File([jpegBytes], 'declared.jpg', { type: 'image/jpeg' });
    const encoded = JSON.stringify({
      Label: '1',
      ContentProducer: '001191330106MA2CFLDG4R10001',
      ProduceID: 'produce-1',
      ReservedCode1: 'K-proof',
      ContentPropagator: '001191330106MA2CFLDG4R10001',
      PropagateID: 'produce-1',
      ReservedCode2: 'K-proof',
    }).replace(/"/g, '&quot;');

    const report = await analyzeFileOrigin(file, jpegBytes.slice().buffer as ArrayBuffer, { AIGC: { AIGC: encoded } }, false);

    expect(report.aigc).toMatchObject({
      state: 'declared',
      declaration: 'generated',
      provider: { id: 'provider.cn.tongyi-yunqi' },
    });
    expect(report.findings.some((finding) => finding.id === 'aigc-provenance')).toBe(true);
  });
});
