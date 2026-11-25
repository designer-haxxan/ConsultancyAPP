// Visa catalogue: countries, visa types and the document checklist for each. Editing here affects NEW files only.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, debounce } from '../core/utils.js';
import { VISA_CATEGORIES, DOC_CATEGORIES } from '../core/constants.js';
import { DOCS } from '../services/catalog-seed.js';

const STATE = { q: '' };

export async function render(root, ctx) {
  if (ctx.params[0]) return renderCountry(root, ctx, ctx.params[0]);
  ctx.setTitle('Visa catalogue');
  const countries = await D.listCountries();
  root.innerHTML = `
    ${UI.pageHead({
      title: 'Visa catalogue',
      sub: 'Countries, visa types and the document checklist for each. Verify requirements on the official site before you rely on them.',
      actions: `<button class="btn btn-primary" data-act="add-country">${UI.icon('plus-lg')} Add country</button>`,
    })}
    <div class="notice notice-info reveal">${UI.icon('shield-check')}<span>These checklists are starting templates. Embassies and VFS change rules and fees often. Edit a visa type to match the latest official list. Changes apply to new files only; open files keep the checklist they started with.</span></div>
    <div class="filter-bar reveal"><div class="search-inline">${UI.icon('search')}<input id="cq2" class="input" type="search" placeholder="Search country" value="${esc(STATE.q)}" autocomplete="off"></div></div>
    <div id="country-grid" class="country-grid"></div>`;

  const paint = () => {
    const q = STATE.q.trim().toLowerCase();
    const list = countries.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
    root.querySelector('#country-grid').innerHTML = list.length ? list.map((c, i) => `<a class="country-card reveal" style="--d:${Math.min(i, 14) * 30}ms" href="#/catalog/${encodeURIComponent(c.code)}">
        <span class="country-flag">${esc(c.flag || '🏳️')}</span>
        <div><b>${esc(c.name)}</b><small>${c.visaTypes.length} visa type${c.visaTypes.length === 1 ? '' : 's'} · ${esc(c.code)}</small></div>
        ${UI.icon('chevron-right', 'muted')}</a>`).join('') : UI.emptyState({ iconName: 'globe2', title: 'No country matches', action: '<button class="btn btn-primary" data-act="add-country">Add country</button>' });
  };
  paint();
  root.querySelector('#cq2').addEventListener('input', debounce((e) => { STATE.q = e.target.value; paint(); }, 120));
  root.onclick = (e) => { if (e.target.closest('[data-act="add-country"]')) countrySheet(null, () => ctx.refresh()); };
}

