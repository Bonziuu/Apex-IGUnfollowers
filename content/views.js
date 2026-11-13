/*
 * Apex Unfollowers – Widoki panelu: listy, statystyki z wykresem, ekran powitalny, eksport CSV.
 * Pliki content/*.js ładują się po kolei (manifest.json) i dzielą jedną przestrzeń nazw
 * skryptów wtyczki, dlatego deklaracje na najwyższym poziomie używają var / function.
 */
'use strict';

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
  // dopóki ekran powitalny nie zostanie zaakceptowany, panel pokazuje tylko jego
  const view = state.settings.onboarded ? state.view : 'welcome';

  r.account.classList.toggle('has', !!state.scan);
  r.sub.textContent = state.scan
    ? `${state.scan.username ? '@' + state.scan.username + ' · ' : ''}${t('ui.lastScan', { date: fmtDate(state.scan.ts) })}`
    : t('ui.noScan');

  r.controls.classList.toggle('hidden', view === 'welcome');
  r.statsBtn.classList.toggle('hidden', view === 'welcome');
  r.settingsBtn.classList.toggle('hidden', view === 'welcome');
  r.vWelcome.classList.toggle('hidden', view !== 'welcome');
  r.vLists.classList.toggle('hidden', view !== 'lists');
  r.vStats.classList.toggle('hidden', view !== 'stats');
  r.vSettings.classList.toggle('hidden', view !== 'settings');
  r.statsBtn.classList.toggle('on', view === 'stats');
  r.settingsBtn.classList.toggle('on', view === 'settings');

  // przerwany skan do wznowienia
  const cp = !state.scanning && view !== 'welcome' ? state.resume : null;
  r.resumeRow.classList.toggle('hidden', !cp);
  if (cp) r.resumeText.textContent = t('ui.resumeInfo', { date: fmtTime(cp.ts), n: fmtNum(savedCount(cp)) });
  if (!state.scanning) r.scan.textContent = state.resume ? t('ui.resume') : t('ui.scan');

  if (view === 'lists') renderLists();
  else if (view === 'stats') renderStats();
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
