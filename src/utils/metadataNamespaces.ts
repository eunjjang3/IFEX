import type { MetadataInventory } from '../types/forensics';

export type MetadataNamespaceCounts = Pick<MetadataInventory, 'exif' | 'iptc' | 'xmp' | 'icc'>;

export interface NormalizedMetadata {
  flatTags: Record<string, unknown>;
  namespaceCounts: MetadataNamespaceCounts;
}

const EXIF_BLOCKS = ['ifd0', 'exif', 'gps', 'interop'] as const;
const OTHER_NAMESPACES = ['iptc', 'xmp', 'icc'] as const;
const STRUCTURED_BLOCKS = new Set<string>([...EXIF_BLOCKS, 'ifd1', ...OTHER_NAMESPACES]);

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function mergeBlock(flatTags: Record<string, unknown>, value: unknown): number {
  const record = metadataRecord(value);
  if (record) {
    Object.assign(flatTags, record);
    return Object.keys(record).length;
  }
  return value === undefined || value === null || value === '' ? 0 : 1;
}

export function normalizeStructuredMetadata(input: Record<string, unknown>): NormalizedMetadata {
  const structured = [...STRUCTURED_BLOCKS].some((key) => key in input);
  if (!structured) {
    return {
      flatTags: { ...input },
      namespaceCounts: { exif: 0, iptc: 0, xmp: 0, icc: 0 },
    };
  }

  const flatTags: Record<string, unknown> = {};
  let exif = 0;
  for (const block of EXIF_BLOCKS) exif += mergeBlock(flatTags, input[block]);

  const namespaceCounts: MetadataNamespaceCounts = {
    exif,
    iptc: mergeBlock(flatTags, input.iptc),
    xmp: mergeBlock(flatTags, input.xmp),
    icc: mergeBlock(flatTags, input.icc),
  };

  for (const [key, value] of Object.entries(input)) {
    if (STRUCTURED_BLOCKS.has(key) || key === 'errors') continue;
    flatTags[key] = value;
  }
  if (typeof input.xmp === 'string' && input.xmp) flatTags.xmp = input.xmp;
  return { flatTags, namespaceCounts };
}
