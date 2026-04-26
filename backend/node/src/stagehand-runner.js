// Browser singleton — one Playwright browser for the life of the bridge.
//
// The earlier Stagehand wrapper added avoidable startup latency and occasional
// parse errors even though this flow only needs direct page navigation plus
// DOM extraction. A plain Playwright singleton is faster and more reliable for
// the demo path.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const outDir = resolve(repoRoot, 'out');

const HARD_TIMEOUT_MS = Number(process.env.STAGEHAND_TASK_TIMEOUT_MS || 60_000);
const AMAZON_RESULTS_SELECTOR = '[data-component-type="s-search-result"][data-asin]:not([data-asin=""])';

let browser = null;
let context = null;
let page = null;
let initPromise = null;
let taskChain = Promise.resolve();

export function prewarm() {
  ensureBrowser().catch((err) => {
    console.warn(`[browser] prewarm failed: ${err.message}`);
  });
}

async function ensureBrowser() {
  if (browser && context && page) {
    return { browser, context, page };
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      locale: 'en-US',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
    return { browser, context, page };
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function runBrowserTask({ goal, onTrace }) {
  if (!goal) throw new Error('goal is required');

  const run = async () => runBrowserTaskInternal({ goal, onTrace });
  taskChain = taskChain.catch(() => {}).then(run);
  return taskChain;
}

async function runBrowserTaskInternal({ goal, onTrace }) {
  const trace = onTrace ?? (() => {});

  let timer;
  const run = async () => {
    trace('opening amazon search results');
    const browserState = await ensureBrowser();
    const products = await loadAmazonProducts(browserState.page, goal, trace);
    const primary = products[0];

    const screenshotUrl = await captureScreenshot(browserState.page);

    trace({ text: `found: ${primary.spoken_name} · ${primary.price}`, screenshot_url: screenshotUrl });
    return {
      title: primary.title,
      price: primary.price,
      spoken_name: primary.spoken_name,
      results: products.map((product) => ({
        title: product.title,
        price: product.price,
        spoken_name: product.spoken_name,
      })),
      screenshot_url: screenshotUrl,
    };
  };

  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), HARD_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    await resetBrowser();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadAmazonProducts(activePage, goal, trace) {
  const queries = buildQueryVariants(goal);

  for (const [queryIndex, query] of queries.entries()) {
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&language=en_US`;
    if (queryIndex > 0) {
      trace(`trying a broader amazon search: ${query}`);
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      trace(`loading amazon results (attempt ${attempt})`);
      await activePage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await activePage.waitForLoadState('domcontentloaded');
      trace(`amazon results visible (attempt ${attempt})`);

      try {
        await Promise.race([
          activePage.locator(AMAZON_RESULTS_SELECTOR).first().waitFor({ timeout: 4_000 }),
          activePage.waitForTimeout(attempt === 1 ? 500 : 900),
        ]);
      } catch {
        // Fall through to DOM extraction for better error messaging.
      }

      const products = await activePage.evaluate((selector) => {
        const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
        const cards = Array.from(document.querySelectorAll(selector));
        const matches = [];

        for (const card of cards) {
          const title =
            clean(card.querySelector('h2 a span')?.textContent) ||
            clean(card.querySelector('h2 span')?.textContent);
          const price =
            clean(card.querySelector('.a-price .a-offscreen')?.textContent) ||
            clean(card.querySelector('[data-cy="price-recipe"] .a-offscreen')?.textContent);
          if (title && price) matches.push({ title, price });
          if (matches.length >= 4) break;
        }

        const bodyText = clean(document.body?.innerText || '');
        if (bodyText.includes('Enter the characters you see below')) {
          return { error: 'amazon presented a bot check' };
        }
        return matches;
      }, AMAZON_RESULTS_SELECTOR);

      if (Array.isArray(products) && products.length > 0) {
        return products.map((product) => ({
          ...product,
          spoken_name: summarizeProductTitle(product.title, goal),
        }));
      }

      if (products?.error) {
        trace(products.error);
        throw new Error(products.error);
      }

      trace(`amazon result extraction missed on attempt ${attempt}`);
    }
  }

  throw new Error('no priced Amazon result found');
}

function summarizeProductTitle(title, goal) {
  const cleanedTitle = String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/[|/]/g, ' ')
    .trim();
  const lowerTitle = cleanedTitle.toLowerCase();
  const lowerGoal = String(goal || '').toLowerCase();

  const organizerLabel = summarizeOrganizerTitle(lowerTitle);
  if (organizerLabel) {
    return organizerLabel;
  }

  for (const phrase of [
    'pill organizer',
    'pill case',
    'weekly organizer',
    'medicine case',
    'medicine organizer',
    'vitamin organizer',
  ]) {
    if (lowerTitle.includes(phrase) || lowerGoal.includes(phrase)) {
      return phrase;
    }
  }

  const firstClause = cleanedTitle.split(/[,:-]/, 1)[0]?.trim() || cleanedTitle;
  const words = firstClause.split(/\s+/).filter(Boolean);
  if (words.length <= 6) return firstClause;
  return words.slice(0, 6).join(' ');
}

function summarizeOrganizerTitle(lowerTitle) {
  const looksLikeOrganizer =
    lowerTitle.includes('pill organizer') ||
    lowerTitle.includes('pill case') ||
    lowerTitle.includes('vitamin organizer') ||
    lowerTitle.includes('medicine planner') ||
    lowerTitle.includes('pill box');
  if (!looksLikeOrganizer) return '';

  const descriptors = [];
  if (
    lowerTitle.includes('am pm') ||
    lowerTitle.includes('2 times a day') ||
    lowerTitle.includes('twice a day') ||
    lowerTitle.includes('medtime')
  ) {
    descriptors.push('AM/PM');
  }
  if (lowerTitle.includes('weekly') || lowerTitle.includes('7-day') || lowerTitle.includes('7 day')) {
    descriptors.push('weekly 7-day');
  }
  if (
    lowerTitle.includes('travel') ||
    lowerTitle.includes('portable') ||
    lowerTitle.includes('compact') ||
    lowerTitle.includes('small')
  ) {
    descriptors.push('travel');
  }
  if (
    lowerTitle.includes('x-large') ||
    lowerTitle.includes('xl') ||
    lowerTitle.includes('large compartments') ||
    lowerTitle.includes('large openings')
  ) {
    descriptors.push('large');
  }

  const label = [...new Set(descriptors)].join(' ').trim();
  return label ? `${label} pill organizer` : 'pill organizer';
}

function buildQueryVariants(goal) {
  const variants = [];
  const addVariant = (value) => {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    if (!variants.includes(cleaned)) {
      variants.push(cleaned);
    }
  };

  addVariant(goal);

  const lowerGoal = String(goal || '').toLowerCase();
  if (lowerGoal.includes('weekly 7 day pill organizer')) {
    addVariant('pill organizer 7 day');
    addVariant('weekly pill organizer');
    addVariant('pill organizer');
  } else if (lowerGoal.includes('pill organizer')) {
    addVariant(lowerGoal.replace('pill organizers', 'pill organizer'));
    addVariant('pill organizer');
  }

  return variants;
}

async function captureScreenshot(activePage) {
  const screenshotName = `${randomUUID()}.png`;
  await mkdir(outDir, { recursive: true });
  await activePage.screenshot({
    path: resolve(outDir, screenshotName),
    fullPage: false,
  });
  return `/static/${screenshotName}`;
}

async function resetBrowser() {
  try {
    await page?.close();
  } catch {
    // no-op
  }
  try {
    await context?.close();
  } catch {
    // no-op
  }
  try {
    await browser?.close();
  } catch {
    // no-op
  }

  page = null;
  context = null;
  browser = null;
}

export async function shutdownStagehand() {
  await resetBrowser();
}
