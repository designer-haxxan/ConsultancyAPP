// Payments received, expenses, and printed receipts (with a sequential number and the amount in words).
import * as D from '../services/data.js';
import { get } from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, money, fmtDate, todayISO, sum, monthKey } from '../core/utils.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES } from '../core/constants.js';
import { printHTML, printHead } from '../core/print.js';
import * as Forms from './forms.js';

const RANGES = [['month', 'This month'], ['quarter', 'Last 3 months'], ['year', 'This year'], ['all', 'All time']];
const STATE = { tab: 'payments', range: 'month', method: '', category: '', q: '' };

function inRange(dateISO, range) {
  const t = todayISO();
  if (!dateISO) return false;
  if (range === 'all') return true;
  if (range === 'month') return monthKey(dateISO) === monthKey(t);
  if (range === 'year') return dateISO.slice(0, 4) === t.slice(0, 4);
  // quarter: last three calendar months including this one
  const keys = [0, 1, 2].map((i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return monthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); });
  return keys.includes(monthKey(dateISO));
}

export async function render(root, ctx) {
  ctx.setTitle('Payments & expenses');
  STATE.tab = ctx.query.get('tab') === 'expenses' ? 'expenses' : 'payments';
  const [payments, expenses, cases, clients] = await Promise.all([D.listPayments(), D.listExpenses(), D.listCases(), D.listClients()]);
  const caseById = Object.fromEntries(cases.map((c) => [c.id, c]));
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const hashBase = '#/money?tab=';
  const head = UI.pageHead({
    title: 'Money',
    sub: 'Every rupee in and out, with receipts for each payment.',
    actions: STATE.tab === 'payments'
      ? `<button class="btn btn-primary" data-add="pay">${UI.icon('cash-coin')} Record payment</button>`
      : `<button class="btn btn-primary" data-add="exp">${UI.icon('receipt')} Record expense</button>`,
  });
  const tabs = UI.tabStrip([
    { key: 'payments', label: 'Payments in', icon: 'arrow-down-circle', count: payments.filter((p) => !p.voided).length },
    { key: 'expenses', label: 'Expenses out', icon: 'arrow-up-circle', count: expenses.length },
  ], STATE.tab, hashBase);
  const rangeSel = `<select class="input" id="mr">${RANGES.map(([k, l]) => `<option value="${k}" ${STATE.range === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

  if (STATE.tab === 'payments') {
    const rows = payments.filter((p) => inRange(p.date, STATE.range))
      .filter((p) => !STATE.method || p.method === STATE.method)
      .filter((p) => {
        const q = STATE.q.trim().toLowerCase();
        if (!q) return true;
        const c = caseById[p.caseId]; const cl = clientById[c?.clientId];
        return `${cl?.name || ''} ${c?.caseNo || ''} ${p.receiptNo || ''} ${p.reference || ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    const valid = rows.filter((p) => !p.voided);
    const total = sum(valid, (p) => p.amount);
    const byMethod = PAYMENT_METHODS.map((m) => ({ m, v: sum(valid.filter((p) => p.method === m), (p) => p.amount) })).filter((x) => x.v > 0);
    const maxM = Math.max(1, ...byMethod.map((x) => x.v));
    root.innerHTML = `${head}${tabs}
      <div class="stat-row reveal">
        <div class="mini-stat"><small>Received</small><b data-count="${total}" data-fmt="money">${money(total)}</b></div>
        <div class="mini-stat"><small>Payments</small><b>${valid.length}</b></div>
        <div class="mini-stat"><small>Average</small><b>${money(valid.length ? total / valid.length : 0)}</b></div>
      </div>
      <div class="filter-bar reveal">
        <div class="search-inline">${UI.icon('search')}<input id="mq" class="input" type="search" placeholder="Client, receipt no., reference" value="${esc(STATE.q)}" autocomplete="off"></div>
        ${rangeSel}
        <select class="input" id="mm"><option value="">All methods</option>${PAYMENT_METHODS.map((m) => `<option ${m === STATE.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      </div>
      ${byMethod.length ? `<section class="panel reveal"><div class="panel-head"><h2>By method</h2></div><div class="method-bars">${byMethod.map((x, i) => `<div class="mb-row" style="--i:${i}"><span>${esc(x.m)}</span><span class="mb-track"><span style="--w:${Math.round((x.v / maxM) * 100)}%"></span></span><b>${money(x.v)}</b></div>`).join('')}</div></section>` : ''}
      ${rows.length ? `<div class="table-card reveal"><div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Receipt</th><th>Client · file</th><th>Method</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody>${rows.map((p) => {
          const c = caseById[p.caseId]; const cl = clientById[c?.clientId];
          return `<tr class="${p.voided ? 'voided' : ''}"><td>${fmtDate(p.date)}</td>
            <td><b>${esc(p.receiptNo || '')}</b>${p.voided ? '<div class="small text-danger">Voided</div>' : ''}${p.reference ? `<div class="small muted">Ref ${esc(p.reference)}</div>` : ''}</td>
            <td><a class="cell-link" href="#/cases/${encodeURIComponent(p.caseId)}">${esc(cl?.name || '—')}</a><div class="small muted">${esc(c?.caseNo || '')} · ${esc(c?.countryName || '')}</div></td>
            <td><span class="chip chip-neutral">${esc(p.method)}</span></td>
            <td class="num"><b>${money(p.amount)}</b></td>
            <td class="row-end">${p.voided ? '' : `<button class="icon-btn sm" data-receipt="${esc(p.id)}" aria-label="Print receipt">${UI.icon('printer')}</button>
              <button class="icon-btn sm" data-void="${esc(p.id)}" aria-label="Void payment">${UI.icon('x-circle')}</button>`}</td></tr>`;
        }).join('')}</tbody></table></div></div>` : UI.emptyState({ iconName: 'cash-coin', title: 'No payments in this view', text: 'Record a payment against a visa file to print its receipt.' })}`;

    root.onclick = async (e) => {
      const t = e.target;
      if (t.closest('[data-add="pay"]')) return Forms.openPaymentForm({ onSaved: () => ctx.refresh() });
      const r = t.closest('[data-receipt]');
      if (r) return printReceipt(r.dataset.receipt);
      const v = t.closest('[data-void]');
      if (v) {
        const reason = await UI.askText({ title: 'Void payment', label: 'Reason (kept on record)', value: 'Entered by mistake', okLabel: 'Void payment' });
        if (reason === null) return;
        await D.voidPayment(v.dataset.void, reason);
        UI.toast('Payment voided', 'info');
        return ctx.refresh();
      }
    };
    root.onchange = (e) => {
      if (e.target.id === 'mr') { STATE.range = e.target.value; ctx.refresh(); }
      if (e.target.id === 'mm') { STATE.method = e.target.value; ctx.refresh(); }
    };
    root.querySelector('#mq').addEventListener('input', (e) => { STATE.q = e.target.value; clearTimeout(root._t); root._t = setTimeout(() => UI.rerenderKeepingFocus(root, '#mq', () => render(root, ctx)), 180); });
    return;
  }

  // Expenses
  const rows = expenses.filter((x) => inRange(x.date, STATE.range)).filter((x) => !STATE.category || x.category === STATE.category).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = sum(rows, (x) => x.amount);
  const byCat = EXPENSE_CATEGORIES.map((k) => ({ k, v: sum(rows.filter((x) => x.category === k), (x) => x.amount) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const maxC = Math.max(1, ...byCat.map((x) => x.v));
  const partners = Object.fromEntries((await D.listPartners()).map((p) => [p.id, p]));
  root.innerHTML = `${head}${tabs}
    <div class="stat-row reveal">
      <div class="mini-stat"><small>Spent</small><b data-count="${total}" data-fmt="money">${money(total)}</b></div>
      <div class="mini-stat"><small>Entries</small><b>${rows.length}</b></div>
      <div class="mini-stat"><small>Net after receipts</small><b class="${sum(payments.filter((p) => !p.voided && inRange(p.date, STATE.range)), (p) => p.amount) - total >= 0 ? 'text-ok' : 'text-danger'}">${money(sum(payments.filter((p) => !p.voided && inRange(p.date, STATE.range)), (p) => p.amount) - total)}</b></div>
    </div>
    <div class="filter-bar reveal">
      ${rangeSel}
      <select class="input" id="ec"><option value="">All categories</option>${EXPENSE_CATEGORIES.map((k) => `<option ${k === STATE.category ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
    </div>
    ${byCat.length ? `<section class="panel reveal"><div class="panel-head"><h2>By category</h2></div><div class="method-bars">${byCat.map((x, i) => `<div class="mb-row" style="--i:${i}"><span>${esc(x.k)}</span><span class="mb-track"><span style="--w:${Math.round((x.v / maxC) * 100)}%"></span></span><b>${money(x.v)}</b></div>`).join('')}</div></section>` : ''}
    ${rows.length ? `<div class="table-card reveal"><div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Category</th><th>Paid to</th><th>File / partner</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${rows.map((x) => {
        const c = x.caseId ? caseById[x.caseId] : null;
        return `<tr><td>${fmtDate(x.date)}</td><td><span class="chip chip-neutral">${esc(x.category)}</span>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td>
          <td>${esc(x.payee || '—')}</td>
          <td>${c ? `<a class="cell-link" href="#/cases/${encodeURIComponent(c.id)}">${esc(c.caseNo)}</a>` : ''}${x.partnerId && partners[x.partnerId] ? `<div class="small muted">${esc(partners[x.partnerId].name)}</div>` : ''}</td>
          <td class="num"><b>${money(x.amount)}</b></td>
          <td class="row-end"><button class="icon-btn sm" data-exp-edit="${esc(x.id)}" aria-label="Edit">${UI.icon('pencil')}</button>
            <button class="icon-btn sm" data-exp-del="${esc(x.id)}" aria-label="Delete">${UI.icon('trash')}</button></td></tr>`;
      }).join('')}</tbody></table></div></div>` : UI.emptyState({ iconName: 'receipt', title: 'No expenses in this view', text: 'Record embassy fees paid, courier, rent, salaries and partner commissions.' })}`;

  root.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-add="exp"]')) return Forms.openExpenseForm({ onSaved: () => ctx.refresh() });
    const ed = t.closest('[data-exp-edit]');
    if (ed) return Forms.openExpenseForm({ expense: expenses.find((x) => x.id === ed.dataset.expEdit), onSaved: () => ctx.refresh() });
    const del = t.closest('[data-exp-del]');
    if (del) {
      const ok = await UI.confirmDialog('Delete this expense? It leaves the totals.', { okLabel: 'Delete', danger: true });
      if (!ok) return;
      await D.deleteExpense(del.dataset.expDel);
      UI.toast('Expense deleted', 'info');
      return ctx.refresh();
    }
  };
  root.onchange = (e) => {
    if (e.target.id === 'mr') { STATE.range = e.target.value; ctx.refresh(); }
    if (e.target.id === 'ec') { STATE.category = e.target.value; ctx.refresh(); }
  };
}

// ---------- Receipt ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (x) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ''}`);
const three = (x) => { const h = Math.floor(x / 100); const r = x % 100; return `${h ? `${ONES[h]} Hundred${r ? ' ' : ''}` : ''}${r ? two(r) : ''}`; };
// Amount in words using the Pakistani system: Lakh and Crore.
export function amountInWords(value) {
  let n = Math.round(Math.abs(Number(value) || 0));
  if (!n) return 'Rupees Zero Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(' ')} Only`;
}

export async function printReceipt(paymentId) {
  const p = await get('payments', paymentId);
  if (!p) return UI.toast('Payment not found', 'danger');
  const [c, settings, payments] = await Promise.all([D.getCase(p.caseId), D.getSettings(), D.paymentsForCase(p.caseId)]);
  const client = await D.getClient(c?.clientId || p.clientId);
  const m = D.caseMoney(c, payments);
  const html = `${printHead(settings, `<b>Receipt</b><br>${esc(p.receiptNo || '')}<br>${fmtDate(p.date)}`)}
    <h2 class="print-h">Payment receipt</h2>
    <table class="print-table"><tbody>
      <tr><th>Received from</th><td>${esc(client?.name || '—')}${client?.phone ? ` · ${esc(client.phone)}` : ''}</td></tr>
      <tr><th>Visa file</th><td>${esc(c?.caseNo || '')} · ${esc(c?.countryName || '')} · ${esc(c?.visaName || '')}</td></tr>
      <tr><th>Amount</th><td><b>${money(p.amount)}</b> <br><span class="words">${esc(amountInWords(p.amount))}</span></td></tr>
      <tr><th>Method</th><td>${esc(p.method)}${p.reference ? ` · Ref ${esc(p.reference)}` : ''}</td></tr>
      ${p.note ? `<tr><th>Note</th><td>${esc(p.note)}</td></tr>` : ''}
      <tr><th>File totals</th><td>Billed ${money(m.billed)} · Received ${money(m.paid)} · <b>Balance ${money(m.due)}</b></td></tr>
    </tbody></table>
    ${p.voided ? '<p class="print-void">VOID</p>' : ''}
    <p class="print-note">${esc(settings.receiptFooter || '')}</p>
    <div class="print-sign"><div>Received by</div><div>Client signature</div></div>`;
  printHTML(html, `Receipt ${p.receiptNo || ''}`);
}
