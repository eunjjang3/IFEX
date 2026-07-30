export type SamplePhotoType = 'iphone_gps' | 'dslr_portrait' | 'clean_landscape';

type Rational = readonly [number, number];

interface SampleExifProfile {
  make: string;
  model: string;
  software: string;
  dateTimeOriginal: string;
  width: number;
  height: number;
  exposureTime: Rational;
  fNumber: Rational;
  iso: number;
  focalLength: Rational;
  focalLength35mm: number;
  maxApertureApex: Rational;
  serialNumber?: string;
  lensModel?: string;
  lensSerialNumber?: string;
  focalPlaneXResolution?: Rational;
  focalPlaneYResolution?: Rational;
  gps?: { latitude: number; longitude: number; altitude: Rational; dateStamp: string };
}

interface IfdEntry {
  tag: number;
  type: 1 | 2 | 3 | 4 | 5;
  count: number;
  bytes: Uint8Array;
}

const sampleProfiles: Record<Exclude<SamplePhotoType, 'clean_landscape'>, SampleExifProfile> = {
  iphone_gps: {
    make: 'Apple',
    model: 'iPhone 15 Pro',
    software: '17.5.1',
    dateTimeOriginal: '2026:07:29 12:00:00',
    width: 4032,
    height: 3024,
    exposureTime: [1, 120],
    fNumber: [18, 10],
    iso: 64,
    focalLength: [677, 100],
    focalLength35mm: 24,
    maxApertureApex: [17, 10],
    lensModel: 'iPhone 15 Pro back triple camera 6.765mm f/1.78',
    gps: { latitude: 37.5665, longitude: 126.978, altitude: [38, 1], dateStamp: '2026:07:29' },
  },
  dslr_portrait: {
    make: 'SONY',
    model: 'ILCE-7M4',
    software: '3.02',
    dateTimeOriginal: '2026:07:29 14:30:00',
    width: 7008,
    height: 4672,
    exposureTime: [1, 160],
    fNumber: [28, 10],
    iso: 200,
    focalLength: [85, 1],
    focalLength35mm: 85,
    maxApertureApex: [297, 100],
    serialNumber: 'IFEX-SYNTH-0001',
    lensModel: 'FE 85mm F1.8',
    lensSerialNumber: 'IFEX-LENS-0001',
    focalPlaneXResolution: [495830, 100],
    focalPlaneYResolution: [494347, 100],
  },
};

function ascii(value: string): Uint8Array {
  return new Uint8Array([...value, '\0'].map((character) => character.charCodeAt(0) & 0x7f));
}

function unsignedBytes(type: 1 | 3 | 4, values: readonly number[]): Uint8Array {
  const bytesPerValue = type === 1 ? 1 : type === 3 ? 2 : 4;
  const result = new Uint8Array(values.length * bytesPerValue);
  const view = new DataView(result.buffer);
  values.forEach((value, index) => {
    if (type === 1) view.setUint8(index, value);
    else if (type === 3) view.setUint16(index * 2, value, true);
    else view.setUint32(index * 4, value, true);
  });
  return result;
}

function rationalBytes(values: readonly Rational[]): Uint8Array {
  const result = new Uint8Array(values.length * 8);
  const view = new DataView(result.buffer);
  values.forEach(([numerator, denominator], index) => {
    view.setUint32(index * 8, numerator, true);
    view.setUint32(index * 8 + 4, denominator, true);
  });
  return result;
}

function entry(tag: number, type: IfdEntry['type'], value: string | readonly number[] | readonly Rational[]): IfdEntry {
  if (type === 2) {
    const bytes = ascii(String(value));
    return { tag, type, count: bytes.length, bytes };
  }
  if (type === 5) {
    const rationals = value as readonly Rational[];
    return { tag, type, count: rationals.length, bytes: rationalBytes(rationals) };
  }
  const numbers = value as readonly number[];
  return { tag, type, count: numbers.length, bytes: unsignedBytes(type, numbers) };
}

