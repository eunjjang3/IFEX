import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingDirectory = path.join(rootDirectory, '.desktop-build');
const applicationDirectory = path.join(stagingDirectory, 'app');
const releaseDirectory = path.join(rootDirectory, 'release');
const supportedPlatforms = new Set(['darwin', 'win32']);
const supportedArchitectures = new Set(['arm64', 'x64']);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

const platform = option('platform', process.platform);
const arch = option('arch', process.arch);
if (!supportedPlatforms.has(platform)) throw new Error(`Unsupported desktop platform: ${platform}`);
if (!supportedArchitectures.has(arch)) throw new Error(`Unsupported desktop architecture: ${arch}`);

const rootPackage = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const electronPackage = JSON.parse(await readFile(path.join(rootDirectory, 'node_modules', 'electron', 'package.json'), 'utf8'));
const packagedManifest = {
  name: rootPackage.name,
  productName: rootPackage.productName,
  version: rootPackage.version,
  description: rootPackage.description,
  license: rootPackage.license,
  type: 'module',
  main: 'electron/main.js',
};

await rm(stagingDirectory, { recursive: true, force: true });
await mkdir(applicationDirectory, { recursive: true });
await cp(path.join(rootDirectory, 'dist'), path.join(applicationDirectory, 'dist'), { recursive: true });
await cp(path.join(rootDirectory, 'electron'), path.join(applicationDirectory, 'electron'), {
  recursive: true,
  filter: (source) => !source.endsWith('.test.js'),
});
await writeFile(path.join(applicationDirectory, 'package.json'), `${JSON.stringify(packagedManifest, null, 2)}\n`);

const applicationPaths = await packager({
  dir: applicationDirectory,
  out: releaseDirectory,
  name: 'IFEX',
  executableName: 'IFEX',
  platform,
  arch,
  electronVersion: electronPackage.version,
  overwrite: true,
  asar: true,
  prune: false,
  appBundleId: 'io.ifex.desktop',
  appCategoryType: 'public.app-category.graphics-design',
  osxSign: platform === 'darwin'
    ? {
        identity: '-',
        identityValidation: false,
        optionsForFile: () => ({ hardenedRuntime: false }),
        preAutoEntitlements: false,
        continueOnError: false,
      }
    : undefined,
});

for (const applicationPath of applicationPaths) console.log(`Packaged IFEX: ${applicationPath}`);
