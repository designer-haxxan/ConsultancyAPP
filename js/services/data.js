// Business rules and data access. Every change that touches several records is written in one transaction.
import { CONFIG } from '../config.js';
import { run, reqP, get, all, byIndex, put, del, writeMany, metaGet, metaSet } from '../db/idb.js';
import { uid, nowISO, todayISO, addMonths, sum, pct, money, compressImage, diffDays, num } from '../core/utils.js';
import { STAGE_BY_KEY, OUTCOMES } from '../core/constants.js';
import { DOCS, COUNTRIES_SEED } from './catalog-seed.js';

// ---------- Settings ----------
export const DEFAULT_SETTINGS = {
  agencyName: '',
  ownerName: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  licenceNo: '',
  secpNo: '',
  ntn: '',
  minPassportMonths: 6,
  staff: [],
  receiptFooter: 'Thank you. Government and embassy fees are not refundable once the application is submitted.',
  refundPolicy: 'Consultancy fee is non-refundable after documents are verified. Refunds for embassy or VFS fees are not possible once paid. Visa decisions rest with the embassy.',
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await metaGet('settings', {})) };
}
export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await metaSet('settings', next);
  return next;
}

// ---------- Catalogue ----------
export async function listCountries() {
  return (await all('catalog')).sort((a, b) => a.name.localeCompare(b.name));
}
export const getCountry = (code) => get('catalog', code);
export const saveCountry = (c) => put('catalog', { ...c, updatedAt: nowISO() });
export async function deleteCountry(code) {
  const used = (await all('cases')).some((c) => c.country === code);
  if (used) throw new Error('Cases use this country. Remove those cases first, or keep the country.');
  return del('catalog', code);
}
export async function seedCatalog() {
  const existing = await all('catalog');
  if (existing.length) return;
  const now = nowISO();
  await writeMany(COUNTRIES_SEED.map((c) => ({ s: 'catalog', put: { ...c, id: c.code, updatedAt: now } })));
}
export async function findVisa(countryCode, visaKey) {
  const c = await getCountry(countryCode);
  const visa = c?.visaTypes.find((v) => v.key === visaKey) || null;
  return { country: c || null, visa };
}

// ---------- Clients ----------
export const listClients = () => all('clients');
export const getClient = (id) => get('clients', id);

export async function saveClient(data) {
  const now = nowISO();
  const base = data.id ? (await get('clients', data.id)) || {} : {};
  const rec = {
    refusals: [],
    createdAt: now,
    ...base,
    ...data,
    id: data.id || uid('cl'),
    updatedAt: now,
  };
  await put('clients', rec);
  return rec;
}

export async function addRefusal(clientId, refusal) {
  const c = await get('clients', clientId);
  if (!c) return;
  const refusals = [...(c.refusals || []), { id: uid('rf'), ...refusal }];
  await put('clients', { ...c, refusals, updatedAt: nowISO() });
}

export async function deleteClient(id) {
  const cases = await byIndex('cases', 'by_client', id);
  const payments = await byIndex('payments', 'by_client', id);
  if (payments.some((p) => !p.voided)) throw new Error('This client has payments on record. Keep the client, or void the payments first.');
  return run(['clients', 'cases', 'documents', 'files', 'appointments', 'tasks', 'events', 'expenses'], 'readwrite', async (t) => {
    await purgeCases(t, cases.map((c) => c.id));
    t.objectStore('clients').delete(id);
  });
}

// Removes case rows and their children. Expenses linked to a case are kept but unlinked.
async function purgeCases(t, caseIds) {
  for (const cid of caseIds) {
    for (const store of ['documents', 'files', 'appointments', 'tasks', 'events']) {
      const idx = t.objectStore(store).index('by_case');
      const rows = await reqP(idx.getAll(cid));
      for (const r of rows) t.objectStore(store).delete(r.id);
    }
    const exp = await reqP(t.objectStore('expenses').index('by_case').getAll(cid));
    for (const e of exp) t.objectStore('expenses').put({ ...e, caseId: null });
    t.objectStore('cases').delete(cid);
  }
}

