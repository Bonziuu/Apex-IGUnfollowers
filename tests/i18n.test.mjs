import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../shared/i18n.js', import.meta.url), 'utf8');
const catalog = (lang) => JSON.parse(fs.readFileSync(new URL(`../_locales/${lang}/messages.json`, import.meta.url), 'utf8'));
const english = catalog('en');
const polish = catalog('pl');

function fixture({ browserLanguage, navigatorLanguage = 'en-US', fetchCatalog, catalogs = { en: english, pl: polish } } = {}) {
  const requests = [];
  const context = vm.createContext({
    navigator: { language: navigatorLanguage },
    chrome: {
      i18n: { getUILanguage: () => browserLanguage },
      runtime: {
        getURL: (file) => `chrome-extension://test/${file}`,
        async sendMessage({ type, lang }) {
          assert.equal(type, 'apex-unf:loadLocale');
          requests.push(lang);
          return catalogs[lang];
        },
      },
    },
    ...(fetchCatalog ? { location: { protocol: 'chrome-extension:' }, fetch: fetchCatalog } : {}),
  });
  vm.runInContext(source, context);
  return { i18n: context.ApexUnf_i18n, requests };
}

test('automatic language follows the browser UI and resolves regional variants', () => {
  const { i18n } = fixture({ browserLanguage: 'es-MX', navigatorLanguage: 'pl-PL' });
  assert.equal(i18n.resolve('auto'), 'es_419');
  for (const [tag, expected] of [
    ['es_419', 'es_419'], ['es-ES', 'es'], ['es-AR', 'es_419'], ['es-US', 'es_419'],
    ['pt-PT', 'pt_BR'], ['pt-BR', 'pt_BR'], ['zh', 'zh_CN'], ['zh-HK', 'zh_TW'],
    ['zh-Hans-TW', 'zh_CN'], ['zh-Hant-CN', 'zh_TW'], ['pl-PL', 'pl'], ['id-ID', 'id'],
    ['ar-SA', 'ar'], ['en-US', 'en'], ['not_a_locale', 'en'], ['sv-SE', 'en'],
  ]) assert.equal(i18n.resolve('auto', tag), expected, tag);
  assert.equal(fixture({ navigatorLanguage: 'uk-UA' }).i18n.resolve('auto'), 'uk');
});

test('saved language overrides automatic detection and legacy preferences are compatible', async () => {
  const { i18n, requests } = fixture({ browserLanguage: 'pl-PL' });
  for (const choice of i18n.languages) assert.equal(i18n.normalizePreference(choice.code), choice.code);
  assert.equal(i18n.normalizePreference('auto'), 'auto');
  assert.equal(i18n.normalizePreference(undefined), 'auto');
  assert.equal(i18n.normalizePreference('obsolete'), 'auto');
  assert.equal(i18n.resolve('obsolete'), 'pl');
  assert.equal((await i18n.load('en')).t('ui.scan'), english.ui_scan.message);
  assert.equal((await i18n.load('pl')).t('ui.scan'), polish.ui_scan.message);
  assert.equal((await i18n.load('auto')).t('ui.scan'), polish.ui_scan.message);
  assert.deepEqual(requests, ['en', 'pl']);
});

test('only needed catalogs load and concurrent callers share requests', async () => {
  const { i18n, requests } = fixture();
  const [a, b] = await Promise.all([i18n.load('pl'), i18n.load('pl')]);
  assert.equal(a.t('ui.scan'), b.t('ui.scan'));
  assert.equal(i18n.make('pl').t('ui.scan'), a.t('ui.scan'));
  assert.deepEqual(requests, ['en', 'pl']);
});

test('missing keys and catalogs fall back to English', async () => {
  const { i18n } = fixture({ catalogs: { en: english, pl: { ui_stats: { message: '' } } } });
  const pl = await i18n.load('pl');
  assert.equal(pl.lang, 'pl');
  assert.equal(pl.t('ui.scan'), english.ui_scan.message);
  assert.equal(pl.t('ui.stats'), english.ui_stats.message);
  assert.equal(pl.t('missing.key'), 'missing.key');
  const fallback = await i18n.load('ar');
  assert.equal(fallback.lang, 'en');
  assert.equal(fallback.dir, 'ltr');
  assert.equal(fallback.t('ui.scan'), english.ui_scan.message);
});

test('extension pages fetch only their packaged locale files', async () => {
  const urls = [];
  const { i18n, requests } = fixture({
    fetchCatalog: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => url.includes('/pl/') ? polish : english };
    },
  });
  assert.equal((await i18n.load('pl')).t('ui.scan'), polish.ui_scan.message);
  assert.deepEqual(requests, []);
  assert.deepEqual(urls, [
    'chrome-extension://test/_locales/en/messages.json',
    'chrome-extension://test/_locales/pl/messages.json',
  ]);
});

test('the translator formats values and supplies Arabic text direction', async () => {
  const arabic = { scan_followers: { message: 'المتابعون: {n}' } };
  const { i18n } = fixture({ catalogs: { en: english, ar: arabic } });
  const L = await i18n.load('ar');
  assert.equal(L.dir, 'rtl');
  assert.equal(L.t('scan.followers', { n: 1_234 }), `المتابعون: ${L.number(1_234)}`);
  assert.equal(L.t('scan.followers', { n: 0 }), `المتابعون: ${L.number(0)}`);
  const percent = Intl.NumberFormat('ar', { style: 'percent' }).format(0.25);
  assert.equal(L.percent(0.25), percent);
  assert.equal(L.t('stats.mutual', { p: percent }), english.stats_mutual.message.replace('{p}', percent));
  const ts = Date.UTC(2026, 10, 21, 13, 5);
  const dateOptions = { dateStyle: 'long', timeZone: 'UTC' };
  const timeOptions = { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' };
  assert.equal(L.date(ts, dateOptions), Intl.DateTimeFormat('ar', dateOptions).format(ts));
  assert.equal(L.time(ts, timeOptions), Intl.DateTimeFormat('ar', timeOptions).format(ts));
});
