// Backup & restore: one JSON file with every record (and optionally every uploaded document).
// Restore validates the whole file first and only then replaces the data, in one transaction.
import { CONFIG } from '../config.js';
import { dumpAll, get, replaceAll, STORES } from '../db/idb.js';
import { readAsDataURL, dataURLToBlob, nowISO, downloadText } from '../core/utils.js';

const FORMAT = 'visaflow-backup';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildBackup({ withFiles = true } = {}) {
  const raw = await dumpAll();
  const data = {};
  for (const name of Object.keys(STORES)) {
    if (name === 'files') {
      data.files = [];
      for (const f of raw.files || []) {
        const { blob, ...rest } = f;
        data.files.push({ ...rest, blobData: withFiles && blob ? await readAsDataURL(blob) : null });
      }
    } else if (name === 'meta') {
      // The password hash never leaves the device: the backup holds settings and counters only.
      data.meta = (raw.meta || []).filter((r) => r.id !== 'auth');
    } else {
      data[name] = raw[name] || [];
    }
  }
  const counts = Object.fromEntries(Object.keys(STORES).map((n) => [n, data[n].length]));
  const body = JSON.stringify(data);
  const checksum = await sha256Hex(body);
  const header = {
    format: FORMAT,
    backupVersion: CONFIG.BACKUP_VERSION,
    appVersion: CONFIG.APP_VERSION,
    schemaVersion: CONFIG.SCHEMA_VERSION,
    createdAt: nowISO(),
    includesFiles: withFiles,
    counts,
    checksum,
  };
  return `{"header":${JSON.stringify(header)},"data":${body}}`;
}

export async function downloadBackup(withFiles) {
  const text = await buildBackup({ withFiles });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadText(`visaflow-backup-${stamp}${withFiles ? '' : '-records'}.json`, text, 'application/json');
  return text.length;
}

// Parses and checks a backup file. Returns { header, data, summary } or throws with a readable reason.
export async function readBackup(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not valid JSON, so it is not a VisaFlow backup.');
  }
  const { header, data } = parsed || {};
  if (!header || header.format !== FORMAT) throw new Error('This is not a VisaFlow backup file.');
  if (header.backupVersion > CONFIG.BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  if (!data || typeof data !== 'object') throw new Error('The backup has no data section.');
  for (const name of Object.keys(STORES)) {
    if (!Array.isArray(data[name])) throw new Error(`Backup is missing the "${name}" records.`);
    if (header.counts && header.counts[name] !== undefined && header.counts[name] !== data[name].length) {
      throw new Error(`The file looks cut short: "${name}" has ${data[name].length} records but the header says ${header.counts[name]}.`);
    }
    for (const rec of data[name]) {
      if (!rec || typeof rec.id === 'undefined') throw new Error(`A record in "${name}" has no id.`);
    }
  }
  if (header.checksum) {
    const body = JSON.stringify(data);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== header.checksum) throw new Error('Checksum does not match. The file was changed or damaged.');
  }
  const summary = Object.fromEntries(Object.keys(STORES).map((n) => [n, data[n].length]));
  return { header, data, summary };
}

// Replaces all data with the backup. This device's sign-in is kept, because backups never contain a password hash.
export async function restoreBackup(parsed) {
  const currentAuth = await get('meta', 'auth');
  const rows = {};
  for (const name of Object.keys(STORES)) {
    if (name === 'files') {
      rows.files = [];
      for (const f of parsed.data.files) {
        const { blobData, ...rest } = f;
        rows.files.push({ ...rest, blob: blobData ? await dataURLToBlob(blobData) : new Blob([]) });
      }
    } else if (name === 'meta') {
      rows.meta = [...parsed.data.meta.filter((r) => r.id !== 'auth'), ...(currentAuth ? [currentAuth] : [])];
    } else {
      rows[name] = parsed.data[name];
    }
  }
  await replaceAll(rows);
}
