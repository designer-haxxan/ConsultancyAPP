// Visa pipeline (board and list) and the visa file detail page with documents, appointments, payments and timeline.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { CONFIG } from '../config.js';
import { esc, relDays, fmtDate, fmtDateTime, money, todayISO, waLink, fileSize, downloadBlob } from '../core/utils.js';
import { STAGES, STAGE_BY_KEY, STAGE_INDEX, DOC_STATUS, ATTEST_STEPS, VISA_CATEGORIES, APPT_STATUS } from '../core/constants.js';
import { printHTML, printHead } from '../core/print.js';
import * as Forms from './forms.js';

const FILTER = { q: '', country: '', assignee: '', includeWithdrawn: false, view: localStorage.getItem('visaflow.casesView') || 'board' };

export async function render(root, ctx) {
  if (ctx.params[0]) return renderDetail(root, ctx, ctx.params[0], ctx.params[1] || 'overview');
  return renderBoard(root, ctx);
}

// ============ BOARD & LIST ============
async function renderBoard(root, ctx) {
  ctx.setTitle('Cases');
  const data = await D.loadSnapshot();
  const clientsById = Object.fromEntries(data.clients.map((c) => [c.id, c]));
  const docsByCase = groupBy(data.documents, (d) => d.caseId);
  const payByCase = groupBy(data.payments.filter((p) => !p.voided), (p) => p.caseId);
  const countries = [...new Set(data.cases.map((c) => c.countryName))].sort();
  const assignees = [...new Set(data.cases.map((c) => c.assignee).filter(Boolean))].sort();

  const matches = (c) => {
    const client = clientsById[c.clientId];
    const q = FILTER.q.trim().toLowerCase();
    if (q && !`${client?.name || ''} ${c.caseNo} ${c.countryName} ${c.visaName}`.toLowerCase().includes(q)) return false;
    if (FILTER.country && c.countryName !== FILTER.country) return false;
    if (FILTER.assignee && c.assignee !== FILTER.assignee) return false;
    if (!FILTER.includeWithdrawn && c.outcome === 'withdrawn') return false;
    return true;
  };
  const visible = data.cases.filter(matches);
  const active = visible.filter((c) => c.stage !== 'closed' && c.outcome !== 'withdrawn');
  const attention = active.filter((c) => D.docProgress(docsByCase[c.id] || []).missing > 0).length;

  root.innerHTML = `
    ${UI.pageHead({
      title: 'Visa pipeline',
      sub: `${active.length} active ${active.length === 1 ? 'file' : 'files'} · ${attention} waiting on documents`,
      actions: `<div class="seg" role="group" aria-label="View">
          <button type="button" class="seg-btn ${FILTER.view === 'board' ? 'on' : ''}" data-view="board">${UI.icon('kanban')}<span>Board</span></button>
          <button type="button" class="seg-btn ${FILTER.view === 'list' ? 'on' : ''}" data-view="list">${UI.icon('list-ul')}<span>List</span></button>
        </div>
        <button type="button" class="btn btn-primary" data-new>${UI.icon('plus-lg')} New file</button>`,
    })}
    <div class="filter-bar reveal">
      <div class="search-inline">${UI.icon('search')}<input id="cq" class="input" type="search" placeholder="Search client, case no., country" value="${esc(FILTER.q)}" autocomplete="off"></div>
      <select id="cc" class="input"><option value="">All countries</option>${countries.map((c) => `<option ${c === FILTER.country ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="ca" class="input"><option value="">Everyone</option>${assignees.map((a) => `<option ${a === FILTER.assignee ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
      <label class="toggle-chip"><input type="checkbox" id="cw" ${FILTER.includeWithdrawn ? 'checked' : ''}><span>Show withdrawn</span></label>
    </div>
    ${data.cases.length === 0
      ? UI.emptyState({ iconName: 'briefcase', title: 'No visa files yet', text: 'Open a file for a client: pick the country and visa, add family members, and the checklist is ready.', action: '<button class="btn btn-primary" data-new>Open first file</button>' })
      : FILTER.view === 'board' ? boardHTML(visible, clientsById, docsByCase, payByCase, data) : listHTML(visible, clientsById, docsByCase, payByCase, data)}
  `;

  root.onclick = async (e) => {
    const newBtn = e.target.closest('[data-new]');
    if (newBtn) return Forms.openCaseForm({ onSaved: (c) => ctx.navigate(`#/cases/${c.id}`) });
    const v = e.target.closest('[data-view]');
    if (v) { FILTER.view = v.dataset.view; localStorage.setItem('visaflow.casesView', FILTER.view); return renderBoard(root, ctx); }
  };
  const reRender = () => renderBoard(root, ctx);
  root.querySelector('#cq').addEventListener('input', (e) => {
    FILTER.q = e.target.value;
    clearTimeout(root._t);
    root._t = setTimeout(() => UI.rerenderKeepingFocus(root, '#cq', () => renderBoard(root, ctx)), 180);
  });
  root.querySelector('#cc').addEventListener('change', (e) => { FILTER.country = e.target.value; reRender(); });
  root.querySelector('#ca').addEventListener('change', (e) => { FILTER.assignee = e.target.value; reRender(); });
  root.querySelector('#cw').addEventListener('change', (e) => { FILTER.includeWithdrawn = e.target.checked; reRender(); });

  // Drag a card onto a stage column (desktop).
  root.querySelectorAll('.case-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  root.querySelectorAll('.stage-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      const stage = col.dataset.stage;
      const c = data.cases.find((x) => x.id === id);
      if (!c || c.stage === stage) return;
      await D.moveStage(id, stage);
      UI.toast(`Moved to ${STAGE_BY_KEY[stage].label}`);
      reRender();
    });
  });
  UI.animateCounts(root);
}

function groupBy(list, f) {
  return list.reduce((acc, x) => { (acc[f(x)] ||= []).push(x); return acc; }, {});
}

