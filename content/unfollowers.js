/*
 * Apex IG Unfollowers – content script (Chrome / Edge / Brave / Opera / Firefox, Manifest V3)
 *
 * Działa wyłącznie na www.instagram.com, korzysta z Twojej zalogowanej sesji
 * i tylko CZYTA listy obserwujących / obserwowanych. Niczego nie odobserwowuje
 * i nigdzie nie wysyła danych – wszystko zostaje w chrome.storage.local.
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

  // ---------------------------------------------------------------- stałe
  const BASE = 'https://www.instagram.com';
  const DEFAULT_APP_ID = '936619743392459'; // publiczny identyfikator aplikacji webowej Instagrama
  const PAGE_SIZE = 50;
  const RENDER_STEP = 150;
  const MAX_LOG = 100;
  const SPEEDS = {
    // [min, max] w milisekundach
    safe:   { page: [1500, 3000], every: 8,  long: [10000, 18000], between: [5000, 9000] },
    normal: { page: [700, 1500],  every: 12, long: [5000, 9000],   between: [3000, 5000] },
  };

  // ---------------------------------------------------------------- pomocnicze
  const rand = (a, b) => Math.round(a + Math.random() * (b - a));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const fmtDate = (ts) =>
    new Date(ts).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

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
    set: (key, val) => ext.storage.local.set({ [key]: val }),
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
    return {
      id: String(u.pk ?? u.pk_id ?? u.id),
      username: u.username || '',
      name: u.full_name || '',
      pic: u.profile_pic_url || '',
      verified: !!u.is_verified,
      priv: !!u.is_private,
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
          if (ctx.aborted) throw new ScanError('Skan przerwany.', 'abort');
          await sleep(Math.min(250, end - Date.now()));
        }
        if (ctx.aborted) throw new ScanError('Skan przerwany.', 'abort');
      },
      async pace(page) {
        const s = ctx.speed;
        if (page % s.every === 0) {
          const ms = rand(...s.long);
          ctx.onNote?.(`Krótka przerwa (${Math.round(ms / 1000)} s), żeby nie przeciążać Instagrama…`);
          await ctx.wait(ms);
          ctx.onNote?.(null);
        } else {
          await ctx.wait(rand(...s.page));
        }
      },
    };
    return ctx;
  }

  async function igGet(path, ctx, attempts = 4) {
    const url = BASE + path;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (ctx.aborted) throw new ScanError('Skan przerwany.', 'abort');
      const last = attempt === attempts;

      let res;
      try {
        res = await pageFetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'accept': 'application/json',
            'x-ig-app-id': ctx.appId,
            'x-requested-with': 'XMLHttpRequest',
            'x-csrftoken': getCookie('csrftoken') || '',
          },
        });
      } catch (e) {
        if (last) throw new ScanError('Brak połączenia z Instagramem.', 'http');
        ctx.onNote?.(`Problem z połączeniem, ponawiam (${attempt}/${attempts})…`);
        await ctx.wait(5000 * attempt);
        continue;
      }

      let data = null;
      try { data = await res.json(); } catch { data = null; }
      const msg = data ? String(data.message || data.feedback_message || '') : '';

      if (res.ok && data && data.status !== 'fail') return data;

      if (data && (data.checkpoint_url || /checkpoint/i.test(msg))) {
        throw new ScanError('Instagram chce potwierdzić, że to Ty. Otwórz instagram.com, przejdź weryfikację i spróbuj później.', 'auth', res.status);
      }
      if (data && (data.require_login || /login_required/i.test(msg))) {
        throw new ScanError('Instagram wymaga ponownego zalogowania. Zaloguj się i spróbuj jeszcze raz.', 'auth', res.status);
      }

      const limited = res.status === 429 || (data && data.spam) ||
        /wait|spam|feedback_required|try again|rate.?limit/i.test(msg);
      if (limited || res.status >= 500) {
        if (last) break;
        const sec = 60 * attempt;
        ctx.onNote?.(`Instagram prosi o zwolnienie (HTTP ${res.status}). Czekam ${sec} s i próbuję dalej…`);
        await ctx.wait(sec * 1000);
        ctx.onNote?.(null);
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        throw new ScanError('Brak dostępu – upewnij się, że jesteś zalogowany na instagram.com, i odśwież stronę.', 'auth', res.status);
      }
      if (!data) throw new ScanError(`Instagram zwrócił nieoczekiwaną odpowiedź (HTTP ${res.status}).`, 'parse', res.status);
      throw new ScanError(`Błąd Instagrama (HTTP ${res.status})${msg ? ': ' + msg : ''}`, 'http', res.status);
    }
    throw new ScanError('Instagram wciąż ogranicza zapytania. Odczekaj 15–30 minut i spróbuj ponownie w tempie „bezpiecznym”.', 'ratelimit');
  }

  // Metoda główna: REST API używane przez stronę www (lista "Obserwujący"/"Obserwowani").
  async function fetchListRest(kind, userId, ctx, onCount) {
    const users = [];
    const seen = new Set();
    let maxId = null;
    let count = PAGE_SIZE;
    let page = 0;
    for (;;) {
      const q = new URLSearchParams({ count: String(count), search_surface: 'follow_list_page' });
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
      if (!conn) throw new ScanError('Instagram zmienił format danych – wtyczka wymaga aktualizacji.', 'parse');
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
        ctx.onNote?.('Główna metoda nie zadziałała, próbuję zapasowej…');
        await ctx.wait(rand(2000, 4000));
        ctx.onNote?.(null);
        return await fetchListGraphql(kind, userId, ctx, onCount);
      }
      throw e;
    }
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
    if (!id) {
      throw new ScanError('Nie wykryto zalogowanego konta. Zaloguj się na instagram.com i odśwież stronę.', 'auth');
    }
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
    return { id: String(id), username, counts };
  }

  // ---------------------------------------------------------------- stan
  const state = {
    userId: null,
    scan: null,          // { ts, userId, username, followers: [user], following: [user] }
    log: [],             // [{ ts, since, lost: [user], gained: [user] }]
    whitelist: new Set(),
    settings: { speed: 'safe', hideLauncher: false },
    tab: 'notBack',
    query: '',
    showHidden: false,
    limit: RENDER_STEP,
    scanning: false,
    ctx: null,
    loaded: false,
  };

  async function loadAccount(userId) {
    state.userId = userId;
    state.scan = null;
    state.log = [];
    state.whitelist = new Set();
    if (!userId) return;
    state.scan = await store.get('scan:' + userId, null);
    state.log = await store.get('log:' + userId, []);
    state.whitelist = new Set(await store.get('wl:' + userId, []));
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

  // ---------------------------------------------------------------- skan
  async function startScan() {
    if (state.scanning) return;
    state.scanning = true;
    const ctx = makeCtx(state.settings.speed);
    ctx.onNote = (t) => ui.note(t);
    state.ctx = ctx;
    ui.setScanning(true);
    ui.message(null);
    ui.progress(null, 'Sprawdzam konto…');
    render();

    try {
      const acc = await resolveAccount(ctx);
      if (acc.id !== state.userId) await loadAccount(acc.id);

      const totFr = acc.counts ? acc.counts.followers : 0;
      const totFg = acc.counts ? acc.counts.following : 0;
      const total = totFr + totFg;
      const frac = (n) => (total ? Math.min(1, n / total) : null);

      let frCount = 0;
      const followers = await fetchList('followers', acc.id, ctx, (n) => {
        frCount = n;
        ui.progress(frac(n), `Obserwujący: ${n}${totFr ? ' / ' + totFr : ''}`);
      });

      ui.progress(frac(frCount), `Obserwujący: ${frCount} ✓ · za chwilę obserwowani…`);
      await ctx.wait(rand(...ctx.speed.between));

      const following = await fetchList('following', acc.id, ctx, (n) => {
        ui.progress(frac(frCount + n), `Obserwujący: ${frCount} ✓ · Obserwowani: ${n}${totFg ? ' / ' + totFg : ''}`);
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
      if (prev) {
        const prevIds = new Set(prev.followers.map((u) => u.id));
        const curIds = new Set(followers.map((u) => u.id));
        const lost = prev.followers.filter((u) => !curIds.has(u.id));
        const gained = followers.filter((u) => !prevIds.has(u.id));
        if (lost.length || gained.length) {
          change = { ts: scan.ts, since: prev.ts, lost, gained };
          state.log = [change, ...state.log].slice(0, MAX_LOG);
          await store.set('log:' + acc.id, state.log);
        }
      }

      state.scan = scan;
      await store.set('scan:' + acc.id, scan);
      await store.set('lastUserId', acc.id);

      ui.progress(1, 'Gotowe');
      let msg = `Gotowe! ${followers.length} obserwujących, ${following.length} obserwowanych.`;
      if (!prev) msg += ' To pierwszy skan – przy kolejnych zobaczysz, kto przestał Cię obserwować.';
      else if (change) msg += ` Od poprzedniego skanu: −${change.lost.length} / +${change.gained.length} obserwujących (zakładka „Zmiany”).`;
      else msg += ' Brak zmian od poprzedniego skanu.';
      if (totFr && followers.length < totFr * 0.95) {
        msg += ' Pobrano trochę mniej kont niż pokazuje licznik profilu – to normalne (konta zawieszone/dezaktywowane się nie liczą).';
      }
      ui.message(msg, 'ok');
    } catch (e) {
      if (e.kind === 'abort') ui.message('Skan przerwany. Poprzednie wyniki zostały bez zmian.', 'warn');
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

  // ---------------------------------------------------------------- UI
  const CSS = `
    :host { all: initial; }
    /* Typografia i układ jak w Apex AdBlocker; paleta różowa o tej samej głębi co morska paleta AdBlockera */
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
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

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
      position: fixed; top: 16px; right: 16px; bottom: 16px; width: 400px; max-width: calc(100vw - 32px);
      background: var(--bg); color: var(--fg); border-radius: 14px; overflow: hidden; border: 1px solid var(--line);
      box-shadow: var(--shadow); display: flex; flex-direction: column; z-index: 2147483647;
    }
    header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px; }
    header .logo { width: 24px; height: 24px; flex: none; }
    .brand { font-weight: 650; font-size: 14px; letter-spacing: -.01em; }
    .version { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; margin-left: 2px; }
    .grow { flex: 1; min-width: 0; }
    .x { border: 0; background: transparent; color: var(--muted); font-size: 16px; line-height: 1; padding: 5px 7px; border-radius: 8px; }
    .x:hover { background: var(--surface); color: var(--fg); }

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
      border-radius: 10px; padding: 0 10px; outline: none; font-size: 12.5px;
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

    nav { display: flex; border-bottom: 1px solid var(--line); padding: 0 6px; }
    nav button {
      flex: 1; border: 0; background: transparent; color: var(--muted); padding: 8px 4px 8px;
      font-size: 11.5px; font-weight: 550; border-bottom: 2px solid transparent; white-space: nowrap;
    }
    nav button:hover { color: var(--fg); }
    nav button.on { color: var(--accent); border-bottom-color: var(--accent); }
    nav .cnt {
      display: block; font-size: 18px; font-weight: 700; letter-spacing: -.02em; color: var(--fg);
      font-variant-numeric: tabular-nums; line-height: 1.2;
    }
    nav button.on .cnt { color: var(--accent); }

    .tools { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .tools input[type="search"] { flex: 1; min-width: 0; }
    .tools label { font-size: 11.5px; color: var(--muted); display: flex; gap: 5px; align-items: center; white-space: nowrap; cursor: pointer; }
    .tools label input { accent-color: var(--accent); margin: 0; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 36px; padding: 0 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line);
      font-weight: 550; font-size: 12.5px; white-space: nowrap;
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }

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
      border-radius: 8px; padding: 0 9px; font-size: 11.5px; font-weight: 550; flex: none;
    }
    .mini:hover { border-color: var(--accent); color: var(--accent); }
    .group {
      padding: 9px 14px 6px; font-size: 11px; font-weight: 650; color: var(--muted);
      letter-spacing: .02em; background: var(--surface); border-bottom: 1px solid var(--line);
    }
    .pill { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex: none; white-space: nowrap; }
    .pill.lost { background: var(--err-soft); color: var(--err); }
    .pill.gained { background: var(--ok-soft); color: var(--ok); }
    .empty { padding: 28px 22px; text-align: center; color: var(--muted); }
    .more { padding: 10px 14px; text-align: center; }

    footer {
      display: flex; gap: 10px; justify-content: space-between; align-items: center;
      padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted);
    }
    footer button { border: 0; background: transparent; color: var(--muted); font-size: 11px; padding: 2px 0; }
    footer button:hover { color: var(--accent); text-decoration: underline; }
    footer .links { display: flex; gap: 12px; flex: none; }
  `;

  const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M17 11h6"/></svg>';

  const LOGO = '<svg class="logo" viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="apx-g" x1="0" y1="0" x2="0.42" y2="1"><stop offset="0" stop-color="#f2559f"/><stop offset="1" stop-color="#cc1670"/></linearGradient></defs><g transform="translate(0 4.5)"><path fill="url(#apx-g)" fill-rule="evenodd" d="M64 7 116 112H91L64 59 37 112H12L64 7Zm0 34-12 25h24L64 41Z"/></g></svg>';

  const TEMPLATE = `
    <div class="wrap">
      <button class="launcher" title="Apex IG Unfollowers" aria-label="Apex IG Unfollowers">${ICON}</button>
      <section class="panel hidden" role="dialog" aria-label="Apex IG Unfollowers">
        <header>
          ${LOGO}
          <span class="brand">Apex IG Unfollowers</span>
          <span class="version grow" data-ref="version"></span>
          <button class="x" data-ref="close" title="Zamknij (Esc)" aria-label="Zamknij">✕</button>
        </header>
        <div class="account" data-ref="account">
          <span class="dot" aria-hidden="true"></span>
          <span class="sub" data-ref="sub"></span>
        </div>
        <div class="controls">
          <button class="primary" data-ref="scan">Skanuj</button>
          <select data-ref="speed" title="Tempo pobierania">
            <option value="safe">Tempo: bezpieczne</option>
            <option value="normal">Tempo: szybsze</option>
          </select>
        </div>
        <div class="progress hidden" data-ref="progress">
          <div class="bar" data-ref="bar"><div class="fill" data-ref="fill"></div></div>
          <div class="ptext" data-ref="ptext"></div>
          <div class="pnote hidden" data-ref="pnote"></div>
        </div>
        <div class="msg hidden" data-ref="msg"></div>
        <nav data-ref="tabs">
          <button data-tab="notBack"><span class="cnt">–</span>Nie obserwują Cię</button>
          <button data-tab="fans"><span class="cnt">–</span>Ty nie obserwujesz</button>
          <button data-tab="mutual"><span class="cnt">–</span>Wzajemni</button>
          <button data-tab="changes"><span class="cnt">–</span>Zmiany</button>
        </nav>
        <div class="tools">
          <input type="search" data-ref="search" placeholder="Szukaj nazwy…">
          <label data-ref="hiddenWrap" title="Pokaż też konta ukryte (biała lista)"><input type="checkbox" data-ref="showHidden"> ukryte</label>
          <button class="btn" data-ref="csv" title="Pobierz widoczną listę jako CSV">CSV</button>
        </div>
        <ul data-ref="list"></ul>
        <footer>
          <span>Dane zostają tylko w Twojej przeglądarce.</span>
          <span class="links">
            <button data-ref="hideLauncher"></button>
            <button data-ref="wipe">Wyczyść dane</button>
          </span>
        </footer>
      </section>
    </div>`;

  const ui = {
    host: null,
    r: {},
    launcher: null,
    panel: null,

    build() {
      const host = document.createElement('div');
      host.id = 'apex-igunfollowers-root';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);
      const tpl = document.createElement('template');
      tpl.innerHTML = TEMPLATE;
      shadow.appendChild(tpl.content);
      shadow.querySelectorAll('[data-ref]').forEach((n) => { this.r[n.dataset.ref] = n; });
      this.launcher = shadow.querySelector('.launcher');
      try { this.r.version.textContent = 'v' + ext.runtime.getManifest().version; } catch { /* brak manifestu w testach */ }
      this.panel = shadow.querySelector('.panel');
      this.host = host;
      (document.body || document.documentElement).appendChild(host);
      this.bind();
    },

    bind() {
      const r = this.r;
      this.launcher.addEventListener('click', () => togglePanel());
      r.close.addEventListener('click', () => togglePanel(false));
      r.scan.addEventListener('click', () => (state.scanning ? stopScan() : startScan()));
      r.speed.addEventListener('change', async () => {
        state.settings.speed = r.speed.value;
        await store.set('settings', state.settings);
      });
      r.tabs.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-tab]');
        if (!b) return;
        state.tab = b.dataset.tab;
        state.limit = RENDER_STEP;
        r.list.scrollTop = 0;
        render();
      });
      let t;
      r.search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { state.query = r.search.value.trim().toLowerCase(); state.limit = RENDER_STEP; render(); }, 120);
      });
      r.showHidden.addEventListener('change', () => { state.showHidden = r.showHidden.checked; render(); });
      r.csv.addEventListener('click', exportCsv);
      r.hideLauncher.addEventListener('click', async () => {
        state.settings.hideLauncher = !state.settings.hideLauncher;
        await store.set('settings', state.settings);
        this.applySettings();
      });
      let wipeArmed = false;
      r.wipe.addEventListener('click', async () => {
        if (state.scanning) return;
        if (!wipeArmed) {
          wipeArmed = true;
          r.wipe.textContent = 'Na pewno? Kliknij jeszcze raz';
          setTimeout(() => { wipeArmed = false; r.wipe.textContent = 'Wyczyść dane'; }, 4000);
          return;
        }
        wipeArmed = false;
        r.wipe.textContent = 'Wyczyść dane';
        if (state.userId) await store.remove(['scan:' + state.userId, 'log:' + state.userId, 'wl:' + state.userId]);
        await loadAccount(state.userId);
        this.message('Usunięto zapisane wyniki tego konta.', 'warn');
        render();
      });
      // Esc zamyka panel
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.panel.classList.contains('hidden')) togglePanel(false);
      });
    },

    applySettings() {
      this.r.speed.value = state.settings.speed;
      this.launcher.classList.toggle('hidden', !!state.settings.hideLauncher);
      this.r.hideLauncher.textContent = state.settings.hideLauncher ? 'Pokaż przycisk' : 'Ukryj przycisk';
      this.r.hideLauncher.title = state.settings.hideLauncher
        ? 'Pokaż okrągły przycisk na stronie Instagrama'
        : 'Ukryj okrągły przycisk – panel otworzysz ikoną wtyczki na pasku przeglądarki';
    },

    setScanning(on) {
      this.r.scan.textContent = on ? 'Zatrzymaj' : 'Skanuj';
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

  async function togglePanel(force) {
    if (!ui.host || !ui.host.isConnected) ui.build(), ui.applySettings();
    const open = force === undefined ? ui.panel.classList.contains('hidden') : force;
    if (open) {
      await ensureLoaded();
      ui.panel.classList.remove('hidden');
      render();
    } else {
      ui.panel.classList.add('hidden');
    }
  }

  function matches(u) {
    if (!state.query) return true;
    return u.username.toLowerCase().includes(state.query) || u.name.toLowerCase().includes(state.query);
  }

  function currentItems() {
    const L = computeLists();
    if (state.tab === 'changes') {
      const rows = [];
      for (const entry of state.log) {
        const lost = entry.lost.filter(matches);
        const gained = entry.gained.filter(matches);
        if (!lost.length && !gained.length) continue;
        rows.push({ group: `Skan ${fmtDate(entry.ts)} (porównanie z ${fmtDate(entry.since)})` });
        lost.forEach((u) => rows.push({ user: u, type: 'lost', ts: entry.ts }));
        gained.forEach((u) => rows.push({ user: u, type: 'gained', ts: entry.ts }));
      }
      return rows;
    }
    if (!L) return [];
    let list = L[state.tab] || [];
    if (state.tab === 'notBack' && !state.showHidden) list = list.filter((u) => !state.whitelist.has(u.id));
    return list.filter(matches).map((u) => ({ user: u }));
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
    if (u.verified) line.appendChild(el('span', 'ver', '✔'));
    if (u.priv) line.appendChild(el('span', 'tag', '🔒'));
    who.appendChild(line);
    if (u.name) who.appendChild(el('div', 'nm', u.name));
    li.appendChild(who);

    if (item.type === 'lost') li.appendChild(el('span', 'pill lost', 'odszedł'));
    if (item.type === 'gained') li.appendChild(el('span', 'pill gained', 'nowy'));

    if (state.tab === 'notBack') {
      const b = el('button', 'mini', hidden ? 'Przywróć' : 'Ukryj');
      b.title = hidden
        ? 'Usuń z białej listy'
        : 'Dodaj do białej listy (np. celebryci, marki) – nie będzie pokazywane w tej zakładce';
      b.addEventListener('click', () => toggleWhitelist(u.id));
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
    if (state.tab === 'changes') {
      return state.scan
        ? 'Brak zarejestrowanych zmian. Uruchom skan ponownie za jakiś czas – tu zobaczysz, kto przestał Cię obserwować, a kto doszedł.'
        : 'Najpierw zrób pierwszy skan.';
    }
    if (!state.scan && state.scanning) return 'Trwa pobieranie list…';
    if (!state.scan) {
      return 'Kliknij „Skanuj”, żeby pobrać listy. Przy dużych kontach może to potrwać kilka minut – możesz zamknąć panel, ale nie zamykaj karty Instagrama.';
    }
    if (state.query) return 'Brak wyników dla tego wyszukiwania.';
    return { notBack: 'Wszyscy, których obserwujesz, obserwują Cię 🎉', fans: 'Obserwujesz wszystkich swoich obserwujących.', mutual: 'Brak wzajemnych obserwacji.' }[state.tab];
  }

  function render() {
    if (!ui.host || ui.panel.classList.contains('hidden')) return;
    const r = ui.r;

    // nagłówek
    r.account.classList.toggle('has', !!state.scan);
    if (state.scan) {
      r.sub.textContent = `${state.scan.username ? '@' + state.scan.username + ' · ' : ''}ostatni skan: ${fmtDate(state.scan.ts)}`;
    } else {
      r.sub.textContent = 'Brak skanu – kliknij „Skanuj”.';
    }

    // zakładki
    const L = computeLists();
    const counts = {
      notBack: L ? L.notBack.filter((u) => !state.whitelist.has(u.id)).length : '–',
      fans: L ? L.fans.length : '–',
      mutual: L ? L.mutual.length : '–',
      changes: state.log.length ? state.log.reduce((s, e) => s + e.lost.length, 0) : '–',
    };
    r.tabs.querySelectorAll('button[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === state.tab);
      b.querySelector('.cnt').textContent = counts[b.dataset.tab];
    });
    r.tabs.querySelector('[data-tab="changes"]').title = 'Liczba osób, które przestały Cię obserwować (wg historii skanów)';
    r.hiddenWrap.classList.toggle('hidden', state.tab !== 'notBack');
    r.showHidden.checked = state.showHidden;

    // lista
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
        const b = el('button', 'btn', `Pokaż więcej (${totalUsers - shown})`);
        b.addEventListener('click', () => { state.limit += RENDER_STEP; render(); });
        li.appendChild(b);
        frag.appendChild(li);
      }
    }
    r.list.replaceChildren(frag);
    r.list.scrollTop = scroll;
  }

  function exportCsv() {
    const items = currentItems().filter((i) => i.user);
    if (!items.length) { ui.message('Brak danych do eksportu w tej zakładce.', 'warn'); return; }
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const changes = state.tab === 'changes';
    const head = ['username', 'imie_nazwisko', 'link', 'zweryfikowany', 'prywatny'];
    if (changes) head.push('zmiana', 'data');
    const lines = [head.map(q).join(',')];
    for (const it of items) {
      const u = it.user;
      const row = [u.username, u.name, `${BASE}/${u.username}/`, u.verified ? 'tak' : 'nie', u.priv ? 'tak' : 'nie'];
      if (changes) row.push(it.type === 'lost' ? 'przestal_obserwowac' : 'nowy_obserwujacy', new Date(it.ts).toISOString());
      lines.push(row.map(q).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const names = { notBack: 'nie-obserwuja-cie', fans: 'ty-nie-obserwujesz', mutual: 'wzajemni', changes: 'zmiany' };
    a.href = url;
    a.download = `instagram-${names[state.tab]}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------------------------------------------------------------- start
  ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'apex-igu:toggle') {
      togglePanel();
      sendResponse({ ok: true });
    }
  });

  (async () => {
    const saved = await store.get('settings', {});
    state.settings = { ...state.settings, ...saved };
    if (!ui.host) ui.build();
    ui.applySettings();
  })();
})();
