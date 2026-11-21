// Apex Unfollowers – otwiera ekran powitalny i udostępnia panelowi pliki językowe z paczki.
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const WELCOME = 'welcome/welcome.html';

ext.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') ext.tabs.create({ url: ext.runtime.getURL(WELCOME) });
});

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'apex-unf:openWelcome') ext.tabs.create({ url: ext.runtime.getURL(WELCOME) });
  if (msg?.type !== 'apex-unf:loadLocale' || typeof msg.lang !== 'string' || !/^[a-z]{2,3}(?:_[A-Za-z0-9]+)*$/.test(msg.lang)) return;

  fetch(ext.runtime.getURL(`_locales/${msg.lang}/messages.json`))
    .then((response) => response.ok ? response.json() : null)
    .then(sendResponse, () => sendResponse(null));
  return true;
});
