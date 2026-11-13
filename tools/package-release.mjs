#!/usr/bin/env node
// Apex Unfollowers – paczka dla użytkownika: dist/Apex-Unfollowers-<wersja>.zip (z folderem Apex-Unfollowers), kopia bez numeru,
// paczka do sklepów dist/Apex-Unfollowers-<wersja>-store.zip (pliki w głównym katalogu)
// wersji i dist/SHA256SUMS.txt. Do paczki trafiają tylko pliki potrzebne wtyczce.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'manifest.json', 'background.js', 'LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md',
  'welcome/welcome.html', 'welcome/welcome.css', 'welcome/welcome.js', 'icons/logo.svg',
  'shared/i18n.js',
  ...JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).content_scripts[0].js.filter((f) => f.startsWith('content/')),
  '_locales/en/messages.json', '_locales/pl/messages.json',
  'popup/popup.html', 'popup/popup.css', 'popup/popup.js',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png',
];

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const dist = path.join(ROOT, 'dist');
const stage = path.join(dist, 'Apex-Unfollowers');
fs.rmSync(dist, { recursive: true, force: true });
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) throw new Error(`Brak pliku: ${f}`);
  fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
  fs.copyFileSync(src, path.join(stage, f));
}

const zipName = `Apex-Unfollowers-${version}.zip`;
const zipPath = path.join(dist, zipName);
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}' -DestinationPath '${zipPath}'`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-rqX', zipPath, 'Apex-Unfollowers'], { cwd: dist, stdio: 'inherit' });
}
fs.copyFileSync(zipPath, path.join(dist, 'Apex-Unfollowers.zip'));

// Paczka do sklepów (Chrome Web Store, Firefox Add-ons, Edge Add-ons): manifest.json w głównym katalogu ZIP-a.
const storeZip = path.join(dist, `Apex-Unfollowers-${version}-store.zip`);
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}\\*' -DestinationPath '${storeZip}'`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-rqX', storeZip, '.'], { cwd: stage, stdio: 'inherit' });
}
fs.rmSync(stage, { recursive: true, force: true });

const sums = ['Apex-Unfollowers.zip', zipName].map((n) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, n))).digest('hex');
  return `${hash}  ${n}`;
});
fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log(['dist/' + zipName, 'dist/Apex-Unfollowers.zip', `dist/Apex-Unfollowers-${version}-store.zip`, 'dist/SHA256SUMS.txt'].join('\n'));
