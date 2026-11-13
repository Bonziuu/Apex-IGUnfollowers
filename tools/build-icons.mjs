#!/usr/bin/env node
// Apex IG Unfollowers – ikony w stylu marki Apex: znak „Apex A”, różowy gradient (#f2559f → #cc1670) o tej samej
// głębi co morski gradient Apex AdBlocker (#22b8a8 → #0f7f8c). Sam znak, bez badge'a –
// od Apex AdBlocker odróżnia go kolor.
//
//   npm run icons        generuje icons/icon{16,32,48,128}.png, icons/logo.svg i brand/*
//
// 16/32 px: uproszczony, grubszy znak – czytelny na jasnym i ciemnym pasku przeglądarki.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SIZES = Object.freeze([16, 32, 48, 128]);
export const PALETTE = Object.freeze({ c1: '#f2559f', c2: '#cc1670' });

const gradient = (id, x2 = '0.42') =>
  `<linearGradient id="g-${id}" x1="0" y1="0" x2="${x2}" y2="1"><stop offset="0" stop-color="${PALETTE.c1}"/><stop offset="1" stop-color="${PALETTE.c2}"/></linearGradient>`;

const MARK = 'M64 7 116 112H91L64 59 37 112H12L64 7Zm0 34-12 25h24L64 41Z';
const MARK_SMALL = 'M64 5 121 120H92L64 64 35 120H7L64 5ZM64 47 54 69H74L64 47Z';

/** SVG ikony w danym rozmiarze: sam znak „Apex A”, jak w Apex AdBlocker (16/32 px – uproszczony znak). */
export function iconSvg(size) {
  const small = size <= 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>${gradient('i', small ? '0.45' : '0.42')}</defs>
  <path fill="url(#g-i)" fill-rule="evenodd" d="${small ? MARK_SMALL : MARK}"/>
</svg>
`;
}

/** Logo (README, materiały): sam znak „Apex A”, przezroczyste tło, wyśrodkowany w pionie. */
export function logoSvg(size, { padding = 0 } = {}) {
  const k = (128 - 2 * padding) / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>${gradient('logo')}</defs>
  <g transform="translate(${padding} ${padding + 4.5 * k}) scale(${k})"><path fill="url(#g-logo)" fill-rule="evenodd" d="${MARK}"/></g>
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
