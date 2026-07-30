import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import type { ManifestAssertion, ManifestStore } from '@contentauth/c2pa-web';
import digitalSourceVocabulary from '../data/iptcDigitalSourceTypes.json';
import type { C2paReport } from '../types/forensics';

let sdkPromise: Promise<import('@contentauth/c2pa-web').C2paSdk> | null = null;

const AI_GENERATED_SOURCE_TYPES = new Set([
  'trainedalgorithmicmedia',
]);

const AI_EDITED_SOURCE_TYPES = new Set([
  'compositewithtrainedalgorithmicmedia',
  'compositesynthetic',
]);

export const C2PA_REPORT_LIMITS = Object.freeze({
  collectionItems: 256,
  textChars: 4_096,
  totalTextChars: 65_536,
  traversalNodes: 4_096,
  traversalDepth: 16,
  reportedCount: 10_000,
});

interface TraversalBudget {
  remaining: number;
}

interface TextBudget {
  remaining: number;
}

const KNOWN_IPTC_SOURCE_TYPES = new Map(
  digitalSourceVocabulary.concepts.map((concept) => [concept.id.toLowerCase(), concept.id]),
);

const IPTC_SOURCE_TYPE_PREFIX = /^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\//i;
const SCHEMA_SOURCE_TYPE_PREFIX = /^https?:\/\/(?:www\.)?schema\.org\//i;

function sourceTypeName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.slice(0, C2PA_REPORT_LIMITS.textChars).trim();
  if (!normalized) return undefined;

  let identifier: string;
  if (IPTC_SOURCE_TYPE_PREFIX.test(normalized)) {
    identifier = normalized.slice(normalized.lastIndexOf('/') + 1);
  } else if (SCHEMA_SOURCE_TYPE_PREFIX.test(normalized)) {
    identifier = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/DigitalSource$/i, '');
  } else if (/^digsrctype:[a-z][a-z0-9]*$/i.test(normalized)) {
    identifier = normalized.slice(normalized.indexOf(':') + 1);
  } else if (/^[a-z][a-z0-9]*$/i.test(normalized)) {
    // Some SDK versions expose the vocabulary identifier without its URI.
    identifier = normalized;
  } else {
    return undefined;
  }

  return KNOWN_IPTC_SOURCE_TYPES.has(identifier.toLowerCase()) ? identifier.toLowerCase() : undefined;
}

function collectActionSourceTypes(value: unknown, result: Set<string>, budget: TraversalBudget, depth = 0): void {
  if (!value || typeof value !== 'object' || budget.remaining <= 0 || depth > C2PA_REPORT_LIMITS.traversalDepth) return;
  budget.remaining -= 1;
  const action = value as Record<string, unknown>;
  const sourceType = sourceTypeName(action.digitalSourceType ?? action.digital_source_type);
  if (sourceType) result.add(sourceType);
  if (Array.isArray(action.related)) {
    for (const related of action.related.slice(0, C2PA_REPORT_LIMITS.collectionItems)) {
      collectActionSourceTypes(related, result, budget, depth + 1);
    }
  }
}

function sourceTypesFromAssertion(assertion: ManifestAssertion, result: Set<string>, budget: TraversalBudget): void {
  const label = String(assertion.label ?? '').slice(0, C2PA_REPORT_LIMITS.textChars).toLowerCase();
  const data = assertion.data;

  if (label.startsWith('c2pa.actions') && data && typeof data === 'object') {
    const actions = (data as Record<string, unknown>).actions;
    if (Array.isArray(actions)) {
      for (const action of actions.slice(0, C2PA_REPORT_LIMITS.collectionItems)) {
        collectActionSourceTypes(action, result, budget);
      }
    }
    return;
  }

  if (label.startsWith('stds.schema-org.creativework') && data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const sourceType = sourceTypeName(record.digitalSourceType ?? record.digital_source_type);
    if (sourceType) result.add(sourceType);
  }
}

export function detectActiveManifestAiProvenance(
  store: Pick<ManifestStore, 'active_manifest' | 'manifests'>,
): Pick<C2paReport, 'aiGenerated' | 'aiEdited'> {
  const activeLabel = store.active_manifest || undefined;
  const active = activeLabel ? store.manifests?.[activeLabel] : undefined;
  if (!active) return { aiGenerated: false, aiEdited: false };

  const sourceTypes = new Set<string>();
  const budget = { remaining: C2PA_REPORT_LIMITS.traversalNodes };
  for (const assertion of (active.assertions || []).slice(0, C2PA_REPORT_LIMITS.collectionItems)) {
    sourceTypesFromAssertion(assertion, sourceTypes, budget);
  }

  return {
    aiGenerated: [...sourceTypes].some((value) => AI_GENERATED_SOURCE_TYPES.has(value)),
    aiEdited: [...sourceTypes].some((value) => AI_EDITED_SOURCE_TYPES.has(value)),
  };
}

function getSdk() {
  if (!sdkPromise) {
    sdkPromise = import('@contentauth/c2pa-web')
      .then(({ createC2pa }) => createC2pa({ wasmSrc }))
      .catch((error) => {
        sdkPromise = null;
        throw error;
      });
  }
  return sdkPromise;
}

