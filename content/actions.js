/*
 * Apex Unfollowers – Działania: skan (ze wznawianiem), odobserwowanie, kopia zapasowa, zgłaszanie problemów.
 * Pliki content/*.js ładują się po kolei (manifest.json) i dzielą jedną przestrzeń nazw
 * skryptów wtyczki, dlatego deklaracje na najwyższym poziomie używają var / function.
 */
'use strict';

// ---------------------------------------------------------------- skan
// Postęp skanu zapisuje się co ok. 20 s i przy przerwaniu (resume:<id>), więc duże konta
// można dokończyć później zamiast zaczynać od zera. Punkt wznowienia jest ważny 12 h.
var fmtDuration = (ms) => (ms < 60000 ? t('time.lessMin') : t('time.min', { n: Math.round(ms / 60000) }));

function savedCount(cp) {
  return cp ? cp.users.length + (cp.followers ? cp.followers.length : 0) : 0;
}

async function startScan({ fresh = false } = {}) {
  if (state.scanning) return;
  state.scanning = true;
  const ctx = makeCtx(state.settings.speed);
  ctx.onNote = (text) => ui.note(text);
  state.ctx = ctx;
  ui.setScanning(true);
  ui.message(null);
  ui.progress(null, t('scan.checking'));
  render();

  let progress = null;   // { phase, users, maxId, followers }
  let lastSave = 0;
  const saveProgress = async (force = false) => {
    if (!progress || !state.userId || (!progress.users.length && !progress.followers)) return;
    if (!force && Date.now() - lastSave < 20000) return;
    lastSave = Date.now();
    const cp = { ts: Date.now(), userId: state.userId, phase: progress.phase, users: progress.users, maxId: progress.maxId, followers: progress.followers || null };
    state.resume = cp;
    try { await store.set('resume:' + state.userId, cp); } catch (e) { console.warn('[Apex Unfollowers] zapis postępu', e); }
  };

  try {
    const acc = await resolveAccount(ctx);
    if (acc.id !== state.userId) await loadAccount(acc.id);
    if (fresh && state.resume) {
      state.resume = null;
      await store.remove('resume:' + acc.id);
    }
    const cp = state.resume && state.resume.userId === acc.id ? state.resume : null;
    if (cp) ui.note(t('scan.resuming', { n: fmtNum(savedCount(cp)) }));

    const totFr = acc.counts ? acc.counts.followers : 0;
    const totFg = acc.counts ? acc.counts.following : 0;
    const total = totFr + totFg;
    const frac = (n) => (total ? Math.min(1, n / total) : null);
    const of = (n, tot) => fmtNum(n) + (tot ? ' / ' + fmtNum(tot) : '');
    // szacowany czas: średni czas strony (z przerwami) × pozostałe strony; po co najmniej 3 stronach
    const eta = (done) => {
      if (!total || ctx.pages < 3) return '';
      const perPage = (Date.now() - ctx.started) / ctx.pages;
      const left = Math.max(0, total - done);
      return ' · ' + t('scan.eta', { t: fmtDuration(Math.ceil(left / PAGE_SIZE) * perPage) });
    };

    let followers;
    let frCount = 0;
    if (cp && cp.phase === 'following' && cp.followers) {
      followers = cp.followers;
      frCount = followers.length;
    } else {
      followers = await fetchComplete('followers', acc.id, ctx, totFr, (n) => {
        frCount = n;
        ui.progress(frac(n), t('scan.followers', { n: of(n, totFr) }) + eta(n));
      }, {
        resume: cp && cp.phase === 'followers' ? cp : null,
        onPage: (users, maxId) => { progress = { phase: 'followers', users, maxId }; saveProgress(); },
      });
    }

    // obserwujący gotowi: punkt wznowienia od listy obserwowanych
    progress = { phase: 'following', users: [], maxId: null, followers };
    await saveProgress(true);
    ui.progress(frac(frCount), t('scan.followersDone', { n: fmtNum(frCount) }));
    await ctx.wait(rand(...ctx.speed.between));

    const following = await fetchComplete('following', acc.id, ctx, totFg, (n) => {
      ui.progress(frac(frCount + n), t('scan.following', { f: fmtNum(frCount), n: of(n, totFg) }) + eta(frCount + n));
    }, {
      resume: cp && cp.phase === 'following' && cp.users.length ? cp : null,
      onPage: (users, maxId) => { progress = { phase: 'following', users, maxId, followers }; saveProgress(); },
    });
    progress = null;

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
      const prevIdx = makeIndex(prev.followers);
      const curIdx = makeIndex(followers);
      const lost = prev.followers.filter((u) => !curIdx.has(u));
      const gained = followers.filter((u) => !prevIdx.has(u));
      if (lost.length || gained.length) {
        change = { ts: scan.ts, since: prev.ts, lost, gained };
        state.log = [change, ...state.log].slice(0, MAX_LOG);
      }
    }

    state.scan = scan;
    state.resume = null;
    state.hist = [...state.hist, { ts: scan.ts, ...countsOf(scan) }].slice(-MAX_HIST);
    await store.setMany({
      ['scan:' + acc.id]: scan,
      ['log:' + acc.id]: state.log,
      ['hist:' + acc.id]: state.hist,
      lastUserId: acc.id,
    });
    await store.remove('resume:' + acc.id);

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
    if (progress) await saveProgress(true);
    const saved = progress && state.resume ? t('scan.progressSaved', { n: fmtNum(savedCount(state.resume)) }) : '';
    if (e.kind === 'abort') ui.message(saved ? t('scan.paused') + ' ' + saved : t('scan.aborted'), 'warn');
    else ui.message([e.message || String(e), saved].filter(Boolean).join(' '), 'error', `scan ${e.kind || 'error'}${e.status ? ' HTTP ' + e.status : ''}`);
    console.warn('[Apex Unfollowers]', e);
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
  const r = await unfollowRequest(u);
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
      tokens: t('unf.noTokens'),
      still: t('unf.still', { user: u.username }),
      unconfirmed: t('unf.unconfirmed', { user: u.username }),
    };
    ui.message(msgs[r.kind] || msgs.http, 'error', `unfollow ${r.kind}${r.status ? ' HTTP ' + r.status : ''}${r.info ? ' ' + r.info : ''}`);
  }
  render();
}

