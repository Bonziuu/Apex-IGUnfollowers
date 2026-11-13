/*
 * Apex Unfollowers – Rdzeń: przeglądarka, i18n, stałe, pomocnicze funkcje, zapis lokalny, stan i porównywanie list.
 * Pliki content/*.js ładują się po kolei (manifest.json) i dzielą jedną przestrzeń nazw
 * skryptów wtyczki, dlatego deklaracje na najwyższym poziomie używają var / function.
 */
'use strict';

var ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

// W Firefoksie content.fetch() wysyła zapytanie "jako strona" (z ciasteczkami
// i originem instagram.com). W Chrome zwykły fetch z content scriptu robi to samo.
var pageFetch = (typeof content === 'object' && content && typeof content.fetch === 'function')
  ? content.fetch.bind(content)
  : window.fetch.bind(window);

var I18N = globalThis.ApexUnf_i18n;
var L = I18N.make('auto');
var t = (key, vars) => L.t(key, vars);

// ---------------------------------------------------------------- stałe
var BASE = 'https://www.instagram.com';
var REPO = 'https://github.com/Bonziuu/Apex-IGUnfollowers';
var SITE = 'https://apexsoftware.app';
var AUTHOR = {
  name: 'Konrad Woźniak',
  email: 'konrad.wozniak.1996@gmail.com',
  linkedin: 'https://www.linkedin.com/in/konrad-wo%C5%BAniak-23a5b831a',
};
var RESUME_MAX_AGE = 12 * 3600 * 1000;   // przerwany skan można wznowić przez 12 h
var DEFAULT_APP_ID = '936619743392459'; // publiczny identyfikator aplikacji webowej Instagrama
var PAGE_SIZE = 50;
var RENDER_STEP = 150;
var MAX_LOG = 100;
var MAX_HIST = 400;
var MAX_UNF_LOG = 500;
var DAY = 24 * 3600 * 1000;
var SPEEDS = {
  // [min, max] w milisekundach
  safe:   { page: [1500, 3000], every: 8,  long: [10000, 18000], between: [5000, 9000] },
  normal: { page: [700, 1500],  every: 12, long: [5000, 9000],   between: [3000, 5000] },
};
var UNF = {
  cooldownMs: 15000,                 // minimalny odstęp między odobserwowaniami
  limits: [10, 20, 30, 50, 100],     // dozwolone limity na 24 h
  defaultLimit: 30,
  blockFeedbackMs: 6 * 3600 * 1000,  // Instagram zablokował akcję („feedback_required”)
  blockSlowMs: 3600 * 1000,          // Instagram prosi o zwolnienie (HTTP 429)
};
// domyślne (anonimowe) zdjęcie profilowe Instagrama
var DEFAULT_PIC_RE = /44884218_345707102882519_2446069589734326272_n/;
var BACKUP_KEY_RE = /^(settings|lastUserId|(scan|log|wl|hist|unf|unfBlock):\d+)$/;
var BACKUP_APPS = ['apex-unfollowers', 'apex-igunfollowers'];   // druga nazwa: kopie z wersji 1.1.x

// ---------------------------------------------------------------- pomocnicze
var rand = (a, b) => Math.round(a + Math.random() * (b - a));
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var getCookie = (name) => {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
};
var fmtDate = (ts) => new Date(ts).toLocaleString(L.locale, { dateStyle: 'medium', timeStyle: 'short' });
var fmtDay = (ts) => new Date(ts).toLocaleDateString(L.locale, { day: 'numeric', month: 'short' });
var fmtTime = (ts) => new Date(ts).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' });
var fmtNum = (n) => Number(n).toLocaleString(L.locale);
var signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmtNum(Math.abs(n));
var el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
var isNoPic = (u) => (u.noPic != null ? u.noPic : DEFAULT_PIC_RE.test(u.pic || ''));

var store = {
  async get(key, def) {
    try {
      const r = await ext.storage.local.get(key);
      return r[key] === undefined ? def : r[key];
    } catch (e) {
      console.warn('[Apex Unfollowers] storage.get', e);
      return def;
    }
  },
  all: () => ext.storage.local.get(null),
  set: (key, val) => ext.storage.local.set({ [key]: val }),
  setMany: (obj) => ext.storage.local.set(obj),
  remove: (keys) => ext.storage.local.remove(keys),
};

var ScanError = class ScanError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.kind = kind;     // abort | auth | ratelimit | http | parse
    this.status = status;
  }
};

