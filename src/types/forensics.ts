export type FindingState = 'observed' | 'consistent' | 'suspicious' | 'inconclusive' | 'unsupported';
export type FindingConfidence = 'low' | 'medium' | 'high';

export interface ForensicFinding {
  id: string;
  state: FindingState;
  confidence: FindingConfidence;
  title: string;
  summary: string;
  evidence: string[];
  limitations?: string[];
  alternativeCauses?: string[];
}

export interface DetectedFileType {
  actualMime: string;
  formatName: string;
  extension: string;
  declaredMime: string;
  extensionMatches: boolean;
  mimeMatches: boolean;
  signatureHex: string;
}

export interface JpegSegment {
  marker: string;
  name: string;
  offset: number;
  length: number;
  identifier?: string;
}

export interface JpegQuantizationTable {
  id: number;
  precision: 8 | 16;
  values: number[];
}

export interface JpegStructure {
  progressive: boolean;
  precision?: number;
  width?: number;
  height?: number;
  components?: number;
  chromaSubsampling?: string;
  trailingBytes: number;
  segments: JpegSegment[];
  quantizationTables: JpegQuantizationTable[];
  segmentsTruncated?: boolean;
}

export type C2paState = 'valid' | 'trusted' | 'invalid' | 'absent' | 'unsupported' | 'error';

export interface AiProviderAttribution {
  id: string;
  name: string;
  nativeName?: string;
  vendorGroup?: string;
  confidence: 'low' | 'medium' | 'high';
  matchedBy: string;
}

export interface AigcMetadataValues {
  label?: string;
  contentProducer?: string;
  produceId?: string;
  reservedCode1?: string;
  contentPropagator?: string;
  propagateId?: string;
  reservedCode2?: string;
}

export interface AigcMetadataReport {
  state: 'absent' | 'invalid' | 'partial' | 'declared';
  standardId?: string;
  standardName?: string;
  declaration?: 'generated' | 'possibly-generated' | 'suspected-generated';
  sourceKey?: string;
  conformant?: boolean;
  values?: AigcMetadataValues;
  provider?: AiProviderAttribution;
  integrity?: {
    state: 'absent' | 'unverified';
    reservedCodesEqual: boolean;
  };
  malformedCandidateCount?: number;
}

export interface C2paReport {
  state: C2paState;
  activeManifest?: string;
  claimGenerator?: string;
  signer?: string;
  manifestCount: number;
  assertionLabels: string[];
  ingredientCount: number;
  validationMessages: string[];
  aiGenerated: boolean;
  aiEdited: boolean;
  aiEvidenceOrigin?: 'active-manifest' | 'validated-parent-ingredient';
  provider?: AiProviderAttribution;
  explanation: string;
}

export interface MetadataInventory {
  exif: number;
  iptc: number;
  xmp: number;
  icc: number;
  editingSoftware: string[];
  hasEmbeddedThumbnail: boolean;
}

export interface FileOriginReport {
  sha256: string;
  fileType: DetectedFileType;
  metadata: MetadataInventory;
  jpeg?: JpegStructure;
  c2pa: C2paReport;
  aigc: AigcMetadataReport;
  findings: ForensicFinding[];
  generatedAt: string;
}