async function renderCountry(root, ctx, code) {
  const c = await D.getCountry(code);
  if (!c) {
    root.innerHTML = UI.emptyState({ iconName: 'globe2', title: 'Country not found', action: '<a class="btn btn-ghost" href="#/catalog">Back to catalogue</a>' });
    return;
  }
  ctx.setTitle(c.name);
  root.innerHTML = `
    <div class="detail-head reveal">
      <a class="back-link" href="#/catalog">${UI.icon('chevron-left')} Catalogue</a>
      <div class="profile-head">
        <span class="country-flag big">${esc(c.flag || '🏳️')}</span>
        <div class="profile-text"><h1>${esc(c.name)}</h1><div class="profile-sub">${esc(c.code)} · ${c.visaTypes.length} visa type${c.visaTypes.length === 1 ? '' : 's'}</div></div>
        <div class="profile-actions">
          <button class="btn btn-ghost" data-act="edit-country">${UI.icon('pencil')} Edit country</button>
          <button class="btn btn-primary" data-act="add-visa">${UI.icon('plus-lg')} Add visa type</button>
        </div>
      </div>
      ${c.notes ? `<p class="country-notes">${esc(c.notes)}</p>` : ''}
    </div>
    <div class="visa-grid">
      ${c.visaTypes.map((v, i) => {
        const names = v.docs.map((k) => DOCS[k]?.label || k).concat((v.custom || []).map((x) => x.label));
        return `<article class="visa-card reveal" style="--d:${i * 50}ms">
          <div class="vc-head"><span class="chip chip-neutral">${esc(VISA_CATEGORIES[v.category] || v.category)}</span><span class="muted small">${names.length} items</span></div>
          <h2>${esc(v.name)}</h2>
          ${v.notes ? `<p class="muted small">${esc(v.notes)}</p>` : ''}
          <details class="checklist-preview"><summary>View checklist</summary><ul>${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>
          <div class="vc-actions">
            <button class="btn btn-sm btn-ghost" data-act="edit-visa" data-key="${esc(v.key)}">${UI.icon('pencil')} Edit</button>
            <button class="btn btn-sm btn-ghost" data-act="dup-visa" data-key="${esc(v.key)}">${UI.icon('files')} Copy</button>
            <button class="btn btn-sm btn-ghost text-danger" data-act="del-visa" data-key="${esc(v.key)}">${UI.icon('trash')}</button>
          </div>
        </article>`;
      }).join('') || UI.emptyState({ iconName: 'card-checklist', title: 'No visa types yet', action: '<button class="btn btn-primary" data-act="add-visa">Add visa type</button>' })}
    </div>`;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const reload = () => ctx.refresh();
    const visa = c.visaTypes.find((v) => v.key === b.dataset.key);
    switch (b.dataset.act) {
      case 'edit-country': return countrySheet(c, reload);
      case 'add-visa': return visaSheet(c, null, reload);
      case 'edit-visa': return visaSheet(c, visa, reload);
      case 'dup-visa': {
        const copy = { ...visa, key: newKey(c.code, `${visa.name} copy`), name: `${visa.name} (copy)` };
        await D.saveCountry({ ...c, visaTypes: [...c.visaTypes, copy] });
        UI.toast('Copied. Edit the new visa type.');
        return reload();
      }
      case 'del-visa': {
        const ok = await UI.confirmDialog(`Delete the visa type “${visa.name}”? Open files that use it keep their checklist.`, { okLabel: 'Delete', danger: true });
        if (!ok) return;
        await D.saveCountry({ ...c, visaTypes: c.visaTypes.filter((v) => v.key !== visa.key) });
        UI.toast('Visa type deleted', 'info');
        return reload();
      }
      default:
    }
  };
}

function newKey(code, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
  return `${code.toLowerCase()}_${slug}_${Date.now().toString(36).slice(-4)}`;
}

function countrySheet(country, onSaved) {
  const isNew = !country;
  const c = country || { code: '', name: '', flag: '', notes: '' };
  UI.openSheet({
    title: isNew ? 'Add country' : 'Edit country', size: 'md',
    html: `<form id="cform" class="form-grid" novalidate>
      ${UI.field({ name: 'code', label: 'Code (2 to 4 letters)', value: c.code, required: true, pattern: '[A-Za-z]{2,4}', placeholder: 'e.g. IT', className: '' })}
      ${UI.field({ name: 'flag', label: 'Flag (emoji, optional)', value: c.flag, placeholder: '🇮🇹' })}
      ${UI.field({ name: 'name', label: 'Country name', value: c.name, required: true, full: true, placeholder: 'e.g. Italy (Schengen)' })}
      ${UI.field({ name: 'notes', label: 'General notes', type: 'textarea', value: c.notes, full: true, rows: 3, placeholder: 'Where to apply, who handles biometrics, typical timing…' })}
    </form>`,
    footer: `${isNew ? '' : `<button class="btn btn-ghost text-danger" type="button" data-del>${UI.icon('trash')} Delete</button>`}<span class="grow"></span>
      <button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="cform">Save</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('#cform');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const v = UI.readForm(form);
        const code = v.code.toUpperCase();
        try {
          if (isNew) {
            const exists = await D.getCountry(code);
            if (exists) throw new Error('That code is already used.');
          }
          await D.saveCountry({ code, id: code, name: v.name, flag: v.flag, notes: v.notes, visaTypes: c.visaTypes || [] });
          UI.toast('Country saved');
          close(true);
          if (isNew) location.hash = `#/catalog/${encodeURIComponent(code)}`;
          else onSaved();
        } catch (err) { UI.toast(err.message, 'danger'); }
      });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        const ok = await UI.confirmDialog(`Delete ${c.name} and its visa types?`, { okLabel: 'Delete', danger: true });
        if (!ok) return;
        try { await D.deleteCountry(c.code); close(true); UI.toast('Country deleted', 'info'); location.hash = '#/catalog'; }
        catch (err) { UI.toast(err.message, 'danger', 5200); }
      });
    },
  });
}

