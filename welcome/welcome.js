// Apex Unfollowers – ekran powitalny: teksty PL/EN, akceptacja ryzyka (settings.onboarded).
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

(async () => {
  const settings = (await ext.storage.local.get('settings')).settings || {};
  const L = globalThis.ApexUnf_i18n.make(settings.lang || 'auto');
  document.documentElement.lang = L.lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = L.t(n.dataset.i18n); });
  // klucze page.feat* mają postać „<strong>nazwa</strong> – opis”: składamy je z elementów DOM
  document.querySelectorAll('[data-i18n-html]').forEach((n) => {
    const m = /^<strong>(.*?)<\/strong>(.*)$/.exec(L.t(n.dataset.i18nHtml));
    if (!m) { n.textContent = L.t(n.dataset.i18nHtml); return; }
    const strong = document.createElement('strong');
    strong.textContent = m[1];
    n.replaceChildren(strong, document.createTextNode(m[2]));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((n) => n.setAttribute('aria-label', L.t(n.dataset.i18nAriaLabel)));
  document.getElementById('version').textContent = `${L.t('ext.name')} v${ext.runtime.getManifest().version} · MIT`;

  const accept = document.getElementById('accept');
  const start = document.getElementById('start');
  const open = document.getElementById('open');
  const done = document.getElementById('done');
  const finish = () => {
    start.hidden = true;
    open.hidden = false;
    done.hidden = false;
  };
  if (settings.onboarded) {
    accept.checked = true;
    finish();
  }
  accept.addEventListener('change', () => { start.disabled = !accept.checked; });
  start.addEventListener('click', async () => {
    if (!accept.checked) return;
    const current = (await ext.storage.local.get('settings')).settings || {};
    await ext.storage.local.set({ settings: { ...current, onboarded: true } });
    finish();
  });
})();
