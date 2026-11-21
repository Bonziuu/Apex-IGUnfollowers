#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../shared/i18n.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const localesDir = path.join(root, '_locales');
const listingsDir = path.join(root, 'docs', 'chrome-web-store');
const { languages } = globalThis.ApexUnf_i18n;
const errors = [];
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const metadataLimits = { extName: 75, extShortName: 12, extDescription: 132 };
const listingHeadings = ['Short description', 'Full description', 'Search phrases', 'Screenshot copy', 'Key benefits'];
const richText = /^page_feat[1-4]$/;

function compareSets(expected, actual, label) {
  const missing = [...expected].filter((item) => !actual.has(item));
  const extra = [...actual].filter((item) => !expected.has(item));
  if (missing.length) errors.push(`${label} — missing: ${missing.join(', ')}`);
  if (extra.length) errors.push(`${label} — unexpected: ${extra.join(', ')}`);
}

function readCatalog(code) {
  const filename = path.join(localesDir, code, 'messages.json');
  try {
    const catalog = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('expected a JSON object');
    return catalog;
  } catch (error) {
    errors.push(`${code}/messages.json — ${error.message}`);
    return {};
  }
}

function placeholders(message) {
  return [...message.matchAll(/\{([a-z][a-z\d_]*)\}/gi)].map((match) => match[1]).sort().join(',');
}

function validateListing(code, catalog) {
  let text;
  try {
    text = fs.readFileSync(path.join(listingsDir, `${code}.md`), 'utf8');
  } catch (error) {
    errors.push(`${code}.md — ${error.message}`);
    return;
  }
  const [title, ...sections] = text.trim().split(/^##\s+/m);
  const blocks = new Map(sections.map((section) => {
    const end = section.indexOf('\n');
    return [section.slice(0, end).trim(), section.slice(end + 1).trim()];
  }));
  if (title.trim() !== `# ${catalog.extName?.message}`) errors.push(`${code}.md — title must match extName`);
  if (blocks.get('Short description') !== catalog.extDescription?.message) errors.push(`${code}.md — short description must match extDescription`);
  compareSets(new Set(listingHeadings), new Set(blocks.keys()), `${code}.md headings`);
  for (const [heading, value] of blocks) {
    if (!value) errors.push(`${code}.md — empty section: ${heading}`);
  }
  if (blocks.get('Full description')?.length > 16000) errors.push(`${code}.md — full description exceeds 16000 characters`);
}

const expectedCodes = new Set(languages.map(({ code }) => code));
const actualCodes = new Set(fs.readdirSync(localesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name));
compareSets(expectedCodes, actualCodes, '_locales');
const listingCodes = new Set(fs.readdirSync(listingsDir).filter((name) => name.endsWith('.md') && name !== 'README.md').map((name) => name.slice(0, -3)));
compareSets(expectedCodes, listingCodes, 'docs/chrome-web-store');
if (expectedCodes.size !== languages.length) errors.push('Language registry contains duplicate codes');
if (manifest.default_locale !== 'en') errors.push('The default manifest locale must be en');
for (const [field, key] of Object.entries({ name: 'extName', short_name: 'extShortName', description: 'extDescription' })) {
  if (manifest[field] !== `__MSG_${key}__`) errors.push(`manifest.json — ${field} must use ${key}`);
}
if (manifest.action?.default_title !== '__MSG_extName__') errors.push('manifest.json — action.default_title must use extName');

const english = readCatalog('en');
const expectedKeys = new Set(Object.keys(english));
for (const { code, locale, name, dir } of languages) {
  const localeCode = locale.replaceAll('-', '_');
  if (!/^[a-z]{2,3}(?:_[A-Z]{2}|_\d{3})?$/.test(code) || (localeCode !== code && !localeCode.startsWith(`${code}_`))) {
    errors.push(`${code} — locale code does not match ${locale}`);
  }
  if (!name.trim() || !['ltr', 'rtl'].includes(dir)) errors.push(`${code} — invalid language registry entry`);
  const catalog = code === 'en' ? english : readCatalog(code);
  compareSets(expectedKeys, new Set(Object.keys(catalog)), code);

  for (const [key, entry] of Object.entries(catalog)) {
    const message = entry?.message;
    if (!/^[a-zA-Z0-9_]+$/.test(key)) errors.push(`${code}.${key} — invalid Chrome message key`);
    if (typeof message !== 'string' || !message.trim()) {
      errors.push(`${code}.${key} — missing or empty message`);
      continue;
    }
    if (typeof english[key]?.message === 'string' && placeholders(message) !== placeholders(english[key].message)) {
      errors.push(`${code}.${key} — placeholders differ from en (${placeholders(english[key].message)})`);
    }
    if (richText.test(key) ? !/^<strong>[^<>]+<\/strong>[^<>]+$/.test(message) : /<[^>]+>/.test(message)) {
      errors.push(`${code}.${key} — invalid markup`);
    }
    if (key === 'stats_mutual' && /[%٪％]/.test(message)) errors.push(`${code}.${key} — {p} includes the percent sign`);
    if (key.startsWith('csv_head') && typeof english[key]?.message === 'string' && message.split(',').length !== english[key].message.split(',').length) {
      errors.push(`${code}.${key} — CSV column count differs from en`);
    }
  }
  for (const [key, limit] of Object.entries(metadataLimits)) {
    const message = catalog[key]?.message;
    if (typeof message !== 'string' || !message.trim() || message.length > limit || placeholders(message)) {
      errors.push(`${code}.${key} — expected 1–${limit} characters with no placeholders`);
    }
  }
  if (!catalog.extName?.message?.includes('Apex')) errors.push(`${code}.extName — missing Apex brand`);
  validateListing(code, catalog);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${languages.length} locales validated (${expectedKeys.size} keys each), including Chrome Web Store listings.`);
}