// ---------- Cases ----------
export const listCases = () => all('cases');
export const getCase = (id) => get('cases', id);
export const casesForClient = (clientId) => byIndex('cases', 'by_client', clientId);
export const listDocs = () => all('documents');
export const docsForCase = (caseId) => byIndex('documents', 'by_case', caseId);

async function nextSeq(t, key) {
  const st = t.objectStore('meta');
  const rec = await reqP(st.get(key));
  const n = (rec?.value || 0) + 1;
  st.put({ id: key, value: n });
  return n;
}

const evt = (caseId, kind, text) => ({ id: uid('ev'), caseId, kind, text, at: nowISO() });

// Builds document rows for a case from its checklist snapshot.
function buildChecklist(checklist, caseId, primaryId, applicantIds) {
  const out = [];
  const seen = new Set();
  const now = nowISO();
  const push = (doc) => {
    const k = `${doc.key || doc.label}|${doc.clientId}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(doc);
  };
  for (const key of checklist.docs || []) {
    const d = DOCS[key];
    if (!d) continue;
    const owners = d.scope === 'person' ? applicantIds : [primaryId];
    for (const owner of owners) push(libraryDoc(key, d, caseId, owner, now));
  }
  for (const c of checklist.custom || []) {
    const owners = c.scope === 'person' ? applicantIds : [primaryId];
    for (const owner of owners) push(customDoc(c, caseId, owner, now));
  }
  return out;
}

function libraryDoc(key, d, caseId, ownerId, now) {
  return {
    id: uid('doc'), caseId, clientId: ownerId, key, label: d.label, category: d.category, scope: d.scope,
    required: d.required !== false, attestable: !!d.attest, attest: [], status: 'missing', note: '', custom: false,
    createdAt: now, updatedAt: now,
  };
}
function customDoc(c, caseId, ownerId, now) {
  return {
    id: uid('doc'), caseId, clientId: ownerId, key: null, label: c.label, category: c.category || 'Other', scope: c.scope || 'case',
    required: c.required !== false, attestable: !!c.attest, attest: [], status: 'missing', note: '', custom: true,
    createdAt: now, updatedAt: now,
  };
}

// Creates a case with applicants and its document checklist. The visa checklist is copied onto the case,
// so later edits to the catalogue do not change files already in progress.
export async function createCase(input) {
  const { visa, country } = await findVisa(input.country, input.visaKey);
  if (!visa || !country) throw new Error('Choose a country and visa type from the catalogue.');
  const now = nowISO();
  const year = new Date().getFullYear();
  const applicants = [input.clientId, ...(input.memberIds || []).filter((id) => id !== input.clientId)];
  const id = uid('case');
  const checklist = { docs: [...visa.docs], custom: [...(visa.custom || [])] };
  let caseNo = '';
  const rec = {
    id, caseNo: '', clientId: input.clientId, memberIds: applicants.slice(1),
    country: country.code, countryName: country.name, flag: country.flag || '',
    visaKey: visa.key, visaName: visa.name, visaCategory: visa.category,
    checklist, purpose: input.purpose || '', embassy: input.embassy || '',
    travelDate: input.travelDate || '', returnDate: input.returnDate || '',
    stage: input.stage || 'docs', stageChangedAt: now, outcome: 'pending', outcomeDate: '', refusalReason: '',
    visaFrom: '', visaTo: '', assignee: input.assignee || '', partnerId: input.partnerId || '',
    commissionOverride: input.commissionOverride ?? null,
    fees: { consultancy: num(input.fees?.consultancy), government: num(input.fees?.government), courier: num(input.fees?.courier), other: num(input.fees?.other) },
    feeNote: input.feeNote || '', priority: input.priority || 'normal',
    createdAt: now, updatedAt: now,
  };
  const docs = buildChecklist(checklist, id, input.clientId, applicants);
  await run(['meta', 'cases', 'documents', 'events'], 'readwrite', async (t) => {
    const n = await nextSeq(t, `caseSeq:${year}`);
    caseNo = `VF-${year}-${String(n).padStart(4, '0')}`;
    rec.caseNo = caseNo;
    t.objectStore('cases').put(rec);
    for (const d of docs) t.objectStore('documents').put(d);
    t.objectStore('events').put(evt(id, 'system', `Case ${caseNo} opened: ${country.name}, ${visa.name}`));
  });
  return rec;
}

export async function updateCase(id, patch) {
  const c = await getCase(id);
  if (!c) throw new Error('Case not found.');
  const next = { ...c, ...patch, updatedAt: nowISO() };
  await writeMany([{ s: 'cases', put: next }, { s: 'events', put: evt(id, 'system', 'Case details updated') }]);
  return next;
}

export async function moveStage(id, stage, note = '') {
  const c = await getCase(id);
  if (!c) throw new Error('Case not found.');
  const now = nowISO();
  const label = STAGE_BY_KEY[stage]?.label || stage;
  await writeMany([
    { s: 'cases', put: { ...c, stage, stageChangedAt: now, updatedAt: now } },
    { s: 'events', put: evt(id, 'stage', `Moved to ${label}${note ? ` · ${note}` : ''}`) },
  ]);
}

export async function setOutcome(id, outcome, { date = todayISO(), reason = '', visaFrom = '', visaTo = '' } = {}) {
  const c = await getCase(id);
  if (!c) throw new Error('Case not found.');
  const label = OUTCOMES.find(([k]) => k === outcome)?.[1] || outcome;
  const next = { ...c, outcome, outcomeDate: date, refusalReason: outcome === 'refused' ? reason : '', visaFrom: outcome === 'approved' ? visaFrom : '', visaTo: outcome === 'approved' ? visaTo : '', updatedAt: nowISO() };
  const ops = [{ s: 'cases', put: next }, { s: 'events', put: evt(id, 'decision', `Outcome: ${label}${reason ? ` · ${reason}` : ''}`) }];
  if (outcome === 'refused') {
    const client = await getClient(c.clientId);
    if (client) {
      const refusals = [...(client.refusals || []).filter((r) => r.caseNo !== c.caseNo), { id: uid('rf'), caseNo: c.caseNo, country: c.countryName, visa: c.visaName, date, reason }];
      ops.push({ s: 'clients', put: { ...client, refusals, updatedAt: nowISO() } });
    }
  }
  await writeMany(ops);
  return next;
}

// Adds a family member as an applicant and creates their personal documents.
export async function addApplicant(caseId, clientId) {
  const c = await getCase(caseId);
  if (!c) throw new Error('Case not found.');
  if (c.clientId === clientId || c.memberIds.includes(clientId)) throw new Error('This person is already on the case.');
  const existing = await docsForCase(caseId);
  const now = nowISO();
  const fresh = buildChecklist({ docs: c.checklist.docs, custom: c.checklist.custom }, caseId, c.clientId, [clientId])
    .filter((d) => d.scope === 'person' && d.clientId === clientId)
    .filter((d) => !existing.some((e) => e.key === d.key && e.clientId === clientId && e.label === d.label));
  const client = await getClient(clientId);
  await writeMany([
    { s: 'cases', put: { ...c, memberIds: [...c.memberIds, clientId], updatedAt: now } },
    ...fresh.map((d) => ({ s: 'documents', put: d })),
    { s: 'events', put: evt(caseId, 'system', `Applicant added: ${client?.name || 'Family member'}`) },
  ]);
}

export async function removeApplicant(caseId, clientId) {
  const c = await getCase(caseId);
  const docs = (await docsForCase(caseId)).filter((d) => d.clientId === clientId);
  const hasFiles = (await Promise.all(docs.map((d) => byIndex('files', 'by_doc', d.id)))).some((f) => f.length);
  if (hasFiles) throw new Error('This applicant has uploaded files. Delete their files first.');
  await run(['cases', 'documents', 'events'], 'readwrite', (t) => {
    t.objectStore('cases').put({ ...c, memberIds: c.memberIds.filter((id) => id !== clientId), updatedAt: nowISO() });
    for (const d of docs) t.objectStore('documents').delete(d.id);
    t.objectStore('events').put(evt(caseId, 'system', 'Applicant removed from case'));
  });
}

export async function deleteCase(id) {
  const payments = await byIndex('payments', 'by_case', id);
  if (payments.some((p) => !p.voided)) throw new Error('This case has payments. Mark it as withdrawn instead, so the money stays on record.');
  return run(['cases', 'documents', 'files', 'appointments', 'tasks', 'events', 'expenses'], 'readwrite', (t) => purgeCases(t, [id]));
}

// ---------- Documents ----------
export async function addCustomDoc(caseId, { label, category, scope, ownerId, required }) {
  const c = await getCase(caseId);
  const owner = ownerId || c.clientId;
  const doc = customDoc({ label, category, scope, required, attest: false }, caseId, owner, nowISO());
  await writeMany([{ s: 'documents', put: doc }, { s: 'events', put: evt(caseId, 'doc', `Checklist item added: ${label}`) }]);
  return doc;
}

export async function setDocStatus(docId, status, note) {
  const d = await get('documents', docId);
  if (!d) return;
  const next = { ...d, status, updatedAt: nowISO(), ...(note !== undefined ? { note } : {}) };
  const label = { missing: 'Missing', received: 'Received', verified: 'Verified', rejected: 'Needs fix', na: 'Not needed' }[status];
  await writeMany([{ s: 'documents', put: next }, { s: 'events', put: evt(d.caseId, 'doc', `${d.label}: ${label}`) }]);
  return next;
}

export async function updateDoc(docId, patch) {
  const d = await get('documents', docId);
  if (!d) return;
  await put('documents', { ...d, ...patch, updatedAt: nowISO() });
}

export async function toggleAttest(docId, step) {
  const d = await get('documents', docId);
  if (!d) return;
  const has = d.attest.includes(step);
  const attest = has ? d.attest.filter((s) => s !== step) : [...d.attest, step];
  await put('documents', { ...d, attest, updatedAt: nowISO() });
}

export async function deleteDoc(docId) {
  const d = await get('documents', docId);
  if (!d) return;
  const files = await byIndex('files', 'by_doc', docId);
  await writeMany([
    ...files.map((f) => ({ s: 'files', del: f.id })),
    { s: 'documents', del: docId },
    { s: 'events', put: evt(d.caseId, 'doc', `Checklist item removed: ${d.label}`) },
  ]);
}

export const listFilesForDoc = (docId) => byIndex('files', 'by_doc', docId);
export const listFilesForCase = (caseId) => byIndex('files', 'by_case', caseId);
export const getFile = (id) => get('files', id);

export async function addFiles(docId, fileList) {
  const doc = await get('documents', docId);
  if (!doc) throw new Error('Document not found.');
  const max = CONFIG.MAX_UPLOAD_MB * 1024 * 1024;
  const now = nowISO();
  const ops = [];
  for (const f of Array.from(fileList)) {
    if (f.size > max) throw new Error(`${f.name} is larger than ${CONFIG.MAX_UPLOAD_MB} MB.`);
    const out = await compressImage(f);
    ops.push({ s: 'files', put: { id: uid('file'), docId, caseId: doc.caseId, name: out.name || f.name, type: out.type || f.type, size: out.size, blob: out, addedAt: now } });
  }
  if (!ops.length) return 0;
  const status = doc.status === 'missing' || doc.status === 'rejected' ? 'received' : doc.status;
  ops.push({ s: 'documents', put: { ...doc, status, updatedAt: now } });
  ops.push({ s: 'events', put: evt(doc.caseId, 'doc', `Uploaded ${ops.length - 1} file(s) for ${doc.label}`) });
  await writeMany(ops);
  return ops.length - 2;
}

export const deleteFile = (id) => del('files', id);

// ---------- Payments ----------
export const listPayments = () => all('payments');
export const paymentsForCase = (caseId) => byIndex('payments', 'by_case', caseId);

export async function addPayment(data) {
  const year = new Date().getFullYear();
  let receiptNo = '';
  const rec = {
    id: uid('pay'), caseId: data.caseId, clientId: data.clientId, date: data.date || todayISO(),
    amount: num(data.amount), method: data.method || 'Cash', reference: data.reference || '', note: data.note || '',
    voided: false, createdAt: nowISO(),
  };
  if (!(rec.amount > 0)) throw new Error('Enter an amount greater than zero.');
  await run(['meta', 'payments', 'events'], 'readwrite', async (t) => {
    const n = await nextSeq(t, `receiptSeq:${year}`);
    receiptNo = `RC-${year}-${String(n).padStart(4, '0')}`;
    rec.receiptNo = receiptNo;
    t.objectStore('payments').put(rec);
    t.objectStore('events').put(evt(rec.caseId, 'payment', `Payment ${money(rec.amount)} via ${rec.method} · ${receiptNo}`));
  });
  return rec;
}

export async function voidPayment(id, reason) {
  const p = await get('payments', id);
  if (!p || p.voided) return;
  await writeMany([
    { s: 'payments', put: { ...p, voided: true, voidReason: reason, voidedAt: nowISO() } },
    { s: 'events', put: evt(p.caseId, 'payment', `Payment ${p.receiptNo} voided${reason ? `: ${reason}` : ''}`) },
  ]);
}

// ---------- Expenses ----------
export const listExpenses = () => all('expenses');
export async function saveExpense(data) {
  const base = data.id ? (await get('expenses', data.id)) || {} : {};
  const rec = { createdAt: nowISO(), ...base, ...data, id: data.id || uid('exp'), amount: num(data.amount) };
  if (!(rec.amount > 0)) throw new Error('Enter an amount greater than zero.');
  await put('expenses', rec);
  return rec;
}
export const deleteExpense = (id) => del('expenses', id);

// ---------- Appointments & tasks ----------
export const listAppointments = () => all('appointments');
export const listTasks = () => all('tasks');

export async function saveAppointment(data) {
  const base = data.id ? (await get('appointments', data.id)) || {} : {};
  const rec = { status: 'scheduled', ...base, ...data, id: data.id || uid('apt') };
  const ops = [{ s: 'appointments', put: rec }];
  if (!data.id && rec.caseId) ops.push({ s: 'events', put: evt(rec.caseId, 'appointment', `Appointment booked: ${rec.type} on ${rec.date}${rec.time ? ` at ${rec.time}` : ''}`) });
  await writeMany(ops);
  return rec;
}
export async function setAppointmentStatus(id, status) {
  const a = await get('appointments', id);
  if (!a) return;
  const ops = [{ s: 'appointments', put: { ...a, status } }];
  if (a.caseId) ops.push({ s: 'events', put: evt(a.caseId, 'appointment', `${a.type} (${a.date}) marked ${status}`) });
  await writeMany(ops);
}
export const deleteAppointment = (id) => del('appointments', id);

export async function saveTask(data) {
  const base = data.id ? (await get('tasks', data.id)) || {} : {};
  const rec = { done: false, createdAt: nowISO(), ...base, ...data, id: data.id || uid('tsk') };
  await put('tasks', rec);
  return rec;
}
export async function toggleTask(id) {
  const t = await get('tasks', id);
  if (!t) return;
  await put('tasks', { ...t, done: !t.done, doneAt: !t.done ? nowISO() : '' });
}
export const deleteTask = (id) => del('tasks', id);

// ---------- Partners (agents / sub-agents / referrers) ----------
export const listPartners = () => all('partners');
export async function savePartner(data) {
  const base = data.id ? (await get('partners', data.id)) || {} : {};
  const rec = { active: true, createdAt: nowISO(), ...base, ...data, id: data.id || uid('pt'), commissionValue: num(data.commissionValue) };
  await put('partners', rec);
  return rec;
}
export async function deletePartner(id) {
  const cases = await all('cases');
  if (cases.some((c) => c.partnerId === id)) throw new Error('This partner has cases. Mark the partner as inactive instead.');
  return del('partners', id);
}

// ---------- Events / timeline ----------
export const eventsForCase = async (caseId) => (await byIndex('events', 'by_case', caseId)).sort((a, b) => (a.at < b.at ? 1 : -1));
export async function addNote(caseId, text) {
  await put('events', { ...evt(caseId, 'note', text) });
}
export async function listRecentEvents(limit = 40) {
  const rows = await all('events');
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

// ---------- Search ----------
export async function searchAll(q) {
  const term = q.trim().toLowerCase();
  if (!term) return { clients: [], cases: [] };
  const digits = term.replace(/\D/g, '');
  const useDigits = digits.length >= 4;
  const clients = (await all('clients')).filter((c) => (c.name || '').toLowerCase().includes(term)
    || (c.passportNo || '').toLowerCase().includes(term)
    || (useDigits && ((c.cnic || '').replace(/\D/g, '').includes(digits) || (c.phone || '').replace(/\D/g, '').includes(digits)))).slice(0, 12);
  const cases = (await all('cases')).filter((c) => (c.caseNo || '').toLowerCase().includes(term)
    || (c.countryName || '').toLowerCase().includes(term)).slice(0, 12);
  return { clients, cases };
}

// ---------- Money & progress (pure helpers) ----------
export function caseBilled(c) {
  const f = c.fees || {};
  return sum([f.consultancy, f.government, f.courier, f.other]);
}
export function caseMoney(c, payments) {
  const billed = caseBilled(c);
  const paid = sum(payments.filter((p) => p.caseId === c.id && !p.voided), (p) => p.amount);
  return { billed, paid, due: Math.max(0, billed - paid), credit: Math.max(0, paid - billed) };
}
export function docProgress(docs) {
  const req = docs.filter((d) => d.required && d.status !== 'na');
  const done = req.filter((d) => d.status === 'received' || d.status === 'verified');
  const verified = req.filter((d) => d.status === 'verified');
  const missing = req.filter((d) => d.status === 'missing' || d.status === 'rejected');
  return { total: req.length, done: done.length, verified: verified.length, missing: missing.length, pct: pct(done.length, req.length) };
}

export function partnerCommission(p, cases, expenses) {
  const mine = cases.filter((c) => c.partnerId === p.id && !['refused', 'withdrawn'].includes(c.outcome));
  const accrued = sum(mine, (c) => {
    const override = c.commissionOverride;
    const value = override !== null && override !== undefined ? Number(override) : Number(p.commissionValue) || 0;
    if (p.commissionType === 'fixed') return value;
    return ((Number(c.fees?.consultancy) || 0) * value) / 100;
  });
  const paid = sum(expenses.filter((e) => e.partnerId === p.id && e.category === 'Commission (partner)'), (e) => e.amount);
  return { cases: mine.length, accrued, paid, payable: Math.max(0, accrued - paid) };
}

export const daysUntilTravel = (c) => (c.travelDate ? diffDays(todayISO(), c.travelDate) : null);

// Checks passport validity against the travel date plus the minimum months set in Settings.
export function passportIssue(client, travelDate, minMonths = 6) {
  if (!client?.passportExpiry) return null;
  if (!travelDate) {
    return diffDays(todayISO(), client.passportExpiry) < 183 ? `Passport expires on ${client.passportExpiry}. Check validity before applying.` : null;
  }
  const limit = addMonths(travelDate, minMonths);
  if (client.passportExpiry < limit) return `Passport expires ${client.passportExpiry}. Many embassies need it valid ${minMonths} months after travel (until ${limit}).`;
  return null;
}

// Full snapshot for dashboards and reports (no file blobs).
export async function loadSnapshot() {
  const [clients, cases, documents, payments, expenses, appointments, tasks, partners, catalog, events] = await Promise.all([
    all('clients'), all('cases'), all('documents'), all('payments'), all('expenses'), all('appointments'), all('tasks'), all('partners'), all('catalog'), all('events'),
  ]);
  return { clients, cases, documents, payments, expenses, appointments, tasks, partners, catalog, events };
}

export { OUTCOMES };
