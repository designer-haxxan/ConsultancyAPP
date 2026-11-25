// App bootstrap: theme, eposwala sign-in, agency setup, app shell, router, search and quick actions.
import { CONFIG } from './config.js';
import { openDB } from './db/idb.js';
import * as Auth from './services/auth.js';
import * as D from './services/data.js';
import * as UI from './core/ui.js';
import * as Forms from './modules/forms.js';
import { esc, debounce, initials } from './core/utils.js';

const $ = (sel, root = document) => root.querySelector(sel);
const THEME_KEY = 'visaflow.theme';

const ROUTES = {
  dashboard: { load: () => import('./modules/dashboard.js'), title: 'Dashboard' },
  cases: { load: () => import('./modules/cases.js'), title: 'Cases' },
  clients: { load: () => import('./modules/clients.js'), title: 'Clients' },
  documents: { load: () => import('./modules/documents.js'), title: 'Documents' },
  calendar: { load: () => import('./modules/calendar.js'), title: 'Calendar' },
  money: { load: () => import('./modules/money.js'), title: 'Payments & expenses' },
  partners: { load: () => import('./modules/partners.js'), title: 'Partners & agents' },
  reports: { load: () => import('./modules/reports.js'), title: 'Reports' },
  catalog: { load: () => import('./modules/catalog.js'), title: 'Visa catalogue' },
  settings: { load: () => import('./modules/settings.js'), title: 'Settings & backup' },
};

const NAV = [
  ['Overview', [['dashboard', 'house-door', 'Dashboard']]],
  ['Work', [['cases', 'kanban', 'Cases'], ['clients', 'people', 'Clients'], ['documents', 'folder2-open', 'Documents'], ['calendar', 'calendar3', 'Calendar']]],
  ['Money', [['money', 'cash-stack', 'Payments & expenses'], ['partners', 'diagram-3', 'Partners & agents']]],
  ['Insights', [['reports', 'bar-chart-line', 'Reports']]],
  ['Setup', [['catalog', 'globe2', 'Visa catalogue'], ['settings', 'gear', 'Settings & backup']]],
];

let routeToken = 0;
let expiryTimer = null;
let accountCache = null;

