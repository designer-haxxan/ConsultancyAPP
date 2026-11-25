// Reports: approvals by country, money in and out, and partner commissions. Each table exports to CSV.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, money, moneyNum, pct, sum, todayISO, addMonths, fmtMonth, monthKey, downloadCSV } from '../core/utils.js';
import { VISA_CATEGORIES, STAGE_BY_KEY } from '../core/constants.js';

const STATE = { from: '', to: '' };

export async function render(root, ctx) {
  ctx.setTitle('Reports');
  const data = await D.loadSnapshot();
  if (!STATE.from) { STATE.from = addMonths(todayISO(), -11).slice(0, 7) + '-01'; STATE.to = todayISO(); }
  const { from, to } = STATE;
  const inR = (d) => d && d >= from && d <= to;
  const clientById = Object.fromEntries(data.clients.map((c) => [c.id, c]));
  const valid = data.payments.filter((p) => !p.voided);
  const casesInRange = data.cases.filter((c) => inR(c.createdAt.slice(0, 10)));
  const decided = data.cases.filter((c) => ['approved', 'refused'].includes(c.outcome) && inR(c.outcomeDate));
  const approvedN = decided.filter((c) => c.outcome === 'approved').length;
  const billed = sum(casesInRange, (c) => D.caseBilled(c));
  const collected = sum(valid.filter((p) => inR(p.date)), (p) => p.amount);
  const spent = sum(data.expenses.filter((x) => inR(x.date)), (x) => x.amount);
  const outstanding = sum(data.cases.filter((c) => c.outcome !== 'withdrawn'), (c) => D.caseMoney(c, valid).due);

  // By country
  const countries = {};
  for (const c of data.cases.filter((x) => inR(x.createdAt.slice(0, 10)) || inR(x.outcomeDate))) {
    const k = c.countryName;
    countries[k] ||= { name: k, flag: c.flag, files: 0, approved: 0, refused: 0, pending: 0, withdrawn: 0 };
    countries[k].files++;
    countries[k][c.outcome === 'pending' ? 'pending' : c.outcome] = (countries[k][c.outcome === 'pending' ? 'pending' : c.outcome] || 0) + 1;
  }
  const countryRows = Object.values(countries).sort((a, b) => b.files - a.files);

  // By visa category
  const cat = {};
  for (const c of casesInRange) { const k = VISA_CATEGORIES[c.visaCategory] || 'Other'; cat[k] = (cat[k] || 0) + 1; }
  const catRows = Object.entries(cat).sort((a, b) => b[1] - a[1]);

  // Monthly collections
  const months = Array.from({ length: 12 }, (_, i) => monthKey(addMonths(to, i - 11)));
  const monthly = months.map((m) => ({ m, v: sum(valid.filter((p) => monthKey(p.date) === m), (p) => p.amount) }));
  const maxM = Math.max(1, ...monthly.map((x) => x.v));

  // Partners
  const partnerRows = (await D.listPartners()).map((p) => ({ p, s: D.partnerCommission(p, data.cases, data.expenses) })).filter((x) => x.s.accrued || x.s.paid);

  // Money receivable list
  const dueRows = data.cases.filter((c) => c.outcome !== 'withdrawn').map((c) => ({ c, m: D.caseMoney(c, valid) })).filter((x) => x.m.due > 0)
    .sort((a, b) => b.m.due - a.m.due).slice(0, 25);

  root.innerHTML = `
    ${UI.pageHead({ title: 'Reports', sub: 'Pick a period. Tables can be exported to CSV for your accountant.', actions: '' })}
    <form class="filter-bar reveal" id="rf">
      <div class="field-inline"><label for="rfrom">From</label><input class="input" type="date" id="rfrom" name="from" value="${esc(from)}"></div>
      <div class="field-inline"><label for="rto">To</label><input class="input" type="date" id="rto" name="to" value="${esc(to)}"></div>
      <button class="btn btn-ghost" type="submit">Apply</button>
      <div class="chip-group">
        <button type="button" class="filter-chip" data-preset="month">This month</button>
        <button type="button" class="filter-chip" data-preset="year">This year</button>
        <button type="button" class="filter-chip" data-preset="12">Last 12 months</button>
      </div>
    </form>

    <div class="kpi-grid reveal">
      ${UI.statTile({ label: 'Files opened', value: casesInRange.length, iconName: 'folder-plus', tone: 'brand', count: true })}
      ${UI.statTile({ label: 'Approval rate', value: decided.length ? `${pct(approvedN, decided.length)}%` : '—', iconName: 'award', tone: 'teal', sub: `${approvedN} approved of ${decided.length} decisions` })}
      ${UI.statTile({ label: 'Billed', value: billed, iconName: 'receipt', tone: 'violet', count: true, isMoney: true, sub: 'fees on files opened' })}
      ${UI.statTile({ label: 'Collected', value: collected, iconName: 'cash-stack', tone: 'success', count: true, isMoney: true, sub: 'payments in period' })}
      ${UI.statTile({ label: 'Expenses', value: spent, iconName: 'arrow-up-circle', tone: 'amber', count: true, isMoney: true, sub: `Net ${money(collected - spent)}` })}
      ${UI.statTile({ label: 'Outstanding', value: outstanding, iconName: 'hourglass-top', tone: outstanding ? 'warn' : 'muted', count: true, isMoney: true, sub: 'all open files, now' })}
    </div>

    <section class="panel reveal">
      <div class="panel-head"><h2>Collections by month</h2><span class="muted small">last 12 months</span></div>
      <div class="bars tall" role="img" aria-label="Collections by month">
        ${monthly.map((x, i) => `<div class="bar-col" style="--i:${i}"><span class="bar-val">${x.v ? esc(moneyNum(x.v)) : ''}</span>
          <span class="bar" style="--h:${Math.max(2, Math.round((x.v / maxM) * 100))}%"></span><span class="bar-label">${esc(fmtMonth(x.m))}</span></div>`).join('')}
      </div>
    </section>

    <section class="panel reveal" style="--d:60ms">
      <div class="panel-head"><h2>Approvals by country</h2>
        <button class="btn btn-sm btn-ghost" data-csv="countries">${UI.icon('filetype-csv')} CSV</button></div>
      ${countryRows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Country</th><th class="num">Files</th><th class="num">Approved</th><th class="num">Refused</th><th class="num">Pending</th><th class="num">Approval</th></tr></thead>
        <tbody>${countryRows.map((r) => {
          const dec = (r.approved || 0) + (r.refused || 0);
          return `<tr><td><span class="flag">${esc(r.flag || '')}</span> <b>${esc(r.name)}</b></td><td class="num">${r.files}</td><td class="num text-ok">${r.approved || 0}</td><td class="num text-danger">${r.refused || 0}</td><td class="num">${r.pending || 0}</td>
            <td class="num"><span class="chip ${dec ? (pct(r.approved || 0, dec) >= 70 ? 'chip-success' : 'chip-warn') : 'chip-muted'}">${dec ? `${pct(r.approved || 0, dec)}%` : '—'}</span></td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="muted-note">No files in this period.</div>'}
    </section>

    <div class="dash-grid">
      <section class="panel reveal" style="--d:100ms">
        <div class="panel-head"><h2>Visa categories</h2></div>
        ${catRows.length ? `<div class="method-bars">${catRows.map(([k, v], i) => `<div class="mb-row" style="--i:${i}"><span>${esc(k)}</span><span class="mb-track"><span style="--w:${Math.round((v / Math.max(...catRows.map((x) => x[1]))) * 100)}%"></span></span><b>${v}</b></div>`).join('')}</div>` : '<div class="muted-note">No files in this period.</div>'}
      </section>
      <section class="panel reveal" style="--d:140ms">
        <div class="panel-head"><h2>Commissions</h2><button class="btn btn-sm btn-ghost" data-csv="partners">${UI.icon('filetype-csv')} CSV</button></div>
        ${partnerRows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Partner</th><th class="num">Earned</th><th class="num">Paid</th><th class="num">Payable</th></tr></thead>
          <tbody>${partnerRows.map(({ p, s }) => `<tr><td>${esc(p.name)}</td><td class="num">${moneyNum(s.accrued)}</td><td class="num">${moneyNum(s.paid)}</td><td class="num"><b>${moneyNum(s.payable)}</b></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted-note">No commissions yet.</div>'}
      </section>
    </div>

    <section class="panel reveal" style="--d:180ms">
      <div class="panel-head"><h2>Money still owed</h2><button class="btn btn-sm btn-ghost" data-csv="due">${UI.icon('filetype-csv')} CSV</button></div>
      ${dueRows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>File</th><th>Stage</th><th class="num">Billed</th><th class="num">Due</th></tr></thead>
        <tbody>${dueRows.map(({ c, m }) => `<tr><td><a class="cell-link" href="#/cases/${encodeURIComponent(c.id)}">${esc(clientById[c.clientId]?.name || '—')}</a></td><td>${esc(c.caseNo)} · ${esc(c.countryName)}</td>
          <td><span class="chip chip-neutral">${esc(STAGE_BY_KEY[c.stage]?.label || '')}</span></td><td class="num">${moneyNum(m.billed)}</td><td class="num text-warn"><b>${moneyNum(m.due)}</b></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="muted-note">Nothing owed. Every open file is paid up.</div>'}
    </section>
    <p class="hint-line">${UI.icon('info-circle')} Figures use the Rs amounts entered on each file. Refunds and voided payments are excluded.</p>`;

  root.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    STATE.from = String(f.get('from') || '2000-01-01');
    STATE.to = String(f.get('to') || todayISO());
    ctx.refresh();
  };
  root.onclick = (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) {
      const t = todayISO();
      if (p.dataset.preset === 'month') STATE.from = `${t.slice(0, 7)}-01`;
      if (p.dataset.preset === 'year') STATE.from = `${t.slice(0, 4)}-01-01`;
      if (p.dataset.preset === '12') STATE.from = `${addMonths(t, -11).slice(0, 7)}-01`;
      STATE.to = t;
      return ctx.refresh();
    }
    const c = e.target.closest('[data-csv]');
    if (c) exportCSV(c.dataset.csv, { countryRows, partnerRows, dueRows, from, to });
  };
}

function exportCSV(kind, { countryRows, partnerRows, dueRows, from, to }) {
  const stamp = `${from}_to_${to}`;
  if (kind === 'countries') {
    downloadCSV(`approvals-by-country_${stamp}.csv`, [['Country', 'Files', 'Approved', 'Refused', 'Pending', 'Withdrawn'], ...countryRows.map((r) => [r.name, r.files, r.approved || 0, r.refused || 0, r.pending || 0, r.withdrawn || 0])]);
  } else if (kind === 'partners') {
    downloadCSV(`commissions_${stamp}.csv`, [['Partner', 'Earned', 'Paid', 'Payable'], ...partnerRows.map(({ p, s }) => [p.name, s.accrued, s.paid, s.payable])]);
  } else if (kind === 'due') {
    downloadCSV(`money-owed_${stamp}.csv`, [['Case', 'Country', 'Billed', 'Received', 'Due'], ...dueRows.map(({ c, m }) => [c.caseNo, c.countryName, m.billed, m.paid, m.due])]);
  }
  UI.toast('CSV downloaded');
}
