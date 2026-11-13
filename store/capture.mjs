#!/usr/bin/env node
// Apex Unfollowers – zrzuty i grafiki do sklepów (Chrome Web Store, Firefox Add-ons, Edge Add-ons).
//
//   npm run store
//
// 1. Uruchamia prawdziwy panel wtyczki (skrypty z manifest.json) na symulowanym Instagramie
//    z fikcyjnymi kontami demonstracyjnymi (*_demo) – nie dotyka instagram.com.
// 2. Zapisuje surowe zrzuty panelu: store/panel/<pl|en>/*.png (też dla strony apexsoftware.app).
// 3. Składa z nich zrzuty sklepowe 1280×800 (store/screenshots/<pl|en>/) i grafiki promocyjne
//    440×280 i 1400×560 (store/promo/). Pliki JPEG – bez kanału alfa, jak wymagają sklepy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const SCRIPTS = manifest.content_scripts[0].js.map((f) => path.join(ROOT, f));
const LOGO = fs.readFileSync(path.join(ROOT, 'icons', 'logo.svg'), 'utf8');

// ---------------------------------------------------------------- dane demonstracyjne
const FIRST = ['anna', 'kuba', 'ola', 'marek', 'zosia', 'piotr', 'ewa', 'tomek', 'kasia', 'bartek', 'ala', 'szymon', 'magda', 'jan', 'iga', 'filip', 'ula', 'adam', 'nina', 'olek'];
const WORD = ['travels', 'photo', 'studio', 'daily', 'run', 'cooks', 'art', 'films', 'design', 'fit', 'music', 'books', 'garden', 'codes', 'coffee'];
const COLORS = ['#f2559f', '#cc1670', '#7c5cff', '#22b8a8', '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

function demoUser(i) {
  const first = FIRST[i % FIRST.length];
  const word = WORD[(i * 7) % WORD.length];
  const username = `${first}.${word}_demo${i > 40 ? i : ''}`;
  const name = `${first[0].toUpperCase()}${first.slice(1)} ${String.fromCharCode(65 + (i * 5) % 26)}.`;
  const color = COLORS[i % COLORS.length];
  const pic = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${color}"/>` +
    `<text x="20" y="26" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">${first[0].toUpperCase()}${word[0].toUpperCase()}</text></svg>`);
  return {
    pk: 1000 + i, username, full_name: name, profile_pic_url: i % 9 === 0 ? '' : pic,
    is_verified: i % 13 === 0, is_private: i % 4 === 0,
  };
}

// ---------------------------------------------------------------- panel na symulowanym Instagramie
const stub = (initial) => `(() => {
  const mem = ${JSON.stringify(initial)};
  window.browser = {
    runtime: { onMessage: { addListener() {} }, getManifest: () => ({ version: '${manifest.version}' }), sendMessage() {} },
    storage: { local: {
      async get(k) { if (k === null) return JSON.parse(JSON.stringify(mem)); return k in mem ? { [k]: JSON.parse(JSON.stringify(mem[k])) } : {}; },
      async set(o) { Object.assign(mem, JSON.parse(JSON.stringify(o))); },
      async remove(ks) { (Array.isArray(ks) ? ks : [ks]).forEach((k) => delete mem[k]); },
    } },
  };
})();`;

