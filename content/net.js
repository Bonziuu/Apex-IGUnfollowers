/*
 * Apex Unfollowers – Sieć: zapytania do instagram.com (listy, liczniki, odobserwowanie).
 * Pliki content/*.js ładują się po kolei (manifest.json) i dzielą jedną przestrzeń nazw
 * skryptów wtyczki, dlatego deklaracje na najwyższym poziomie używają var / function.
 */
'use strict';

// ---------------------------------------------------------------- sieć
// X-IG-WWW-Claim: Instagram trzyma go w sessionStorage („www-claim-v2”) i odświeża nagłówkiem
// X-IG-Set-WWW-Claim. X-Web-Session-ID: trzy grupy po 6 znaków, jedna na załadowanie strony.
var wwwClaim = null;
var WEB_SESSION_ID = [0, 0, 0].map(() => Math.random().toString(36).slice(2, 8).padEnd(6, '0')).join(':');
function claim() {
  if (wwwClaim === null) {
    try { wwwClaim = window.sessionStorage.getItem('www-claim-v2') || '0'; } catch { wwwClaim = '0'; }
  }
  return wwwClaim;
}
function rememberClaim(res) {
  const c = res.headers.get('x-ig-set-www-claim');
  if (!c) return;
  wwwClaim = c;
  try { window.sessionStorage.setItem('www-claim-v2', c); } catch { /* wystarczy kopia w pamięci */ }
}

function igHeaders(extra = {}) {
  const h = {
    'accept': '*/*',
    'x-ig-app-id': page().appId,
    'x-asbd-id': page().asbdId,
    'x-ig-www-claim': claim(),
    'x-web-session-id': WEB_SESSION_ID,
    'x-requested-with': 'XMLHttpRequest',
    ...extra,
  };
  const csrf = getCookie('csrftoken');
  if (csrf) h['x-csrftoken'] = csrf;
  return h;
}

// Wykonuje zapytanie i czyta odpowiedź jako tekst (Instagram potrafi odpowiedzieć HTML-em z kodem 200).
async function igFetch(path, init) {
  const res = await pageFetch(BASE + path, { credentials: 'include', ...init });
  rememberClaim(res);
  const type = res.headers.get('content-type') || '';
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = JSON.parse(text.replace(/^for \(;;\);/, '')); } catch { data = null; }
  if (data !== null && typeof data !== 'object') data = null;
  return { res, data, text, type };
}

// Krótki opis odpowiedzi do komunikatu błędu i konsoli (bez danych osobowych).
function describe(r) {
  if (r.data) {
    const msg = r.data.message || r.data.feedback_message || r.data.error_type || r.data.errorSummary || '';
    return msg ? String(msg).slice(0, 80) : 'JSON: ' + Object.keys(r.data).slice(0, 5).join(', ');
  }
  const type = (r.type.split(';')[0] || 'brak typu').trim();
  let redirected = '';
  try { if (r.res.redirected) redirected = ' → ' + new URL(r.res.url).pathname; } catch { /* brak URL */ }
  return type + redirected;
}

