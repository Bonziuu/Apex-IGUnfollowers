/*
 * Apex Unfollowers – bezpieczny eksport i przywracanie danych.
 *  - csvCell(): komórka CSV odporna na „CSV injection” (formuły w arkuszach),
 *  - validateBackup(): pełna walidacja kopii zapasowej przed zapisem; zwraca nowy, oczyszczony
 *    obiekt albo rzuca błąd – nic nie trafia do pamięci, dopóki cała kopia nie przejdzie kontroli.
 * Czyste funkcje bez DOM (testy jednostkowe ładują ten plik w node:vm).
 */

// ---------------------------------------------------------------- CSV
// Excel, Google Sheets i LibreOffice traktują komórkę zaczynającą się od = + - @ (także tab/CR
// i ich pełnoszerokie odpowiedniki) jako formułę. Taka wartość dostaje na początku apostrof,
// więc arkusz pokaże ją jako zwykły tekst. Znaki sterujące (poza \t \n \r) są usuwane.
var CSV_FORMULA_RE = /^[=+\-@\t\r＝＋－＠]/;
var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function csvCell(value) {
  let s = String(value ?? '').replace(CONTROL_RE, '');
  if (CSV_FORMULA_RE.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------- kopia zapasowa
var BACKUP_LIMITS = {
  bytes: 64 * 1024 * 1024,   // największy plik kopii
  accounts: 20,              // kont Instagram w jednej kopii
  users: 250000,             // kont na jednej liście (obserwujący / obserwowani / biała lista)
  logUsers: 50000,           // kont w jednym wpisie historii zmian
  count: 100000000,          // największy licznik w historii
};
var BACKUP_ID_RE = /^\d{1,25}$/;
var BACKUP_USERNAME_RE = /^[A-Za-z0-9._]{0,30}$/;
// zdjęcia profilowe tylko z serwerów Instagrama – inny adres z pliku nie zostanie wczytany przez panel
var BACKUP_PIC_RE = /^https:\/\/(?:[a-z0-9-]+\.)*(?:cdninstagram\.com|fbcdn\.net)\//i;
var BACKUP_LANGS = ['auto', 'pl', 'en'];

function backupFail(what) { throw new Error('backup: ' + what); }

function validateBackup(payload, now = Date.now()) {
  const MIN_TS = Date.UTC(2010, 0, 1);
  const MAX_TS = now + 2 * 24 * 3600 * 1000;
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const ts = (v, what) => (Number.isFinite(v) && v >= MIN_TS && v <= MAX_TS ? v : backupFail(what));
  const count = (v, what) => (Number.isInteger(v) && v >= 0 && v <= BACKUP_LIMITS.count ? v : backupFail(what));
  const id = (v, what) => {
    const s = typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : v;
    return typeof s === 'string' && BACKUP_ID_RE.test(s) ? s : backupFail(what);
  };
  const list = (v, max, what) => (Array.isArray(v) && v.length <= max ? v : backupFail(what));
  const text = (v, max) => (typeof v === 'string' ? v.replace(CONTROL_RE, '').slice(0, max) : '');
  const user = (u) => {
    if (!isObj(u)) backupFail('user');
    const username = typeof u.username === 'string' && BACKUP_USERNAME_RE.test(u.username) ? u.username : backupFail('username');
    const pic = typeof u.pic === 'string' && BACKUP_PIC_RE.test(u.pic) && u.pic.length <= 2048 ? u.pic : '';
    return { id: id(u.id, 'user id'), username, name: text(u.name, 200), pic, verified: u.verified === true, priv: u.priv === true, noPic: u.noPic === true || !pic };
  };
  const users = (v, max, what) => list(v, max, what).map(user);

  if (!isObj(payload) || !BACKUP_APPS.includes(payload.app) || !isObj(payload.data)) backupFail('format');
  const out = {};
  const accounts = new Set();
  for (const [key, value] of Object.entries(payload.data)) {
    if (!BACKUP_KEY_RE.test(key)) continue;   // nieznane klucze są pomijane, nie zapisywane
    const [kind, acc] = key.split(':');
    if (acc) accounts.add(acc);
    switch (kind) {
      case 'settings': {
        if (!isObj(value)) backupFail('settings');
        const s = {};
        if (typeof value.speed === 'string' && Object.hasOwn(SPEEDS, value.speed)) s.speed = value.speed;
        if (typeof value.lang === 'string' && BACKUP_LANGS.includes(value.lang)) s.lang = value.lang;
        if (UNF.limits.includes(value.unfLimit)) s.unfLimit = value.unfLimit;
        if (typeof value.hideLauncher === 'boolean') s.hideLauncher = value.hideLauncher;
        if (typeof value.onboarded === 'boolean') s.onboarded = value.onboarded;
        out.settings = s;
        break;
      }
      case 'lastUserId':
        out.lastUserId = id(value, 'lastUserId');
        break;
      case 'scan': {
        if (!isObj(value)) backupFail('scan');
        if (value.userId != null && id(value.userId, 'scan userId') !== acc) backupFail('scan owner');
        out[key] = {
          ts: ts(value.ts, 'scan ts'),
          userId: acc,
          username: value.username == null ? null : (BACKUP_USERNAME_RE.test(String(value.username)) ? String(value.username) : backupFail('scan username')),
          followers: users(value.followers, BACKUP_LIMITS.users, 'followers'),
          following: users(value.following, BACKUP_LIMITS.users, 'following'),
        };
        break;
      }
      case 'log':
        out[key] = list(value, MAX_LOG, 'log').map((e) => {
          if (!isObj(e)) backupFail('log entry');
          return {
            ts: ts(e.ts, 'log ts'),
            since: e.since == null ? null : ts(e.since, 'log since'),
            lost: users(e.lost, BACKUP_LIMITS.logUsers, 'log lost'),
            gained: users(e.gained, BACKUP_LIMITS.logUsers, 'log gained'),
          };
        });
        break;
      case 'hist':
        out[key] = list(value, MAX_HIST, 'hist').map((e) => {
          if (!isObj(e)) backupFail('hist entry');
          return { ts: ts(e.ts, 'hist ts'), followers: count(e.followers, 'hist'), following: count(e.following, 'hist'), mutual: count(e.mutual ?? 0, 'hist') };
        });
        break;
      case 'wl':
        out[key] = [...new Set(list(value, BACKUP_LIMITS.users, 'whitelist').map((v) => id(v, 'whitelist id')))];
        break;
      case 'unf':
        out[key] = list(value, MAX_UNF_LOG, 'unfollow log').map((e) => {
          if (!isObj(e)) backupFail('unfollow entry');
          const username = typeof e.username === 'string' && BACKUP_USERNAME_RE.test(e.username) ? e.username : '';
          return { ts: ts(e.ts, 'unfollow ts'), id: id(e.id, 'unfollow id'), username };
        });
        break;
      case 'unfBlock':
        // blokada odobserwowania: 0 albo czas jej końca – nie dłużej niż najdłuższa przerwa wtyczki
        out[key] = value === 0 ? 0 : Math.min(ts(value, 'unfBlock'), now + UNF.blockFeedbackMs);
        break;
      default:
        break;
    }
  }
  if (accounts.size > BACKUP_LIMITS.accounts) backupFail('too many accounts');
  if (!Object.keys(out).length) backupFail('empty');
  return out;
}
