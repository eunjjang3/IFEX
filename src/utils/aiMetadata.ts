import type { AiGenerationMetadata, AiGeneratorId, AiMetadataSource } from '../types/aiMetadata';
import type { PngTextMetadata, PngTextValue } from './pngTextMetadata';

type Primitive = string | number | boolean;

const emptyResult = (): AiGenerationMetadata => ({
  detected: false,
  generators: [],
  confidence: 'none',
  promptTexts: [],
  parameters: {},
  sources: [],
  limitations: [],
});

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.map(firstString).find(Boolean);
  return undefined;
}

function nestedRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function valueByKey(rawTags: Record<string, unknown>, pngText: PngTextMetadata, key: string): unknown {
  const textKey = Object.keys(pngText).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  if (textKey) return pngText[textKey];
  const rawKey = Object.keys(rawTags).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  if (rawKey) return rawTags[rawKey];
  for (const containerName of ['ihdr', 'PNGText']) {
    const container = nestedRecord(rawTags[containerName]);
    const nestedKey = container && Object.keys(container).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (container && nestedKey) return container[nestedKey];
  }
  return undefined;
}

function parseJson(value: unknown): unknown {
  const text = firstString(value);
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function addSource(sources: AiMetadataSource[], pngText: PngTextMetadata, key: string) {
  const inPng = Object.keys(pngText).some((candidate) => candidate.toLowerCase() === key.toLowerCase());
  const source: AiMetadataSource = { container: inPng ? 'png-text' : 'exif-user-comment', key };
  if (!sources.some((item) => item.container === source.container && item.key === source.key)) sources.push(source);
}

function parseA1111Settings(line: string): Record<string, Primitive> {
  const output: Record<string, Primitive> = {};
  const knownKey = /(?:^|,\s)(Steps|Sampler|Schedule type|CFG scale|Seed|Size|Model hash|Model|VAE hash|VAE|Denoising strength|Clip skip|Version):\s*/g;
  const matches = [...line.matchAll(knownKey)];
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? line.length : line.length;
    const raw = line.slice(start, end).replace(/,\s*$/, '').trim();
    const numeric = Number(raw);
    output[match[1]] = raw !== '' && Number.isFinite(numeric) ? numeric : raw;
  });
  return output;
}

function detectA1111(value: unknown): { positive?: string; negative?: string; parameters: Record<string, Primitive> } | undefined {
  const text = firstString(value);
  if (!text) return undefined;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const settingsIndex = lines.findLastIndex((line) => /^Steps:\s*\d+/i.test(line.trim()));
  if (settingsIndex < 0) return undefined;
  const parameters = parseA1111Settings(lines.slice(settingsIndex).join(' '));
  const knownCount = Object.keys(parameters).length;
  if (parameters.Steps === undefined || parameters.Seed === undefined || knownCount < 3) return undefined;
  const body = lines.slice(0, settingsIndex);
  const negativeIndex = body.findIndex((line) => /^Negative prompt:\s*/i.test(line));
  const positive = (negativeIndex < 0 ? body : body.slice(0, negativeIndex)).join('\n').trim();
  const negative = negativeIndex < 0
    ? undefined
    : [body[negativeIndex].replace(/^Negative prompt:\s*/i, ''), ...body.slice(negativeIndex + 1)].join('\n').trim();
  return { positive: positive || undefined, negative: negative || undefined, parameters };
}

function isComfyPrompt(value: unknown): value is Record<string, unknown> {
  const record = nestedRecord(value);
  if (!record) return false;
  return Object.values(record).some((node) => {
    const item = nestedRecord(node);
    return typeof item?.class_type === 'string' && Boolean(nestedRecord(item.inputs));
  });
}

function isComfyWorkflow(value: unknown): value is Record<string, unknown> {
  const record = nestedRecord(value);
  return Boolean(record && Array.isArray(record.nodes) && record.nodes.some((node) => typeof nestedRecord(node)?.type === 'string'));
}

