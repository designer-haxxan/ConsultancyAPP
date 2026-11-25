// Prints a generated HTML document (receipts, file cover sheets, statements) through a hidden print area.
import { esc } from './utils.js';

export function printHTML(html, title = 'VisaFlow') {
  const root = document.getElementById('print-root');
  if (!root) return;
  const previous = document.title;
  root.innerHTML = `<div class="print-doc">${html}</div>`;
  document.title = title;
  const cleanup = () => {
    root.innerHTML = '';
    document.title = previous;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Let images and fonts settle before the print dialog opens.
  setTimeout(() => window.print(), 120);
}

export const printHead = (agency, sub = '') => `
  <div class="print-head">
    <div>
      <div class="print-brand">${esc(agency.agencyName || 'Your visa consultancy')}</div>
      <div class="print-meta">${[agency.address, agency.city].filter(Boolean).map(esc).join(', ')}</div>
      <div class="print-meta">${[agency.phone && `Tel: ${esc(agency.phone)}`, agency.email && esc(agency.email), agency.licenceNo && `Licence: ${esc(agency.licenceNo)}`, agency.ntn && `NTN: ${esc(agency.ntn)}`].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="print-sub">${sub}</div>
  </div>`;
