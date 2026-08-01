import type { AiGenerationMetadata } from '../types/aiMetadata';

export interface ImageClassification {
  type: 'AI Generated Image' | 'Camera Photo' | 'Device Screenshot' | 'Unclassified Image';
  confidence: 'High' | 'Medium' | 'Low';
  summary: string;
  reasons: string[];
  deviceEstimate?: string;
}

interface ScreenMatch {
  family: 'iPhone' | 'iPad' | 'Desktop';
  description: string;
}

function exactScreenMatch(width?: number, height?: number): ScreenMatch | undefined {
  if (!width || !height) return undefined;
  const w = Math.max(width, height);
  const h = Math.min(width, height);
  const key = `${w}x${h}`;

  const iphone = new Set(['2796x1290', '2556x1179', '2532x1170', '2778x1284', '2436x1125', '1792x828', '1334x750']);
  const ipad = new Set(['2732x2048', '2388x1668', '2360x1640']);
  const desktop = new Set(['3024x1964', '3456x2234', '2880x1800', '2560x1600', '3840x2160', '2560x1440', '1920x1080']);

  if (iphone.has(key)) return { family: 'iPhone', description: `iPhone screen-size match (${width} × ${height})` };
  if (ipad.has(key)) return { family: 'iPad', description: `iPad screen-size match (${width} × ${height})` };
  if (desktop.has(key)) return { family: 'Desktop', description: `Desktop screen-size match (${width} × ${height})` };
  return undefined;
}

export function classifyImageType(
  file: File,
  width: number | undefined,
  height: number | undefined,
  rawTags: Record<string, any>,
  cameraMake?: string,
  cameraModel?: string,
  aiGeneration?: AiGenerationMetadata,
): ImageClassification {
  if (aiGeneration?.detected) {
    return {
      type: 'AI Generated Image',
      confidence: 'High',
      summary: `Embedded metadata declares output from ${aiGeneration.generatorLabel || 'an AI image generator'}. Metadata is editable and is not cryptographic proof.`,
      reasons: aiGeneration.sources.map((source) => `${source.container}: ${source.key}`),
      deviceEstimate: aiGeneration.generatorLabel,
    };
  }
  const cameraReasons: string[] = [];
  const screenshotReasons: string[] = [];
  const captureParameters = [
    rawTags.FNumber !== undefined ? 'f-stop' : undefined,
    rawTags.ExposureTime !== undefined ? 'shutter speed' : undefined,
    rawTags.ISO !== undefined || rawTags.ISOSpeedRatings !== undefined ? 'ISO' : undefined,
    rawTags.FocalLength !== undefined ? 'focal length' : undefined,
  ].filter((value): value is string => Boolean(value));
  const cameraIdentity = String(cameraModel || rawTags.Model || '').trim();
  const lensIdentity = String(rawTags.LensModel || rawTags.LensInfo || '').trim();

  if (captureParameters.length > 0) cameraReasons.push(`Camera shooting parameters: ${captureParameters.join(', ')}`);
  if (cameraIdentity) cameraReasons.push(`Camera hardware model: ${`${cameraMake || ''} ${cameraIdentity}`.trim()}`);
  if (lensIdentity) cameraReasons.push(`Lens identity: ${lensIdentity}`);

  const coherentCameraEvidence =
    (Boolean(cameraIdentity) && captureParameters.length >= 2) ||
    (Boolean(lensIdentity) && captureParameters.length >= 3);
  if (coherentCameraEvidence) {
    const highConfidence = Boolean(cameraIdentity && lensIdentity && captureParameters.length >= 3);
    return {
      type: 'Camera Photo',
      confidence: highConfidence ? 'High' : 'Medium',
      summary: 'Captured with a physical camera or smartphone lens.',
      reasons: cameraReasons,
      deviceEstimate: cameraIdentity ? `${cameraMake || ''} ${cameraIdentity}`.trim() : undefined,
    };
  }

  const nameLower = file.name.toLowerCase();
  const mimeLower = (file.type || '').toLowerCase();
  const screenshotFilename =
    nameLower.includes('screenshot') || nameLower.includes('스크린샷') ||
    nameLower.includes('screen_shot') || nameLower.includes('screen shot') ||
    nameLower.startsWith('capture') || nameLower.startsWith('screen_');
  const pngContainer = mimeLower === 'image/png' || nameLower.endsWith('.png');
  const screenMatch = exactScreenMatch(width, height);
  const software = String(rawTags.Software || rawTags.CreatorTool || '').trim();
  const screenshotSoftware = /screen\s*(?:shot|capture)|screencapture|snipping tool/i.test(software);

  if (screenshotFilename) screenshotReasons.push(`OS-style screenshot filename: "${file.name}"`);
  if (pngContainer) screenshotReasons.push('PNG container');
  if (screenMatch) screenshotReasons.push(screenMatch.description);
  if (screenshotSoftware) screenshotReasons.push(`Screenshot software identifier: ${software}`);

  const coherentScreenshotEvidence =
    (screenshotFilename && pngContainer && Boolean(screenMatch)) ||
    (screenshotSoftware && pngContainer && (screenshotFilename || Boolean(screenMatch)));
  if (coherentScreenshotEvidence) {
    return {
      type: 'Device Screenshot',
      confidence: screenshotSoftware && screenshotFilename && Boolean(screenMatch) ? 'High' : 'Medium',
      summary: 'Captured directly from an OS display (iPhone / Mac / PC / Android).',
      reasons: screenshotReasons,
      deviceEstimate: screenMatch?.description,
    };
  }

  const inconclusiveReasons = [...cameraReasons, ...screenshotReasons];
  return {
    type: 'Unclassified Image',
    confidence: 'Low',
    summary: 'Insufficient metadata to classify image origin.',
    reasons: inconclusiveReasons.length > 0 ? inconclusiveReasons : ['No camera-capture or screenshot markers detected.'],
  };
}
