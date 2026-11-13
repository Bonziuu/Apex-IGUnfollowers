// Apex Unfollowers – skrypt tła: tylko otwiera ekran powitalny (po instalacji albo na prośbę panelu).
// Nie wykonuje żadnych zapytań sieciowych i nie przechowuje danych.
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const WELCOME = 'welcome/welcome.html';

ext.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') ext.tabs.create({ url: ext.runtime.getURL(WELCOME) });
});

ext.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'apex-unf:openWelcome') ext.tabs.create({ url: ext.runtime.getURL(WELCOME) });
});
