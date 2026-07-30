import type {
  FileOriginReport,
  ForensicFinding,
  JpegStructure,
  MetadataInventory,
} from '../types/forensics';
import { verifyC2pa } from './c2paVerifier';
import { detectFileTypeFromBytes } from './fileSignature';
import { parseJpegStructure } from './jpegStructure';
import type { MetadataNamespaceCounts } from './metadataNamespaces';
import { analyzeAigcMetadata } from './aigcMetadata';

export { detectFileType, detectFileTypeFromBytes } from './fileSignature';
export { parseJpegStructure } from './jpegStructure';

export function collectMetadataInventory(
  rawTags: Record<string, unknown>,
  jpeg: JpegStructure | undefined,
  hasThumbnail: boolean,
  namespaceCounts?: MetadataNamespaceCounts,
): MetadataInventory {
  const keys = Object.keys(rawTags);
  const countKeys = (supported: Set<string>) => keys.filter((key) => supported.has(key)).length;
  const softwareKeys = ['Software', 'CreatorTool', 'ProcessingSoftware', 'HistorySoftwareAgent', 'HostComputer'];
  const editingSoftware = softwareKeys.flatMap((key) => {
    const value = rawTags[key];
    if (Array.isArray(value)) return value.map(String);
    return value ? [String(value)] : [];
  });
  if (jpeg?.segments.some((segment) => segment.identifier === 'Photoshop 3.0')) editingSoftware.push('Adobe Photoshop resource block');

  return {
    exif: namespaceCounts?.exif ?? countKeys(new Set(['Make', 'Model', 'Orientation', 'Software', 'DateTime', 'DateTimeOriginal', 'CreateDate', 'ModifyDate', 'ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings', 'FocalLength', 'FocalLengthIn35mmFormat', 'LensMake', 'LensModel', 'SerialNumber', 'BodySerialNumber', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'latitude', 'longitude', 'ExifImageWidth', 'ExifImageHeight', 'PixelXDimension', 'PixelYDimension'])),
    iptc: namespaceCounts?.iptc ?? countKeys(new Set(['byline', 'Byline', 'CopyrightNotice', 'caption', 'Caption', 'credit', 'Credit', 'keywords', 'Keywords', 'ObjectName', 'City', 'Country', 'ProvinceState'])),
    xmp: namespaceCounts?.xmp ?? countKeys(new Set(['CreatorTool', 'Rating', 'HistoryAction', 'HistoryParameters', 'HistorySoftwareAgent', 'DocumentID', 'InstanceID', 'OriginalDocumentID', 'DerivedFrom', 'MetadataDate', 'xmp'])),
    icc: namespaceCounts?.icc ?? countKeys(new Set(['ProfileDescription', 'ProfileName', 'ProfileColorSpace', 'ColorSpaceData', 'RenderingIntent', 'MediaWhitePoint', 'RedMatrixColumn', 'GreenMatrixColumn', 'BlueMatrixColumn', 'RedTRC', 'GreenTRC', 'BlueTRC'])),
    editingSoftware: [...new Set(editingSoftware.filter(Boolean))],
    hasEmbeddedThumbnail: hasThumbnail,
  };
}

function finding(input: ForensicFinding): ForensicFinding { return input; }

