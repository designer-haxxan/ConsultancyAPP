// Sign-in through the eposwala account API (the same accounts the POS app uses).
//
//   POST {AUTH_API_BASE}/login   { username, password, deviceId }
//   2xx -> { token, expiresAt (unix ms), username }
//   !2xx -> { error: 'missing_fields' | 'invalid_credentials' | 'device_mismatch' | 'account_disabled' }
//
// The API binds each account to one device (deviceId). The password is sent to the API only and is never stored.
// The session (token + expiry) is kept on this device, so the app works offline until the session expires.
import { CONFIG, storageKey } from '../config.js';
import { metaGet, metaSet } from '../db/idb.js';

const SESSION_KEY = storageKey('session');
const DEVICE_KEY = storageKey('deviceId');

const ERRORS = {
  missing_fields: 'Enter your username and password.',
  invalid_credentials: 'Wrong username or password.',
  device_mismatch: `This account is linked to another device. Ask eposwala support to move it: ${CONFIG.SUPPORT_PHONE}.`,
  account_disabled: `This account is disabled. Contact eposwala support: ${CONFIG.SUPPORT_PHONE}.`,
};

// A random id per browser, created once. The API uses it for the one-device rule.
export function deviceId() {
  let id = null;
  try { id = localStorage.getItem(DEVICE_KEY); } catch { /* storage blocked */ }
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(DEVICE_KEY, id); } catch { /* ignore: a new id is created next time */ }
  }
  return id;
}

export async function signIn(username, password) {
  const user = String(username || '').trim();
  if (!user || !password) throw new Error(ERRORS.missing_fields);
  let res;
  try {
    res = await fetch(`${CONFIG.AUTH_API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password, deviceId: deviceId() }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error('Could not reach the sign-in server. Check the internet connection and try again.');
  }
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !body.token) {
    if (res.status >= 500) throw new Error('The sign-in server is unavailable right now. Try again later.');
    throw new Error(ERRORS[body.error] || 'Sign-in failed. Try again.');
  }
  const exp = Number(body.expiresAt) > Date.now() ? Number(body.expiresAt) : Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000;
  const session = { username: body.username || user, token: body.token, exp };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* session lasts this page load */ }
  sessionMemory = session;
  return session;
}

let sessionMemory = null;

export function currentSession() {
  let s = sessionMemory;
  if (!s) {
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { s = null; }
  }
  if (!s || !s.token || !s.exp || s.exp < Date.now()) return null;
  return s;
}

export function endSession() {
  sessionMemory = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// The account whose data this device holds: { username, name }. Null on a fresh device.
export const getAccount = () => metaGet('auth', null);

export async function saveAccount(account) {
  await metaSet('auth', { ...account, linkedAt: (await getAccount())?.linkedAt || new Date().toISOString() });
}

// Returns the username that owns the data on this device when it differs from `username`, otherwise null.
export async function ownerMismatch(username) {
  const acc = await getAccount();
  if (!acc || !acc.username) return null;
  return acc.username.toLowerCase() === String(username).toLowerCase() ? null : acc.username;
}
