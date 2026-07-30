import { JPEG_SEGMENT_LIMIT, parseJpegStructure } from './jpegStructure';

export interface EncodedImageDimensions {
  width: number;
  height: number;
}

function validDimensions(width: number, height: number): EncodedImageDimensions | undefined {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function pngDimensions(bytes: Uint8Array): EncodedImageDimensions | undefined {
  if (bytes.length < 24 || !startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return undefined;
  if (!startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return validDimensions(view.getUint32(16), view.getUint32(20));
}

function webpDimensions(bytes: Uint8Array): EncodedImageDimensions | undefined {
  if (bytes.length < 30 || !startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) || !startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return undefined;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return validDimensions(width, height);
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return validDimensions(width, height);
  }
  if (chunk === 'VP8 ' && startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return validDimensions(width, height);
  }
  return undefined;
}

export function encodedImageDimensions(bytes: Uint8Array): EncodedImageDimensions | undefined {
  if (startsWith(bytes, [0xff, 0xd8])) {
    const jpeg = parseJpegStructure(bytes);
    if (jpeg?.segmentsTruncated) {
      throw new Error(`JPEG structure exceeds the ${JPEG_SEGMENT_LIMIT} segment safety limit.`);
    }
    return jpeg?.width !== undefined && jpeg.height !== undefined
      ? validDimensions(jpeg.width, jpeg.height)
      : undefined;
  }
  return pngDimensions(bytes) ?? webpDimensions(bytes);
}