function comfyTexts(prompt: Record<string, unknown> | undefined): string[] {
  if (!prompt) return [];
  return Object.values(prompt).flatMap((node) => {
    const item = nestedRecord(node);
    const inputs = nestedRecord(item?.inputs);
    if (!item || !inputs || !/text|conditioning|prompt/i.test(String(item.class_type))) return [];
    return Object.entries(inputs)
      .filter(([key, value]) => /text|prompt/i.test(key) && typeof value === 'string' && value.trim())
      .map(([, value]) => String(value).trim());
  }).filter((value, index, values) => values.indexOf(value) === index);
}

function primitiveParameters(input: Record<string, unknown>, keys: string[]): Record<string, Primitive> {
  const output: Record<string, Primitive> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[key] = value;
  }
  return output;
}

export function detectAiGenerationMetadata(rawTags: Record<string, unknown>, pngText: PngTextMetadata = {}): AiGenerationMetadata {
  const result = emptyResult();
  const generators = new Set<AiGeneratorId>();

  const software = firstString(valueByKey(rawTags, pngText, 'Software'));
  const description = firstString(valueByKey(rawTags, pngText, 'Description'));
  const novelCommentValue = valueByKey(rawTags, pngText, 'Comment');
  const novelComment = nestedRecord(parseJson(novelCommentValue));
  const novelKeys = novelComment ? ['uc', 'steps', 'scale', 'seed', 'sampler'] : [];
  const knownNovelFields = novelKeys.filter((key) => novelComment?.[key] !== undefined).length;
  if (/^novelai$/i.test(software || '') && Boolean(description || knownNovelFields >= 3)) {
    generators.add('novelai');
    result.positivePrompt = description;
    result.negativePrompt = firstString(novelComment?.uc);
    if (novelComment) result.parameters = primitiveParameters(novelComment, ['steps', 'scale', 'seed', 'sampler', 'noise_schedule', 'sm', 'sm_dyn']);
    addSource(result.sources, pngText, 'Software');
    if (description) addSource(result.sources, pngText, 'Description');
    if (novelComment) addSource(result.sources, pngText, 'Comment');
  }

  const promptGraphValue = parseJson(valueByKey(rawTags, pngText, 'prompt'));
  const workflowValue = parseJson(valueByKey(rawTags, pngText, 'workflow'));
  const promptGraph = isComfyPrompt(promptGraphValue) ? promptGraphValue : undefined;
  const workflow = isComfyWorkflow(workflowValue) ? workflowValue : undefined;
  if (promptGraph || workflow) {
    generators.add('comfyui');
    result.promptGraph = promptGraph;
    result.workflow = workflow;
    result.promptTexts = comfyTexts(promptGraph);
    if (promptGraph) addSource(result.sources, pngText, 'prompt');
    if (workflow) addSource(result.sources, pngText, 'workflow');
  }

  const parametersValue = valueByKey(rawTags, pngText, 'parameters');
  const userCommentValue = valueByKey(rawTags, pngText, 'UserComment');
  const a1111 = detectA1111(parametersValue) ?? detectA1111(userCommentValue);
  if (a1111) {
    generators.add('automatic1111');
    result.positivePrompt ??= a1111.positive;
    result.negativePrompt ??= a1111.negative;
    result.parameters = { ...a1111.parameters, ...result.parameters };
    addSource(result.sources, pngText, detectA1111(parametersValue) ? 'parameters' : 'UserComment');
  }

  result.generators = [...generators];
  result.detected = result.generators.length > 0;
  result.confidence = result.detected ? 'medium' : 'none';
  result.generatorLabel = result.generators.length > 1
    ? 'Multiple AI metadata formats'
    : result.generators[0] === 'automatic1111' ? 'AUTOMATIC1111-compatible'
      : result.generators[0] === 'comfyui' ? 'ComfyUI'
        : result.generators[0] === 'novelai' ? 'NovelAI' : undefined;
  if (result.detected) result.limitations.push('Embedded metadata can be edited or copied and is not cryptographic proof of origin.');
  return result;
}

export function pngTextForRawTags(pngText: PngTextMetadata): Record<string, PngTextValue> | undefined {
  return Object.keys(pngText).length > 0 ? pngText : undefined;
}
