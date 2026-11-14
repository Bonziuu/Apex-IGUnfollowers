/*
 * Apex Unfollowers – Interfejs: style, szablon panelu, budowa i obsługa zdarzeń.
 * Pliki content/*.js ładują się po kolei (manifest.json) i dzielą jedną przestrzeń nazw
 * skryptów wtyczki, dlatego deklaracje na najwyższym poziomie używają var / function.
 */
'use strict';

// ---------------------------------------------------------------- UI: style
var CSS = `
  :host { all: initial; }
  /* Typografia i układ jak w Apex AdBlocker; paleta różowa o podobnej głębi co morska paleta AdBlockera */
  .wrap {
    --bg: #ffffff; --surface: #f6f6f9; --fg: #17171c; --muted: #6b6b76; --line: #e7e7ee;
    --accent: #cc1670; --accent-strong: #b01361; --accent-soft: #fde6f1; --on-accent: #ffffff;
    --ok: #1f9d55; --ok-soft: #e6f6ec; --warn: #b7791f; --warn-soft: #fdf3e1; --err: #d14343; --err-soft: #fdeaea;
    --shadow: 0 12px 40px rgba(20, 20, 40, .22);
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: var(--fg);
  }
  @media (prefers-color-scheme: dark) {
    .wrap {
      --bg: #16161b; --surface: #202028; --fg: #f2f2f6; --muted: #a2a2ae; --line: #2c2c36;
      --accent: #f266a8; --accent-strong: #f78bbf; --accent-soft: #3d1529; --on-accent: #2a0a18;
      --ok: #4cc785; --ok-soft: #1c3327; --warn: #e3ad55; --warn-soft: #3a2f1c; --err: #ff7a7a; --err-soft: #3d2022;
      --shadow: 0 12px 40px rgba(0, 0, 0, .5);
    }
  }
  * { box-sizing: border-box; font: inherit; }
  .hidden { display: none !important; }
  button { cursor: pointer; color: inherit; }
  button:disabled { cursor: default; opacity: .55; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  a { color: var(--accent); }

  .launcher {
    position: fixed; right: 20px; bottom: 96px; width: 48px; height: 48px; border-radius: 50%;
    border: 0; color: #fff; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(160deg, #f2559f, #cc1670);
    box-shadow: 0 4px 14px rgba(204, 22, 112, .35); z-index: 2147483646; transition: transform .15s ease;
  }
  .launcher:hover { transform: scale(1.06); }
  .launcher.busy::after {
    content: ""; position: absolute; inset: -5px; border-radius: 50%;
    border: 3px solid transparent; border-top-color: #f2559f; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .panel {
    position: fixed; top: 16px; right: 16px; bottom: 16px; width: 440px; max-width: calc(100vw - 32px);
    background: var(--bg); color: var(--fg); border-radius: 14px; overflow: hidden; border: 1px solid var(--line);
    box-shadow: var(--shadow); display: flex; flex-direction: column; z-index: 2147483647;
  }
  header { display: flex; align-items: center; gap: 8px; padding: 12px 10px 10px 14px; }
  header .logo { width: 24px; height: 24px; flex: none; }
  .brand { font-weight: 650; font-size: 14px; letter-spacing: -.01em; white-space: nowrap; }
  .version { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; margin-left: 2px; }
  .grow { flex: 1; min-width: 0; }
  .ib {
    display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border: 0; background: transparent; color: var(--muted); border-radius: 8px; flex: none; font-size: 15px; line-height: 1;
  }
  .ib:hover { background: var(--surface); color: var(--fg); }
  .ib.on { background: var(--accent-soft); color: var(--accent); }

  .account {
    display: flex; align-items: center; gap: 10px; margin: 0 12px 10px; padding: 10px 12px;
    border-radius: 12px; background: var(--surface); border: 1px solid var(--line);
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
  .account.has .dot { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .sub { font-size: 12.5px; color: var(--muted); }
  .account.has .sub { color: var(--fg); }

  .controls { display: flex; gap: 8px; padding: 0 12px 10px; }
  .primary {
    flex: 1; height: 36px; border: 0; border-radius: 10px; padding: 0 12px; font-weight: 600; font-size: 13px;
    background: var(--accent); color: var(--on-accent);
  }
  .primary:hover { background: var(--accent-strong); }
  .primary.stop { background: var(--err); color: #fff; }
  select, input[type="search"] {
    height: 36px; border: 1px solid var(--line); background: var(--bg); color: var(--fg);
    border-radius: 10px; padding: 0 10px; outline: none; font-size: 12.5px; min-width: 0;
  }
  select:focus, input[type="search"]:focus { border-color: var(--accent); }
  select:disabled { opacity: .55; }

  .progress { padding: 0 14px 10px; }
  .bar { height: 6px; border-radius: 3px; background: var(--surface); overflow: hidden; position: relative; }
  .fill { height: 100%; width: 0; background: linear-gradient(90deg, #f2559f, #cc1670); transition: width .3s; }
  .bar.indet .fill { width: 35%; position: absolute; animation: indet 1.2s ease-in-out infinite; }
  @keyframes indet { from { left: -35%; } to { left: 100%; } }
  .ptext { font-size: 12.5px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .pnote { font-size: 12px; color: var(--warn); margin-top: 2px; }

  .msg { margin: 0 12px 10px; padding: 9px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 550; }
  .msg.ok { background: var(--ok-soft); color: var(--ok); }
  .msg.warn { background: var(--warn-soft); color: var(--warn); }
  .msg.error { background: var(--err-soft); color: var(--err); }

  .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; border-top: 1px solid var(--line); }

  nav { display: flex; border-bottom: 1px solid var(--line); padding: 0 6px; }
  nav button {
    flex: 1; border: 0; background: transparent; color: var(--muted); padding: 8px 2px;
    font-size: 11.5px; font-weight: 550; border-bottom: 2px solid transparent; white-space: nowrap;
  }
  nav button:hover { color: var(--fg); }
  nav button.on { color: var(--accent); border-bottom-color: var(--accent); }
  nav .cnt {
    display: block; font-size: 18px; font-weight: 700; letter-spacing: -.02em; color: var(--fg);
    font-variant-numeric: tabular-nums; line-height: 1.2;
  }
  nav button.on .cnt { color: var(--accent); }

  .tools { display: grid; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .tools .line { display: flex; gap: 8px; align-items: center; }
  .tools input[type="search"] { flex: 1; }
  .tools select { flex: 1; }
  .chk { font-size: 11.5px; color: var(--muted); display: flex; gap: 5px; align-items: center; white-space: nowrap; cursor: pointer; }
  .chk input { accent-color: var(--accent); margin: 0; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line);
    font-weight: 550; font-size: 12.5px; white-space: nowrap;
  }
  .btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .btn.danger:hover:not(:disabled) { border-color: var(--err); color: var(--err); }

  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
  .row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--line); }
  .row.dim { opacity: .5; }
  .av { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: var(--surface); flex: none; border: 1px solid var(--line); }
  .who { flex: 1; min-width: 0; }
  .who a { color: var(--fg); font-weight: 600; text-decoration: none; }
  .who a:hover { color: var(--accent); text-decoration: underline; }
  .nm { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11px; color: var(--muted); margin-left: 4px; }
  .ver { color: var(--accent); margin-left: 3px; font-size: 11px; }
  .mini {
    height: 28px; border: 1px solid var(--line); background: var(--bg); color: var(--muted);
    border-radius: 8px; padding: 0 9px; font-size: 11.5px; font-weight: 550; flex: none; white-space: nowrap;
  }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .mini.unf:hover:not(:disabled) { border-color: var(--err); color: var(--err); }
  /* potwierdzenie: kursor zwykle zostaje nad przyciskiem, więc :hover nie może zmieniać koloru napisu */
  .mini.unf.confirm, .mini.unf.confirm:hover:not(:disabled) { background: var(--err); border-color: var(--err); color: #fff; }
  .group {
    padding: 9px 14px 6px; font-size: 11px; font-weight: 650; color: var(--muted);
    letter-spacing: .02em; background: var(--surface); border-bottom: 1px solid var(--line);
  }
  .pill { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex: none; white-space: nowrap; }
  .pill.lost { background: var(--err-soft); color: var(--err); }
  .pill.gained { background: var(--ok-soft); color: var(--ok); }
  .empty { padding: 28px 22px; text-align: center; color: var(--muted); }
  .more { padding: 10px 14px; text-align: center; }

  /* statystyki */
  .pad { padding: 12px; display: grid; gap: 12px; align-content: start; }
  .h { font-size: 11px; font-weight: 650; color: var(--muted); letter-spacing: .02em; text-transform: uppercase; margin: 2px 2px -4px; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tiles.three { grid-template-columns: 1fr 1fr 1fr; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
  .tile .v { font-size: 22px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .tile .l { color: var(--muted); font-size: 11.5px; }
  .tile .d { font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--muted); }
  .tile .d.up { color: var(--ok); }
  .tile .d.down { color: var(--err); }
  .card { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px 10px 6px; }
  .card .ct { font-weight: 600; font-size: 12.5px; margin: 0 2px 4px; }
  .card .cs { color: var(--muted); font-size: 11.5px; margin: -2px 2px 6px; }
  .chart { position: relative; }
  .chart svg { display: block; width: 100%; height: auto; overflow: visible; }
  .chart .axis { fill: var(--muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .chart .grid { stroke: var(--line); stroke-width: 1; }
  .chart .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .chart .pt { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
  .chart .cross { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
  .tip {
    position: absolute; pointer-events: none; transform: translate(-50%, calc(-100% - 10px));
    background: var(--fg); color: var(--bg); border-radius: 8px; padding: 5px 9px; font-size: 11.5px;
    white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.18); font-variant-numeric: tabular-nums;
  }
  .tip b { font-weight: 700; }
  .note { color: var(--muted); font-size: 12px; padding: 14px 4px; text-align: center; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  th { text-align: right; color: var(--muted); font-weight: 600; font-size: 11px; padding: 6px 4px; border-bottom: 1px solid var(--line); }
  td { text-align: right; padding: 6px 4px; border-bottom: 1px solid var(--line); }
  th:first-child, td:first-child { text-align: left; }
  td.up { color: var(--ok); } td.down { color: var(--err); }

  /* ustawienia */
  .set { display: grid; gap: 6px; }
  .set h3 { margin: 0; font-size: 12.5px; font-weight: 650; }
  .set p { margin: 0; color: var(--muted); font-size: 12px; }
  .set .line { display: flex; gap: 8px; flex-wrap: wrap; }
  .set select { width: 100%; }
  .about { color: var(--muted); font-size: 11.5px; text-align: center; margin: 4px 0 0; }
  .author { display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); font-size: 12.5px; }
  .author strong { font-size: 13px; }

  /* wznawianie skanu, link-przyciski */
  .resume { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin: -2px 12px 10px; font-size: 12px; color: var(--muted); }
  .linkbtn { border: 0; background: transparent; color: var(--accent); padding: 0; font-size: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .linkbtn:hover { color: var(--accent-strong); }
  .msg .linkbtn { margin-left: 6px; color: inherit; }

  /* ekran powitalny w panelu */
  .welcome { display: grid; gap: 12px; }
  .welcome h2 { margin: 0; font-size: 17px; letter-spacing: -.01em; }
  .welcome p { margin: 0; color: var(--muted); font-size: 12.5px; }
  .welcome ol, .welcome ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 12.5px; }
  .welcome .risk { padding: 10px 12px; border-radius: 12px; background: var(--warn-soft); color: var(--warn); font-size: 12.5px; display: grid; gap: 6px; }
  .welcome .risk ul { color: var(--fg); }
  .welcome .accept { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; cursor: pointer; }
  .welcome .accept input { accent-color: var(--accent); margin: 2px 0 0; }
  .welcome .primary { flex: none; width: 100%; }
  .welcome .primary:disabled { opacity: .45; cursor: default; }

  footer {
    padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted);
  }
`;

