import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repository = 'lensfun/lensfun';
const requestedRef = process.argv[2] || 'master';
const outputPath = path.resolve('src/data/lensfunCameras.json');

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ifex-lensfun-data-updater',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ifex-lensfun-data-updater' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .trim();
}

function valuesForTag(block, tag) {
  const matches = block.matchAll(new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g'));
  return [...matches].map((match) => decodeXml(match[1])).filter(Boolean);
}

function parseCameras(xml) {
  const records = [];
  for (const match of xml.matchAll(/<camera>([\s\S]*?)<\/camera>/g)) {
    const block = match[1];
    const makers = valuesForTag(block, 'maker');
    const models = valuesForTag(block, 'model');
    const cropFactor = Number(valuesForTag(block, 'cropfactor')[0]);
    if (!makers[0] || !models[0] || !Number.isFinite(cropFactor) || cropFactor <= 0) continue;
    records.push({
      maker: makers[0],
      model: models[0],
      cropFactor,
      ...(makers.length > 1 ? { makerAliases: [...new Set(makers.slice(1))] } : {}),
      ...(models.length > 1 ? { modelAliases: [...new Set(models.slice(1))] } : {}),
    });
  }
  return records;
}

const commit = await fetchJson(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(requestedRef)}`);
const revision = commit.sha;
const tree = await fetchJson(`https://api.github.com/repos/${repository}/git/trees/${revision}?recursive=1`);
const xmlPaths = tree.tree
  .filter((entry) => entry.type === 'blob' && /^data\/db\/[^/]+\.xml$/.test(entry.path))
  .map((entry) => entry.path)
  .sort();

if (xmlPaths.length === 0) throw new Error(`No Lensfun camera database XML files found at ${revision}`);

const documents = await Promise.all(
  xmlPaths.map((xmlPath) => fetchText(`https://raw.githubusercontent.com/${repository}/${revision}/${xmlPath}`)),
);
const cameras = documents
  .flatMap(parseCameras)
  .sort((left, right) => left.maker.localeCompare(right.maker) || left.model.localeCompare(right.model));

const database = {
  source: `https://github.com/${repository}/tree/${revision}/data/db`,
  revision,
  license: 'CC BY-SA 3.0',
  transformed: 'Lensfun camera XML entries reduced to maker/model aliases and crop factor for IFEX.',
  cameras,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
console.log(`Wrote ${cameras.length} Lensfun camera records from ${revision} to ${outputPath}`);
