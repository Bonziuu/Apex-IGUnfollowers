// Apex IG Unfollowers – testy end-to-end na symulowanym Instagramie.
// Playwright przechwytuje https://www.instagram.com/** i odpowiada sztucznymi danymi w formacie
// wewnętrznego API (/api/v1/friendships/...). Prawdziwy Instagram nie jest dotykany.
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
// skrypty wtyczki w kolejności z manifest.json
const SCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).content_scripts[0].js.map((f) => path.join(ROOT, f));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
const SHOTS = process.env.SCREENSHOTS ? path.join(ROOT, 'docs', 'screens') : null;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const DAY = 24 * 3600 * 1000;

const user = (i) => ({
  pk: i, username: `konto.${i}`, full_name: `Osoba ${i}`, profile_pic_url: '',
  is_verified: i % 17 === 0, is_private: i % 5 === 0, has_anonymous_profile_picture: i % 7 === 0,
});
const stored = (i) => ({ id: String(i), username: `konto.${i}`, name: `Osoba ${i}`, pic: '', verified: false, priv: false, noPic: false });

// chrome.storage w pamięci + manifest, wstrzykiwane przed skryptami wtyczki
const stub = (initial) => `(() => {
  const mem = ${JSON.stringify(initial)};
  window.browser = {
    runtime: { onMessage: { addListener() {} }, getManifest: () => ({ version: '${VERSION}' }) },
    storage: { local: {
      async get(k) {
        if (k === null) return JSON.parse(JSON.stringify(mem));
        return k in mem ? { [k]: JSON.parse(JSON.stringify(mem[k])) } : {};
      },
      async set(o) { Object.assign(mem, JSON.parse(JSON.stringify(o))); },
      async remove(ks) { (Array.isArray(ks) ? ks : [ks]).forEach((k) => delete mem[k]); },
    } },
  };
  window.__mem = mem;
})();`;

