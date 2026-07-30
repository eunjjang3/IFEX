import type { DetectedFileType } from '../types/forensics';

export const SIGNATURE_PREFIX_BYTES = 4_100;

const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif', 'heic'],
  'image/avif': ['avif'],
  'image/tiff': ['tif', 'tiff', 'dng', 'nef'],
  'image/x-canon-cr2': ['cr2'],
};

const EXTERNAL_FILE_TYPES: Record<string, { mime: string; name: string }> = {
  jpg: { mime: 'image/jpeg', name: 'JPEG' },
  png: { mime: 'image/png', name: 'PNG' },
  webp: { mime: 'image/webp', name: 'WebP' },
  avif: { mime: 'image/avif', name: 'AVIF' },
  heic: { mime: 'image/heif', name: 'HEIF/HEIC' },
  tif: { mime: 'image/tiff', name: 'TIFF-based image' },
  dng: { mime: 'image/tiff', name: 'DNG' },
  nef: { mime: 'image/tiff', name: 'Nikon NEF' },
  cr2: { mime: 'image/x-canon-cr2', name: 'Canon CR2' },
};

const latin1 = new TextDecoder('latin1');

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return latin1.decode(bytes.subarray(offset, offset + length))
    .replaceAll('\x00', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .trim();
}

function detectIsoBmff(bytes: Uint8Array): { mime: string; name: string } | null {
  if (bytes.length < 12 || readAscii(bytes, 4, 4) !== 'ftyp') return null;
  const brand = readAscii(bytes, 8, 4).toLowerCase();
  if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return { mime: 'image/heic', name: 'HEIC' };
  if (['mif1', 'msf1'].includes(brand)) return { mime: 'image/heif', name: 'HEIF' };
  if (['avif', 'avis'].includes(brand)) return { mime: 'image/avif', name: 'AVIF' };
  return null;
}

export function extensionOf(fileName: string): string {
  const separator = fileName.lastIndexOf('.');
  return separator >= 0 ? fileName.slice(separator + 1).toLowerCase() : '';
}

function detectionReport(
  file: Pick<File, 'name' | 'type'>,
  bytes: Uint8Array,
  actualMime: string,
  formatName: string,
): DetectedFileType {
  const extension = extensionOf(file.name);
  const allowedExtensions = MIME_EXTENSIONS[actualMime] ?? [];
  const declaredMime = (file.type || '').toLowerCase() || 'not declared';
  const known = actualMime !== 'application/octet-stream';

  return {
    actualMime,
    formatName,
    extension,
    declaredMime,
    extensionMatches: known && allowedExtensions.includes(extension),
    mimeMatches: known && (
      declaredMime === 'not declared'
      || declaredMime === actualMime
      || (['image/heic', 'image/heif'].includes(actualMime) && ['image/heic', 'image/heif'].includes(declaredMime))
      || (actualMime === 'image/tiff' && ['image/tiff', 'image/x-nikon-nef', 'image/x-adobe-dng'].includes(declaredMime))
    ),
    signatureHex: Array.from(bytes.subarray(0, 16)).map((byte) => byte.toString(16).padStart(2, '0')).join(' '),
  };
}

export function detectFileType(file: Pick<File, 'name' | 'type'>, bytes: Uint8Array): DetectedFileType {
  let actualMime = 'application/octet-stream';
  let formatName = 'Unknown binary';

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    actualMime = 'image/jpeg'; formatName = 'JPEG';
  } else if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    actualMime = 'image/png'; formatName = 'PNG';
  } else if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    actualMime = 'image/webp'; formatName = 'WebP';
  } else if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    actualMime = startsWith(bytes, [0x49, 0x49, 0x2a, 0x00, 0x10, 0x00, 0x00, 0x00, 0x43, 0x52]) ? 'image/x-canon-cr2' : 'image/tiff';
    formatName = actualMime === 'image/x-canon-cr2' ? 'Canon CR2' : 'TIFF-based image';
  } else {
    const isoType = detectIsoBmff(bytes);
    if (isoType) {
      actualMime = isoType.mime;
      formatName = isoType.name;
    }
  }

  return detectionReport(file, bytes, actualMime, formatName);
}

export async function detectFileTypeFromBytes(
  file: Pick<File, 'name' | 'type'>,
  bytes: Uint8Array,
): Promise<DetectedFileType> {
  const prefix = bytes.subarray(0, SIGNATURE_PREFIX_BYTES);
  const fallback = detectFileType(file, prefix);

  try {
    const { fileTypeFromBuffer } = await import('file-type');
    const external = await fileTypeFromBuffer(prefix);
    if (!external) return fallback;

    const supported = EXTERNAL_FILE_TYPES[external.ext];
    return supported
      ? detectionReport(file, prefix, supported.mime, supported.name)
      : detectionReport(file, prefix, 'application/octet-stream', 'Unknown binary');
  } catch {
    return fallback;
  }
}

export async function detectFileTypeFromFile(file: File): Promise<DetectedFileType> {
  const prefix = new Uint8Array(await file.slice(0, SIGNATURE_PREFIX_BYTES).arrayBuffer());
  return detectFileTypeFromBytes(file, prefix);
}
