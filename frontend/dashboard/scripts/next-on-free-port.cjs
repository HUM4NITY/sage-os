const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const mode = process.argv[2] || 'dev';
const preferredPort = Number(process.argv[3] || process.env.PORT || 3000);
const maxAttempts = 25;
const reservedPorts = new Set(
  (process.env.SAGE_RESERVED_PORTS || '3001,7777')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0),
);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const outDir = path.join(repoRoot, 'out');
const dashboardUrlFile = path.join(outDir, 'dashboard-dev-url.txt');

async function main() {
  const port = await findFreePort(preferredPort, maxAttempts);
  const nextCli = require.resolve('next/dist/bin/next');
  const url = `http://localhost:${port}`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(dashboardUrlFile, `${url}\n`, 'utf8');

  console.log(`[sage-dashboard] ${mode} using port ${port}`);
  console.log(`[sage-dashboard] ${mode} url ${url}`);

  const child = spawn(process.execPath, [nextCli, mode, '-p', String(port)], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });

  child.on('error', (error) => {
    console.error(`[sage-dashboard] failed to start next: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

function findFreePort(startPort, attemptsLeft, currentPort = startPort) {
  return new Promise((resolve, reject) => {
    if (attemptsLeft <= 0) {
      reject(new Error(`no free dashboard port found starting at ${startPort}`));
      return;
    }

    if (reservedPorts.has(currentPort)) {
      resolve(findFreePort(startPort, attemptsLeft - 1, currentPort + 1));
      return;
    }

    const server = net.createServer();
    server.unref();

    server.on('error', (error) => {
      server.close();
      if (error && error.code === 'EADDRINUSE' && attemptsLeft > 1) {
        resolve(findFreePort(startPort, attemptsLeft - 1, currentPort + 1));
        return;
      }
      reject(error);
    });

    server.listen(currentPort, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

main().catch((error) => {
  console.error(`[sage-dashboard] failed to choose a port: ${error.message}`);
  process.exit(1);
});
