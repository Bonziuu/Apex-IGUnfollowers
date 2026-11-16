/*
 * Apex Unfollowers – aplikacja na telefon: most do aplikacji (Android / iOS) i zamiennik API wtyczki.
 *
 * tools/build-mobile.mjs wkleja ten plik na początek paczki mobile/dist/apex-unfollowers.js, przed
 * shared/i18n.js i content/*.js. Cała paczka działa wewnątrz jednej funkcji, więc `browser` i `chrome`
 * poniżej zasłaniają ewentualne zmienne strony, a content/core.js bierze właśnie ten obiekt jako `ext`.
 *
 * Aplikacja podaje skryptowi most:
 *   - Android: obiekt `ApexUnfNative` (WebViewCompat.addWebMessageListener, tylko dla https://www.instagram.com),
 *   - iOS: `window.webkit.messageHandlers.apexUnf` (WKScriptMessageHandlerWithReply).
 * Obie strony rozmawiają tym samym protokołem: zapytanie {op, ...} i odpowiedź {result} albo {error},
 * zawsze jako tekst JSON. Operacje: get, set, remove, clear (pamięć), save (zapis pliku), open (link).
 */
'use strict';

var ApexNativeBridge = (() => {
  const ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.apexUnf;
  const android = !ios && typeof window.ApexUnfNative === 'object' && window.ApexUnfNative ? window.ApexUnfNative : null;
  const pending = new Map();
  let seq = 0;

  const settle = (reply, resolve, reject) => {
    let m;
    try { m = typeof reply === 'string' ? JSON.parse(reply) : reply; } catch (e) { reject(e); return; }
    if (!m || m.error) reject(new Error((m && m.error) || 'empty reply'));
    else resolve(m.result === undefined ? null : m.result);
  };

  if (android) {
    android.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      const p = m && pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      settle(m, p.resolve, p.reject);
    });
  }

  function call(op, args) {
    const msg = Object.assign({ op }, args || {});
    if (ios) {
      return new Promise((resolve, reject) => {
        ios.postMessage(JSON.stringify(msg)).then((r) => settle(r, resolve, reject), reject);
      });
    }
    if (android) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        android.postMessage(JSON.stringify(Object.assign({ id }, msg)));
      });
    }
    return Promise.reject(new Error('Apex Unfollowers: no app bridge'));
  }

  return { call, platform: ios ? 'ios' : android ? 'android' : 'none' };
})();

// Zamiennik chrome.storage.local / chrome.runtime – tylko to, czego używają content/*.js.
// Wartości przechodzą przez most jako tekst JSON (aplikacja zapisuje je bez rozbierania).
var browser = (() => {
  const keyList = (k) => (k == null ? null : Array.isArray(k) ? k.map(String) : typeof k === 'object' ? Object.keys(k) : [String(k)]);
  return {
    runtime: {
      getManifest: () => ({ version: '__APEX_VERSION__' }),
      onMessage: { addListener() {} },
      async sendMessage(msg) {
        // jedyna wiadomość wysyłana przez panel: „pokaż ekran powitalny” – w aplikacji otwieramy stronę produktu
        if (msg && msg.type === 'apex-unf:openWelcome') {
          await ApexNativeBridge.call('open', { url: `${SITE}/${L.lang === 'pl' ? 'pl' : 'en'}/unfollowers/` });
        }
        return undefined;
      },
    },
    storage: {
      local: {
        async get(k) {
          const raw = (await ApexNativeBridge.call('get', { keys: keyList(k) })) || {};
          const out = {};
          for (const key of Object.keys(raw)) {
            try { out[key] = JSON.parse(raw[key]); } catch { /* uszkodzony wpis pomijamy */ }
          }
          if (k && typeof k === 'object' && !Array.isArray(k)) {
            for (const key of Object.keys(k)) if (!(key in out)) out[key] = k[key];
          }
          return out;
        },
        async set(obj) {
          const items = {};
          for (const key of Object.keys(obj || {})) {
            if (obj[key] !== undefined) items[key] = JSON.stringify(obj[key]);
          }
          await ApexNativeBridge.call('set', { items });
        },
        async remove(k) {
          await ApexNativeBridge.call('remove', { keys: keyList(k) || [] });
        },
        async clear() {
          await ApexNativeBridge.call('clear');
        },
      },
    },
  };
})();
var chrome = browser;

// Instagram może wymagać Trusted Types: jedyne przypisanie HTML w panelu (szablon w content/ui.js)
// przechodzi przez tę funkcję (tools/build-mobile.mjs podmienia je w paczce).
var apexHTML = (() => {
  let policy = null;
  try {
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      policy = window.trustedTypes.createPolicy('apex-unfollowers', { createHTML: (s) => s });
    }
  } catch { policy = null; }
  return (html) => (policy ? policy.createHTML(html) : html);
})();
