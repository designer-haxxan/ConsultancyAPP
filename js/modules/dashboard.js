// Home screen: today's work, pipeline, money and alerts at a glance.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, money, todayISO, diffDays, fmtDate, fmtMonth, monthKey, relDays, greeting, pct, sum, fmtDateTime } from '../core/utils.js';
import { STAGES } from '../core/constants.js';
import * as Forms from './forms.js';

export async function render(root, ctx) {
  ctx.setTitle('Dashboard');
  const data = await D.loadSnapshot();
  const settings = ctx.settings;
  const today = todayISO();
  const thisMonth = monthKey(today);
  const active = data.cases.filter((c) => c.outcome !== 'withdrawn' && c.stage !== 'closed');
  const clientsById = Object.fromEntries(data.clients.map((c) => [c.id, c]));
  const docsByCase = groupBy(data.documents, (d) => d.caseId);
  const validPayments = data.payments.filter((p) => !p.voided);

  // KPIs
  const collectedMonth = sum(validPayments.filter((p) => monthKey(p.date) === thisMonth), (p) => p.amount);
  const outstanding = sum(active, (c) => D.caseMoney(c, validPayments).due);
  const decided = data.cases.filter((c) => ['approved', 'refused'].includes(c.outcome));
  const approved = decided.filter((c) => c.outcome === 'approved').length;
  const approvalRate = pct(approved, decided.length);
  const needDocs = active.filter((c) => D.docProgress(docsByCase[c.id] || []).missing > 0).length;
  const appts = data.appointments.filter((a) => a.status === 'scheduled');
  const weekAppts = appts.filter((a) => { const n = diffDays(today, a.date); return n !== null && n >= 0 && n <= 7; }).length;

  // Needs attention
  const overdueTasks = data.tasks.filter((t) => !t.done && t.due && t.due < today).sort((a, b) => (a.due < b.due ? -1 : 1));
  const dueSoonAppts = appts.filter((a) => { const n = diffDays(today, a.date); return n !== null && n >= 0 && n <= 1; }).sort((a, b) => (a.date + (a.time || '') < b.date + (b.time || '') ? -1 : 1));
  const dueTasks = data.tasks.filter((t) => !t.done && t.due === today);
  const passportAlerts = [];
  for (const c of active) {
    const names = [c.clientId, ...(c.memberIds || [])];
    for (const id of names) {
      const p = clientsById[id];
      const msg = p ? D.passportIssue(p, c.travelDate, settings.minPassportMonths) : null;
      if (msg) passportAlerts.push({ name: p.name, caseNo: c.caseNo, msg, caseId: c.id });
    }
  }
  const missingList = active
    .map((c) => ({ c, prog: D.docProgress(docsByCase[c.id] || []) }))
    .filter((x) => x.prog.missing > 0)
    .sort((a, b) => b.prog.missing - a.prog.missing)
    .slice(0, 5);

  // Funnel
  const stageCounts = STAGES.map((s) => ({ s, n: active.filter((c) => c.stage === s.key).length }));
  const maxStage = Math.max(1, ...stageCounts.map((x) => x.n));

  // Monthly collections, last 6 months
  const months = Array.from({ length: 6 }, (_, i) => monthKey(addMonthsSafe(today, i - 5)));
  const byMonth = months.map((m) => ({ m, v: sum(validPayments.filter((p) => monthKey(p.date) === m), (p) => p.amount) }));
  const maxMonth = Math.max(1, ...byMonth.map((x) => x.v));

  const recent = (await D.listRecentEvents(8));
  const lastBackup = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt)) / 86400000) : null;
  const backupNag = lastBackup === null || lastBackup >= 7;
  const hasClients = data.clients.length > 0;

  const alertCount = overdueTasks.length + dueSoonAppts.length + passportAlerts.length;

  root.innerHTML = `
  <section class="hero-card reveal">
    <div class="hero-orbs" aria-hidden="true"><span></span><span></span></div>
    <div class="hero-text">
      <div class="hero-kicker">${esc(greeting())}, ${esc((settings.ownerName || 'there').split(' ')[0])}</div>
      <h1>${esc(settings.agencyName || 'Your consultancy')} <span class="hero-date">${fmtDate(today)}</span></h1>
      <p>${active.length} active ${active.length === 1 ? 'file' : 'files'} · ${dueSoonAppts.length + dueTasks.length} due today or tomorrow · ${alertCount ? `<b>${alertCount} need attention</b>` : 'nothing overdue'}</p>
    </div>
    <div class="hero-actions">
      <button class="btn btn-light" data-act="new-case">${UI.icon('briefcase')} New visa file</button>
      <button class="btn btn-glass" data-act="pay">${UI.icon('cash-coin')} Record payment</button>
    </div>
  </section>

  ${backupNag && hasClients ? `<div class="notice notice-warn reveal">${UI.icon('cloud-arrow-down')}<span>${lastBackup === null ? 'You have not made a backup yet.' : `Last backup was ${lastBackup} days ago.`} Data lives on this device. <a href="#/settings">Back it up now</a>.</span></div>` : ''}

  <section class="kpi-grid">
    ${UI.statTile({ label: 'Active files', value: active.length, iconName: 'folder2-open', tone: 'brand', count: true, sub: `${stageCounts[0].n} new enquiries` })}
    ${UI.statTile({ label: 'Waiting on documents', value: needDocs, iconName: 'file-earmark-medical', tone: needDocs ? 'warn' : 'success', count: true, sub: 'files with missing items' })}
    ${UI.statTile({ label: 'Appointments this week', value: weekAppts, iconName: 'calendar-week', tone: 'violet', count: true, sub: `${appts.length} scheduled in total` })}
    ${UI.statTile({ label: 'Collected this month', value: collectedMonth, iconName: 'cash-stack', tone: 'success', count: true, isMoney: true, sub: 'payments received' })}
    ${UI.statTile({ label: 'Outstanding balance', value: outstanding, iconName: 'hourglass-top', tone: outstanding ? 'amber' : 'muted', count: true, isMoney: true, sub: 'owed by active files' })}
    ${UI.statTile({ label: 'Approval rate', value: decided.length ? `${approvalRate}%` : '—', iconName: 'award', tone: 'teal', sub: decided.length ? `${approved} of ${decided.length} decisions` : 'no decisions yet' })}
  </section>

  <div class="dash-grid">
    <section class="panel reveal" style="--d:60ms">
      <div class="panel-head"><h2>Needs attention</h2><span class="chip ${alertCount ? 'chip-danger' : 'chip-success'}">${alertCount}</span></div>
      ${attentionList({ overdueTasks, dueSoonAppts, dueTasks, passportAlerts, clientsById, missingList })}
    </section>

    <section class="panel reveal" style="--d:110ms">
      <div class="panel-head"><h2>Pipeline</h2><a class="link-soft" href="#/cases">Open board ${UI.icon('arrow-right')}</a></div>
      <div class="funnel">
        ${stageCounts.map(({ s, n }, i) => `<a class="funnel-row" href="#/cases" style="--stage:${s.color};--d:${i * 50}ms">
          <span class="funnel-ic">${UI.icon(s.icon)}</span>
          <span class="funnel-mid">
            <span class="funnel-label">${esc(s.label)}</span>
            <span class="funnel-bar"><span style="--w:${Math.round((n / maxStage) * 100)}%"></span></span>
          </span>
          <b data-count="${n}">${n}</b></a>`).join('')}
      </div>
    </section>

    <section class="panel reveal" style="--d:160ms">
      <div class="panel-head"><h2>Collections</h2><span class="muted small">last 6 months</span></div>
      <div class="bars" role="img" aria-label="Collections by month">
        ${byMonth.map((x, i) => `<div class="bar-col ${x.m === thisMonth ? 'now' : ''}" style="--i:${i}">
          <span class="bar-val">${x.v ? esc(money(x.v).replace('Rs ', '')) : ''}</span>
          <span class="bar" style="--h:${Math.max(3, Math.round((x.v / maxMonth) * 100))}%"></span>
          <span class="bar-label">${esc(fmtMonth(x.m))}</span></div>`).join('')}
      </div>
    </section>

    <section class="panel reveal" style="--d:210ms">
      <div class="panel-head"><h2>Recent activity</h2></div>
      ${recent.length ? `<ol class="activity">${recent.map((e) => `<li><span class="act-dot kind-${e.kind}"></span><div><div>${esc(e.text)}</div><small>${fmtDateTime(e.at)}</small></div></li>`).join('')}</ol>`
        : `<div class="muted-note">Activity appears here as you work on files.</div>`}
    </section>
  </div>

  ${!hasClients ? `<section class="onboard reveal">
      <h2>Start in three steps</h2>
      <div class="steps3">
        <div><span>1</span><b>Add a client</b><small>Name, CNIC and passport details, as on the documents.</small></div>
        <div><span>2</span><b>Open a visa file</b><small>Pick the country and visa. The checklist is created for you.</small></div>
        <div><span>3</span><b>Record payments</b><small>Print receipts with a sequential number, and send WhatsApp updates.</small></div>
      </div>
      <div class="row-gap mt-3"><button class="btn btn-primary" data-act="new-client">${UI.icon('person-plus')} Add first client</button>
      <a class="btn btn-ghost" href="#/catalog">${UI.icon('globe2')} Review the visa catalogue</a></div>
    </section>` : ''}
  `;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act], [data-task-done], [data-apt-done]');
    if (!b) return;
    if (b.dataset.taskDone) { await D.toggleTask(b.dataset.taskDone); UI.toast('Task done'); return ctx.refresh(); }
    if (b.dataset.aptDone) { await D.setAppointmentStatus(b.dataset.aptDone, b.dataset.status); UI.toast('Appointment updated'); return ctx.refresh(); }
    const act = b.dataset.act;
    if (act === 'new-case') Forms.openCaseForm({ onSaved: () => ctx.refresh() });
    if (act === 'pay') Forms.openPaymentForm({ onSaved: () => ctx.refresh() });
    if (act === 'new-client') Forms.openClientForm({ onSaved: () => ctx.refresh() });
  };
  UI.animateCounts(root);
}

