import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

// Exercise the copies actually loaded by packager, including nested installs.
const require = createRequire(import.meta.url);
const packagerRequire = createRequire(require.resolve('@electron/packager'));
const asarEntry = packagerRequire.resolve('@electron/asar');
const asarRequire = createRequire(asarEntry);
const asar = await import(pathToFileURL(asarEntry).href);
const { glob, globStream } = await import(pathToFileURL(asarRequire.resolve('glob')).href);
const { Minimatch } = await import(pathToFileURL(asarRequire.resolve('minimatch')).href);
const temporaryDirectories: string[] = [];

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ifex-packaging-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it.each(['asar', 'promise', 'stream'])('stops %s glob traversal after cancellation', async (mode) => {
  const directory = await fixture();
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      await mkdir(path.join(directory, String(i), String(j)), { recursive: true });
    }
  }
  const controller = new AbortController();
  const reason = new Error('cancel packaging traversal');
  let reads = 0;
  let pending = 0;
  const options = {
    cwd: directory,
    signal: controller.signal,
    fs: {
      readdir(filename: fs.PathLike, settings: { withFileTypes: true }, callback: (error: NodeJS.ErrnoException | null, entries: fs.Dirent[]) => void) {
        reads += 1;
        pending += 1;
        fs.readdir(filename, settings, (error, entries) => {
          // Cancel while the first read is in flight, before children are visited.
          if (reads === 1) controller.abort(reason);
          callback(error, entries);
          pending -= 1;
        });
      },
    },
  };
  const walk = mode === 'asar'
    ? asar.createPackageWithOptions(directory, path.join(directory, 'cancelled.asar'), { globOptions: options })
    : mode === 'promise'
      ? glob('**/*', options)
      : (async () => { for await (const entry of globStream('**/*', options)) void entry; })();
  try {
    await expect(walk).rejects.toBe(reason);
  } finally {
    // Drain callbacks before fixture cleanup, also when testing a vulnerable copy.
    do { await new Promise<void>((resolve) => setImmediate(resolve)); } while (pending > 0);
  }
  expect(reads).toBe(1);
});

it.each(['**/../a/b/', 'prefix/**/../a/b/'])('bounds amplification of %s patterns', (segment) => {
  expect(() => new Minimatch(`${segment.repeat(8)}end`, {
    optimizationLevel: 2,
    braceExpandMax: 64,
  })).toThrow(RangeError);
  const ordinary = new Minimatch('**/*.js', { optimizationLevel: 2 });
  expect(ordinary.match('electron/main.js')).toBe(true);
  expect(ordinary.match('dist/index.html')).toBe(false);
});

it.each(['**/../a/b/', 'prefix/**/../a/b/'])('bounds ASAR ESM traversal patterns for %s', async (segment) => {
  const directory = await fixture();
  await expect(asar.createPackageWithOptions(directory, path.join(directory, 'rejected.asar'), {
    pattern: `/${segment.repeat(8)}end`,
    globOptions: { braceExpandMax: 64 },
  })).rejects.toThrow(RangeError);
});

it('preserves ASAR contents, native unpacking, hidden files and internal symlinks', async () => {
  const directory = await fixture();
  const source = path.join(directory, 'app');
  const archive = path.join(directory, 'app.asar');
  const contents = new Map([
    ['package.json', '{"name":"fixture","main":"electron/main.js"}\n'],
    ['electron/main.js', 'console.log("fixture");\n'],
    ['dist/index.html', '<main>IFEX</main>\n'],
    ['dist/공백 파일.txt', '한글 fixture\n'],
    ['dist/.hidden/config.json', '{"hidden":true}\n'],
    ['native/addon.node', 'native unpack fixture\n'],
    ['.native/addon.node', 'hidden native unpack fixture\n'],
  ]);
  for (const [name, content] of contents) {
    const filename = path.join(source, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content);
  }
  // Directory symlinks require extra privileges on Windows; release bundles do not use them.
  if (process.platform !== 'win32') await symlink('dist', path.join(source, 'assets-link'));
  await asar.createPackageWithOptions(source, archive, { unpack: '**/{.**,**}/**/*.node' });
  for (const [name, content] of contents) {
    expect(asar.extractFile(archive, name).toString()).toBe(content);
    if (name.endsWith('.node')) {
      expect(asar.statFile(archive, name).unpacked).toBe(true);
      expect(await readFile(path.join(`${archive}.unpacked`, name), 'utf8')).toBe(content);
    }
  }
  if (process.platform !== 'win32') {
    expect(asar.statFile(archive, 'assets-link', false).link).toBe('dist');
    expect(asar.extractFile(archive, 'assets-link/index.html').toString()).toBe(contents.get('dist/index.html'));
    expect(asar.listPackage(archive).filter((name: string) => name.startsWith('/assets-link/'))).toEqual([]);
  }
});