// Wartości, które strona www Instagrama wysyła w nagłówkach – odczytujemy je ze strony,
// a gdy ich tam nie ma, używamy znanych wartości domyślnych.
var DEFAULT_ASBD_ID = '359341';
var pageInfo = null;
function page() {
  if (!pageInfo) {
    const html = document.documentElement.innerHTML;
    const app = html.match(/"X-IG-App-ID":"(\d+)"/i) || html.match(/"APP_ID":"(\d+)"/);
    const asbd = html.match(/"ASBD_ID"\s*:\s*"?(\d+)/);
    pageInfo = { appId: app ? app[1] : DEFAULT_APP_ID, asbdId: asbd ? asbd[1] : DEFAULT_ASBD_ID };
  }
  return pageInfo;
}

function normUser(u) {
  const pic = u.profile_pic_url || '';
  return {
    // pk_id to zawsze tekst; pk bywa liczbą, która przy dużych ID traci precyzję w JSON
    id: String(u.pk_id ?? u.pk ?? u.id),
    username: u.username || '',
    name: u.full_name || '',
    pic,
    verified: !!u.is_verified,
    priv: !!u.is_private,
    noPic: !!u.has_anonymous_profile_picture || DEFAULT_PIC_RE.test(pic),
  };
}

// Indeks listy kont: dopasowanie po ID albo po nazwie użytkownika (Instagram podaje ID
// w różnych listach w różnej postaci, a nazwa użytkownika jest unikalna).
function makeIndex(list) {
  const ids = new Set();
  const names = new Set();
  for (const u of list) {
    ids.add(u.id);
    if (u.username) names.add(u.username.toLowerCase());
  }
  return { has: (u) => ids.has(u.id) || (!!u.username && names.has(u.username.toLowerCase())) };
}


// ---------------------------------------------------------------- stan
var state = {
  userId: null,
  scan: null,          // { ts, userId, username, followers: [user], following: [user] }
  log: [],             // [{ ts, since, lost: [user], gained: [user] }]
  hist: [],            // [{ ts, followers, following, mutual }]
  unfLog: [],          // [{ ts, id, username }] – odobserwowania z wtyczki
  unfBlock: 0,         // do kiedy wstrzymać odobserwowywanie (blokada akcji Instagrama)
  whitelist: new Set(),
  settings: { speed: 'safe', hideLauncher: false, lang: 'auto', unfLimit: UNF.defaultLimit, onboarded: false },
  view: 'lists',       // lists | stats | settings (ekran powitalny ma pierwszeństwo, dopóki nie zostanie zaakceptowany)
  resume: null,        // zapisany postęp przerwanego skanu { ts, phase, users, maxId, followers, username }
  lastError: null,     // ostatni błąd do zgłoszenia problemu { text, detail, at }
  tab: 'notBack',
  query: '',
  filter: 'all',       // all | verified | private | public | nopic
  sort: 'default',     // default | az | za
  showHidden: false,
  limit: RENDER_STEP,
  scanning: false,
  ctx: null,
  loaded: false,
  confirmId: null,
  confirmTimer: null,
  busyId: null,
  lastUnfAttempt: 0,   // ostatnia próba odobserwowania (także nieudana)
};

var countsOf = (scan) => {
  const fr = makeIndex(scan.followers);
  return {
    followers: scan.followers.length,
    following: scan.following.length,
    mutual: scan.following.filter((u) => fr.has(u)).length,
  };
};

async function loadAccount(userId) {
  state.userId = userId;
  state.scan = null;
  state.log = [];
  state.hist = [];
  state.unfLog = [];
  state.unfBlock = 0;
  state.resume = null;
  state.whitelist = new Set();
  if (!userId) return;
  state.scan = await store.get('scan:' + userId, null);
  state.log = await store.get('log:' + userId, []);
  state.hist = await store.get('hist:' + userId, []);
  state.unfLog = await store.get('unf:' + userId, []);
  state.unfBlock = await store.get('unfBlock:' + userId, 0);
  state.whitelist = new Set(await store.get('wl:' + userId, []));
  const resume = await store.get('resume:' + userId, null);
  state.resume = resume && Date.now() - resume.ts < RESUME_MAX_AGE ? resume : null;
  // skany z wersji 1.0.0 nie miały historii liczników – zaczynamy ją od ostatniego skanu
  if (!state.hist.length && state.scan) {
    state.hist = [{ ts: state.scan.ts, ...countsOf(state.scan) }];
    await store.set('hist:' + userId, state.hist);
  }
}

async function loadSettings() {
  const saved = await store.get('settings', {});
  state.settings = { ...state.settings, ...saved };
  if (!UNF.limits.includes(state.settings.unfLimit)) state.settings.unfLimit = UNF.defaultLimit;
  L = I18N.make(state.settings.lang);
}

async function ensureLoaded() {
  if (state.loaded) return;
  state.loaded = true;
  const id = getCookie('ds_user_id') || (await store.get('lastUserId', null));
  await loadAccount(id);
}

function computeLists() {
  if (!state.scan) return null;
  const fr = makeIndex(state.scan.followers);
  const fg = makeIndex(state.scan.following);
  return {
    notBack: state.scan.following.filter((u) => !fr.has(u)),
    fans: state.scan.followers.filter((u) => !fg.has(u)),
    mutual: state.scan.following.filter((u) => fr.has(u)),
  };
}

var lastUnf = () => Math.max(state.lastUnfAttempt, state.unfLog[0] ? state.unfLog[0].ts : 0);
var unfUsed = () => state.unfLog.filter((e) => e.ts > Date.now() - DAY).length;
