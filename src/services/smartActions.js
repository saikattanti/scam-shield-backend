/**
 * Smart Actions Service — ScamShield
 *
 * Generates hyper-contextual, actionable links for victims:
 * 1. Direct cybercrime.gov.in portal links (category-matched)
 * 2. City-specific local cyber police contacts (IP-based city)
 * 3. UPI/App-specific in-app support paths (signal-detected platform)
 * 4. Bank fraud hotline (signal-detected bank)
 * 5. Urgency timing guidance
 * 6. Evidence checklist
 *
 * Pure rule-based — zero API calls, instant response.
 */

// ─── 1. CYBERCRIME.GOV.IN DIRECT PORTAL LINKS ───────────────────────────────

const GOV_PORTAL_LINKS = {
  financial: {
    label: 'Report Financial Fraud',
    description: 'File a complaint for UPI fraud, banking fraud, online cheating, and investment scams.',
    url: 'https://cybercrime.gov.in/Webform/Crime_AuthoLogin.aspx',
    tag: 'FINANCIAL FRAUD',
    icon: 'banknote',
    color: 'red',
  },
  women_anonymous: {
    label: 'Report Anonymously (Women/Child Crime)',
    description: 'File anonymously — no login required. For harassment, stalking, sextortion, CSAM.',
    url: 'https://cybercrime.gov.in/Webform/Accept.aspx',
    tag: 'ANONYMOUS',
    icon: 'shield-alert',
    color: 'pink',
  },
  women_tracked: {
    label: 'Report & Track (Women/Child Crime)',
    description: 'File a tracked complaint for women or child-related cybercrimes. Get a complaint ID.',
    url: 'https://cybercrime.gov.in/Webform/Crime_AuthoLogin.aspx',
    tag: 'TRACKED',
    icon: 'shield-check',
    color: 'purple',
  },
  other: {
    label: 'Report Other Cybercrime',
    description: 'For identity theft, phishing, hacking, fake profiles, social media abuse.',
    url: 'https://cybercrime.gov.in/Webform/Crime_AuthoLogin.aspx',
    tag: 'OTHER CYBERCRIME',
    icon: 'globe',
    color: 'blue',
  },
  track: {
    label: 'Track Your Complaint',
    description: 'Already filed? Track the status of your cybercrime complaint by ID.',
    url: 'https://cybercrime.gov.in/Webform/chkackstatus.aspx',
    tag: 'TRACK',
    icon: 'search',
    color: 'slate',
  },
};

// Maps scam category → which portal links to show
const CATEGORY_TO_PORTAL = {
  UPI_Banking_Fraud:         ['financial', 'track'],
  Lottery_Prize_Scam:        ['financial', 'track'],
  Job_Scam:                  ['financial', 'other', 'track'],
  Phishing_Identity_Theft:   ['other', 'financial', 'track'],
  Harassment_Threat:         ['women_anonymous', 'women_tracked', 'other'],
  Romance_Sextortion:        ['women_anonymous', 'women_tracked'],
  Investment_Fraud:          ['financial', 'track'],
  General_Suspicious_Activity: ['other', 'financial', 'track'],
};

// ─── 2. CITY-WISE LOCAL CYBER POLICE CONTACTS ───────────────────────────────

