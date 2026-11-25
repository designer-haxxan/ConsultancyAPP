// Starter visa catalogue for the Pakistani market: countries, visa types and document checklists.
// These are TEMPLATES. Embassies and VFS / TLScontact change requirements, fees and slot rules often.
// Staff should verify each list on the official site and edit it in Catalogue (the app never stores fees here).
//
// Document library: each key is a document. scope 'person' = every applicant needs their own copy (passport, CNIC...),
// scope 'case' = one copy for the whole file (bank statements, invitation letter...).

export const DOCS = {
  passport: { label: 'Passport (valid; check blank pages & validity rule)', category: 'Identity', scope: 'person', required: true },
  cnic: { label: 'CNIC: front and back copy', category: 'Identity', scope: 'person', required: true },
  photo: { label: 'Passport-size photos (recent, white background, to spec)', category: 'Identity', scope: 'person', required: true },
  birth_cert: { label: 'Birth certificate (NADRA)', category: 'Family', scope: 'person', required: false, attest: true },
  marriage_cert: { label: 'Marriage certificate (Nikah Nama)', category: 'Family', scope: 'case', required: true, attest: true },
  frc: { label: 'Family Registration Certificate (NADRA FRC)', category: 'Family', scope: 'case', required: true, attest: true },
  sponsor_docs: { label: "Sponsor's passport, status and income proof", category: 'Family', scope: 'case', required: true },
  bank_statement: { label: 'Bank statements: last 6 months (official / stamped)', category: 'Financial', scope: 'case', required: true },
  salary_slips: { label: 'Salary slips: last 3 months', category: 'Financial', scope: 'case', required: true },
  tax_return: { label: 'Income tax return (FBR): last 1 to 2 years', category: 'Financial', scope: 'case', required: true },
  property_docs: { label: 'Property / vehicle papers (strengthens ties)', category: 'Financial', scope: 'case', required: false },
  business_proof: { label: 'Business proof: registration, NTN, business bank statements', category: 'Financial', scope: 'case', required: true },
  sponsor_fees: { label: 'Tuition / funds proof (sponsor letter + bank statements)', category: 'Financial', scope: 'case', required: true },
  employment_letter: { label: 'Employment letter and leave approval (salary, dates)', category: 'Employment', scope: 'case', required: true },
  job_offer: { label: 'Signed job offer letter', category: 'Employment', scope: 'case', required: true },
  work_contract_attested: { label: 'Work contract (attested)', category: 'Attestation', scope: 'case', required: true, attest: true },
  experience_letters: { label: 'Experience letters from previous employers', category: 'Employment', scope: 'person', required: false, attest: true },
  bee_clearance: { label: 'Protector of Emigrants (BE&OE) clearance', category: 'Clearance', scope: 'case', required: true },
  gamca_medical: { label: 'GAMCA medical certificate (Gulf work)', category: 'Medical', scope: 'person', required: true },
  police_cert: { label: 'Police character certificate', category: 'Attestation', scope: 'person', required: true, attest: true },
  degree_attested: { label: 'Degree: HEC attested and MOFA attested', category: 'Academic', scope: 'person', required: true, attest: true },
  transcript_attested: { label: 'Transcripts / marksheets (board or IBCC, HEC attested)', category: 'Academic', scope: 'person', required: true, attest: true },
  admission_letter: { label: 'University admission / offer letter', category: 'Academic', scope: 'case', required: true },
  cas_letter: { label: 'CAS / I-20 / CoE from the institution', category: 'Academic', scope: 'case', required: true },
  english_test: { label: 'English test score (IELTS / PTE / TOEFL)', category: 'Academic', scope: 'person', required: true },
  oshc: { label: 'Overseas student health cover (OSHC)', category: 'Travel', scope: 'case', required: true },
  insurance: { label: 'Travel medical insurance (meet the embassy minimum cover)', category: 'Travel', scope: 'case', required: true },
  flight: { label: 'Flight reservation (tentative itinerary)', category: 'Travel', scope: 'case', required: true },
  return_ticket: { label: 'Return or onward ticket', category: 'Travel', scope: 'case', required: false },
  hotel: { label: 'Hotel booking / accommodation proof', category: 'Travel', scope: 'case', required: true },
  itinerary: { label: 'Day-wise travel itinerary', category: 'Travel', scope: 'case', required: false },
  invitation: { label: 'Invitation letter from host (with host ID / passport copy)', category: 'Travel', scope: 'case', required: true },
  umrah_booking: { label: 'Umrah package / authorised operator voucher', category: 'Travel', scope: 'case', required: true },
  ds160: { label: 'DS-160 confirmation page', category: 'Forms', scope: 'case', required: true },
  mrv_receipt: { label: 'Visa fee payment receipt', category: 'Fees', scope: 'case', required: true },
  online_form: { label: 'Online application form confirmation (copy)', category: 'Forms', scope: 'case', required: true },
};

