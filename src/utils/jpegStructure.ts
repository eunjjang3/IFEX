import type { JpegQuantizationTable, JpegSegment, JpegStructure } from '../types/forensics';

const JPEG_MARKERS: Record<number, string> = {
  0xc0: 'Baseline DCT', 0xc1: 'Extended sequential DCT', 0xc2: 'Progressive DCT',
  0xc4: 'Huffman table', 0xd8: 'Start of image', 0xd9: 'End of image',
  0xda: 'Start of scan', 0xdb: 'Quantization table', 0xdd: 'Restart interval',
  0xe0: 'APP0', 0xe1: 'APP1', 0xe2: 'APP2', 0xeb: 'APP11', 0xed: 'APP13', 0xee: 'APP14',
  0xfe: 'Comment',
};

const asciiDecoder = new TextDecoder('latin1');
export const JPEG_SEGMENT_LIMIT = 4_096;
const JPEG_QUANTIZATION_TABLE_LIMIT = 16;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return asciiDecoder.decode(bytes.subarray(offset, offset + length))
    .replaceAll('\x00', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .trim();
}

function segmentIdentifier(bytes: Uint8Array, dataOffset: number, dataLength: number): string | undefined {
  const value = readAscii(bytes, dataOffset, Math.min(dataLength, 40));
  if (value.startsWith('JFIF')) return 'JFIF';
  if (value.startsWith('Exif')) return 'EXIF';
  if (value.startsWith('ICC_PROFILE')) return 'ICC_PROFILE';
  if (value.startsWith('Photoshop 3.0')) return 'Photoshop 3.0';
  if (value.includes('xap/1.0') || value.includes('xmp')) return 'XMP';
  if (value.includes('JUMBF') || value.includes('c2pa')) return 'C2PA / JUMBF';
  return value.slice(0, 24) || undefined;
}

function parseDqt(bytes: Uint8Array, offset: number, length: number, maximumTables: number): JpegQuantizationTable[] {
  const tables: JpegQuantizationTable[] = [];
  let cursor = offset;
  const end = offset + length;
  if (offset < 0 || length < 1 || end > bytes.length) return tables;

  while (cursor < end && tables.length < maximumTables) {
    const descriptor = bytes[cursor++];
    const precisionCode = descriptor >> 4;
    if (precisionCode !== 0 && precisionCode !== 1) return tables;
    const precision = precisionCode === 0 ? 8 : 16;
    const id = descriptor & 0x0f;
    const bytesPerValue = precision === 8 ? 1 : 2;
    if (cursor + 64 * bytesPerValue > end) return tables;

    const values: number[] = [];
    for (let index = 0; index < 64; index += 1) {
      if (precision === 8) values.push(bytes[cursor++]);
      else {
        values.push((bytes[cursor] << 8) | bytes[cursor + 1]);
        cursor += 2;
      }
    }
    tables.push({ id, precision, values });
  }
  return tables;
}

function chromaSubsamplingFromFrame(bytes: Uint8Array, dataOffset: number, dataLength: number): string | undefined {
  const components = bytes[dataOffset + 5];
  if (components === 1) return 'Grayscale';
  if (components !== 3 || dataLength < 6 + components * 3) return undefined;

  const samplingFactors = Array.from({ length: components }, (_, index) => {
    const sampling = bytes[dataOffset + 7 + index * 3];
    return { horizontal: sampling >> 4, vertical: sampling & 0x0f };
  });
  const [luma, ...chroma] = samplingFactors;
  if (!luma || luma.horizontal < 1 || luma.vertical < 1) return undefined;
  if (!chroma.every((factor) => factor.horizontal === 1 && factor.vertical === 1)) return undefined;

  const key = `${luma.horizontal}x${luma.vertical}`;
  return new Map([
    ['1x1', '4:4:4'],
    ['1x2', '4:4:0'],
    ['2x1', '4:2:2'],
    ['2x2', '4:2:0'],
    ['4x1', '4:1:1'],
    ['4x2', '4:1:0'],
  ]).get(key);
}

export function parseJpegStructure(bytes: Uint8Array): JpegStructure | undefined {
  if (!startsWith(bytes, [0xff, 0xd8])) return undefined;
  const segments: JpegSegment[] = [{ marker: 'FFD8', name: 'Start of image', offset: 0, length: 2 }];
  const quantizationTables: JpegQuantizationTable[] = [];
  let cursor = 2;
  let progressive = false;
  let precision: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let components: number | undefined;
  let chromaSubsampling: string | undefined;
  let eoiEndOffset: number | undefined;
  let segmentsTruncated = false;

  while (cursor < bytes.length) {
    if (segments.length >= JPEG_SEGMENT_LIMIT) {
      segmentsTruncated = true;
      break;
    }
    if (bytes[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    const markerOffset = cursor;
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) break;

    const marker = bytes[cursor++];
    if (marker === 0x00) continue;
    if (marker === 0xd9) {
      segments.push({ marker: 'FFD9', name: 'End of image', offset: markerOffset, length: cursor - markerOffset });
      eoiEndOffset = cursor;
      break;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= bytes.length) break;

    const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (segmentLength < 2 || cursor + segmentLength > bytes.length) break;
    const dataOffset = cursor + 2;
    const dataLength = segmentLength - 2;
    segments.push({
      marker: `FF${marker.toString(16).toUpperCase().padStart(2, '0')}`,
      name: JPEG_MARKERS[marker] || (marker >= 0xe0 && marker <= 0xef ? `APP${marker - 0xe0}` : 'JPEG segment'),
      offset: markerOffset,
      length: segmentLength + (cursor - markerOffset),
      identifier: marker >= 0xe0 && marker <= 0xef ? segmentIdentifier(bytes, dataOffset, dataLength) : undefined,
    });

    if (marker === 0xdb && quantizationTables.length < JPEG_QUANTIZATION_TABLE_LIMIT) {
      quantizationTables.push(...parseDqt(
        bytes,
        dataOffset,
        dataLength,
        JPEG_QUANTIZATION_TABLE_LIMIT - quantizationTables.length,
      ));
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker) && dataLength >= 6) {
      progressive = marker === 0xc2;
      precision = bytes[dataOffset];
      height = (bytes[dataOffset + 1] << 8) | bytes[dataOffset + 2];
      width = (bytes[dataOffset + 3] << 8) | bytes[dataOffset + 4];
      components = bytes[dataOffset + 5];
      chromaSubsampling = chromaSubsamplingFromFrame(bytes, dataOffset, dataLength);
    }
    cursor += segmentLength;
  }

  const trailingBytes = eoiEndOffset === undefined ? 0 : bytes.length - eoiEndOffset;
  return { progressive, precision, width, height, components, chromaSubsampling, trailingBytes, segments, quantizationTables, segmentsTruncated };
}

export function firstLuminance8BitQuantizationTable(structure: JpegStructure | undefined): number[] | undefined {
  return structure?.quantizationTables.find((table) => table.id === 0 && table.precision === 8)?.values;
}