const CITY_POLICE = {
  kolkata: {
    city: 'Kolkata',
    state: 'West Bengal',
    unit: 'Kolkata Police Cyber Crime Branch',
    phones: ['033-22021200', '1800-3450066 (24x7 Toll-Free)'],
    email: 'cyberps@kolkatapolice.gov.in',
    website: 'https://www.kolkatapolice.gov.in',
    address: 'Cyber Crime Police Station, Lalbazar, Kolkata',
  },
  mumbai: {
    city: 'Mumbai',
    state: 'Maharashtra',
    unit: 'Maharashtra Cyber Department',
    phones: ['022-35673226', '8850646135'],
    email: 'ps.centralcyber.mum@mahapolice.gov.in',
    website: 'https://www.mahapolice.gov.in',
    address: 'Cyber Police Station, Central Region, Mumbai',
  },
  delhi: {
    city: 'Delhi',
    state: 'Delhi',
    unit: 'Delhi Police IFSO Unit (Cyber Crime)',
    phones: ['011-29561004', '1930'],
    email: 'cybercell.south@delhipolice.gov.in',
    website: 'https://www.delhipolice.gov.in',
    address: 'Cyber Crime Cell, IGI Airport Road, New Delhi',
  },
  bengaluru: {
    city: 'Bengaluru',
    state: 'Karnataka',
    unit: 'Cyber Crime Police Station, Race Course Road',
    phones: ['080-22094480', '1930'],
    email: 'cybercrime@ksp.gov.in',
    website: 'https://www.ksp.gov.in',
    address: 'Cyber Crime Police Station, Race Course Road, Bengaluru',
  },
  hyderabad: {
    city: 'Hyderabad',
    state: 'Telangana',
    unit: 'CID Cyber Crime, Telangana',
    phones: ['040-23240663', '1930'],
    email: 'cidap@cidap.gov.in',
    website: 'https://www.cidap.gov.in',
    address: 'CID Head Quarters, Lakdikapul, Hyderabad',
  },
  chennai: {
    city: 'Chennai',
    state: 'Tamil Nadu',
    unit: 'Cyber Crime Cell, TN Police',
    phones: ['044-23452348', '044-25393359'],
    email: 'cbcyber@tn.nic.in',
    website: 'https://www.tnpolice.gov.in',
    address: 'CB-CID Cyber Crime Cell, Vepery, Chennai',
  },
  pune: {
    city: 'Pune',
    state: 'Maharashtra',
    unit: 'Pune Cyber Crime Branch',
    phones: ['020-26122880', '1930'],
    email: 'cybercrime@punepolice.gov.in',
    website: 'https://www.punepolice.gov.in',
    address: 'Cyber Crime Branch, Shivaji Nagar, Pune',
  },
  ahmedabad: {
    city: 'Ahmedabad',
    state: 'Gujarat',
    unit: 'Ahmedabad Cyber Crime Cell',
    phones: ['079-25630100', '1930'],
    email: 'cybercrime@adityacops.gujarat.gov.in',
    website: 'https://www.adcpcrimeahmedabad.com',
    address: 'Cyber Crime Cell, Crime Branch, Ahmedabad',
  },
  jaipur: {
    city: 'Jaipur',
    state: 'Rajasthan',
    unit: 'Rajasthan Police Cyber Crime',
    phones: ['0141-2744000', '1930'],
    email: 'cybercrime@rajpolice.gov.in',
    website: 'https://www.police.rajasthan.gov.in',
    address: 'Cyber Crime Cell, Rajasthan Police HQ, Jaipur',
  },
  lucknow: {
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    unit: 'UP Cyber Crime Branch',
    phones: ['0522-2208455', '1930'],
    email: 'cybercrime.up@police.up.nic.in',
    website: 'https://www.uppolice.gov.in',
    address: 'Cyber Crime Branch, UP Police HQ, Lucknow',
  },
  bhopal: {
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    unit: 'MP Cyber Crime Branch',
    phones: ['0755-2443573', '1930'],
    email: 'ig.cybercrime@mppolice.gov.in',
    website: 'https://www.mppolice.gov.in',
    address: 'Cyber Crime HQ, MP Police, Bhopal',
  },
  default: {
    city: 'Your City',
    state: 'India',
    unit: 'National Cyber Crime Helpline',
    phones: ['1930 (National, 9AM–6PM)'],
    email: null,
    website: 'https://cybercrime.gov.in',
    address: 'Report online at cybercrime.gov.in or call 1930',
  },
};

// Normalize city strings from IP APIs to our keys
const normalizeCityKey = (cityString) => {
  if (!cityString) return 'default';
  const c = cityString.toLowerCase().trim();
  if (c.includes('kolkata') || c.includes('calcutta')) return 'kolkata';
  if (c.includes('mumbai') || c.includes('bombay')) return 'mumbai';
  if (c.includes('delhi') || c.includes('new delhi') || c.includes('gurgaon') || c.includes('noida') || c.includes('gurugram')) return 'delhi';
  if (c.includes('bengaluru') || c.includes('bangalore')) return 'bengaluru';
  if (c.includes('hyderabad') || c.includes('secunderabad')) return 'hyderabad';
  if (c.includes('chennai') || c.includes('madras')) return 'chennai';
  if (c.includes('pune')) return 'pune';
  if (c.includes('ahmedabad')) return 'ahmedabad';
  if (c.includes('jaipur')) return 'jaipur';
  if (c.includes('lucknow')) return 'lucknow';
  if (c.includes('bhopal')) return 'bhopal';
  return 'default';
};

