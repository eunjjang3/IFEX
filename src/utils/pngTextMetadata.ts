export type PngTextValue = string | string[];
export type PngTextMetadata = Record<string, PngTextValue>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8', { fatal: false });

export interface PngTextLimits {
  maxEntries: number;
  maxValueChars: number;
  maxTotalChars: number;
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function nullIndex(bytes: Uint8Array, start = 0): number {
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

async function inflateBounded(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array | undefined> {
  if (typeof DecompressionStream === 'undefined') return undefined;
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function addValue(output: PngTextMetadata, key: string, value: string) {
  const previous = output[key];
  if (previous === undefined) output[key] = value;
  else if (Array.isArray(previous)) previous.push(value);
  else output[key] = [previous, value];
}

async function decodeTextChunk(type: string, data: Uint8Array, maxBytes: number): Promise<[string, string] | undefined> {
  const keywordEnd = nullIndex(data);
  if (keywordEnd < 1 || keywordEnd > 79) return undefined;
  const key = latin1.decode(data.subarray(0, keywordEnd));

  if (type === 'tEXt') return [key, latin1.decode(data.subarray(keywordEnd + 1))];
  if (type === 'zTXt') {
    if (data[keywordEnd + 1] !== 0) return undefined;
    const inflated = await inflateBounded(data.subarray(keywordEnd + 2), maxBytes);
    return inflated ? [key, latin1.decode(inflated)] : undefined;
  }

  const compressionFlag = data[keywordEnd + 1];
  const compressionMethod = data[keywordEnd + 2];
  if ((compressionFlag !== 0 && compressionFlag !== 1) || compressionMethod !== 0) return undefined;
  const languageEnd = nullIndex(data, keywordEnd + 3);
  if (languageEnd < 0) return undefined;
  const translatedEnd = nullIndex(data, languageEnd + 1);
  if (translatedEnd < 0) return undefined;
  const textBytes = data.subarray(translatedEnd + 1);
  if (compressionFlag === 0) return [key, utf8.decode(textBytes)];
  const inflated = await inflateBounded(textBytes, maxBytes);
  return inflated ? [key, utf8.decode(inflated)] : undefined;
}

export async function extractPngTextMetadata(bytes: Uint8Array, limits: PngTextLimits): Promise<PngTextMetadata> {
  const output: PngTextMetadata = {};
  if (!isPng(bytes)) return output;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let totalChars = 0;
  let textChunkCount = 0;

  while (offset + 12 <= bytes.length && textChunkCount < limits.maxEntries) {
    const size = view.getUint32(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const next = dataEnd + 4;
    if (dataEnd < dataStart || next > bytes.length) break;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      textChunkCount += 1;
      const decoded = await decodeTextChunk(type, bytes.subarray(dataStart, dataEnd), limits.maxValueChars * 4);
      if (decoded) {
        const [key, rawValue] = decoded;
        const value = rawValue.slice(0, limits.maxValueChars);
        if (totalChars + key.length + value.length <= limits.maxTotalChars) {
          addValue(output, key, value);
          totalChars += key.length + value.length;
        }
      }
    }
    offset = next;
    if (type === 'IEND') break;
  }
  return output;
}
