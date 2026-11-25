// Settings: consultancy profile, team, receipts and policies, password, backup & restore, and reset.
import * as D from '../services/data.js';
import * as Auth from '../services/auth.js';
import { downloadBackup, readBackup, restoreBackup } from '../services/backup.js';
import * as UI from '../core/ui.js';
import { esc, normalizePhone, isValidPhone, fmtDateTime, fileSize } from '../core/utils.js';
import { replaceAll } from '../db/idb.js';
import { CONFIG, storageKey } from '../config.js';

export async function render(root, ctx) {
  ctx.setTitle('Settings & backup');
  const s = await D.getSettings();
  const acc = await Auth.getAccount();
  let storage = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) storage = `${fileSize(est.usage || 0)} used of about ${fileSize(est.quota || 0)} available`;
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    storage += persisted ? ' · Storage is protected from automatic cleanup.' : ' · Storage can be cleared by the browser if the device runs low. Back up regularly.';
  } catch { storage = 'Storage status unavailable in this browser.'; }

  root.innerHTML = `
    ${UI.pageHead({ title: 'Settings & backup', sub: 'Your consultancy profile, receipts, team and data safety.', actions: '' })}
    <div class="settings-grid">
      <form class="panel reveal" id="profile" novalidate>
        <div class="panel-head"><h2>Consultancy profile</h2><button class="btn btn-primary btn-sm" type="submit">Save</button></div>
        <p class="muted small">Printed on receipts and file cover sheets. Keep licence and NTN current.</p>
        <div class="form-grid">
          ${UI.field({ name: 'agencyName', label: 'Consultancy name', value: s.agencyName, required: true, full: true })}
          ${UI.field({ name: 'ownerName', label: 'Owner name', value: s.ownerName })}
          ${UI.field({ name: 'phone', label: 'Office phone', value: s.phone, mask: 'phone', placeholder: '0300 1234567' })}
          ${UI.field({ name: 'whatsapp', label: 'WhatsApp number', value: s.whatsapp, mask: 'phone', placeholder: '0300 1234567' })}
          ${UI.field({ name: 'email', label: 'Email', type: 'email', value: s.email })}
          ${UI.field({ name: 'city', label: 'City', value: s.city })}
          ${UI.field({ name: 'address', label: 'Office address', type: 'textarea', rows: 2, value: s.address, full: true })}
          ${UI.field({ name: 'licenceNo', label: 'Licence / registration no.', value: s.licenceNo })}
          ${UI.field({ name: 'secpNo', label: 'SECP / company no.', value: s.secpNo })}
          ${UI.field({ name: 'ntn', label: 'NTN', value: s.ntn })}
          ${UI.field({ name: 'minPassportMonths', label: 'Passport must be valid for (months after travel)', type: 'number', num: true, min: 0, max: 36, value: s.minPassportMonths, hint: 'Most embassies ask for 6 months. Check each country.' })}
          ${UI.field({ name: 'staff', label: 'Team members (comma separated)', value: (s.staff || []).join(', '), full: true, placeholder: 'e.g. Ali, Sana, Hamza', hint: 'Shown when assigning files.' })}
          ${UI.field({ name: 'receiptFooter', label: 'Receipt footer', type: 'textarea', rows: 2, value: s.receiptFooter, full: true })}
          ${UI.field({ name: 'refundPolicy', label: 'Refund policy (printed on the file cover)', type: 'textarea', rows: 3, value: s.refundPolicy, full: true })}
        </div>
      </form>

      <div class="stack">
        <form class="panel reveal" id="pw" novalidate>
          <div class="panel-head"><h2>Password</h2></div>
          <p class="muted small">Signed in as <b>${esc(acc?.username || '')}</b>. Use at least 8 characters.</p>
          <div class="form-grid">
            ${UI.field({ name: 'current', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password', full: true })}
            ${UI.field({ name: 'next', label: 'New password', type: 'password', required: true, autocomplete: 'new-password' })}
            ${UI.field({ name: 'confirm', label: 'Repeat new password', type: 'password', required: true, autocomplete: 'new-password' })}
          </div>
          <div class="mt-3"><button class="btn btn-ghost" type="submit">Change password</button></div>
        </form>

        <section class="panel reveal" style="--d:60ms">
          <div class="panel-head"><h2>Backup</h2>${s.lastBackupAt ? `<span class="chip chip-success">${UI.icon('check2')} ${esc(fmtDateTime(s.lastBackupAt))}</span>` : '<span class="chip chip-warn">Never backed up</span>'}</div>
          <p class="muted small">Your data is on this device only. Save a backup file to Google Drive, email or a USB drive, at least once a week.</p>
          <div class="row-gap wrap">
            <button class="btn btn-primary" data-act="backup-full">${UI.icon('cloud-arrow-down')} Full backup (with documents)</button>
            <button class="btn btn-ghost" data-act="backup-lite">${UI.icon('filetype-json')} Records only</button>
          </div>
          <div class="row-gap wrap mt-3">
            <label class="btn btn-ghost file-btn">${UI.icon('cloud-arrow-up')} Restore from file<input type="file" accept="application/json,.json" id="restore-file" hidden></label>
          </div>
          <p class="side-note">${esc(storage)}</p>
          <button class="btn btn-ghost btn-sm mt-2" data-act="persist">${UI.icon('shield-check')} Ask browser to keep my data</button>
        </section>

        <section class="panel danger-panel reveal" style="--d:120ms">
          <div class="panel-head"><h2>Reset this device</h2></div>
          <p class="muted small">Deletes every client, file, document, payment and the sign-in on this device. Make a backup first.</p>
          <button class="btn btn-danger" data-act="reset">${UI.icon('exclamation-octagon')} Erase all data</button>
        </section>
      </div>
    </div>
    <p class="hint-line">${UI.icon('info-circle')} VisaFlow ${esc(CONFIG.APP_VERSION)} · data format v${CONFIG.BACKUP_VERSION}. Keep your own copy of the backup file.</p>`;

  root.querySelector('#profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.validateSpecial(e.target);
    if (!e.target.reportValidity()) return;
    const v = UI.readForm(e.target);
    if (v.phone && !isValidPhone(v.phone)) return UI.toast('Enter a valid office phone number', 'danger');
    await D.saveSettings({
      agencyName: v.agencyName, ownerName: v.ownerName, phone: normalizePhone(v.phone), whatsapp: normalizePhone(v.whatsapp),
      email: v.email, city: v.city, address: v.address, licenceNo: v.licenceNo, secpNo: v.secpNo, ntn: v.ntn,
      minPassportMonths: Math.max(0, Number(v.minPassportMonths) || 0), staff: v.staff.split(',').map((x) => x.trim()).filter(Boolean),
      receiptFooter: v.receiptFooter, refundPolicy: v.refundPolicy,
    });
    UI.toast('Profile saved');
    ctx.refresh();
  });
  root.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    const v = UI.readForm(e.target);
    try {
      if (v.next.length < 8) throw new Error('The new password must be at least 8 characters.');
      if (v.next !== v.confirm) throw new Error('The new passwords do not match.');
      await Auth.changePassword(v.current, v.next);
      e.target.reset();
      UI.toast('Password changed');
    } catch (err) { UI.toast(err.message, 'danger', 5000); }
  });
  root.querySelector('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = await readBackup(file);
      confirmRestore(parsed, ctx);
    } catch (err) { UI.toast(err.message, 'danger', 7000); }
  });

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'backup-full':
      case 'backup-lite': {
        const withFiles = b.dataset.act === 'backup-full';
        await downloadBackup(withFiles);
        await D.saveSettings({ lastBackupAt: new Date().toISOString() });
        UI.toast('Backup saved to your downloads');
        return ctx.refresh();
      }
      case 'persist': {
        const ok = await navigator.storage?.persist?.();
        UI.toast(ok ? 'Browser will keep this data' : 'Browser did not grant protection. Keep backups.', ok ? 'success' : 'warn', 5000);
        return ctx.refresh();
      }
      case 'reset': {
        const ok = await UI.typedConfirm('This erases every client, file, document, payment, expense and the sign-in on this device. It cannot be undone.', 'ERASE', { okLabel: 'Erase everything', title: 'Erase all data' });
        if (!ok) return;
        await replaceAll({ clients: [], cases: [], documents: [], files: [], payments: [], expenses: [], appointments: [], tasks: [], partners: [], events: [], catalog: [], meta: [] });
        try { localStorage.removeItem(storageKey('session')); localStorage.removeItem(storageKey('lock')); } catch { /* ignore */ }
        UI.toast('All data erased', 'info');
        setTimeout(() => location.reload(), 600);
        return undefined;
      }
      default:
    }
  };
}

