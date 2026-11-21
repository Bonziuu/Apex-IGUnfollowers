// Apex Unfollowers – ekran powitalny i akceptacja ryzyka (settings.onboarded).
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

(async () => {
  const i18n = globalThis.ApexUnf_i18n;
  let renderId = 0;
  async function renderLanguage(preference) {
    const id = ++renderId;
    const L = await i18n.load(preference);
    if (id !== renderId) return;
    document.documentElement.lang = L.locale;
    document.documentElement.dir = L.dir;
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = L.t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((n) => {
      const label = L.t(n.dataset.i18nHtml);
      const m = /^<strong>(.*?)<\/strong>(.*)$/.exec(label);
      if (!m) { n.textContent = label; return; }
      const strong = document.createElement('strong');
      strong.textContent = m[1];
      n.replaceChildren(strong, document.createTextNode(m[2]));
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((n) => n.setAttribute('aria-label', L.t(n.dataset.i18nAriaLabel)));
    document.getElementById('versionName').textContent = L.t('ext.name');
    document.getElementById('supportCard').hidden = false;
  }
  document.getElementById('versionNumber').textContent = `v${ext.runtime.getManifest().version} · MIT`;
  const accept = document.getElementById('accept');
  const start = document.getElementById('start');
  const open = document.getElementById('open');
  const done = document.getElementById('done');
  const finish = () => {
    start.hidden = true;
    open.hidden = false;
    done.hidden = false;
  };
  accept.addEventListener('change', () => { start.disabled = !accept.checked; });
  start.addEventListener('click', async () => {
    if (!accept.checked) return;
    const current = (await ext.storage.local.get('settings')).settings || {};
    await ext.storage.local.set({ settings: { ...current, onboarded: true } });
    finish();
  });
  const settings = (await ext.storage.local.get('settings')).settings || {};
  if (settings.onboarded) {
    accept.checked = true;
    finish();
  }
  ext.storage.onChanged.addListener((changes, area) => {
    const settingsChange = changes.settings;
    if (area !== 'local' || !settingsChange) return;
    if (settingsChange.newValue?.onboarded) {
      accept.checked = true;
      finish();
    }
    if (settingsChange.oldValue?.lang !== settingsChange.newValue?.lang) void renderLanguage(settingsChange.newValue?.lang);
  });
  await renderLanguage(settings.lang);
})();
