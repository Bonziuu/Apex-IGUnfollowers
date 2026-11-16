#!/usr/bin/env node
// Apex Unfollowers – paczka skryptu dla aplikacji na telefon.
//
// Skleja mobile/web/bridge.js, shared/i18n.js i content/*.js (w kolejności z manifest.json) oraz
// mobile/web/overrides.js w jeden plik mobile/dist/apex-unfollowers.js i kopiuje go do projektów:
//   android/app/src/main/assets/apex-unfollowers.js
//   ios/ApexUnfollowers/Resources/apex-unfollowers.js
// Aplikacja wstrzykuje go na stronę https://www.instagram.com/ w swoim WebView.
//
//   npm run mobile

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scripts = manifest.content_scripts[0].js;

// overrides.js musi trafić po views.js (wszystkie funkcje panelu już są), a przed main.js (start panelu)
const mainIdx = scripts.indexOf('content/main.js');
if (mainIdx !== scripts.length - 1) throw new Error('content/main.js powinien być ostatni w manifest.json');
const files = ['mobile/web/bridge.js', ...scripts.slice(0, mainIdx), 'mobile/web/overrides.js', 'content/main.js'];

const patch = (file, src) => {
  if (file === 'mobile/web/bridge.js') {
    return src.replace("'__APEX_VERSION__'", JSON.stringify(manifest.version));
  }
  if (file === 'content/ui.js') {
    const from = 'tpl.innerHTML = template();';
    if (!src.includes(from)) throw new Error(`content/ui.js: nie znaleziono "${from}" (zmień tools/build-mobile.mjs)`);
    return src.replace(from, 'tpl.innerHTML = apexHTML(template());');
  }
  return src;
};

const body = files.map((f) => `// ---- ${f}\n${patch(f, read(f))}`).join('\n');
const out = `/* Apex Unfollowers ${manifest.version} – aplikacja na telefon. Plik generowany przez tools/build-mobile.mjs – nie edytuj. */
(function () {
  'use strict';
  if (window.top !== window || location.hostname !== 'www.instagram.com' || window.__apexUnfLoaded) return;
  window.__apexUnfLoaded = true;
  const start = function () {
${body}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
`;

const targets = [
  'mobile/dist/apex-unfollowers.js',
  'android/app/src/main/assets/apex-unfollowers.js',
  'ios/ApexUnfollowers/Resources/apex-unfollowers.js',
];
for (const t of targets) {
  const p = path.join(ROOT, t);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out);
}
console.log(`apex-unfollowers.js ${manifest.version}: ${(out.length / 1024).toFixed(0)} KB → ${targets.join(', ')}`);
