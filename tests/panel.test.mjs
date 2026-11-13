// Apex IG Unfollowers – test end-to-end na symulowanym Instagramie.
// Playwright przechwytuje https://www.instagram.com/** i odpowiada sztucznymi danymi w formacie
// wewnętrznego API (/api/v1/friendships/{id}/followers|following/). Prawdziwy Instagram nie jest dotykany.
//
//   npm test                       uruchomienie
//   SCREENSHOTS=1 npm test         dodatkowo zapisuje zrzuty do docs/screens/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'content', 'unfollowers.js');
const SHOTS = process.env.SCREENSHOTS ? path.join(ROOT, 'docs', 'screens') : null;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const user = (i) => ({
  pk: i, username: `konto.${i}`, full_name: `Osoba ${i}`, profile_pic_url: '',
  is_verified: i % 17 === 0, is_private: i % 5 === 0,
});

// chrome.storage w pamięci + manifest, wstrzykiwane przed skryptem wtyczki
const STUB = `(() => {
  const mem = { settings: { speed: 'normal' } };
  window.browser = {
    runtime: { onMessage: { addListener() {} }, getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: {
      async get(k) { return k in mem ? { [k]: JSON.parse(JSON.stringify(mem[k])) } : {}; },
      async set(o) { Object.assign(mem, JSON.parse(JSON.stringify(o))); },
      async remove(ks) { (Array.isArray(ks) ? ks : [ks]).forEach((k) => delete mem[k]); },
    } },
  };
  window.__mem = mem;
})();`;

async function setup({ colorScheme = 'light', rateLimited = false } = {}) {
  const data = { followers: range(1, 130), following: range(60, 169) };
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 820 }, colorScheme });
  await context.addCookies([
    { name: 'ds_user_id', value: '999', domain: 'www.instagram.com', path: '/' },
    { name: 'csrftoken', value: 'abc', domain: 'www.instagram.com', path: '/' },
  ]);
  await context.route('https://www.instagram.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><body style="font-family:sans-serif"><script type="application/json">{"X-IG-App-ID":"936619743392459"}</script><h1>Instagram (symulacja)</h1></body></html>',
      });
    }
    assert.equal(route.request().headers()['x-ig-app-id'], '936619743392459');
    if (url.pathname === '/api/v1/users/999/info/') {
      return route.fulfill({ json: { status: 'ok', user: { username: 'apex.test', follower_count: data.followers.length, following_count: data.following.length } } });
    }
    const m = url.pathname.match(/^\/api\/v1\/friendships\/999\/(followers|following)\/$/);
    if (m) {
      if (rateLimited) return route.fulfill({ status: 429, json: { status: 'fail', message: 'Please wait a few minutes before you try again.' } });
      const list = data[m[1]];
      const start = Number(url.searchParams.get('max_id') || 0);
      const count = Number(url.searchParams.get('count'));
      const body = { status: 'ok', users: list.slice(start, start + count).map(user) };
      if (start + count < list.length) body.next_max_id = String(start + count);
      return route.fulfill({ json: body });
    }
    return route.fulfill({ status: 404, json: { status: 'fail', message: 'not found' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(STUB);
  await page.goto('https://www.instagram.com/');
  await page.addScriptTag({ path: SCRIPT });
  await page.waitForTimeout(200);
  const root = page.locator('#apex-igunfollowers-root');
  return { browser, page, root, data, errors };
}

const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name), clip: { x: 770, y: 0, width: 430, height: 820 } });
};

test('skan, listy, biała lista, zmiany, wyszukiwanie i CSV', { timeout: 120_000 }, async () => {
  const { browser, page, root, data, errors } = await setup();
  try {
    await root.locator('.launcher').click();
    await root.locator('[data-ref=scan]').click();
    await root.locator('[data-ref=msg]:not(.hidden)').waitFor({ timeout: 60_000 });
    assert.match(await root.locator('[data-ref=msg]').textContent(), /130 obserwujących, 110 obserwowanych/);

    const counts = await root.locator('nav .cnt').allTextContents();
    assert.deepEqual(counts, ['39', '59', '71', '–']);
    assert.match(await root.locator('[data-ref=sub]').textContent(), /@apex\.test/);
    await shot(page, 'panel.png');

    // biała lista
    await root.locator('.row .mini').first().click();
    assert.equal(await root.locator('nav .cnt').first().textContent(), '38');

    // drugi skan: 5 osób odeszło, 3 doszły
    data.followers = [...range(6, 130), 200, 201, 202];
    await root.locator('[data-ref=scan]').click();
    await page.waitForTimeout(300);
    await root.locator('[data-ref=msg]:not(.hidden)').waitFor({ timeout: 60_000 });
    assert.match(await root.locator('[data-ref=msg]').textContent(), /−5 \/ \+3/);
    await root.locator('nav button[data-tab=changes]').click();
    assert.equal(await root.locator('.pill.lost').count(), 5);
    assert.equal(await root.locator('.pill.gained').count(), 3);
    await shot(page, 'changes.png');

    // wyszukiwanie
    await root.locator('nav button[data-tab=fans]').click();
    await root.locator('[data-ref=search]').fill('konto.20');
    await page.waitForTimeout(250);
    assert.deepEqual(await root.locator('.who a').allTextContents(), ['konto.20', 'konto.200', 'konto.201', 'konto.202']);

    // CSV
    const [download] = await Promise.all([page.waitForEvent('download'), root.locator('[data-ref=csv]').click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.match(download.suggestedFilename(), /^instagram-ty-nie-obserwujesz-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(csv.trim().split('\r\n').length, 5);

    assert.deepEqual(await page.evaluate(() => Object.keys(window.__mem).sort()), ['lastUserId', 'log:999', 'scan:999', 'settings', 'wl:999']);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('limit zapytań (HTTP 429): czekanie i przycisk Zatrzymaj', { timeout: 60_000 }, async () => {
  const { browser, root, page } = await setup({ rateLimited: true });
  try {
    await root.locator('.launcher').click();
    await root.locator('[data-ref=scan]').click();
    await page.waitForTimeout(1500);
    assert.match(await root.locator('[data-ref=pnote]').textContent(), /HTTP 429\). Czekam 60 s/);
    await root.locator('[data-ref=scan]').click();
    await page.waitForTimeout(800);
    assert.match(await root.locator('[data-ref=msg]').textContent(), /Skan przerwany/);
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Skanuj');
  } finally {
    await browser.close();
  }
});

test('ciemny motyw (zrzut)', { timeout: 120_000, skip: !SHOTS }, async () => {
  const { browser, page, root } = await setup({ colorScheme: 'dark' });
  try {
    await page.evaluate(() => { document.body.style.background = '#000'; document.body.style.color = '#fff'; });
    await root.locator('.launcher').click();
    await root.locator('[data-ref=scan]').click();
    await root.locator('[data-ref=msg]:not(.hidden)').waitFor({ timeout: 60_000 });
    await shot(page, 'panel-dark.png');
  } finally {
    await browser.close();
  }
});
