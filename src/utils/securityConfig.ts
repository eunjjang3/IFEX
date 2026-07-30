const MIB = 1024 * 1024;

export interface SecurityConfig {
  strictFileTypes: boolean;
  maxFileBytes: number;
  maxActiveFiles: number;
  maxActiveBytes: number;
  maxImageMegapixels: number;
  maxPreviewDimension: number;
  statisticsSampleDimension: number;
  maxEmbeddedThumbnailDimension: number;
  maxPixelDimension: number;
  maxSearchCopyDimension: number;
  searchCopyJpegQualityPercent: number;
  parseConcurrency: number;
  parseTimeoutMs: number;
  pixelTimeoutMs: number;
  maxMetadataTags: number;
  maxMetadataValueChars: number;
  maxMetadataTotalChars: number;
  allowUnsafePreview: boolean;
}

export type SecurityEnvironment = Record<string, unknown>;

export const DEFAULT_SECURITY_CONFIG: Readonly<SecurityConfig> = Object.freeze({
  strictFileTypes: true,
  maxFileBytes: 25 * MIB,
  maxActiveFiles: 4,
  maxActiveBytes: 64 * MIB,
  maxImageMegapixels: 40,
  maxPreviewDimension: 2048,
  statisticsSampleDimension: 400,
  maxEmbeddedThumbnailDimension: 1024,
  maxPixelDimension: 2048,
  maxSearchCopyDimension: 1600,
  searchCopyJpegQualityPercent: 90,
  parseConcurrency: 1,
  parseTimeoutMs: 15_000,
  pixelTimeoutMs: 20_000,
  maxMetadataTags: 2_000,
  maxMetadataValueChars: 16_384,
  maxMetadataTotalChars: 1_048_576,
  allowUnsafePreview: false,
});

interface NumericSetting {
  runtimeName: string;
  buildName: string;
  key: keyof SecurityConfig;
  defaultValue: number;
  minimum: number;
  maximum: number;
  multiplier?: number;
}

