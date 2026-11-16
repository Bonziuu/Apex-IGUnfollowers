/*
 * Apex Unfollowers – aplikacja na telefon: zmiany względem wtyczki.
 *
 * tools/build-mobile.mjs wkleja ten plik po content/views.js, a przed content/main.js, więc wszystkie
 * funkcje panelu już istnieją, a panel nie jest jeszcze zbudowany. Logika skanu, listy, statystyki,
 * limity odobserwowań i kopia zapasowa pozostają te same co we wtyczce – tu zmienia się tylko to,
 * co na telefonie działa inaczej: zapis plików, otwieranie linków, układ na mały ekran.
 */
'use strict';

// ---------------------------------------------------------------- teksty: aplikacja zamiast wtyczki
// DICT jest czytany przy każdym t(), więc podmiana działa też dla już utworzonego L.
Object.assign(I18N.DICT.pl, {
  'welcome.lead': 'Aplikacja porównuje listy Twoich obserwujących i obserwowanych na Instagramie. Działa na Twoim telefonie, bez konta i bez wysyłania danych do autora.',
  'welcome.step1': 'Zaloguj się na Instagram w tej aplikacji (ekran logowania Instagrama).',
  'welcome.riskText': 'Aplikacja korzysta z nieoficjalnego API strony Instagrama. Regulamin Instagrama nie pozwala na automatyczne pobieranie danych, więc używasz jej na własną odpowiedzialność.',
  'welcome.risk2': 'odobserwowuj spokojnie – aplikacja pilnuje przerw i limitu dziennego,',
  'welcome.accept': 'Rozumiem i chcę korzystać z aplikacji.',
  'welcome.privacy': 'Dane zostają na tym telefonie.',
  'set.about': 'O aplikacji',
  'set.reportHint': 'Coś nie działa? Zgłoszenie zawiera tylko wersję aplikacji, system i treść ostatniego błędu – bez nazw kont.',
  'report.buttonTitle': 'Otwórz gotowe zgłoszenie na GitHubie (wersja, system, treść błędu)',
  'report.browser': 'Aplikacja',
  'err.format': 'Instagram zmienił format danych – aplikacja wymaga aktualizacji.',
  'scan.noCounts': 'Nie udało się odczytać liczników z profilu, więc aplikacja nie mogła sprawdzić, czy listy są kompletne.',
  'ui.footer': 'Dane zostają tylko na Twoim telefonie.',
  'set.langAuto': 'Automatycznie (język telefonu)',
  'set.unfHint': 'Instagram ogranicza liczbę akcji. Zbyt wiele odobserwowań w krótkim czasie może zablokować akcje na koncie na kilka godzin lub dni. Między kolejnymi odobserwowaniami aplikacja wymusza 15 s przerwy.',
  'set.backupHint': 'Plik JSON z wynikami skanów, historią, białą listą i ustawieniami. Przydaje się przy zmianie telefonu albo przenosinach z wtyczki w przeglądarce (i odwrotnie).',
  'empty.loggedOut': 'Zaloguj się na Instagramie, żeby zobaczyć swoje wyniki. Zapisane skany zostają w pamięci aplikacji i wrócą po zalogowaniu na to samo konto.',
});
Object.assign(I18N.DICT.en, {
  'welcome.lead': 'The app compares your Instagram followers and following lists. It runs on your phone, with no account and no data sent to the author.',
  'welcome.step1': 'Log in to Instagram in this app (Instagram’s own login screen).',
  'welcome.riskText': 'The app uses the unofficial API of the Instagram website. Instagram’s terms do not allow automated data collection, so you use it at your own risk.',
  'welcome.risk2': 'unfollow calmly – the app enforces breaks and a daily limit,',
  'welcome.accept': 'I understand and want to use the app.',
  'welcome.privacy': 'Your data stays on this phone.',
  'set.reportHint': 'Something not working? A report contains only the app version, your system and the last error – no account names.',
  'report.buttonTitle': 'Open a pre-filled report on GitHub (version, system, error)',
  'report.browser': 'App',
  'err.format': 'Instagram changed its data format – the app needs an update.',
  'scan.noCounts': 'Could not read your profile counters, so the app could not check that the lists are complete.',
  'unf.unconfirmed': 'Instagram accepted the request, but the app could not confirm that @{user} is unfollowed. Check that profile.',
  'ui.footer': 'Your data stays on your phone only.',
  'set.langAuto': 'Automatic (phone language)',
  'set.unfHint': 'Instagram limits the number of actions. Too many unfollows in a short time can block actions on your account for hours or days. The app enforces a 15-second break between unfollows.',
  'set.backupHint': 'A JSON file with scan results, history, whitelist and settings. Useful when moving to a new phone or between the app and the browser extension.',
  'empty.loggedOut': 'Log in to Instagram to see your results. Saved scans stay in the app and come back when you log in to the same account.',
});

