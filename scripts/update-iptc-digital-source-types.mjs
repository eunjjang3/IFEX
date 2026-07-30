import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceUrl = 'https://cv.iptc.org/newscodes/digitalsourcetype/?lang=en-GB&format=json';
const outputPath = path.resolve('src/data/iptcDigitalSourceTypes.json');
const requiredConcepts = new Set([
  'algorithmicallyEnhanced',
  'algorithmicMedia',
  'compositeWithTrainedAlgorithmicMedia',
  'trainedAlgorithmicMedia',
]);

const response = await fetch(sourceUrl, {
  headers: {
    Accept: 'application/ld+json, application/json',
    'User-Agent': 'ifex-iptc-vocabulary-updater',
  },
});
if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${sourceUrl}`);

const sourceText = await response.text();
const source = JSON.parse(sourceText);
if (!Array.isArray(source.conceptSet) || typeof source.dateReleased !== 'string') {
  throw new Error('The IPTC Digital Source Type response does not match the expected schema.');
}
if (source.licenceLink !== 'http://creativecommons.org/licenses/by/4.0/') {
  throw new Error(`Unexpected IPTC NewsCodes license: ${String(source.licenceLink)}`);
}

const concepts = source.conceptSet.map((concept) => {
  const uri = String(concept.uri || '');
  const id = uri.slice(uri.lastIndexOf('/') + 1);
  const label = concept.prefLabel?.['en-GB'];
  const definition = concept.definition?.['en-GB'];
  if (!id || !uri || typeof label !== 'string' || typeof definition !== 'string') {
    throw new Error(`Incomplete IPTC Digital Source Type concept: ${uri || '(missing URI)'}`);
  }
  return {
    id,
    uri,
    label,
    definition: definition.replace(/\s+/g, ' ').trim(),
    modified: String(concept.modified || ''),
    ...(concept.retired ? { retired: String(concept.retired) } : {}),
  };
}).sort((left, right) => left.id.localeCompare(right.id));

const ids = new Set(concepts.map((concept) => concept.id));
for (const id of requiredConcepts) {
  if (!ids.has(id)) throw new Error(`Required IPTC Digital Source Type is missing: ${id}`);
}

const database = {
  source: sourceUrl,
  sourceSha256: createHash('sha256').update(sourceText).digest('hex'),
  schemeUri: String(source.uri),
  revision: source.dateReleased,
  license: 'CC BY 4.0',
  transformed: 'IPTC Digital Source Type concepts reduced to stable English identifiers and definitions for local C2PA interpretation.',
  concepts,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
console.log(`Wrote ${concepts.length} IPTC Digital Source Type concepts from ${database.revision} to ${outputPath}`);