const PERSON = ['passport', 'cnic', 'photo'];
const FIN = ['bank_statement', 'salary_slips', 'employment_letter', 'tax_return'];
const TRAVEL = ['flight', 'hotel', 'itinerary', 'insurance'];

// Countries. Each visa type: key, name, category, docs (library keys), custom ([{label, category, scope, required}]), notes.
export const COUNTRIES_SEED = [
  {
    code: 'GB', name: 'United Kingdom', flag: '🇬🇧', notes: 'Biometrics at the visa application centre. Decisions by UKVI.',
    visaTypes: [
      { key: 'uk_visit', name: 'Standard Visitor', category: 'visit', docs: [...PERSON, 'bank_statement', 'salary_slips', 'employment_letter', 'tax_return', 'flight', 'hotel', 'itinerary', 'online_form'], notes: 'Prove funds, ties to Pakistan and the purpose of the trip. Check the current UKVI guidance for funds and length of stay.' },
      { key: 'uk_student', name: 'Student', category: 'student', docs: [...PERSON, 'admission_letter', 'cas_letter', 'english_test', 'degree_attested', 'transcript_attested', 'sponsor_fees', 'online_form'], notes: 'CAS from the sponsoring university is required. Confirm the maintenance funds rule for the course and city.' },
      { key: 'uk_family', name: 'Family (spouse / partner)', category: 'family', docs: [...PERSON, 'marriage_cert', 'frc', 'sponsor_docs', 'bank_statement', 'online_form'], notes: 'Marriage must be valid and recognised. Income threshold rules apply to the sponsor.' },
    ],
  },
  {
    code: 'SCH', name: 'Schengen area (EU)', flag: '🇪🇺', notes: 'Apply at the embassy of the main destination. Slots are booked through VFS or other partners. Rules differ by country.',
    visaTypes: [
      { key: 'sch_visit', name: 'Tourist (C visa)', category: 'visit', docs: [...PERSON, ...FIN, 'property_docs', 'flight', 'hotel', 'itinerary', 'insurance', 'online_form'], notes: 'Travel medical insurance of at least EUR 30,000 is the usual minimum (verify). Forms and fee rules vary by embassy.' },
      { key: 'sch_business', name: 'Business', category: 'business', docs: [...PERSON, 'business_proof', 'bank_statement', 'tax_return', 'invitation', 'flight', 'hotel', 'insurance', 'online_form'], notes: 'Invitation letter from a company in the Schengen area or a clear business reason.' },
      { key: 'sch_family', name: 'Family visit', category: 'family', docs: [...PERSON, 'frc', 'bank_statement', 'invitation', 'flight', 'hotel', 'insurance', 'online_form'], notes: 'Relationship proof and host residence documents.' },
    ],
  },
  {
    code: 'US', name: 'United States', flag: '🇺🇸', notes: 'DS-160 form, visa fee payment, then an interview. Interviews are held at the posts the embassy announces.',
    visaTypes: [
      { key: 'us_visit', name: 'Visitor (B1 / B2)', category: 'visit', docs: [...PERSON, 'ds160', 'mrv_receipt', 'bank_statement', 'employment_letter', 'tax_return', 'property_docs', 'itinerary'], notes: 'Strong ties to Pakistan matter most in the interview. Photo must follow the US specification.' },
      { key: 'us_student', name: 'Student (F1)', category: 'student', docs: [...PERSON, 'ds160', 'mrv_receipt', 'cas_letter', 'admission_letter', 'english_test', 'degree_attested', 'transcript_attested', 'sponsor_fees'], notes: 'Form I-20 from the school, SEVIS fee receipt and funding proof.' },
    ],
  },
  {
    code: 'CA', name: 'Canada', flag: '🇨🇦', notes: 'Applications are made online with IRCC. Biometrics at a visa application centre in Pakistan.',
    visaTypes: [
      { key: 'ca_visit', name: 'Visitor (temporary resident)', category: 'visit', docs: [...PERSON, ...FIN, 'property_docs', 'itinerary', 'invitation', 'online_form'], notes: 'Show ties to Pakistan and that you will leave at the end of the visit.' },
      { key: 'ca_student', name: 'Study permit', category: 'student', docs: [...PERSON, 'admission_letter', 'english_test', 'degree_attested', 'transcript_attested', 'sponsor_fees', 'online_form'], notes: 'Letter of acceptance from a designated learning institution (DLI).' },
    ],
  },
  {
    code: 'AU', name: 'Australia', flag: '🇦🇺', notes: 'Online lodgement. Health and character checks may be needed.',
    visaTypes: [
      { key: 'au_visit', name: 'Visitor', category: 'visit', docs: [...PERSON, ...FIN, 'flight', 'hotel', 'itinerary', 'insurance', 'online_form'], notes: 'Check health examination and character requirements for the stay length.' },
      { key: 'au_student', name: 'Student', category: 'student', docs: [...PERSON, 'admission_letter', 'cas_letter', 'english_test', 'degree_attested', 'transcript_attested', 'sponsor_fees', 'oshc', 'online_form'], notes: 'Genuine Student (GS) requirement and OSHC cover for the full stay.' },
    ],
  },
  {
    code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', notes: 'Most visit visas are issued through an approved sponsor (airline, hotel or travel agency). Rules change often.',
    visaTypes: [
      { key: 'ae_visit', name: 'Tourist / visit visa', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'online_form'], notes: 'Sponsor is usually the hotel or travel agency. Confirm the validity and length of stay for the entry type.' },
      { key: 'ae_work', name: 'Work visa (employment)', category: 'work', docs: [...PERSON, 'job_offer', 'work_contract_attested', 'bee_clearance', 'gamca_medical', 'police_cert', 'degree_attested', 'experience_letters', 'online_form'], notes: 'Employer applies for the work permit. Medical and attestations are checked before the entry permit.' },
    ],
  },
  {
    code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', notes: 'Umrah visas are issued through the official Saudi platform or authorised operators. Rules for women and age change often.',
    visaTypes: [
      { key: 'sa_umrah', name: 'Umrah', category: 'umrah', docs: [...PERSON, 'umrah_booking', 'flight', 'return_ticket', 'hotel', 'insurance'], notes: 'Check the current rules before booking, including age and mahram rules for women.' },
      { key: 'sa_visit', name: 'Visit (family / tourist)', category: 'visit', docs: [...PERSON, 'invitation', 'bank_statement', 'flight', 'hotel', 'insurance', 'online_form'], notes: 'Visit visa requirements depend on the sponsor and the visa type.' },
      { key: 'sa_work', name: 'Work visa', category: 'work', docs: [...PERSON, 'job_offer', 'work_contract_attested', 'bee_clearance', 'gamca_medical', 'police_cert', 'degree_attested', 'experience_letters', 'online_form'], notes: 'Employer sponsors the visa. Attestations and GAMCA medical must be complete before travel.' },
    ],
  },
  {
    code: 'QA', name: 'Qatar', flag: '🇶🇦', notes: 'Visa is usually issued through a sponsor or a hotel. Check the current portal.',
    visaTypes: [
      { key: 'qa_visit', name: 'Visit / tourist', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'invitation', 'online_form'], notes: 'Sponsor details and the stay dates are the main checks.' },
      { key: 'qa_work', name: 'Work visa', category: 'work', docs: [...PERSON, 'job_offer', 'work_contract_attested', 'bee_clearance', 'gamca_medical', 'police_cert', 'degree_attested', 'online_form'], notes: 'Employer-sponsored. GAMCA medical and attestations are checked.' },
    ],
  },
  {
    code: 'OM', name: 'Oman', flag: '🇴🇲', notes: 'Visit visas via the sponsor or e-visa portal. Check the current procedure.',
    visaTypes: [
      { key: 'om_visit', name: 'Visit / tourist', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'invitation', 'online_form'], notes: 'Sponsor or hotel details and return ticket.' },
    ],
  },
  {
    code: 'TR', name: 'Türkiye (Turkey)', flag: '🇹🇷', notes: 'Most visitors use the e-Visa system. Check which applications need an embassy visit.',
    visaTypes: [
      { key: 'tr_visit', name: 'Tourist (e-Visa)', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'insurance', 'online_form'], notes: 'Passport must be valid for the period set by the portal.' },
    ],
  },
  {
    code: 'MY', name: 'Malaysia', flag: '🇲🇾', notes: 'Visit visa usually through the online system. Requirements can change.',
    visaTypes: [
      { key: 'my_visit', name: 'Visit / tourist', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'itinerary', 'online_form'], notes: 'Return ticket and proof of funds.' },
    ],
  },
  {
    code: 'CN', name: 'China', flag: '🇨🇳', notes: 'Applications go through the visa application centre in Pakistan. Check payment rules at the centre.',
    visaTypes: [
      { key: 'cn_tourist', name: 'Tourist (L visa)', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'itinerary', 'online_form'], notes: 'Hotel and flight bookings are usually required.' },
      { key: 'cn_business', name: 'Business (M visa)', category: 'business', docs: [...PERSON, 'invitation', 'business_proof', 'bank_statement', 'flight', 'hotel', 'online_form'], notes: 'Invitation letter from the Chinese company.' },
    ],
  },
  {
    code: 'JP', name: 'Japan', flag: '🇯🇵', notes: 'Applications through the embassy or consulate. Requirements depend on the purpose.',
    visaTypes: [
      { key: 'jp_visit', name: 'Temporary visitor', category: 'visit', docs: [...PERSON, ...FIN, 'flight', 'hotel', 'itinerary', 'online_form'], notes: 'Employment and income documents are usually required.' },
    ],
  },
  {
    code: 'KR', name: 'South Korea', flag: '🇰🇷', notes: 'Apply at the Korean embassy or the visa centre. Check current requirements.',
    visaTypes: [
      { key: 'kr_visit', name: 'Tourist (C-3)', category: 'visit', docs: [...PERSON, ...FIN, 'flight', 'hotel', 'itinerary', 'online_form'], notes: 'Income and employment proof.' },
    ],
  },
  {
    code: 'NZ', name: 'New Zealand', flag: '🇳🇿', notes: 'Online application. Health and character checks may apply.',
    visaTypes: [
      { key: 'nz_visit', name: 'Visitor', category: 'visit', docs: [...PERSON, ...FIN, 'flight', 'hotel', 'insurance', 'itinerary', 'online_form'], notes: 'Check character and health requirements.' },
    ],
  },
  {
    code: 'TH', name: 'Thailand', flag: '🇹🇭', notes: 'Visa on arrival or e-visa depending on eligibility. Check current entry rules.',
    visaTypes: [
      { key: 'th_visit', name: 'Tourist', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'online_form'], notes: 'Return ticket and hotel booking are checked on entry.' },
    ],
  },
  {
    code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', notes: 'Electronic travel authorisation (ETA). Check the current online portal.',
    visaTypes: [
      { key: 'lk_visit', name: 'Tourist (ETA)', category: 'visit', docs: [...PERSON, 'bank_statement', 'flight', 'hotel', 'online_form'], notes: 'Apply online before departure.' },
    ],
  },
];
