import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const canary = 'IFEX_UNALLOWLISTED_VITE_CANARY_72c6e1';

const build = spawnSync(process.execPath, [viteCli, 'build'], {
  cwd: root,
  env: { ...process.env, VITE_IFEX_PROBE_SECRET: canary },
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(entryPath);
    if (entry.isFile()) return [entryPath];
    throw new Error(`Refusing unexpected build output entry: ${path.relative(root, entryPath)}`);
  });
}

const leakedFiles = filesUnder(dist).filter((filePath) => fs.readFileSync(filePath).includes(canary));
if (leakedFiles.length > 0) {
  throw new Error(`Unallowlisted VITE value leaked into: ${leakedFiles.map((filePath) => path.relative(root, filePath)).join(', ')}`);
}

console.log('Production bundle excludes unallowlisted VITE values.');