// ---------- Theme ----------
function applyTheme(choice) {
  let theme = choice;
  if (!theme) {
    try { theme = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  }
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0b1220' : '#0f766e';
  const btn = $('#theme-toggle i');
  if (btn) btn.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  applyTheme(next);
}

// ---------- Splash / fatal ----------
function hideSplash() {
  $('#splash')?.classList.add('gone');
}
function fatal(message) {
  const err = $('#splash-error');
  if (err) err.textContent = message;
  $('#splash .spinner')?.classList.add('hidden');
  hideSplash();
  const wrap = document.getElementById('view-auth');
  wrap.hidden = false;
  wrap.innerHTML = `<div class="fatal card-plain"><div class="empty-icon">${UI.icon('exclamation-octagon')}</div><h2>Something stopped the app</h2><p>${esc(message)}</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;
}

// ---------- Sign-in & agency setup ----------
function authShell({ title, lead, body, foot }) {
  return `
  <div class="auth">
    <div class="auth-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
    <section class="auth-hero">
      <div class="brand-row reveal">
        <div class="brand-mark">${brandSvg()}</div>
        <div><div class="brand-name">${esc(CONFIG.APP_NAME)}</div><div class="brand-tag">Visa consultancy · Pakistan</div></div>
      </div>
      <h1 class="hero-title reveal" style="--d:80ms">Every visa file, <span class="grad">on one screen.</span></h1>
      <p class="hero-lead reveal" style="--d:140ms">Clients, documents, appointments, fees and decisions for every country. Works offline once you have signed in. Built for Pakistani consultancies that run on WhatsApp and paper.</p>
      <div class="hero-scene reveal" style="--d:200ms" aria-hidden="true">
        <svg viewBox="0 0 560 300" class="scene-svg">
          <defs>
            <linearGradient id="gPass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
            <linearGradient id="gGlobe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#0f766e"/></linearGradient>
          </defs>
          <ellipse cx="280" cy="262" rx="230" ry="16" class="scene-shadow"/>
          <circle cx="430" cy="130" r="92" fill="url(#gGlobe)" opacity=".9"/>
          <g class="scene-lines" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.4">
            <ellipse cx="430" cy="130" rx="92" ry="34"/><ellipse cx="430" cy="130" rx="44" ry="92"/><line x1="338" y1="130" x2="522" y2="130"/><path d="M360 80 Q430 110 500 80"/><path d="M360 180 Q430 150 500 180"/>
          </g>
          <path id="route" d="M60 220 Q190 40 430 110" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.2" stroke-dasharray="6 8" class="route-line"/>
          <circle cx="60" cy="220" r="7" fill="#fff"/>
          <circle cx="430" cy="110" r="7" fill="#fbbf24" class="pulse-dot"/>
          <g class="plane">
            <path d="M0 -10 L26 0 L0 10 L6 0 Z" fill="#fff" transform="rotate(-18)"/>
            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1"><mpath href="#route"/></animateMotion>
          </g>
          <g class="passport-card float-a">
            <rect x="92" y="112" width="200" height="132" rx="16" fill="url(#gPass)"/>
            <rect x="92" y="112" width="200" height="30" rx="16" fill="rgba(0,0,0,.12)"/>
            <rect x="112" y="128" width="58" height="60" rx="8" fill="rgba(255,255,255,.7)"/>
            <circle cx="141" cy="150" r="10" fill="#0f766e" opacity=".7"/>
            <path d="M120 180 q21 -18 42 0" fill="#0f766e" opacity=".55"/>
            <rect x="186" y="132" width="86" height="8" rx="4" fill="rgba(0,0,0,.25)"/>
            <rect x="186" y="150" width="70" height="6" rx="3" fill="rgba(0,0,0,.18)"/>
            <rect x="186" y="164" width="78" height="6" rx="3" fill="rgba(0,0,0,.18)"/>
            <rect x="186" y="186" width="90" height="14" rx="7" fill="#0b3b5c"/>
            <text x="192" y="196" font-size="9" fill="#fff" font-weight="700">APPROVED</text>
          </g>
          <g class="flags float-b">
            <rect x="236" y="34" width="46" height="30" rx="7" fill="#fff"/><text x="259" y="54" text-anchor="middle" font-size="18">🇬🇧</text>
            <rect x="290" y="16" width="46" height="30" rx="7" fill="#fff"/><text x="313" y="36" text-anchor="middle" font-size="18">🇺🇸</text>
          </g>
        </svg>
      </div>
      <ul class="hero-chips reveal" style="--d:260ms">
        <li>${UI.icon('wifi-off')} Works offline after sign-in</li>
        <li>${UI.icon('file-earmark-check')} Document checklists</li>
        <li>${UI.icon('cash-coin')} PKR receipts</li>
        <li>${UI.icon('whatsapp')} WhatsApp updates</li>
      </ul>
    </section>

    <section class="auth-card reveal" style="--d:120ms" aria-labelledby="auth-title">
      <div class="auth-card-head"><h2 id="auth-title">${esc(title)}</h2><p>${esc(lead)}</p></div>
      ${body}
      <p class="auth-foot">${foot}</p>
    </section>
  </div>`;
}

function showFormError(wrap, msg) {
  const err = $('#auth-error', wrap);
  err.textContent = msg;
  err.hidden = false;
  const card = wrap.querySelector('.auth-card');
  card?.classList.remove('shake');
  void card?.offsetWidth;
  card?.classList.add('shake');
}

function showSignIn(notice = '') {
  hideSplash();
  $('#view-app').hidden = true;
  const wrap = $('#view-auth');
  wrap.hidden = false;
  wrap.innerHTML = authShell({
    title: 'Welcome back',
    lead: 'Sign in with your eposwala account to open your files.',
    body: `${notice ? `<div class="notice notice-warn">${UI.icon('info-circle')}<span>${esc(notice)}</span></div>` : ''}
      <form id="auth-form" novalidate>
        ${UI.field({ name: 'username', label: 'Username', required: true, autocomplete: 'username', autocapitalize: 'none', placeholder: 'your eposwala username' })}
        ${UI.field({ name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' })}
        <div class="form-error" id="auth-error" role="alert" hidden></div>
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit"><span>Sign in</span>${UI.icon('arrow-right')}</button>
      </form>`,
    foot: `Needs an internet connection the first time, and after the session ends. Forgot the password? Reset it at eposwala.com. Support: ${esc(CONFIG.SUPPORT_PHONE)}.`,
  });
  const form = $('#auth-form', wrap);
  const submit = $('#auth-submit', wrap);
  setTimeout(() => form.querySelector('input')?.focus(), 150);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = UI.readForm(form);
    $('#auth-error', wrap).hidden = true;
    submit.disabled = true;
    submit.querySelector('span').textContent = 'Signing in…';
    try {
      const session = await Auth.signIn(v.username, v.password);
      form.password.value = '';
      await completeSignIn(session.username);
    } catch (ex) {
      showFormError(wrap, ex.message || String(ex));
    } finally {
      submit.disabled = false;
      submit.querySelector('span').textContent = 'Sign in';
    }
  });
}

// After the API accepts the password: check the device owner, then open the agency setup or the app.
async function completeSignIn(username) {
  const other = await Auth.ownerMismatch(username);
  if (other) {
    Auth.endSession();
    throw new Error(`This device holds the data of "${other}". Sign in as them, or erase this device in Settings before using another account.`);
  }
  const acc = await Auth.getAccount();
  await Auth.saveAccount({ username: username.toLowerCase(), name: acc?.name || username });
  await D.seedCatalog();
  const settings = await D.getSettings();
  if (!settings.agencyName) return showSetup(username);
  return startApp();
}

function showSetup(username) {
  hideSplash();
  $('#view-app').hidden = true;
  const wrap = $('#view-auth');
  wrap.hidden = false;
  wrap.innerHTML = authShell({
    title: 'Set up your agency',
    lead: 'Two details for receipts and file cover sheets. You can change them later in Settings.',
    body: `<form id="auth-form" novalidate>
        ${UI.field({ name: 'agencyName', label: 'Consultancy name', required: true, placeholder: 'e.g. Al-Noor Visa Services', autocomplete: 'organization' })}
        ${UI.field({ name: 'ownerName', label: 'Your full name', required: true, value: '', autocomplete: 'name', hint: `Signed in as ${username}` })}
        <div class="form-error" id="auth-error" role="alert" hidden></div>
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit"><span>Open the app</span>${UI.icon('arrow-right')}</button>
      </form>`,
    foot: 'Everything you enter stays on this device.',
  });
  const form = $('#auth-form', wrap);
  setTimeout(() => form.querySelector('input')?.focus(), 150);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = UI.readForm(form);
    try {
      if (!v.agencyName || !v.ownerName) throw new Error('Enter the consultancy name and your name.');
      await D.saveSettings({ agencyName: v.agencyName, ownerName: v.ownerName, staff: [v.ownerName] });
      await Auth.saveAccount({ username: username.toLowerCase(), name: v.ownerName });
      await startApp();
    } catch (ex) {
      showFormError(wrap, ex.message || String(ex));
    }
  });
}

function brandSvg() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>
    <rect width="48" height="48" rx="13" fill="url(#bg1)"/>
    <rect x="11" y="13" width="26" height="22" rx="4" fill="none" stroke="#fff" stroke-width="2.4"/>
    <circle cx="24" cy="24" r="5.4" fill="none" stroke="#fde68a" stroke-width="2"/>
    <path d="M18.6 24h10.8M24 18.6c-2.2 2-2.2 8.8 0 10.8c2.2-2 2.2-8.8 0-10.8" stroke="#fff" stroke-width="1.2" fill="none"/>
    <path d="M30.5 15.5l3.5-2.5" stroke="#fde68a" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}

// ---------- App shell ----------
function buildNav() {
  const html = NAV.map(([section, items]) => `
    <div class="nav-section">${esc(section)}</div>
    ${items.map(([key, ic, label]) => `<a class="nav-link" href="#/${key}" data-route="${key}"><i class="bi bi-${ic}"></i><span>${esc(label)}</span></a>`).join('')}`).join('');
  $('#sidebar-nav').innerHTML = html;
}

function paintShell(settings) {
  const name = settings.agencyName || CONFIG.APP_NAME;
  $('#brand-name').textContent = name;
  const owner = settings.ownerName || accountCache?.name || 'Owner';
  $('#user-name').textContent = owner;
  $('#user-role').textContent = accountCache?.username ? `${accountCache.username} · this device` : 'Owner · this device';
  $('#user-avatar').textContent = initials(owner);
}

async function startApp() {
  const session = Auth.currentSession();
  if (!session) return showSignIn('Your session has ended. Sign in again to continue.');
  const [settings, account] = await Promise.all([D.getSettings(), Auth.getAccount()]);
  if (!account) await Auth.saveAccount({ username: session.username.toLowerCase(), name: settings.ownerName || session.username });
  accountCache = account || { username: session.username, name: settings.ownerName };
  await D.seedCatalog();
  if (!settings.agencyName) return showSetup(session.username);
  buildNav();
  paintShell(settings);
  $('#view-auth').hidden = true;
  $('#view-app').hidden = false;
  hideSplash();
  clearInterval(expiryTimer);
  expiryTimer = setInterval(() => { if (!Auth.currentSession()) lock(); }, 60000);
  route();
}

// Session ended (or user pressed Lock). Data is kept; only the screen is locked.
function lock(reason = 'Your session has ended. Sign in again to continue.') {
  clearInterval(expiryTimer);
  routeToken++;
  $('#content').innerHTML = '';
  showSignIn(reason);
}

function logout() {
  UI.confirmDialog('Sign out of this device? Your data stays here. Signing in again needs the internet.', { okLabel: 'Sign out', title: 'Sign out', danger: false }).then((ok) => {
    if (!ok) return;
    Auth.endSession();
    lock('You have signed out.');
  });
}

// ---------- Router ----------
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = (pathPart || '').split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const name = ROUTES[parts[0]] ? parts[0] : 'dashboard';
  return { name, params: parts.slice(1), query: new URLSearchParams(queryPart || '') };
}

async function route() {
  if (!Auth.currentSession()) return lock();
  const token = ++routeToken;
  const { name, params, query } = parseHash();
  const route = ROUTES[name];
  document.querySelectorAll('[data-route]').forEach((el) => el.classList.toggle('active', el.dataset.route === name));
  document.body.classList.toggle('case-detail-open', name === 'cases' && params.length > 0);
  setTitle(route.title);
  window.scrollTo({ top: 0 });
  const content = $('#content');
  content.classList.remove('page-enter');
  content.innerHTML = UI.skeleton(4);
  try {
    const mod = await route.load();
    if (token !== routeToken) return;
    await mod.render(content, {
      params,
      query,
      settings: await D.getSettings(),
      setTitle,
      refresh: () => route_refresh(),
      navigate: (hash) => { location.hash = hash; },
    });
    if (token !== routeToken) return;
    void content.offsetWidth;
    content.classList.add('page-enter');
    UI.animateCounts(content);
  } catch (e) {
    console.error(e);
    if (token === routeToken) content.innerHTML = UI.emptyState({ iconName: 'exclamation-triangle', title: 'This page could not load', text: e.message || String(e), action: '<button class="btn btn-ghost" onclick="location.reload()">Reload</button>' });
  }
}
// Re-renders the current page after data changes, without changing the URL.
function route_refresh() { return route(); }
const refreshSoon = () => route();

function setTitle(t) {
  const el = $('#topbar-title');
  if (el) el.textContent = t;
  document.title = `${t} · ${CONFIG.SHORT_NAME}`;
}

// ---------- Search & quick actions ----------
function openSearch() {
  UI.openSheet({
    title: 'Search', size: 'lg',
    html: `<div class="search-box">${UI.icon('search')}<input id="gs" class="input input-search" placeholder="Name, CNIC, phone, passport no. or case no." autocomplete="off" type="search"></div>
      <div id="gs-results" class="search-results"><div class="muted-note">Type at least 2 letters or 4 digits.</div></div>`,
    onMount: (el, close) => {
      const input = el.querySelector('#gs');
      const box = el.querySelector('#gs-results');
      const run = debounce(async () => {
        const q = input.value;
        if (q.trim().length < 2 && q.replace(/\D/g, '').length < 4) { box.innerHTML = '<div class="muted-note">Type at least 2 letters or 4 digits.</div>'; return; }
        const { clients, cases } = await D.searchAll(q);
        const rows = [
          ...clients.map((c) => `<a class="result-row" href="#/clients/${encodeURIComponent(c.id)}" data-close>${UI.avatar(c.name)}<span class="result-text"><b>${esc(c.name)}</b><small>${esc(c.phone || '')}${c.cnic ? ` · ${esc(c.cnic)}` : ''}</small></span>${UI.icon('chevron-right', 'muted')}</a>`),
          ...cases.map((c) => `<a class="result-row" href="#/cases/${encodeURIComponent(c.id)}" data-close><span class="result-icon">${UI.icon('briefcase')}</span><span class="result-text"><b>${esc(c.caseNo)}</b><small>${esc(c.flag || '')} ${esc(c.countryName)} · ${esc(c.visaName)}</small></span>${UI.icon('chevron-right', 'muted')}</a>`),
        ];
        box.innerHTML = rows.length ? rows.join('') : '<div class="muted-note">No matches. Try another spelling or the case number.</div>';
        box.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close()));
      }, 160);
      input.addEventListener('input', run);
      setTimeout(() => input.focus(), 60);
    },
  });
}

function openQuickAdd() {
  const items = [
    ['person-plus', 'New client', 'Add a person and their passport details', () => Forms.openClientForm({ onSaved: refreshSoon })],
    ['briefcase', 'New visa case', 'Pick a country and visa, then add applicants', () => Forms.openCaseForm({ onSaved: refreshSoon })],
    ['cash-coin', 'Record payment', 'Cash, bank, JazzCash, Easypaisa or Raast', () => Forms.openPaymentForm({ onSaved: refreshSoon })],
    ['calendar-plus', 'Add appointment', 'VFS slot, embassy interview or pickup', () => Forms.openAppointmentForm({ onSaved: refreshSoon })],
    ['check2-square', 'Add task', 'Follow-up call, document chase, reminder', () => Forms.openTaskForm({ onSaved: refreshSoon })],
    ['receipt', 'Record expense', 'Embassy fee, courier, rent, commission', () => Forms.openExpenseForm({ onSaved: refreshSoon })],
  ];
  UI.openSheet({
    title: 'Add something', size: 'md',
    html: `<div class="quick-grid">${items.map(([ic, t, d], i) => `<button type="button" class="quick-item reveal" style="--d:${i * 45}ms" data-q="${i}">
        <span class="quick-icon">${UI.icon(ic)}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span></button>`).join('')}</div>`,
    onMount: (el, close) => {
      el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
        close();
        items[Number(b.dataset.q)][3]();
      }));
    },
  });
}

function openMore() {
  const links = NAV.flatMap(([section, items]) => [`<div class="nav-section nav-section-sheet">${esc(section)}</div>`,
    ...items.map(([key, ic, label]) => `<a class="more-link" href="#/${key}" data-close><span>${UI.icon(ic)}</span>${esc(label)}</a>`)]).join('');
  UI.openSheet({
    title: 'Menu', size: 'md',
    html: `<div class="more-grid">${links}</div>
      <div class="more-foot"><button type="button" class="btn btn-ghost btn-block" id="more-theme">${UI.icon('moon-stars')} Toggle dark mode</button>
      <button type="button" class="btn btn-ghost btn-block text-danger" id="more-logout">${UI.icon('box-arrow-right')} Sign out</button></div>`,
    onMount: (el, close) => {
      el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close()));
      el.querySelector('#more-theme').addEventListener('click', toggleTheme);
      el.querySelector('#more-logout').addEventListener('click', () => { close(); logout(); });
    },
  });
}

// ---------- Boot ----------
function wireShell() {
  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#search-btn').addEventListener('click', openSearch);
  $('#quick-btn').addEventListener('click', openQuickAdd);
  $('#bottom-quick').addEventListener('click', openQuickAdd);
  $('#bottom-more').addEventListener('click', (e) => { e.preventDefault(); openMore(); });
  $('#user-menu-btn').addEventListener('click', () => $('#user-menu').classList.toggle('open'));
  document.addEventListener('click', (e) => { if (!e.target.closest('.user-wrap')) $('#user-menu')?.classList.remove('open'); });
  $('#lock-btn').addEventListener('click', () => { $('#user-menu').classList.remove('open'); Auth.endSession(); lock('Screen locked. Sign in to continue.'); });
  $('#logout-btn').addEventListener('click', () => { $('#user-menu').classList.remove('open'); logout(); });
  window.addEventListener('hashchange', () => { if ($('#view-app').hidden === false) route(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !Auth.currentSession() && !$('#view-app').hidden) lock();
  });
  $('#menu-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#sidebar-backdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));
  window.addEventListener('online', () => document.body.classList.remove('is-offline'));
  window.addEventListener('offline', () => document.body.classList.add('is-offline'));
  if (!navigator.onLine) document.body.classList.add('is-offline');
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    reg.update().catch(() => {});
    setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}); }, 60 * 60 * 1000);
  }).catch((e) => console.warn('Offline support could not start:', e));
  let reloading = false;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
    hadController = true;
  });
}

(async function boot() {
  applyTheme();
  wireShell();
  registerSW();
  if (!window.matchMedia) return fatal('This browser is too old to run the app.');
  try {
    await openDB();
  } catch (e) {
    return fatal(e.message || String(e));
  }
  try {
    await D.seedCatalog();
    if (Auth.currentSession()) return await startApp();
    return showSignIn();
  } catch (e) {
    console.error(e);
    fatal(e.message || String(e));
  }
})();
