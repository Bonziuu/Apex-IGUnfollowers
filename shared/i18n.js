/* Local extension catalogs shared by the panel, popup and welcome page. */
(() => {
  const DEFAULT = 'en';
  const AUTO = 'auto';
  const languages = Object.freeze([
    { code: 'pl', name: 'Polski', locale: 'pl-PL' },
    { code: 'en', name: 'English', locale: 'en-GB' },
    { code: 'pt_BR', name: 'Português (Brasil)', locale: 'pt-BR' },
    { code: 'es', name: 'Español', locale: 'es' },
    { code: 'es_419', name: 'Español (Latinoamérica)', locale: 'es-419' },
    { code: 'tr', name: 'Türkçe', locale: 'tr' },
    { code: 'id', name: 'Bahasa Indonesia', locale: 'id' },
    { code: 'de', name: 'Deutsch', locale: 'de' },
    { code: 'fr', name: 'Français', locale: 'fr' },
    { code: 'it', name: 'Italiano', locale: 'it' },
    { code: 'ja', name: '日本語', locale: 'ja' },
    { code: 'ko', name: '한국어', locale: 'ko' },
    { code: 'hi', name: 'हिन्दी', locale: 'hi' },
    { code: 'ar', name: 'العربية', locale: 'ar', dir: 'rtl' },
    { code: 'uk', name: 'Українська', locale: 'uk' },
    { code: 'nl', name: 'Nederlands', locale: 'nl' },
    { code: 'vi', name: 'Tiếng Việt', locale: 'vi' },
    { code: 'th', name: 'ไทย', locale: 'th' },
    { code: 'zh_CN', name: '简体中文', locale: 'zh-CN' },
    { code: 'zh_TW', name: '繁體中文', locale: 'zh-TW' },
  ].map((entry) => Object.freeze({ dir: 'ltr', ...entry })));
  const byCode = new Map(languages.map((entry) => [entry.code, entry]));
  const latinAmericanRegions = new Set([
    '419', 'AR', 'BO', 'BR', 'BZ', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'GT', 'HN',
    'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'US', 'UY', 'VE',
  ]);
  const traditionalChineseRegions = new Set(['HK', 'MO', 'TW']);
  const catalogs = new Map();
  const pending = new Map();

  function extension() {
    return globalThis.browser?.runtime ? globalThis.browser : globalThis.chrome;
  }

  function normalizePreference(value) {
    return byCode.has(value) ? value : AUTO;
  }

  function resolve(preference, browserLanguage) {
    const saved = normalizePreference(preference);
    if (saved !== AUTO) return saved;

    let tag;
    try {
      const browserLocale = browserLanguage ?? (extension()?.i18n?.getUILanguage?.() || globalThis.navigator?.language);
      tag = new Intl.Locale(browserLocale?.replaceAll('_', '-'));
    } catch {
      return DEFAULT;
    }
    if (tag.language === 'pt') return 'pt_BR';
    if (tag.language === 'es' && latinAmericanRegions.has(tag.region)) return 'es_419';
    if (tag.language === 'zh') {
      const traditional = tag.script ? tag.script === 'Hant' : traditionalChineseRegions.has(tag.region);
      return traditional ? 'zh_TW' : 'zh_CN';
    }
    return byCode.has(tag.language) ? tag.language : DEFAULT;
  }

  async function requestCatalog(lang) {
    const runtime = extension()?.runtime;
    const protocol = globalThis.location?.protocol;
    if (protocol === 'chrome-extension:' || protocol === 'moz-extension:') {
      const response = await fetch(runtime.getURL(`_locales/${lang}/messages.json`));
      return response.ok ? response.json() : null;
    }
    // Content scripts read the packaged file through the extension, without exposing it to the page.
    return runtime?.sendMessage?.({ type: 'apex-unf:loadLocale', lang });
  }

  function loadCatalog(lang) {
    if (catalogs.has(lang)) return;
    if (!pending.has(lang)) {
      pending.set(lang, requestCatalog(lang)
        .then((catalog) => {
          if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) catalogs.set(lang, catalog);
        })
        .catch(() => { /* The English catalog covers failed locale loads. */ })
        .finally(() => pending.delete(lang)));
    }
    return pending.get(lang);
  }

  function makeFormatter(Formatter, locale) {
    const cache = new Map();
    return (value, options) => {
      const key = JSON.stringify(options);
      if (!cache.has(key)) cache.set(key, new Formatter(locale, options));
      return cache.get(key).format(value);
    };
  }

  function message(lang, key) {
    const catalog = catalogs.get(lang);
    const value = catalog && Object.hasOwn(catalog, key) ? catalog[key]?.message : undefined;
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  function make(preference) {
    const lang = resolve(preference);
    const { locale, dir } = byCode.get(lang);
    const formatNumber = makeFormatter(Intl.NumberFormat, locale);
    const formatDate = makeFormatter(Intl.DateTimeFormat, locale);
    return {
      lang, locale, dir,
      t(key, vars) {
        const catalogKey = key.replaceAll('.', '_');
        const text = message(lang, catalogKey) ?? message(DEFAULT, catalogKey) ?? key;
        return vars ? text.replace(/\{(\w+)\}/g, (_, token) => {
          const value = Object.hasOwn(vars, token) ? vars[token] : undefined;
          return typeof value === 'number' ? formatNumber(value) : (value ?? '');
        }) : text;
      },
      number: formatNumber,
      date: (value, options = { dateStyle: 'medium' }) => formatDate(value, options),
      time: (value, options = { hour: '2-digit', minute: '2-digit' }) => formatDate(value, options),
      percent: (value, options) => formatNumber(value, { style: 'percent', ...options }),
    };
  }

  async function load(preference) {
    const lang = resolve(preference);
    await Promise.all([loadCatalog(DEFAULT), loadCatalog(lang)]);
    return make(catalogs.has(lang) ? lang : DEFAULT);
  }

  globalThis.ApexUnf_i18n = { languages, normalizePreference, resolve, make, load };
})();
