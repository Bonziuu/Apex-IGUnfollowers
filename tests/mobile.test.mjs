// Apex Unfollowers – test paczki dla aplikacji na telefon (mobile/dist/apex-unfollowers.js).
// Ekran telefonu, dotyk, most do aplikacji jak na Androidzie (obiekt ApexUnfNative z addWebMessageListener)
// i symulowany Instagram. Prawdziwy Instagram nie jest dotykany.
//
//   npm run mobile && node --test tests/mobile.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-mobile.mjs')]);
const BUNDLE = fs.readFileSync(path.join(ROOT, 'mobile/dist/apex-unfollowers.js'), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
const SHOTS = process.env.SCREENSHOTS ? path.join(ROOT, 'docs', 'screens', 'mobile') : null;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const user = (i) => ({ pk: i, username: `konto.${i}`, full_name: `Osoba ${i}`, profile_pic_url: '', is_verified: i % 17 === 0, is_private: i % 5 === 0 });

// Most jak w aplikacji na Androida: pamięć klucz → tekst JSON, zapis plików i otwieranie linków.
// Pamięć trzymamy w sessionStorage, żeby przetrwała przeładowanie strony (jak pliki aplikacji).
const fakeAndroid = (initial) => `(() => {
  const KEY = '__apexTestStore';
  if (sessionStorage.getItem(KEY) === null) sessionStorage.setItem(KEY, JSON.stringify(${JSON.stringify(initial)}));
  const load = () => JSON.parse(sessionStorage.getItem(KEY));
  const listeners = [];
  window.__calls = [];
  window.ApexUnfNative = {
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
    postMessage(text) {
      const m = JSON.parse(text);
      const db = load();
      let result = null;
      if (m.op === 'get') { result = {}; for (const k of (m.keys || Object.keys(db))) if (k in db) result[k] = db[k]; }
      else if (m.op === 'set') { for (const k of Object.keys(m.items)) { if (typeof m.items[k] !== 'string') throw new Error('not a string'); db[k] = m.items[k]; } }
      else if (m.op === 'remove') { for (const k of m.keys) delete db[k]; }
      else if (m.op === 'clear') { for (const k of Object.keys(db)) delete db[k]; }
      else window.__calls.push(m);
      sessionStorage.setItem(KEY, JSON.stringify(db));
      setTimeout(() => listeners.forEach((fn) => fn({ data: JSON.stringify({ id: m.id, result }) })), 5);
    },
  };
  window.__store = () => { const db = load(); return Object.fromEntries(Object.entries(db).map(([k, v]) => [k, JSON.parse(v)])); };
})();`;

async function setup({ initial = {}, loggedOut = false } = {}) {
  const data = { followers: range(1, 130), following: range(60, 169) };
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await context.addCookies([
    ...(loggedOut ? [] : [{ name: 'ds_user_id', value: '999', domain: 'www.instagram.com', path: '/' }]),
    { name: 'csrftoken', value: 'abc', domain: 'www.instagram.com', path: '/' },
  ]);
  await context.route('https://www.instagram.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        // CSP jak na prawdziwym Instagramie (style inline dozwolone) + Trusted Types, żeby sprawdzić politykę panelu
        headers: { 'content-security-policy': "require-trusted-types-for 'script'" },
        body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:sans-serif"><script type="application/json">{"X-IG-App-ID":"936619743392459"} ["DTSGInitialData",[],{"token":"DTSG:abc"}] {"client_revision":1029384}</script><h1>Instagram (symulacja)</h1></body></html>',
      });
    }
    if (url.pathname === '/api/v1/accounts/current_user/') return route.fulfill({ json: { status: 'ok', user: { pk: 999, username: 'apex.test' } } });
    if (url.pathname === '/api/v1/users/999/info/') {
      return route.fulfill({ json: { status: 'ok', user: { username: 'apex.test', follower_count: data.followers.length, following_count: data.following.length } } });
    }
    if (url.pathname === '/api/v1/users/web_profile_info/') {
      return route.fulfill({ json: { status: 'ok', data: { user: { username: 'apex.test', edge_followed_by: { count: data.followers.length }, edge_follow: { count: data.following.length } } } } });
    }
    const m = url.pathname.match(/^\/api\/v1\/friendships\/999\/(followers|following)\/$/);
    if (m) {
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(fakeAndroid({ settings: JSON.stringify({ speed: 'normal' }), ...initial }));
  await page.addInitScript(() => { try { sessionStorage.setItem('www-claim-v2', 'hmac.TEST'); } catch {} });
  // jak w aplikacji: skrypt wstrzykiwany na początku dokumentu (addDocumentStartJavaScript / WKUserScript)
  await page.addInitScript(BUNDLE);
  await page.goto('https://www.instagram.com/');
  const root = page.locator('#apex-unfollowers-root');
  await root.locator('.panel').waitFor({ state: 'attached' });
  return { browser, page, root, data, errors };
}

