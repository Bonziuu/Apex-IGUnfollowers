/*
 * Apex IG Unfollowers – content script (Chrome / Edge / Brave / Opera / Firefox, Manifest V3)
 *
 * Działa wyłącznie na www.instagram.com i korzysta z Twojej zalogowanej sesji.
 * Skan tylko CZYTA listy obserwujących / obserwowanych. Jedyna akcja na koncie to
 * ręczne „Odobserwuj” przy pojedynczym koncie: z potwierdzeniem, odstępem i limitem dziennym.
 * Nic nie jest wysyłane poza instagram.com – dane zostają w chrome.storage.local.
 *
 * Teksty interfejsu: shared/i18n.js (PL / EN), ładowany wcześniej jako content script.
 */
(() => {
  'use strict';
  if (window.__apexIgUnfollowersLoaded) return;
  window.__apexIgUnfollowersLoaded = true;

  const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // W Firefoksie content.fetch() wysyła zapytanie "jako strona" (z ciasteczkami
  // i originem instagram.com). W Chrome zwykły fetch z content scriptu robi to samo.
  const pageFetch = (typeof content === 'object' && content && typeof content.fetch === 'function')
    ? content.fetch.bind(content)
    : window.fetch.bind(window);

  const I18N = globalThis.ApexIGU_i18n;
  let L = I18N.make('auto');
  const t = (key, vars) => L.t(key, vars);

  // ---------------------------------------------------------------- stałe
  const BASE = 'https://www.instagram.com';
  const REPO = 'https://github.com/Bonziuu/Apex-IGUnfollowers';
  const DEFAULT_APP_ID = '936619743392459'; // publiczny identyfikator aplikacji webowej Instagrama
  const PAGE_SIZE = 50;
  const RENDER_STEP = 150;
  const MAX_LOG = 100;
  const MAX_HIST = 400;
  const MAX_UNF_LOG = 500;
  const DAY = 24 * 3600 * 1000;
  const SPEEDS = {
    // [min, max] w milisekundach
    safe:   { page: [1500, 3000], every: 8,  long: [10000, 18000], between: [5000, 9000] },
    normal: { page: [700, 1500],  every: 12, long: [5000, 9000],   between: [3000, 5000] },
  };
  const UNF = {
    cooldownMs: 15000,                 // minimalny odstęp między odobserwowaniami
    limits: [10, 20, 30, 50, 100],     // dozwolone limity na 24 h
    defaultLimit: 30,
    blockFeedbackMs: 6 * 3600 * 1000,  // Instagram zablokował akcję („feedback_required”)
    blockSlowMs: 3600 * 1000,          // Instagram prosi o zwolnienie (HTTP 429)
  };
  // domyślne (anonimowe) zdjęcie profilowe Instagrama
  const DEFAULT_PIC_RE = /44884218_345707102882519_2446069589734326272_n/;
  const BACKUP_KEY_RE = /^(settings|lastUserId|(scan|log|wl|hist|unf|unfBlock):\d+)$/;

  // ---------------------------------------------------------------- pomocnicze
  const rand = (a, b) => Math.round(a + Math.random() * (b - a));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const fmtDate = (ts) => new Date(ts).toLocaleString(L.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const fmtDay = (ts) => new Date(ts).toLocaleDateString(L.locale, { day: 'numeric', month: 'short' });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' });
  const fmtNum = (n) => Number(n).toLocaleString(L.locale);
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmtNum(Math.abs(n));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const isNoPic = (u) => (u.noPic != null ? u.noPic : DEFAULT_PIC_RE.test(u.pic || ''));

  const store = {
    async get(key, def) {
      try {
        const r = await ext.storage.local.get(key);
        return r[key] === undefined ? def : r[key];
      } catch (e) {
        console.warn('[Apex IG Unfollowers] storage.get', e);
        return def;
      }
    },
    all: () => ext.storage.local.get(null),
    set: (key, val) => ext.storage.local.set({ [key]: val }),
    setMany: (obj) => ext.storage.local.set(obj),
    remove: (keys) => ext.storage.local.remove(keys),
  };

  class ScanError extends Error {
    constructor(message, kind, status) {
      super(message);
      this.kind = kind;     // abort | auth | ratelimit | http | parse
      this.status = status;
    }
  }

  function detectAppId() {
    const html = document.documentElement.innerHTML;
    const m = html.match(/"X-IG-App-ID":"(\d+)"/i) || html.match(/"APP_ID":"(\d+)"/);
    return m ? m[1] : DEFAULT_APP_ID;
  }

  function normUser(u) {
    const pic = u.profile_pic_url || '';
    return {
      id: String(u.pk ?? u.pk_id ?? u.id),
      username: u.username || '',
      name: u.full_name || '',
      pic,
      verified: !!u.is_verified,
      priv: !!u.is_private,
      noPic: !!u.has_anonymous_profile_picture || DEFAULT_PIC_RE.test(pic),
    };
  }

  // ---------------------------------------------------------------- sieć
  function makeCtx(speedKey) {
    const ctx = {
      aborted: false,
      appId: detectAppId(),
      speed: SPEEDS[speedKey] || SPEEDS.safe,
      onNote: null,
      // czekanie, które da się przerwać przyciskiem "Zatrzymaj"
      async wait(ms) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          if (ctx.aborted) throw new ScanError(t('err.abort'), 'abort');
          await sleep(Math.min(250, end - Date.now()));
        }
        if (ctx.aborted) throw new ScanError(t('err.abort'), 'abort');
      },
      async pace(page) {
        const s = ctx.speed;
        if (page % s.every === 0) {
          const ms = rand(...s.long);
          ctx.onNote?.(t('note.pause', { s: Math.round(ms / 1000) }));
          await ctx.wait(ms);
          ctx.onNote?.(null);
        } else {
          await ctx.wait(rand(...s.page));
        }
      },
    };
    return ctx;
  }

  const igHeaders = (appId) => ({
    'accept': 'application/json',
    'x-ig-app-id': appId,
    'x-requested-with': 'XMLHttpRequest',
    'x-csrftoken': getCookie('csrftoken') || '',
  });

  async function igGet(path, ctx, attempts = 4) {
    const url = BASE + path;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (ctx.aborted) throw new ScanError(t('err.abort'), 'abort');
      const last = attempt === attempts;

      let res;
      try {
        res = await pageFetch(url, { method: 'GET', credentials: 'include', headers: igHeaders(ctx.appId) });
      } catch (e) {
        if (last) throw new ScanError(t('err.network'), 'http');
        ctx.onNote?.(t('note.retryNet', { a: attempt, n: attempts }));
        await ctx.wait(5000 * attempt);
        continue;
      }

      let data = null;
      try { data = await res.json(); } catch { data = null; }
      const msg = data ? String(data.message || data.feedback_message || '') : '';

      if (res.ok && data && data.status !== 'fail') return data;

      if (data && (data.checkpoint_url || /checkpoint/i.test(msg))) {
        throw new ScanError(t('err.checkpoint'), 'auth', res.status);
      }
      if (data && (data.require_login || /login_required/i.test(msg))) {
        throw new ScanError(t('err.login'), 'auth', res.status);
      }

      const limited = res.status === 429 || (data && data.spam) ||
        /wait|spam|feedback_required|try again|rate.?limit/i.test(msg);
      if (limited || res.status >= 500) {
        if (last) break;
        const sec = 60 * attempt;
        ctx.onNote?.(t('note.slowDown', { status: res.status, s: sec }));
        await ctx.wait(sec * 1000);
        ctx.onNote?.(null);
        continue;
      }

      if (res.status === 401 || res.status === 403) throw new ScanError(t('err.noAccess'), 'auth', res.status);
      if (!data) throw new ScanError(t('err.unexpected', { status: res.status }), 'parse', res.status);
      throw new ScanError(t('err.ig', { status: res.status, msg: msg ? ': ' + msg : '' }), 'http', res.status);
    }
    throw new ScanError(t('err.ratelimit'), 'ratelimit');
  }

  // Metoda główna: REST API używane przez stronę www (lista "Obserwujący"/"Obserwowani").
  // opts.count – rozmiar strony; opts.surface – parametr search_surface (strona www dodaje go przy listach)
  async function fetchListRest(kind, userId, ctx, onCount, opts = {}) {
    const users = [];
    const seen = new Set();
    let maxId = null;
    let count = opts.count || PAGE_SIZE;
    const surface = opts.surface !== false;
    let page = 0;
    for (;;) {
      const q = new URLSearchParams({ count: String(count) });
      if (surface) q.set('search_surface', 'follow_list_page');
      if (maxId) q.set('max_id', maxId);
      let data;
      try {
        data = await igGet(`/api/v1/friendships/${userId}/${kind}/?${q}`, ctx);
      } catch (e) {
        if (e.kind === 'http' && e.status === 400 && count !== 12) { count = 12; continue; }
        e.page = page;
        throw e;
      }
      const batch = data.users || [];
      for (const raw of batch) {
        const u = normUser(raw);
        if (!seen.has(u.id)) { seen.add(u.id); users.push(u); }
      }
      onCount(users.length);
      page++;
      maxId = data.next_max_id != null && data.next_max_id !== '' ? String(data.next_max_id) : null;
      if (!maxId || batch.length === 0) break;
      await ctx.pace(page);
    }
    return users;
  }

  // Metoda zapasowa: starsze zapytania GraphQL (gdyby Instagram zmienił REST).
  const GQL = {
    followers: { hash: 'c76146de99bb02f6415203be841dd25a', edge: 'edge_followed_by' },
    following: { hash: '3dec7e2c57367ef3da3d987d89f9dbc8', edge: 'edge_follow' },
  };
  async function fetchListGraphql(kind, userId, ctx, onCount) {
    const { hash, edge } = GQL[kind];
    const users = [];
    const seen = new Set();
    let after = null;
    let page = 0;
    for (;;) {
      const vars = { id: userId, include_reel: false, fetch_mutual: false, first: PAGE_SIZE };
      if (after) vars.after = after;
      const data = await igGet(`/graphql/query/?query_hash=${hash}&variables=${encodeURIComponent(JSON.stringify(vars))}`, ctx);
      const conn = data && data.data && data.data.user && data.data.user[edge];
      if (!conn) throw new ScanError(t('err.format'), 'parse');
      for (const e of conn.edges || []) {
        const u = normUser(e.node);
        if (!seen.has(u.id)) { seen.add(u.id); users.push(u); }
      }
      onCount(users.length);
      page++;
      const pi = conn.page_info || {};
      if (!pi.has_next_page || !pi.end_cursor) break;
      after = pi.end_cursor;
      await ctx.pace(page);
    }
    return users;
  }

  async function fetchList(kind, userId, ctx, onCount) {
    try {
      return await fetchListRest(kind, userId, ctx, onCount);
    } catch (e) {
      if (e.page === 0 && (e.kind === 'http' || e.kind === 'parse')) {
        console.warn('[Apex IG Unfollowers] REST nie zadziałał, próbuję GraphQL', e);
        ctx.onNote?.(t('note.fallback'));
        await ctx.wait(rand(2000, 4000));
        ctx.onNote?.(null);
        return await fetchListGraphql(kind, userId, ctx, onCount);
      }
      throw e;
    }
  }

  // Lista z kontrolą kompletności: gdy brakuje wyraźnie więcej kont niż wynika z licznika profilu,
  // dociągamy listę innymi metodami i łączymy wyniki (Instagram bywa niekonsekwentny w stronicowaniu).
  const isShort = (got, expected) => expected > 0 && expected - got > Math.max(2, Math.round(expected * 0.01));

  async function fetchComplete(kind, userId, ctx, expected, onCount) {
    let users = await fetchList(kind, userId, ctx, onCount);
    if (!isShort(users.length, expected)) return users;
    const variants = [
      ['rest12', () => fetchListRest(kind, userId, ctx, () => {}, { count: 12, surface: false })],
      ['graphql', () => fetchListGraphql(kind, userId, ctx, () => {})],
    ];
    for (const [name, run] of variants) {
      console.warn(`[Apex IG Unfollowers] ${kind}: ${users.length} z ${expected}, dociągam (${name})`);
      ctx.onNote?.(t('note.repair', { got: fmtNum(users.length), expected: fmtNum(expected) }));
      await ctx.wait(rand(...ctx.speed.between));
      let extra;
      try {
        extra = await run();
      } catch (e) {
        if (e.kind === 'abort' || e.kind === 'auth') throw e;
        console.warn(`[Apex IG Unfollowers] ${kind}: ${name} nie zadziałał`, e);
        continue;
      }
      // pełniejsza lista wyznacza kolejność, druga uzupełnia braki
      const [base, add] = extra.length > users.length ? [extra, users] : [users, extra];
      const ids = new Set(base.map((u) => u.id));
      users = [...base, ...add.filter((u) => !ids.has(u.id))];
      onCount(users.length);
      if (!isShort(users.length, expected)) break;
    }
    ctx.onNote?.(null);
    return users;
  }

  async function resolveAccount(ctx) {
    let id = getCookie('ds_user_id');
    let username = null;
    if (!id) {
      try {
        const d = await igGet('/api/v1/accounts/current_user/?edit=true', ctx, 1);
        if (d && d.user) {
          id = d.user.pk != null ? String(d.user.pk) : (d.user.pk_id || null);
          username = d.user.username || null;
        }
      } catch (e) {
        if (e.kind === 'abort') throw e;
      }
    }
    if (!id) {
      const m = document.documentElement.innerHTML.match(/"viewerId":"(\d+)"/);
      if (m) id = m[1];
    }
    if (!id) throw new ScanError(t('err.noAccount'), 'auth');
    // Liczniki z profilu – tylko do paska postępu, więc błędy ignorujemy.
    let counts = null;
    try {
      const d = await igGet(`/api/v1/users/${id}/info/`, ctx, 1);
      if (d && d.user) {
        username = d.user.username || username;
        counts = { followers: d.user.follower_count || 0, following: d.user.following_count || 0 };
      }
    } catch (e) {
      if (e.kind === 'abort') throw e;
    }
    // nazwa konta, gdy /info/ jej nie zwrócił
    if (!username) {
      try {
        const d = await igGet('/api/v1/accounts/current_user/?edit=true', ctx, 1);
        username = (d && d.user && d.user.username) || null;
      } catch (e) {
        if (e.kind === 'abort') throw e;
      }
    }
    // liczniki zapasowo z danych profilu (potrzebne do kontroli kompletności list)
    if (!counts && username) {
      try {
        const d = await igGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, ctx, 1);
        const u = d && d.data && d.data.user;
        if (u && u.edge_followed_by && u.edge_follow) {
          counts = { followers: u.edge_followed_by.count || 0, following: u.edge_follow.count || 0 };
        }
      } catch (e) {
        if (e.kind === 'abort') throw e;
      }
    }
    return { id: String(id), username, counts };
  }

  // ---------------------------------------------------------------- odobserwowanie (sieć)
  // Nagłówki, które dodaje sama strona www Instagrama przy akcjach na koncie.
  function actionHeaders() {
    const h = { ...igHeaders(detectAppId()), 'content-type': 'application/x-www-form-urlencoded' };
    try {
      const claim = window.sessionStorage.getItem('www-claim-v2');
      if (claim) h['x-ig-www-claim'] = claim;
    } catch { /* brak dostępu do sessionStorage */ }
    const asbd = document.documentElement.innerHTML.match(/"ASBD_ID"\s*:\s*"?(\d+)/);
    if (asbd) h['x-asbd-id'] = asbd[1];
    return h;
  }

  // Jedno zapytanie POST, bez ponawiania. Treść czytamy jako tekst, żeby przy błędzie
  // móc pokazać, co faktycznie odpowiedział Instagram.
  async function igPost(path, params) {
    const res = await pageFetch(BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: actionHeaders(),
      body: new URLSearchParams(params).toString(),
    });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    return { res, data, text, url: res.url, type: res.headers.get('content-type') || '' };
  }

  // Krótki opis odpowiedzi do komunikatu błędu i konsoli (bez danych osobowych).
  function describe(r) {
    if (r.data) {
      const msg = r.data.message || r.data.feedback_message || r.data.error_type || '';
      return msg ? String(msg).slice(0, 80) : 'JSON: ' + Object.keys(r.data).slice(0, 5).join(', ');
    }
    const type = (r.type.split(';')[0] || 'brak typu').trim();
    const redirected = r.res.redirected ? ' → ' + new URL(r.url).pathname : '';
    return type + redirected;
  }

  function classifyAction(r) {
    const { res, data } = r;
    const msg = data ? String(data.message || data.feedback_message || data.feedback_title || '') : '';
    const fs = data && data.friendship_status;
    if (res.ok && data && (data.status === 'ok' || (fs && fs.following === false))) return { ok: true };
    if (data && (data.checkpoint_url || /checkpoint/i.test(msg))) return { ok: false, kind: 'checkpoint' };
    if (data && (data.require_login || /login_required/i.test(msg))) return { ok: false, kind: 'auth' };
    if ((data && (data.spam || data.feedback_required)) || /feedback_required|spam|block/i.test(msg)) return { ok: false, kind: 'blocked' };
    if (res.status === 429 || /wait|try again|rate.?limit/i.test(msg)) return { ok: false, kind: 'slow' };
    return { ok: false, kind: 'http', status: res.status, info: describe(r) };
  }

  // Faktyczny stan obserwowania (true / false), albo null, gdy nie da się sprawdzić.
  async function isFollowing(id) {
    try {
      const res = await pageFetch(`${BASE}/api/v1/friendships/show/${id}/`, {
        method: 'GET', credentials: 'include', headers: igHeaders(detectAppId()),
      });
      const d = await res.json();
      return typeof d.following === 'boolean' ? d.following : null;
    } catch {
      return null;
    }
  }

  async function unfollowRequest(id) {
    const tries = [
      () => igPost(`/api/v1/friendships/destroy/${id}/`, { user_id: id, container_module: 'profile', nav_chain: '' }),
      () => igPost(`/web/friendships/${id}/unfollow/`, {}),   // starszy adres strony www
    ];
    let last = { ok: false, kind: 'network' };
    for (const send of tries) {
      let r;
      try {
        r = await send();
      } catch {
        last = { ok: false, kind: 'network' };
        continue;
      }
      const c = classifyAction(r);
      if (c.ok) return c;
      if (c.kind !== 'http') return c;               // blokada / limit / logowanie – nie próbujemy dalej
      console.warn('[Apex IG Unfollowers] odobserwowanie: nierozpoznana odpowiedź', r.res.status, c.info, r.text.slice(0, 300));
      // Odpowiedź niejasna (np. HTTP 200 bez JSON) – sprawdzamy, jak jest naprawdę.
      await sleep(1200);
      const following = await isFollowing(id);
      if (following === false) return { ok: true, verified: true };
      last = c;
      await sleep(1500);
    }
    return last;
  }

  // ---------------------------------------------------------------- stan
  const state = {
    userId: null,
    scan: null,          // { ts, userId, username, followers: [user], following: [user] }
    log: [],             // [{ ts, since, lost: [user], gained: [user] }]
    hist: [],            // [{ ts, followers, following, mutual }]
    unfLog: [],          // [{ ts, id, username }] – odobserwowania z wtyczki
    unfBlock: 0,         // do kiedy wstrzymać odobserwowywanie (blokada akcji Instagrama)
    whitelist: new Set(),
    settings: { speed: 'safe', hideLauncher: false, lang: 'auto', unfLimit: UNF.defaultLimit },
    view: 'lists',       // lists | stats | settings
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

  const countsOf = (scan) => {
    const fr = new Set(scan.followers.map((u) => u.id));
    return {
      followers: scan.followers.length,
      following: scan.following.length,
      mutual: scan.following.filter((u) => fr.has(u.id)).length,
    };
  };

  async function loadAccount(userId) {
    state.userId = userId;
    state.scan = null;
    state.log = [];
    state.hist = [];
    state.unfLog = [];
    state.unfBlock = 0;
    state.whitelist = new Set();
    if (!userId) return;
    state.scan = await store.get('scan:' + userId, null);
    state.log = await store.get('log:' + userId, []);
    state.hist = await store.get('hist:' + userId, []);
    state.unfLog = await store.get('unf:' + userId, []);
    state.unfBlock = await store.get('unfBlock:' + userId, 0);
    state.whitelist = new Set(await store.get('wl:' + userId, []));
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
    const fr = new Set(state.scan.followers.map((u) => u.id));
    const fg = new Set(state.scan.following.map((u) => u.id));
    return {
      notBack: state.scan.following.filter((u) => !fr.has(u.id)),
      fans: state.scan.followers.filter((u) => !fg.has(u.id)),
      mutual: state.scan.following.filter((u) => fr.has(u.id)),
    };
  }

  const lastUnf = () => Math.max(state.lastUnfAttempt, state.unfLog[0] ? state.unfLog[0].ts : 0);
  const unfUsed = () => state.unfLog.filter((e) => e.ts > Date.now() - DAY).length;

  // ---------------------------------------------------------------- skan
  async function startScan() {
    if (state.scanning) return;
    state.scanning = true;
    const ctx = makeCtx(state.settings.speed);
    ctx.onNote = (text) => ui.note(text);
    state.ctx = ctx;
    ui.setScanning(true);
    ui.message(null);
    ui.progress(null, t('scan.checking'));
    render();

    try {
      const acc = await resolveAccount(ctx);
      if (acc.id !== state.userId) await loadAccount(acc.id);

      const totFr = acc.counts ? acc.counts.followers : 0;
      const totFg = acc.counts ? acc.counts.following : 0;
      const total = totFr + totFg;
      const frac = (n) => (total ? Math.min(1, n / total) : null);
      const of = (n, tot) => fmtNum(n) + (tot ? ' / ' + fmtNum(tot) : '');

      let frCount = 0;
      const followers = await fetchComplete('followers', acc.id, ctx, totFr, (n) => {
        frCount = n;
        ui.progress(frac(n), t('scan.followers', { n: of(n, totFr) }));
      });

      ui.progress(frac(frCount), t('scan.followersDone', { n: fmtNum(frCount) }));
      await ctx.wait(rand(...ctx.speed.between));

      const following = await fetchComplete('following', acc.id, ctx, totFg, (n) => {
        ui.progress(frac(frCount + n), t('scan.following', { f: fmtNum(frCount), n: of(n, totFg) }));
      });

      const prev = state.scan && state.scan.userId === acc.id ? state.scan : null;
      const scan = {
        ts: Date.now(),
        userId: acc.id,
        username: acc.username || (prev && prev.username) || null,
        followers,
        following,
      };

      let change = null;
      // niepełna lista obserwujących dałaby fałszywe „odeszli” – wtedy nie zapisujemy zmian
      if (prev && !isShort(followers.length, totFr)) {
        const prevIds = new Set(prev.followers.map((u) => u.id));
        const curIds = new Set(followers.map((u) => u.id));
        const lost = prev.followers.filter((u) => !curIds.has(u.id));
        const gained = followers.filter((u) => !prevIds.has(u.id));
        if (lost.length || gained.length) {
          change = { ts: scan.ts, since: prev.ts, lost, gained };
          state.log = [change, ...state.log].slice(0, MAX_LOG);
        }
      }

      state.scan = scan;
      state.hist = [...state.hist, { ts: scan.ts, ...countsOf(scan) }].slice(-MAX_HIST);
      await store.setMany({
        ['scan:' + acc.id]: scan,
        ['log:' + acc.id]: state.log,
        ['hist:' + acc.id]: state.hist,
        lastUserId: acc.id,
      });

      ui.progress(1, t('scan.done'));
      let msg = t('scan.result', { fr: fmtNum(followers.length), fg: fmtNum(following.length) });
      if (!prev) msg += ' ' + t('scan.first');
      else if (change) msg += ' ' + t('scan.changes', { lost: change.lost.length, gained: change.gained.length });
      else msg += ' ' + t('scan.noChanges');
      if (!acc.counts) msg += ' ' + t('scan.noCounts');
      if (isShort(following.length, totFg)) {
        msg += ' ' + t('scan.shortFollowing', { got: fmtNum(following.length), expected: fmtNum(totFg) });
      } else if (isShort(followers.length, totFr)) {
        msg += ' ' + t('scan.fewer', { got: fmtNum(followers.length), expected: fmtNum(totFr) });
      }
      const shortList = isShort(following.length, totFg) || isShort(followers.length, totFr);
      ui.message(msg, shortList || !acc.counts ? 'warn' : 'ok');
    } catch (e) {
      if (e.kind === 'abort') ui.message(t('scan.aborted'), 'warn');
      else ui.message(e.message || String(e), 'error');
      console.warn('[Apex IG Unfollowers]', e);
    } finally {
      state.scanning = false;
      state.ctx = null;
      ui.setScanning(false);
      ui.note(null);
      ui.hideProgress();
      render();
    }
  }

  function stopScan() {
    if (state.ctx) state.ctx.aborted = true;
  }

  // ---------------------------------------------------------------- odobserwowanie
  async function unfollow(u) {
    if (state.busyId) return;
    const now = Date.now();
    const limit = state.settings.unfLimit;
    const used = unfUsed();
    const cookieId = getCookie('ds_user_id');

    let problem = null;
    if (state.scanning) problem = [t('unf.duringScan'), 'warn'];
    else if (cookieId && cookieId !== state.userId) problem = [t('unf.otherAccount'), 'warn'];
    else if (state.unfBlock && now < state.unfBlock) problem = [t('unf.blockedUntil', { time: fmtTime(state.unfBlock) }), 'error'];
    else if (used >= limit) problem = [t('unf.limit', { used, limit }), 'warn'];
    else if (now - lastUnf() < UNF.cooldownMs) {
      problem = [t('unf.cooldown', { s: Math.ceil((UNF.cooldownMs - (now - lastUnf())) / 1000) }), 'warn'];
    }
    if (problem) {
      state.confirmId = null;
      ui.message(...problem);
      render();
      return;
    }

    // pierwsze kliknięcie = prośba o potwierdzenie
    if (state.confirmId !== u.id) {
      state.confirmId = u.id;
      clearTimeout(state.confirmTimer);
      state.confirmTimer = setTimeout(() => { state.confirmId = null; render(); }, 4000);
      render();
      return;
    }

    clearTimeout(state.confirmTimer);
    state.confirmId = null;
    state.busyId = u.id;
    render();
    state.lastUnfAttempt = Date.now();
    const r = await unfollowRequest(u.id);
    state.busyId = null;

    if (r.ok) {
      state.unfLog = [{ ts: Date.now(), id: u.id, username: u.username }, ...state.unfLog].slice(0, MAX_UNF_LOG);
      state.scan.following = state.scan.following.filter((x) => x.id !== u.id);
      await store.setMany({ ['unf:' + state.userId]: state.unfLog, ['scan:' + state.userId]: state.scan });
      ui.message(t('unf.done', { user: u.username, used: used + 1, limit }), 'ok');
    } else {
      const block = r.kind === 'blocked' ? UNF.blockFeedbackMs : r.kind === 'slow' ? UNF.blockSlowMs : 0;
      if (block) {
        state.unfBlock = Date.now() + block;
        await store.set('unfBlock:' + state.userId, state.unfBlock);
      }
      const msgs = {
        blocked: t('unf.blocked', { time: fmtTime(state.unfBlock) }),
        slow: t('unf.slow', { time: fmtTime(state.unfBlock) }),
        auth: t('err.login'),
        checkpoint: t('err.checkpoint'),
        network: t('err.network'),
        http: t('unf.failed', { status: r.status, info: r.info || '' }),
      };
      ui.message(msgs[r.kind] || msgs.http, 'error');
    }
    render();
  }

  // ---------------------------------------------------------------- kopia zapasowa
  async function exportBackup() {
    const all = await store.all();
    const data = {};
    for (const [k, v] of Object.entries(all)) if (BACKUP_KEY_RE.test(k)) data[k] = v;
    const payload = {
      app: 'apex-igunfollowers',
      format: 1,
      version: manifestVersion(),
      exportedAt: new Date().toISOString(),
      data,
    };
    download(
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      `apex-igunfollowers-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    const accounts = Object.keys(data).filter((k) => k.startsWith('scan:')).length;
    ui.message(t('backup.exported', { n: accounts }), 'ok');
  }

  async function importBackup(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || payload.app !== 'apex-igunfollowers' || typeof payload.data !== 'object') throw new Error('format');
      const data = {};
      for (const [k, v] of Object.entries(payload.data)) if (BACKUP_KEY_RE.test(k)) data[k] = v;
      if (!Object.keys(data).length) throw new Error('empty');
      await store.setMany(data);
      await loadSettings();
      const id = getCookie('ds_user_id') || data.lastUserId || state.userId;
      await loadAccount(id);
      const accounts = Object.keys(data).filter((k) => k.startsWith('scan:')).length;
      ui.rebuild();
      ui.message(t('backup.imported', { date: fmtDate(Date.parse(payload.exportedAt) || Date.now()), n: accounts }), 'ok');
    } catch (e) {
      console.warn('[Apex IG Unfollowers] import', e);
      ui.message(t('backup.invalid'), 'error');
    }
  }

  function manifestVersion() {
    try { return ext.runtime.getManifest().version; } catch { return ''; }
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------------------------------------------------------------- UI: style
  const CSS = `
    :host { all: initial; }
    /* Typografia i układ jak w Apex AdBlocker; paleta różowa o podobnej głębi co morska paleta AdBlockera */
    .wrap {
      --bg: #ffffff; --surface: #f6f6f9; --fg: #17171c; --muted: #6b6b76; --line: #e7e7ee;
      --accent: #cc1670; --accent-strong: #b01361; --accent-soft: #fde6f1; --on-accent: #ffffff;
      --ok: #1f9d55; --ok-soft: #e6f6ec; --warn: #b7791f; --warn-soft: #fdf3e1; --err: #d14343; --err-soft: #fdeaea;
      --shadow: 0 12px 40px rgba(20, 20, 40, .22);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: var(--fg);
    }
    @media (prefers-color-scheme: dark) {
      .wrap {
        --bg: #16161b; --surface: #202028; --fg: #f2f2f6; --muted: #a2a2ae; --line: #2c2c36;
        --accent: #f266a8; --accent-strong: #f78bbf; --accent-soft: #3d1529; --on-accent: #2a0a18;
        --ok: #4cc785; --ok-soft: #1c3327; --warn: #e3ad55; --warn-soft: #3a2f1c; --err: #ff7a7a; --err-soft: #3d2022;
        --shadow: 0 12px 40px rgba(0, 0, 0, .5);
      }
    }
    * { box-sizing: border-box; font: inherit; }
    .hidden { display: none !important; }
    button { cursor: pointer; color: inherit; }
    button:disabled { cursor: default; opacity: .55; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    a { color: var(--accent); }

    .launcher {
      position: fixed; right: 20px; bottom: 96px; width: 48px; height: 48px; border-radius: 50%;
      border: 0; color: #fff; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(160deg, #f2559f, #cc1670);
      box-shadow: 0 4px 14px rgba(204, 22, 112, .35); z-index: 2147483646; transition: transform .15s ease;
    }
    .launcher:hover { transform: scale(1.06); }
    .launcher.busy::after {
      content: ""; position: absolute; inset: -5px; border-radius: 50%;
      border: 3px solid transparent; border-top-color: #f2559f; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .panel {
      position: fixed; top: 16px; right: 16px; bottom: 16px; width: 440px; max-width: calc(100vw - 32px);
      background: var(--bg); color: var(--fg); border-radius: 14px; overflow: hidden; border: 1px solid var(--line);
      box-shadow: var(--shadow); display: flex; flex-direction: column; z-index: 2147483647;
    }
    header { display: flex; align-items: center; gap: 8px; padding: 12px 10px 10px 14px; }
    header .logo { width: 24px; height: 24px; flex: none; }
    .brand { font-weight: 650; font-size: 14px; letter-spacing: -.01em; white-space: nowrap; }
    .version { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; margin-left: 2px; }
    .grow { flex: 1; min-width: 0; }
    .ib {
      display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
      border: 0; background: transparent; color: var(--muted); border-radius: 8px; flex: none; font-size: 15px; line-height: 1;
    }
    .ib:hover { background: var(--surface); color: var(--fg); }
    .ib.on { background: var(--accent-soft); color: var(--accent); }

    .account {
      display: flex; align-items: center; gap: 10px; margin: 0 12px 10px; padding: 10px 12px;
      border-radius: 12px; background: var(--surface); border: 1px solid var(--line);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
    .account.has .dot { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .sub { font-size: 12.5px; color: var(--muted); }
    .account.has .sub { color: var(--fg); }

    .controls { display: flex; gap: 8px; padding: 0 12px 10px; }
    .primary {
      flex: 1; height: 36px; border: 0; border-radius: 10px; padding: 0 12px; font-weight: 600; font-size: 13px;
      background: var(--accent); color: var(--on-accent);
    }
    .primary:hover { background: var(--accent-strong); }
    .primary.stop { background: var(--err); color: #fff; }
    select, input[type="search"] {
      height: 36px; border: 1px solid var(--line); background: var(--bg); color: var(--fg);
      border-radius: 10px; padding: 0 10px; outline: none; font-size: 12.5px; min-width: 0;
    }
    select:focus, input[type="search"]:focus { border-color: var(--accent); }
    select:disabled { opacity: .55; }

    .progress { padding: 0 14px 10px; }
    .bar { height: 6px; border-radius: 3px; background: var(--surface); overflow: hidden; position: relative; }
    .fill { height: 100%; width: 0; background: linear-gradient(90deg, #f2559f, #cc1670); transition: width .3s; }
    .bar.indet .fill { width: 35%; position: absolute; animation: indet 1.2s ease-in-out infinite; }
    @keyframes indet { from { left: -35%; } to { left: 100%; } }
    .ptext { font-size: 12.5px; margin-top: 6px; font-variant-numeric: tabular-nums; }
    .pnote { font-size: 12px; color: var(--warn); margin-top: 2px; }

    .msg { margin: 0 12px 10px; padding: 9px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 550; }
    .msg.ok { background: var(--ok-soft); color: var(--ok); }
    .msg.warn { background: var(--warn-soft); color: var(--warn); }
    .msg.error { background: var(--err-soft); color: var(--err); }

    .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .scroll { flex: 1; min-height: 0; overflow-y: auto; border-top: 1px solid var(--line); }

    nav { display: flex; border-bottom: 1px solid var(--line); padding: 0 6px; }
    nav button {
      flex: 1; border: 0; background: transparent; color: var(--muted); padding: 8px 2px;
      font-size: 11.5px; font-weight: 550; border-bottom: 2px solid transparent; white-space: nowrap;
    }
    nav button:hover { color: var(--fg); }
    nav button.on { color: var(--accent); border-bottom-color: var(--accent); }
    nav .cnt {
      display: block; font-size: 18px; font-weight: 700; letter-spacing: -.02em; color: var(--fg);
      font-variant-numeric: tabular-nums; line-height: 1.2;
    }
    nav button.on .cnt { color: var(--accent); }

    .tools { display: grid; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .tools .line { display: flex; gap: 8px; align-items: center; }
    .tools input[type="search"] { flex: 1; }
    .tools select { flex: 1; }
    .chk { font-size: 11.5px; color: var(--muted); display: flex; gap: 5px; align-items: center; white-space: nowrap; cursor: pointer; }
    .chk input { accent-color: var(--accent); margin: 0; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 36px; padding: 0 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line);
      font-weight: 550; font-size: 12.5px; white-space: nowrap;
    }
    .btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn.danger:hover:not(:disabled) { border-color: var(--err); color: var(--err); }

    ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--line); }
    .row.dim { opacity: .5; }
    .av { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: var(--surface); flex: none; border: 1px solid var(--line); }
    .who { flex: 1; min-width: 0; }
    .who a { color: var(--fg); font-weight: 600; text-decoration: none; }
    .who a:hover { color: var(--accent); text-decoration: underline; }
    .nm { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tag { font-size: 11px; color: var(--muted); margin-left: 4px; }
    .ver { color: var(--accent); margin-left: 3px; font-size: 11px; }
    .mini {
      height: 28px; border: 1px solid var(--line); background: var(--bg); color: var(--muted);
      border-radius: 8px; padding: 0 9px; font-size: 11.5px; font-weight: 550; flex: none; white-space: nowrap;
    }
    .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .mini.unf:hover:not(:disabled) { border-color: var(--err); color: var(--err); }
    .mini.confirm { background: var(--err); border-color: var(--err); color: #fff; }
    .mini.confirm:hover { color: #fff; }
    .group {
      padding: 9px 14px 6px; font-size: 11px; font-weight: 650; color: var(--muted);
      letter-spacing: .02em; background: var(--surface); border-bottom: 1px solid var(--line);
    }
    .pill { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex: none; white-space: nowrap; }
    .pill.lost { background: var(--err-soft); color: var(--err); }
    .pill.gained { background: var(--ok-soft); color: var(--ok); }
    .empty { padding: 28px 22px; text-align: center; color: var(--muted); }
    .more { padding: 10px 14px; text-align: center; }

    /* statystyki */
    .pad { padding: 12px; display: grid; gap: 12px; align-content: start; }
    .h { font-size: 11px; font-weight: 650; color: var(--muted); letter-spacing: .02em; text-transform: uppercase; margin: 2px 2px -4px; }
    .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .tiles.three { grid-template-columns: 1fr 1fr 1fr; }
    .tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
    .tile .v { font-size: 22px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.15; }
    .tile .l { color: var(--muted); font-size: 11.5px; }
    .tile .d { font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--muted); }
    .tile .d.up { color: var(--ok); }
    .tile .d.down { color: var(--err); }
    .card { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px 10px 6px; }
    .card .ct { font-weight: 600; font-size: 12.5px; margin: 0 2px 4px; }
    .card .cs { color: var(--muted); font-size: 11.5px; margin: -2px 2px 6px; }
    .chart { position: relative; }
    .chart svg { display: block; width: 100%; height: auto; overflow: visible; }
    .chart .axis { fill: var(--muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
    .chart .grid { stroke: var(--line); stroke-width: 1; }
    .chart .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .chart .pt { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
    .chart .cross { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
    .tip {
      position: absolute; pointer-events: none; transform: translate(-50%, calc(-100% - 10px));
      background: var(--fg); color: var(--bg); border-radius: 8px; padding: 5px 9px; font-size: 11.5px;
      white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.18); font-variant-numeric: tabular-nums;
    }
    .tip b { font-weight: 700; }
    .note { color: var(--muted); font-size: 12px; padding: 14px 4px; text-align: center; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
    th { text-align: right; color: var(--muted); font-weight: 600; font-size: 11px; padding: 6px 4px; border-bottom: 1px solid var(--line); }
    td { text-align: right; padding: 6px 4px; border-bottom: 1px solid var(--line); }
    th:first-child, td:first-child { text-align: left; }
    td.up { color: var(--ok); } td.down { color: var(--err); }

    /* ustawienia */
    .set { display: grid; gap: 6px; }
    .set h3 { margin: 0; font-size: 12.5px; font-weight: 650; }
    .set p { margin: 0; color: var(--muted); font-size: 12px; }
    .set .line { display: flex; gap: 8px; flex-wrap: wrap; }
    .set select { width: 100%; }
    .about { color: var(--muted); font-size: 11.5px; text-align: center; margin: 4px 0 0; }

    footer {
      padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted);
    }
  `;

  const LOGO = '<svg class="logo" viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="apx-g" x1="0" y1="0" x2="0.42" y2="1"><stop offset="0" stop-color="#f2559f"/><stop offset="1" stop-color="#cc1670"/></linearGradient></defs><g transform="translate(0 4.5)"><path fill="url(#apx-g)" fill-rule="evenodd" d="M64 7 116 112H91L64 59 37 112H12L64 7Zm0 34-12 25h24L64 41Z"/></g></svg>';
  const ICON_PERSON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M17 11h6"/></svg>';
  const ICON_STATS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
  const ICON_GEAR = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';

  const template = () => `
    <div class="wrap">
      <button class="launcher" title="Apex IG Unfollowers" aria-label="Apex IG Unfollowers">${ICON_PERSON}</button>
      <section class="panel hidden" role="dialog" aria-label="Apex IG Unfollowers">
        <header>
          ${LOGO}
          <span class="brand">Apex IG Unfollowers</span>
          <span class="version grow" data-ref="version"></span>
          <button class="ib" data-ref="statsBtn" title="${t('ui.stats')}" aria-label="${t('ui.stats')}">${ICON_STATS}</button>
          <button class="ib" data-ref="settingsBtn" title="${t('ui.settings')}" aria-label="${t('ui.settings')}">${ICON_GEAR}</button>
          <button class="ib" data-ref="close" title="${t('ui.close')}" aria-label="${t('ui.close')}">✕</button>
        </header>
        <div class="account" data-ref="account">
          <span class="dot" aria-hidden="true"></span>
          <span class="sub" data-ref="sub"></span>
        </div>
        <div class="controls">
          <button class="primary" data-ref="scan">${t('ui.scan')}</button>
          <select data-ref="speed" title="${t('ui.speedTitle')}">
            <option value="safe">${t('ui.speedSafe')}</option>
            <option value="normal">${t('ui.speedNormal')}</option>
          </select>
        </div>
        <div class="progress hidden" data-ref="progress">
          <div class="bar" data-ref="bar"><div class="fill" data-ref="fill"></div></div>
          <div class="ptext" data-ref="ptext"></div>
          <div class="pnote hidden" data-ref="pnote"></div>
        </div>
        <div class="msg hidden" data-ref="msg" role="status"></div>

        <div class="view" data-ref="vLists">
          <nav data-ref="tabs">
            <button data-tab="notBack"><span class="cnt">–</span>${t('tab.notBack')}</button>
            <button data-tab="fans"><span class="cnt">–</span>${t('tab.fans')}</button>
            <button data-tab="mutual"><span class="cnt">–</span>${t('tab.mutual')}</button>
            <button data-tab="changes"><span class="cnt">–</span>${t('tab.changes')}</button>
          </nav>
          <div class="tools">
            <div class="line">
              <input type="search" data-ref="search" placeholder="${t('ui.search')}">
              <button class="btn" data-ref="csv" title="${t('ui.csvTitle')}">CSV</button>
            </div>
            <div class="line">
              <select data-ref="filter" title="${t('ui.filterTitle')}">
                <option value="all">${t('filter.all')}</option>
                <option value="verified">${t('filter.verified')}</option>
                <option value="private">${t('filter.private')}</option>
                <option value="public">${t('filter.public')}</option>
                <option value="nopic">${t('filter.nopic')}</option>
              </select>
              <select data-ref="sort" title="${t('ui.sortTitle')}">
                <option value="default">${t('sort.default')}</option>
                <option value="az">${t('sort.az')}</option>
                <option value="za">${t('sort.za')}</option>
              </select>
              <label class="chk" data-ref="hiddenWrap" title="${t('ui.hiddenTitle')}"><input type="checkbox" data-ref="showHidden"> ${t('ui.hidden')}</label>
            </div>
          </div>
          <ul data-ref="list"></ul>
        </div>

        <div class="view hidden" data-ref="vStats"><div class="scroll"><div class="pad" data-ref="stats"></div></div></div>

        <div class="view hidden" data-ref="vSettings"><div class="scroll"><div class="pad">
          <section class="set">
            <h3>${t('set.lang')}</h3>
            <select data-ref="lang">
              <option value="auto">${t('set.langAuto')}</option>
              <option value="pl">Polski</option>
              <option value="en">English</option>
            </select>
          </section>
          <section class="set">
            <h3>${t('set.unf')}</h3>
            <p>${t('set.unfHint')}</p>
            <select data-ref="unfLimit">
              ${UNF.limits.map((n) => `<option value="${n}">${t('set.unfOption', { n })}</option>`).join('')}
            </select>
          </section>
          <section class="set">
            <h3>${t('set.launcher')}</h3>
            <label class="chk"><input type="checkbox" data-ref="showLauncher"> ${t('set.launcherLabel')}</label>
          </section>
          <section class="set">
            <h3>${t('set.backup')}</h3>
            <p>${t('set.backupHint')}</p>
            <div class="line">
              <button class="btn" data-ref="export">${t('set.export')}</button>
              <button class="btn" data-ref="import">${t('set.import')}</button>
              <input type="file" accept=".json,application/json" data-ref="importFile" hidden>
            </div>
          </section>
          <section class="set">
            <h3>${t('set.data')}</h3>
            <p>${t('set.dataHint')}</p>
            <div class="line"><button class="btn danger" data-ref="wipe">${t('set.wipe')}</button></div>
          </section>
          <p class="about">Apex IG Unfollowers <span data-ref="aboutVersion"></span> · <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a> · MIT</p>
        </div></div></div>

        <footer>${t('ui.footer')}</footer>
      </section>
    </div>`;

  // ---------------------------------------------------------------- UI: budowa
  const ui = {
    host: null,
    shadow: null,
    r: {},
    launcher: null,
    panel: null,
    wipeArmed: false,

    build() {
      if (!this.host) {
        const host = document.createElement('div');
        host.id = 'apex-igunfollowers-root';
        this.shadow = host.attachShadow({ mode: 'open' });
        this.host = host;
        (document.body || document.documentElement).appendChild(host);
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && this.panel && !this.panel.classList.contains('hidden')) togglePanel(false);
        });
      }
      const style = document.createElement('style');
      style.textContent = CSS;
      const tpl = document.createElement('template');
      tpl.innerHTML = template();
      this.shadow.replaceChildren(style, tpl.content);
      this.r = {};
      this.shadow.querySelectorAll('[data-ref]').forEach((n) => { this.r[n.dataset.ref] = n; });
      this.launcher = this.shadow.querySelector('.launcher');
      this.panel = this.shadow.querySelector('.panel');
      const v = manifestVersion();
      this.r.version.textContent = v ? 'v' + v : '';
      this.r.aboutVersion.textContent = v ? 'v' + v : '';
      this.bind();
      this.applySettings();
      this.setScanning(state.scanning);
    },

    // przebudowa po zmianie języka (panel zostaje otwarty, jeśli był)
    rebuild() {
      const open = this.panel && !this.panel.classList.contains('hidden');
      const msg = this.r.msg ? [this.r.msg.textContent, (this.r.msg.className.match(/\b(ok|warn|error)\b/) || [])[1]] : null;
      this.build();
      if (open) this.panel.classList.remove('hidden');
      if (msg && msg[0]) this.message(msg[0], msg[1]);
      render();
    },

    bind() {
      const r = this.r;
      this.launcher.addEventListener('click', () => togglePanel());
      r.close.addEventListener('click', () => togglePanel(false));
      r.statsBtn.addEventListener('click', () => setView(state.view === 'stats' ? 'lists' : 'stats'));
      r.settingsBtn.addEventListener('click', () => setView(state.view === 'settings' ? 'lists' : 'settings'));
      r.scan.addEventListener('click', () => (state.scanning ? stopScan() : startScan()));
      r.speed.addEventListener('change', () => saveSetting('speed', r.speed.value));
      r.tabs.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-tab]');
        if (!b) return;
        state.tab = b.dataset.tab;
        state.limit = RENDER_STEP;
        r.list.scrollTop = 0;
        render();
      });
      let timer;
      r.search.value = state.query;
      r.search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.query = r.search.value.trim().toLowerCase(); state.limit = RENDER_STEP; render(); }, 120);
      });
      r.filter.addEventListener('change', () => { state.filter = r.filter.value; state.limit = RENDER_STEP; render(); });
      r.sort.addEventListener('change', () => { state.sort = r.sort.value; state.limit = RENDER_STEP; render(); });
      r.showHidden.addEventListener('change', () => { state.showHidden = r.showHidden.checked; render(); });
      r.csv.addEventListener('click', exportCsv);

      // ustawienia
      r.lang.addEventListener('change', async () => {
        await saveSetting('lang', r.lang.value);
        L = I18N.make(state.settings.lang);
        this.rebuild();
      });
      r.unfLimit.addEventListener('change', () => saveSetting('unfLimit', Number(r.unfLimit.value)));
      r.showLauncher.addEventListener('change', () => saveSetting('hideLauncher', !r.showLauncher.checked));
      r.export.addEventListener('click', exportBackup);
      r.import.addEventListener('click', () => r.importFile.click());
      r.importFile.addEventListener('change', async () => {
        const f = r.importFile.files && r.importFile.files[0];
        r.importFile.value = '';
        if (f) await importBackup(f);
      });
      r.wipe.addEventListener('click', async () => {
        if (state.scanning) return;
        if (!this.wipeArmed) {
          this.wipeArmed = true;
          r.wipe.textContent = t('set.wipeConfirm');
          setTimeout(() => { this.wipeArmed = false; if (r.wipe.isConnected) r.wipe.textContent = t('set.wipe'); }, 4000);
          return;
        }
        this.wipeArmed = false;
        r.wipe.textContent = t('set.wipe');
        if (state.userId) {
          await store.remove(['scan:', 'log:', 'wl:', 'hist:', 'unf:', 'unfBlock:'].map((p) => p + state.userId));
        }
        await loadAccount(state.userId);
        this.message(t('set.wiped'), 'warn');
        render();
      });
    },

    applySettings() {
      const r = this.r;
      r.speed.value = state.settings.speed;
      r.lang.value = state.settings.lang;
      r.unfLimit.value = String(state.settings.unfLimit);
      r.showLauncher.checked = !state.settings.hideLauncher;
      this.launcher.classList.toggle('hidden', !!state.settings.hideLauncher);
    },

    setScanning(on) {
      this.r.scan.textContent = on ? t('ui.stop') : t('ui.scan');
      this.r.scan.classList.toggle('stop', on);
      this.r.speed.disabled = on;
      this.launcher.classList.toggle('busy', on);
    },

    progress(fraction, text) {
      const r = this.r;
      r.progress.classList.remove('hidden');
      r.bar.classList.toggle('indet', fraction == null);
      r.fill.style.width = fraction == null ? '' : Math.round(fraction * 100) + '%';
      if (text != null) r.ptext.textContent = text;
    },
    hideProgress() { this.r.progress.classList.add('hidden'); },

    note(text) {
      this.r.pnote.textContent = text || '';
      this.r.pnote.classList.toggle('hidden', !text);
    },

    message(text, kind) {
      const m = this.r.msg;
      m.className = 'msg' + (text ? ' ' + (kind || 'ok') : ' hidden');
      m.textContent = text || '';
    },
  };

  async function saveSetting(key, value) {
    state.settings[key] = value;
    await store.set('settings', state.settings);
    ui.applySettings();
  }

  function setView(view) {
    state.view = view;
    render();
  }

  async function togglePanel(force) {
    if (!ui.host || !ui.host.isConnected) { ui.host = null; ui.build(); }
    const open = force === undefined ? ui.panel.classList.contains('hidden') : force;
    if (open) {
      await ensureLoaded();
      ui.panel.classList.remove('hidden');
      render();
    } else {
      ui.panel.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------- UI: listy
  function matches(u) {
    if (state.query && !(u.username.toLowerCase().includes(state.query) || u.name.toLowerCase().includes(state.query))) return false;
    switch (state.filter) {
      case 'verified': return u.verified;
      case 'private': return u.priv;
      case 'public': return !u.priv;
      case 'nopic': return isNoPic(u);
      default: return true;
    }
  }

  function sorted(list) {
    if (state.sort === 'default') return list;
    const dir = state.sort === 'za' ? -1 : 1;
    return [...list].sort((a, b) => dir * a.username.localeCompare(b.username, 'en'));
  }

  function currentItems() {
    if (state.tab === 'changes') {
      const rows = [];
      for (const entry of state.log) {
        const lost = sorted(entry.lost.filter(matches));
        const gained = sorted(entry.gained.filter(matches));
        if (!lost.length && !gained.length) continue;
        rows.push({ group: t('changes.group', { date: fmtDate(entry.ts), since: fmtDate(entry.since) }) });
        lost.forEach((u) => rows.push({ user: u, type: 'lost', ts: entry.ts }));
        gained.forEach((u) => rows.push({ user: u, type: 'gained', ts: entry.ts }));
      }
      return rows;
    }
    const L2 = computeLists();
    if (!L2) return [];
    let list = L2[state.tab] || [];
    if (state.tab === 'notBack' && !state.showHidden) list = list.filter((u) => !state.whitelist.has(u.id));
    return sorted(list.filter(matches)).map((u) => ({ user: u }));
  }

  function userRow(item) {
    const u = item.user;
    const li = el('li', 'row');
    const hidden = state.whitelist.has(u.id);
    if (state.tab === 'notBack' && hidden) li.classList.add('dim');

    const img = el('img', 'av');
    img.loading = 'lazy';
    img.alt = '';
    if (u.pic) img.src = u.pic;
    img.addEventListener('error', () => { img.removeAttribute('src'); }, { once: true });
    li.appendChild(img);

    const who = el('div', 'who');
    const line = el('div');
    const a = el('a', null, u.username);
    a.href = `${BASE}/${encodeURIComponent(u.username)}/`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    line.appendChild(a);
    if (u.verified) { const v = el('span', 'ver', '✔'); v.title = t('filter.verified'); line.appendChild(v); }
    if (u.priv) { const p = el('span', 'tag', '🔒'); p.title = t('filter.private'); line.appendChild(p); }
    who.appendChild(line);
    if (u.name) who.appendChild(el('div', 'nm', u.name));
    li.appendChild(who);

    if (item.type === 'lost') li.appendChild(el('span', 'pill lost', t('changes.lost')));
    if (item.type === 'gained') li.appendChild(el('span', 'pill gained', t('changes.gained')));

    if (state.tab === 'notBack') {
      const b = el('button', 'mini', hidden ? t('row.unhide') : t('row.hide'));
      b.title = hidden ? t('row.unhideTitle') : t('row.hideTitle');
      b.addEventListener('click', () => toggleWhitelist(u.id));
      li.appendChild(b);
    }
    if (state.tab === 'notBack' || state.tab === 'mutual') {
      const confirming = state.confirmId === u.id;
      const busy = state.busyId === u.id;
      const b = el('button', 'mini unf' + (confirming ? ' confirm' : ''),
        busy ? '…' : confirming ? t('row.unfConfirm') : t('row.unf'));
      b.title = t('row.unfTitle');
      b.disabled = busy || (!!state.busyId && !busy);
      b.addEventListener('click', () => unfollow(u));
      li.appendChild(b);
    }
    return li;
  }

  async function toggleWhitelist(id) {
    if (state.whitelist.has(id)) state.whitelist.delete(id);
    else state.whitelist.add(id);
    if (state.userId) await store.set('wl:' + state.userId, [...state.whitelist]);
    render();
  }

  function emptyText() {
    if (state.tab === 'changes') return state.scan ? t('empty.changes') : t('empty.firstScan');
    if (!state.scan && state.scanning) return t('empty.scanning');
    if (!state.scan) return t('empty.noScan');
    if (state.query || state.filter !== 'all') return t('empty.noResults');
    return t('empty.' + state.tab);
  }

  function renderLists() {
    const r = ui.r;
    const L2 = computeLists();
    const counts = {
      notBack: L2 ? fmtNum(L2.notBack.filter((u) => !state.whitelist.has(u.id)).length) : '–',
      fans: L2 ? fmtNum(L2.fans.length) : '–',
      mutual: L2 ? fmtNum(L2.mutual.length) : '–',
      changes: state.log.length ? fmtNum(state.log.reduce((s, e) => s + e.lost.length, 0)) : '–',
    };
    r.tabs.querySelectorAll('button[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === state.tab);
      b.querySelector('.cnt').textContent = counts[b.dataset.tab];
    });
    r.tabs.querySelector('[data-tab="changes"]').title = t('tab.changesTitle');
    r.hiddenWrap.classList.toggle('hidden', state.tab !== 'notBack');
    r.showHidden.checked = state.showHidden;
    r.filter.value = state.filter;
    r.sort.value = state.sort;

    const scroll = r.list.scrollTop;
    const items = currentItems();
    const frag = document.createDocumentFragment();
    if (!items.length) {
      frag.appendChild(el('li', 'empty', emptyText()));
    } else {
      let shown = 0;
      for (const item of items) {
        if (item.group) { frag.appendChild(el('li', 'group', item.group)); continue; }
        if (shown >= state.limit) break;
        frag.appendChild(userRow(item));
        shown++;
      }
      const totalUsers = items.filter((i) => i.user).length;
      if (totalUsers > shown) {
        const li = el('li', 'more');
        const b = el('button', 'btn', t('ui.more', { n: fmtNum(totalUsers - shown) }));
        b.addEventListener('click', () => { state.limit += RENDER_STEP; render(); });
        li.appendChild(b);
        frag.appendChild(li);
      }
    }
    r.list.replaceChildren(frag);
    r.list.scrollTop = scroll;
  }

  // ---------------------------------------------------------------- UI: statystyki
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    const raw = (max - min) / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
    const out = [];
    for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(v);
    return out;
  }

  // Wykres liniowy jednej serii (obserwujący w czasie): jedna oś, cienka linia, crosshair + tooltip.
  function buildChart(points) {
    const NS = 'http://www.w3.org/2000/svg';
    const W = 400, H = 170, PL = 46, PR = 14, PT = 12, PB = 24;
    const mk = (tag, attrs, cls) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (cls) n.setAttribute('class', cls);
      return n;
    };
    let x0 = points[0].ts, x1 = points[points.length - 1].ts;
    if (x0 === x1) { x0 -= 3600e3; x1 += 3600e3; }
    const ticks = niceTicks(Math.min(...points.map((p) => p.v)), Math.max(...points.map((p) => p.v)), 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = (ts) => PL + ((ts - x0) / (x1 - x0)) * (W - PL - PR);
    const Y = (v) => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);

    const wrap = el('div', 'chart');
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('stats.chartAria', { n: fmtNum(points[points.length - 1].v) }) });
    for (const v of ticks) {
      svg.appendChild(mk('line', { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v) }, 'grid'));
      const lbl = mk('text', { x: PL - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, 'axis');
      lbl.textContent = fmtNum(v);
      svg.appendChild(lbl);
    }
    const first = mk('text', { x: PL, y: H - 6, 'text-anchor': 'start' }, 'axis');
    first.textContent = fmtDay(points[0].ts);
    svg.appendChild(first);
    if (points.length > 1) {
      const last = mk('text', { x: W - PR, y: H - 6, 'text-anchor': 'end' }, 'axis');
      last.textContent = fmtDay(points[points.length - 1].ts);
      svg.appendChild(last);
    }
    svg.appendChild(mk('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('') }, 'line'));
    const lp = points[points.length - 1];
    svg.appendChild(mk('circle', { cx: X(lp.ts), cy: Y(lp.v), r: 4 }, 'pt'));

    // warstwa hover
    const cross = mk('line', { x1: 0, x2: 0, y1: PT, y2: H - PB, visibility: 'hidden' }, 'cross');
    const dot = mk('circle', { cx: 0, cy: 0, r: 4.5, visibility: 'hidden' }, 'pt');
    const hit = mk('rect', { x: PL - 10, y: 0, width: W - PL - PR + 20, height: H, fill: 'transparent' });
    svg.append(cross, dot, hit);
    const tip = el('div', 'tip hidden');
    wrap.append(svg, tip);

    const show = (clientX) => {
      const box = svg.getBoundingClientRect();
      const sx = ((clientX - box.left) / box.width) * W;
      let best = points[0];
      for (const p of points) if (Math.abs(X(p.ts) - sx) < Math.abs(X(best.ts) - sx)) best = p;
      const px = X(best.ts), py = Y(best.v);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
      tip.replaceChildren(el('b', null, fmtNum(best.v)), document.createTextNode(' · ' + fmtDate(best.ts)));
      tip.classList.remove('hidden');
      const scale = box.width / W;
      tip.style.left = Math.min(Math.max(px * scale, 70), box.width - 70) + 'px';
      tip.style.top = py * scale + 'px';
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      tip.classList.add('hidden');
    };
    hit.addEventListener('mousemove', (e) => show(e.clientX));
    hit.addEventListener('mouseleave', hide);
    return wrap;
  }

  function tile(value, label, delta) {
    const d = el('div', 'tile');
    d.appendChild(el('div', 'v', value));
    d.appendChild(el('div', 'l', label));
    if (delta != null) {
      const s = el('div', 'd' + (delta > 0 ? ' up' : delta < 0 ? ' down' : ''), t('stats.vsPrev', { d: signed(delta) }));
      d.appendChild(s);
    }
    return d;
  }

  function balance(days) {
    const from = Date.now() - days * DAY;
    let lost = 0, gained = 0;
    for (const e of state.log) if (e.ts >= from) { lost += e.lost.length; gained += e.gained.length; }
    return { lost, gained };
  }

  function renderStats() {
    const box = ui.r.stats;
    const frag = document.createDocumentFragment();
    if (!state.scan) {
      frag.appendChild(el('div', 'note', t('empty.noScan')));
      box.replaceChildren(frag);
      return;
    }
    const c = countsOf(state.scan);
    const L2 = computeLists();
    const prev = state.hist.length > 1 ? state.hist[state.hist.length - 2] : null;
    const last = state.hist[state.hist.length - 1] || { ts: state.scan.ts, ...c };

    frag.appendChild(el('div', 'h', t('stats.now')));
    const tiles = el('div', 'tiles');
    tiles.append(
      tile(fmtNum(c.followers), t('stats.followers'), prev ? last.followers - prev.followers : null),
      tile(fmtNum(c.following), t('stats.following'), prev ? last.following - prev.following : null),
      tile(fmtNum(c.mutual), t('stats.mutual', { p: c.following ? Math.round((c.mutual / c.following) * 100) : 0 })),
      tile(fmtNum(L2.notBack.length), t('stats.notBack')),
    );
    frag.appendChild(tiles);

    frag.appendChild(el('div', 'h', t('stats.balance')));
    const bal = el('div', 'tiles three');
    for (const days of [7, 30]) {
      const b = balance(days);
      bal.appendChild(tile(signed(b.gained - b.lost), t('stats.balanceDays', { days, gained: b.gained, lost: b.lost })));
    }
    bal.appendChild(tile(`${unfUsed()} / ${state.settings.unfLimit}`, t('stats.unf24')));
    frag.appendChild(bal);

    const card = el('div', 'card');
    card.appendChild(el('div', 'ct', t('stats.chartTitle')));
    if (state.hist.length < 2) {
      card.appendChild(el('div', 'note', t('stats.chartEmpty')));
    } else {
      card.appendChild(el('div', 'cs', t('stats.chartSub', { n: state.hist.length })));
      card.appendChild(buildChart(state.hist.map((h) => ({ ts: h.ts, v: h.followers }))));
    }
    frag.appendChild(card);

    // tabela historii (widok tabelaryczny wykresu)
    frag.appendChild(el('div', 'h', t('stats.history')));
    const table = el('table');
    const head = el('tr');
    [t('stats.colDate'), t('stats.colFollowers'), t('stats.colFollowing'), t('stats.colChange')].forEach((h) => head.appendChild(el('th', null, h)));
    table.appendChild(head);
    const rows = state.hist.slice(-30).reverse();
    rows.forEach((h, i) => {
      const older = state.hist[state.hist.length - 2 - i];
      const tr = el('tr');
      tr.appendChild(el('td', null, fmtDate(h.ts)));
      tr.appendChild(el('td', null, fmtNum(h.followers)));
      tr.appendChild(el('td', null, fmtNum(h.following)));
      const diff = older ? h.followers - older.followers : null;
      tr.appendChild(el('td', diff > 0 ? 'up' : diff < 0 ? 'down' : null, diff == null ? '–' : signed(diff)));
      table.appendChild(tr);
    });
    frag.appendChild(table);
    box.replaceChildren(frag);
  }

  // ---------------------------------------------------------------- UI: render
  function render() {
    if (!ui.host || !ui.panel || ui.panel.classList.contains('hidden')) return;
    const r = ui.r;

    r.account.classList.toggle('has', !!state.scan);
    r.sub.textContent = state.scan
      ? `${state.scan.username ? '@' + state.scan.username + ' · ' : ''}${t('ui.lastScan', { date: fmtDate(state.scan.ts) })}`
      : t('ui.noScan');

    r.vLists.classList.toggle('hidden', state.view !== 'lists');
    r.vStats.classList.toggle('hidden', state.view !== 'stats');
    r.vSettings.classList.toggle('hidden', state.view !== 'settings');
    r.statsBtn.classList.toggle('on', state.view === 'stats');
    r.settingsBtn.classList.toggle('on', state.view === 'settings');

    if (state.view === 'lists') renderLists();
    else if (state.view === 'stats') renderStats();
  }

  function exportCsv() {
    const items = currentItems().filter((i) => i.user);
    if (!items.length) { ui.message(t('csv.empty'), 'warn'); return; }
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const changes = state.tab === 'changes';
    const head = t('csv.head').split(',');
    if (changes) head.push(...t('csv.headChanges').split(','));
    const lines = [head.map(q).join(',')];
    for (const it of items) {
      const u = it.user;
      const row = [u.username, u.name, `${BASE}/${u.username}/`, u.verified ? t('csv.yes') : t('csv.no'), u.priv ? t('csv.yes') : t('csv.no')];
      if (changes) row.push(it.type === 'lost' ? t('csv.lost') : t('csv.gained'), new Date(it.ts).toISOString());
      lines.push(row.map(q).join(','));
    }
    const names = { notBack: 'csv.fileNotBack', fans: 'csv.fileFans', mutual: 'csv.fileMutual', changes: 'csv.fileChanges' };
    download(
      new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      `instagram-${t(names[state.tab])}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  // ---------------------------------------------------------------- start
  ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'apex-igu:toggle') {
      togglePanel();
      sendResponse({ ok: true });
    }
  });

  (async () => {
    await loadSettings();
    if (!ui.host) ui.build();
  })();
})();