// ---------------------------------------------------------------- układ na telefon
CSS += `
  @media (max-width: 720px) {
    .wrap { font-size: 14px; }
    .panel {
      top: 0; right: 0; bottom: 0; left: 0; width: auto; max-width: none;
      border-radius: 0; border: 0; box-shadow: none;
      padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    }
    header { padding: 10px 8px 8px 14px; }
    .brand { font-size: 16px; }
    .ib { width: 42px; height: 42px; font-size: 18px; }
    .primary, .btn { height: 44px; font-size: 15px; }
    /* 16 px w polach tekstowych: iOS nie powiększa wtedy strony przy dotknięciu pola */
    select, input[type="search"] { height: 44px; font-size: 16px; }
    .tools { grid-template-columns: minmax(0, 1fr); }
    .tools .line { flex-wrap: wrap; min-width: 0; }
    .tools .line select { flex: 1 1 40%; min-width: 0; width: 0; }
    .tools .line .btn { flex: none; }
    nav button { padding: 10px 2px; font-size: 12px; }
    nav .cnt { font-size: 20px; }
    .row { padding: 10px 14px; }
    .av { width: 44px; height: 44px; }
    .nm { font-size: 13px; }
    .mini { height: 36px; padding: 0 12px; font-size: 13px; }
    .chk { font-size: 13px; }
    .chk input { width: 18px; height: 18px; }
    .sub, .ptext, .msg, .welcome p, .welcome ol, .welcome ul, .welcome .risk, .welcome .accept, .set p { font-size: 14px; }
    .welcome .accept input { width: 20px; height: 20px; }
    .linkbtn { padding: 6px 0; }
    footer { padding-bottom: 10px; }
  }
  .launcher { bottom: calc(84px + env(safe-area-inset-bottom, 0px)); right: 16px; width: 56px; height: 56px; }
  /* w aplikacji nie ma ikony na pasku przeglądarki, więc przycisk na stronie musi zostać */
  .launcher.hidden { display: flex !important; }
  section.set:has([data-ref="showLauncher"]) { display: none; }
`;

// Zapisuje style panelu także jako arkusz konstruowany – działa nawet wtedy, gdy CSP strony
// zablokuje element <style> (we wtyczce skrypty działają poza CSP strony, w aplikacji nie).
var buildPanel = ui.build;
ui.build = function () {
  const first = !this.host;
  buildPanel.call(this);
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    this.shadow.adoptedStyleSheets = [sheet];
  } catch { /* zostaje element <style> */ }
  if (first) this.shadow.addEventListener('click', onPanelLink, true);
};

// ---------------------------------------------------------------- linki i pliki
// Linki z panelu (profil na Instagramie, GitHub, e-mail) otwiera system: profil – w aplikacji
// Instagram, jeśli jest zainstalowana, reszta – w przeglądarce albo programie pocztowym.
function openExternal(url) {
  ApexNativeBridge.call('open', { url: String(url) }).catch((e) => console.warn('[Apex Unfollowers] open', e));
}

function onPanelLink(e) {
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a || !e.isTrusted) return;
  const href = a.href;
  if (!/^(https?:|mailto:)/i.test(href)) return;
  e.preventDefault();
  e.stopPropagation();
  openExternal(href);
}

// CSV i kopia zapasowa: zamiast pobierania przez przeglądarkę – systemowe okno zapisu / udostępniania.
download = function (blob, name) {
  blob.text()
    .then((text) => ApexNativeBridge.call('save', { name, mime: (blob.type || 'application/octet-stream').split(';')[0], text }))
    .catch((e) => {
      console.warn('[Apex Unfollowers] save', e);
      ui.message(String(e && e.message ? e.message : e), 'error');
    });
};

openReport = function (kind) {
  openExternal(kind === 'mail' ? reportMailUrl() : reportIssueUrl());
};

var pluginBrowserInfo = browserInfo;
browserInfo = function () {
  return `Apex Unfollowers app (${ApexNativeBridge.platform}), ${pluginBrowserInfo()}`;
};

// ---------------------------------------------------------------- aplikacja → panel
// Przycisk „wstecz” na Androidzie: najpierw zamyka panel, dopiero potem cofa stronę.
window.__apexUnfBack = () => {
  if (ui.panel && !ui.panel.classList.contains('hidden')) {
    togglePanel(false);
    return true;
  }
  return false;
};
window.__apexUnfOpen = () => { togglePanel(true); };

// Po uruchomieniu aplikacji panel otwiera się sam (raz na sesję), gdy jesteś zalogowany.
(async () => {
  for (let i = 0; i < 50 && !ui.host; i++) await sleep(100);
  let opened = false;
  try { opened = window.sessionStorage.getItem('apex-unf-autoopen') === '1'; } catch { opened = false; }
  if (opened || !getCookie('ds_user_id') || !ui.host) return;
  try { window.sessionStorage.setItem('apex-unf-autoopen', '1'); } catch { /* bez znaczenia */ }
  togglePanel(true);
})();
