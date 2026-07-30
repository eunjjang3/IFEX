import { securityConfig } from './securityConfig';

export interface SearchCopyResult {
  blob: Blob;
  url: string;
  sizeBytes: number;
  fileName: string;
}

export function createSearchCopy(image: HTMLImageElement, source: File): Promise<SearchCopyResult> {
  return new Promise((resolve, reject) => {
    const maxDimension = securityConfig.maxSearchCopyDimension;
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('Canvas context is unavailable'));
      return;
    }
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Search copy encoding failed'));
        return;
      }
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        sizeBytes: blob.size,
        fileName: `${source.name.replace(/\.[^/.]+$/, '')}_search-copy.jpg`,
      });
    }, 'image/jpeg', securityConfig.searchCopyJpegQualityPercent / 100);
  });
}
