import type { ImageClassification } from '../utils/imageClassifier';
import type { ResolutionAnalysis, JpegQualityAnalysis } from '../utils/sensorQuality';
import type { FileOriginReport } from './forensics';
import type { AiGenerationMetadata } from './aiMetadata';

export interface LeakageFinding {
  id: string;
  category: 'location' | 'hardware' | 'identity' | 'timestamp' | 'software';
  title: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
  detected: boolean;
  value?: string;
}

export interface LeakageReport {
  detectedCount: number;
  findings: LeakageFinding[];
  summary: string;
}

export interface CameraDetails {
  make?: string;
  model?: string;
  serialNumber?: string;
  firmware?: string;
  lensMake?: string;
  lensModel?: string;
  lensSerialNumber?: string;
  lensSpecification?: string;
  focalLength?: number;
  focalLengthIn35mm?: number;
  maxAperture?: number;
}

export interface ShootingParams {
  fNumber?: number;
  exposureTime?: number;
  exposureTimeString?: string;
  iso?: number;
  exposureBias?: number; // EV
  meteringMode?: string;
  flash?: string;
  flashMode?: number;
  whiteBalance?: string;
  colorTemperature?: number;
  exposureProgram?: string;
  focusDistance?: number;
  digitalZoomRatio?: number;
  sceneCaptureType?: string;
  sensingMethod?: string;
}

export interface LocationData {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  latitudeRef?: string;
  longitudeRef?: string;
  heading?: number;
  speed?: number;
  timestamp?: string;
  address?: string;
}

export interface FileMetrics {
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  mimeType: string;
  width?: number;
  height?: number;
  megapixels?: string;
  aspectRatio?: string;
  colorSpace?: string;
  bitDepth?: number;
  orientation?: number;
  createDate?: Date;
  modifyDate?: Date;
  offsetTime?: string;
}

export interface AdvancedData {
  iptc?: {
    byline?: string;
    copyright?: string;
    caption?: string;
    keywords?: string[];
    credit?: string;
    source?: string;
    objectName?: string;
  };
  xmp?: {
    creatorTool?: string;
    rating?: number;
    subjectDistance?: number;
    history?: string[];
    rawXmpString?: string;
  };
  iccProfile?: {
    profileName?: string;
    colorSpace?: string;
    pcs?: string;
    deviceClass?: string;
  };
  embeddedThumbnailUrl?: string;
}

export interface ColorPaletteItem {
  hex: string;
  rgb: [number, number, number];
  percentage: number;
}

export interface MetadataLimitStatus {
  truncated: boolean;
  originalTagCount: number;
  retainedTagCount: number;
  omittedTagCount: number;
  truncatedValueCount: number;
  summarizedBinaryValueCount: number;
}

export interface HistogramData {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
}

export interface ParsedPhotoData {
  id: string;
  file: File;
  previewUrl?: string;
  fileMetrics: FileMetrics;
  camera: CameraDetails;
  shooting: ShootingParams;
  location: LocationData;
  advanced: AdvancedData;
  leakage: LeakageReport;
  rawTags: Record<string, any>;
  metadataLimit: MetadataLimitStatus;
  histogram?: HistogramData;
  palette?: ColorPaletteItem[];
  resolutionAnalysis?: ResolutionAnalysis;
  jpegQuality?: JpegQualityAnalysis;
  classification?: ImageClassification;
  fileOrigin: FileOriginReport;
  aiGeneration?: AiGenerationMetadata;
}
