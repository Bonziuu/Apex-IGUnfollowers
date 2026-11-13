// Apex Unfollowers – okienko na pasku przeglądarki: otwiera/zamyka panel na instagram.com.
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

(async () => {
  const $ = (id) => document.getElementById(id);
  const settings = (await ext.storage.local.get('settings')).settings || {};
  const L = globalThis.ApexUnf_i18n.make(settings.lang || 'auto');
  const t = (k) => L.t(k);
  document.documentElement.lang = L.lang;
  $('version').textContent = 'v' + ext.runtime.getManifest().version;
  $('title').textContent = t('popup.opening');

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

  const btn = $('action');
  if (onInstagram) {
    $('title').textContent = t('popup.reloadTitle');
    $('text').textContent = t('popup.reloadText');
    btn.textContent = t('popup.reloadBtn');
    btn.onclick = async () => { await ext.tabs.reload(tab.id); window.close(); };
  } else {
    $('title').textContent = t('popup.openTitle');
    $('text').textContent = t('popup.openText');
    btn.textContent = t('popup.openBtn');
    btn.onclick = async () => { await ext.tabs.create({ url: 'https://www.instagram.com/' }); window.close(); };
  }
  btn.hidden = false;
})();
