import { detectFileTypeFromFile, extensionOf } from './fileSignature';
import { securityConfig } from './securityConfig';

const SUPPORTED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'png', 'webp', 'avif', 'heic', 'heif',
  'tif', 'tiff', 'dng', 'cr2', 'nef', 'raw',
]);

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'image/tiff', 'image/x-canon-cr2', 'image/x-nikon-nef', 'image/x-adobe-dng',
]);

export type FileRejectionCode =
  | 'empty'
  | 'too-large'
  | 'unsupported'
  | 'invalid-signature'
  | 'type-mismatch'
  | 'duplicate'
  | 'active-limit'
  | 'active-bytes';

export interface FileRejection {
  file: File;
  code: FileRejectionCode;
  reason: string;
}

export interface FileIntakeOptions {
  existingKeys?: ReadonlySet<string>;
  activeFileCount?: number;
  activeBytes?: number;
  maxFileBytes?: number;
  maxFiles?: number;
  maxActiveBytes?: number;
  strictFileTypes?: boolean;
}

export interface FileIntakeResult {
  accepted: File[];
  rejected: FileRejection[];
}

export function fileIdentity(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name.trim().toLowerCase()}\u0000${file.size}\u0000${file.lastModified}`;
}

export async function validateImageFiles(files: readonly File[], options: FileIntakeOptions = {}): Promise<FileIntakeResult> {
  const maxFileBytes = options.maxFileBytes ?? securityConfig.maxFileBytes;
  const maxFiles = options.maxFiles ?? securityConfig.maxActiveFiles;
  const maxActiveBytes = options.maxActiveBytes ?? securityConfig.maxActiveBytes;
  const strictFileTypes = options.strictFileTypes ?? securityConfig.strictFileTypes;
  const seen = new Set(options.existingKeys ?? []);
  let activeCount = options.activeFileCount ?? seen.size;
  let activeBytes = options.activeBytes ?? 0;
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];

  for (const file of files) {
    const extension = extensionOf(file.name);
    const mimeType = file.type.trim().toLowerCase();
    const key = fileIdentity(file);

    if (file.size === 0) {
      rejected.push({ file, code: 'empty', reason: 'The file is empty.' });
      continue;
    }
    if (file.size > maxFileBytes) {
      rejected.push({ file, code: 'too-large', reason: `File exceeds ${Math.round(maxFileBytes / 1024 / 1024)} MiB limit.` });
      continue;
    }
    if (!SUPPORTED_EXTENSIONS.has(extension) && !SUPPORTED_MIME_TYPES.has(mimeType)) {
      rejected.push({ file, code: 'unsupported', reason: 'Unsupported image format.' });
      continue;
    }
    if (seen.has(key)) {
      rejected.push({ file, code: 'duplicate', reason: 'File already added.' });
      continue;
    }
    if (activeCount >= maxFiles) {
      rejected.push({ file, code: 'active-limit', reason: `Maximum ${maxFiles} files allowed at once.` });
      continue;
    }
    if (activeBytes + file.size > maxActiveBytes) {
      rejected.push({ file, code: 'active-bytes', reason: `Total limit of ${Math.round(maxActiveBytes / 1024 / 1024)} MiB reached.` });
      continue;
    }

    if (strictFileTypes) {
      let detected;
      try {
        detected = await detectFileTypeFromFile(file);
      } catch {
        rejected.push({ file, code: 'invalid-signature', reason: 'File header could not be read.' });
        continue;
      }
      if (detected.actualMime === 'application/octet-stream') {
        rejected.push({ file, code: 'invalid-signature', reason: 'Invalid image signature.' });
        continue;
      }
      if (!detected.extensionMatches || !detected.mimeMatches) {
        rejected.push({ file, code: 'type-mismatch', reason: `File signature mismatch (${detected.formatName}).` });
        continue;
      }
    }

    seen.add(key);
    activeCount += 1;
    activeBytes += file.size;
    accepted.push(file);
  }

  return { accepted, rejected };
}
