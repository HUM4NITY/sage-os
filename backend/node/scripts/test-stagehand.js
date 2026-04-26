// B3 — Verify the production browser-task path can find a product.

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runBrowserTask, shutdownStagehand } from '../src/stagehand-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
config({ path: resolve(repoRoot, '.env') });

const HARD_TIMEOUT_MS = Number(process.env.STAGEHAND_TIMEOUT_MS || 60_000);
const overall = setTimeout(() => {
  console.error(`✗ overall timeout (${HARD_TIMEOUT_MS}ms)`);
  process.exit(1);
}, HARD_TIMEOUT_MS);

try {
  console.log('… running browser task');
  const product = await runBrowserTask({
    goal: 'weekly pill organizer 7 day',
    onTrace: (text) => console.log(`  ${text}`),
  });
  await shutdownStagehand();
  clearTimeout(overall);

  console.log(`✓ Stagehand ok | ${product.title} | ${product.price}`);
  console.log(`  screenshot: ${resolve(repoRoot, product.screenshot_url.replace('/static/', 'out/'))}`);
  process.exit(0);
} catch (err) {
  clearTimeout(overall);
  try { await shutdownStagehand(); } catch {}
  console.error(`✗ ${err?.message ?? err}`);
  process.exit(1);
}
