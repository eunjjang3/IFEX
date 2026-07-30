import providerDatabase from '../data/aiProviders.json';
import type { AiProviderAttribution } from '../types/forensics';

interface ProviderRecord {
  id: string;
  name: string;
  nativeName?: string;
  vendorGroup?: string;
  c2pa?: {
    claimGeneratorIncludes?: string[];
    signerIncludes?: string[];
  };
  metadata?: {
    unifiedSocialCreditCodes?: string[];
    producerCodeExact?: string[];
    producerCodePrefixes?: string[];
    namespaceUris?: string[];
  };
}

const providers = providerDatabase.providers as ProviderRecord[];

function attribution(record: ProviderRecord, confidence: AiProviderAttribution['confidence'], matchedBy: string): AiProviderAttribution {
  return {
    id: record.id,
    name: record.name,
    nativeName: record.nativeName,
    vendorGroup: record.vendorGroup,
    confidence,
    matchedBy,
  };
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function identifyMetadataProvider(contentProducer: unknown, namespaceUri?: unknown): AiProviderAttribution | undefined {
  const producer = typeof contentProducer === 'string' ? contentProducer.trim() : '';
  const namespace = normalized(namespaceUri);

  for (const record of providers) {
    const metadata = record.metadata;
    if (!metadata) continue;
    if (producer && metadata.producerCodeExact?.includes(producer)) {
      return attribution(record, 'high', 'exact producer code');
    }
    if (producer && metadata.producerCodePrefixes?.some((prefix) => producer.startsWith(prefix))) {
      return attribution(record, 'high', 'producer code prefix');
    }
    if (producer.length >= 22) {
      const socialCreditCode = producer.slice(4, 22);
      if (metadata.unifiedSocialCreditCodes?.includes(socialCreditCode)) {
        return attribution(record, 'high', 'unified social credit code');
      }
    }
    if (namespace && metadata.namespaceUris?.some((uri) => normalized(uri) === namespace)) {
      return attribution(record, 'medium', 'metadata namespace');
    }
  }
  return undefined;
}

export function identifyC2paProvider(signals: Iterable<unknown>): AiProviderAttribution | undefined {
  const values = [...signals].map(normalized).filter(Boolean);
  for (const record of providers) {
    const c2pa = record.c2pa;
    if (!c2pa) continue;
    const claimPattern = c2pa.claimGeneratorIncludes?.find((pattern) =>
      values.some((value) => value.includes(pattern.toLowerCase())),
    );
    if (claimPattern) return attribution(record, 'high', `C2PA claim generator: ${claimPattern}`);
    const signerPattern = c2pa.signerIncludes?.find((pattern) =>
      values.some((value) => value.includes(pattern.toLowerCase())),
    );
    if (signerPattern) return attribution(record, 'high', `C2PA signer: ${signerPattern}`);
  }
  return undefined;
}

export function providerDatabaseVersion(): number {
  return providerDatabase.schemaVersion;
}
