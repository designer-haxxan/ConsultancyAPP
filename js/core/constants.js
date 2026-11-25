// Fixed lists used across the app: pipeline stages, visa categories, payment methods, etc.

// Pipeline stages in the order a visa file moves through a Pakistani consultancy.
export const STAGES = [
  { key: 'enquiry', label: 'Enquiry', icon: 'chat-dots', color: '#64748b', hint: 'Lead captured, eligibility checked' },
  { key: 'docs', label: 'Collecting documents', icon: 'folder2-open', color: '#0ea5e9', hint: 'Client is gathering documents' },
  { key: 'verify', label: 'Documents verified', icon: 'patch-check', color: '#6366f1', hint: 'Originals seen, names matched' },
  { key: 'filing', label: 'Form & fee ready', icon: 'pencil-square', color: '#8b5cf6', hint: 'Online form filled, fee paid' },
  { key: 'appointment', label: 'Appointment / biometrics', icon: 'calendar-check', color: '#d946ef', hint: 'VFS / embassy slot booked' },
  { key: 'submitted', label: 'Submitted', icon: 'send', color: '#f59e0b', hint: 'Passport and file handed in' },
  { key: 'processing', label: 'Under processing', icon: 'hourglass-split', color: '#f97316', hint: 'Waiting for embassy decision' },
  { key: 'decided', label: 'Decision received', icon: 'award', color: '#10b981', hint: 'Approved or refused' },
  { key: 'delivered', label: 'Passport delivered', icon: 'box-seam', color: '#14b8a6', hint: 'Passport returned to client' },
  { key: 'closed', label: 'Closed', icon: 'check2-circle', color: '#22c55e', hint: 'File complete' },
];
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

export const OUTCOMES = [['pending', 'Pending'], ['approved', 'Approved'], ['refused', 'Refused'], ['withdrawn', 'Withdrawn']];

export const VISA_CATEGORIES = {
  visit: 'Visit / tourist',
  business: 'Business',
  student: 'Student',
  work: 'Work / job',
  family: 'Family / spouse',
  umrah: 'Umrah / pilgrimage',
  medical: 'Medical',
  transit: 'Transit',
  other: 'Other',
};

export const DOC_CATEGORIES = ['Identity', 'Financial', 'Employment', 'Travel', 'Family', 'Academic', 'Attestation', 'Clearance', 'Medical', 'Forms', 'Fees', 'Other'];

export const DOC_STATUS = {
  missing: { label: 'Missing', tone: 'danger', icon: 'exclamation-circle' },
  received: { label: 'Received', tone: 'info', icon: 'inbox-fill' },
  verified: { label: 'Verified', tone: 'success', icon: 'patch-check-fill' },
  rejected: { label: 'Needs fix', tone: 'warn', icon: 'arrow-repeat' },
  na: { label: 'Not needed', tone: 'muted', icon: 'slash-circle' },
};

export const ATTEST_STEPS = [
  ['original', 'Original seen'],
  ['board', 'Board / NADRA / IBCC'],
  ['hec', 'HEC'],
  ['mofa', 'MOFA'],
  ['embassy', 'Embassy'],
];

export const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'JazzCash', 'Easypaisa', 'Raast', 'Debit / credit card', 'Cheque', 'Other'];

export const EXPENSE_CATEGORIES = ['Embassy / visa fee', 'VFS / centre fee', 'Courier', 'Attestation (MOFA / HEC)', 'Translation', 'Travel', 'Office rent', 'Utilities & internet', 'Salaries', 'Marketing', 'Commission (partner)', 'Bank charges', 'Other'];

export const APPT_TYPES = ['VFS / centre appointment', 'Embassy interview', 'Biometrics', 'Document pickup', 'Passport delivery', 'Client follow-up', 'Other'];
export const APPT_STATUS = { scheduled: ['Scheduled', 'info'], done: ['Done', 'success'], missed: ['Missed', 'danger'], cancelled: ['Cancelled', 'muted'] };

export const CLIENT_SOURCES = ['Walk-in', 'Referral (partner / agent)', 'Referral (client / friend)', 'Facebook / Instagram', 'WhatsApp', 'Website', 'Repeat client', 'Other'];
export const TASK_PRIORITY = [['normal', 'Normal'], ['high', 'High'], ['low', 'Low']];
export const RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];

export const PROVINCES = ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu & Kashmir', 'Overseas'];

export const ROLE_NOTE = 'Owner account. Data is stored on this device; back up regularly.';
