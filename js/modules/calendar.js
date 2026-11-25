// Agenda: appointments (VFS slots, interviews, pickups) and follow-up tasks, grouped by when they fall.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, todayISO, diffDays, fmtDate } from '../core/utils.js';
import { APPT_STATUS } from '../core/constants.js';
import * as Forms from './forms.js';

const STATE = { kind: 'all', range: 'upcoming' };

export async function render(root, ctx) {
  ctx.setTitle('Calendar');
  const [appts, tasks, cases, clients] = await Promise.all([D.listAppointments(), D.listTasks(), D.listCases(), D.listClients()]);
  const caseById = Object.fromEntries(cases.map((c) => [c.id, c]));
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const today = todayISO();

  const items = [
    ...appts.filter((a) => a.status === 'scheduled' || STATE.range === 'all').map((a) => ({ kind: 'appt', id: a.id, date: a.date, time: a.time || '', title: a.type, sub: [a.location, a.bookingRef && `Ref ${a.bookingRef}`, a.note].filter(Boolean).join(' · '), rec: a })),
    ...tasks.filter((t) => !t.done || STATE.range === 'all').map((t) => ({ kind: 'task', id: t.id, date: t.due || today, time: '', title: t.title, sub: t.priority === 'high' ? 'High priority' : '', rec: t })),
  ].filter((i) => STATE.kind === 'all' || (STATE.kind === 'appt' ? i.kind === 'appt' : i.kind === 'task'))
    .filter((i) => STATE.range === 'all' || (STATE.range === 'upcoming' ? diffDays(today, i.date) <= 60 : true))
    .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));

  const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [], past: [] };
  for (const i of items) {
    const n = diffDays(today, i.date);
    if (i.kind === 'task' && i.rec.done) groups.past.push(i);
    else if (n < 0) groups.overdue.push(i);
    else if (n === 0) groups.today.push(i);
    else if (n === 1) groups.tomorrow.push(i);
    else if (n <= 7) groups.week.push(i);
    else if (n > 7) groups.later.push(i);
  }
  const labels = { overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'Later this week', later: 'Coming up', past: 'Done' };

  const row = (i) => {
    const c = i.rec.caseId ? caseById[i.rec.caseId] : null;
    const cl = c ? clientById[c.clientId] : (i.rec.clientId ? clientById[i.rec.clientId] : null);
    if (i.kind === 'appt') {
      const [label, tone] = APPT_STATUS[i.rec.status] || APPT_STATUS.scheduled;
      return `<article class="agenda-row kind-appt st-${i.rec.status}">
        <div class="ag-time"><b>${i.time ? esc(i.time) : '—'}</b><small>${esc(fmtDate(i.date).slice(0, 6))}</small></div>
        <div class="ag-text"><b>${esc(i.title)}</b><small>${cl ? esc(cl.name) : 'General'}${c ? ` · ${esc(c.caseNo)}` : ''}</small>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</div>
        <div class="ag-act">
          <span class="chip chip-${tone}">${esc(label)}</span>
          ${i.rec.status === 'scheduled' ? `<button class="icon-btn" data-appt="${esc(i.id)}" data-status="done" aria-label="Mark done">${UI.icon('check-lg')}</button>
          <button class="icon-btn" data-appt="${esc(i.id)}" data-status="missed" aria-label="Missed">${UI.icon('x-lg')}</button>` : ''}
        </div></article>`;
    }
    return `<article class="agenda-row kind-task ${i.rec.done ? 'done' : ''}">
      <div class="ag-time"><span class="task-ic">${UI.icon('check2-square')}</span></div>
      <div class="ag-text"><b>${esc(i.title)}</b><small>${cl ? esc(cl.name) : 'Task'}${c ? ` · ${esc(c.caseNo)}` : ''} · due ${esc(fmtDate(i.date))}</small>${i.sub ? `<small class="text-danger">${esc(i.sub)}</small>` : ''}</div>
      <div class="ag-act">
        <button class="icon-btn" data-task="${esc(i.id)}" aria-label="${i.rec.done ? 'Reopen' : 'Mark done'}">${UI.icon(i.rec.done ? 'arrow-counterclockwise' : 'check-lg')}</button>
        <button class="icon-btn" data-task-del="${esc(i.id)}" aria-label="Delete">${UI.icon('trash')}</button>
      </div></article>`;
  };

  const sections = Object.entries(groups).filter(([, list]) => list.length).map(([k, list], idx) => `
    <section class="agenda-group reveal" style="--d:${idx * 60}ms">
      <h2 class="ag-head ${k}">${esc(labels[k])} <span class="count">${list.length}</span></h2>
      <div class="agenda-list">${list.map(row).join('')}</div>
    </section>`).join('');

  root.innerHTML = `
    ${UI.pageHead({
      title: 'Calendar & tasks',
      sub: `${groups.today.length} today · ${groups.overdue.length} overdue`,
      actions: `<button class="btn btn-ghost" data-add="task">${UI.icon('check2-square')} Task</button>
        <button class="btn btn-primary" data-add="appt">${UI.icon('calendar-plus')} Appointment</button>`,
    })}
    <div class="filter-bar reveal">
      <div class="chip-group" role="group" aria-label="Type">
        ${[['all', 'Everything'], ['appt', 'Appointments'], ['task', 'Tasks']].map(([k, l]) => `<button type="button" class="filter-chip ${STATE.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}
      </div>
      <div class="chip-group" role="group" aria-label="Range">
        ${[['upcoming', 'Next 60 days'], ['all', 'Include past']].map(([k, l]) => `<button type="button" class="filter-chip ${STATE.range === k ? 'on' : ''}" data-range="${k}">${l}</button>`).join('')}
      </div>
    </div>
    ${items.length ? sections : UI.emptyState({ iconName: 'calendar2-check', title: 'Nothing scheduled', text: 'Book VFS slots, embassy interviews, biometrics and follow-up calls here so nothing slips.', action: '<button class="btn btn-primary" data-add="appt">Add appointment</button>' })}
  `;

  root.onclick = async (e) => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) return add.dataset.add === 'task' ? Forms.openTaskForm({ onSaved: () => ctx.refresh() }) : Forms.openAppointmentForm({ onSaved: () => ctx.refresh() });
    const kind = t.closest('[data-kind]');
    if (kind) { STATE.kind = kind.dataset.kind; return ctx.refresh(); }
    const range = t.closest('[data-range]');
    if (range) { STATE.range = range.dataset.range; return ctx.refresh(); }
    const ap = t.closest('[data-appt]');
    if (ap) { await D.setAppointmentStatus(ap.dataset.appt, ap.dataset.status); UI.toast('Appointment updated'); return ctx.refresh(); }
    const tk = t.closest('[data-task]');
    if (tk) { await D.toggleTask(tk.dataset.task); return ctx.refresh(); }
    const td = t.closest('[data-task-del]');
    if (td) {
      const ok = await UI.confirmDialog('Delete this task?', { okLabel: 'Delete', danger: true });
      if (!ok) return;
      await D.deleteTask(td.dataset.taskDel);
      return ctx.refresh();
    }
  };
}
