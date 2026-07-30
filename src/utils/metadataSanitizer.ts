import type { MetadataLimitStatus } from '../types/exif';

export interface MetadataSanitizerLimits {
  maxTags: number;
  maxValueChars: number;
  maxTotalChars: number;
}

export interface SanitizedMetadata {
  tags: Record<string, unknown>;
  status: MetadataLimitStatus;
}

interface SanitizeState {
  limits: MetadataSanitizerLimits;
  truncatedValueCount: number;
  binaryValueCount: number;
  seen: WeakSet<object>;
}

function truncateString(value: string, state: SanitizeState): string {
  if (value.length <= state.limits.maxValueChars) return value;
  state.truncatedValueCount += 1;
  return `${value.slice(0, state.limits.maxValueChars)}… [truncated ${value.length - state.limits.maxValueChars} chars]`;
}

function binarySummary(value: ArrayBuffer | ArrayBufferView, state: SanitizeState): string {
  state.binaryValueCount += 1;
  const byteLength = value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
  const type = value instanceof ArrayBuffer ? 'ArrayBuffer' : value.constructor.name;
  return `[Binary ${type}: ${byteLength} bytes]`;
}

function sanitizeValue(value: unknown, state: SanitizeState, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return truncateString(value, state);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : new Date(value.getTime());
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return binarySummary(value, state);
  if (typeof value !== 'object') return truncateString(String(value), state);
  if (depth >= 6) {
    state.truncatedValueCount += 1;
    return '[Nested metadata omitted after 6 levels]';
  }
  if (state.seen.has(value)) {
    state.truncatedValueCount += 1;
    return '[Circular metadata reference omitted]';
  }
  state.seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, state, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = sanitizeValue(item, state, depth + 1);
    return result;
  } finally {
    state.seen.delete(value);
  }
}

function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function sanitizeMetadata(input: Record<string, unknown>, limits: MetadataSanitizerLimits): SanitizedMetadata {
  const entries = Object.entries(input);
  const state: SanitizeState = {
    limits,
    truncatedValueCount: 0,
    binaryValueCount: 0,
    seen: new WeakSet(),
  };
  const tags: Record<string, unknown> = {};
  let usedChars = 2;
  let omittedTagCount = 0;

  for (const [key, value] of entries) {
    if (Object.keys(tags).length >= limits.maxTags) {
      omittedTagCount += 1;
      continue;
    }
    const sanitizedKey = truncateString(key, state);
    const sanitizedValue = sanitizeValue(value, state);
    const entryChars = serializedLength(sanitizedKey) + serializedLength(sanitizedValue) + 2;
    if (usedChars + entryChars > limits.maxTotalChars) {
      omittedTagCount += 1;
      continue;
    }
    tags[sanitizedKey] = sanitizedValue;
    usedChars += entryChars;
  }

  const status: MetadataLimitStatus = {
    truncated: omittedTagCount > 0 || state.truncatedValueCount > 0 || state.binaryValueCount > 0,
    originalTagCount: entries.length,
    retainedTagCount: Object.keys(tags).length,
    omittedTagCount,
    truncatedValueCount: state.truncatedValueCount,
    summarizedBinaryValueCount: state.binaryValueCount,
  };
  return { tags, status };
}
