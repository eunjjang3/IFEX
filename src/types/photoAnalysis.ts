import type { FileOriginReport } from './forensics';
import type { ColorPaletteItem, HistogramData, MetadataLimitStatus } from './exif';
import type { JpegQualityAnalysis } from '../utils/sensorQuality';

export interface PhotoAnalysisLimits {
  maxImageMegapixels: number;
  maxPreviewDimension: number;
  statisticsSampleDimension: number;
  maxEmbeddedThumbnailDimension: number;
  maxMetadataTags: number;
  maxMetadataValueChars: number;
  maxMetadataTotalChars: number;
}

export interface PhotoAnalysisWorkerRequest {
  requestId: string;
  file: File;
  limits: PhotoAnalysisLimits;
}

export interface PhotoAnalysisWorkerResponse {
  requestId: string;
  ok: boolean;
  error?: string;
  rawTags?: Record<string, unknown>;
  metadataLimit?: MetadataLimitStatus;
  previewBlob?: Blob;
  embeddedThumbnailBlob?: Blob;
  width?: number;
  height?: number;
  histogram?: HistogramData;
  palette?: ColorPaletteItem[];
  fileOrigin?: FileOriginReport;
  jpegQuality?: JpegQualityAnalysis;
}