async function capturePanel(browser, lang) {
  const dir = path.join(OUT, 'panel', lang);
  fs.mkdirSync(dir, { recursive: true });
  const shots = {};
  for (const scheme of ['light', 'dark']) {
    const data = { followers: [...Array(412).keys()].filter((i) => i % 7 !== 3), following: [...Array(380).keys()].map((i) => i + 30) };
    const context = await browser.newContext({ viewport: { width: 1200, height: 860 }, colorScheme: scheme, locale: lang === 'pl' ? 'pl-PL' : 'en-US', deviceScaleFactor: 2 });
    await context.addCookies([{ name: 'ds_user_id', value: '999', domain: 'www.instagram.com', path: '/' }]);
    await context.route('https://www.instagram.com/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0;background:${scheme === 'dark' ? '#000' : '#fafafa'}"></body></html>` });
      }
      if (url.pathname === '/api/v1/users/999/info/') {
        return route.fulfill({ json: { status: 'ok', user: { username: 'apex.demo', follower_count: data.followers.length, following_count: data.following.length } } });
      }
      const m = url.pathname.match(/^\/api\/v1\/friendships\/999\/(followers|following)\/$/);
      if (m) {
        const list = data[m[1]];
        const start = Number(url.searchParams.get('max_id') || 0);
        const count = Number(url.searchParams.get('count'));
        const body = { status: 'ok', users: list.slice(start, start + count).map(demoUser) };
        if (start + count < list.length) body.next_max_id = String(start + count);
        return route.fulfill({ json: body });
      }
      return route.fulfill({ status: 404, json: { status: 'fail' } });
    });
    const page = await context.newPage();
    // historia z kilku dni wstecz, żeby wykres miał kształt
    const day = 24 * 3600 * 1000;
    const now = Date.now();
    const hist = [318, 322, 321, 327, 331, 330, 337, 342, 346].map((v, i) => ({ ts: now - (9 - i) * day, followers: v, following: 380, mutual: 300 }));
    await page.addInitScript(stub({ settings: { speed: 'normal', onboarded: scheme === 'light' ? false : true, lang }, lastUserId: '999', 'hist:999': hist }));
    await page.goto('https://www.instagram.com/');
    for (const s of SCRIPTS) await page.addScriptTag({ path: s });
    await page.waitForTimeout(200);
    const root = page.locator('#apex-unfollowers-root');
    const shot = async (name) => {
      const file = path.join(dir, `${name}${scheme === 'dark' ? '-dark' : ''}.png`);
      await page.screenshot({ path: file, clip: { x: 730, y: 0, width: 470, height: 860 } });
      shots[`${name}${scheme === 'dark' ? '-dark' : ''}`] = file;
    };
    await root.locator('.launcher').click();
    if (scheme === 'light') {
      await shot('welcome');
      await root.locator('[data-ref=acceptRisk]').check();
      await root.locator('[data-ref=welcomeStart]').click();
    }
    const scan = async () => {
      await root.locator('[data-ref=msg]').evaluate((n) => { n.className = 'msg hidden'; });
      await root.locator('[data-ref=scan]').click();
      await root.locator('[data-ref=msg]:not(.hidden)').waitFor({ timeout: 120_000 });
    };
    await scan();
    data.followers = data.followers.filter((i) => ![5, 12, 44, 101].includes(i)).concat([500, 501, 502, 503, 504, 505]);
    await scan();
    await root.locator('[data-ref=msg]').evaluate((n) => { n.className = 'msg hidden'; });
    await shot('lists');
    // potwierdzenie odobserwowania przy pierwszej osobie
    await root.locator('.row .mini.unf').first().click();
    await shot('unfollow');
    await page.waitForTimeout(4200);
    await root.locator('nav button[data-tab=changes]').click();
    await shot('changes');
    await root.locator('[data-ref=statsBtn]').click();
    await shot('stats');
    await root.locator('[data-ref=settingsBtn]').click();
    await shot('settings');
    await context.close();
  }
  return shots;
}

