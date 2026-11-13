#!/usr/bin/env node
// Sprawdza, czy manifest.json jest poprawnym JSON-em i czy istnieje każdy plik, który wskazuje
// (skrypty treści, tło, popup, ikony, strona powitalna, _locales). Uruchamiane w CI.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = new Set();
const add = (f) => { if (typeof f === 'string' && f) files.add(f); };

for (const cs of manifest.content_scripts || []) { (cs.js || []).forEach(add); (cs.css || []).forEach(add); }
add(manifest.background?.service_worker);
(manifest.background?.scripts || []).forEach(add);
add(manifest.action?.default_popup);
Object.values(manifest.action?.default_icon || {}).forEach(add);
Object.values(manifest.icons || {}).forEach(add);
for (const war of manifest.web_accessible_resources || []) (war.resources || []).filter((r) => !r.includes('*')).forEach(add);
if (manifest.default_locale) add(`_locales/${manifest.default_locale}/messages.json`);

const missing = [...files].filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error('manifest.json wskazuje brakujące pliki:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log(`manifest.json ${manifest.version}: OK, ${files.size} plików istnieje`);
