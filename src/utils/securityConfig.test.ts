import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SECURITY_CONFIG, parseSecurityConfig } from './securityConfig';

describe('parseSecurityConfig', () => {
  it('uses hardened defaults', () => {
    expect(parseSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
  });

  it('prefers runtime values over Vite build values', () => {
    const config = parseSecurityConfig(
      {
        IFEX_MAX_FILE_MIB: '12',
        IFEX_STRICT_FILE_TYPES: 'false',
        IFEX_MAX_SEARCH_COPY_DIMENSION: '1200',
        IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT: '85',
      },
      {
        VITE_IFEX_MAX_FILE_MIB: '18',
        VITE_IFEX_STRICT_FILE_TYPES: 'true',
        VITE_IFEX_MAX_SEARCH_COPY_DIMENSION: '1800',
        VITE_IFEX_STATISTICS_SAMPLE_DIMENSION: '320',
      },
    );
    expect(config.maxFileBytes).toBe(12 * 1024 * 1024);
    expect(config.strictFileTypes).toBe(false);
    expect(config.maxSearchCopyDimension).toBe(1200);
    expect(config.searchCopyJpegQualityPercent).toBe(85);
    expect(config.statisticsSampleDimension).toBe(320);
  });

  it('rejects malformed and out-of-range values instead of weakening defaults', () => {
    const warn = vi.fn();
    const config = parseSecurityConfig({
      IFEX_MAX_FILE_MIB: '9999',
      IFEX_PARSE_TIMEOUT_MS: 'Infinity',
      IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT: '49',
      IFEX_ALLOW_UNSAFE_PREVIEW: 'yes',
    }, {}, warn);
    expect(config.maxFileBytes).toBe(DEFAULT_SECURITY_CONFIG.maxFileBytes);
    expect(config.parseTimeoutMs).toBe(DEFAULT_SECURITY_CONFIG.parseTimeoutMs);
    expect(config.searchCopyJpegQualityPercent).toBe(DEFAULT_SECURITY_CONFIG.searchCopyJpegQualityPercent);
    expect(config.allowUnsafePreview).toBe(false);
    expect(warn).toHaveBeenCalledTimes(4);
  });
});