const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
};

test('telefon: powitanie, skan, pełny ekran, zapis w aplikacji, CSV i linki przez most', { timeout: 120_000 }, async () => {
  const { browser, page, root, errors } = await setup();
  try {
    // zalogowany użytkownik: panel otwiera się sam, na całym ekranie
    await root.locator('.panel:not(.hidden)').waitFor();
    const box = await root.locator('.panel').boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844]);
    assert.equal(await root.locator('[data-ref=version]').textContent(), 'v' + VERSION);

    // ekran powitalny wymaga zgody
    await root.locator('[data-ref=vWelcome]:not(.hidden)').waitFor();
    await shot(page, 'welcome.png');
    await root.locator('[data-ref=acceptRisk]').tap();
    await root.locator('[data-ref=welcomeStart]').tap();
    // pola wyboru mają 16 px – iOS nie powiększa strony
    assert.equal(await root.locator('[data-ref=filter]').evaluate((n) => getComputedStyle(n).fontSize), '16px');

    await root.locator('[data-ref=scan]').tap();
    await root.locator('[data-ref=msg]:not(.hidden)', { hasText: 'Obserwujący' }).waitFor({ timeout: 60_000 });
    assert.match(await root.locator('[data-ref=msg]').textContent(), /Obserwujący: 130, obserwowani: 110/);
    assert.deepEqual((await root.locator('nav .cnt').allTextContents()).slice(0, 3), ['39', '59', '71']);
    await shot(page, 'lists.png');

    // wyniki zapisane w pamięci aplikacji (przez most)
    const stored = await page.evaluate(() => window.__store());
    assert.equal(stored['scan:999'].followers.length, 130);
    assert.equal(stored.settings.onboarded, true);

    // profil: link otwiera system (aplikacja Instagram / przeglądarka), strona nie przechodzi dalej
    await root.locator('.who a').first().tap();
    await page.waitForTimeout(100);
    assert.equal(page.url(), 'https://www.instagram.com/');
    // CSV: plik trafia do systemowego okna zapisu
    await root.locator('[data-ref=csv]').tap();
    await page.waitForFunction(() => window.__calls.some((c) => c.op === 'save'));
    const calls = await page.evaluate(() => window.__calls);
    const open = calls.find((c) => c.op === 'open');
    assert.equal(open.url, 'https://www.instagram.com/konto.131/');
    const save = calls.find((c) => c.op === 'save');
    assert.match(save.name, /^instagram-nie-obserwuja-cie-\d{4}-\d{2}-\d{2}\.csv$|^instagram-.*\.csv$/);
    assert.equal(save.mime, 'text/csv');
    assert.equal(save.text.trim().split('\r\n').length, 40);

    // statystyki i ustawienia mieszczą się w ekranie
    await root.locator('[data-ref=statsBtn]').tap();
    await shot(page, 'stats.png');
    await root.locator('[data-ref=settingsBtn]').tap();
    assert.equal(await root.locator('[data-ref=showLauncher]').isVisible(), false);
    await shot(page, 'settings.png');
    await root.locator('[data-ref=reportGithub]').tap();
    await page.waitForFunction(() => window.__calls.filter((c) => c.op === 'open').length === 2);
    const report = (await page.evaluate(() => window.__calls)).filter((c) => c.op === 'open')[1];
    assert.match(report.url, /^https:\/\/github\.com\/Bonziuu\/Apex-IGUnfollowers\/issues\/new\?/);
    assert.match(new URL(report.url).searchParams.get('browser'), /^Apex Unfollowers app \(android\)/);

    // przycisk „wstecz” zamyka panel
    assert.equal(await page.evaluate(() => window.__apexUnfBack()), true);
    assert.equal(await page.evaluate(() => window.__apexUnfBack()), false);

    // po przeładowaniu strony wyniki wracają z pamięci, panel nie otwiera się drugi raz sam
    await page.reload();
    await root.locator('.launcher').waitFor();
    await page.waitForTimeout(600);
    assert.equal(await root.locator('.panel').isHidden(), true);
    await root.locator('.launcher').tap();
    await root.locator('nav .cnt').first().waitFor();
    await page.waitForFunction(() => document.querySelector('#apex-unfollowers-root').shadowRoot.querySelector('nav .cnt').textContent === '39');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('telefon: wylogowany użytkownik – panel się nie narzuca, przycisk jest dostępny', { timeout: 60_000 }, async () => {
  const { browser, page, root, errors } = await setup({ loggedOut: true });
  try {
    await page.waitForTimeout(800);
    assert.equal(await root.locator('.panel').isHidden(), true);
    assert.equal(await root.locator('.launcher').isVisible(), true);
    const b = await root.locator('.launcher').boundingBox();
    assert.ok(b.width >= 56 && b.y + b.height < 844 - 80, 'przycisk nad dolnym paskiem Instagrama');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