export async function analyzeFileOrigin(
  file: File,
  buffer: ArrayBuffer,
  rawTags: Record<string, unknown>,
  hasThumbnail: boolean,
  namespaceCounts?: MetadataNamespaceCounts,
): Promise<FileOriginReport> {
  const bytes = new Uint8Array(buffer);
  const fileType = await detectFileTypeFromBytes(file, bytes);
  const jpeg = parseJpegStructure(bytes);
  const metadata = collectMetadataInventory(rawTags, jpeg, hasThumbnail, namespaceCounts);
  const aigc = analyzeAigcMetadata(rawTags);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const c2pa = await verifyC2pa(file, fileType.actualMime);
  const findings: ForensicFinding[] = [];

  findings.push(finding({
    id: 'file-identity',
    state: fileType.extensionMatches && fileType.mimeMatches ? 'consistent' : 'suspicious',
    confidence: 'high',
    title: 'File identity',
    summary: fileType.extensionMatches && fileType.mimeMatches
      ? `Binary signature, extension, and declared MIME are consistent with ${fileType.formatName}.`
      : `The binary signature identifies ${fileType.formatName}, but its extension or declared MIME does not match.`,
    evidence: [`Magic bytes: ${fileType.signatureHex}`, `Extension: .${fileType.extension || '(none)'}`, `Declared MIME: ${fileType.declaredMime}`],
  }));

  if (aigc.state === 'declared' || aigc.state === 'partial') {
    const declarationSummary = aigc.declaration === 'generated'
      ? 'The embedded metadata declares this content AI-generated or synthesized.'
      : aigc.declaration === 'possibly-generated'
        ? 'The embedded metadata declares this content possibly AI-generated or synthesized.'
        : 'The embedded metadata declares this content suspected to be AI-generated or synthesized.';
    findings.push(finding({
      id: 'aigc-provenance',
      state: 'observed',
      confidence: aigc.state === 'declared' ? 'high' : 'medium',
      title: 'AIGC provenance declaration',
      summary: declarationSummary,
      evidence: [
        aigc.standardName || 'AIGC metadata',
        `Label ${aigc.values?.label || 'unknown'}`,
        aigc.provider ? `Provider: ${aigc.provider.name}` : `Producer: ${aigc.values?.contentProducer || 'unknown'}`,
        aigc.values?.produceId ? `Produce ID: ${aigc.values.produceId}` : 'Produce ID unavailable',
        aigc.integrity?.state === 'unverified' ? 'Integrity protection data present but not verified' : 'No integrity protection data',
      ],
      limitations: ['A metadata declaration can be copied, removed, or modified unless its integrity protection is independently verified.'],
    }));
  } else if (aigc.state === 'invalid') {
    findings.push(finding({
      id: 'aigc-metadata-invalid',
      state: 'suspicious',
      confidence: 'medium',
      title: 'Malformed AIGC metadata',
      summary: 'An AIGC-labelled metadata field was found but did not satisfy the minimum declaration structure.',
      evidence: [`Malformed candidates: ${aigc.malformedCandidateCount || 1}`],
    }));
  }

  const metadataTotal = metadata.exif + metadata.iptc + metadata.xmp + metadata.icc;
  findings.push(finding({
    id: 'metadata-inventory',
    state: metadataTotal > 0 ? 'observed' : 'inconclusive',
    confidence: 'high',
    title: 'Metadata inventory',
    summary: metadataTotal > 0 ? `${metadataTotal} metadata indicators were grouped across EXIF, IPTC, XMP, and ICC.` : 'No metadata fields found.',
    evidence: [`EXIF ${metadata.exif}`, `IPTC ${metadata.iptc}`, `XMP ${metadata.xmp}`, `ICC ${metadata.icc}`, metadata.hasEmbeddedThumbnail ? 'Embedded thumbnail present' : 'No embedded thumbnail'],
  }));

  if (metadata.editingSoftware.length > 0) {
    findings.push(finding({
      id: 'editing-software', state: 'observed', confidence: 'high', title: 'Processing software traces',
      summary: 'Software identifiers indicate that an application handled or exported this file.',
      evidence: metadata.editingSoftware,
    }));
  }

  if (jpeg) {
    findings.push(finding({
      id: 'jpeg-structure', state: jpeg.trailingBytes > 0 ? 'suspicious' : 'observed', confidence: 'high', title: 'JPEG encoding structure',
      summary: `${jpeg.progressive ? 'Progressive' : 'Sequential'} JPEG with ${jpeg.quantizationTables.length} quantization table${jpeg.quantizationTables.length === 1 ? '' : 's'}${jpeg.chromaSubsampling ? ` and ${jpeg.chromaSubsampling} chroma subsampling` : ''}.`,
      evidence: [`${jpeg.segments.length} header segments`, `${jpeg.quantizationTables.length} DQT tables`, `${jpeg.trailingBytes} trailing bytes after EOI`],
    }));
  }

  findings.push(finding({
    id: 'c2pa',
    state: c2pa.state === 'trusted' || c2pa.state === 'valid' ? 'consistent' : c2pa.state === 'invalid' ? 'suspicious' : 'inconclusive',
    confidence: c2pa.state === 'error' ? 'low' : 'high',
    title: 'Content Credentials',
    summary: c2pa.explanation,
    evidence: [c2pa.activeManifest ? `Active manifest: ${c2pa.activeManifest}` : 'No active manifest', c2pa.claimGenerator ? `Claim generator: ${c2pa.claimGenerator}` : 'Claim generator unavailable', c2pa.provider ? `Provider: ${c2pa.provider.name}` : 'Provider not identified', ...c2pa.validationMessages.slice(0, 3)],
  }));

  if (c2pa.aiGenerated || c2pa.aiEdited) {
    findings.unshift(finding({
      id: 'ai-provenance', state: 'observed', confidence: c2pa.state === 'trusted' || c2pa.state === 'valid' ? 'high' : 'medium', title: 'AI provenance signal',
      summary: c2pa.aiGenerated ? 'Content Credentials declare trained algorithmic media.' : 'Content Credentials declare AI-assisted or algorithmically enhanced media.',
      evidence: [c2pa.claimGenerator || 'C2PA digital source type', c2pa.aiEvidenceOrigin === 'validated-parent-ingredient' ? 'AI declaration found in a validated parent ingredient' : 'AI declaration found in the active manifest', c2pa.state === 'trusted' ? 'Trusted manifest' : `${c2pa.state} manifest`],
    }));
  }

  return { sha256, fileType, metadata, jpeg, c2pa, aigc, findings, generatedAt: new Date().toISOString() };
}