function attentionList({ overdueTasks, dueSoonAppts, dueTasks, passportAlerts, clientsById, missingList }) {
  const rows = [];
  for (const a of dueSoonAppts) {
    const r = relDays(a.date);
    rows.push(`<div class="att-row tone-${r.tone === 'info' ? 'info' : 'warn'}">
      ${UI.icon('calendar-event')}<div class="att-text"><b>${esc(a.type)}</b><small>${esc(r.text)}${a.time ? ` · ${esc(a.time)}` : ''}${a.location ? ` · ${esc(a.location)}` : ''}</small></div>
      <button class="btn btn-sm btn-ghost" data-apt-done="${esc(a.id)}" data-status="done">Done</button></div>`);
  }
  for (const t of dueTasks) {
    rows.push(`<div class="att-row tone-warn">${UI.icon('check2-square')}<div class="att-text"><b>${esc(t.title)}</b><small>Due today</small></div>
      <button class="btn btn-sm btn-ghost" data-task-done="${esc(t.id)}">Done</button></div>`);
  }
  for (const t of overdueTasks.slice(0, 6)) {
    rows.push(`<div class="att-row tone-danger">${UI.icon('exclamation-circle')}<div class="att-text"><b>${esc(t.title)}</b><small>${esc(relDays(t.due).text)}</small></div>
      <button class="btn btn-sm btn-ghost" data-task-done="${esc(t.id)}">Done</button></div>`);
  }
  for (const p of passportAlerts.slice(0, 5)) {
    rows.push(`<a class="att-row tone-warn" href="#/cases/${encodeURIComponent(p.caseId)}">${UI.icon('passport')}<div class="att-text"><b>${esc(p.name)}: passport</b><small>${esc(p.msg)}</small></div>${UI.icon('chevron-right', 'muted')}</a>`);
  }
  for (const x of missingList) {
    const cl = clientsById[x.c.clientId];
    rows.push(`<a class="att-row tone-info" href="#/cases/${encodeURIComponent(x.c.id)}">${UI.icon('folder-x')}<div class="att-text"><b>${esc(cl?.name || 'Client')} · ${esc(x.c.caseNo)}</b><small>${x.prog.missing} document${x.prog.missing > 1 ? 's' : ''} missing</small></div>${UI.icon('chevron-right', 'muted')}</a>`);
  }
  if (!rows.length) return UI.emptyState({ iconName: 'emoji-smile', title: 'All clear', text: 'No overdue tasks, no appointments tomorrow, no passport warnings.' });
  return `<div class="att-list">${rows.join('')}</div>`;
}

function groupBy(list, f) {
  return list.reduce((acc, x) => { (acc[f(x)] ||= []).push(x); return acc; }, {});
}

function addMonthsSafe(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, Math.min(d, 28));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`;
}