function visaSheet(country, visa, onSaved) {
  const isNew = !visa;
  const v = visa || { key: '', name: '', category: 'visit', docs: [], custom: [], notes: '' };
  const selected = new Set(v.docs || []);
  const custom = [...(v.custom || [])];
  const libByCat = {};
  for (const [key, d] of Object.entries(DOCS)) (libByCat[d.category] ||= []).push([key, d]);
  const cats = [...DOC_CATEGORIES.filter((k) => libByCat[k]), ...Object.keys(libByCat).filter((k) => !DOC_CATEGORIES.includes(k))];

  const html = `
    <form id="vform" class="form-grid" novalidate>
      ${UI.field({ name: 'name', label: 'Visa type name', value: v.name, required: true, full: true, placeholder: 'e.g. Tourist (Italy C visa)' })}
      ${UI.field({ name: 'category', label: 'Category', type: 'select', value: v.category, options: Object.entries(VISA_CATEGORIES) })}
      ${UI.field({ name: 'notes', label: 'Notes for staff', type: 'textarea', value: v.notes, rows: 2, full: true })}
    </form>
    <h3 class="sheet-sub">Checklist from the library</h3>
    <p class="muted small">Person items (passport, CNIC, photos) are asked from each applicant. Others are asked once per file.</p>
    <div class="check-cats">
      ${cats.map((cat) => `<details class="check-cat" ${libByCat[cat]?.some(([k]) => selected.has(k)) ? 'open' : ''}>
        <summary>${esc(cat)} <span class="count">${libByCat[cat].filter(([k]) => selected.has(k)).length}/${libByCat[cat].length}</span></summary>
        ${libByCat[cat].map(([k, d]) => `<label class="check-line"><input type="checkbox" name="doc" value="${esc(k)}" ${selected.has(k) ? 'checked' : ''}><span>${esc(d.label)}${d.scope === 'person' ? ' <i class="tag-person">each applicant</i>' : ''}</span></label>`).join('')}
      </details>`).join('')}
    </div>
    <h3 class="sheet-sub">Your own items</h3>
    <div id="custom-list" class="custom-list">${custom.map((x, i) => customRow(x, i)).join('')}</div>
    <div class="custom-add">
      <input class="input" id="ci-label" placeholder="e.g. NOC from school principal">
      <select class="input" id="ci-scope"><option value="case">Whole file</option><option value="person">Each applicant</option></select>
      <button type="button" class="btn btn-ghost" id="ci-add">${UI.icon('plus-lg')} Add</button>
    </div>`;

  UI.openSheet({
    title: isNew ? `New visa type · ${country.name}` : `Edit ${v.name}`, size: 'lg', html,
    footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="vform" data-save>Save visa type</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('#vform');
      const list = el.querySelector('#custom-list');
      el.querySelector('#ci-add').addEventListener('click', () => {
        const label = el.querySelector('#ci-label').value.trim();
        if (!label) return UI.toast('Type the item name first', 'warn');
        custom.push({ label, category: 'Other', scope: el.querySelector('#ci-scope').value, required: true });
        el.querySelector('#ci-label').value = '';
        list.innerHTML = custom.map((x, i) => customRow(x, i)).join('');
      });
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]');
        if (!b) return;
        custom.splice(Number(b.dataset.remove), 1);
        list.innerHTML = custom.map((x, i) => customRow(x, i)).join('');
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const f = UI.readForm(form);
        const docs = [...el.querySelectorAll('input[name=doc]:checked')].map((b) => b.value);
        if (!docs.length && !custom.length) return UI.toast('Add at least one checklist item', 'warn');
        const next = {
          key: v.key || newKey(country.code, f.name), name: f.name, category: f.category, notes: f.notes, docs, custom,
        };
        const visaTypes = isNew ? [...country.visaTypes, next] : country.visaTypes.map((x) => (x.key === v.key ? next : x));
        try {
          await D.saveCountry({ ...country, visaTypes });
          UI.toast('Visa type saved');
          close(true);
          onSaved();
        } catch (err) { UI.toast(err.message, 'danger'); }
      });
    },
  });
}

function customRow(x, i) {
  return `<div class="custom-row"><span><b>${esc(x.label)}</b> <small>${x.scope === 'person' ? 'each applicant' : 'whole file'}</small></span>
    <button type="button" class="icon-btn sm" data-remove="${i}" aria-label="Remove">${UI.icon('x-lg')}</button></div>`;
}
