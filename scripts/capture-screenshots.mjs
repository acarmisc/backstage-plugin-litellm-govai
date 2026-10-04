// Regenerates the documentation screenshots in docs/images from the dev
// harness, which renders the plugin with the fixed data in
// packages/plugin-litellm/dev/mockApi.ts.
//
//   cd packages/plugin-litellm && npm start      # in one terminal
//   npm install --no-save --legacy-peer-deps playwright && npx playwright install chromium
//   node scripts/capture-screenshots.mjs
//
// BASE_URL overrides the dev server address (default http://localhost:3000).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'images');
const WIDTH = 1480;
// The dev harness renders an empty navigation column on the left; crop it out.
const NAV_WIDTH = 232;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: 1100 },
  deviceScaleFactor: 2,
});

async function open(route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
}

async function savePage(name) {
  const bottom = await page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll('[class*="MuiPaper-root"]')].map(
        e => e.getBoundingClientRect().bottom + window.scrollY,
      ),
    ),
  );
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: true,
    clip: { x: NAV_WIDTH, y: 0, width: WIDTH - NAV_WIDTH, height: Math.ceil(bottom + 24) },
  });
  console.log('saved', name);
}

async function saveDialog(name) {
  await page.waitForTimeout(800);
  await page.locator('[role=dialog]').last().screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
}

// Page tabs.
await open('/litellm');
await savePage('overview');

await open('/litellm?tab=keys');
await savePage('keys');

await open('/litellm?tab=teams');
await page.locator('[aria-label="Show team details"]:visible').first().click();
await page.waitForTimeout(2500);
await savePage('teams');

await open('/litellm?tab=models');
await page.locator('[role=combobox]').first().click();
await page.getByRole('option', { name: 'Platform Engineering' }).click();
await page.waitForTimeout(1200);
await savePage('models');

await open('/litellm?tab=audit');
await savePage('audit-log');

// Generate New Key, filled in, then the generated key with its snippets.
await open('/litellm?tab=keys');
await page.getByRole('button', { name: /generate new key/i }).first().click();
await page.waitForTimeout(1000);
const pickers = page.locator('[role=dialog] input[role=combobox]');
await pickers.nth(0).click();
await page.getByRole('option', { name: 'Platform Engineering', exact: true }).click();
await page.waitForTimeout(500);
await pickers.nth(1).click();
await page.getByRole('option').filter({ hasText: /^gpt-4o(?!-mini)/ }).first().click();
if (!(await page.getByRole('listbox').isVisible())) await pickers.nth(1).click();
await page.getByRole('option').filter({ hasText: /^claude-sonnet-4/ }).first().click();
// Click the title to close the picker: Escape would close the dialog.
await page.getByRole('heading', { name: 'Generate New Key' }).click();
await page.getByLabel(/max budget/i).fill('50');
await page.getByLabel(/^alias/i).fill('docs-assistant');
await saveDialog('generate-key-dialog');
await page.getByRole('button', { name: /^generate$/i }).click();
await page.waitForTimeout(1500);
await saveDialog('key-generated-dialog');

// Team administration.
await open('/litellm?tab=teams');
await page.getByRole('button', { name: /^edit$/i }).first().click();
await saveDialog('manage-team-dialog');

// Homepage cards.
await open('/home');
for (const [id, name] of [
  ['home-usage', 'home-widget'],
  ['home-gauges', 'budget-gauges'],
  ['home-policy', 'budget-policy-widget'],
]) {
  await page.locator(`[data-testid="${id}"]`).screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
}

await browser.close();