const NUMERIC_SETTINGS: NumericSetting[] = [
  { runtimeName: 'IFEX_MAX_FILE_MIB', buildName: 'VITE_IFEX_MAX_FILE_MIB', key: 'maxFileBytes', defaultValue: 25, minimum: 1, maximum: 512, multiplier: MIB },
  { runtimeName: 'IFEX_MAX_ACTIVE_FILES', buildName: 'VITE_IFEX_MAX_ACTIVE_FILES', key: 'maxActiveFiles', defaultValue: 4, minimum: 1, maximum: 50 },
  { runtimeName: 'IFEX_MAX_ACTIVE_MIB', buildName: 'VITE_IFEX_MAX_ACTIVE_MIB', key: 'maxActiveBytes', defaultValue: 64, minimum: 1, maximum: 2048, multiplier: MIB },
  { runtimeName: 'IFEX_MAX_IMAGE_MEGAPIXELS', buildName: 'VITE_IFEX_MAX_IMAGE_MEGAPIXELS', key: 'maxImageMegapixels', defaultValue: 40, minimum: 1, maximum: 200 },
  { runtimeName: 'IFEX_MAX_PREVIEW_DIMENSION', buildName: 'VITE_IFEX_MAX_PREVIEW_DIMENSION', key: 'maxPreviewDimension', defaultValue: 2048, minimum: 256, maximum: 8192 },
  { runtimeName: 'IFEX_STATISTICS_SAMPLE_DIMENSION', buildName: 'VITE_IFEX_STATISTICS_SAMPLE_DIMENSION', key: 'statisticsSampleDimension', defaultValue: 400, minimum: 64, maximum: 1024 },
  { runtimeName: 'IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION', buildName: 'VITE_IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION', key: 'maxEmbeddedThumbnailDimension', defaultValue: 1024, minimum: 128, maximum: 4096 },
  { runtimeName: 'IFEX_MAX_PIXEL_DIMENSION', buildName: 'VITE_IFEX_MAX_PIXEL_DIMENSION', key: 'maxPixelDimension', defaultValue: 2048, minimum: 256, maximum: 4096 },
  { runtimeName: 'IFEX_MAX_SEARCH_COPY_DIMENSION', buildName: 'VITE_IFEX_MAX_SEARCH_COPY_DIMENSION', key: 'maxSearchCopyDimension', defaultValue: 1600, minimum: 256, maximum: 4096 },
  { runtimeName: 'IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT', buildName: 'VITE_IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT', key: 'searchCopyJpegQualityPercent', defaultValue: 90, minimum: 50, maximum: 100 },
  { runtimeName: 'IFEX_PARSE_CONCURRENCY', buildName: 'VITE_IFEX_PARSE_CONCURRENCY', key: 'parseConcurrency', defaultValue: 1, minimum: 1, maximum: 4 },
  { runtimeName: 'IFEX_PARSE_TIMEOUT_MS', buildName: 'VITE_IFEX_PARSE_TIMEOUT_MS', key: 'parseTimeoutMs', defaultValue: 15_000, minimum: 1_000, maximum: 120_000 },
  { runtimeName: 'IFEX_PIXEL_TIMEOUT_MS', buildName: 'VITE_IFEX_PIXEL_TIMEOUT_MS', key: 'pixelTimeoutMs', defaultValue: 20_000, minimum: 1_000, maximum: 120_000 },
  { runtimeName: 'IFEX_MAX_METADATA_TAGS', buildName: 'VITE_IFEX_MAX_METADATA_TAGS', key: 'maxMetadataTags', defaultValue: 2_000, minimum: 100, maximum: 10_000 },
  { runtimeName: 'IFEX_MAX_METADATA_VALUE_CHARS', buildName: 'VITE_IFEX_MAX_METADATA_VALUE_CHARS', key: 'maxMetadataValueChars', defaultValue: 16_384, minimum: 256, maximum: 1_048_576 },
  { runtimeName: 'IFEX_MAX_METADATA_TOTAL_CHARS', buildName: 'VITE_IFEX_MAX_METADATA_TOTAL_CHARS', key: 'maxMetadataTotalChars', defaultValue: 1_048_576, minimum: 65_536, maximum: 16_777_216 },
];

interface BooleanSetting {
  runtimeName: string;
  buildName: string;
  key: 'strictFileTypes' | 'allowUnsafePreview';
  defaultValue: boolean;
}

const BOOLEAN_SETTINGS: BooleanSetting[] = [
  { runtimeName: 'IFEX_STRICT_FILE_TYPES', buildName: 'VITE_IFEX_STRICT_FILE_TYPES', key: 'strictFileTypes', defaultValue: true },
  { runtimeName: 'IFEX_ALLOW_UNSAFE_PREVIEW', buildName: 'VITE_IFEX_ALLOW_UNSAFE_PREVIEW', key: 'allowUnsafePreview', defaultValue: false },
];

function selectedValue(runtime: SecurityEnvironment, build: SecurityEnvironment, runtimeName: string, buildName: string): unknown {
  return runtime[runtimeName] ?? build[buildName];
}

function parseInteger(value: unknown, setting: NumericSetting, warn: (message: string) => void): number {
  if (value === undefined || value === null || value === '') return setting.defaultValue * (setting.multiplier ?? 1);
  const normalized = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(normalized) || normalized < setting.minimum || normalized > setting.maximum) {
    warn(`${setting.runtimeName} must be an integer from ${setting.minimum} to ${setting.maximum}; using ${setting.defaultValue}.`);
    return setting.defaultValue * (setting.multiplier ?? 1);
  }
  return normalized * (setting.multiplier ?? 1);
}

function parseBoolean(value: unknown, setting: BooleanSetting, warn: (message: string) => void): boolean {
  if (value === undefined || value === null || value === '') return setting.defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  warn(`${setting.runtimeName} must be true or false; using ${setting.defaultValue}.`);
  return setting.defaultValue;
}

