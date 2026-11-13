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

(async () => {
  await loadSettings();
  if (!ui.host) ui.build();
})();