// ─── 3. UPI / PLATFORM SUPPORT MAPPING ──────────────────────────────────────

const PLATFORM_SUPPORT = {
  phonepe: {
    name: 'PhonePe',
    logo: '📱',
    phone: '080-68727374',
    supportUrl: 'https://support.phonepe.com',
    escalationUrl: 'https://grievance.phonepe.com',
    inAppPath: 'Open PhonePe → Help (❓) → Report Fraud / Unauthorized Transaction',
    keywords: ['phonepe', 'phone pe'],
  },
  googlepay: {
    name: 'Google Pay',
    logo: '🟢',
    phone: '1800-419-0157',
    supportUrl: 'https://pay.google.com/intl/en_in/about/support',
    escalationUrl: 'https://support.google.com/pay',
    inAppPath: 'Open Google Pay → Transactions → Select Transaction → Report a Problem → I Was Scammed',
    keywords: ['google pay', 'gpay', 'tez'],
  },
  paytm: {
    name: 'Paytm',
    logo: '🔵',
    phone: '1800-120-130',
    supportUrl: 'https://paytm.com/care',
    escalationUrl: 'https://pgbiz.paytm.com/report-a-fraud',
    inAppPath: 'Open Paytm → Help & Support → Report a Fraud → Submit',
    keywords: ['paytm'],
  },
  bhim: {
    name: 'BHIM / NPCI',
    logo: '🇮🇳',
    phone: '1800-120-1740',
    supportUrl: 'https://www.bhimupi.org.in',
    escalationUrl: 'https://www.npci.org.in/what-we-do/upi/dispute-redressal-mechanism',
    inAppPath: 'Open BHIM → Help → Raise a Complaint → Select Transaction → Dispute',
    keywords: ['bhim', 'npci', 'upi'],
  },
  amazonpay: {
    name: 'Amazon Pay',
    logo: '📦',
    phone: '1800-3000-9009',
    supportUrl: 'https://www.amazon.in/gp/help/customer/display.html?nodeId=G9BVJMB9GC4LTHWM',
    escalationUrl: 'https://www.amazon.in/gp/help/customer/display.html',
    inAppPath: 'Open Amazon → Orders → Amazon Pay → Report Fraud',
    keywords: ['amazon pay', 'amazon'],
  },
  sbi: {
    name: 'SBI / YONO',
    logo: '🏦',
    phone: '1800-112-211',
    supportUrl: 'https://retail.onlinesbi.sbi',
    escalationUrl: 'https://crcf.sbi.co.in/ccf',
    inAppPath: 'Open YONO / SBI Net Banking → Services → Raise Dispute / Report Fraud',
    keywords: ['sbi', 'state bank', 'yono'],
  },
  hdfc: {
    name: 'HDFC Bank',
    logo: '🏦',
    phone: '1800-210-0566',
    supportUrl: 'https://www.hdfcbank.com/content/bbp/repositories/723fb80a-2dde-42a3-9793-7ae1be57c87f/?folderPath=/Common/Customer%20Service/&fileName=Raise-a-Complaint.htm',
    escalationUrl: 'https://leads.hdfcbank.com/applications/webforms/apply/HDFC_Webform/Raise_Complaint.aspx',
    inAppPath: 'HDFC NetBanking → Request & Enquiries → Raise a Complaint → Fraud / Unauthorized Transaction',
    keywords: ['hdfc', 'hdfc bank'],
  },
  icici: {
    name: 'ICICI Bank',
    logo: '🏦',
    phone: '1800-102-4242',
    supportUrl: 'https://www.icicibank.com/personal-banking/helpline',
    escalationUrl: 'https://www.icicibank.com/personal-banking/helpline/raise-query',
    inAppPath: 'iMobile Pay → Help → Raise a Complaint → Unauthorized Transaction',
    keywords: ['icici', 'icici bank', 'imobile'],
  },
  axis: {
    name: 'Axis Bank',
    logo: '🏦',
    phone: '1860-419-5555',
    supportUrl: 'https://www.axisbank.com/support',
    escalationUrl: 'https://application.axisbank.co.in/webforms/common/GC_Feedback.aspx',
    inAppPath: 'Axis Mobile → Services → Raise Dispute / Report Fraud',
    keywords: ['axis', 'axis bank'],
  },
};