function emptyReport(state: C2paReport['state'], explanation: string): C2paReport {
  return {
    state,
    manifestCount: 0,
    assertionLabels: [],
    ingredientCount: 0,
    validationMessages: [],
    aiGenerated: false,
    aiEdited: false,
    explanation,
  };
}

function boundedText(value: unknown, budget: TextBudget): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text || budget.remaining <= 0) return undefined;
  const length = Math.min(text.length, C2PA_REPORT_LIMITS.textChars, budget.remaining);
  budget.remaining -= length;
  return text.slice(0, length);
}

function cappedObjectCount(value: Record<string, unknown>): number {
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    count += 1;
    if (count >= C2PA_REPORT_LIMITS.reportedCount) break;
  }
  return count;
}

function boundedClaimGeneratorInfo(
  items: NonNullable<NonNullable<ManifestStore['manifests']>[string]['claim_generator_info']>,
  budget: TextBudget,
): string | undefined {
  let result = '';
  for (const item of items.slice(0, C2PA_REPORT_LIMITS.collectionItems)) {
    const name = String(item.name ?? '').trim().slice(0, C2PA_REPORT_LIMITS.textChars);
    if (!name) continue;
    const version = String(item.version ?? '').trim().slice(0, C2PA_REPORT_LIMITS.textChars);
    const part = version ? `${name} ${version}` : name;
    const prefix = result ? ', ' : '';
    const available = Math.min(
      C2PA_REPORT_LIMITS.textChars - result.length,
      budget.remaining,
    );
    if (available <= 0) break;
    const addition = `${prefix}${part}`.slice(0, available);
    result += addition;
    budget.remaining -= addition.length;
  }
  return result || undefined;
}

export function reportFromManifestStore(store: ManifestStore): C2paReport {
  const manifests = store.manifests || {};
  const activeLabel = store.active_manifest || undefined;
  const active = activeLabel ? manifests[activeLabel] : undefined;
  const textBudget = { remaining: C2PA_REPORT_LIMITS.totalTextChars };
  const activeManifest = boundedText(activeLabel, textBudget);

  let claimGenerator = boundedText(active?.claim_generator, textBudget);
  if (!claimGenerator && active?.claim_generator_info) {
    claimGenerator = boundedClaimGeneratorInfo(active.claim_generator_info, textBudget);
  }

  const signatureInfo = active?.signature_info as unknown as Record<string, unknown> | undefined;
  const signer = boundedText(signatureInfo?.issuer ?? signatureInfo?.cert_serial_number, textBudget);
  const validationMessages: string[] = [];
  for (const status of (store.validation_status || []).slice(0, C2PA_REPORT_LIMITS.collectionItems)) {
    const entry = status as unknown as Record<string, unknown>;
    const message = boundedText(entry.explanation ?? entry.code ?? entry.url ?? 'Validation notice', textBudget);
    if (!message) break;
    validationMessages.push(message);
  }

  const assertionLabels: string[] = [];
  const seenLabels = new Set<string>();
  for (const assertion of (active?.assertions || []).slice(0, C2PA_REPORT_LIMITS.collectionItems)) {
    const item = assertion as unknown as Record<string, unknown>;
    const label = boundedText(item.label ?? item.name ?? item.kind ?? 'assertion', textBudget);
    if (!label) break;
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    assertionLabels.push(label);
  }

  const { aiGenerated, aiEdited } = detectActiveManifestAiProvenance(store);
  const state = store.validation_state === 'Trusted'
    ? 'trusted'
    : store.validation_state === 'Valid'
      ? 'valid'
      : 'invalid';

  return {
    state,
    activeManifest,
    claimGenerator,
    signer,
    manifestCount: cappedObjectCount(manifests),
    assertionLabels,
    ingredientCount: Math.min(active?.ingredients?.length || 0, C2PA_REPORT_LIMITS.reportedCount),
    validationMessages,
    aiGenerated,
    aiEdited,
    explanation: state === 'trusted'
      ? 'The manifest is structurally valid and its signer is trusted by the configured trust policy.'
      : state === 'valid'
        ? 'The manifest is structurally and cryptographically valid, but trust is not established.'
        : 'Content Credentials were found, but validation reported an integrity or trust problem.',
  };
}

export async function verifyC2pa(file: File, mimeType: string): Promise<C2paReport> {
  try {
    const module = await import('@contentauth/c2pa-web');
    if (!module.isSupportedReaderFormat(mimeType)) {
      return emptyReport('unsupported', `C2PA validation is not available for ${mimeType}.`);
    }

    const sdk = await getSdk();
    const reader = await sdk.reader.fromBlob(mimeType, file);
    if (!reader) {
      return emptyReport('absent', 'No Content Credentials manifest was found.');
    }

    try {
      const store = await reader.manifestStore();
      return reportFromManifestStore(store);
    } finally {
      try {
        await reader.free();
      } catch {
        // Cleanup failure must not replace a completed provenance report.
      }
    }
  } catch (error) {
    return emptyReport('error', `C2PA validation could not complete: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
