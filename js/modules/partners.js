// Partners and agents: who sends clients, what they earn per file, and what has been paid out.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, money, todayISO, waLink, sum } from '../core/utils.js';
import * as Forms from './forms.js';

export async function render(root, ctx) {
  ctx.setTitle('Partners & agents');
  const [partners, cases, expenses, clients] = await Promise.all([D.listPartners(), D.listCases(), D.listExpenses(), D.listClients()]);
  const clientCount = (pid) => clients.filter((c) => c.partnerId === pid).length;
  const rows = partners.map((p) => ({ p, s: D.partnerCommission(p, cases, expenses), clients: clientCount(p.id) }))
    .sort((a, b) => b.s.payable - a.s.payable || a.p.name.localeCompare(b.p.name));
  const totalPayable = sum(rows, (r) => r.s.payable);
  const totalAccrued = sum(rows, (r) => r.s.accrued);

  root.innerHTML = `
    ${UI.pageHead({
      title: 'Partners & agents',
      sub: 'Sub-agents, travel agents and referrers. Commission is tracked per file, so you know what you owe.',
      actions: `<button class="btn btn-primary" data-act="new">${UI.icon('person-plus')} New partner</button>`,
    })}
    <div class="stat-row reveal">
      <div class="mini-stat"><small>Partners</small><b>${partners.filter((p) => p.active).length}</b></div>
      <div class="mini-stat"><small>Commission earned</small><b>${money(totalAccrued)}</b></div>
      <div class="mini-stat"><small>Payable now</small><b class="${totalPayable ? 'text-warn' : 'text-ok'}">${money(totalPayable)}</b></div>
    </div>
    ${partners.length ? `<div class="partner-grid">${rows.map(({ p, s, clients: n }, i) => {
      const wa = waLink(p.phone, '');
      return `<article class="partner-card reveal ${p.active ? '' : 'inactive'}" style="--d:${i * 40}ms">
        <div class="pc-head">${UI.avatar(p.name, i)}<div><b>${esc(p.name)}</b><small>${esc([p.city, p.served].filter(Boolean).join(' · ') || 'No details')}</small></div>
          ${p.active ? '' : '<span class="chip chip-muted">Inactive</span>'}</div>
        <div class="pc-basis">${p.commissionType === 'fixed' ? `${money(p.commissionValue)} per file` : `${p.commissionValue}% of consultancy fee`}</div>
        <div class="pc-stats">
          <div><small>Files</small><b>${s.cases}</b></div>
          <div><small>Clients</small><b>${n}</b></div>
          <div><small>Earned</small><b>${money(s.accrued)}</b></div>
          <div><small>Paid</small><b>${money(s.paid)}</b></div>
        </div>
        <div class="pc-payable ${s.payable ? 'has' : ''}"><span>Payable</span><b>${money(s.payable)}</b></div>
        <div class="pc-actions">
          ${s.payable > 0 ? `<button class="btn btn-sm btn-primary" data-pay="${esc(p.id)}" data-amount="${s.payable}">${UI.icon('cash-coin')} Record payout</button>` : ''}
          ${wa ? `<a class="icon-btn" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">${UI.icon('whatsapp')}</a>` : ''}
          <button class="icon-btn" data-edit="${esc(p.id)}" aria-label="Edit">${UI.icon('pencil')}</button>
        </div>
      </article>`;
    }).join('')}</div>`
    : UI.emptyState({ iconName: 'diagram-3', title: 'No partners yet', text: 'Add the agents who send you clients. Each file can then carry their commission.', action: '<button class="btn btn-primary" data-act="new">Add partner</button>' })}
    <p class="hint-line">${UI.icon('info-circle')} Commission is earned on files that are not refused or withdrawn. Record a payout when you pay the partner; it becomes an expense.</p>
  `;

  const byId = Object.fromEntries(rows.map((r) => [r.p.id, r]));
  root.onclick = (e) => {
    const t = e.target;
    if (t.closest('[data-act="new"]')) return Forms.openPartnerForm({ onSaved: () => ctx.refresh() });
    const ed = t.closest('[data-edit]');
    if (ed) return Forms.openPartnerForm({ partner: partners.find((p) => p.id === ed.dataset.edit), onSaved: () => ctx.refresh() });
    const pay = t.closest('[data-pay]');
    if (pay) return payout(byId[pay.dataset.pay], ctx);
  };
}

function payout({ p, s }, ctx) {
  UI.openSheet({
    title: `Pay ${p.name}`, size: 'md',
    html: `<form id="payout" class="form-grid" novalidate>
      <div class="balance-box field-full"><span>Payable now</span><b>${money(s.payable)}</b></div>
      ${UI.field({ name: 'amount', label: 'Amount paid (Rs)', type: 'number', num: true, min: 1, step: 'any', value: s.payable, required: true })}
      ${UI.field({ name: 'date', label: 'Date paid', type: 'date', value: todayISO(), required: true })}
      ${UI.field({ name: 'note', label: 'How it was paid / reference', full: true, placeholder: 'e.g. JazzCash to 0300…, cheque no. 1234' })}
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="payout">Record payout</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('#payout');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const v = UI.readForm(form);
        await D.saveExpense({ date: v.date, amount: v.amount, category: 'Commission (partner)', payee: p.name, partnerId: p.id, note: v.note });
        UI.toast('Payout recorded');
        close(true);
        ctx.refresh();
      });
    },
  });
}
