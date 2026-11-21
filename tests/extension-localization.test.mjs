import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const readCatalog = async (lang) => JSON.parse(await readFile(path.join(root, '_locales', lang, 'messages.json'), 'utf8'));
const supportUrl = 'https://ko-fi.com/konradwozniak1996';

async function checkText(locator, expected) {
  await locator.filter({ hasText: expected }).waitFor({ state: 'visible' });
  assert.equal(await locator.textContent(), expected);
}

async function checkSupport(surfaces, catalog) {
  for (const { link, hint } of surfaces) {
    await checkText(link, catalog.support_link.message);
    await checkText(hint, catalog.support_hint.message);
    assert.equal(await link.getAttribute('href'), supportUrl);
    assert.equal(await link.getAttribute('target'), '_blank');
    const rel = (await link.getAttribute('rel')).split(/\s+/);
    assert.ok(rel.includes('noopener') && rel.includes('noreferrer'));
  }
}

test('Chromium loads its packaged locales and refreshes all extension surfaces when the language changes', { timeout: 45_000 }, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'apex-extension-test-'));
  let context;
  t.after(async () => {
    try { await context?.close(); }
    finally { await rm(profile, { recursive: true, force: true }); }
  });
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  context.setDefaultTimeout(10_000);
  const supportRequests = [];
  await context.route('https://ko-fi.com/**', (route) => {
    supportRequests.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mock Ko-fi</title>' });
  });
  await context.route('https://www.instagram.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><title>Mock Instagram</title><h1>Mock Instagram</h1></html>',
  }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const base = new URL('.', worker.url());
  const welcomeUrl = new URL('welcome/welcome.html', base).href;
  await worker.evaluate(() => chrome.storage.local.set({ settings: { onboarded: true, unfLimit: 50 } }));

  const welcome = await context.newPage();
  await welcome.goto(welcomeUrl);
  const native = await welcome.evaluate(() => ({
    name: chrome.runtime.getManifest().name,
    description: chrome.runtime.getManifest().description,
    nameMessage: chrome.i18n.getMessage('extName'),
    descriptionMessage: chrome.i18n.getMessage('extDescription'),
    language: ApexUnf_i18n.resolve('auto'),
    languageCount: ApexUnf_i18n.languages.length,
  }));
  assert.match(native.name, /^Apex\b/);
  assert.equal(native.name, native.nameMessage);
  assert.ok(native.description);
  assert.equal(native.description, native.descriptionMessage);
  const [automatic, polish, arabic] = await Promise.all([native.language, 'pl', 'ar'].map(readCatalog));
  await checkText(welcome.locator('h1'), automatic.page_title.message);

  const instagram = await context.newPage();
  await instagram.goto('https://www.instagram.com/');
  const panel = instagram.locator('#apex-unfollowers-root');
  const launcher = panel.locator('.launcher');
  await launcher.click();
  await checkText(panel.locator('[data-ref=scan]'), automatic.ui_scan.message);
  await panel.locator('[data-ref=settingsBtn]').click();
  const select = panel.locator('[data-ref=lang]');
  assert.equal(await select.inputValue(), 'auto');
  assert.equal(await select.locator('option').count(), native.languageCount + 1);

  const popup = await context.newPage();
  await popup.goto(new URL('popup/popup.html', base).href);
  await checkText(popup.locator('#title'), automatic.popup_openTitle.message);
  const panelSupport = panel.locator('[data-ref=support]');
  const surfaces = [
    { link: panelSupport, hint: panel.locator('[data-ref=supportHint]') },
    { link: welcome.locator('#supportLink'), hint: welcome.locator('#supportHint') },
    { link: popup.locator('#supportLink'), hint: popup.locator('#supportHint') },
  ];
  await checkSupport(surfaces, automatic);
  // Instagram's page scripts can reach the open shadow root. A synthetic click must not leave the site.
  assert.equal(await panelSupport.evaluate((link) => link.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  }))), false);
  await instagram.bringToFront();
  await select.press('p');
  assert.equal(await select.inputValue(), 'pl');
  await checkText(panel.locator('[data-ref=scan]'), polish.ui_scan.message);
  await checkText(welcome.locator('h1'), polish.page_title.message);
  await checkText(popup.locator('#title'), polish.popup_openTitle.message);
  await checkSupport(surfaces, polish);
  await welcome.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.lang === 'pl');
  const saved = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  assert.equal(saved.lang, 'pl');
  assert.equal(saved.unfLimit, 50);

  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, lang: 'ar' } });
  });
  await checkText(panel.locator('[data-ref=scan]'), arabic.ui_scan.message);
  await checkText(welcome.locator('h1'), arabic.page_title.message);
  await checkText(popup.locator('#title'), arabic.popup_openTitle.message);
  await checkSupport(surfaces, arabic);
  assert.equal(await panel.locator('.wrap').getAttribute('dir'), 'rtl');
  assert.equal(await panel.locator('.wrap').evaluate((el) => getComputedStyle(el).direction), 'rtl');
  assert.equal(await instagram.locator('html').getAttribute('lang'), 'en');
  assert.equal(await welcome.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await popup.locator('html').getAttribute('dir'), 'rtl');

  await instagram.reload();
  await launcher.click();
  await checkText(panel.locator('[data-ref=scan]'), arabic.ui_scan.message);
  assert.deepEqual(supportRequests, [], 'the extension does not visit Ko-fi before user activation');
  const [support] = await Promise.all([
    context.waitForEvent('page'),
    panelSupport.press('Enter'),
  ]);
  await support.waitForURL(supportUrl);
  assert.equal(await support.title(), 'Mock Ko-fi');
  assert.deepEqual(supportRequests, [supportUrl]);
  assert.equal(instagram.url(), 'https://www.instagram.com/');
});
