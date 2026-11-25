// UI helpers: toasts, sheets (modal / bottom sheet), confirm dialogs, form fields, badges and animated numbers.
import { esc, money } from './utils.js';
import { STAGES, STAGE_BY_KEY } from './constants.js';

export const icon = (name, cls = '') => `<i class="bi bi-${name} ${cls}" aria-hidden="true"></i>`;

// ----- Toasts -----
export function toast(message, tone = 'success', ms = 3600) {
  const wrap = document.getElementById('toast-container');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast-item tone-${tone}`;
  const iconName = { success: 'check-circle-fill', danger: 'exclamation-octagon-fill', warn: 'exclamation-triangle-fill', info: 'info-circle-fill' }[tone] || 'info-circle-fill';
  el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
}

// ----- Sheets (modal on desktop, bottom sheet on phones) -----
let sheetDepth = 0;
export function openSheet({ title = '', html = '', size = 'md', footer = '', onMount = null, onClose = null, dismissible = true }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <section class="sheet sheet-${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head">
        <div class="sheet-title">${esc(title)}</div>
        ${dismissible ? `<button type="button" class="icon-btn" data-close aria-label="Close">${icon('x-lg')}</button>` : ''}
      </header>
      <div class="sheet-body">${html}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  root.appendChild(wrap);
  document.body.classList.add('sheet-open');
  sheetDepth++;
  requestAnimationFrame(() => wrap.classList.add('in'));
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('in');
    wrap.classList.add('out');
    sheetDepth = Math.max(0, sheetDepth - 1);
    if (!sheetDepth) document.body.classList.remove('sheet-open');
    setTimeout(() => wrap.remove(), 260);
    onClose?.(result);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap && dismissible) close();
    if (e.target.closest('[data-close]')) close();
  });
  const sheetEl = wrap.querySelector('.sheet');
  onMount?.(sheetEl, close);
  // Focus the first field on desktop only (avoids the phone keyboard popping up).
  if (window.matchMedia('(min-width: 768px)').matches) setTimeout(() => sheetEl.querySelector('input,select,textarea')?.focus(), 80);
  return { el: sheetEl, close };
}

export function confirmDialog(message, { title = 'Please confirm', okLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const sheet = openSheet({
      title, size: 'sm', dismissible: true,
      html: `<p class="confirm-text">${esc(message)}</p>`,
      footer: `<button type="button" class="btn btn-ghost" data-close>${esc(cancelLabel)}</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>`,
      onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => { resolve(true); close(true); }),
      onClose: (r) => { if (!r) resolve(false); },
    });
    return sheet;
  });
}

// Typed confirmation for destructive actions (e.g. reset all data).
export function typedConfirm(message, word, { okLabel = 'Delete', title = 'Confirm deletion' } = {}) {
  return new Promise((resolve) => {
    openSheet({
      title, size: 'sm',
      html: `<p class="confirm-text">${esc(message)}</p>
             <label class="field-label">Type <b>${esc(word)}</b> to confirm</label>
             <input class="input" id="typed-word" autocomplete="off">`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button>
               <button type="button" class="btn btn-danger" data-ok disabled>${esc(okLabel)}</button>`,
      onMount: (el, close) => {
        const input = el.querySelector('#typed-word');
        const ok = el.querySelector('[data-ok]');
        input.addEventListener('input', () => { ok.disabled = input.value.trim() !== word; });
        ok.addEventListener('click', () => { resolve(true); close(true); });
      },
      onClose: (r) => { if (!r) resolve(false); },
    });
  });
}

// Re-renders a page while keeping the caret in a search box the user is typing in.
export async function rerenderKeepingFocus(root, selector, fn) {
  const el = root.querySelector(selector);
  const focused = !!el && document.activeElement === el;
  const pos = el ? el.selectionStart ?? el.value.length : 0;
  await fn();
  if (focused) {
    const next = root.querySelector(selector);
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch { /* not a text input */ }
    }
  }
}

