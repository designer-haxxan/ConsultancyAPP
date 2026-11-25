// Local owner sign-in. The password is stored only as a PBKDF2-SHA256 hash in this browser's database.
// This protects the screen, not the data: anyone with the device and developer tools can read the database,
// so use a device lock screen as well.
import { CONFIG, storageKey } from '../config.js';
import { metaGet, metaSet } from '../db/idb.js';

const SESSION_KEY = storageKey('session');
const LOCK_KEY = storageKey('lock');
const enc = new TextEncoder();

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  if (!crypto?.subtle) throw new Error('This browser cannot secure the password. Open the app over HTTPS or localhost.');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return toB64(bits);
}

export async function hasAccount() {
  return !!(await metaGet('auth'));
}

export async function getAccount() {
  return metaGet('auth', null);
}

export async function createAccount({ username, password, name }) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = CONFIG.PBKDF2_ITERATIONS;
  const hash = await derive(password, salt, iterations);
  const account = { username: username.toLowerCase(), name, salt: toB64(salt), iterations, hash, createdAt: new Date().toISOString() };
  await metaSet('auth', account);
  startSession(account.username);
  return account;
}

export async function signIn(username, password) {
  const lock = readLock();
  if (lock.until > Date.now()) {
    const secs = Math.ceil((lock.until - Date.now()) / 1000);
    throw new Error(`Too many attempts. Wait ${secs} seconds and try again.`);
  }
  const acc = await getAccount();
  const ok = acc && acc.username === username.trim().toLowerCase()
    && (await derive(password, fromB64(acc.salt), acc.iterations)) === acc.hash;
  if (!ok) {
    const fails = lock.fails + 1;
    localStorage.setItem(LOCK_KEY, JSON.stringify({ fails: fails >= 5 ? 0 : fails, until: fails >= 5 ? Date.now() + 30000 : 0 }));
    throw new Error('Wrong username or password.');
  }
  localStorage.removeItem(LOCK_KEY);
  startSession(acc.username);
  return acc;
}

export async function changePassword(current, next) {
  const acc = await getAccount();
  if ((await derive(current, fromB64(acc.salt), acc.iterations)) !== acc.hash) throw new Error('The current password is wrong.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(next, salt, acc.iterations);
  await metaSet('auth', { ...acc, salt: toB64(salt), hash });
}

function readLock() {
  try { return { fails: 0, until: 0, ...JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') }; } catch { return { fails: 0, until: 0 }; }
}

export function startSession(username) {
  const exp = Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ username, exp })); } catch { /* storage blocked: session lasts this page load */ }
  sessionMemory = { username, exp };
}
let sessionMemory = null;

export function currentSession() {
  let s = sessionMemory;
  if (!s) {
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { s = null; }
  }
  if (!s || !s.exp || s.exp < Date.now()) return null;
  return s;
}

export function endSession() {
  sessionMemory = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
