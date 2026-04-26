const path = require('path');
const { spawn } = require('child_process');

const electronVitePackageJson = require.resolve('electron-vite/package.json');
const rendererCli = path.join(path.dirname(electronVitePackageJson), 'bin', 'electron-vite.js');

const checks = [
  { label: 'python orchestrator', url: process.env.SAGE_PY_URL || 'http://127.0.0.1:7777/health' },
  { label: 'bridge', url: process.env.SAGE_BRIDGE_URL || 'http://127.0.0.1:3001/health' },
];

async function main() {
  console.log('[sage-electron] startup status');

  for (const check of checks) {
    const result = await checkHealth(check.url);
    if (result.ok) {
      console.log(`[sage-electron] ${check.label}: reachable (${check.url})`);
    } else {
      console.log(`[sage-electron] ${check.label}: not reachable (${check.url})`);
      console.log(`[sage-electron] ${check.label}: ${result.message}`);
    }
  }

  const child = spawn(process.execPath, [rendererCli, 'dev'], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error(`[sage-electron] failed to start electron-vite: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

async function checkHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

main().catch((error) => {
  console.error(`[sage-electron] startup check failed: ${error.message}`);
  process.exit(1);
});