function confirmRestore(parsed, ctx) {
  const { header, summary } = parsed;
  const rows = [['Clients', summary.clients], ['Visa files', summary.cases], ['Documents', summary.documents], ['Files', summary.files], ['Payments', summary.payments], ['Expenses', summary.expenses], ['Appointments', summary.appointments], ['Tasks', summary.tasks], ['Partners', summary.partners]];
  UI.openSheet({
    title: 'Restore this backup?', size: 'md',
    html: `<p>Backup made <b>${esc(fmtDateTime(header.createdAt))}</b>${header.includesFiles ? ' with documents' : ' (records only)'}.</p>
      <div class="kv two">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</div>
      <div class="notice notice-warn mt-3">${UI.icon('exclamation-triangle')}<span>Restoring <b>replaces</b> all data on this device. The current data is not merged. Your sign-in on this device is kept. Make a backup first if you need it.</span></div>
      <div class="field mt-3"><label class="field-label" for="rw">Type <b>RESTORE</b> to confirm</label><input class="input" id="rw" autocomplete="off"></div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-danger" type="button" data-ok disabled>Restore backup</button>`,
    onMount: (el, close) => {
      const input = el.querySelector('#rw'); const ok = el.querySelector('[data-ok]');
      input.addEventListener('input', () => { ok.disabled = input.value.trim() !== 'RESTORE'; });
      ok.addEventListener('click', async () => {
        ok.disabled = true;
        try {
          await restoreBackup(parsed);
          await D.seedCatalog();
          UI.toast('Backup restored. Sign in again to continue.', 'success', 4000);
          close(true);
          Auth.endSession();
          setTimeout(() => location.reload(), 700);
        } catch (err) {
          UI.toast(err.message || 'Restore failed. Nothing was changed.', 'danger', 6000);
          ok.disabled = false;
        }
      });
    },
  });
}
