import { describe, expect, it } from 'vitest';
import { detectAiGenerationMetadata } from './aiMetadata';

describe('detectAiGenerationMetadata', () => {
  it('parses strict AUTOMATIC1111 infotext', () => {
    const result = detectAiGenerationMetadata({}, {
      parameters: 'a cat in neon light\nNegative prompt: blurry, low quality\nSteps: 24, Sampler: Euler a, CFG scale: 7, Seed: 1234, Size: 768x512, Model: test',
    });

    expect(result).toMatchObject({
      detected: true,
      generators: ['automatic1111'],
      positivePrompt: 'a cat in neon light',
      negativePrompt: 'blurry, low quality',
      parameters: { Steps: 24, Sampler: 'Euler a', 'CFG scale': 7, Seed: 1234, Size: '768x512', Model: 'test' },
    });
  });

  it('recognizes AUTOMATIC1111 EXIF UserComment', () => {
    const result = detectAiGenerationMetadata({
      UserComment: 'portrait\nSteps: 20, Sampler: DPM++ 2M, CFG scale: 6, Seed: 42',
    });

    expect(result.detected).toBe(true);
    expect(result.sources).toEqual([{ container: 'exif-user-comment', key: 'UserComment' }]);
  });

  it('recognizes structurally valid ComfyUI prompt and workflow JSON', () => {
    const prompt = { '1': { class_type: 'CLIPTextEncode', inputs: { text: 'forest at night' } } };
    const workflow = { nodes: [{ id: 1, type: 'KSampler' }], links: [] };
    const result = detectAiGenerationMetadata({}, { prompt: JSON.stringify(prompt), workflow: JSON.stringify(workflow) });

    expect(result.generators).toEqual(['comfyui']);
    expect(result.promptTexts).toEqual(['forest at night']);
    expect(result.promptGraph).toEqual(prompt);
    expect(result.workflow).toEqual(workflow);
  });

  it('recognizes NovelAI only with its software identity and known metadata', () => {
    const result = detectAiGenerationMetadata({}, {
      Software: 'NovelAI',
      Description: 'anime landscape',
      Comment: JSON.stringify({ uc: 'lowres', steps: 28, scale: 5, seed: 9, sampler: 'k_euler' }),
    });

    expect(result).toMatchObject({
      detected: true,
      generators: ['novelai'],
      positivePrompt: 'anime landscape',
      negativePrompt: 'lowres',
      parameters: { steps: 28, scale: 5, seed: 9, sampler: 'k_euler' },
    });
  });

  it('does not classify generic prompt-like metadata or malformed JSON', () => {
    expect(detectAiGenerationMetadata({}, { prompt: 'a normal caption' }).detected).toBe(false);
    expect(detectAiGenerationMetadata({}, { parameters: 'Steps: 20' }).detected).toBe(false);
    expect(detectAiGenerationMetadata({}, { Software: 'NovelAI', Comment: '{broken' }).detected).toBe(false);
  });

  it('keeps every generator when conflicting formats are embedded', () => {
    const result = detectAiGenerationMetadata({}, {
      parameters: 'cat\nSteps: 20, Sampler: Euler, CFG scale: 7, Seed: 1',
      prompt: JSON.stringify({ '1': { class_type: 'CLIPTextEncode', inputs: { text: 'cat' } } }),
    });

    expect(result.generators).toEqual(['comfyui', 'automatic1111']);
    expect(result.generatorLabel).toBe('Multiple AI metadata formats');
  });
});
