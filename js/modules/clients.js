// Client directory: list with search, client profile with passport, cases, family links and refusal history.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, fmtDate, money, waLink, todayISO, debounce } from '../core/utils.js';
import { STAGE_BY_KEY } from '../core/constants.js';
import * as Forms from './forms.js';

const LIST = { q: '', filter: 'all' };

export async function render(root, ctx) {
  if (ctx.params[0]) return renderProfile(root, ctx, ctx.params[0]);
  return renderList(root, ctx);
}

async function renderList(root, ctx) {
  ctx.setTitle('Clients');
  const data = await D.loadSnapshot();
  const casesByClient = groupBy(data.cases, (c) => c.clientId);
  const payments = data.payments.filter((p) => !p.voided);
  const withRefusal = new Set(data.clients.filter((c) => (c.refusals || []).length).map((c) => c.id));
  const rows = data.clients.filter((c) => {
    const q = LIST.q.trim().toLowerCase();
    if (q) {
      const digits = q.replace(/\D/g, '');
      const hit = c.name.toLowerCase().includes(q) || (c.passportNo || '').toLowerCase().includes(q)
        || (digits.length >= 4 && ((c.phone || '').replace(/\D/g, '').includes(digits) || (c.cnic || '').replace(/\D/g, '').includes(digits)));
      if (!hit) return false;
    }
    const mine = casesByClient[c.id] || [];
    if (LIST.filter === 'active') return mine.some((x) => x.outcome !== 'withdrawn' && x.stage !== 'closed');
    if (LIST.filter === 'none') return mine.length === 0;
    if (LIST.filter === 'refused') return withRefusal.has(c.id);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  root.innerHTML = `
    ${UI.pageHead({
      title: 'Clients',
      sub: `${data.clients.length} people on record · ${Object.keys(casesByClient).length} with files`,
      actions: `<button class="btn btn-primary" data-act="new">${UI.icon('person-plus')} New client</button>`,
    })}
    <div class="filter-bar reveal">
      <div class="search-inline">${UI.icon('search')}<input id="cl-q" class="input" type="search" value="${esc(LIST.q)}" placeholder="Name, CNIC, phone or passport no." autocomplete="off"></div>
      <div class="chip-group" role="group" aria-label="Filter">
        ${[['all', 'All'], ['active', 'Active files'], ['none', 'No file yet'], ['refused', 'Past refusals']].map(([k, l]) => `<button type="button" class="filter-chip ${LIST.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
      </div>
    </div>
    ${data.clients.length === 0 ? UI.emptyState({ iconName: 'people', title: 'No clients yet', text: 'Add the people you process visas for. Keep names exactly as on the passport.', action: '<button class="btn btn-primary" data-act="new">Add first client</button>' })
      : rows.length === 0 ? UI.emptyState({ iconName: 'search', title: 'No clients match' })
      : `<div class="client-grid">${rows.map((c, i) => {
        const mine = casesByClient[c.id] || [];
        const open = mine.filter((x) => x.outcome !== 'withdrawn' && x.stage !== 'closed');
        const due = mine.reduce((a, x) => a + D.caseMoney(x, payments).due, 0);
        const refusals = (c.refusals || []).length;
        return `<a class="client-card reveal" style="--d:${Math.min(i, 12) * 30}ms" href="#/clients/${encodeURIComponent(c.id)}">
          <div class="cc-head">${UI.avatar(c.name, i)}<div><b>${esc(c.name)}</b><small>${esc(c.city || '')}${c.city && c.phone ? ' · ' : ''}${esc(c.phone || '')}</small></div></div>
          <div class="cc-tags">
            ${open.length ? `<span class="chip chip-info">${UI.icon('folder2-open')} ${open.length} active</span>` : mine.length ? `<span class="chip chip-neutral">${mine.length} past</span>` : `<span class="chip chip-muted">No file</span>`}
            ${open.length ? `<span class="stage-chip" style="--stage:${STAGE_BY_KEY[open[0].stage]?.color || '#64748b'}">${esc(STAGE_BY_KEY[open[0].stage]?.label || '')}</span>` : ''}
            ${due > 0 ? `<span class="chip chip-warn">Due ${esc(money(due))}</span>` : ''}
            ${refusals ? `<span class="chip chip-danger">${UI.icon('x-circle')} ${refusals} refusal${refusals > 1 ? 's' : ''}</span>` : ''}
          </div></a>`;
      }).join('')}</div>`}
  `;

  const reRender = debounce(() => UI.rerenderKeepingFocus(root, '#cl-q', () => renderList(root, ctx)), 180);
  root.onclick = (e) => {
    if (e.target.closest('[data-act="new"]')) return Forms.openClientForm({ onSaved: (cl) => ctx.navigate(`#/clients/${encodeURIComponent(cl.id)}`) });
    const f = e.target.closest('[data-filter]');
    if (f) { LIST.filter = f.dataset.filter; renderList(root, ctx); }
  };
  root.querySelector('#cl-q').addEventListener('input', (e) => { LIST.q = e.target.value; reRender(); });
}

async function renderProfile(root, ctx, id) {
  const client = await D.getClient(id);
  if (!client) {
    root.innerHTML = UI.emptyState({ iconName: 'person-x', title: 'Client not found', action: '<a class="btn btn-ghost" href="#/clients">Back to clients</a>' });
    return;
  }
  ctx.setTitle(client.name);
  const [allCases, payments, settings, partners] = await Promise.all([
    D.listCases(), D.listPayments(), D.getSettings(), D.listPartners(),
  ]);
  const mine = allCases.filter((c) => c.clientId === id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const asMember = allCases.filter((c) => (c.memberIds || []).includes(id) && c.clientId !== id);
  const pays = payments.filter((p) => !p.voided);
  const due = mine.reduce((a, c) => a + D.caseMoney(c, pays).due, 0);
  const paid = mine.reduce((a, c) => a + D.caseMoney(c, pays).paid, 0);
  const partner = partners.find((p) => p.id === client.partnerId);
  const passportWarn = D.passportIssue(client, mine.find((c) => c.outcome !== 'withdrawn' && c.stage !== 'closed')?.travelDate || '', settings.minPassportMonths);
  const wa = waLink(client.phone, `Assalam o Alaikum ${client.name.split(' ')[0]}, this is ${settings.agencyName || 'your consultant'}.`);
  const expiring = client.passportExpiry && client.passportExpiry < todayISO();

  root.innerHTML = `
    <div class="detail-head reveal">
      <a class="back-link" href="#/clients">${UI.icon('chevron-left')} Clients</a>
      <div class="profile-head">
        ${UI.avatar(client.name, 0)}
        <div class="profile-text">
          <h1>${esc(client.name)}</h1>
          ${client.nameUr ? `<div class="urdu-name" dir="rtl">${esc(client.nameUr)}</div>` : ''}
          <div class="profile-sub">${esc([client.gender, client.occupation, client.city].filter(Boolean).join(' · ')) || 'Client profile'}</div>
        </div>
        <div class="profile-actions">
          ${client.phone ? `<a class="btn btn-ghost" href="tel:${esc(client.phone)}">${UI.icon('telephone')}<span class="hide-sm"> Call</span></a>` : ''}
          ${wa ? `<a class="btn btn-ghost" href="${wa}" target="_blank" rel="noopener">${UI.icon('whatsapp')}<span class="hide-sm"> WhatsApp</span></a>` : ''}
          <button class="btn btn-ghost" data-act="edit">${UI.icon('pencil')}<span class="hide-sm"> Edit</span></button>
          <button class="btn btn-primary" data-act="new-case">${UI.icon('briefcase')} New file</button>
        </div>
      </div>
      ${passportWarn ? `<div class="notice notice-warn">${UI.icon('passport')}<span>${esc(passportWarn)}</span></div>` : ''}
      ${expiring ? `<div class="notice notice-danger">${UI.icon('passport')}<span>Passport expired on ${fmtDate(client.passportExpiry)}. A new passport is needed before applying.</span></div>` : ''}
    </div>

    <div class="detail-grid">
      <div class="detail-main">
        <section class="panel reveal">
          <div class="panel-head"><h2>Visa files</h2><span class="muted small">${mine.length} total</span></div>
          ${mine.length ? `<div class="list-stack">${mine.map((c) => `<a class="file-row" href="#/cases/${encodeURIComponent(c.id)}">
              <div class="fr-main"><b>${esc(c.caseNo)} · ${esc(c.flag || '')} ${esc(c.countryName)}</b><small>${esc(c.visaName)} · ${c.travelDate ? fmtDate(c.travelDate) : 'No date'}</small></div>
              <div class="fr-meta">${UI.stageBadge(c.stage)}${c.outcome && c.outcome !== 'pending' ? UI.outcomeChip(c.outcome) : ''}</div></a>`).join('')}</div>`
            : UI.emptyState({ iconName: 'briefcase', title: 'No visa files yet', action: '<button class="btn btn-primary" data-act="new-case">Open a file</button>' })}
          ${asMember.length ? `<div class="family-note">${UI.icon('people')} Also a family member on: ${asMember.map((c) => `<a href="#/cases/${encodeURIComponent(c.id)}">${esc(c.caseNo)}</a>`).join(', ')}</div>` : ''}
        </section>

        <section class="panel reveal" style="--d:60ms">
          <div class="panel-head"><h2>Refusal history</h2><button class="btn btn-sm btn-ghost" data-act="add-refusal">${UI.icon('plus-lg')} Add</button></div>
          <p class="muted small">Embassies keep refusal records. Showing them here helps you advise the next application honestly.</p>
          ${(client.refusals || []).length ? `<div class="list-stack">${(client.refusals || []).map((r) => `<div class="mini-row danger">${UI.icon('x-circle')}<div><b>${esc(r.country || 'Refusal')} · ${esc(r.visa || '')}</b><small>${fmtDate(r.date)}${r.caseNo ? ` · ${esc(r.caseNo)}` : ''}</small>${r.reason ? `<small>${esc(r.reason)}</small>` : ''}</div></div>`).join('')}</div>`
            : '<div class="muted-note">No refusals recorded.</div>'}
        </section>
      </div>

      <aside class="detail-side">
        <div class="side-card reveal" style="--d:80ms">
          <div class="side-head"><span>Money</span></div>
          <dl class="kv">
            <div><dt>Paid across files</dt><dd class="text-ok">${money(paid)}</dd></div>
            <div class="kv-due"><dt>Still due</dt><dd>${money(due)}</dd></div>
          </dl>
        </div>
        <div class="side-card reveal" style="--d:120ms">
          <div class="side-head"><span>Contact & identity</span></div>
          <dl class="kv">
            <div><dt>Mobile</dt><dd>${esc(client.phone || '—')}</dd></div>
            <div><dt>Email</dt><dd>${esc(client.email || '—')}</dd></div>
            <div><dt>CNIC</dt><dd>${esc(client.cnic || '—')}</dd></div>
            <div><dt>Father / husband</dt><dd>${esc(client.fatherName || '—')}</dd></div>
            <div><dt>Date of birth</dt><dd>${client.dob ? fmtDate(client.dob) : '—'}</dd></div>
            <div><dt>Marital status</dt><dd>${esc(client.maritalStatus || '—')}</dd></div>
            <div><dt>Address</dt><dd>${esc([client.address, client.city, client.province].filter(Boolean).join(', ') || '—')}</dd></div>
          </dl>
        </div>
        <div class="side-card reveal" style="--d:160ms">
          <div class="side-head"><span>Passport</span></div>
          <dl class="kv">
            <div><dt>Number</dt><dd>${esc(client.passportNo || '—')}</dd></div>
            <div><dt>Issued</dt><dd>${client.passportIssue ? fmtDate(client.passportIssue) : '—'} ${client.passportPlace ? `· ${esc(client.passportPlace)}` : ''}</dd></div>
            <div><dt>Expires</dt><dd class="${expiring ? 'text-danger' : ''}">${client.passportExpiry ? fmtDate(client.passportExpiry) : '—'}</dd></div>
          </dl>
        </div>
        <div class="side-card reveal" style="--d:200ms">
          <div class="side-head"><span>Source</span></div>
          <p class="side-note">${esc(client.source || 'Not recorded')}${partner ? ` · via <b>${esc(partner.name)}</b>` : ''}</p>
          ${client.notes ? `<p class="side-note">${esc(client.notes)}</p>` : ''}
        </div>
        <div class="side-card danger-zone reveal" style="--d:240ms">
          <button class="btn btn-ghost btn-block text-danger" data-act="delete">${UI.icon('trash')} Delete client</button>
        </div>
      </aside>
    </div>`;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const reload = () => ctx.refresh();
    switch (b.dataset.act) {
      case 'edit': return Forms.openClientForm({ client, onSaved: reload });
      case 'new-case': return Forms.openCaseForm({ clientId: id, onSaved: (c) => ctx.navigate(`#/cases/${c.id}`) });
      case 'add-refusal': return addRefusal(client, reload);
      case 'delete': {
        const ok = await UI.confirmDialog(`Delete ${client.name} and all their files? This cannot be undone.`, { okLabel: 'Delete client', danger: true });
        if (!ok) return;
        try { await D.deleteClient(id); } catch (err) { return UI.toast(err.message, 'danger', 6000); }
        UI.toast('Client deleted', 'info');
        return ctx.navigate('#/clients');
      }
      default:
    }
  };
}

function addRefusal(client, reload) {
  UI.openSheet({
    title: 'Add past refusal', size: 'md',
    html: `<form id="ref-form" class="form-grid">
      ${UI.field({ name: 'country', label: 'Country', required: true, placeholder: 'e.g. Schengen (Italy)' })}
      ${UI.field({ name: 'visa', label: 'Visa type', placeholder: 'e.g. Tourist' })}
      ${UI.field({ name: 'date', label: 'Date of refusal', type: 'date', value: todayISO(), required: true })}
      ${UI.field({ name: 'reason', label: 'Reason (from letter)', type: 'textarea', full: true, rows: 3 })}
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="ref-form">Save</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('#ref-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const v = UI.readForm(form);
        await D.addRefusal(client.id, { caseNo: '', country: v.country, visa: v.visa, date: v.date, reason: v.reason });
        UI.toast('Refusal added to history');
        close(true);
        reload();
      });
    },
  });
}

function groupBy(list, f) {
  return list.reduce((acc, x) => { (acc[f(x)] ||= []).push(x); return acc; }, {});
}