function ifdByteLength(entries: readonly IfdEntry[]): number {
  return 2 + entries.length * 12 + 4;
}

function externalByteLength(entries: readonly IfdEntry[]): number {
  return entries.reduce((total, item) => total + (item.bytes.length > 4 ? item.bytes.length + (item.bytes.length % 2) : 0), 0);
}

function writeIfd(
  bytes: Uint8Array,
  offset: number,
  entries: readonly IfdEntry[],
  initialDataOffset: number,
): number {
  const view = new DataView(bytes.buffer);
  const sorted = [...entries].sort((left, right) => left.tag - right.tag);
  view.setUint16(offset, sorted.length, true);
  let dataOffset = initialDataOffset;
  sorted.forEach((item, index) => {
    const itemOffset = offset + 2 + index * 12;
    view.setUint16(itemOffset, item.tag, true);
    view.setUint16(itemOffset + 2, item.type, true);
    view.setUint32(itemOffset + 4, item.count, true);
    if (item.bytes.length <= 4) {
      bytes.set(item.bytes, itemOffset + 8);
    } else {
      view.setUint32(itemOffset + 8, dataOffset, true);
      bytes.set(item.bytes, dataOffset);
      dataOffset += item.bytes.length + (item.bytes.length % 2);
    }
  });
  view.setUint32(offset + 2 + sorted.length * 12, 0, true);
  return dataOffset;
}

function coordinateRationals(value: number): Rational[] {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesValue);
  const seconds = (minutesValue - minutes) * 60;
  return [[degrees, 1], [minutes, 1], [Math.round(seconds * 10_000), 10_000]];
}

