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
  findings: ForensicFinding[];
  generatedAt: string;
}
