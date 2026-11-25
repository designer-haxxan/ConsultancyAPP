// IndexedDB wrapper. Every multi-record change runs in ONE transaction, so a failure never leaves a half-saved case.
import { CONFIG } from '../config.js';

export const STORES = {
  clients: { indexes: [['by_name', 'name'], ['by_phone', 'phone'], ['by_cnic', 'cnic']] },
  cases: { indexes: [['by_client', 'clientId'], ['by_stage', 'stage'], ['by_country', 'country']] },
  documents: { indexes: [['by_case', 'caseId'], ['by_client', 'clientId']] },
  files: { indexes: [['by_doc', 'docId'], ['by_case', 'caseId']] },
  payments: { indexes: [['by_case', 'caseId'], ['by_client', 'clientId'], ['by_date', 'date']] },
  expenses: { indexes: [['by_date', 'date'], ['by_partner', 'partnerId'], ['by_case', 'caseId']] },
  appointments: { indexes: [['by_case', 'caseId'], ['by_date', 'date']] },
  tasks: { indexes: [['by_case', 'caseId'], ['by_due', 'due']] },
  partners: { indexes: [] },
  events: { indexes: [['by_case', 'caseId'], ['by_at', 'at']] },
  catalog: { indexes: [] },
  meta: { indexes: [] },
};

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('This browser does not support offline storage (IndexedDB).'));
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.SCHEMA_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, def] of Object.entries(STORES)) {
          const store = db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: 'id' });
          for (const [idx, path] of def.indexes) {
            if (!store.indexNames.contains(idx)) store.createIndex(idx, path);
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
      req.onblocked = () => reject(new Error('The database is open in another tab. Close other copies of the app and reload.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

const reqP = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
export { reqP };

// Runs fn(transaction) and waits for the commit. If fn throws, the whole transaction is rolled back.
export async function run(names, mode, fn) {
  const db = await openDB();
  const t = db.transaction(names, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error || new Error('Database error'));
    t.onabort = () => reject(t.error || new Error('Save was cancelled. Nothing was changed.'));
  });
  done.catch(() => {});
  let result;
  try {
    result = await fn(t);
  } catch (err) {
    try { t.abort(); } catch { /* already finished */ }
    await done.catch(() => {});
    throw err;
  }
  await done;
  return result;
}

export const get = (store, key) => run([store], 'readonly', (t) => reqP(t.objectStore(store).get(key)));
export const all = (store) => run([store], 'readonly', (t) => reqP(t.objectStore(store).getAll()));
export const byIndex = (store, index, value) => run([store], 'readonly', (t) => reqP(t.objectStore(store).index(index).getAll(value)));
export const put = (store, value) => run([store], 'readwrite', (t) => reqP(t.objectStore(store).put(value)));
export const del = (store, key) => run([store], 'readwrite', (t) => reqP(t.objectStore(store).delete(key)));

// Writes several records across stores in one transaction.
// ops: [{ s: 'store', put: record }, { s: 'store', del: key }]
export function writeMany(ops) {
  const names = [...new Set(ops.map((o) => o.s))];
  return run(names, 'readwrite', (t) => {
    const pending = ops.map((o) => {
      const st = t.objectStore(o.s);
      return o.del !== undefined ? reqP(st.delete(o.del)) : reqP(st.put(o.put));
    });
    return Promise.all(pending);
  });
}

// Clears and reloads whole stores (used by restore). rows: { storeName: [records] }
export function replaceAll(rows) {
  const names = Object.keys(STORES);
  return run(names, 'readwrite', async (t) => {
    for (const name of names) {
      const st = t.objectStore(name);
      await reqP(st.clear());
      for (const rec of rows[name] || []) await reqP(st.put(rec));
    }
  });
}

// Reads every store (used by backup). Files include their Blob.
export async function dumpAll() {
  const out = {};
  await run(Object.keys(STORES), 'readonly', async (t) => {
    for (const name of Object.keys(STORES)) out[name] = await reqP(t.objectStore(name).getAll());
  });
  return out;
}

// Small key-value settings held in the meta store as { id, value }.
export async function metaGet(id, fallback = null) {
  const rec = await get('meta', id);
  return rec ? rec.value : fallback;
}
export const metaSet = (id, value) => put('meta', { id, value });
