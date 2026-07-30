import { describe, expect, it } from 'vitest';
import { C2PA_REPORT_LIMITS, detectActiveManifestAiProvenance, reportFromManifestStore } from './c2paVerifier';

const trainedMedia = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
const aiComposite = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';
const genericAlgorithm = 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia';
const genericEnhancement = 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced';

describe('detectActiveManifestAiProvenance', () => {
  it('reads a supported digital source type from the active actions assertion', () => {
    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{
            label: 'c2pa.actions.v2',
            data: { actions: [{ action: 'c2pa.created', digitalSourceType: trainedMedia }] },
          }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: true, aiEdited: false });
  });

  it('ignores AI declarations that exist only in an inactive manifest or ingredient', () => {
    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          ingredients: [{ title: 'AI ingredient', active_manifest: 'inactive', digitalSourceType: trainedMedia }],
          assertions: [{ label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.opened' }] } }],
        },
        inactive: {
          assertions: [{ label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created', digitalSourceType: trainedMedia }] } }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: false, aiEdited: false });
  });

  it('does not classify arbitrary assertion text as an AI provenance declaration', () => {
    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          claim_generator: `Example tool mentioning ${trainedMedia}`,
          assertions: [{ label: 'com.example.note', data: { description: aiComposite } }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: false, aiEdited: false });
  });

  it('recognizes AI-assisted declarations in nested related actions', () => {
    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{
            label: 'c2pa.actions',
            data: { actions: [{ action: 'c2pa.edited', related: [{ action: 'c2pa.placed', digital_source_type: aiComposite }] }] },
          }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: false, aiEdited: true });
  });

  it('does not call non-trained algorithms or ordinary algorithmic corrections AI', () => {
    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{
            label: 'c2pa.actions',
            data: { actions: [
              { action: 'c2pa.created', digitalSourceType: genericAlgorithm },
              { action: 'c2pa.filtered', digitalSourceType: genericEnhancement },
            ] },
          }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: false, aiEdited: false });
  });

  it('accepts official Schema.org enumerations but rejects lookalike domains', () => {
    const schemaResult = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{
            label: 'stds.schema-org.CreativeWork',
            data: { digitalSourceType: 'https://schema.org/TrainedAlgorithmicMediaDigitalSource' },
          }],
        },
      },
    });
    const lookalikeResult = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{
            label: 'c2pa.actions',
            data: { actions: [{ digitalSourceType: 'https://example.test/trainedAlgorithmicMedia' }] },
          }],
        },
      },
    });

    expect(schemaResult).toEqual({ aiGenerated: true, aiEdited: false });
    expect(lookalikeResult).toEqual({ aiGenerated: false, aiEdited: false });
  });

  it('recognizes the official composite-synthetic declaration as AI involvement', () => {
    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{
            label: 'c2pa.actions.v2',
            data: { actions: [{ digitalSourceType: 'digsrctype:compositeSynthetic' }] },
          }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: false, aiEdited: true });
  });
});

describe('reportFromManifestStore', () => {
  it('bounds attacker-controlled C2PA collections and text before Worker transfer', () => {
    const activeLabel = 'active';
    const report = reportFromManifestStore({
      active_manifest: activeLabel,
      validation_state: 'Valid',
      validation_status: Array.from(
        { length: C2PA_REPORT_LIMITS.collectionItems + 20 },
        (_, index) => ({ explanation: `message-${index}` }),
      ),
      manifests: {
        [activeLabel]: {
          claim_generator: 'g'.repeat(C2PA_REPORT_LIMITS.textChars + 100),
          assertions: Array.from(
            { length: C2PA_REPORT_LIMITS.collectionItems + 20 },
            (_, index) => ({ label: `assertion-${index}`, data: {} }),
          ),
          ingredients: Array.from({ length: C2PA_REPORT_LIMITS.reportedCount + 20 }, () => ({})),
        },
      },
    } as unknown as Parameters<typeof reportFromManifestStore>[0]);

    expect(report.claimGenerator).toHaveLength(C2PA_REPORT_LIMITS.textChars);
    expect(report.validationMessages).toHaveLength(C2PA_REPORT_LIMITS.collectionItems);
    expect(report.assertionLabels).toHaveLength(C2PA_REPORT_LIMITS.collectionItems);
    expect(report.ingredientCount).toBe(C2PA_REPORT_LIMITS.reportedCount);
  });

  it('bounds recursive related-action traversal', () => {
    let action: Record<string, unknown> = {
      digitalSourceType: trainedMedia,
    };
    for (let depth = 0; depth < C2PA_REPORT_LIMITS.traversalDepth + 20; depth += 1) {
      action = { related: [action] };
    }

    const result = detectActiveManifestAiProvenance({
      active_manifest: 'active',
      manifests: {
        active: {
          assertions: [{ label: 'c2pa.actions', data: { actions: [action] } }],
        },
      },
    });

    expect(result).toEqual({ aiGenerated: false, aiEdited: false });
  });
});