function makeCtx(speedKey) {
  const ctx = {
    aborted: false,
    started: Date.now(),   // do szacowania pozostałego czasu
    pages: 0,
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
    async pace(pageNo) {
      const s = ctx.speed;
      if (pageNo % s.every === 0) {
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

async function igGet(path, ctx, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (ctx.aborted) throw new ScanError(t('err.abort'), 'abort');
    const last = attempt === attempts;

    let r;
    try {
      r = await igFetch(path, { method: 'GET', headers: igHeaders() });
    } catch (e) {
      if (last) throw new ScanError(t('err.network'), 'http');
      ctx.onNote?.(t('note.retryNet', { a: attempt, n: attempts }));
      await ctx.wait(5000 * attempt);
      continue;
    }
    const { res, data } = r;
    const msg = data ? String(data.message || data.feedback_message || '') : '';

    if (res.ok && data && data.status !== 'fail') return data;

    if (data && (data.checkpoint_url || /checkpoint/i.test(msg))) {
      throw new ScanError(t('err.checkpoint'), 'auth', res.status);
    }
    if (data && (data.require_login || /login_required/i.test(msg))) {
      throw new ScanError(t('err.login'), 'auth', res.status);
    }

    // HTML z kodem 200 zamiast JSON to u Instagrama zwykle chwilowe przyhamowanie
    const softThrottle = res.ok && !data;
    const limited = softThrottle || res.status === 429 || (data && data.spam) ||
      /wait|spam|feedback_required|try again|rate.?limit/i.test(msg);
    if (limited || res.status >= 500) {
      if (last) break;
      const sec = (softThrottle ? 30 : 60) * attempt;
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

// Lista obserwujących / obserwowanych przez REST API strony www.
// opts.count – rozmiar strony; opts.surface – parametr search_surface (strona www go dodaje);
// opts.resume – { users, maxId } z przerwanego skanu; opts.onPage(users, maxId) – po każdej stronie.
async function fetchListRest(kind, userId, ctx, onCount, opts = {}) {
  const users = opts.resume ? [...opts.resume.users] : [];
  const index = new Set(users.map((u) => u.id));
  let maxId = opts.resume ? opts.resume.maxId : null;
  let count = opts.count || PAGE_SIZE;
  const surface = opts.surface !== false;
  let pageNo = opts.resume ? Math.ceil(users.length / count) : 0;
  if (opts.resume) onCount(users.length);
  for (;;) {
    const q = new URLSearchParams({ count: String(count) });
    if (surface) q.set('search_surface', 'follow_list_page');
    if (maxId) q.set('max_id', maxId);
    let data;
    try {
      data = await igGet(`/api/v1/friendships/${userId}/${kind}/?${q}`, ctx);
    } catch (e) {
      if (e.kind === 'http' && e.status === 400 && count !== 12) { count = 12; continue; }
      e.page = pageNo;
      throw e;
    }
    const batch = data.users || [];
    for (const raw of batch) {
      const u = normUser(raw);
      if (!index.has(u.id)) { index.add(u.id); users.push(u); }
    }
    pageNo++;
    ctx.pages++;
    onCount(users.length);
    const next = data.next_max_id != null && data.next_max_id !== '' ? String(data.next_max_id) : null;
    opts.onPage?.(users, next);
    // koniec listy, pusta strona albo ten sam kursor drugi raz (zabezpieczenie przed pętlą)
    if (!next || data.has_more === false || batch.length === 0 || next === maxId) break;
    maxId = next;
    await ctx.pace(pageNo);
  }
  return users;
}

// Lista z kontrolą kompletności: gdy brakuje wyraźnie więcej kont niż wynika z licznika profilu,
// pobieramy listę jeszcze raz w innych wariantach (jak strona www) i łączymy wyniki.
var isShort = (got, expected) => expected > 0 && expected - got > Math.max(2, Math.round(expected * 0.01));

async function fetchComplete(kind, userId, ctx, expected, onCount, opts = {}) {
  let users;
  try {
    users = await fetchListRest(kind, userId, ctx, onCount, { resume: opts.resume, onPage: opts.onPage });
  } catch (e) {
    // kursor z przerwanego skanu mógł wygasnąć – wtedy ta lista od początku
    if (!opts.resume || !['http', 'parse'].includes(e.kind)) throw e;
    console.warn(`[Apex Unfollowers] ${kind}: nie udało się wznowić, pobieram od początku`, e);
    users = await fetchListRest(kind, userId, ctx, onCount, { onPage: opts.onPage });
  }
  if (!isShort(users.length, expected)) return users;
  const variants = [
    ['count12', { count: 12, surface: true }],
    ['count12-plain', { count: 12, surface: false }],
  ];
  for (const [name, opts] of variants) {
    console.warn(`[Apex Unfollowers] ${kind}: ${users.length} z ${expected}, dociągam (${name})`);
    ctx.onNote?.(t('note.repair', { got: fmtNum(users.length), expected: fmtNum(expected) }));
    await ctx.wait(rand(...ctx.speed.between));
    let extra;
    try {
      extra = await fetchListRest(kind, userId, ctx, () => {}, opts);
    } catch (e) {
      if (e.kind === 'abort' || e.kind === 'auth') throw e;
      console.warn(`[Apex Unfollowers] ${kind}: ${name} nie zadziałał`, e);
      continue;
    }
    // pełniejsza lista wyznacza kolejność, druga uzupełnia braki
    const [base, add] = extra.length > users.length ? [extra, users] : [users, extra];
    const idx = makeIndex(base);
    users = [...base, ...add.filter((u) => !idx.has(u))];
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
        id = d.user.pk_id || (d.user.pk != null ? String(d.user.pk) : null);
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
  // Liczniki z profilu – do paska postępu i kontroli kompletności list, więc błędy ignorujemy.
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
  if (!username) {
    try {
      const d = await igGet('/api/v1/accounts/current_user/?edit=true', ctx, 1);
      username = (d && d.user && d.user.username) || null;
    } catch (e) {
      if (e.kind === 'abort') throw e;
    }
  }
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
// Na podstawie davidarroyo1234/InstagramUnfollowers (MIT) – zob. THIRD_PARTY_NOTICES.md.
// Tak jak przycisk „Przestań obserwować” na instagram.com (od listopada 2026): POST
// /api/v1/friendships/destroy/<id>/ z tokenami sesji strony (fb_dtsg, jazoest) i nagłówkami
// strony www. Sam kod 2xx niczego nie dowodzi – Instagram odpowiada stroną HTML z kodem 200,
// więc sukces liczymy dopiero po potwierdzeniu.
var tokensCache = null;

function tokensFromHtml(html) {
  const fbDtsg = (/"DTSGInitialData",\[\],\{"token":"([^"]+)"/.exec(html) || /"dtsg":\{"token":"([^"]+)"/.exec(html) || [])[1];
  if (!fbDtsg) return null;
  const rev = /"client_revision":(\d+)/.exec(html) || /"server_revision":(\d+)/.exec(html);
  return { fbDtsg, revision: rev ? rev[1] : '' };
}

async function sessionTokens(fresh = false) {
  if (tokensCache && !fresh) return tokensCache;
  tokensCache = fresh ? null : tokensFromHtml(document.documentElement.innerHTML);
  if (!tokensCache) {
    try {
      const res = await pageFetch(BASE + '/', { credentials: 'include' });
      tokensCache = tokensFromHtml(await res.text());
    } catch (e) {
      console.warn('[Apex Unfollowers] nie udało się pobrać tokenów sesji', e);
    }
  }
  return tokensCache;
}

// Suma kontrolna fb_dtsg używana przez Instagram: „2” + suma kodów znaków.
function jazoest(s) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return '2' + sum;
}

function findFriendshipStatus(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  if (node.friendship_status && typeof node.friendship_status === 'object') return node.friendship_status;
  for (const v of Object.values(node)) {
    const found = findFriendshipStatus(v, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Czy nadal obserwujesz konto: wyszukanie go na Twojej liście obserwowanych (jak wyszukiwarka
// w oknie „Obserwowani”). true / false, albo null, gdy nie da się sprawdzić.
async function isStillFollowing(u) {
  const viewer = state.userId || getCookie('ds_user_id');
  if (!viewer) return null;
  const q = new URLSearchParams({ count: '12', query: u.username, search_surface: 'follow_list_page' });
  try {
    const r = await igFetch(`/api/v1/friendships/${viewer}/following/?${q}`, { method: 'GET', headers: igHeaders() });
    if (!r.res.ok || !r.data || !Array.isArray(r.data.users)) return null;
    const name = u.username.toLowerCase();
    return r.data.users.some((x) => {
      const n = normUser(x);
      return n.id === u.id || String(x.pk) === u.id || n.username.toLowerCase() === name;
    });
  } catch {
    return null;
  }
}

async function unfollowRequest(u) {
  const tokens = await sessionTokens();
  if (!tokens) return { ok: false, kind: 'tokens' };
  const extra = { 'content-type': 'application/x-www-form-urlencoded' };
  if (tokens.revision) extra['x-instagram-ajax'] = tokens.revision;
  const body = new URLSearchParams({
    container_module: 'profile',
    nav_chain: 'PolarisProfilePostsTabRoot:profilePage:1:via_cold_start',
    user_id: u.id,
    jazoest: jazoest(tokens.fbDtsg),
    fb_dtsg: tokens.fbDtsg,
  });

  let r;
  try {
    r = await igFetch(`/api/v1/friendships/destroy/${u.id}/`, { method: 'POST', headers: igHeaders(extra), body: body.toString() });
  } catch {
    return { ok: false, kind: 'network' };
  }
  const { res, data } = r;
  const errText = data ? `${JSON.stringify(data.errors || data.error || '')} ${data.message || ''} ${data.feedback_message || ''} ${data.errorSummary || ''}` : '';

  if (data && (data.checkpoint_url || /checkpoint/i.test(errText))) return { ok: false, kind: 'checkpoint' };
  if (data && (data.require_login || /login_required/i.test(errText))) return { ok: false, kind: 'auth' };
  if (res.status === 429 || (data && (data.spam === true || data.feedback_required)) ||
      /feedback_required|action_blocked|spam|try again later|rate.?limit/i.test(errText)) {
    return { ok: false, kind: res.status === 429 ? 'slow' : 'blocked' };
  }
  if (!res.ok || !data || data.errors || data.error || data.status !== 'ok') {
    console.warn('[Apex Unfollowers] odobserwowanie: odpowiedź Instagrama', res.status, describe(r), r.text.slice(0, 300));
    tokensCache = null; // przy kolejnej próbie pobierzemy świeże tokeny
    return { ok: false, kind: 'http', status: res.status, info: describe(r) };
  }

  const fs = findFriendshipStatus(data);
  if (fs && (fs.following === true || fs.outgoing_request === true)) return { ok: false, kind: 'still' };
  if (fs && fs.following === false) return { ok: true };

  // brak friendship_status w odpowiedzi – sprawdzamy listę obserwowanych
  await sleep(1200);
  const still = await isStillFollowing(u);
  if (still === false) return { ok: true, verified: true };
  if (still === true) return { ok: false, kind: 'still' };
  return { ok: false, kind: 'unconfirmed' };
}
