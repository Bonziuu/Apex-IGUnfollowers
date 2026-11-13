#!/usr/bin/env node
// Apex IG Unfollowers – ikony w stylu marki Apex: znak „Apex A”, różowy gradient (#e64a94 → #b8145f) o tej samej
// głębi co morski gradient Apex AdBlocker (#22b8a8 → #0f7f8c). Zamiast badge'a stanu (✓ / pauza) jest badge z sylwetką osoby (obserwujący).
//
//   npm run icons        generuje icons/icon{16,32,48,128}.png, icons/logo.svg i brand/*
//
// 16/32 px: większy badge, żeby ikona odróżniała się od Apex AdBlocker na pasku przeglądarki.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SIZES = Object.freeze([16, 32, 48, 128]);
export const PALETTE = Object.freeze({ c1: '#e64a94', c2: '#b8145f', ring: '#8f0d4c' });

const gradient = (id, x2 = '0.42') =>
  `<linearGradient id="g-${id}" x1="0" y1="0" x2="${x2}" y2="1"><stop offset="0" stop-color="${PALETTE.c1}"/><stop offset="1" stop-color="${PALETTE.c2}"/></linearGradient>`;

const MARK = 'M64 7 116 112H91L64 59 37 112H12L64 7Zm0 34-12 25h24L64 41Z';
const MARK_SMALL = 'M64 5 121 120H92L64 64 35 120H7L64 5ZM64 47 54 69H74L64 47Z';

/** Sylwetka osoby wpisana w badge o środku (cx, cy) i promieniu r. */
function person(cx, cy, r) {
  const hr = r * 0.3;               // głowa
  const hy = cy - r * 0.28;
  const sw = r * 0.62;              // pół szerokości ramion
  const sy = cy + r * 0.62;         // dół ramion
  const st = cy + r * 0.12;         // góra ramion
  return `<circle cx="${cx}" cy="${hy}" r="${hr}" fill="#fff"/>` +
    `<path fill="#fff" d="M${cx - sw} ${sy}C${cx - sw} ${st} ${cx + sw} ${st} ${cx + sw} ${sy}Z"/>`;
}

/** SVG ikony w danym rozmiarze. */
export function iconSvg(size) {
  const small = size <= 32;
  const [cx, cy, r, ring] = small ? [92, 90, 31, 6] : [94, 88, 19, 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>${gradient('i', small ? '0.45' : '0.42')}</defs>
  <path fill="url(#g-i)" fill-rule="evenodd" d="${small ? MARK_SMALL : MARK}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE.c2}" stroke="${PALETTE.ring}" stroke-width="${ring}"/>
  ${person(cx, cy, r)}
</svg>
`;
}

/** Logo (README, nagłówek panelu, materiały): znak z badge'em, przezroczyste tło. */
export function logoSvg(size, { padding = 0 } = {}) {
  const k = (128 - 2 * padding) / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>${gradient('logo')}</defs>
  <g transform="translate(${padding} ${padding + 4.5 * k}) scale(${k})">
    <path fill="url(#g-logo)" fill-rule="evenodd" d="${MARK}"/>
    <circle cx="94" cy="88" r="19" fill="${PALETTE.c2}" stroke="${PALETTE.ring}" stroke-width="4"/>
    ${person(94, 88, 19)}
  </g>
</svg>
`;
}

export async function buildIcons() {
  const { chromium } = await import('playwright');
  const out = [];
  const write = (rel, data) => {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    out.push(rel);
  };
  write('icons/logo.svg', logoSvg(128));
  write('brand/apex-igunfollowers-logo.svg', logoSvg(1024));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 1 });
    const shot = async (rel, svg, size) => {
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
      const file = path.join(ROOT, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
      out.push(rel);
    };
    for (const s of SIZES) await shot(`icons/icon${s}.png`, iconSvg(s), s);
    await shot('brand/apex-igunfollowers-logo-512.png', logoSvg(512), 512);
    await shot('brand/apex-igunfollowers-store-icon-128.png', logoSvg(128, { padding: 16 }), 128);
  } finally {
    await browser.close();
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await buildIcons();
  console.log(files.map((f) => '  ' + f).join('\n'));
}
