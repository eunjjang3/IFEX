export type AiGeneratorId = 'automatic1111' | 'comfyui' | 'novelai';

export interface AiMetadataSource {
  container: 'png-text' | 'exif-user-comment';
  key: string;
}

export interface AiGenerationMetadata {
  detected: boolean;
  generators: AiGeneratorId[];
  generatorLabel?: string;
  confidence: 'none' | 'medium';
  positivePrompt?: string;
  negativePrompt?: string;
  promptTexts: string[];
  parameters: Record<string, string | number | boolean>;
  promptGraph?: unknown;
  workflow?: unknown;
  sources: AiMetadataSource[];
  limitations: string[];
}
