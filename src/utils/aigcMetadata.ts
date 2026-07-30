import { identifyMetadataProvider } from './aiProviderRegistry';
import type { AigcMetadataReport, AigcMetadataValues } from '../types/forensics';

const REQUIRED_FIELDS = [
  'Label',
  'ContentProducer',
  'ProduceID',
  'ReservedCode1',
  'ContentPropagator',
  'PropagateID',
  'ReservedCode2',
] as const;

const AIGC_KEYS = new Set(['aigc', 'tc260:aigc']);
const AIGC_CONTAINER_KEYS = new Set(['xmp', 'usercomment', 'comment', 'description']);
const MAX_TRAVERSAL_NODES = 512;
const MAX_DEPTH = 8;
const MAX_CANDIDATE_CHARS = 65_536;

interface Candidate {
  value: unknown;
  sourceKey: string;
  namespaceUri?: string;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:quot|apos|amp|lt|gt|#x[0-9a-f]+|#\d+);/gi, (entity) => {
    const lower = entity.toLowerCase();
    if (lower === '&quot;') return '"';
    if (lower === '&apos;') return "'";
    if (lower === '&amp;') return '&';
    if (lower === '&lt;') return '<';
    if (lower === '&gt;') return '>';
    const numeric = lower.startsWith('&#x')
      ? Number.parseInt(lower.slice(3, -1), 16)
      : Number.parseInt(lower.slice(2, -1), 10);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : entity;
  });
}

function parseStringCandidate(input: string): unknown {
  let value = decodeXmlEntities(input.slice(0, MAX_CANDIDATE_CHARS)).trim();
  const elementMatch = value.match(/<(?:[A-Za-z_][\w.-]*:)?AIGC\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?AIGC>/i);
  if (elementMatch) value = decodeXmlEntities(elementMatch[1]).trim();
  value = value.replace(/^AIGC\s*[:=]\s*/i, '').trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== 'string') return parsed;
      value = decodeXmlEntities(parsed).trim();
    } catch {
      const start = value.indexOf('{');
      const end = value.lastIndexOf('}');
      if (start < 0 || end <= start) return undefined;
      value = value.slice(start, end + 1);
    }
  }
  return undefined;
}

function findCandidates(input: Record<string, unknown>): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new WeakSet<object>();
  let remaining = MAX_TRAVERSAL_NODES;

  const visit = (value: unknown, path: string, depth: number, inheritedNamespace?: string) => {
    if (remaining <= 0 || depth > MAX_DEPTH || !value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    remaining -= 1;
    const record = recordOf(value);
    if (!record) return;

    const namespace = typeof record.namespaceUri === 'string'
      ? record.namespaceUri
      : typeof record.xmlns === 'string'
        ? record.xmlns
        : inheritedNamespace;

    for (const [key, item] of Object.entries(record)) {
      const normalizedKey = key.trim().toLowerCase();
      const nextPath = path ? `${path}.${key}` : key;
      if (AIGC_KEYS.has(normalizedKey)) candidates.push({ value: item, sourceKey: nextPath, namespaceUri: namespace });
      if (AIGC_CONTAINER_KEYS.has(normalizedKey) && typeof item === 'string' && /AIGC["']?\s*[:=]/i.test(item)) {
        candidates.push({ value: item, sourceKey: nextPath, namespaceUri: namespace });
      }
      if (item && typeof item === 'object') visit(item, nextPath, depth + 1, namespace);
    }
  };

  visit(input, '', 0);
  return candidates;
}

function unwrapCandidate(value: unknown): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current === 'string') {
      current = parseStringCandidate(current);
      continue;
    }
    const record = recordOf(current);
    if (!record) return undefined;
    if ('Label' in record || 'ContentProducer' in record || 'ProduceID' in record) return record;
    const nested = Object.entries(record).find(([key]) => AIGC_KEYS.has(key.trim().toLowerCase()));
    if (!nested) return undefined;
    current = nested[1];
  }
  return undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function valuesFromRecord(record: Record<string, unknown>): AigcMetadataValues {
  return {
    label: stringField(record, 'Label'),
    contentProducer: stringField(record, 'ContentProducer'),
    produceId: stringField(record, 'ProduceID'),
    reservedCode1: stringField(record, 'ReservedCode1'),
    contentPropagator: stringField(record, 'ContentPropagator'),
    propagateId: stringField(record, 'PropagateID'),
    reservedCode2: stringField(record, 'ReservedCode2'),
  };
}

function declarationFromLabel(label: string | undefined): AigcMetadataReport['declaration'] {
  if (label === '1') return 'generated';
  if (label === '2') return 'possibly-generated';
  if (label === '3') return 'suspected-generated';
  return undefined;
}

export function analyzeAigcMetadata(rawTags: Record<string, unknown>): AigcMetadataReport {
  const candidates = findCandidates(rawTags);
  let malformedCandidates = 0;

  for (const candidate of candidates) {
    const record = unwrapCandidate(candidate.value);
    if (!record) {
      malformedCandidates += 1;
      continue;
    }
    const values = valuesFromRecord(record);
    const declaration = declarationFromLabel(values.label);
    const minimumValid = Boolean(declaration && values.contentProducer && values.produceId);
    if (!minimumValid) {
      malformedCandidates += 1;
      continue;
    }

    const presentFields = REQUIRED_FIELDS.filter((field) => stringField(record, field));
    const provider = identifyMetadataProvider(values.contentProducer, candidate.namespaceUri);
    return {
      state: presentFields.length === REQUIRED_FIELDS.length ? 'declared' : 'partial',
      standardId: 'metadata.cn.gb45438.aigc',
      standardName: 'China GB 45438-2025 AIGC Metadata',
      declaration,
      sourceKey: candidate.sourceKey,
      conformant: presentFields.length === REQUIRED_FIELDS.length,
      values,
      provider,
      integrity: {
        state: values.reservedCode1 || values.reservedCode2 ? 'unverified' : 'absent',
        reservedCodesEqual: Boolean(values.reservedCode1 && values.reservedCode1 === values.reservedCode2),
      },
    };
  }

  return {
    state: malformedCandidates > 0 ? 'invalid' : 'absent',
    malformedCandidateCount: malformedCandidates,
  };
}
