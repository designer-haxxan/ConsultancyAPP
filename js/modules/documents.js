// Document queue across all open files: what is missing, what needs checking, what is verified.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, debounce } from '../core/utils.js';
import { DOC_STATUS } from '../core/constants.js';

const STATE = { s: 'open', q: '' };

const VIEWS = [
  ['open', 'All open items', (d) => d.required && d.status !== 'na' && d.status !== 'verified'],
  ['missing', 'Missing', (d) => d.status === 'missing'],
  ['check', 'To verify', (d) => d.status === 'received'],
  ['fix', 'Needs fix', (d) => d.status === 'rejected'],
  ['verified', 'Verified', (d) => d.status === 'verified'],
];

export async function render(root, ctx) {
  ctx.setTitle('Documents');
  const sp = ctx.query.get('s');
  if (sp && VIEWS.some(([k]) => k === sp)) STATE.s = sp;
  const data = await D.loadSnapshot();
  const cases = new Map(data.cases.map((c) => [c.id, c]));
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const live = data.documents.filter((d) => {
    const c = cases.get(d.caseId);
    return c && c.outcome !== 'withdrawn' && c.stage !== 'closed';
  });
  const counts = Object.fromEntries(VIEWS.map(([k, , f]) => [k, live.filter(f).length]));

  root.innerHTML = `
    ${UI.pageHead({ title: 'Document queue', sub: `${counts.missing} missing · ${counts.check} waiting to be checked · ${counts.fix} need a fix`, actions: '' })}
    <div class="filter-bar reveal">
      <div class="search-inline">${UI.icon('search')}<input id="dq" class="input" type="search" placeholder="Search client or document" value="${esc(STATE.q)}" autocomplete="off"></div>
    </div>
    <div class="chip-group reveal" role="group" aria-label="Queue view">
      ${VIEWS.map(([k, l]) => `<button type="button" class="filter-chip ${STATE.s === k ? 'on' : ''}" data-view="${k}">${esc(l)} <span class="count">${counts[k]}</span></button>`).join('')}
    </div>
    <div id="dq-list"></div>`;

  const paint = () => {
    const f = VIEWS.find(([k]) => k === STATE.s)[2];
    const q = STATE.q.trim().toLowerCase();
    const rows = live.filter(f).filter((d) => {
      if (!q) return true;
      const c = cases.get(d.caseId); const cl = clients.get(d.clientId);
      return `${d.label} ${cl?.name || ''} ${c?.caseNo || ''}`.toLowerCase().includes(q);
    }).sort((a, b) => {
      const ca = cases.get(a.caseId)?.caseNo || ''; const cb = cases.get(b.caseId)?.caseNo || '';
      return ca === cb ? (a.label < b.label ? -1 : 1) : (ca < cb ? -1 : 1);
    });
    const list = root.querySelector('#dq-list');
    if (!rows.length) { list.innerHTML = UI.emptyState({ iconName: 'check2-circle', title: 'Nothing in this view', text: 'Nice work. Switch the view to see other items.' }); return; }
    list.innerHTML = `<div class="table-card reveal"><div class="table-wrap"><table class="table">
      <thead><tr><th>Document</th><th>Applicant</th><th>File</th><th>Status</th></tr></thead>
      <tbody>${rows.slice(0, 400).map((d) => {
        const c = cases.get(d.caseId); const cl = clients.get(d.clientId);
        const st = DOC_STATUS[d.status] || DOC_STATUS.missing;
        return `<tr>
          <td><b>${esc(d.label)}</b>${d.required ? '' : ' <span class="opt">optional</span>'}<div class="small muted">${esc(d.category)}</div></td>
          <td>${esc(cl?.name || '—')}</td>
          <td><a class="cell-link" href="#/cases/${encodeURIComponent(d.caseId)}/documents">${esc(c?.caseNo || '')}</a><div class="small muted">${esc(c?.countryName || '')}</div></td>
          <td><div class="row-gap"><span class="chip chip-${st.tone}">${UI.icon(st.icon)} ${esc(st.label)}</span>
            <select class="input input-sm" data-doc-status="${esc(d.id)}" aria-label="Change status">${Object.entries(DOC_STATUS).map(([k, v]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div></td>
        </tr>`;
      }).join('')}</tbody></table></div></div>
      ${rows.length > 400 ? `<p class="hint-line">Showing the first 400 of ${rows.length}. Narrow the search.</p>` : ''}`;
  };
  paint();

  root.onclick = (e) => {
    const v = e.target.closest('[data-view]');
    if (v) {
      STATE.s = v.dataset.view;
      root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === STATE.s));
      paint();
    }
  };
  root.onchange = async (e) => {
    const sel = e.target.closest('[data-doc-status]');
    if (!sel) return;
    await D.setDocStatus(sel.dataset.docStatus, sel.value);
    UI.toast('Status updated');
    ctx.refresh();
  };
  const search = root.querySelector('#dq');
  search.addEventListener('input', debounce((e) => { STATE.q = e.target.value; paint(); }, 150));
}