// truncate: 'surface' – REST z search_surface ucina listę obserwowanych na 100 kontach, 'all' – każda metoda ją ucina
// unfollowResult: 'ok' | 'blocked' | 'noFs' (status ok bez friendship_status) | 'still' (ok, ale nic nie zrobił) | 'html'
// idMismatch: lista obserwowanych podaje inne ID (tylko nazwa użytkownika się zgadza)
async function setup({ colorScheme = 'light', locale = 'pl-PL', rateLimited = false, unfollowResult = 'ok', mem = {}, truncate = null, noInfo = false, idMismatch = false, following = range(60, 169), loggedOut = false } = {}) {
  const data = { followers: range(1, 130), following };
  const posts = [];
  const requests = [];
  const unfollowed = new Set();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 }, colorScheme, locale });
  await context.addCookies([
    ...(loggedOut ? [] : [{ name: 'ds_user_id', value: '999', domain: 'www.instagram.com', path: '/' }]),
    { name: 'csrftoken', value: 'abc', domain: 'www.instagram.com', path: '/' },
  ]);
  await context.route('https://www.instagram.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push(url.pathname);
    if (url.pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><body style="font-family:sans-serif"><script type="application/json">{"X-IG-App-ID":"936619743392459"} ["DTSGInitialData",[],{"token":"DTSG:abc"}] {"client_revision":1029384}</script><h1>Instagram (symulacja)</h1></body></html>',
      });
    }
    assert.equal(req.headers()['x-ig-app-id'], '936619743392459');
    if (req.method() === 'POST') {
      const h = req.headers();
      const form = new URLSearchParams(req.postData() || '');
      posts.push({ path: url.pathname, csrf: h['x-csrftoken'], claim: h['x-ig-www-claim'], ajax: h['x-instagram-ajax'], asbd: h['x-asbd-id'], session: h['x-web-session-id'], fbDtsg: form.get('fb_dtsg'), jazoest: form.get('jazoest'), userId: form.get('user_id') });
      const id = (url.pathname.match(/^\/api\/v1\/friendships\/destroy\/(\d+)\/$/) || [])[1];
      const html = () => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' });
      // jak prawdziwy Instagram: nieznany adres albo brak fb_dtsg → strona HTML z kodem 200
      if (!id || !form.get('fb_dtsg') || unfollowResult === 'html') return html();
      if (unfollowResult === 'blocked') return route.fulfill({ status: 400, json: { status: 'fail', message: 'feedback_required', spam: true } });
      if (unfollowResult === 'still') return route.fulfill({ json: { status: 'ok' } });
      unfollowed.add(id);
      if (unfollowResult === 'noFs') return route.fulfill({ json: { status: 'ok' } });
      return route.fulfill({ json: { status: 'ok', friendship_status: { following: false } } });
    }
    if (url.pathname === '/api/v1/users/999/info/' && noInfo) return route.fulfill({ status: 404, json: { status: 'fail', message: 'not found' } });
    if (url.pathname === '/api/v1/accounts/current_user/') return route.fulfill({ json: { status: 'ok', user: { pk: 999, username: 'apex.test' } } });
    if (url.pathname === '/api/v1/users/web_profile_info/') {
      return route.fulfill({ json: { status: 'ok', data: { user: { username: 'apex.test', edge_followed_by: { count: data.followers.length }, edge_follow: { count: data.following.length } } } } });
    }
    if (url.pathname === '/api/v1/users/999/info/') {
      return route.fulfill({ json: { status: 'ok', user: { username: 'apex.test', follower_count: data.followers.length, following_count: data.following.length } } });
    }
    const m = url.pathname.match(/^\/api\/v1\/friendships\/999\/(followers|following)\/$/);
    if (m) {
      if (rateLimited) return route.fulfill({ status: 429, json: { status: 'fail', message: 'Please wait a few minutes before you try again.' } });
      // wyszukiwarka w oknie „Obserwowani” (weryfikacja odobserwowania)
      const query = url.searchParams.get('query');
      if (query) {
        const found = data.following.filter((i) => `konto.${i}`.includes(query) && !unfollowed.has(String(i)));
        return route.fulfill({ json: { status: 'ok', users: found.map(user) } });
      }
      const list = data[m[1]];
      const start = Number(url.searchParams.get('max_id') || 0);
      const count = Number(url.searchParams.get('count'));
      const cut = m[1] === 'following' && (truncate === 'all' || (truncate === 'surface' && url.searchParams.has('search_surface'))) ? 100 : list.length;
      const toUser = m[1] === 'following' && idMismatch ? (i) => ({ ...user(i), pk: i + 5_000_000 }) : user;
      const body = { status: 'ok', users: list.slice(start, Math.min(start + count, cut)).map(toUser) };
      if (start + count < cut) body.next_max_id = String(start + count);
      return route.fulfill({ json: body });
    }
    return route.fulfill({ status: 404, json: { status: 'fail', message: 'not found' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(stub({ settings: { speed: 'normal', onboarded: true }, ...mem }));
  await page.addInitScript(() => { try { sessionStorage.setItem('www-claim-v2', 'hmac.TEST'); } catch {} });
  await page.goto('https://www.instagram.com/');
  for (const s of SCRIPTS) await page.addScriptTag({ path: s });
  await page.waitForTimeout(200);
  const root = page.locator('#apex-unfollowers-root');
  const msg = () => root.locator('[data-ref=msg]').textContent();
  const counts = () => root.locator('nav .cnt').allTextContents();
  const scan = async () => {
    await root.locator('[data-ref=msg]').evaluate((n) => { n.className = 'msg hidden'; });
    await root.locator('[data-ref=scan]').click();
    await root.locator('[data-ref=msg]:not(.hidden)').waitFor({ timeout: 60_000 });
  };
  return { browser, context, page, root, data, posts, requests, errors, msg, counts, scan };
}

const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name), clip: { x: 730, y: 0, width: 470, height: 860 } });
};

