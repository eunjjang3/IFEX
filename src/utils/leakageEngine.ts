import type {
  AdvancedData,
  CameraDetails,
  FileMetrics,
  LeakageFinding,
  LeakageReport,
  LocationData,
} from '../types/exif';

export function detectMetadataLeakage(
  location: LocationData,
  camera: CameraDetails,
  metrics: FileMetrics,
  advanced: AdvancedData,
  rawTags: Record<string, unknown>,
): LeakageReport {
  const findings: LeakageFinding[] = [];
  const hasGps = location.latitude !== undefined && location.longitude !== undefined;

  findings.push({
    id: 'gps',
    category: 'location',
    title: 'Exact GPS coordinates',
    description: hasGps ? 'Precise latitude and longitude are embedded in the file.' : 'No GPS coordinate fields found.',
    significance: 'high',
    detected: hasGps,
    value: hasGps ? `${location.latitude?.toFixed(6)}°, ${location.longitude?.toFixed(6)}°${location.altitude !== undefined ? ` · ${Math.round(location.altitude)} m` : ''}` : undefined,
  });

  const serials = [
    camera.serialNumber ? `Camera: ${camera.serialNumber}` : null,
    camera.lensSerialNumber ? `Lens: ${camera.lensSerialNumber}` : null,
    rawTags.SerialNumber ? `Body: ${String(rawTags.SerialNumber)}` : null,
    rawTags.InternalSerialNumber ? `Internal: ${String(rawTags.InternalSerialNumber)}` : null,
  ].filter((value): value is string => Boolean(value));
  const uniqueSerials = [...new Set(serials)];
  findings.push({
    id: 'hardware-identifiers',
    category: 'hardware',
    title: 'Hardware identifiers',
    description: uniqueSerials.length > 0 ? 'Unique camera or lens identifiers can correlate files produced by the same device.' : 'No camera or lens serial fields found.',
    significance: 'high',
    detected: uniqueSerials.length > 0,
    value: uniqueSerials.length > 0 ? uniqueSerials.join(' · ') : undefined,
  });

  const author = advanced.iptc?.byline || rawTags.Artist || rawTags.Author || rawTags.Copyright || rawTags.OwnerName;
  findings.push({
    id: 'author-identity',
    category: 'identity',
    title: 'Author or owner identity',
    description: author ? 'An author, photographer, owner, or copyright identity is embedded.' : 'No author or owner identity fields found.',
    significance: 'medium',
    detected: Boolean(author),
    value: author ? String(author) : undefined,
  });

  const embeddedTimestamp = metrics.createDate || rawTags.DateTimeOriginal || rawTags.CreateDate;
  const timestampValue = embeddedTimestamp instanceof Date ? embeddedTimestamp.toLocaleString() : embeddedTimestamp ? String(embeddedTimestamp) : undefined;
  findings.push({
    id: 'capture-time',
    category: 'timestamp',
    title: 'Embedded capture time',
    description: timestampValue ? 'A capture or creation timestamp is embedded in image metadata.' : 'No embedded capture timestamp found.',
    significance: 'medium',
    detected: Boolean(timestampValue),
    value: timestampValue,
  });

  const software = advanced.xmp?.creatorTool || rawTags.Software || rawTags.HostComputer || camera.firmware;
  const deviceModel = camera.make && camera.model ? `${camera.make} ${camera.model}` : camera.model || camera.make;
  const processingDetails = [deviceModel ? `Device: ${deviceModel}` : null, software ? `Software: ${String(software)}` : null]
    .filter((value): value is string => Boolean(value));
  findings.push({
    id: 'processing-environment',
    category: 'software',
    title: 'Device and processing environment',
    description: processingDetails.length > 0 ? 'Device, firmware, operating system, or editing software details are embedded.' : 'No device or processing software fields found.',
    significance: 'low',
    detected: processingDetails.length > 0,
    value: processingDetails.length > 0 ? processingDetails.join(' · ') : undefined,
  });

  const detectedCount = findings.filter((item) => item.detected).length;
  return {
    detectedCount,
    findings,
    summary: detectedCount === 0
      ? 'No metadata leakage signals found.'
      : `${detectedCount} metadata leakage signal${detectedCount === 1 ? '' : 's'} observed in this file.`,
  };
}
