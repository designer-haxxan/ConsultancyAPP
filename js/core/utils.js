// Shared helpers: escaping, ids, dates, PKR money, Pakistani CNIC/phone rules, files and CSV.
import { CONFIG } from '../config.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const nowISO = () => new Date().toISOString();
export const monthKey = (iso = todayISO()) => iso.slice(0, 7);

export function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(iso, n) {
  const d = parseISO(iso) || new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function addMonths(iso, n) {
  const d = parseISO(iso) || new Date();
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}
// Whole days from a to b (b - a). Both are YYYY-MM-DD.
export function diffDays(a, b) {
  const A = parseISO(a); const B = parseISO(b);
  if (!A || !B) return null;
  return Math.round((B - A) / 86400000);
}

const fmtDateObj = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTimeObj = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
export function fmtDate(iso) {
  const d = typeof iso === 'string' ? parseISO(iso) : iso;
  return d && !isNaN(d) ? fmtDateObj.format(d) : '—';
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : `${fmtDateObj.format(d)}, ${fmtTimeObj.format(d)}`;
}
export function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1));
}

// Human label for a date relative to today: "Today", "Tomorrow", "in 4 days", "3 days overdue".
export function relDays(iso) {
  const n = diffDays(todayISO(), iso);
  if (n === null) return { text: '—', tone: 'muted' };
  if (n === 0) return { text: 'Today', tone: 'warn' };
  if (n === 1) return { text: 'Tomorrow', tone: 'info' };
  if (n === -1) return { text: 'Yesterday', tone: 'danger' };
  if (n > 1) return { text: `In ${n} days`, tone: 'muted' };
  return { text: `${-n} days overdue`, tone: 'danger' };
}

const moneyFmt = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
// Pakistani rupee formatting with lakh grouping: Rs 1,25,000
export function money(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? '-' : ''}Rs ${moneyFmt.format(Math.abs(v))}`;
}
export const moneyNum = (n) => moneyFmt.format(Math.round(Number(n) || 0));
export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// CNIC: 13 digits written as 12345-1234567-1
export function cleanCNIC(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}
export const isValidCNIC = (v) => /^\d{5}-\d{7}-\d$/.test(String(v || ''));

// Pakistani mobile numbers: 03XX-XXXXXXX (local) or +92 3XX XXXXXXX. Returns local form or ''.
export function normalizePhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0092')) d = d.slice(4);
  else if (d.startsWith('92') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('3')) d = `0${d}`;
  return d;
}
export const isValidPhone = (v) => /^03\d{9}$/.test(normalizePhone(v));
export const pkPhoneHint = 'Format: 03XX XXXXXXX';

// WhatsApp click-to-chat link with a prefilled message (opens the user's WhatsApp; nothing is sent by the app).
export function waLink(phone, text = '') {
  const n = normalizePhone(phone);
  if (!n) return null;
  const intl = `92${n.slice(1)}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ----- CSV & downloads -----
export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadText(filename, text, mime = 'text/plain') {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}
export function downloadCSV(filename, rows) {
  downloadText(filename, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
}
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const readAsDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
export async function dataURLToBlob(dataURL) {
  return (await fetch(dataURL)).blob();
}

// Resizes large photos/scans before storing (keeps the device database small). PDFs and other files pass through.
export async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const side = CONFIG.IMAGE_MAX_SIDE;
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900 * 1024) { bitmap.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export function fileSize(bytes) {
  if (!bytes) return '0 KB';
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
