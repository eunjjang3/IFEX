import type { ParsedPhotoData } from '../types/exif';

function revokeObjectUrl(url: string | undefined) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Revocation is best-effort and should never break navigation or cleanup.
  }
}

export function disposeParsedPhoto(photo: ParsedPhotoData) {
  const urls = new Set([photo.previewUrl, photo.advanced.embeddedThumbnailUrl].filter((value): value is string => Boolean(value)));
  urls.forEach(revokeObjectUrl);
}

export function disposeParsedPhotos(photos: readonly ParsedPhotoData[]) {
  photos.forEach(disposeParsedPhoto);
}
