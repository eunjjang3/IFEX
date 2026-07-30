import database from '../data/lensfunCameras.json';

interface LensfunCameraRecord {
  maker: string;
  model: string;
  cropFactor: number;
  makerAliases?: string[];
  modelAliases?: string[];
}

export interface LensfunCameraMatch {
  maker: string;
  model: string;
  cropFactor: number;
  revision: string;
}

const CORPORATE_WORDS = new Set([
  'camera',
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'imaging',
  'limited',
  'ltd',
]);

function normalizeWords(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeMaker(value: string): string {
  return normalizeWords(value)
    .split(' ')
    .filter((word) => word && !CORPORATE_WORDS.has(word))
    .join(' ');
}

function normalizeModel(value: string): string {
  return normalizeWords(value);
}

function aliasesFor(record: LensfunCameraRecord, field: 'maker' | 'model'): string[] {
  const aliases = field === 'maker' ? record.makerAliases : record.modelAliases;
  return [record[field], ...(aliases || [])];
}

export function findLensfunCamera(cameraMake?: string, cameraModel?: string): LensfunCameraMatch | undefined {
  if (!cameraModel?.trim()) return undefined;
  const wantedModel = normalizeModel(cameraModel);
  const wantedMaker = cameraMake ? normalizeMaker(cameraMake) : '';
  if (!wantedModel) return undefined;

  const modelMatches = (database.cameras as LensfunCameraRecord[]).filter((record) =>
    aliasesFor(record, 'model').some((alias) => normalizeModel(alias) === wantedModel),
  );
  const makerMatches = wantedMaker
    ? modelMatches.filter((record) =>
        aliasesFor(record, 'maker').some((alias) => normalizeMaker(alias) === wantedMaker),
      )
    : modelMatches;
  const candidates = makerMatches.length > 0 ? makerMatches : [];

  // A model-only result is accepted only when it is unique. This avoids assigning
  // crop factors from an identically named model produced by another maker.
  const match = candidates.length === 1 ? candidates[0] : undefined;
  if (!match) return undefined;
  return {
    maker: match.maker,
    model: match.model,
    cropFactor: match.cropFactor,
    revision: database.revision,
  };
}