// ---------------------------------------------------------------- kopia zapasowa
async function exportBackup() {
  const all = await store.all();
  const data = {};
  for (const [k, v] of Object.entries(all)) if (BACKUP_KEY_RE.test(k)) data[k] = v;
  const payload = {
    app: 'apex-unfollowers',
    format: 1,
    version: manifestVersion(),
    exportedAt: new Date().toISOString(),
    data,
  };
  download(
    new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    `apex-unfollowers-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
  const accounts = Object.keys(data).filter((k) => k.startsWith('scan:')).length;
  ui.message(t('backup.exported', { n: accounts }), 'ok');
}

async function importBackup(file) {
  try {
    if (file.size > BACKUP_LIMITS.bytes) { ui.message(t('backup.tooBig', { mb: BACKUP_LIMITS.bytes / 1048576 }), 'error'); return; }
    // cała kopia jest sprawdzana i oczyszczana przed zapisem; jeden zapis = wszystko albo nic
    const data = validateBackup(JSON.parse(await file.text()));
    await store.setMany(data);
    await loadSettings();
    const id = getCookie('ds_user_id');
    await loadAccount(id);
    const accounts = Object.keys(data).filter((k) => k.startsWith('scan:')).length;
    ui.rebuild();
    ui.message(t('backup.imported', { date: fmtDate(Date.now()), n: accounts }), 'ok');
  } catch (e) {
    console.warn('[Apex Unfollowers] import', e);
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

// ---------------------------------------------------------------- zgłaszanie problemów
// Zgłoszenie zawiera tylko wersję, przeglądarkę, język i treść ostatniego błędu – bez nazw kont.
function browserInfo() {
  const brands = navigator.userAgentData && navigator.userAgentData.brands;
  if (brands && brands.length) {
    const b = brands.find((x) => !/not.?a.?brand|chromium/i.test(x.brand)) || brands.find((x) => /chromium/i.test(x.brand));
    if (b) return `${b.brand} ${b.version}`;
  }
  const m = navigator.userAgent.match(/(Firefox|Edg|OPR|Chrome)\/(\d+)/);
  return m ? `${({ Edg: 'Edge', OPR: 'Opera' })[m[1]] || m[1]} ${m[2]}` : 'unknown';
}

function reportDetails() {
  const e = state.lastError;
  return {
    version: manifestVersion(),
    browser: browserInfo(),
    lang: L.lang,
    error: e ? `${e.text}${e.detail ? '\n[' + e.detail + ']' : ''}` : '',
  };
}

function reportIssueUrl() {
  const d = reportDetails();
  const short = d.error ? d.error.split('\n')[0].slice(0, 70) : '';
  const q = new URLSearchParams({
    template: 'bug.yml',
    title: `[${d.version}] ${short}`.trim(),
    version: d.version,
    browser: d.browser,
    error: d.error,
  });
  return `${REPO}/issues/new?${q}`;
}

function reportMailUrl() {
  const d = reportDetails();
  const body = [
    t('report.mailIntro'),
    '',
    `Apex Unfollowers ${d.version}`,
    `${t('report.browser')}: ${d.browser}`,
    `${t('report.language')}: ${d.lang}`,
    d.error ? `${t('report.error')}: ${d.error}` : '',
  ].filter((x) => x !== '').join('\n');
  return `mailto:${AUTHOR.email}?subject=${encodeURIComponent(`Apex Unfollowers ${d.version} – ${t('report.subject')}`)}&body=${encodeURIComponent(body)}`;
}

function openReport(kind) {
  const url = kind === 'mail' ? reportMailUrl() : reportIssueUrl();
  if (kind === 'mail') window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

// ekran powitalny w osobnej karcie (otwiera go skrypt tła)
function openWelcomePage() {
  try { ext.runtime.sendMessage({ type: 'apex-unf:openWelcome' }); } catch (e) { console.warn('[Apex Unfollowers]', e); }
}
