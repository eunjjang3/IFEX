import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const developmentUrl = 'http://127.0.0.1:5173/';
const viteEntry = path.join(rootDirectory, 'node_modules', 'vite', 'bin', 'vite.js');
const viteProcess = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: rootDirectory,
  stdio: 'inherit',
});

let electronProcess;
let shuttingDown = false;

function stopProcess(child) {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopProcess(electronProcess);
  stopProcess(viteProcess);
  process.exitCode = exitCode;
}

async function waitForVite() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited with code ${viteProcess.exitCode}.`);
    try {
      const response = await fetch(developmentUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out while waiting for the Vite development server.');
}

process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(143));
viteProcess.once('error', (error) => {
  console.error(error);
  shutdown(1);
});

try {
  await waitForVite();
  electronProcess = spawn(electronPath, [rootDirectory], {
    cwd: rootDirectory,
    env: { ...process.env, IFEX_DESKTOP_DEV_URL: developmentUrl },
    stdio: 'inherit',
  });
  electronProcess.once('error', (error) => {
    console.error(error);
    shutdown(1);
  });
  electronProcess.once('exit', (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error);
  shutdown(1);
}
