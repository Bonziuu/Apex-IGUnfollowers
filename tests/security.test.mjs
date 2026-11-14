// Testy jednostkowe zabezpieczeń: CSV injection i walidacja kopii zapasowej (content/backup.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ctx = vm.createContext({ window: { fetch() {} }, location: { hostname: 'www.instagram.com' }, chrome: { runtime: {}, storage: { local: {} } }, document: { cookie: '' }, navigator: { language: 'pl' }, console, Date, Math, JSON, URL });
for (const f of ['shared/i18n.js', 'content/core.js', 'content/backup.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { csvCell, validateBackup, BACKUP_LIMITS } = ctx;

test('CSV: formuły i znaki sterujące są neutralizowane', () => {
  for (const evil of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '\n', ' =1', '   +1', '\u00A0=1', '\u3000@1', '\uFEFF=1', '\u200B=1', ' \n -1', '＝1', '＋1', '－1', '＠1']) {
    const cell = csvCell(evil);
    assert.ok(cell.startsWith(`"'`), `${JSON.stringify(evil)} → ${cell}`);
  }
  assert.equal(csvCell('a\u0000b\u0007c'), '"abc"');
  assert.equal(csvCell('Anna "Ania" Nowak'), '"Anna ""Ania"" Nowak"');
  assert.equal(csvCell('konto.1'), '"konto.1"');
  assert.equal(csvCell('Anna Nowak'), '"Anna Nowak"');
  assert.equal(csvCell('Anna = Ania'), '"Anna = Ania"');
  assert.equal(csvCell(''), '""');
  assert.equal(csvCell(null), '""');
});

const now = Date.UTC(2026, 10, 14);
const user = (i, extra = {}) => ({ id: String(i), username: `konto.${i}`, name: `Osoba ${i}`, pic: '', verified: false, priv: false, noPic: true, ...extra });
const good = () => ({
  app: 'apex-unfollowers', format: 1, version: '1.2.1', exportedAt: new Date(now).toISOString(),
  data: {
    settings: { speed: 'safe', lang: 'pl', unfLimit: 30, hideLauncher: false, onboarded: true, evil: '<img>' },
    lastUserId: '999',
    'scan:999': { ts: now - 1000, userId: '999', username: 'apex.test', followers: [user(1), user(2)], following: [user(2), user(3)] },
    'log:999': [{ ts: now - 1000, since: now - 5000, lost: [user(4)], gained: [] }],
    'hist:999': [{ ts: now - 1000, followers: 2, following: 2, mutual: 1 }],
    'wl:999': ['3', '3'],
    'unf:999': [{ ts: now - 2000, id: '5', username: 'konto.5' }],
    'unfBlock:999': 0,
    'resume:999': { anything: true },
    unknownKey: 1,
  },
});

test('kopia: poprawna kopia przechodzi i jest oczyszczana', () => {
  const out = validateBackup(good(), now);
  assert.deepEqual(Object.keys(out).sort(), ['hist:999', 'lastUserId', 'log:999', 'scan:999', 'settings', 'unf:999', 'unfBlock:999', 'wl:999']);
  assert.equal(out.settings.evil, undefined);
  assert.deepEqual([...out['wl:999']], ['3']);
  assert.equal(out['scan:999'].followers.length, 2);
});

test('kopia: zdjęcia spoza serwerów Instagrama są usuwane', () => {
  const b = good();
  b.data['scan:999'].followers[0].pic = 'https://evil.example/track.gif';
  b.data['scan:999'].followers[1].pic = 'https://scontent-waw1-1.cdninstagram.com/v/t51/p.jpg';
  const out = validateBackup(b, now);
  assert.equal(out['scan:999'].followers[0].pic, '');
  assert.equal(out['scan:999'].followers[0].noPic, true);
  assert.match(out['scan:999'].followers[1].pic, /cdninstagram\.com/);
});

test('kopia: wadliwe dane odrzucają całą kopię', () => {
  const cases = [
    (b) => { b.app = 'something-else'; },
    (b) => { b.data = []; },
    (b) => { b.data['scan:999'].followers = 'x'; },
    (b) => { b.data['scan:999'].followers[0].id = '1; DROP'; },
    (b) => { b.data['scan:999'].followers[0].username = '<script>'; },
    (b) => { b.data['scan:999'].ts = 'yesterday'; },
    (b) => { b.data['scan:999'].ts = now + 30 * 86400e3; },
    (b) => { b.data['scan:999'].userId = '123'; },
    (b) => { b.data['hist:999'][0].followers = -1; },
    (b) => { b.data['log:999'] = Array.from({ length: 101 }, () => ({ ts: now, since: null, lost: [], gained: [] })); },
    (b) => { b.data['unf:999'][0].id = {}; },
    (b) => { b.data.lastUserId = '../x'; },
    (b) => { b.data = { 'resume:999': {} }; },
    (b) => { for (let i = 0; i < BACKUP_LIMITS.accounts + 1; i++) b.data['wl:' + (1000 + i)] = []; },
  ];
  for (const [i, mutate] of cases.entries()) {
    const b = good();
    mutate(b);
    assert.throws(() => validateBackup(b, now), /backup:/, `przypadek ${i}`);
  }
});

test('kopia: zbyt długa lista kont jest odrzucana', () => {
  const b = good();
  b.data['wl:999'] = new Array(BACKUP_LIMITS.users + 1).fill('1');
  assert.throws(() => validateBackup(b, now), /whitelist/);
});

test('kopia: blokada odobserwowania nie może być dłuższa niż przerwa wtyczki', () => {
  const b = good();
  b.data['unfBlock:999'] = now + 86400e3;
  const out = validateBackup(b, now);
  assert.ok(out['unfBlock:999'] <= now + 6 * 3600e3);
});