var LOGO = '<svg class="logo" viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="apx-g" x1="0" y1="0" x2="0.42" y2="1"><stop offset="0" stop-color="#f2559f"/><stop offset="1" stop-color="#cc1670"/></linearGradient></defs><g transform="translate(0 4.5)"><path fill="url(#apx-g)" fill-rule="evenodd" d="M64 7 116 112H91L64 59 37 112H12L64 7Zm0 34-12 25h24L64 41Z"/></g></svg>';
var ICON_PERSON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M17 11h6"/></svg>';
var ICON_STATS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
var ICON_GEAR = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';

var template = () => `
  <div class="wrap">
    <button class="launcher" title="${t('ext.name')}" aria-label="${t('ext.name')}">${ICON_PERSON}</button>
    <section class="panel hidden" role="dialog" aria-label="${t('ext.name')}">
      <header>
        ${LOGO}
        <span class="brand">Apex Unfollowers</span>
        <span class="version grow" data-ref="version"></span>
        <button class="ib" data-ref="statsBtn" title="${t('ui.stats')}" aria-label="${t('ui.stats')}">${ICON_STATS}</button>
        <button class="ib" data-ref="settingsBtn" title="${t('ui.settings')}" aria-label="${t('ui.settings')}">${ICON_GEAR}</button>
        <button class="ib" data-ref="close" title="${t('ui.close')}" aria-label="${t('ui.close')}">✕</button>
      </header>
      <div class="account" data-ref="account">
        <span class="dot" aria-hidden="true"></span>
        <span class="sub" data-ref="sub"></span>
      </div>
      <div class="controls" data-ref="controls">
        <button class="primary" data-ref="scan">${t('ui.scan')}</button>
        <select data-ref="speed" title="${t('ui.speedTitle')}">
          <option value="safe">${t('ui.speedSafe')}</option>
          <option value="normal">${t('ui.speedNormal')}</option>
        </select>
      </div>
      <div class="progress hidden" data-ref="progress">
        <div class="bar" data-ref="bar"><div class="fill" data-ref="fill"></div></div>
        <div class="ptext" data-ref="ptext"></div>
        <div class="pnote hidden" data-ref="pnote"></div>
      </div>
      <div class="resume hidden" data-ref="resumeRow">
        <span data-ref="resumeText"></span>
        <button class="linkbtn" data-ref="restart">${t('ui.restart')}</button>
      </div>
      <div class="msg hidden" data-ref="msg" role="status"></div>

      <div class="view hidden" data-ref="vWelcome"><div class="scroll"><div class="pad welcome">
        <h2>${t('welcome.title')}</h2>
        <p>${t('welcome.lead')}</p>
        <ol>
          <li>${t('welcome.step1')}</li>
          <li>${t('welcome.step2')}</li>
          <li>${t('welcome.step3')}</li>
        </ol>
        <div class="risk">
          <strong>${t('welcome.riskTitle')}</strong>
          <span>${t('welcome.riskText')}</span>
          <ul>
            <li>${t('welcome.risk1')}</li>
            <li>${t('welcome.risk2')}</li>
            <li>${t('welcome.risk3')}</li>
          </ul>
        </div>
        <label class="accept"><input type="checkbox" data-ref="acceptRisk"> <span>${t('welcome.accept')}</span></label>
        <button class="primary" data-ref="welcomeStart" disabled>${t('welcome.start')}</button>
        <p>${t('welcome.privacy')} <button class="linkbtn" data-ref="welcomeMore">${t('welcome.more')}</button></p>
      </div></div></div>

      <div class="view" data-ref="vLists">
        <nav data-ref="tabs">
          <button data-tab="notBack"><span class="cnt">–</span>${t('tab.notBack')}</button>
          <button data-tab="fans"><span class="cnt">–</span>${t('tab.fans')}</button>
          <button data-tab="mutual"><span class="cnt">–</span>${t('tab.mutual')}</button>
          <button data-tab="changes"><span class="cnt">–</span>${t('tab.changes')}</button>
        </nav>
        <div class="tools">
          <div class="line">
            <input type="search" data-ref="search" placeholder="${t('ui.search')}">
            <button class="btn" data-ref="csv" title="${t('ui.csvTitle')}">CSV</button>
          </div>
          <div class="line">
            <select data-ref="filter" title="${t('ui.filterTitle')}">
              <option value="all">${t('filter.all')}</option>
              <option value="verified">${t('filter.verified')}</option>
              <option value="private">${t('filter.private')}</option>
              <option value="public">${t('filter.public')}</option>
              <option value="nopic">${t('filter.nopic')}</option>
            </select>
            <select data-ref="sort" title="${t('ui.sortTitle')}">
              <option value="default">${t('sort.default')}</option>
              <option value="az">${t('sort.az')}</option>
              <option value="za">${t('sort.za')}</option>
            </select>
            <label class="chk" data-ref="hiddenWrap" title="${t('ui.hiddenTitle')}"><input type="checkbox" data-ref="showHidden"> ${t('ui.hidden')}</label>
          </div>
        </div>
        <ul data-ref="list"></ul>
      </div>

      <div class="view hidden" data-ref="vStats"><div class="scroll"><div class="pad" data-ref="stats"></div></div></div>

      <div class="view hidden" data-ref="vSettings"><div class="scroll"><div class="pad">
        <section class="set">
          <h3>${t('set.lang')}</h3>
          <select data-ref="lang">
            <option value="auto">${t('set.langAuto')}</option>
            <option value="pl">Polski</option>
            <option value="en">English</option>
          </select>
        </section>
        <section class="set">
          <h3>${t('set.unf')}</h3>
          <p>${t('set.unfHint')}</p>
          <select data-ref="unfLimit">
            ${UNF.limits.map((n) => `<option value="${n}">${t('set.unfOption', { n })}</option>`).join('')}
          </select>
        </section>
        <section class="set">
          <h3>${t('set.launcher')}</h3>
          <label class="chk"><input type="checkbox" data-ref="showLauncher"> ${t('set.launcherLabel')}</label>
        </section>
        <section class="set">
          <h3>${t('set.backup')}</h3>
          <p>${t('set.backupHint')}</p>
          <div class="line">
            <button class="btn" data-ref="export">${t('set.export')}</button>
            <button class="btn" data-ref="import">${t('set.import')}</button>
            <input type="file" accept=".json,application/json" data-ref="importFile" hidden>
          </div>
        </section>
        <section class="set">
          <h3>${t('set.data')}</h3>
          <p>${t('set.dataHint')}</p>
          <div class="line"><button class="btn danger" data-ref="wipe">${t('set.wipe')}</button></div>
        </section>
        <section class="set">
          <h3>${t('set.about')}</h3>
          <div class="author">
            <span class="muted">${t('set.authorTitle')}</span>
            <strong>${AUTHOR.name}</strong>
            <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a>
            <a href="${AUTHOR.linkedin}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${t('set.linkedinLabel')}">${t('set.linkedin')}</a>
            <a href="${SITE}" target="_blank" rel="noopener noreferrer">apexsoftware.app</a>
          </div>
          <p>${t('set.reportHint')}</p>
          <div class="line">
            <button class="btn" data-ref="reportGithub">${t('set.reportGithub')}</button>
            <button class="btn" data-ref="reportMail">${t('set.reportMail')}</button>
          </div>
          <div class="line"><button class="linkbtn" data-ref="showWelcome">${t('set.showWelcome')}</button></div>
        </section>
        <p class="about">${t('ext.name')} <span data-ref="aboutVersion"></span> · <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a> · MIT</p>
      </div></div></div>

      <footer>${t('ui.footer')}</footer>
    </section>
  </div>`;