export function parseSecurityConfig(
  runtime: SecurityEnvironment = {},
  build: SecurityEnvironment = {},
  warn: (message: string) => void = () => undefined,
): SecurityConfig {
  const parsed: SecurityConfig = { ...DEFAULT_SECURITY_CONFIG };
  for (const setting of NUMERIC_SETTINGS) {
    const value = selectedValue(runtime, build, setting.runtimeName, setting.buildName);
    (parsed[setting.key] as number) = parseInteger(value, setting, warn);
  }
  for (const setting of BOOLEAN_SETTINGS) {
    parsed[setting.key] = parseBoolean(selectedValue(runtime, build, setting.runtimeName, setting.buildName), setting, warn);
  }
  return Object.freeze(parsed);
}

declare global {
  interface Window {
    __IFEX_CONFIG__?: SecurityEnvironment;
  }
}

const runtimeEnvironment = typeof window === 'undefined' ? {} : window.__IFEX_CONFIG__ ?? {};
const buildEnvironment: SecurityEnvironment = {
  VITE_IFEX_STRICT_FILE_TYPES: import.meta.env.VITE_IFEX_STRICT_FILE_TYPES,
  VITE_IFEX_MAX_FILE_MIB: import.meta.env.VITE_IFEX_MAX_FILE_MIB,
  VITE_IFEX_MAX_ACTIVE_FILES: import.meta.env.VITE_IFEX_MAX_ACTIVE_FILES,
  VITE_IFEX_MAX_ACTIVE_MIB: import.meta.env.VITE_IFEX_MAX_ACTIVE_MIB,
  VITE_IFEX_MAX_IMAGE_MEGAPIXELS: import.meta.env.VITE_IFEX_MAX_IMAGE_MEGAPIXELS,
  VITE_IFEX_MAX_PREVIEW_DIMENSION: import.meta.env.VITE_IFEX_MAX_PREVIEW_DIMENSION,
  VITE_IFEX_STATISTICS_SAMPLE_DIMENSION: import.meta.env.VITE_IFEX_STATISTICS_SAMPLE_DIMENSION,
  VITE_IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION: import.meta.env.VITE_IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION,
  VITE_IFEX_MAX_PIXEL_DIMENSION: import.meta.env.VITE_IFEX_MAX_PIXEL_DIMENSION,
  VITE_IFEX_MAX_SEARCH_COPY_DIMENSION: import.meta.env.VITE_IFEX_MAX_SEARCH_COPY_DIMENSION,
  VITE_IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT: import.meta.env.VITE_IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT,
  VITE_IFEX_PARSE_CONCURRENCY: import.meta.env.VITE_IFEX_PARSE_CONCURRENCY,
  VITE_IFEX_PARSE_TIMEOUT_MS: import.meta.env.VITE_IFEX_PARSE_TIMEOUT_MS,
  VITE_IFEX_PIXEL_TIMEOUT_MS: import.meta.env.VITE_IFEX_PIXEL_TIMEOUT_MS,
  VITE_IFEX_MAX_METADATA_TAGS: import.meta.env.VITE_IFEX_MAX_METADATA_TAGS,
  VITE_IFEX_MAX_METADATA_VALUE_CHARS: import.meta.env.VITE_IFEX_MAX_METADATA_VALUE_CHARS,
  VITE_IFEX_MAX_METADATA_TOTAL_CHARS: import.meta.env.VITE_IFEX_MAX_METADATA_TOTAL_CHARS,
  VITE_IFEX_ALLOW_UNSAFE_PREVIEW: import.meta.env.VITE_IFEX_ALLOW_UNSAFE_PREVIEW,
};

export const securityConfig = parseSecurityConfig(
  runtimeEnvironment,
  buildEnvironment,
  (message) => console.warn(`[IFEX security config] ${message}`),
);
