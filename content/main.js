/*
 * Apex Unfollowers – Start: komunikaty z okienka na pasku i inicjalizacja panelu.
 * Pliki content/*.js ładują się po kolei (manifest.json) i dzielą jedną przestrzeń nazw
 * skryptów wtyczki, dlatego deklaracje na najwyższym poziomie używają var / function.
 */
'use strict';

// ---------------------------------------------------------------- start
ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'apex-unf:toggle') {
    togglePanel();
    sendResponse({ ok: true });
  }
});

var settingsReady = loadSettings().then(() => {
  if (!ui.host) ui.build();
});

ext.storage.onChanged?.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const oldLang = I18N.normalizePreference(changes.settings.oldValue?.lang);
  const newLang = I18N.normalizePreference(changes.settings.newValue?.lang);
  if (oldLang === newLang) return;
  await settingsReady;
  await settingsWrites;
  const saved = await store.get('settings', {});
  const lang = I18N.normalizePreference(saved?.lang);
  if (lang === state.settings.lang) return;
  state.settings.lang = lang;
  await updatePanelLanguage();
});