// ---------------------------------------------------------------- UI: budowa
var ui = {
  host: null,
  shadow: null,
  r: {},
  launcher: null,
  panel: null,
  wipeArmed: false,

  build() {
    if (!this.host) {
      const host = document.createElement('div');
      host.id = 'apex-unfollowers-root';
      this.shadow = host.attachShadow({ mode: 'open' });
      this.host = host;
      (document.body || document.documentElement).appendChild(host);
      document.addEventListener('keydown', (e) => {
        if (e.isTrusted && e.key === 'Escape' && this.panel && !this.panel.classList.contains('hidden')) togglePanel(false);
      });
    }
    const style = document.createElement('style');
    style.textContent = CSS;
    const tpl = document.createElement('template');
    tpl.innerHTML = template();
    this.shadow.replaceChildren(style, tpl.content);
    this.r = {};
    this.shadow.querySelectorAll('[data-ref]').forEach((n) => { this.r[n.dataset.ref] = n; });
    this.launcher = this.shadow.querySelector('.launcher');
    this.panel = this.shadow.querySelector('.panel');
    const v = manifestVersion();
    this.r.version.textContent = v ? 'v' + v : '';
    this.r.aboutVersion.textContent = v ? 'v' + v : '';
    this.bind();
    this.applySettings();
    this.setScanning(state.scanning);
  },

  // przebudowa po zmianie języka (panel zostaje otwarty, jeśli był)
  rebuild() {
    const open = this.panel && !this.panel.classList.contains('hidden');
    const kind = this.r.msg ? (this.r.msg.className.match(/\b(ok|warn|error)\b/) || [])[1] : null;
    const text = kind === 'error' && state.lastError ? state.lastError.text : this.r.msg ? this.r.msg.textContent : '';
    const detail = kind === 'error' && state.lastError ? state.lastError.detail : '';
    this.build();
    if (open) this.panel.classList.remove('hidden');
    if (text) this.message(text, kind, detail);
    render();
  },

  bind() {
    const r = this.r;
    this.launcher.addEventListener('click', userOnly(() => togglePanel()));
    r.close.addEventListener('click', userOnly(() => togglePanel(false)));
    r.statsBtn.addEventListener('click', userOnly(() => setView(state.view === 'stats' ? 'lists' : 'stats')));
    r.settingsBtn.addEventListener('click', userOnly(() => setView(state.view === 'settings' ? 'lists' : 'settings')));
    r.scan.addEventListener('click', userOnly(() => (state.scanning ? stopScan() : startScan())));
    r.restart.addEventListener('click', userOnly(() => { if (!state.scanning) startScan({ fresh: true }); }));
    r.acceptRisk.addEventListener('change', (e) => { r.welcomeStart.disabled = !(e.isTrusted && r.acceptRisk.checked); });
    r.welcomeStart.addEventListener('click', userOnly(async () => {
      if (!r.acceptRisk.checked) return;
      await saveSetting('onboarded', true);
      state.view = 'lists';
      render();
    }));
    r.welcomeMore.addEventListener('click', userOnly(openWelcomePage));
    r.showWelcome.addEventListener('click', userOnly(openWelcomePage));
    r.reportGithub.addEventListener('click', userOnly(() => openReport('github')));
    r.reportMail.addEventListener('click', userOnly(() => openReport('mail')));
    r.speed.addEventListener('change', userOnly(() => saveSetting('speed', r.speed.value)));
    r.tabs.addEventListener('click', userOnly((e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      state.tab = b.dataset.tab;
      state.limit = RENDER_STEP;
      r.list.scrollTop = 0;
      render();
    }));
    let timer;
    r.search.value = state.query;
    r.search.addEventListener('input', userOnly(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.query = r.search.value.trim().toLowerCase(); state.limit = RENDER_STEP; render(); }, 120);
    }));
    r.filter.addEventListener('change', userOnly(() => { state.filter = r.filter.value; state.limit = RENDER_STEP; render(); }));
    r.sort.addEventListener('change', userOnly(() => { state.sort = r.sort.value; state.limit = RENDER_STEP; render(); }));
    r.showHidden.addEventListener('change', userOnly(() => { state.showHidden = r.showHidden.checked; render(); }));
    r.csv.addEventListener('click', userOnly(exportCsv));

    // ustawienia
    r.lang.addEventListener('change', userOnly(async () => {
      await saveSetting('lang', r.lang.value);
      L = I18N.make(state.settings.lang);
      this.rebuild();
    }));
    r.unfLimit.addEventListener('change', userOnly(() => saveSetting('unfLimit', Number(r.unfLimit.value))));
    r.showLauncher.addEventListener('change', userOnly(() => saveSetting('hideLauncher', !r.showLauncher.checked)));
    r.export.addEventListener('click', userOnly(exportBackup));
    r.import.addEventListener('click', userOnly(() => r.importFile.click()));
    r.importFile.addEventListener('change', userOnly(async () => {
      const f = r.importFile.files && r.importFile.files[0];
      r.importFile.value = '';
      if (f) await importBackup(f);
    }));
    r.wipe.addEventListener('click', userOnly(async () => {
      if (state.scanning) return;
      if (!this.wipeArmed) {
        this.wipeArmed = true;
        r.wipe.textContent = t('set.wipeConfirm');
        setTimeout(() => { this.wipeArmed = false; if (r.wipe.isConnected) r.wipe.textContent = t('set.wipe'); }, 4000);
        return;
      }
      this.wipeArmed = false;
      r.wipe.textContent = t('set.wipe');
      if (state.userId) {
        await store.remove(['scan:', 'log:', 'wl:', 'hist:', 'unf:', 'unfBlock:', 'resume:'].map((p) => p + state.userId));
      }
      await loadAccount(state.userId);
      this.message(t('set.wiped'), 'warn');
      render();
    }));
  },

  applySettings() {
    const r = this.r;
    r.speed.value = state.settings.speed;
    r.lang.value = state.settings.lang;
    r.unfLimit.value = String(state.settings.unfLimit);
    r.showLauncher.checked = !state.settings.hideLauncher;
    this.launcher.classList.toggle('hidden', !!state.settings.hideLauncher);
  },

  setScanning(on) {
    this.r.scan.textContent = on ? t('ui.stop') : state.resume ? t('ui.resume') : t('ui.scan');
    this.r.scan.classList.toggle('stop', on);
    this.r.speed.disabled = on;
    this.launcher.classList.toggle('busy', on);
  },

  progress(fraction, text) {
    const r = this.r;
    r.progress.classList.remove('hidden');
    r.bar.classList.toggle('indet', fraction == null);
    r.fill.style.width = fraction == null ? '' : Math.round(fraction * 100) + '%';
    if (text != null) r.ptext.textContent = text;
  },
  hideProgress() { this.r.progress.classList.add('hidden'); },

  note(text) {
    this.r.pnote.textContent = text || '';
    this.r.pnote.classList.toggle('hidden', !text);
  },

  // kind: ok | warn | error; detail – techniczny opis błędu dołączany do zgłoszenia problemu
  message(text, kind, detail) {
    const m = this.r.msg;
    m.className = 'msg' + (text ? ' ' + (kind || 'ok') : ' hidden');
    m.textContent = text || '';
    if (text && kind === 'error') {
      state.lastError = { text, detail: detail || '', at: Date.now() };
      const b = el('button', 'linkbtn', t('report.button'));
      b.title = t('report.buttonTitle');
      b.addEventListener('click', userOnly(() => openReport('github')));
      m.appendChild(b);
    }
  },
};

async function saveSetting(key, value) {
  state.settings[key] = value;
  await store.set('settings', state.settings);
  ui.applySettings();
}

function setView(view) {
  state.view = view;
  render();
}

async function togglePanel(force) {
  if (!ui.host || !ui.host.isConnected) { ui.host = null; ui.build(); }
  const open = force === undefined ? ui.panel.classList.contains('hidden') : force;
  if (open) {
    await ensureLoaded();
    ui.panel.classList.remove('hidden');
    render();
  } else {
    ui.panel.classList.add('hidden');
  }
}
