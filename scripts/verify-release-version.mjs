import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const expectedTag = `v${packageJson.version}`;
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!tag) {
  throw new Error('Pass a release tag such as v1.2.3.');
}

if (!semanticVersionPattern.test(packageJson.version)) {
  throw new Error(`Package version ${packageJson.version} is not a valid semantic version.`);
}

if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}; expected ${expectedTag}.`);
}

console.log(`Release version verified: ${tag}`);