test('skan, listy, filtry, sortowanie, biała lista, zmiany, statystyki i CSV', { timeout: 120_000 }, async () => {
  const { browser, page, root, data, errors, msg, counts, scan } = await setup();
  try {
    await root.locator('.launcher').click();
    await scan();
    assert.match(await msg(), /Obserwujący: 130, obserwowani: 110/);
    assert.deepEqual(await counts(), ['39', '59', '71', '–']);
    assert.match(await root.locator('[data-ref=sub]').textContent(), /@apex\.test/);
    await shot(page, 'panel.png');

    // filtry i sortowanie (zakładka „Nie obserwują Cię”: konta 131–169)
    await root.locator('[data-ref=filter]').selectOption('verified');
    assert.deepEqual(await root.locator('.who a').allTextContents(), ['konto.136', 'konto.153']);
    await root.locator('[data-ref=filter]').selectOption('nopic');
    assert.deepEqual(await root.locator('.who a').allTextContents(), ['konto.133', 'konto.140', 'konto.147', 'konto.154', 'konto.161', 'konto.168']);
    await root.locator('[data-ref=filter]').selectOption('all');
    await root.locator('[data-ref=sort]').selectOption('za');
    assert.equal(await root.locator('.who a').first().textContent(), 'konto.169');
    await root.locator('[data-ref=sort]').selectOption('default');

    // biała lista
    await root.locator('.row .mini', { hasText: 'Ukryj' }).first().click();
    assert.equal((await counts())[0], '38');

    // drugi skan: 5 osób odeszło, 3 doszły
    data.followers = [...range(6, 130), 200, 201, 202];
    await scan();
    assert.match(await msg(), /−5 \/ \+3/);
    await root.locator('nav button[data-tab=changes]').click();
    assert.equal(await root.locator('.pill.lost').count(), 5);
    assert.equal(await root.locator('.pill.gained').count(), 3);
    await shot(page, 'changes.png');

    // statystyki
    await root.locator('[data-ref=statsBtn]').click();
    const tiles = await root.locator('[data-ref=stats] .tile .v').allTextContents();
    assert.equal(tiles[0], '128');
    assert.equal(tiles[4], '−2');                     // bilans 7 dni: +3 / −5
    assert.equal(await root.locator('[data-ref=stats] svg path.line').count(), 1);
    assert.equal(await root.locator('[data-ref=stats] table tr').count(), 3);
    await root.locator('[data-ref=stats] svg rect').hover();
    assert.match(await root.locator('.tip').textContent(), /^1(28|30) · /);
    await shot(page, 'stats.png');
    await root.locator('[data-ref=statsBtn]').click();

    // wyszukiwanie + CSV
    await root.locator('nav button[data-tab=fans]').click();
    await root.locator('[data-ref=search]').fill('konto.20');
    await page.waitForTimeout(250);
    assert.deepEqual(await root.locator('.who a').allTextContents(), ['konto.20', 'konto.200', 'konto.201', 'konto.202']);
    const [download] = await Promise.all([page.waitForEvent('download'), root.locator('[data-ref=csv]').click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.match(download.suggestedFilename(), /^instagram-ty-nie-obserwujesz-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(csv.trim().split('\r\n').length, 5);

    const keys = await page.evaluate(() => Object.keys(window.__mem).sort());
    assert.deepEqual(keys, ['hist:999', 'lastUserId', 'log:999', 'scan:999', 'settings', 'wl:999']);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('odobserwowanie: potwierdzenie, zapis, odstęp między akcjami', { timeout: 90_000 }, async () => {
  const { browser, root, page, posts, msg, counts, scan } = await setup();
  try {
    await root.locator('.launcher').click();
    await scan();
    const first = root.locator('.row').first();
    assert.equal(await first.locator('.who a').textContent(), 'konto.131');
    await first.locator('.mini.unf').click();
    assert.equal(await first.locator('.mini.unf').textContent(), 'Na pewno?');
    // napis musi być widoczny także pod kursorem (biały na czerwonym tle)
    await first.locator('.mini.unf').hover();
    assert.equal(await first.locator('.mini.unf').evaluate((b) => getComputedStyle(b).color), 'rgb(255, 255, 255)');
    assert.equal(posts.length, 0);
    await first.locator('.mini.unf').click();
    await root.locator('[data-ref=msg]', { hasText: 'Przestałeś obserwować' }).waitFor();
    assert.match(await msg(), /@konto\.131\. Dziś: 1\/30/);
    assert.deepEqual(posts.map((p) => [p.path, p.userId, p.csrf, p.claim, p.ajax, p.asbd, p.fbDtsg]),
      [['/api/v1/friendships/destroy/131/', '131', 'abc', 'hmac.TEST', '1029384', '359341', 'DTSG:abc']]);
    assert.match(posts[0].session, /^[a-z0-9]{6}:[a-z0-9]{6}:[a-z0-9]{6}$/);
    assert.equal(posts[0].jazoest, '2' + [...'DTSG:abc'].reduce((sum, ch) => sum + ch.charCodeAt(0), 0));
    assert.equal((await counts())[0], '38');
    assert.equal(await root.locator('.row .who a').first().textContent(), 'konto.132');

    // druga próba od razu: wymuszona przerwa
    await root.locator('.row .mini.unf').first().click();
    assert.match(await msg(), /Odczekaj jeszcze \d+ s/);
    assert.equal(posts.length, 1);

    const saved = await page.evaluate(() => ({ unf: window.__mem['unf:999'], following: window.__mem['scan:999'].following.length }));
    assert.equal(saved.unf.length, 1);
    assert.equal(saved.following, 109);
  } finally {
    await browser.close();
  }
});

test('odobserwowanie: dzienny limit i blokada akcji przez Instagram', { timeout: 60_000 }, async () => {
  const now = Date.now();
  const scanData = { ts: now - DAY, userId: '999', username: 'apex.test', followers: range(1, 5).map(stored), following: range(1, 10).map(stored) };
  // 10 odobserwowań w ostatnich 24 h przy limicie 10
  const full = range(1, 10).map((i) => ({ ts: now - 3600e3 * i, id: String(500 + i), username: `x${i}` }));
  let ctx = await setup({ mem: { lastUserId: '999', 'scan:999': scanData, 'unf:999': full, settings: { speed: 'normal', unfLimit: 10, onboarded: true } } });
  try {
    await ctx.root.locator('.launcher').click();
    await ctx.root.locator('.row .mini.unf').first().click();
    assert.match(await ctx.msg(), /dzienny limit odobserwowań \(10\/10/);
    assert.equal(ctx.posts.length, 0);
  } finally {
    await ctx.browser.close();
  }

  ctx = await setup({ unfollowResult: 'blocked', mem: { lastUserId: '999', 'scan:999': scanData } });
  try {
    await ctx.root.locator('.launcher').click();
    await ctx.root.locator('.row .mini.unf').first().click();
    await ctx.root.locator('.row .mini.unf').first().click();
    await ctx.root.locator('[data-ref=msg]', { hasText: 'zablokował' }).waitFor();
    assert.equal(ctx.posts.length, 1);
    assert.ok(await ctx.page.evaluate(() => window.__mem['unfBlock:999'] > Date.now() + 5 * 3600e3));
    await ctx.root.locator('.row .mini.unf').nth(1).click();
    assert.match(await ctx.msg(), /wstrzymane do/);
    assert.equal(ctx.posts.length, 1);
  } finally {
    await ctx.browser.close();
  }
});

test('odobserwowanie: potwierdzanie przez listę obserwowanych, HTML z kodem 200, czytelne błędy', { timeout: 90_000 }, async () => {
  const scanData = { ts: Date.now() - DAY, userId: '999', username: 'apex.test', followers: range(1, 5).map(stored), following: range(1, 10).map(stored) };
  const mem = { lastUserId: '999', 'scan:999': scanData };
  const following = range(1, 10);
  const unf = async (ctx) => {
    await ctx.root.locator('.launcher').click();
    await ctx.root.locator('.row .mini.unf').first().click();
    await ctx.root.locator('.row .mini.unf').first().click();
    await ctx.root.locator('[data-ref=msg]:not(.hidden)').waitFor({ timeout: 15_000 });
    return ctx.msg();
  };

  // 1) odpowiedź bez friendship_status → wtyczka szuka konta na liście obserwowanych i zalicza sukces
  let ctx = await setup({ unfollowResult: 'noFs', mem, following });
  try {
    assert.match(await unf(ctx), /Przestałeś obserwować @konto\.6/);
    assert.deepEqual(ctx.posts.map((p) => p.path), ['/api/v1/friendships/destroy/6/']);
  } finally { await ctx.browser.close(); }

  // 2) Instagram mówi „ok”, ale konto nadal jest na liście → bez fałszywego sukcesu
  ctx = await setup({ unfollowResult: 'still', mem, following });
  try {
    assert.match(await unf(ctx), /nadal obserwujesz @konto\.6/);
    assert.equal(await ctx.page.evaluate(() => (window.__mem['unf:999'] || []).length), 0);
  } finally { await ctx.browser.close(); }

  // 3) strona HTML z kodem 200 (jak w zgłoszeniu z 1.1.0) → komunikat z typem odpowiedzi, kolejna próba czeka 15 s
  ctx = await setup({ unfollowResult: 'html', mem, following });
  try {
    assert.match(await unf(ctx), /nie potwierdził odobserwowania \(HTTP 200, text\/html\)/);
    await ctx.root.locator('.row .mini.unf').nth(1).click();
    assert.match(await ctx.msg(), /Odczekaj jeszcze \d+ s/);
    assert.equal(ctx.posts.length, 1);
  } finally { await ctx.browser.close(); }
});

test('kompletność list: liczniki z web_profile_info, dociąganie uciętej listy, ostrzeżenie', { timeout: 150_000 }, async () => {
  // Instagram ucina listę obserwowanych (100 ze 110) tylko w wariancie z search_surface → druga metoda ją uzupełnia
  let ctx = await setup({ truncate: 'surface', noInfo: true, idMismatch: true });
  try {
    await ctx.root.locator('.launcher').click();
    await ctx.scan();
    assert.match(await ctx.msg(), /Obserwujący: 130, obserwowani: 110\./);
    assert.doesNotMatch(await ctx.msg(), /Uwaga|liczników/);
    assert.deepEqual(await ctx.counts(), ['39', '59', '71', '–']);
    assert.match(await ctx.root.locator('[data-ref=sub]').textContent(), /@apex\.test/);
  } finally { await ctx.browser.close(); }

  // każda metoda ucina listę → wyraźne ostrzeżenie zamiast cichych błędów
  ctx = await setup({ truncate: 'all', noInfo: true });
  try {
    await ctx.root.locator('.launcher').click();
    await ctx.scan();
    assert.match(await ctx.msg(), /obserwowani – pobrano 100 z 110/);
    assert.match(await ctx.root.locator('[data-ref=msg]').getAttribute('class'), /warn/);
  } finally { await ctx.browser.close(); }
});

test('ekran powitalny: panel czeka na akceptację ryzyka', { timeout: 60_000 }, async () => {
  const { browser, root, page } = await setup({ mem: { settings: { speed: 'normal', onboarded: false } } });
  try {
    await root.locator('.launcher').click();
    assert.equal(await root.locator('[data-ref=vWelcome]').isVisible(), true);
    assert.equal(await root.locator('[data-ref=scan]').isVisible(), false);
    assert.equal(await root.locator('[data-ref=welcomeStart]').isDisabled(), true);
    await shot(page, 'welcome-panel.png');
    await root.locator('[data-ref=acceptRisk]').check();
    await root.locator('[data-ref=welcomeStart]').click();
    assert.equal(await root.locator('[data-ref=scan]').isVisible(), true);
    assert.equal(await root.locator('[data-ref=vLists]').isVisible(), true);
    assert.equal(await page.evaluate(() => window.__mem.settings.onboarded), true);
  } finally {
    await browser.close();
  }
});

test('wznawianie skanu po zatrzymaniu, szacowany czas', { timeout: 120_000 }, async () => {
  const { browser, root, page, requests, msg, counts } = await setup();
  try {
    await root.locator('.launcher').click();
    await root.locator('[data-ref=scan]').click();
    // szacowany czas pojawia się po co najmniej 3 stronach
    await page.waitForFunction(() => /zostało ok\./.test(document.querySelector('#apex-unfollowers-root').shadowRoot.querySelector('[data-ref=ptext]').textContent), null, { timeout: 60_000 });
    // zatrzymanie w trakcie listy obserwowanych (po pierwszej stronie)
    await page.waitForFunction(() => /Obserwowani: [1-9]/.test(document.querySelector('#apex-unfollowers-root').shadowRoot.querySelector('[data-ref=ptext]').textContent), null, { timeout: 60_000 });
    await root.locator('[data-ref=scan]').click();
    await root.locator('[data-ref=msg]', { hasText: 'Skan wstrzymany' }).waitFor({ timeout: 15_000 });
    assert.match(await msg(), /Postęp zapisany \(1[0-9]{2} kont\)/);
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Wznów skan');
    assert.equal(await root.locator('[data-ref=resumeRow]').isVisible(), true);
    const saved = await page.evaluate(() => window.__mem['resume:999']);
    assert.equal(saved.phase, 'following');
    assert.equal(saved.followers.length, 130);

    const before = requests.filter((p) => p.endsWith('/followers/')).length;
    await root.locator('[data-ref=scan]').click();
    await root.locator('[data-ref=msg]', { hasText: 'Obserwujący: 130, obserwowani: 110' }).waitFor({ timeout: 60_000 });
    assert.equal(requests.filter((p) => p.endsWith('/followers/')).length, before, 'obserwujący nie są pobierani drugi raz');
    assert.deepEqual(await counts(), ['39', '59', '71', '–']);
    assert.equal(await page.evaluate(() => 'resume:999' in window.__mem), false);
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Skanuj');
  } finally {
    await browser.close();
  }
});

test('zgłoszenie problemu: przycisk przy błędzie otwiera gotowe zgłoszenie bez nazw kont', { timeout: 60_000 }, async () => {
  const scanData = { ts: Date.now() - DAY, userId: '999', username: 'apex.test', followers: range(1, 5).map(stored), following: range(1, 10).map(stored) };
  const ctx = await setup({ unfollowResult: 'html', mem: { lastUserId: '999', 'scan:999': scanData }, following: range(1, 10) });
  try {
    await ctx.root.locator('.launcher').click();
    await ctx.root.locator('.row .mini.unf').first().click();
    await ctx.root.locator('.row .mini.unf').first().click();
    await ctx.context.route('https://github.com/**', (r) => r.fulfill({ contentType: 'text/html', body: 'ok' }));
    const report = ctx.root.locator('[data-ref=msg] .linkbtn');
    await report.waitFor({ timeout: 15_000 });
    const [tab] = await Promise.all([ctx.context.waitForEvent('page'), report.click()]);
    const url = new URL(tab.url());
    assert.equal(url.origin + url.pathname, 'https://github.com/Bonziuu/Apex-IGUnfollowers/issues/new');
    assert.equal(url.searchParams.get('template'), 'bug.yml');
    assert.match(url.searchParams.get('version'), /^\d+\.\d+\.\d+$/);
    assert.match(url.searchParams.get('error'), /HTTP 200, text\/html[\s\S]*unfollow http HTTP 200/);
    assert.doesNotMatch(url.searchParams.get('error') + url.searchParams.get('title'), /konto\.\d/);
  } finally {
    await ctx.browser.close();
  }
});

test('limit zapytań (HTTP 429) podczas skanu: czekanie i przycisk Zatrzymaj', { timeout: 60_000 }, async () => {
  const { browser, root, page, msg } = await setup({ rateLimited: true });
  try {
    await root.locator('.launcher').click();
    await root.locator('[data-ref=scan]').click();
    await page.waitForTimeout(1500);
    assert.match(await root.locator('[data-ref=pnote]').textContent(), /HTTP 429\). Czekam 60 s/);
    await root.locator('[data-ref=scan]').click();
    await page.waitForTimeout(800);
    assert.match(await msg(), /Skan przerwany/);
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Skanuj');
  } finally {
    await browser.close();
  }
});

test('język: automatycznie EN dla przeglądarki po angielsku, przełączanie w ustawieniach', { timeout: 60_000 }, async () => {
  const { browser, root } = await setup({ locale: 'en-US' });
  try {
    await root.locator('.launcher').click();
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Scan');
    assert.match(await root.locator('nav').textContent(), /Don’t follow back/);
    await root.locator('[data-ref=settingsBtn]').click();
    await root.locator('[data-ref=lang]').selectOption('pl');
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Skanuj');
    assert.equal(await root.locator('[data-ref=vSettings]').isVisible(), true);
    assert.match(await root.locator('[data-ref=vSettings]').textContent(), /Kopia zapasowa/);
  } finally {
    await browser.close();
  }
});

test('kopia zapasowa: zapis, wyczyszczenie danych, wczytanie', { timeout: 90_000 }, async () => {
  const { browser, root, page, counts, scan, msg } = await setup();
  try {
    await root.locator('.launcher').click();
    await scan();
    await root.locator('[data-ref=settingsBtn]').click();
    await shot(page, 'settings.png');
    const [download] = await Promise.all([page.waitForEvent('download'), root.locator('[data-ref=export]').click()]);
    const file = await download.path();
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(backup.app, 'apex-unfollowers');
    assert.ok(backup.data['scan:999'] && backup.data['hist:999'] && backup.data.settings);

    await root.locator('[data-ref=wipe]').click();
    await root.locator('[data-ref=wipe]').click();
    assert.match(await msg(), /Usunięto/);
    assert.equal(await page.evaluate(() => 'scan:999' in window.__mem), false);

    await root.locator('[data-ref=importFile]').setInputFiles(file);
    await root.locator('[data-ref=msg]', { hasText: 'Wczytano kopię' }).waitFor();
    await root.locator('[data-ref=settingsBtn]').click();
    assert.deepEqual(await counts(), ['39', '59', '71', '–']);

    // plik spoza wtyczki jest odrzucany
    await root.locator('[data-ref=settingsBtn]').click();
    // (plik z dysku: wybór pliku przez użytkownika daje zaufane zdarzenie; plik podstawiony skryptem – nie)
    const bogus = path.join(path.dirname(file), 'x.json');
    fs.writeFileSync(bogus, '{"foo":1}');
    await root.locator('[data-ref=importFile]').setInputFiles(bogus);
    await root.locator('[data-ref=msg]', { hasText: 'To nie jest kopia' }).waitFor();
  } finally {
    await browser.close();
  }
});

test('zabezpieczenia: kliknięcia ze skryptu strony są ignorowane', { timeout: 90_000 }, async () => {
  const { browser, root, page, posts, scan } = await setup();
  try {
    await root.locator('.launcher').click();
    await scan();
    // skrypt strony próbuje kliknąć „Odobserwuj” dwa razy (potwierdzenie) i „Skanuj”, „Usuń dane”, „Ukryj”
    const before = await page.evaluate(() => JSON.stringify(window.__mem));
    await page.evaluate(() => {
      const sr = document.querySelector('#apex-unfollowers-root').shadowRoot;
      const unf = sr.querySelector('.row .mini.unf');
      unf.click(); unf.click();
      unf.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      sr.querySelector('.row .mini:not(.unf)').click();
      sr.querySelector('[data-ref=wipe]').click(); sr.querySelector('[data-ref=wipe]').click();
      sr.querySelector('[data-ref=scan]').click();
      const lim = sr.querySelector('[data-ref=unfLimit]'); lim.value = '100'; lim.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    assert.equal(posts.length, 0, 'brak zapytania odobserwowania');
    assert.equal(await root.locator('.row .mini.unf').first().textContent(), 'Odobserwuj');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__mem)), before, 'pamięć wtyczki bez zmian');
    assert.equal(await root.locator('[data-ref=scan]').textContent(), 'Skanuj');
  } finally {
    await browser.close();
  }
});

test('prywatność: po wylogowaniu panel nie pokazuje wyników poprzedniego konta', { timeout: 60_000 }, async () => {
  // zapisany skan konta 999 i lastUserId, ale brak ciasteczka ds_user_id (wylogowany)
  const scanData = { ts: Date.now() - DAY, userId: '999', username: 'apex.test', followers: range(1, 5).map(stored), following: range(1, 10).map(stored) };
  const { browser, root, page } = await setup({ loggedOut: true, mem: { lastUserId: '999', 'scan:999': scanData } });
  try {
    await root.locator('.launcher').click();
    assert.equal(await root.locator('.row').count(), 0);
    assert.match(await root.locator('.empty').first().textContent(), /Zaloguj się na Instagramie/);
    assert.doesNotMatch(await root.locator('[data-ref=sub]').textContent(), /apex\.test/);
    assert.ok(await page.evaluate(() => 'scan:999' in window.__mem), 'dane zostają w pamięci');
  } finally {
    await browser.close();
  }
});

test('ciemny motyw (zrzuty)', { timeout: 120_000, skip: !SHOTS }, async () => {
  const { browser, page, root, data, scan } = await setup({ colorScheme: 'dark' });
  try {
    await page.evaluate(() => { document.body.style.background = '#000'; document.body.style.color = '#fff'; });
    await root.locator('.launcher').click();
    await scan();
    await shot(page, 'panel-dark.png');
    data.followers = [...range(4, 130), 200, 201];
    await scan();
    await root.locator('[data-ref=statsBtn]').click();
    await shot(page, 'stats-dark.png');
  } finally {
    await browser.close();
  }
});
