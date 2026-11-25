# VisaFlow Pakistan

Visa consultancy software for Pakistani agencies. It runs in the browser as an installable, offline-first PWA, with no build step.

It covers the whole file lifecycle: client intake, family applicants, visa checklists for each country, document uploads and attestation tracking, appointments, fees, PKR receipts, WhatsApp updates, decisions and refusal history, partner commissions, and reports.

HTML5 · ES modules · vanilla CSS · IndexedDB · Service Worker · Bootstrap Icons (CDN)

## What it does

| Area | Features |
|---|---|
| **Dashboard** | Greeting, KPI tiles (active files, waiting on documents, appointments this week, collected this month, outstanding balance, approval rate), pipeline funnel, 6-month collections chart, a "needs attention" list (overdue tasks, tomorrow's appointments, passport validity, missing documents), recent activity, backup reminder. |
| **Visa pipeline** | Kanban board with 10 stages (Enquiry → Collecting documents → Documents verified → Form & fee ready → Appointment/biometrics → Submitted → Under processing → Decision → Passport delivered → Closed). Drag cards between stages on desktop. List view with filters. |
| **Visa file** | Applicants (main + family members, each with personal documents), stage stepper, fee breakdown (consultancy, embassy/VFS, courier, other), balance due, travel and return dates, decision (approved with validity, or refused with reason), printable file cover sheet, WhatsApp update composer (opens WhatsApp with an editable message), timeline of every action. |
| **Documents** | Checklist per applicant and whole-file items. Status per item (Missing, Received, Verified, Needs fix, Not needed). Upload photos or PDFs (phone camera supported), compressed on the device. Preview and delete files. Attestation chain tracking for NADRA/board, HEC, MOFA and embassy stages. Custom checklist items. Document queue across all files, with a "to verify" view. |
| **Clients** | Profile with CNIC, passport (number, issue, expiry), contact, address, Urdu name, source and referral partner. Passport validity warnings against travel date. Refusal history. Family links. |
| **Appointments & tasks** | Agenda grouped by overdue, today, tomorrow, this week and later. VFS/centre slots, biometrics, interviews, pickups, follow-up tasks. |
| **Money** | Payments with sequential receipt numbers (RC-2026-0001) and the amount in words (Lakh/Crore). Methods: Cash, bank transfer, JazzCash, Easypaisa, Raast, card, cheque. Void with a reason. Expenses by category. Statement printing. |
| **Partners & agents** | Sub-agents and referrers. Commission as a percent of the consultancy fee or a fixed amount per file, with per-file overrides. Commission earned, paid and payable. Record payouts. |
| **Visa catalogue** | 17 countries and 29 visa types seeded (UK, Schengen, US, Canada, Australia, UAE, Saudi Arabia, Qatar, Oman, Türkiye, Malaysia, China, Japan, South Korea, New Zealand, Thailand, Sri Lanka). Add countries and visa types, edit checklists from the library, and add your own items. Changes apply to new files only. |
| **Reports** | Pick any period. Files opened, approval rate, billed, collected, expenses, net, outstanding. Approvals by country, visa category, 12-month collections, commissions and money still owed. CSV export. |
| **Settings** | Consultancy profile (licence, SECP, NTN, receipt footer, refund policy), minimum passport validity, team members, password change, full and records-only backups (JSON, with checksum), restore with validation and typed confirmation, storage persistence request, erase-all. |
| **Everywhere** | Dark mode, search (Ctrl+K) across clients, CNICs, phones, passport numbers and file numbers, quick-add menu, responsive layout (sidebar on desktop, bottom navigation and bottom sheets on phones), animated counters and transitions, reduced-motion support. |

Pakistan-specific details: CNIC (13-digit) and mobile (03XX) validation and formatting, PKR with lakh grouping, WhatsApp click-to-chat links, Urdu name field (Jameel Noori Nastaleeq font), family registration certificates and NADRA/HEC/MOFA attestation steps, Protector of Emigrants (BE&OE) clearance and GAMCA medical checklists for Gulf work visas.

## Research behind the design

Pain points the app is built around (from public reporting, 2010–2026):

- **Fake and unregistered agents.** Reports describe agents who run under several names without a licence, and the FIA has arrested agents in 2026. The app keeps the fee breakdown, receipts and a signed-off file cover, so clients can see what they paid and for what.
- **Appointment slots resold.** Slots on VFS and third-party booking sites are reported to be resold at a markup. The app records each slot's date, centre and reference, so the file shows exactly what was booked.
- **Documents scattered across WhatsApp.** Checklists per applicant, a "to verify" queue, and one-tap WhatsApp requests reduce chasing.
- **Attestation chains are long.** NADRA/board → HEC → MOFA → embassy steps are tracked per document.
- **Refusals follow the client.** Refusals are stored in the client's history with the reason from the letter.
- **Passport validity.** The app warns when validity is short for the travel date, using the minimum months set in Settings.
- **Cash-heavy payments.** Each payment has a receipt number, method and reference. Voids keep a reason on record.

Sources: [Pakistan Today: no regulation for consultants](https://archive.pakistantoday.com.pk/2011/08/06/no-check-on-immigration-consultants/?amp=1), [ProPakistani on VFS and agents](https://propakistani.pk/2022/10/20/no-more-schengen-visas-is-vfs-global-facilitating-agent-mafia-in-pakistan/), [Dawn: FIA arrests immigration firm owner](https://www.dawn.com/news/1736085/fia-nabs-immigration-firm-owner-for-defrauding-people), [MOFA attestation SOP and consular services](https://mofa.gov.pk/consular-service-attestation-of-documents), [HEC degree attestation](https://www.hec.gov.pk/english/services/students/DAS/Pages/Degree-Attestation.aspx), [BE&OE Emigration Rules 1979](https://beoe.gov.pk/files/legal-framework/Emigration_Rules_1979_Updated_2023.pdf).

The checklists and notes are starting templates. Embassies, VFS and TLScontact change requirements, fees and slot rules often. Verify each list against the official site before you rely on it. The app stores no fee schedules.

## Architecture

```
index.html              App shell: splash, sign-in / setup, sidebar, topbar, bottom nav, sheet and toast roots
manifest.json           PWA manifest
service-worker.js       Precache of the shell; network-first for app files, cache-first for the icon font
css/app.css             Design tokens (light and dark), components, layout, print styles, motion
icons/                  App icon (SVG) and PNG sizes
fonts/                  Jameel Noori Nastaleeq (Urdu names and print), licence: free for Urdu use
js/config.js            App name, IndexedDB name, session length, upload limits, currency
js/app.js               Boot, sign-in and setup, session lock, router, search, quick-add, theme
js/db/idb.js            IndexedDB wrapper; each multi-record change runs in one transaction
js/services/auth.js     Local owner account (PBKDF2-SHA256), sessions, lockout after failed attempts
js/services/data.js     Business rules: cases, documents, files, payments, expenses, partners, commissions
js/services/catalog-seed.js   Document library, starter countries and visa types
js/services/backup.js   Backup (JSON + checksum) and validated restore
js/core/                utils (dates, PKR, CNIC, phone, WhatsApp links, CSV, image compression), ui, print, constants
js/modules/             dashboard, cases (board, list, file), clients, documents, calendar, money, partners,
                        reports, catalog, settings, forms (shared sheets)
```

### Data

Everything lives in IndexedDB `visaflow_pk` on the device. Stores: `clients`, `cases`, `documents`, `files` (uploaded documents as blobs), `payments`, `expenses`, `appointments`, `tasks`, `partners`, `events` (timeline), `catalog` (countries and visa types), `meta` (settings, counters, sign-in).

- **Case checklists are copied** onto each file when it is opened. Editing the catalogue later does not change files already in progress.
- **Receipt and file numbers** come from counters inside the same transaction that saves the record, so a failed save does not use up a number.
- **Deleting** a client or file is blocked when payments exist. Mark it withdrawn instead, so the money stays on record.

### Sign-in

- The first run creates a local owner account. The password is stored only as a PBKDF2-SHA256 hash (210,000 iterations, random salt).
- The session lasts 12 hours on the device. The screen locks when the session ends or on demand.
- After 5 wrong passwords the sign-in pauses for 30 seconds.
- Backups never contain the password hash. Restoring keeps the sign-in of the device you restore on.

## Run it locally

The app uses ES modules, the service worker and Web Crypto, so it must be served over HTTP. `localhost` is fine.

```powershell
python -m http.server 8766
```

Open http://localhost:8766 and create the owner account.

## Deploy

Host the folder on any HTTPS static host (GitHub Pages, IIS, Netlify). Every path is relative, so it also works from a sub-path.

Before you deploy, check `CNAME`. It currently points to `pos.eposwala.com`, which is the POS app's address. Put this app on its own domain or subdomain so the two do not clash.

When you change any file, bump `VERSION` in `service-worker.js` so installed copies update.

## Backup, restore and data safety

- **Data lives on the device only.** There is no cloud sync and no server copy. Back up weekly. The dashboard reminds you after 7 days.
- **Full backup** includes uploaded documents. **Records only** is smaller and quicker.
- **Restore** validates the format, version, record counts, record IDs and checksum before anything changes. It then replaces all data in one transaction. Your sign-in on that device is kept.
- **Browsers can clear storage** when a device is low on space. Settings → *Ask browser to keep my data* requests persistent storage.

## Known limits

- **No multi-device sync or multi-user accounts.** One owner per device. Several staff members need a shared backup routine or a future server version.
- **The sign-in protects the screen, not the data.** Anyone with the device and developer tools can read IndexedDB. Use a device lock screen.
- **Requirements and fees are templates.** Verify them with each embassy or VFS.
- **No payment gateway.** JazzCash, Easypaisa and Raast are recorded as payment methods, not charged.
- **No e-mail or SMS.** WhatsApp messages open in the user's WhatsApp so they can be edited and sent by hand.
- **Attestation and appointment bookings are tracked, not made.** The app does not book VFS slots or submit to government portals.
- **Printing** uses the browser print dialog. Test receipt sizes on your printer.

## Next steps worth considering

- A small sync server (or a shared folder backup) for multiple staff.
- Per-user accounts with roles (owner, processor, accountant).
- Automatic WhatsApp Business API reminders for appointments and missing documents.
- Bulk import of clients from Excel.
