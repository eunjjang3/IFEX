import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModulesRoot = path.join(root, 'node_modules');
const lockPath = path.join(root, 'package-lock.json');
const fallbackManifestPath = path.join(root, 'third_party/runtime/license-fallbacks.json');
const outputPaths = [
  path.join(root, 'third_party/runtime/DEPENDENCY-LICENSES.txt'),
  path.join(root, 'public/third-party/dependency-licenses.txt'),
];
const checkOnly = process.argv.includes('--check');
const MAX_LICENSE_BYTES = 2 * 1024 * 1024;

function normalizedText(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Refusing non-regular license file: ${path.relative(root, filePath)}`);
  }
  if (stat.size > MAX_LICENSE_BYTES) {
    throw new Error(`License file exceeds ${MAX_LICENSE_BYTES} bytes: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, 'utf8')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function oneLine(value) {
  return String(value).replaceAll(/[\r\n\t]+/g, ' ').trim();
}

function licenseExpression(manifest) {
  if (typeof manifest.license === 'string') return oneLine(manifest.license);
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((license) => typeof license === 'string' ? license : license?.type)
      .filter(Boolean)
      .map(oneLine)
      .join(' OR ');
  }
  return 'See included license text';
}

function repositoryUrl(manifest) {
  const repository = typeof manifest.repository === 'string'
    ? manifest.repository
    : manifest.repository?.url;
  return oneLine(repository?.replace(/^git\+/, '').replace(/\.git$/, '') ?? manifest.homepage ?? '');
}

function licenseFallbacks() {
  const manifest = JSON.parse(fs.readFileSync(fallbackManifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !manifest.packages || typeof manifest.packages !== 'object') {
    throw new Error('Expected license-fallbacks.json schemaVersion 1 with a packages object.');
  }
  return manifest.packages;
}

function productionPackages() {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const fallbacks = licenseFallbacks();
  if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object') {
    throw new Error('Expected an npm lockfileVersion 3 package-lock.json.');
  }

  const packages = new Map();
  for (const [packagePath, lockEntry] of Object.entries(lock.packages)) {
    if (!packagePath.includes('node_modules/') || lockEntry.dev === true || lockEntry.optional === true || lockEntry.link === true) continue;

    const directory = path.resolve(root, packagePath);
    if (!directory.startsWith(`${nodeModulesRoot}${path.sep}`)) {
      throw new Error(`Package path escapes node_modules: ${packagePath}`);
    }
    const manifestPath = path.join(directory, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Missing ${packagePath}; run npm ci before generating licenses.`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const key = `${manifest.name}@${manifest.version}`;
    if (packages.has(key)) continue;

    const discoveredLicenseFiles = fs.readdirSync(directory)
      .filter((name) => /^(licen[sc]e|copying|notice)(\..*)?$/i.test(name))
      .sort((left, right) => left.localeCompare(right, 'en'));
    if (!manifest.license && !manifest.licenses && discoveredLicenseFiles.length === 0) {
      throw new Error(`${key} has no license metadata or top-level license file.`);
    }

    let fallbackSource;
    const licenseFiles = discoveredLicenseFiles.map((name) => ({ name, text: normalizedText(path.join(directory, name)) }));
    if (licenseFiles.length === 0) {
      const fallback = fallbacks[key];
      if (!fallback || typeof fallback.path !== 'string' || typeof fallback.source !== 'string') {
        throw new Error(`${key} has no top-level license file and no version-pinned fallback.`);
      }
      const fallbackPath = path.resolve(root, fallback.path);
      const fallbackRoot = path.join(root, 'third_party', 'runtime', 'license-fallbacks');
      if (!fallbackPath.startsWith(`${fallbackRoot}${path.sep}`)) {
        throw new Error(`${key} fallback path must stay under third_party/runtime/license-fallbacks.`);
      }
      licenseFiles.push({
        name: `BUNDLED-FALLBACK-${path.basename(fallbackPath)}`,
        text: normalizedText(fallbackPath),
      });
      fallbackSource = oneLine(fallback.source);
    }

    packages.set(key, {
      name: manifest.name,
      version: manifest.version,
      license: licenseExpression(manifest),
      repository: repositoryUrl(manifest),
      licenseFiles,
      fallbackSource,
    });
  }

  return [...packages.values()].sort((left, right) => (
    left.name.localeCompare(right.name, 'en') || left.version.localeCompare(right.version, 'en')
  ));
}

function render(packages) {
  const sections = packages.map((pkg) => {
    const metadata = [
      `${pkg.name}@${pkg.version}`,
      '-'.repeat(`${pkg.name}@${pkg.version}`.length),
      `License: ${pkg.license}`,
      ...(pkg.repository ? [`Upstream: ${pkg.repository}`] : []),
      ...(pkg.fallbackSource ? [`Bundled license source: ${pkg.fallbackSource}`] : []),
    ];
    const licenseTexts = pkg.licenseFiles.flatMap((licenseFile) => [
      '',
      `[${licenseFile.name}]`,
      licenseFile.text,
    ]);
    return [...metadata, ...licenseTexts].join('\n');
  });

  return [
    'IFEX production dependency licenses',
    '===================================',
    '',
    'Generated by scripts/generate-production-licenses.mjs from the production',
    'dependency graph pinned in package-lock.json. Do not edit this file manually.',
    `Included package versions: ${packages.length}`,
    '',
    ...sections.flatMap((section) => [section, '']),
  ].join('\n').trimEnd() + '\n';
}

const output = render(productionPackages());
if (checkOnly) {
  const stale = outputPaths.filter((outputPath) => !fs.existsSync(outputPath) || normalizedText(outputPath) !== output.trim());
  if (stale.length > 0) {
    console.error(`Production dependency license output is stale: ${stale.map((filePath) => path.relative(root, filePath)).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('Production dependency license output is current.');
  }
} else {
  for (const outputPath of outputPaths) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output);
    console.log(`Wrote ${path.relative(root, outputPath)}`);
  }
}
