// Shared forms, opened as sheets from many screens: client, case, payment, appointment, task, expense, partner, outcome, custom document.
import * as D from '../services/data.js';
import * as UI from '../core/ui.js';
import { esc, todayISO, money, isValidCNIC, isValidPhone, normalizePhone } from '../core/utils.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, APPT_TYPES, CLIENT_SOURCES, PROVINCES, STAGES, DOC_CATEGORIES, OUTCOMES, TASK_PRIORITY, VISA_CATEGORIES } from '../core/constants.js';

const sel = (form, s) => form.querySelector(s);

function footerButtons(formId, label) {
  return `<button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" form="${formId}">${esc(label)}</button>`;
}

// Wires a form inside a sheet: validation, saving, toast and callbacks.
function wire(el, close, form, save, { onSaved, done = 'Saved' } = {}) {
  UI.bindMasks(el);
  form.addEventListener('input', (e) => { if (e.target.dataset?.mask) UI.validateSpecial(form); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.validateSpecial(form);
    if (!form.reportValidity()) return;
    const btn = el.querySelector('[form]');
    if (btn) btn.disabled = true;
    try {
      const v = UI.readForm(form);
      const extra = form.dataset.extra ? JSON.parse(form.dataset.extra) : {};
      const saved = await save(v, extra, form);
      UI.toast(done);
      close(true);
      onSaved?.(saved);
    } catch (err) {
      UI.toast(err.message || 'Could not save. Please try again.', 'danger', 5200);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// ---------- Client ----------
export async function openClientForm({ client = null, onSaved } = {}) {
  const partners = (await D.listPartners()).filter((p) => p.active);
  const c = client || {};
  const isEdit = !!client;
  const html = `
  <form id="client-form" class="form-grid" novalidate>
    <div class="form-section field-full"><span>Personal</span></div>
    ${UI.field({ name: 'name', label: 'Full name (as on passport)', value: c.name, required: true, full: false, autocomplete: 'off' })}
    ${UI.field({ name: 'nameUr', label: 'Name in Urdu (optional)', value: c.nameUr, dir: 'rtl', placeholder: 'اردو میں نام' })}
    ${UI.field({ name: 'fatherName', label: "Father's / husband's name", value: c.fatherName })}
    ${UI.field({ name: 'gender', label: 'Gender', type: 'select', value: c.gender || '', placeholder: 'Select', options: ['Male', 'Female', 'Other'] })}
    ${UI.field({ name: 'dob', label: 'Date of birth', type: 'date', value: c.dob })}
    ${UI.field({ name: 'maritalStatus', label: 'Marital status', type: 'select', value: c.maritalStatus || '', placeholder: 'Select', options: ['Single', 'Married', 'Divorced', 'Widowed'] })}
    ${UI.field({ name: 'occupation', label: 'Occupation', value: c.occupation, placeholder: 'e.g. Teacher, Software engineer' })}

    <div class="form-section field-full"><span>Identity & contact</span></div>
    ${UI.field({ name: 'cnic', label: 'CNIC', value: c.cnic, mask: 'cnic', placeholder: '12345-1234567-1', hint: 'Optional for children. 13 digits.', pattern: '\\d{5}-\\d{7}-\\d' })}
    ${UI.field({ name: 'phone', label: 'Mobile (WhatsApp preferred)', value: c.phone, required: true, mask: 'phone', placeholder: '0300 1234567', autocomplete: 'tel' })}
    ${UI.field({ name: 'email', label: 'Email', type: 'email', value: c.email, autocomplete: 'email' })}
    ${UI.field({ name: 'city', label: 'City', value: c.city, placeholder: 'e.g. Lahore' })}
    ${UI.field({ name: 'province', label: 'Province / region', type: 'select', value: c.province || '', placeholder: 'Select', options: PROVINCES })}
    ${UI.field({ name: 'address', label: 'Address', type: 'textarea', value: c.address, full: true, rows: 2 })}

    <div class="form-section field-full"><span>Passport</span></div>
    ${UI.field({ name: 'passportNo', label: 'Passport number', value: c.passportNo, placeholder: 'AB1234567' })}
    ${UI.field({ name: 'passportPlace', label: 'Place of issue', value: c.passportPlace, placeholder: 'e.g. Lahore' })}
    ${UI.field({ name: 'passportIssue', label: 'Issue date', type: 'date', value: c.passportIssue })}
    ${UI.field({ name: 'passportExpiry', label: 'Expiry date', type: 'date', value: c.passportExpiry, hint: 'The app warns when validity is short for travel.' })}

    <div class="form-section field-full"><span>Source & notes</span></div>
    ${UI.field({ name: 'source', label: 'How did they find you?', type: 'select', value: c.source || '', placeholder: 'Select', options: CLIENT_SOURCES })}
    ${UI.field({ name: 'partnerId', label: 'Referred by partner / agent', type: 'select', value: c.partnerId || '', placeholder: 'None', options: partners.map((p) => [p.id, p.name]) })}
    ${UI.field({ name: 'notes', label: 'Notes', type: 'textarea', value: c.notes, full: true, rows: 3, placeholder: 'Ties to Pakistan, past travel, anything the embassy may ask.' })}
  </form>`;
  UI.openSheet({
    title: isEdit ? 'Edit client' : 'New client', size: 'lg', html,
    footer: footerButtons('client-form', isEdit ? 'Save changes' : 'Save client'),
    onMount: (el, close) => {
      const form = sel(el, '#client-form');
      wire(el, close, form, async (v) => {
        if (!v.name) throw new Error('Enter the full name as written on the passport.');
        if (!isValidPhone(v.phone)) throw new Error('Enter a valid Pakistani mobile number (03XX XXXXXXX).');
        if (v.cnic && !isValidCNIC(v.cnic)) throw new Error('CNIC must be 13 digits: 12345-1234567-1.');
        if (v.passportIssue && v.passportExpiry && v.passportExpiry < v.passportIssue) throw new Error('Passport expiry is before the issue date.');
        return D.saveClient({ ...(client ? { id: client.id } : {}), ...v, phone: normalizePhone(v.phone) });
      }, { onSaved, done: isEdit ? 'Client updated' : 'Client saved' });
    },
  });
}

// ---------- Case (visa file) ----------
export async function openCaseForm({ clientId = '', onSaved, caseRec = null } = {}) {
  const [clients, countries, partners, settings] = await Promise.all([D.listClients(), D.listCountries(), D.listPartners(), D.getSettings()]);
  if (!clients.length) {
    return UI.toast('Add a client first, then open the visa file.', 'warn');
  }
  if (!countries.length) return UI.toast('The visa catalogue is empty. Add a country first.', 'warn');
  clients.sort((a, b) => a.name.localeCompare(b.name));
  const first = clientId || '';
  const countryOpts = countries.map((c) => [c.code, `${c.flag || ''} ${c.name}`]);
  const embassyOpts = ['VFS Global Islamabad', 'VFS Global Lahore', 'VFS Global Karachi', 'TLScontact Lahore', 'TLScontact Islamabad', 'US Embassy Islamabad', 'US Consulate Karachi', 'Canada visa centre (Islamabad)', 'Embassy (direct)', 'Online application only']
    .map((x) => `<option value="${esc(x)}"></option>`).join('');

  const html = `
  <form id="case-form" class="form-grid" novalidate>
    <div class="form-section field-full"><span>Applicant</span></div>
    ${UI.field({ name: 'clientId', label: 'Main applicant', type: 'select', value: first, required: true, placeholder: 'Select client', full: true, options: clients.map((c) => [c.id, `${c.name}${c.phone ? ' · ' + c.phone : ''}`]) })}
    <div class="field field-full">
      <span class="field-label">Family members on this file <span class="muted-inline">(optional)</span></span>
      <div class="member-picker" id="member-picker">${clients.map((c) => `<label class="member-chip"><input type="checkbox" name="member" value="${esc(c.id)}"><span>${esc(c.name)}</span></label>`).join('')}</div>
      <div class="field-hint">Each applicant gets their own passport, CNIC and photo items. Family documents are shared.</div>
    </div>

    <div class="form-section field-full"><span>Destination & visa</span></div>
    ${UI.field({ name: 'country', label: 'Country', type: 'select', value: caseRec?.country || '', required: true, placeholder: 'Select country', options: countryOpts })}
    <div class="field">
      <label class="field-label" for="f_visaKey">Visa type <span class="req">*</span></label>
      <select class="input" id="f_visaKey" name="visaKey" required><option value="">Select country first</option></select>
      <div class="field-hint" id="visa-note"></div>
    </div>
    ${UI.field({ name: 'purpose', label: 'Purpose of travel', value: caseRec?.purpose, placeholder: 'e.g. Family visit, business meeting, MS in Data Science', full: true })}
    <div class="field field-full">
      <label class="field-label" for="f_embassy">Application centre / embassy</label>
      <input class="input" id="f_embassy" name="embassy" list="embassy-list" value="${esc(caseRec?.embassy || '')}" autocomplete="off" placeholder="e.g. VFS Global Lahore">
      <datalist id="embassy-list">${embassyOpts}</datalist>
    </div>
    ${UI.field({ name: 'travelDate', label: 'Planned travel date', type: 'date', value: caseRec?.travelDate })}
    ${UI.field({ name: 'returnDate', label: 'Return date', type: 'date', value: caseRec?.returnDate })}

    <div class="form-section field-full"><span>Team, partner & fees</span></div>
    ${UI.field({ name: 'assignee', label: 'Handled by', type: 'select', value: caseRec?.assignee || settings.ownerName || '', placeholder: 'Select', options: [...new Set([settings.ownerName, ...(settings.staff || [])].filter(Boolean))] })}
    ${UI.field({ name: 'priority', label: 'Priority', type: 'select', value: caseRec?.priority || 'normal', options: TASK_PRIORITY })}
    ${UI.field({ name: 'partnerId', label: 'Partner / agent (commission)', type: 'select', value: caseRec?.partnerId || '', placeholder: 'None', options: partners.filter((p) => p.active).map((p) => [p.id, p.name]) })}
    ${UI.field({ name: 'commissionOverride', label: 'Commission override (optional)', type: 'number', num: true, min: 0, step: 'any', value: caseRec?.commissionOverride ?? '', hint: 'Percent or fixed amount, as set on the partner. Leave blank to use the partner rate.' })}
    ${UI.field({ name: 'stage', label: 'Starting stage', type: 'select', value: caseRec?.stage || 'docs', options: STAGES.map((s) => [s.key, s.label]) })}
    ${UI.field({ name: 'feeConsultancy', label: 'Consultancy fee (Rs)', type: 'number', num: true, min: 0, step: 'any', value: caseRec?.fees?.consultancy ?? '', hint: 'Your service charge.' })}
    ${UI.field({ name: 'feeGovernment', label: 'Embassy / VFS / govt fee (Rs)', type: 'number', num: true, min: 0, step: 'any', value: caseRec?.fees?.government ?? '', hint: 'Pass-through fee. Enter in PKR.' })}
    ${UI.field({ name: 'feeCourier', label: 'Courier / pickup (Rs)', type: 'number', num: true, min: 0, step: 'any', value: caseRec?.fees?.courier ?? '' })}
    ${UI.field({ name: 'feeOther', label: 'Other charges (Rs)', type: 'number', num: true, min: 0, step: 'any', value: caseRec?.fees?.other ?? '', hint: 'Attestation, translation, insurance…' })}
    ${UI.field({ name: 'feeNote', label: 'Fee note for client', type: 'textarea', rows: 2, full: true, value: caseRec?.feeNote, placeholder: 'Shown on the receipt and file cover sheet' })}
  </form>`;

  UI.openSheet({
    title: caseRec ? 'Edit visa file' : 'New visa file', size: 'lg', html,
    footer: footerButtons('case-form', caseRec ? 'Save changes' : 'Open file'),
    onMount: (el, close) => {
      const form = sel(el, '#case-form');
      const countrySel = sel(form, '[name=country]');
      const visaSel = sel(form, '[name=visaKey]');
      const visaNote = sel(el, '#visa-note');
      const fillVisas = (code, keep = '') => {
        const c = countries.find((x) => x.code === code);
        visaSel.innerHTML = c
          ? `<option value="">Select visa type</option>${c.visaTypes.map((v) => `<option value="${esc(v.key)}" ${v.key === keep ? 'selected' : ''}>${esc(v.name)} · ${esc(VISA_CATEGORIES[v.category] || v.category)}</option>`).join('')}`
          : '<option value="">Select country first</option>';
        const v = c?.visaTypes.find((x) => x.key === keep);
        visaNote.textContent = v?.notes || c?.notes || '';
      };
      countrySel.addEventListener('change', () => fillVisas(countrySel.value));
      visaSel.addEventListener('change', () => {
        const c = countries.find((x) => x.code === countrySel.value);
        visaNote.textContent = c?.visaTypes.find((x) => x.key === visaSel.value)?.notes || '';
      });
      if (caseRec) { fillVisas(caseRec.country, caseRec.visaKey); }
      else if (countries.length) { fillVisas(countrySel.value); }
      const memberBoxes = el.querySelectorAll('input[name=member]');
      const primary = sel(form, '[name=clientId]');
      const syncMembers = () => {
        memberBoxes.forEach((b) => {
          const isMain = b.value === primary.value;
          b.disabled = isMain;
          if (isMain) b.checked = false;
          b.closest('.member-chip').classList.toggle('disabled', isMain);
        });
      };
      primary.addEventListener('change', syncMembers);
      if (caseRec) memberBoxes.forEach((b) => { b.checked = (caseRec.memberIds || []).includes(b.value); });
      syncMembers();

      wire(el, close, form, async (v) => {
        if (!v.clientId) throw new Error('Choose the main applicant.');
        if (!v.country || !v.visaKey) throw new Error('Choose a country and visa type.');
        if (v.travelDate && v.returnDate && v.returnDate < v.travelDate) throw new Error('Return date is before the travel date.');
        const memberIds = [...el.querySelectorAll('input[name=member]:checked')].map((b) => b.value);
        const fees = { consultancy: v.feeConsultancy, government: v.feeGovernment, courier: v.feeCourier, other: v.feeOther };
        const partnerId = v.partnerId || '';
        const overrideRaw = String(form.elements.commissionOverride.value).trim();
        const commissionOverride = overrideRaw === '' ? null : Number(overrideRaw);
        if (caseRec) {
          const same = caseRec.country === v.country && caseRec.visaKey === v.visaKey;
          if (!same) throw new Error('To change the country or visa type, open a new file. The checklist is fixed once a file starts.');
          return D.updateCase(caseRec.id, { purpose: v.purpose, embassy: v.embassy, travelDate: v.travelDate, returnDate: v.returnDate, assignee: v.assignee, priority: v.priority, partnerId, commissionOverride, fees, feeNote: v.feeNote });
        }
        return D.createCase({
          clientId: v.clientId, memberIds, country: v.country, visaKey: v.visaKey, purpose: v.purpose, embassy: v.embassy,
          travelDate: v.travelDate, returnDate: v.returnDate, assignee: v.assignee, priority: v.priority,
          partnerId, commissionOverride, fees, feeNote: v.feeNote, stage: v.stage,
        });
      }, { onSaved, done: caseRec ? 'File updated' : 'Visa file opened' });
    },
  });
}

// ---------- Payments ----------
export async function openPaymentForm({ caseId = '', clientId = '', onSaved } = {}) {
  const [cases, clients, payments] = await Promise.all([D.listCases(), D.listClients(), D.listPayments()]);
  const open = cases.filter((c) => c.outcome !== 'withdrawn');
  if (!open.length) return UI.toast('Open a visa file first, then record payments against it.', 'warn');
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
  const nameOf = (c) => `${byId[c.clientId]?.name || 'Client'} · ${c.caseNo} · ${c.countryName}`;
  const html = `
  <form id="pay-form" class="form-grid" novalidate>
    ${UI.field({ name: 'caseId', label: 'Visa file', type: 'select', value: caseId, required: true, placeholder: 'Select file', full: true, options: open.sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((c) => [c.id, nameOf(c)]) })}
    <div class="balance-box field-full" id="bal-box"><span>Balance due</span><b id="bal-val">—</b></div>
    ${UI.field({ name: 'amount', label: 'Amount received (Rs)', type: 'number', num: true, min: 1, step: 'any', required: true })}
    ${UI.field({ name: 'date', label: 'Date received', type: 'date', value: todayISO(), required: true })}
    ${UI.field({ name: 'method', label: 'Method', type: 'select', value: 'Cash', options: PAYMENT_METHODS })}
    ${UI.field({ name: 'reference', label: 'Reference / transaction ID', placeholder: 'Optional' })}
    ${UI.field({ name: 'note', label: 'Note', full: true, placeholder: 'e.g. Part payment, balance on pickup' })}
  </form>`;
  UI.openSheet({
    title: 'Record payment', size: 'md', html,
    footer: footerButtons('pay-form', 'Save & print receipt'),
    onMount: (el, close) => {
      const form = sel(el, '#pay-form');
      const caseSel = sel(form, '[name=caseId]');
      const updateBal = () => {
        const c = cases.find((x) => x.id === caseSel.value);
        if (!c) { sel(el, '#bal-val').textContent = '—'; return; }
        const m = D.caseMoney(c, payments);
        sel(el, '#bal-val').textContent = `${money(m.due)}`;
        const amount = sel(form, '[name=amount]');
        if (!amount.value && m.due > 0) amount.value = m.due;
      };
      caseSel.addEventListener('change', updateBal);
      updateBal();
      wire(el, close, form, async (v) => {
        if (!v.caseId) throw new Error('Choose the visa file.');
        const c = cases.find((x) => x.id === v.caseId);
        return D.addPayment({ caseId: v.caseId, clientId: c.clientId, amount: v.amount, date: v.date, method: v.method, reference: v.reference, note: v.note });
      }, {
        done: 'Payment recorded',
        onSaved: (p) => {
          onSaved?.(p);
          // Offer the receipt instead of opening the print dialog straight away.
          UI.openSheet({
            title: 'Payment recorded', size: 'sm',
            html: `<div class="receipt-ok">${UI.icon('check-circle-fill')}<div><b>${esc(money(p.amount))}</b><small>${esc(p.receiptNo || '')} · ${esc(p.method)}</small></div></div>
              <p class="muted small mt-3">Print the receipt for the client, or save it later from the case's Payments tab.</p>`,
            footer: `<button type="button" class="btn btn-ghost" data-close>Done</button><button type="button" class="btn btn-primary" data-print>${UI.icon('printer')} Print receipt</button>`,
            onMount: (sheetEl, close2) => sheetEl.querySelector('[data-print]').addEventListener('click', async () => {
              const { printReceipt } = await import('./money.js');
              close2(true);
              printReceipt(p.id);
            }),
          });
        },
      });
    },
  });
}

// ---------- Appointments & tasks ----------
export async function openAppointmentForm({ caseId = '', onSaved } = {}) {
  const cases = (await D.listCases()).filter((c) => c.outcome !== 'withdrawn');
  const clients = await D.listClients();
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
  const html = `
  <form id="apt-form" class="form-grid" novalidate>
    ${UI.field({ name: 'caseId', label: 'Visa file', type: 'select', value: caseId, placeholder: 'No file (general)', full: true, options: cases.map((c) => [c.id, `${byId[c.clientId]?.name || 'Client'} · ${c.caseNo}`]) })}
    ${UI.field({ name: 'type', label: 'Type', type: 'select', value: APPT_TYPES[0], options: APPT_TYPES, required: true })}
    ${UI.field({ name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true })}
    ${UI.field({ name: 'time', label: 'Time', type: 'time' })}
    ${UI.field({ name: 'location', label: 'Location / centre', placeholder: 'e.g. VFS Lahore, Gulberg', full: true })}
    ${UI.field({ name: 'bookingRef', label: 'Booking reference', placeholder: 'Appointment or slot number' })}
    ${UI.field({ name: 'note', label: 'Note', placeholder: 'Bring originals, fee receipt…' })}
  </form>`;
  UI.openSheet({
    title: 'Add appointment', size: 'md', html, footer: footerButtons('apt-form', 'Save appointment'),
    onMount: (el, close) => {
      const form = sel(el, '#apt-form');
      wire(el, close, form, async (v) => {
        if (!v.date) throw new Error('Choose a date.');
        return D.saveAppointment({ caseId: v.caseId, clientId: cases.find((c) => c.id === v.caseId)?.clientId || '', type: v.type, date: v.date, time: v.time, location: v.location, bookingRef: v.bookingRef, note: v.note });
      }, { onSaved, done: 'Appointment added' });
    },
  });
}

export async function openTaskForm({ caseId = '', onSaved } = {}) {
  const cases = (await D.listCases()).filter((c) => c.outcome !== 'withdrawn');
  const clients = await D.listClients();
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
  const html = `
  <form id="task-form" class="form-grid" novalidate>
    ${UI.field({ name: 'title', label: 'What needs doing?', required: true, full: true, placeholder: 'e.g. Call Ahmed about missing bank statements' })}
    ${UI.field({ name: 'due', label: 'Due date', type: 'date', value: todayISO(), required: true })}
    ${UI.field({ name: 'priority', label: 'Priority', type: 'select', value: 'normal', options: TASK_PRIORITY })}
    ${UI.field({ name: 'caseId', label: 'Visa file (optional)', type: 'select', value: caseId, placeholder: 'No file', full: true, options: cases.map((c) => [c.id, `${byId[c.clientId]?.name || 'Client'} · ${c.caseNo}`]) })}
  </form>`;
  UI.openSheet({
    title: 'Add task', size: 'md', html, footer: footerButtons('task-form', 'Save task'),
    onMount: (el, close) => {
      const form = sel(el, '#task-form');
      wire(el, close, form, async (v) => {
        if (!v.title) throw new Error('Describe the task.');
        return D.saveTask({ title: v.title, due: v.due, priority: v.priority, caseId: v.caseId, clientId: cases.find((c) => c.id === v.caseId)?.clientId || '' });
      }, { onSaved, done: 'Task added' });
    },
  });
}

// ---------- Expenses ----------
export async function openExpenseForm({ expense = null, onSaved } = {}) {
  const [partners, cases, clients] = await Promise.all([D.listPartners(), D.listCases(), D.listClients()]);
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
  const e = expense || { date: todayISO(), category: EXPENSE_CATEGORIES[0] };
  const html = `
  <form id="exp-form" class="form-grid" novalidate>
    ${UI.field({ name: 'date', label: 'Date', type: 'date', value: e.date, required: true })}
    ${UI.field({ name: 'amount', label: 'Amount (Rs)', type: 'number', num: true, min: 1, step: 'any', value: e.amount ?? '', required: true })}
    ${UI.field({ name: 'category', label: 'Category', type: 'select', value: e.category, options: EXPENSE_CATEGORIES, full: true })}
    ${UI.field({ name: 'payee', label: 'Paid to', value: e.payee, placeholder: 'Person, shop, courier or office', full: true })}
    ${UI.field({ name: 'partnerId', label: 'Partner (for commission payouts)', type: 'select', value: e.partnerId || '', placeholder: 'None', options: partners.map((p) => [p.id, p.name]) })}
    ${UI.field({ name: 'caseId', label: 'Visa file (optional)', type: 'select', value: e.caseId || '', placeholder: 'General', full: true, options: cases.map((c) => [c.id, `${byId[c.clientId]?.name || 'Client'} · ${c.caseNo}`]) })}
    ${UI.field({ name: 'note', label: 'Note', full: true, value: e.note })}
  </form>`;
  UI.openSheet({
    title: expense ? 'Edit expense' : 'Record expense', size: 'md', html, footer: footerButtons('exp-form', 'Save expense'),
    onMount: (el, close) => {
      const form = sel(el, '#exp-form');
      wire(el, close, form, async (v) => {
        if (!v.date) throw new Error('Choose a date.');
        return D.saveExpense({ ...(expense ? { id: expense.id } : {}), date: v.date, amount: v.amount, category: v.category, payee: v.payee, partnerId: v.partnerId, caseId: v.caseId || null, note: v.note });
      }, { onSaved, done: 'Expense saved' });
    },
  });
}

// ---------- Partners ----------
export async function openPartnerForm({ partner = null, onSaved } = {}) {
  const p = partner || { commissionType: 'percent', active: true };
  const html = `
  <form id="partner-form" class="form-grid" novalidate>
    ${UI.field({ name: 'name', label: 'Name / agency', value: p.name, required: true, full: true, placeholder: 'e.g. Bilal Overseas (Gujrat)' })}
    ${UI.field({ name: 'phone', label: 'Mobile', value: p.phone, mask: 'phone', placeholder: '0300 1234567' })}
    ${UI.field({ name: 'city', label: 'City', value: p.city })}
    ${UI.field({ name: 'served', label: 'Countries they bring clients for', value: p.served, full: true, placeholder: 'e.g. UK, Schengen, Canada' })}
    ${UI.field({ name: 'commissionType', label: 'Commission basis', type: 'select', value: p.commissionType, options: [['percent', 'Percent of consultancy fee'], ['fixed', 'Fixed amount per file']] })}
    ${UI.field({ name: 'commissionValue', label: 'Commission (% or Rs)', type: 'number', num: true, min: 0, step: 'any', value: p.commissionValue ?? 0 })}
    ${UI.field({ name: 'active', label: 'Active partner', type: 'checkbox', value: p.active })}
    ${UI.field({ name: 'notes', label: 'Notes', type: 'textarea', value: p.notes, full: true, rows: 2 })}
  </form>`;
  UI.openSheet({
    title: partner ? 'Edit partner' : 'New partner', size: 'md', html, footer: footerButtons('partner-form', 'Save partner'),
    onMount: (el, close) => {
      const form = sel(el, '#partner-form');
      wire(el, close, form, async (v) => {
        if (!v.name) throw new Error('Enter the partner name.');
        if (v.phone && !isValidPhone(v.phone)) throw new Error('Enter a valid Pakistani mobile number, or leave it blank.');
        return D.savePartner({ ...(partner ? { id: partner.id } : {}), ...v, phone: v.phone ? normalizePhone(v.phone) : '' });
      }, { onSaved, done: 'Partner saved' });
    },
  });
}

// ---------- Outcome ----------
export function openOutcomeForm(caseRec, { onSaved } = {}) {
  const html = `
  <form id="out-form" class="form-grid" novalidate>
    ${UI.field({ name: 'outcome', label: 'Decision', type: 'select', value: caseRec.outcome || 'pending', options: OUTCOMES, full: true })}
    ${UI.field({ name: 'date', label: 'Decision date', type: 'date', value: todayISO() })}
    ${UI.field({ name: 'visaFrom', label: 'Visa valid from', type: 'date', value: caseRec.visaFrom })}
    ${UI.field({ name: 'visaTo', label: 'Visa valid until', type: 'date', value: caseRec.visaTo })}
    ${UI.field({ name: 'reason', label: 'Refusal reason (as stated in the letter)', type: 'textarea', rows: 3, full: true, value: caseRec.refusalReason, placeholder: 'Copy the reason from the refusal letter. It becomes part of the client history.' })}
  </form>`;
  UI.openSheet({
    title: 'Record decision', size: 'md', html, footer: footerButtons('out-form', 'Save decision'),
    onMount: (el, close) => {
      const form = sel(el, '#out-form');
      wire(el, close, form, async (v) => {
        return D.setOutcome(caseRec.id, v.outcome, { date: v.date, reason: v.reason, visaFrom: v.visaFrom, visaTo: v.visaTo });
      }, { onSaved, done: 'Decision saved' });
    },
  });
}

// ---------- Custom checklist item ----------
export function openCustomDocForm(caseRec, applicants, { onSaved } = {}) {
  const html = `
  <form id="doc-form" class="form-grid" novalidate>
    ${UI.field({ name: 'label', label: 'Document name', required: true, full: true, placeholder: 'e.g. NOC from school principal' })}
    ${UI.field({ name: 'category', label: 'Category', type: 'select', value: 'Other', options: DOC_CATEGORIES })}
    ${UI.field({ name: 'scope', label: 'Who needs it', type: 'select', value: 'case', options: [['case', 'Whole file (one copy)'], ['person', 'Each applicant']] })}
    ${UI.field({ name: 'ownerId', label: 'Belongs to', type: 'select', value: caseRec.clientId, options: applicants.map((a) => [a.id, a.name]), full: true })}
    ${UI.field({ name: 'required', label: 'Required for submission', type: 'checkbox', value: true })}
  </form>`;
  UI.openSheet({
    title: 'Add checklist item', size: 'md', html, footer: footerButtons('doc-form', 'Add item'),
    onMount: (el, close) => {
      const form = sel(el, '#doc-form');
      wire(el, close, form, async (v) => {
        if (!v.label) throw new Error('Name the document.');
        return D.addCustomDoc(caseRec.id, { label: v.label, category: v.category, scope: v.scope, ownerId: v.ownerId, required: v.required });
      }, { onSaved, done: 'Item added' });
    },
  });
}