export function buildSampleExifApp1(profile: SampleExifProfile): Uint8Array {
  const exifEntries: IfdEntry[] = [
    entry(0x829a, 5, [profile.exposureTime]),
    entry(0x829d, 5, [profile.fNumber]),
    entry(0x8827, 3, [profile.iso]),
    entry(0x9003, 2, profile.dateTimeOriginal),
    entry(0x9205, 5, [profile.maxApertureApex]),
    entry(0x920a, 5, [profile.focalLength]),
    entry(0xa002, 4, [profile.width]),
    entry(0xa003, 4, [profile.height]),
    entry(0xa405, 3, [profile.focalLength35mm]),
  ];
  if (profile.focalPlaneXResolution) exifEntries.push(entry(0xa20e, 5, [profile.focalPlaneXResolution]));
  if (profile.focalPlaneYResolution) exifEntries.push(entry(0xa20f, 5, [profile.focalPlaneYResolution]));
  if (profile.focalPlaneXResolution && profile.focalPlaneYResolution) exifEntries.push(entry(0xa210, 3, [2]));
  if (profile.serialNumber) exifEntries.push(entry(0xa431, 2, profile.serialNumber));
  if (profile.lensModel) exifEntries.push(entry(0xa434, 2, profile.lensModel));
  if (profile.lensSerialNumber) exifEntries.push(entry(0xa435, 2, profile.lensSerialNumber));

  const gpsEntries: IfdEntry[] = [];
  if (profile.gps) {
    gpsEntries.push(
      entry(0x0000, 1, [2, 3, 0, 0]),
      entry(0x0001, 2, profile.gps.latitude >= 0 ? 'N' : 'S'),
      entry(0x0002, 5, coordinateRationals(profile.gps.latitude)),
      entry(0x0003, 2, profile.gps.longitude >= 0 ? 'E' : 'W'),
      entry(0x0004, 5, coordinateRationals(profile.gps.longitude)),
      entry(0x0005, 1, [0]),
      entry(0x0006, 5, [profile.gps.altitude]),
      entry(0x001d, 2, profile.gps.dateStamp),
    );
  }

  const ifd0Count = 5 + (gpsEntries.length > 0 ? 1 : 0);
  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + 2 + ifd0Count * 12 + 4;
  const gpsOffset = exifOffset + ifdByteLength(exifEntries);
  const ifd0Entries: IfdEntry[] = [
    entry(0x010f, 2, profile.make),
    entry(0x0110, 2, profile.model),
    entry(0x0112, 3, [1]),
    entry(0x0131, 2, profile.software),
    entry(0x8769, 4, [exifOffset]),
  ];
  if (gpsEntries.length > 0) ifd0Entries.push(entry(0x8825, 4, [gpsOffset]));

  const dataOffset = gpsOffset + (gpsEntries.length > 0 ? ifdByteLength(gpsEntries) : 0);
  const totalLength = dataOffset + externalByteLength(ifd0Entries) + externalByteLength(exifEntries) + externalByteLength(gpsEntries);
  const tiff = new Uint8Array(totalLength);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00], 0);
  view.setUint32(4, ifd0Offset, true);

  let nextDataOffset = dataOffset;
  nextDataOffset = writeIfd(tiff, ifd0Offset, ifd0Entries, nextDataOffset);
  nextDataOffset = writeIfd(tiff, exifOffset, exifEntries, nextDataOffset);
  if (gpsEntries.length > 0) writeIfd(tiff, gpsOffset, gpsEntries, nextDataOffset);

  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  payload.set(tiff, 6);
  const app1 = new Uint8Array(payload.length + 4);
  app1.set([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  app1.set(payload, 4);
  return app1;
}

export function addSampleExif(jpeg: Uint8Array, type: SamplePhotoType): Uint8Array {
  if (type === 'clean_landscape') return jpeg;
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('The generated sample is not a JPEG.');
  const app1 = buildSampleExifApp1(sampleProfiles[type]);
  const result = new Uint8Array(jpeg.length + app1.length);
  result.set(jpeg.subarray(0, 2), 0);
  result.set(app1, 2);
  result.set(jpeg.subarray(2), 2 + app1.length);
  return result;
}

// Helper to generate a local sample image without network access.
export async function createSamplePhotoFile(type: SamplePhotoType): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create a 2D canvas for the sample image.');

  const gradient = context.createLinearGradient(0, 0, 1920, 1080);
  if (type === 'iphone_gps') {
    gradient.addColorStop(0, '#0f2027'); gradient.addColorStop(0.5, '#203a43'); gradient.addColorStop(1, '#2c5364');
  } else if (type === 'dslr_portrait') {
    gradient.addColorStop(0, '#2b5876'); gradient.addColorStop(1, '#4e4376');
  } else {
    gradient.addColorStop(0, '#134e5e'); gradient.addColorStop(1, '#71b280');
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1920, 1080);
  context.fillStyle = 'rgba(255, 255, 255, 0.15)';
  context.beginPath(); context.arc(960, 540, 300, 0, Math.PI * 2); context.fill();
  context.font = 'bold 48px Georgia, serif'; context.fillStyle = 'rgba(255, 255, 255, 0.85)'; context.textAlign = 'center';
  const labels: Record<SamplePhotoType, string> = {
    iphone_gps: 'IFEX Local JPEG Sample',
    dslr_portrait: 'Sony α7 IV — Studio Portrait (Serial Exposed)',
    clean_landscape: 'Clean Landscape (No Metadata)',
  };
  context.fillText(labels[type], 960, 520);
  context.font = '24px monospace'; context.fillStyle = 'rgba(255, 255, 255, 0.6)';
  context.fillText('100% Client-Side Local Execution', 960, 580);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('This browser could not encode the local JPEG sample.')), 'image/jpeg', 0.92);
  });
  const encoded = addSampleExif(new Uint8Array(await blob.arrayBuffer()), type);
  const fileNameMap: Record<SamplePhotoType, string> = {
    iphone_gps: 'IFEX_Sample.JPG', dslr_portrait: 'DSC_0921_Portrait.JPG', clean_landscape: 'Landscape_Clean.JPG',
  };
  const fileBytes = encoded.slice().buffer as ArrayBuffer;
  return new File([fileBytes], fileNameMap[type], { type: 'image/jpeg', lastModified: Date.now() });
}