// Asks for one line of text in a small sheet. Resolves with the text, or null if cancelled.
export function askText({ title = 'Enter a value', label = '', value = '', okLabel = 'Save', danger = false } = {}) {
  return new Promise((resolve) => {
    openSheet({
      title, size: 'sm',
      html: `<div class="field"><label class="field-label" for="ask-text">${esc(label)}</label>
             <textarea class="input" id="ask-text" rows="3">${esc(value)}</textarea></div>`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>`,
      onMount: (el, close) => {
        const ta = el.querySelector('#ask-text');
        el.querySelector('[data-ok]').addEventListener('click', () => { resolve(ta.value.trim()); close(true); });
      },
      onClose: (r) => { if (!r) resolve(null); },
    });
  });
}

// ----- Layout fragments -----
export function pageHead({ title, sub = '', actions = '', back = '' }) {
  return `<header class="page-head reveal">
    <div class="page-head-text">
      ${back ? `<a class="back-link" href="${back}">${icon('chevron-left')} Back</a>` : ''}
      <h1 class="page-title">${esc(title)}</h1>
      ${sub ? `<p class="page-sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

export function emptyState({ iconName = 'inbox', title = 'Nothing here yet', text = '', action = '' }) {
  return `<div class="empty reveal">
    <div class="empty-icon">${icon(iconName)}</div>
    <div class="empty-title">${esc(title)}</div>
    ${text ? `<div class="empty-text">${esc(text)}</div>` : ''}
    ${action ? `<div class="mt-3">${action}</div>` : ''}
  </div>`;
}

export const skeleton = (n = 3) => `<div class="skeleton-wrap">${Array.from({ length: n }, () => '<div class="skeleton"></div>').join('')}</div>`;

export function chip(text, tone = 'neutral', iconName = '') {
  return `<span class="chip chip-${tone}">${iconName ? icon(iconName) : ''}${esc(text)}</span>`;
}

export function avatar(name = '', tone = 0) {
  const tones = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  const ini = (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';
  return `<span class="avatar ${tones[tone % tones.length]}">${esc(ini)}</span>`;
}

export function stageBadge(stageKey) {
  const s = STAGE_BY_KEY[stageKey] || STAGES[0];
  return `<span class="stage-badge" style="--stage:${s.color}">${icon(s.icon)}${esc(s.label)}</span>`;
}

export function outcomeChip(outcome) {
  const map = {
    approved: ['Approved', 'success', 'check-circle'],
    refused: ['Refused', 'danger', 'x-circle'],
    withdrawn: ['Withdrawn', 'muted', 'dash-circle'],
    pending: ['Pending', 'info', 'clock'],
  };
  const [label, tone, ic] = map[outcome] || map.pending;
  return chip(label, tone, ic);
}

export function progress(pctValue, tone = 'brand') {
  const v = Math.max(0, Math.min(100, Math.round(pctValue || 0)));
  return `<div class="progress-track" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><span class="progress-fill tone-${tone}" style="--w:${v}%"></span></div>`;
}

export function statTile({ label, value, iconName, tone = 'brand', sub = '', count = false, isMoney = false }) {
  return `<article class="stat-tile tone-${tone} reveal">
    <div class="stat-icon">${icon(iconName)}</div>
    <div class="stat-body">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value" ${count ? `data-count="${Number(value) || 0}" ${isMoney ? 'data-fmt="money"' : ''}` : ''}>${count ? (isMoney ? money(0) : 0) : esc(value)}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>
  </article>`;
}

// Animates every [data-count] element up to its value (once per render).
export function animateCounts(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const fmt = el.dataset.fmt === 'money' ? money : (n) => Math.round(n).toLocaleString('en-PK');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) { el.textContent = fmt(target); return; }
    const start = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ----- Forms -----
// field({name, label, value, type, required, options, placeholder, hint, full, rows, min, max, step, autocomplete, pattern})
export function field(o) {
  const id = `f_${o.name}`;
  const req = o.required ? ' required' : '';
  const cls = `field ${o.full ? 'field-full' : ''} ${o.className || ''}`;
  const val = o.value ?? '';
  const hint = o.hint ? `<div class="field-hint">${esc(o.hint)}</div>` : '';
  const dataAttrs = [
    o.num ? 'data-num="1"' : '',
    o.dir ? `dir="${o.dir}"` : '',
    o.mask ? `data-mask="${o.mask}"` : '',
  ].join(' ');
  if (o.type === 'select') {
    const opts = o.options.map((opt) => {
      const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
      return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
    return `<div class="${cls}"><label class="field-label" for="${id}">${esc(o.label)}${o.required ? ' <span class="req">*</span>' : ''}</label>
      <select class="input" id="${id}" name="${o.name}"${req} ${dataAttrs}>${o.placeholder ? `<option value="">${esc(o.placeholder)}</option>` : ''}${opts}</select>${hint}</div>`;
  }
  if (o.type === 'textarea') {
    return `<div class="${cls}"><label class="field-label" for="${id}">${esc(o.label)}${o.required ? ' <span class="req">*</span>' : ''}</label>
      <textarea class="input" id="${id}" name="${o.name}" rows="${o.rows || 3}" placeholder="${esc(o.placeholder || '')}"${req} ${dataAttrs}>${esc(val)}</textarea>${hint}</div>`;
  }
  if (o.type === 'checkbox') {
    return `<label class="${cls} check-field"><input type="checkbox" name="${o.name}" ${val ? 'checked' : ''}><span>${esc(o.label)}</span></label>${hint}`;
  }
  const type = o.type || 'text';
  const extra = [
    o.min !== undefined ? `min="${o.min}"` : '',
    o.max !== undefined ? `max="${o.max}"` : '',
    o.step ? `step="${o.step}"` : '',
    o.pattern ? `pattern="${o.pattern}"` : '',
    o.autocomplete ? `autocomplete="${o.autocomplete}"` : 'autocomplete="off"',
    o.capture ? `capture="${o.capture}"` : '',
  ].join(' ');
  return `<div class="${cls}"><label class="field-label" for="${id}">${esc(o.label)}${o.required ? ' <span class="req">*</span>' : ''}</label>
    <input class="input" type="${type}" id="${id}" name="${o.name}" value="${esc(val)}" placeholder="${esc(o.placeholder || '')}"${req} ${extra} ${dataAttrs}>${hint}</div>`;
}

// Reads a form into a plain object. Fields with data-num become numbers, empty numbers become 0.
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'file') continue;
    else if (el.dataset.num) out[el.name] = el.value === '' ? 0 : parseFloat(String(el.value).replace(/,/g, '')) || 0;
    else out[el.name] = String(el.value ?? '').trim();
  }
  return out;
}

// Keeps CNIC and phone inputs formatted while typing.
export function bindMasks(root) {
  root.querySelectorAll('[data-mask]').forEach((el) => {
    el.addEventListener('input', () => {
      if (el.dataset.mask === 'cnic') {
        const pos = el.selectionStart;
        const digitsBefore = el.value.slice(0, pos).replace(/\D/g, '').length;
        const v = el.value.replace(/[^\d-]/g, '').replace(/\D/g, '').slice(0, 13);
        const f = v.length <= 5 ? v : v.length <= 12 ? `${v.slice(0, 5)}-${v.slice(5)}` : `${v.slice(0, 5)}-${v.slice(5, 12)}-${v.slice(12)}`;
        el.value = f;
        const caret = digitsBefore <= 5 ? digitsBefore : digitsBefore <= 12 ? digitsBefore + 1 : digitsBefore + 2;
        el.setSelectionRange(caret, caret);
      }
    });
  });
}

// Sets the custom validity message so the browser shows Pakistani format hints.
export function validateSpecial(form) {
  for (const el of form.querySelectorAll('[data-mask="cnic"]')) {
    el.setCustomValidity(el.value && !/^\d{5}-\d{7}-\d$/.test(el.value) ? 'CNIC must be 13 digits: 12345-1234567-1' : '');
  }
  for (const el of form.querySelectorAll('[data-mask="phone"]')) {
    const d = el.value.replace(/\D/g, '');
    el.setCustomValidity(el.value && !(d.length === 11 && d.startsWith('03')) && !(d.startsWith('92') && d.length === 12) ? 'Enter a Pakistani mobile number, e.g. 0300 1234567' : '');
  }
}

export function stageSelectOptions(current) {
  return STAGES.map((s) => [s.key, s.label]).map(([v, l]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

// Simple tab strip; items: [{key, label, icon, count}]
export function tabStrip(items, active, hashBase) {
  return `<nav class="tabs" role="tablist">${items.map((t) => `<a role="tab" class="tab ${t.key === active ? 'active' : ''}" href="${hashBase}${t.key}" aria-selected="${t.key === active}">
      ${t.icon ? icon(t.icon) : ''}<span>${esc(t.label)}</span>${t.count !== undefined ? `<span class="tab-count">${t.count}</span>` : ''}</a>`).join('')}</nav>`;
}