// ─── 4. EVIDENCE CHECKLIST (by scam type) ───────────────────────────────────

const EVIDENCE_CHECKLISTS = {
  UPI_Banking_Fraud: [
    'Screenshot of the fraudulent UPI transaction (showing UTR number)',
    'Transaction ID / UTR number from your UPI app',
    'Phone number or UPI ID of the scammer',
    'Screenshots of any WhatsApp/SMS communication',
    'Your bank account statement showing the debit',
    'Timestamp and date of the transaction',
  ],
  Phishing_Identity_Theft: [
    'Screenshot of the phishing website URL (full browser bar visible)',
    'Screenshot of any message/email that directed you to the fake site',
    'Any personal data you may have entered (to know what to protect)',
    'Your phone number / email used for login (for bank/UIDAI freeze)',
    'Screenshot of any OTP SMS you may have shared',
  ],
  Job_Scam: [
    'Screenshot of job offer message (WhatsApp/email)',
    'Screenshot of payment receipt if any fees were paid',
    'Name, phone, email, company name used by scammer',
    'Bank/UPI transaction ID if money was transferred',
    'Link to fake job portal / website',
  ],
  Lottery_Prize_Scam: [
    'Original lottery win message (SMS/WhatsApp)',
    'Bank transaction receipt if you paid any "processing fee"',
    'Caller name, phone number, and any account number given',
    'Email ID used by scammers',
  ],
  General_Suspicious_Activity: [
    'Screenshot of the suspicious message in full',
    'Sender phone number, email address, or username',
    'Date and time of the incident',
    'Any link shared in the message (do NOT click it)',
    'Any transaction receipt if money was involved',
  ],
};

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Generate the full Smart Action set for a given analysis result.
 *
 * @param {string} category   - ML-detected scam category
 * @param {string[]} signals  - Detected signal strings
 * @param {string} city       - City string from IP (sent by frontend)
 * @param {string} risk       - Risk level: Low/Medium/High/Critical
 * @returns {object}          - Smart action payload
 */
const getSmartActions = (category, signals, city = null, risk = 'High') => {
  const signalText = signals.join(' ').toLowerCase();

  // 1. Gov portal links
  const portalKeys = CATEGORY_TO_PORTAL[category] || CATEGORY_TO_PORTAL['General_Suspicious_Activity'];
  const govPortal = portalKeys.map(key => GOV_PORTAL_LINKS[key]).filter(Boolean);

  // 2. Local police
  const cityKey = normalizeCityKey(city);
  const localPolice = CITY_POLICE[cityKey] || CITY_POLICE['default'];

  // 3. Platform support — detect from signals
  const detectedPlatforms = [];
  for (const [key, platform] of Object.entries(PLATFORM_SUPPORT)) {
    if (platform.keywords.some(kw => signalText.includes(kw))) {
      detectedPlatforms.push(platform);
    }
  }

  // 4. Evidence checklist
  const evidenceList = EVIDENCE_CHECKLISTS[category] || EVIDENCE_CHECKLISTS['General_Suspicious_Activity'];

  // 5. Urgency message (time-critical for financial fraud)
  let urgency = null;
  const isFinancial = ['UPI_Banking_Fraud', 'Lottery_Prize_Scam', 'Job_Scam', 'Investment_Fraud'].includes(category);
  if (isFinancial && ['High', 'Critical'].includes(risk)) {
    urgency = {
      level: 'critical',
      message: 'File within 24 hours for maximum chance of fund recovery.',
      subtext: 'Banks can initiate reversal only within 24–72 hours. After that, recovery becomes extremely difficult.',
      callNow: '1930',
    };
  } else if (['High', 'Critical'].includes(risk)) {
    urgency = {
      level: 'high',
      message: 'Report this incident as soon as possible.',
      subtext: 'The sooner you report, the higher the chance authorities can trace the fraudster.',
      callNow: '1930',
    };
  }

  return {
    govPortal,
    localPolice: {
      ...localPolice,
      isDetected: cityKey !== 'default',
    },
    platformSupport: detectedPlatforms,
    evidenceChecklist: evidenceList,
    urgency,
  };
};

module.exports = { getSmartActions };