function cardHTML(c, clientsById, docsByCase, payByCase) {
  const client = clientsById[c.clientId];
  const docs = docsByCase[c.id] || [];
  const prog = D.docProgress(docs);
  const m = D.caseMoney(c, payByCase[c.id] || []);
  const travel = c.travelDate ? relDays(c.travelDate) : null;
  const passport = client ? D.passportIssue(client, c.travelDate, 6) : null;
  const stage = STAGE_BY_KEY[c.stage] || STAGES[0];
  return `<a class="case-card ${c.outcome === 'refused' ? 'is-refused' : ''}" href="#/cases/${encodeURIComponent(c.id)}" draggable="true" data-id="${esc(c.id)}" style="--stage:${stage.color}">
    <div class="cc-top"><span class="cc-no">${esc(c.caseNo)}</span>
      ${c.priority === 'high' ? '<span class="prio-dot" title="High priority"></span>' : ''}
      ${c.outcome && c.outcome !== 'pending' ? UI.outcomeChip(c.outcome) : ''}
    </div>
    <div class="cc-client">${UI.avatar(client?.name || '?', hash(client?.name || ''))}
      <div class="cc-client-text"><b>${esc(client?.name || 'Client removed')}</b><small>${c.memberIds?.length ? `+${c.memberIds.length} family` : esc(c.assignee || 'Unassigned')}</small></div></div>
    <div class="cc-visa"><span class="flag">${esc(c.flag || '')}</span> ${esc(c.countryName)} · ${esc(c.visaName)}</div>
    <div class="cc-progress">${UI.progress(prog.pct, prog.missing ? 'warn' : 'success')}
      <small>${prog.done}/${prog.total} documents ${prog.missing ? `· ${prog.missing} missing` : '· complete'}</small></div>
    <div class="cc-foot">
      ${travel ? `<span class="chip chip-${travel.tone === 'danger' ? 'danger' : travel.tone === 'warn' ? 'warn' : 'neutral'}">${UI.icon('airplane')} ${esc(travel.text)}</span>` : '<span></span>'}
      ${m.due > 0 ? `<span class="cc-due">Due ${esc(money(m.due))}</span>` : m.billed > 0 ? '<span class="cc-paid">Paid up</span>' : ''}
    </div>
    ${passport ? `<div class="cc-warn">${UI.icon('exclamation-triangle-fill')} Passport validity</div>` : ''}
  </a>`;
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

function boardHTML(cases, clientsById, docsByCase, payByCase, data) {
  return `<div class="board" role="region" aria-label="Pipeline board">
    ${STAGES.map((s, i) => {
      const list = cases.filter((c) => c.stage === s.key);
      const due = list.reduce((a, c) => a + D.caseMoney(c, data.payments).due, 0);
      return `<section class="stage-col reveal" data-stage="${s.key}" style="--stage:${s.color};--d:${i * 40}ms">
        <header class="stage-head">
          <span class="stage-ic">${UI.icon(s.icon)}</span>
          <div class="stage-title"><b>${esc(s.label)}</b><small>${due ? esc(money(due)) + ' due' : esc(s.hint)}</small></div>
          <span class="stage-count">${list.length}</span>
        </header>
        <div class="stage-body">
          ${list.length ? list.map((c) => cardHTML(c, clientsById, docsByCase, payByCase)).join('') : '<div class="stage-empty">Drop a file here</div>'}
        </div>
      </section>`;
    }).join('')}
  </div>
  <p class="hint-line">${UI.icon('hand-index')} On desktop, drag a card to another column to change its stage. On phones, open the file and use “Move stage”.</p>`;
}

function listHTML(cases, clientsById, docsByCase, payByCase, data) {
  const rows = [...cases].sort((a, b) => (a.travelDate || '9999') < (b.travelDate || '9999') ? -1 : 1);
  if (!rows.length) return UI.emptyState({ iconName: 'funnel', title: 'No files match these filters' });
  return `<div class="table-card reveal">
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Case</th><th>Client</th><th>Visa</th><th>Stage</th><th>Documents</th><th class="num">Balance</th><th>Travel</th><th>Outcome</th></tr></thead>
      <tbody>${rows.map((c) => {
        const client = clientsById[c.clientId];
        const prog = D.docProgress(docsByCase[c.id] || []);
        const m = D.caseMoney(c, data.payments);
        const trav = c.travelDate ? relDays(c.travelDate) : null;
        return `<tr class="row-link" data-href="#/cases/${encodeURIComponent(c.id)}">
          <td><a class="cell-link" href="#/cases/${encodeURIComponent(c.id)}">${esc(c.caseNo)}</a><div class="small muted">${esc(c.assignee || '')}</div></td>
          <td><b>${esc(client?.name || '—')}</b>${c.memberIds?.length ? `<div class="small muted">+${c.memberIds.length} family</div>` : ''}</td>
          <td><span class="flag">${esc(c.flag || '')}</span> ${esc(c.countryName)}<div class="small muted">${esc(c.visaName)}</div></td>
          <td>${UI.stageBadge(c.stage)}</td>
          <td class="docs-cell">${UI.progress(prog.pct, prog.missing ? 'warn' : 'success')}<small>${prog.done}/${prog.total}</small></td>
          <td class="num">${m.due > 0 ? esc(money(m.due)) : '<span class="muted">—</span>'}</td>
          <td>${trav ? `<span class="chip chip-${trav.tone === 'danger' ? 'danger' : 'neutral'}">${esc(trav.text)}</span>` : '<span class="muted">—</span>'}</td>
          <td>${c.outcome && c.outcome !== 'pending' ? UI.outcomeChip(c.outcome) : '<span class="muted">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
  </div>
  <div class="mobile-list">${rows.map((c) => {
    const client = clientsById[c.clientId];
    return `<a class="list-card" href="#/cases/${encodeURIComponent(c.id)}">
      <div class="lc-main">${UI.avatar(client?.name || '?', hash(client?.name || ''))}<div><b>${esc(client?.name || '—')}</b><small>${esc(c.caseNo)} · ${esc(c.countryName)} · ${esc(c.visaName)}</small></div></div>
      <div class="lc-meta">${UI.stageBadge(c.stage)}</div></a>`;
  }).join('')}</div>`;
}

// ============ CASE DETAIL ============
const TABS = [
  ['overview', 'Overview', 'layout-text-sidebar-reverse'],
  ['documents', 'Documents', 'folder2-open'],
  ['appointments', 'Appointments', 'calendar-check'],
  ['payments', 'Payments', 'cash-stack'],
  ['timeline', 'Timeline', 'clock-history'],
];

async function renderDetail(root, ctx, id, tab) {
  const c0 = await D.getCase(id);
  if (!c0) {
    root.innerHTML = UI.emptyState({ iconName: 'question-circle', title: 'This file does not exist', text: 'It may have been deleted.', action: '<a class="btn btn-ghost" href="#/cases">Back to pipeline</a>' });
    return;
  }
  ctx.setTitle(c0.caseNo);
  const state = { id, tab, settings: ctx.settings, ctx, root };
  root.innerHTML = `<div class="detail-shell" id="detail-shell"><div class="skeleton-wrap"><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:280px"></div></div></div>`;
  await load(state);
  root.onclick = (e) => onClick(e, state);
  root.onchange = (e) => onChange(e, state);
  root.onsubmit = (e) => onSubmit(e, state);
}

async function load(state) {
  const { id } = state;
  const c = await D.getCase(id);
  if (!c) return;
  const [client, members, docs, files, payments, appts, events, country, partners, settings] = await Promise.all([
    D.getClient(c.clientId),
    Promise.all((c.memberIds || []).map((m) => D.getClient(m))),
    D.docsForCase(id),
    D.listFilesForCase(id),
    D.paymentsForCase(id),
    getAppts(id),
    D.eventsForCase(id),
    D.getCountry(c.country),
    D.listPartners(),
    D.getSettings(),
  ]);
  state.c = c; state.client = client; state.members = members.filter(Boolean);
  state.docs = docs.sort(docSort(c)); state.files = files; state.payments = payments.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  state.appts = appts.sort((a, b) => (a.date + (a.time || '') < b.date + (b.time || '') ? -1 : 1)); state.events = events;
  state.country = country; state.partner = partners.find((p) => p.id === c.partnerId) || null; state.settings = settings;
  state.money = D.caseMoney(c, payments);
  state.prog = D.docProgress(docs);
  paint(state);
}

async function getAppts(caseId) {
  return (await D.listAppointments()).filter((a) => a.caseId === caseId);
}

function docSort(c) {
  return (a, b) => {
    const ra = a.scope === 'case' ? 'zz' : (a.clientId === c.clientId ? '0' : '1' + a.clientId);
    const rb = b.scope === 'case' ? 'zz' : (b.clientId === c.clientId ? '0' : '1' + b.clientId);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return (a.label || '') < (b.label || '') ? -1 : 1;
  };
}

function paint(state) {
  const shell = state.root.querySelector('#detail-shell') || state.root;
  const { c, client } = state;
  if (!c) return;
  const stage = STAGE_BY_KEY[c.stage] || STAGES[0];
  const tab = state.tab;
  shell.innerHTML = `
    <div class="detail-head reveal">
      <a class="back-link" href="#/cases">${UI.icon('chevron-left')} Pipeline</a>
      <div class="detail-title-row">
        <div class="detail-title">
          <div class="dt-no">${esc(c.caseNo)} ${c.priority === 'high' ? '<span class="chip chip-danger">High priority</span>' : ''}</div>
          <h1>${esc(client?.name || 'Client removed')}${state.members.length ? `<span class="muted"> + ${state.members.length} family</span>` : ''}</h1>
          <div class="dt-sub"><span class="flag big">${esc(c.flag || '')}</span> ${esc(c.countryName)} · ${esc(c.visaName)} ${c.visaCategory ? `<span class="chip chip-neutral">${esc(VISA_CATEGORIES[c.visaCategory] || '')}</span>` : ''}</div>
        </div>
        <div class="detail-actions">
          <label class="stage-select"><span class="sr-only">Stage</span>
            <span class="stage-pill" style="--stage:${stage.color}">${UI.icon(stage.icon)}</span>
            <select name="stage" class="input" aria-label="Move stage">${STAGES.map((s) => `<option value="${s.key}" ${s.key === c.stage ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
          </label>
          <button class="btn btn-ghost" data-act="whatsapp" title="Send an update on WhatsApp">${UI.icon('whatsapp')}<span class="hide-sm">WhatsApp</span></button>
          <button class="btn btn-ghost" data-act="print-file" title="Print file cover sheet">${UI.icon('printer')}<span class="hide-sm">Print</span></button>
          <div class="dropdown-wrap">
            <button class="btn btn-ghost icon-only" data-act="more" aria-label="More actions">${UI.icon('three-dots')}</button>
            <div class="menu" hidden data-menu>
              <button data-act="edit">${UI.icon('pencil')} Edit file details</button>
              <button data-act="decision">${UI.icon('award')} Record decision</button>
              <button data-act="add-applicant">${UI.icon('person-plus')} Add family member</button>
              <button data-act="withdraw">${UI.icon('dash-circle')} Mark withdrawn</button>
              <button data-act="delete-case" class="danger">${UI.icon('trash')} Delete file</button>
            </div>
          </div>
        </div>
      </div>
      ${c.outcome === 'refused' ? `<div class="notice notice-danger">${UI.icon('x-octagon')}<span>Refused on ${fmtDate(c.outcomeDate)}${c.refusalReason ? `: ${esc(c.refusalReason)}` : ''}. Refusals stay in the client's history.</span></div>` : ''}
      ${c.outcome === 'approved' ? `<div class="notice notice-ok">${UI.icon('award')}<span>Approved${c.visaFrom ? ` · valid ${fmtDate(c.visaFrom)} to ${fmtDate(c.visaTo)}` : ''}</span></div>` : ''}
    </div>

    <div class="detail-grid">
      <div class="detail-main">
        ${UI.tabStrip(TABS.map(([k, l, ic]) => ({ key: k, label: l, icon: ic, count: k === 'documents' ? state.prog.missing : k === 'payments' ? state.payments.filter((p) => !p.voided).length : k === 'appointments' ? state.appts.filter((a) => a.status === 'scheduled').length : undefined })), tab, `#/cases/${encodeURIComponent(c.id)}/`)}
        <div class="tab-body" id="tab-body">${tabHTML(state, tab)}</div>
      </div>
      <aside class="detail-side">
        ${summaryHTML(state)}
      </aside>
    </div>`;
  UI.animateCounts(shell);
  shell.querySelectorAll('.progress-fill').forEach((el) => { el.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = el.style.getPropertyValue('--w'); })); });
}

function summaryHTML(state) {
  const { c, money: m, prog, partner } = state;
  const commission = partner ? (c.commissionOverride ?? partner.commissionValue) : null;
  const comText = partner ? (partner.commissionType === 'fixed' ? `${money(commission)} fixed` : `${commission}% of consultancy fee`) : '';
  return `<div class="side-card reveal">
    <div class="side-head"><span>Fees</span><span class="muted small">${esc(c.feeNote ? '' : '')}</span></div>
    <dl class="kv">
      <div><dt>Consultancy</dt><dd>${money(c.fees.consultancy)}</dd></div>
      <div><dt>Embassy / VFS</dt><dd>${money(c.fees.government)}</dd></div>
      <div><dt>Courier</dt><dd>${money(c.fees.courier)}</dd></div>
      <div><dt>Other</dt><dd>${money(c.fees.other)}</dd></div>
      <div class="kv-total"><dt>Total billed</dt><dd>${money(m.billed)}</dd></div>
      <div><dt>Received</dt><dd class="text-ok">${money(m.paid)}</dd></div>
      <div class="kv-due"><dt>Balance due</dt><dd data-count="${m.due}" data-fmt="money">${money(m.due)}</dd></div>
    </dl>
    <div class="side-actions">
      <button class="btn btn-primary btn-block" data-act="pay">${UI.icon('cash-coin')} Record payment</button>
    </div>
  </div>
  <div class="side-card reveal" style="--d:80ms">
    <div class="side-head"><span>Documents</span><b>${prog.done}/${prog.total}</b></div>
    ${UI.progress(prog.pct, prog.missing ? 'warn' : 'success')}
    <p class="side-note">${prog.missing ? `${prog.missing} required item${prog.missing > 1 ? 's' : ''} still missing.` : 'All required items are in.'} ${prog.verified ? `${prog.verified} verified.` : ''}</p>
  </div>
  <div class="side-card reveal" style="--d:140ms">
    <div class="side-head"><span>Key dates</span></div>
    <dl class="kv">
      <div><dt>Travel</dt><dd>${c.travelDate ? fmtDate(c.travelDate) : '—'}</dd></div>
      <div><dt>Return</dt><dd>${c.returnDate ? fmtDate(c.returnDate) : '—'}</dd></div>
      <div><dt>Opened</dt><dd>${fmtDate(c.createdAt.slice(0, 10))}</dd></div>
      <div><dt>Stage since</dt><dd>${fmtDate((c.stageChangedAt || '').slice(0, 10))}</dd></div>
    </dl>
    ${partner ? `<div class="partner-line">${UI.icon('diagram-3')} <span>Referred by <b>${esc(partner.name)}</b> · ${esc(comText)}</span></div>` : ''}
    <div class="side-note">Handled by ${esc(c.assignee || 'unassigned')}</div>
  </div>`;
}

function tabHTML(state, tab) {
  switch (tab) {
    case 'documents': return docsTab(state);
    case 'appointments': return apptTab(state);
    case 'payments': return payTab(state);
    case 'timeline': return timelineTab(state);
    default: return overviewTab(state);
  }
}

function overviewTab(state) {
  const { c, client, members, country, settings } = state;
  const stageIdx = STAGE_INDEX[c.stage] ?? 0;
  const applicants = [client, ...members].filter(Boolean);
  const upcoming = state.appts.filter((a) => a.status === 'scheduled').slice(0, 4);
  return `
    <section class="panel reveal">
      <div class="panel-head"><h2>Applicants</h2><button class="btn btn-sm btn-ghost" data-act="add-applicant">${UI.icon('person-plus')} Add</button></div>
      <div class="applicant-list">
        ${applicants.map((p, i) => {
          const warn = D.passportIssue(p, c.travelDate, settings.minPassportMonths);
          return `<div class="applicant">${UI.avatar(p.name, i)}
            <div class="applicant-text"><b>${esc(p.name)}</b><small>${i === 0 ? 'Main applicant' : 'Family member'} · ${esc(p.phone || 'no phone')}${p.passportNo ? ` · Passport ${esc(p.passportNo)}` : ''}</small>
              ${warn ? `<div class="warn-text">${UI.icon('exclamation-triangle')} ${esc(warn)}</div>` : ''}
            </div>
            <div class="applicant-act">
              ${waLink(p.phone, '') ? `<a class="icon-btn" href="${waLink(p.phone, '')}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(p.name)}">${UI.icon('whatsapp')}</a>` : ''}
              ${i > 0 ? `<button class="icon-btn" data-act="remove-applicant" data-id="${esc(p.id)}" aria-label="Remove">${UI.icon('x-lg')}</button>` : ''}
            </div></div>`;
        }).join('')}
      </div>
    </section>

    <section class="panel reveal" style="--d:60ms">
      <div class="panel-head"><h2>Stage</h2><span class="muted small">${stageIdx + 1} of ${STAGES.length}</span></div>
      <ol class="stepper">
        ${STAGES.map((s, i) => `<li class="${i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}">
          <button type="button" data-act="set-stage" data-stage="${s.key}" class="step-btn" style="--stage:${s.color}">
            <span class="step-dot">${i < stageIdx ? UI.icon('check-lg') : UI.icon(s.icon)}</span>
            <span class="step-text"><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></span>
          </button></li>`).join('')}
      </ol>
    </section>

    <section class="panel reveal" style="--d:120ms">
      <div class="panel-head"><h2>File details</h2><button class="btn btn-sm btn-ghost" data-act="edit">${UI.icon('pencil')} Edit</button></div>
      <dl class="kv two">
        <div><dt>Purpose</dt><dd>${esc(c.purpose || '—')}</dd></div>
        <div><dt>Centre / embassy</dt><dd>${esc(c.embassy || '—')}</dd></div>
        <div><dt>Travel date</dt><dd>${c.travelDate ? fmtDate(c.travelDate) : '—'}</dd></div>
        <div><dt>Return date</dt><dd>${c.returnDate ? fmtDate(c.returnDate) : '—'}</dd></div>
        <div><dt>Team</dt><dd>${esc(c.assignee || '—')}</dd></div>
        <div><dt>Visa category</dt><dd>${esc(VISA_CATEGORIES[c.visaCategory] || '—')}</dd></div>
      </dl>
      ${country?.notes || state.country ? `<div class="guidance">${UI.icon('lightbulb')}<div><b>Guidance (verify before filing)</b><p>${esc(country?.notes || '')}</p>${findVisaNote(country, c.visaKey)}</div></div>` : ''}
    </section>

    <section class="panel reveal" style="--d:180ms">
      <div class="panel-head"><h2>Decision</h2>${c.outcome !== 'pending' ? UI.outcomeChip(c.outcome) : ''}</div>
      <p class="muted">${c.outcome === 'pending' ? 'No decision yet. Record it when the embassy or VFS replies.' : `Recorded on ${fmtDate(c.outcomeDate)}.`}</p>
      <button class="btn btn-ghost" data-act="decision">${UI.icon('award')} ${c.outcome === 'pending' ? 'Record decision' : 'Change decision'}</button>
    </section>

    ${upcoming.length ? `<section class="panel reveal" style="--d:220ms"><div class="panel-head"><h2>Next appointments</h2></div>
      ${upcoming.map((a) => `<div class="mini-row">${UI.icon('calendar-event')}<div><b>${esc(a.type)}</b><small>${fmtDate(a.date)}${a.time ? ` · ${esc(a.time)}` : ''} ${a.location ? `· ${esc(a.location)}` : ''}</small></div>${relChip(a.date)}</div>`).join('')}</section>` : ''}
  `;
}

function findVisaNote(country, visaKey) {
  const v = country?.visaTypes?.find((x) => x.key === visaKey);
  return v?.notes ? `<p class="muted small">${esc(v.notes)}</p>` : '';
}

function relChip(iso) {
  const r = relDays(iso);
  return `<span class="chip chip-${r.tone === 'danger' ? 'danger' : r.tone === 'warn' ? 'warn' : 'neutral'}">${esc(r.text)}</span>`;
}

function docsTab(state) {
  const { c, docs, files, client, members, prog, settings } = state;
  const applicants = [client, ...members].filter(Boolean);
  const byDoc = groupBy(files, (f) => f.docId);
  const section = (title, list, sub = '') => `
    <section class="doc-section">
      <div class="doc-section-head"><h3>${esc(title)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      ${list.length ? list.map((d) => docRow(d, byDoc[d.id] || [], c, applicants)).join('') : '<div class="muted-note">Nothing here.</div>'}
    </section>`;
  const sharedDocs = docs.filter((d) => d.scope === 'case');
  return `
    <div class="doc-toolbar">
      <div class="doc-progress">${UI.progress(prog.pct, prog.missing ? 'warn' : 'success')}
        <small><b>${prog.done}</b> of ${prog.total} required items ready · ${prog.verified} verified${prog.missing ? ` · <span class="text-warn">${prog.missing} missing</span>` : ''}</small></div>
      <button class="btn btn-ghost btn-sm" data-act="add-doc">${UI.icon('plus-lg')} Add item</button>
    </div>
    ${applicants.map((p, i) => section(i === 0 ? `${p.name} (main applicant)` : p.name, docs.filter((d) => d.scope === 'person' && d.clientId === p.id), 'Personal documents')).join('')}
    ${section('Whole file', sharedDocs, 'Shared by all applicants')}
    <input type="file" id="doc-input" hidden multiple accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp">
    <p class="hint-line">${UI.icon('info-circle')} Photos are compressed on this device. Max ${CONFIG.MAX_UPLOAD_MB} MB per file. Keep originals safe; upload clear scans.</p>`;
}

function docRow(d, files, c, applicants) {
  const st = DOC_STATUS[d.status] || DOC_STATUS.missing;
  const owner = applicants.find((a) => a.id === d.clientId);
  return `<article class="doc-row st-${d.status} ${d.required ? '' : 'optional'}" data-doc="${esc(d.id)}">
    <div class="doc-main">
      <span class="doc-ic chip-${st.tone}">${UI.icon(st.icon)}</span>
      <div class="doc-text">
        <b>${esc(d.label)}${d.required ? '' : ' <span class="opt">optional</span>'}</b>
        <small>${esc(d.category)}${owner && d.scope === 'person' ? ` · ${esc(owner.name)}` : ''} ${files.length ? `· ${files.length} file${files.length > 1 ? 's' : ''}` : ''}</small>
      </div>
      <div class="doc-controls">
        <select class="input input-sm doc-status" data-doc-status="${esc(d.id)}" aria-label="Status of ${esc(d.label)}">
          ${Object.entries(DOC_STATUS).map(([k, v]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
        <button class="icon-btn" data-act="upload" data-doc="${esc(d.id)}" aria-label="Upload file" title="Upload">${UI.icon('cloud-arrow-up')}</button>
        <button class="icon-btn" data-act="doc-edit" data-doc="${esc(d.id)}" aria-label="Edit item" title="Note / delete">${UI.icon('three-dots-vertical')}</button>
      </div>
    </div>
    ${d.attestable ? `<div class="attest">${ATTEST_STEPS.map(([k, l]) => `<button type="button" class="attest-step ${d.attest?.includes(k) ? 'on' : ''}" data-act="attest" data-doc="${esc(d.id)}" data-step="${k}">${d.attest?.includes(k) ? UI.icon('check-circle-fill') : UI.icon('circle')} ${esc(l)}</button>`).join('')}</div>` : ''}
    ${d.note ? `<div class="doc-note">${UI.icon('sticky')} ${esc(d.note)}</div>` : ''}
    ${files.length ? `<ul class="file-list">${files.map((f) => `<li>
        <button class="file-chip" data-act="preview" data-file="${esc(f.id)}">${UI.icon(f.type?.startsWith('image') ? 'image' : 'file-earmark-pdf')}<span>${esc(f.name)}</span><small>${fileSize(f.size)}</small></button>
        <button class="icon-btn sm" data-act="file-del" data-file="${esc(f.id)}" aria-label="Delete file">${UI.icon('trash')}</button></li>`).join('')}</ul>` : ''}
  </article>`;
}

function apptTab(state) {
  const { appts } = state;
  return `
    <div class="doc-toolbar"><div><h2 class="h5 mb-0">Appointments</h2><small class="muted">VFS, embassy, biometrics and pickups for this file</small></div>
      <button class="btn btn-primary btn-sm" data-act="add-appt">${UI.icon('plus-lg')} Add</button></div>
    ${appts.length ? `<div class="list-stack">${appts.map((a) => {
      const [label, tone] = APPT_STATUS[a.status] || APPT_STATUS.scheduled;
      return `<article class="appt-row st-${a.status}">
        <div class="appt-date"><b>${a.date ? esc(a.date.slice(8, 10)) : '—'}</b><small>${a.date ? esc(new Date(a.date).toLocaleString('en-GB', { month: 'short' })) : ''}</small></div>
        <div class="appt-text"><b>${esc(a.type)}</b><small>${fmtDate(a.date)}${a.time ? ` · ${esc(a.time)}` : ''}${a.location ? ` · ${esc(a.location)}` : ''}</small>
          ${a.bookingRef ? `<small>Ref: ${esc(a.bookingRef)}</small>` : ''}${a.note ? `<small>${esc(a.note)}</small>` : ''}</div>
        <div class="appt-act">
          <span class="chip chip-${tone}">${esc(label)}</span>
          ${a.status === 'scheduled' ? `<button class="icon-btn sm" data-act="appt-status" data-id="${esc(a.id)}" data-status="done" title="Mark done">${UI.icon('check-lg')}</button>
          <button class="icon-btn sm" data-act="appt-status" data-id="${esc(a.id)}" data-status="missed" title="Missed">${UI.icon('x-lg')}</button>` : ''}
          <button class="icon-btn sm" data-act="appt-del" data-id="${esc(a.id)}" title="Delete">${UI.icon('trash')}</button>
        </div></article>`;
    }).join('')}</div>` : UI.emptyState({ iconName: 'calendar2', title: 'No appointments yet', text: 'Add the VFS slot, biometrics or interview date so nobody misses it.' })}`;
}

function payTab(state) {
  const { payments, money: m, c } = state;
  const active = payments.filter((p) => !p.voided);
  return `
    <div class="pay-summary">
      <div><small>Billed</small><b>${money(m.billed)}</b></div>
      <div><small>Received</small><b class="text-ok">${money(m.paid)}</b></div>
      <div><small>Due</small><b class="${m.due > 0 ? 'text-warn' : ''}">${money(m.due)}</b></div>
    </div>
    <div class="doc-toolbar"><span class="muted small">${active.length} payment${active.length === 1 ? '' : 's'} on record</span>
      <div class="row-gap"><button class="btn btn-ghost btn-sm" data-act="print-statement">${UI.icon('printer')} Statement</button>
      <button class="btn btn-primary btn-sm" data-act="pay">${UI.icon('plus-lg')} Record payment</button></div></div>
    ${payments.length ? `<div class="list-stack">${payments.map((p) => `<article class="pay-row ${p.voided ? 'voided' : ''}">
        <div class="pay-ic">${UI.icon(p.voided ? 'slash-circle' : 'receipt')}</div>
        <div class="pay-text"><b>${money(p.amount)} <span class="chip chip-neutral">${esc(p.method)}</span></b>
          <small>${fmtDate(p.date)} · ${esc(p.receiptNo || '')}${p.reference ? ` · Ref ${esc(p.reference)}` : ''}</small>
          ${p.note ? `<small>${esc(p.note)}</small>` : ''}${p.voided ? `<small class="text-danger">Voided${p.voidReason ? `: ${esc(p.voidReason)}` : ''}</small>` : ''}</div>
        <div class="pay-act">
          ${p.voided ? '' : `<button class="icon-btn sm" data-act="print-receipt" data-id="${esc(p.id)}" title="Print receipt">${UI.icon('printer')}</button>
          <button class="icon-btn sm" data-act="void-pay" data-id="${esc(p.id)}" title="Void">${UI.icon('x-circle')}</button>`}
        </div></article>`).join('')}</div>` : UI.emptyState({ iconName: 'cash-coin', title: 'No payments yet', text: `Fees are ${money(m.billed)}. Record each amount received, with the method used.` })}
    ${c.feeNote ? `<p class="hint-line">${UI.icon('info-circle')} ${esc(c.feeNote)}</p>` : ''}`;
}

function timelineTab(state) {
  const { events } = state;
  const icons = { stage: 'arrow-right-circle', doc: 'file-earmark-check', payment: 'cash-coin', appointment: 'calendar-check', note: 'chat-left-text', decision: 'award', system: 'gear' };
  return `
    <form class="note-form" data-form="note">
      <textarea class="input" name="text" rows="2" placeholder="Add a note: call summary, client promise, what they said…" required></textarea>
      <button class="btn btn-primary" type="submit">${UI.icon('send')} Add note</button>
    </form>
    ${events.length ? `<ol class="timeline">${events.map((e) => `<li class="tl-${e.kind}">
        <span class="tl-dot">${UI.icon(icons[e.kind] || 'dot')}</span>
        <div class="tl-body"><div>${esc(e.text)}</div><small>${fmtDateTime(e.at)}</small></div></li>`).join('')}</ol>`
      : UI.emptyState({ iconName: 'clock-history', title: 'No activity yet' })}`;
}

// ---------- events ----------
async function onClick(e, state) {
  const menuBtn = e.target.closest('[data-act="more"]');
  if (menuBtn) {
    const menu = menuBtn.parentElement.querySelector('[data-menu]');
    menu.hidden = !menu.hidden;
    return;
  }
  const actEl = e.target.closest('[data-act]');
  if (!actEl) {
    document.querySelectorAll('[data-menu]').forEach((m) => { m.hidden = true; });
    return;
  }
  const act = actEl.dataset.act;
  document.querySelectorAll('[data-menu]').forEach((m) => { m.hidden = true; });
  const c = state.c;
  const reload = () => load(state);
  try {
    switch (act) {
      case 'edit': return Forms.openCaseForm({ caseRec: c, onSaved: reload });
      case 'pay': return Forms.openPaymentForm({ caseId: c.id, onSaved: reload });
      case 'decision': return Forms.openOutcomeForm(c, { onSaved: reload });
      case 'add-applicant': return pickApplicant(state, reload);
      case 'remove-applicant': {
        const ok = await UI.confirmDialog('Remove this person from the file? Their personal documents will be removed too.', { okLabel: 'Remove', danger: true });
        if (!ok) return;
        await D.removeApplicant(c.id, actEl.dataset.id);
        UI.toast('Applicant removed');
        return reload();
      }
      case 'withdraw': {
        const ok = await UI.confirmDialog('Mark this file as withdrawn? It stays on record and leaves the active pipeline.', { okLabel: 'Mark withdrawn', danger: true });
        if (!ok) return;
        await D.setOutcome(c.id, 'withdrawn');
        return reload();
      }
      case 'delete-case': {
        const ok = await UI.confirmDialog('Delete this file and all its documents, files and appointments? This cannot be undone.', { okLabel: 'Delete file', danger: true });
        if (!ok) return;
        try { await D.deleteCase(c.id); } catch (err) { return UI.toast(err.message, 'danger', 6000); }
        UI.toast('File deleted', 'info');
        return state.ctx.navigate('#/cases');
      }
      case 'set-stage': return setStage(state, actEl.dataset.stage);
      case 'whatsapp': return whatsappSheet(state);
      case 'print-file': return printFileSheet(state);
      case 'print-statement': return printStatement(state);
      case 'print-receipt': { const { printReceipt } = await import('./money.js'); return printReceipt(actEl.dataset.id); }
      case 'void-pay': {
        const reason = await UI.askText({ title: 'Void payment', label: 'Reason (kept on record)', value: 'Entered by mistake', okLabel: 'Void payment' });
        if (reason === null) return;
        await D.voidPayment(actEl.dataset.id, reason);
        UI.toast('Payment voided', 'info');
        return reload();
      }
      case 'add-doc': return Forms.openCustomDocForm(c, { applicants: [state.client, ...state.members].filter(Boolean), onSaved: reload });
      case 'upload': return triggerUpload(state, actEl.dataset.doc);
      case 'attest': await D.toggleAttest(actEl.dataset.doc, actEl.dataset.step); return reload();
      case 'preview': return previewFile(actEl.dataset.file);
      case 'file-del': {
        const ok = await UI.confirmDialog('Delete this file? The document status stays as it is.', { okLabel: 'Delete', danger: true });
        if (!ok) return;
        await D.deleteFile(actEl.dataset.file);
        UI.toast('File deleted', 'info');
        return reload();
      }
      case 'doc-edit': return docEditSheet(state, actEl.dataset.doc, reload);
      case 'add-appt': return Forms.openAppointmentForm({ caseId: c.id, onSaved: reload });
      case 'appt-status': await D.setAppointmentStatus(actEl.dataset.id, actEl.dataset.status); return reload();
      case 'appt-del': {
        const ok = await UI.confirmDialog('Delete this appointment?', { okLabel: 'Delete', danger: true });
        if (!ok) return;
        await D.deleteAppointment(actEl.dataset.id);
        return reload();
      }
      default: return undefined;
    }
  } catch (err) {
    UI.toast(err.message || 'Something went wrong', 'danger', 5200);
  }
}

async function onChange(e, state) {
  const t = e.target;
  if (t.matches('select[name=stage]')) return setStage(state, t.value);
  if (t.matches('[data-doc-status]')) {
    await D.setDocStatus(t.dataset.docStatus, t.value);
    UI.toast('Status updated');
    return load(state);
  }
  if (t.matches('#doc-input')) {
    const docId = t.dataset.doc;
    if (!t.files?.length || !docId) return;
    try {
      const n = await D.addFiles(docId, t.files);
      UI.toast(`${n} file${n === 1 ? '' : 's'} saved on this device`);
    } catch (err) {
      UI.toast(err.message, 'danger', 5200);
    } finally {
      t.value = '';
      t.dataset.doc = '';
    }
    return load(state);
  }
}

async function onSubmit(e, state) {
  const form = e.target.closest('[data-form="note"]');
  if (!form) return;
  e.preventDefault();
  const text = form.text.value.trim();
  if (!text) return;
  await D.addNote(state.c.id, text);
  UI.toast('Note added');
  load(state);
}

async function setStage(state, stage) {
  if (stage === state.c.stage) return;
  if (stage === 'decided' && state.c.outcome === 'pending') {
    UI.toast('Record the decision as well, so the file shows Approved or Refused.', 'info', 4800);
  }
  const note = '';
  await D.moveStage(state.c.id, stage, note);
  UI.toast(`Moved to ${STAGE_BY_KEY[stage].label}`);
  load(state);
}

function triggerUpload(state, docId) {
  const input = state.root.querySelector('#doc-input');
  if (!input) return;
  input.dataset.doc = docId;
  input.value = '';
  input.click();
}

async function pickApplicant(state, reload) {
  const clients = (await D.listClients()).filter((x) => x.id !== state.c.clientId && !state.c.memberIds.includes(x.id));
  if (!clients.length) return UI.toast('Add the family member as a client first.', 'warn', 4800);
  UI.openSheet({
    title: 'Add family member', size: 'md',
    html: `<p class="muted small">They get their own passport, CNIC and photo items on this file.</p>
      <div class="pick-list">${clients.map((x) => `<button type="button" class="pick-row" data-pick="${esc(x.id)}">${UI.avatar(x.name)}<span><b>${esc(x.name)}</b><small>${esc(x.phone || '')}</small></span>${UI.icon('plus-circle')}</button>`).join('')}</div>`,
    onMount: (el, close) => {
      el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
        try { await D.addApplicant(state.c.id, b.dataset.pick); UI.toast('Family member added'); close(); reload(); }
        catch (err) { UI.toast(err.message, 'danger'); }
      }));
    },
  });
}

function docEditSheet(state, docId, reload) {
  const d = state.docs.find((x) => x.id === docId);
  if (!d) return;
  UI.openSheet({
    title: 'Checklist item', size: 'md',
    html: `<form id="doc-edit" class="form-grid"><div class="field field-full"><label class="field-label" for="dnote">Note</label>
      <textarea id="dnote" class="input" name="note" rows="3" placeholder="e.g. Original seen on 3 Nov. Bank has stamped copy.">${esc(d.note || '')}</textarea></div>
      <div class="field field-full"><label class="field-label" for="dlabel">Name</label><input id="dlabel" class="input" name="label" value="${esc(d.label)}"></div>
      <div class="field"><label class="field-label" for="dreq">Needed for submission</label><select id="dreq" class="input" name="required"><option value="1" ${d.required ? 'selected' : ''}>Required</option><option value="0" ${!d.required ? 'selected' : ''}>Optional</option></select></div></form>`,
    footer: `<button type="button" class="btn btn-danger btn-ghost" data-del>${UI.icon('trash')} Remove item</button><span class="grow"></span><button type="button" class="btn btn-primary" data-save>Save</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const f = el.querySelector('#doc-edit');
        await D.updateDoc(docId, { note: f.note.value.trim(), label: f.label.value.trim() || d.label, required: f.required.value === '1' });
        UI.toast('Saved'); close(); reload();
      });
      el.querySelector('[data-del]').addEventListener('click', async () => {
        const ok = await UI.confirmDialog('Remove this checklist item and its files?', { okLabel: 'Remove', danger: true });
        if (!ok) return;
        await D.deleteDoc(docId); close(); UI.toast('Item removed', 'info'); reload();
      });
    },
  });
}

async function previewFile(fileId) {
  const f = await D.getFile(fileId);
  if (!f) return UI.toast('File not found', 'danger');
  const url = URL.createObjectURL(f.blob);
  const isImage = f.type?.startsWith('image/');
  UI.openSheet({
    title: f.name, size: 'lg',
    html: `<div class="preview">${isImage ? `<img src="${url}" alt="${esc(f.name)}">` : f.type === 'application/pdf' ? `<iframe src="${url}" title="${esc(f.name)}"></iframe>` : `<div class="empty"><div class="empty-title">No preview for this file type</div></div>`}</div>`,
    footer: `<button type="button" class="btn btn-ghost" data-dl>${UI.icon('download')} Download</button><span class="grow"></span>`,
    onClose: () => URL.revokeObjectURL(url),
    onMount: (el) => el.querySelector('[data-dl]').addEventListener('click', () => downloadBlob(f.name, f.blob)),
  });
}

function whatsappSheet(state) {
  const { c, client, prog, settings } = state;
  const missing = state.docs.filter((d) => d.required && (d.status === 'missing' || d.status === 'rejected')).slice(0, 8).map((d) => `• ${d.label}`).join('\n');
  const text = `Assalam o Alaikum ${client?.name?.split(' ')[0] || ''},\n\nUpdate on your ${c.countryName} (${c.visaName}) file ${c.caseNo}:\nCurrent stage: ${STAGE_BY_KEY[c.stage].label}.\n${prog.missing ? `\nPlease send these documents:\n${missing}\n` : '\nAll required documents are received. Thank you.\n'}\nRegards,\n${settings.agencyName || ''}${settings.phone ? `\n${settings.phone}` : ''}`;
  const link = waLink(client?.phone, text);
  UI.openSheet({
    title: 'WhatsApp update', size: 'md',
    html: `<p class="muted small">Edit the message, then open WhatsApp. The app does not send anything by itself.</p>
      <div class="field field-full"><label class="field-label" for="wa-text">Message</label><textarea id="wa-text" class="input" rows="9">${esc(text)}</textarea></div>`,
    footer: link ? `<button type="button" class="btn btn-ghost" data-close>Close</button><a class="btn btn-primary" id="wa-open" href="${link}" target="_blank" rel="noopener">${UI.icon('whatsapp')} Open WhatsApp</a>` : `<span class="muted small">Add a valid mobile number to this client first.</span>`,
    onMount: (el) => {
      const ta = el.querySelector('#wa-text'); const a = el.querySelector('#wa-open');
      if (a) ta.addEventListener('input', () => { a.href = waLink(client?.phone, ta.value); });
    },
  });
}

function printFileSheet(state) {
  const { c, client, members, docs, settings, money: m, country } = state;
  const all = [client, ...members].filter(Boolean);
  const docRows = (list) => list.map((d) => `<tr><td class="box">${['received', 'verified'].includes(d.status) ? '☑' : '☐'}</td><td>${esc(d.label)}${d.required ? '' : ' <i>(optional)</i>'}</td><td>${esc(DOC_STATUS[d.status]?.label || '')}</td></tr>`).join('');
  const html = `${printHead(settings, `<b>File cover sheet</b><br>${esc(c.caseNo)}<br>${fmtDate(new Date().toISOString().slice(0, 10))}`)}
    <h2 class="print-h">${esc(c.countryName)} · ${esc(c.visaName)}</h2>
    <table class="print-table"><tbody>
      <tr><th>Applicants</th><td>${all.map((p) => esc(p.name)).join(', ')}</td></tr>
      <tr><th>Purpose</th><td>${esc(c.purpose || '—')}</td></tr>
      <tr><th>Travel / return</th><td>${c.travelDate ? fmtDate(c.travelDate) : '—'} / ${c.returnDate ? fmtDate(c.returnDate) : '—'}</td></tr>
      <tr><th>Centre</th><td>${esc(c.embassy || '—')}</td></tr>
      <tr><th>Fees</th><td>Consultancy ${money(c.fees.consultancy)} · Embassy/VFS ${money(c.fees.government)} · Courier ${money(c.fees.courier)} · Other ${money(c.fees.other)} · <b>Total ${money(m.billed)}</b> · Paid ${money(m.paid)} · <b>Due ${money(m.due)}</b></td></tr>
    </tbody></table>
    <h3 class="print-h3">Document checklist</h3>
    <table class="print-table"><thead><tr><th>✓</th><th>Document</th><th>Status</th></tr></thead><tbody>${docRows(docs)}</tbody></table>
    ${country?.notes ? `<p class="print-note"><b>Note:</b> ${esc(country.notes)}</p>` : ''}
    <p class="print-note">${esc(settings.refundPolicy || '')}</p>
    <div class="print-sign"><div>Client signature</div><div>Consultant signature</div></div>`;
  printHTML(html, `File ${c.caseNo}`);
}

async function printStatement(state) {
  const { c, settings, payments } = state;
  const active = payments.filter((p) => !p.voided);
  const html = `${printHead(settings, `<b>Account statement</b><br>${esc(c.caseNo)}<br>${fmtDate(todayISO())}`)}
    <h2 class="print-h">${esc(state.client?.name || '')}</h2>
    <table class="print-table"><tbody>
      <tr><th>Total fees</th><td>${money(state.money.billed)}</td></tr>
      <tr><th>Received</th><td>${money(state.money.paid)}</td></tr>
      <tr><th>Balance due</th><td><b>${money(state.money.due)}</b></td></tr>
    </tbody></table>
    <h3 class="print-h3">Payments</h3>
    <table class="print-table"><thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th class="num">Amount</th></tr></thead>
      <tbody>${active.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.receiptNo)}</td><td>${esc(p.method)}</td><td class="num">${money(p.amount)}</td></tr>`).join('') || '<tr><td colspan="4">No payments yet</td></tr>'}</tbody></table>
    <p class="print-note">${esc(settings.receiptFooter || '')}</p>`;
  printHTML(html, `Statement ${c.caseNo}`);
}