// ---------------------------------------------------------------- kompozycje
const TEXT = {
  pl: {
    name: 'Apex Unfollowers', sub: 'dla Instagrama',
    tagline: 'Kto nie obserwuje Cię na Instagramie – lokalnie i za darmo',
    demo: 'Dane demonstracyjne',
    shots: [
      ['lists', 'Zobacz, kto nie obserwuje Cię nawzajem', ['Nie obserwują Cię, Ty nie obserwujesz, Wzajemni', 'Filtry, sortowanie i biała lista', 'Eksport do CSV']],
      ['changes', 'Wiedz, kto przestał Cię obserwować', ['Zmiany od poprzedniego skanu', 'Kto odszedł, a kto doszedł', 'Historia zapisuje się lokalnie']],
      ['stats', 'Statystyki i wykres obserwujących', ['Liczniki ze zmianą od ostatniego skanu', 'Bilans 7 i 30 dni', 'Wykres i tabela historii']],
      ['unfollow', 'Odobserwuj ostrożnie, jedno konto naraz', ['Potwierdzenie przed każdą akcją', '15 s przerwy i limit dzienny', 'Sukces dopiero po potwierdzeniu Instagrama']],
      ['welcome', 'Lokalnie, bez konta i bez hasła', ['Działa w Twojej przeglądarce', 'Bez telemetrii i serwera', 'Darmowa i open source']],
    ],
    bullets: ['Bez hasła i bez konta', 'Dane zostają w przeglądarce', 'Darmowa, open source'],
  },
  en: {
    name: 'Apex Unfollowers', sub: 'for Instagram',
    tagline: 'See who doesn’t follow you back on Instagram – local and free',
    demo: 'Demo data',
    shots: [
      ['lists', 'See who doesn’t follow you back', ['Don’t follow back, You don’t follow, Mutual', 'Filters, sorting and a whitelist', 'CSV export']],
      ['changes', 'Know who unfollowed you', ['Changes since the previous scan', 'Who left and who joined', 'History stays on your device']],
      ['stats', 'Follower stats and chart', ['Counters with change since last scan', '7 and 30-day balance', 'Chart and scan history table']],
      ['unfollow', 'Unfollow carefully, one at a time', ['Confirmation before every action', '15-second breaks and a daily limit', 'Counted only when Instagram confirms']],
      ['welcome', 'Local, no account, no password', ['Runs in your browser', 'No telemetry, no server', 'Free and open source']],
    ],
    bullets: ['No password, no account', 'Data stays in your browser', 'Free and open source'],
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const img = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #17171c; -webkit-font-smoothing: antialiased; }
  .bg { position: absolute; inset: 0; background: radial-gradient(1200px 600px at 85% 20%, #fde6f1 0%, #fff5fa 45%, #ffffff 100%); }
  .logo svg { width: 100%; height: 100%; display: block; }
  .name { font-weight: 750; letter-spacing: -.02em; }
  .sub { color: #cc1670; font-weight: 650; }
  ul { list-style: none; padding: 0; display: grid; }
  li { display: flex; gap: 12px; align-items: center; color: #3a3a44; }
  li::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(160deg, #f2559f, #cc1670); flex: none; }
  .panel { border-radius: 18px; box-shadow: 0 30px 70px rgba(120, 10, 60, .22), 0 4px 14px rgba(0,0,0,.08); }
  .demo { position: absolute; font-size: 13px; color: #9a9aa6; }
`;

function screenshotHtml(t, [, title, points], panel) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body { width: 1280px; height: 800px; position: relative; overflow: hidden; }
    .left { position: absolute; left: 80px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand .logo { width: 52px; height: 52px; }
    .brand .name { font-size: 26px; }
    .brand .sub { font-size: 16px; }
    h1 { font-size: 50px; line-height: 1.08; letter-spacing: -.03em; font-weight: 780; }
    ul { gap: 14px; font-size: 22px; }
    .panel { position: absolute; right: 90px; top: 40px; height: 720px; }
    .demo { right: 92px; bottom: 12px; }
  </style></head><body><div class="bg"></div>
    <div class="left">
      <div class="brand"><div class="logo">${LOGO}</div><div><div class="name">${esc(t.name)}</div><div class="sub">${esc(t.sub)}</div></div></div>
      <h1>${esc(title)}</h1>
      <ul>${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>
    <img class="panel" src="${img(panel)}">
    <div class="demo">${esc(t.demo)}</div>
  </body></html>`;
}

function smallTileHtml(t) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body { width: 440px; height: 280px; position: relative; overflow: hidden; background: linear-gradient(150deg, #f2559f, #cc1670 70%, #a1105a); color: #fff; }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 24px; }
    .badge { width: 84px; height: 84px; border-radius: 22px; background: #fff; display: grid; place-items: center; box-shadow: 0 10px 30px rgba(80,0,40,.3); }
    .badge .logo { width: 58px; height: 58px; }
    .name { font-size: 30px; }
    .sub { color: #ffe3f0; font-size: 16px; margin-top: -8px; }
  </style></head><body><div class="wrap">
    <div class="badge"><div class="logo">${LOGO}</div></div>
    <div class="name">${esc(t.name)}</div><div class="sub">${esc(t.sub)}</div>
  </div></body></html>`;
}

function marqueeHtml(t, panel) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body { width: 1400px; height: 560px; position: relative; overflow: hidden; }
    .left { position: absolute; left: 90px; top: 0; bottom: 0; width: 720px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .brand .logo { width: 64px; height: 64px; }
    .brand .name { font-size: 44px; }
    .brand .sub { font-size: 20px; }
    h1 { font-size: 34px; line-height: 1.2; letter-spacing: -.02em; font-weight: 700; color: #2a2a33; }
    ul { gap: 10px; font-size: 21px; }
    .panel { position: absolute; right: 110px; top: 34px; height: 620px; }
  </style></head><body><div class="bg"></div>
    <div class="left">
      <div class="brand"><div class="logo">${LOGO}</div><div><div class="name">${esc(t.name)}</div><div class="sub">${esc(t.sub)}</div></div></div>
      <h1>${esc(t.tagline)}</h1>
      <ul>${t.bullets.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>
    <img class="panel" src="${img(panel)}">
  </body></html>`;
}

async function render(browser, html, size, file) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.waitForTimeout(100);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  await page.close();
  return path.relative(ROOT, file);
}

export async function buildStoreAssets() {
  const browser = await chromium.launch();
  const written = [];
  try {
    for (const lang of ['pl', 'en']) {
      const shots = await capturePanel(browser, lang);
      written.push(...Object.values(shots).map((f) => path.relative(ROOT, f)));
      const t = TEXT[lang];
      let n = 1;
      for (const item of t.shots) {
        const file = path.join(OUT, 'screenshots', lang, `${String(n++).padStart(2, '0')}-${item[0]}-1280x800.jpg`);
        written.push(await render(browser, screenshotHtml(t, item, shots[item[0]]), { width: 1280, height: 800 }, file));
      }
      const suffix = lang === 'pl' ? '-pl' : '';
      written.push(await render(browser, smallTileHtml(t), { width: 440, height: 280 }, path.join(OUT, 'promo', `small-tile-440x280${suffix}.jpg`)));
      written.push(await render(browser, marqueeHtml(t, shots.lists), { width: 1400, height: 560 }, path.join(OUT, 'promo', `marquee-1400x560${suffix}.jpg`)));
    }
  } finally {
    await browser.close();
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = await buildStoreAssets();
  console.log(files.map((f) => '  ' + f).join('\n'));
}
