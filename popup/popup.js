// Apex IG Unfollowers – okienko na pasku przeglądarki: otwiera/zamyka panel na instagram.com.
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

(async () => {
  const $ = (id) => document.getElementById(id);
  $('version').textContent = 'v' + ext.runtime.getManifest().version;

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  const onInstagram = !!(tab && tab.url && /^https:\/\/www\.instagram\.com\//.test(tab.url));

  if (tab && tab.id != null) {
    try {
      const res = await ext.tabs.sendMessage(tab.id, { type: 'apex-igu:toggle' });
      if (res && res.ok) { window.close(); return; }
    } catch {
      // brak skryptu wtyczki w tej karcie
    }
  }

  const btn = $('action');
  if (onInstagram) {
    $('title').textContent = 'Odśwież stronę Instagrama';
    $('text').textContent = 'Wtyczka załaduje się po odświeżeniu karty. Potem kliknij ikonę jeszcze raz.';
    btn.textContent = 'Odśwież stronę';
    btn.onclick = async () => { await ext.tabs.reload(tab.id); window.close(); };
  } else {
    $('title').textContent = 'Otwórz Instagram';
    $('text').textContent = 'Wtyczka działa na instagram.com. Zaloguj się, a potem kliknij ikonę wtyczki albo przycisk Apex w prawym dolnym rogu strony.';
    btn.textContent = 'Otwórz instagram.com';
    btn.onclick = async () => { await ext.tabs.create({ url: 'https://www.instagram.com/' }); window.close(); };
  }
  btn.hidden = false;
})();
