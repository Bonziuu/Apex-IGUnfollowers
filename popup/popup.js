// Apex Unfollowers – okienko na pasku przeglądarki: otwiera/zamyka panel na instagram.com.
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

(async () => {
  const $ = (id) => document.getElementById(id);
  const i18n = globalThis.ApexUnf_i18n;
  let language;
  let state = 'opening';
  let renderId = 0;
  const btn = $('action');
  const render = () => {
    document.documentElement.lang = language.locale;
    document.documentElement.dir = language.dir;
    if (state === 'opening') {
      $('title').textContent = language.t('popup.opening');
      return;
    }
    $('title').textContent = language.t(`popup.${state}Title`);
    $('text').textContent = language.t(`popup.${state}Text`);
    btn.textContent = language.t(`popup.${state}Btn`);
    btn.hidden = false;
  };
  const setLanguage = async (preference) => {
    const id = ++renderId;
    const next = await i18n.load(preference);
    if (id !== renderId) return;
    language = next;
    render();
  };
  $('version').textContent = 'v' + ext.runtime.getManifest().version;
  const settings = (await ext.storage.local.get('settings')).settings || {};
  ext.storage.onChanged.addListener((changes, area) => {
    const settingsChange = changes.settings;
    if (area === 'local' && settingsChange && settingsChange.oldValue?.lang !== settingsChange.newValue?.lang) {
      void setLanguage(settingsChange.newValue?.lang);
    }
  });
  await setLanguage(settings.lang);

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  const onInstagram = !!(tab && tab.url && /^https:\/\/www\.instagram\.com\//.test(tab.url));

  if (tab && tab.id != null) {
    try {
      const res = await ext.tabs.sendMessage(tab.id, { type: 'apex-unf:toggle' });
      if (res && res.ok) { window.close(); return; }
    } catch {
      // brak skryptu wtyczki w tej karcie
    }
  }

  state = onInstagram ? 'reload' : 'open';
  if (onInstagram) {
    btn.onclick = async () => { await ext.tabs.reload(tab.id); window.close(); };
  } else {
    btn.onclick = async () => { await ext.tabs.create({ url: 'https://www.instagram.com/' }); window.close(); };
  }
  if (language) render();
})();
