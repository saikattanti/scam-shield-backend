/**
 * AI Advisor Service — Gemini (primary) + Groq (fallback) powered actionable recovery steps
 *
 * Provider chain: Cache → Gemini 1.5 Flash → Groq Llama 3.3 70B → Hardcoded Fallback
 * Privacy: receives only scam CATEGORY and SIGNALS (never raw content).
 */

const axios = require('axios');

// Indian platform support contacts - used to enrich AI steps
const PLATFORM_SUPPORT = {
  UPI_Banking_Fraud: {
    platforms: ['PhonePe', 'Google Pay', 'Paytm', 'BHIM', 'NPCI'],
    numbers: ['PhonePe: 080-68727374', 'Google Pay: 1800-419-0157', 'Paytm: 0120-4456456'],
    authorities: ['Cyber Crime Portal: cybercrime.gov.in', 'Helpline: 1930', 'RBI Ombudsman: cms.rbi.org.in'],
  },
  Lottery_Prize_Scam: {
    platforms: [],
    numbers: [],
    authorities: ['Cyber Crime Portal: cybercrime.gov.in', 'Helpline: 1930', 'Consumer Forum: consumerhelpline.gov.in'],
  },
  Phishing_Identity_Theft: {
    platforms: ['Your Bank', 'UIDAI (Aadhaar)', 'CIBIL'],
    numbers: ['UIDAI: 1947', 'CIBIL: 1800-103-0499'],
    authorities: ['CERT-In: cert-in.org.in', 'Cyber Crime Portal: cybercrime.gov.in', 'Helpline: 1930'],
  },
  Job_Scam: {
    platforms: ['LinkedIn', 'Naukri', 'Indeed'],
    numbers: [],
    authorities: ['Cyber Crime Portal: cybercrime.gov.in', 'Helpline: 1930'],
  },
  General_Suspicious_Activity: {
    platforms: [],
    numbers: [],
    authorities: ['Cyber Crime Portal: cybercrime.gov.in', 'Helpline: 1930'],
  },
};

/**
 * Build the structured Gemini prompt from scam context
 */
const buildPrompt = (category, signals, language, mode = 'prevention', context = {}) => {
  const platformInfo = PLATFORM_SUPPORT[category] || PLATFORM_SUPPORT.General_Suspicious_Activity;
  const signalList = signals.slice(0, 6).join('\n- ');
  const langInstruction = language === 'hindi' ? 'Hindi (Devanagari script)' : 
                          language === 'tamil' ? 'Tamil script' : 'simple English';
  
  const platformContext = platformInfo.authorities.length > 0
    ? `\nRelevant Indian resources:\n- ${[...platformInfo.numbers, ...platformInfo.authorities].join('\n- ')}`
    : '';

  const financialContext = context.amountLost 
    ? `\nFinancial Exposure: ₹${context.amountLost} at risk` : '';
  const platformUsed = context.platform 
    ? `\nPlatform Used: ${context.platform}` : '';
  const timeContext = context.hoursSince !== undefined 
    ? `\nTime Since Incident: ${context.hoursSince < 24 ? `${context.hoursSince} hours ago — URGENT` : `${Math.floor(context.hoursSince/24)} days ago`}`
    : '';

  if (mode === 'recovery') {
    return `You are ScamShield, India's #1 AI scam recovery assistant. A victim needs URGENT help.

SCAM CONTEXT:
- Scam Type: ${category.replace(/_/g, ' ')}
- Detected Signals:
  - ${signalList}${financialContext}${platformUsed}${timeContext}
${platformContext}

Generate exactly 5 clear recovery steps in ${langInstruction}.
Steps must be highly detailed, practical, and tell the user EXACTLY what buttons to click, what menus to open, and what to say on phone calls.
Mention exact helpline numbers (like 1930), official URLs (cybercrime.gov.in), and platform-specific menus.

CRITICAL FORMAT RULES:
- EXACTLY 5 steps.
- You MUST separate each step block using the exact sequence "|||" (three pipe characters).
- Start the first line of each step with the number and a short bold title (e.g., 🚨 1. **Immediate action**).
- Under the title, provide detailed bullet points on exactly what to do.

Example Format:
🚨 1. **Immediately secure your account**
- Open PhonePe app and go to profile.
- Check recent transactions and take screenshots.
|||📞 2. **Call your bank & report fraud**
- Keep your account number ready.
...`;
  }

  return `You are ScamShield, India's AI scam safety assistant.

THREAT ANALYSIS:
- Scam Type: ${category.replace(/_/g, ' ')}
- Warning Signals Detected:
  - ${signalList}${financialContext}${platformUsed}
${platformContext}

Generate exactly 5 detailed prevention steps in ${langInstruction}.
Be India-specific. Include exact helpline numbers where relevant.

CRITICAL FORMAT RULES:
- EXACTLY 5 steps.
- You MUST separate each step block using the exact sequence "|||" (three pipe characters).
- Start the first line of each step with the number and a short bold title.
- Under the title, provide detailed bullet points on exactly what to do.

Example Format:
🚨 1. **Do NOT do this**
- Never click the link provided.
|||🛑 2. **Block the sender**
- Open the chat, tap the three dots, and select block.
...`;
};

// ─── In-memory cache: category+language+mode → steps (24h TTL) ───────────────
// Same scam category always generates identical steps — no reason to re-call Gemini
const stepsCache = new Map(); // key → { steps, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const getCacheKey = (category, language, mode) => `${category}|${language}|${mode}`;

const getCachedSteps = (category, language, mode) => {
  const key = getCacheKey(category, language, mode);
  const cached = stepsCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`✅ [Cache HIT] Returning cached AI steps for ${key}`);
    return cached.steps;
  }
  return null;
};

const setCachedSteps = (category, language, mode, steps) => {
  const key = getCacheKey(category, language, mode);
  stepsCache.set(key, { steps, expiresAt: Date.now() + CACHE_TTL_MS });
};

// ─── Shared: parse the ||| delimited step text from any provider ─────────────
const parseSteps = (text) => {
  let steps = text.split(/\|\|\|/);
  if (steps.length < 3) {
    steps = text.split(/(?=\n\d+\.\s*\*\*)/).filter(s => s.trim().length > 5);
  }
  return steps.map(s => s.trim()).filter(s => s.length > 0).slice(0, 5);
};

// ─── Provider: Gemini 1.5 Flash ──────────────────────────────────────────────
const callGemini = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600, topP: 0.8 },
    },
    { timeout: 10000 }
  );
  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return text;
};

// ─── Provider: Groq (Llama 3.3 70B) — OpenAI-compatible API ─────────────────
const callGroq = async (prompt) => {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_groq_api_key_here') throw new Error('GROQ_API_KEY not set');

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are ScamShield, India\'s AI scam safety assistant. Always respond in the exact format requested. Never deviate from the ||| separator format.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
      top_p: 0.8,
    },
    {
      timeout: 12000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');
  return text;
};

/**
 * Main entry point — 3-tier provider chain with shared cache
 * Cache → Gemini 1.5 Flash → Groq Llama 3.3 70B → Hardcoded Fallback
 */
const getAISteps = async (category, signals, language = 'english', mode = 'prevention', context = {}) => {
  // 1. Cache check — same category+language+mode always gives same great steps
  const cached = getCachedSteps(category, language, mode);
  if (cached) return cached;

  const prompt = buildPrompt(category, signals, language, mode, context);

  // 2. Try Gemini first
  try {
    const text = await callGemini(prompt);
    const steps = parseSteps(text);
    const result = steps.join('|||');
    console.log(`✅ [Gemini] Generated ${steps.length} steps for ${category}`);
    setCachedSteps(category, language, mode, result);
    return result;
  } catch (geminiError) {
    const is429 = geminiError.response?.data?.error?.code === 429;
    if (is429) {
      const retryDelay = geminiError.response.data.error.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay || 'unknown';
      console.warn(`⚠️ [Gemini] 429 quota exhausted (retry after ${retryDelay}) — switching to Groq...`);
    } else {
      console.warn(`⚠️ [Gemini] Failed (${geminiError.message}) — switching to Groq...`);
    }
  }

  // 3. Groq fallback — 14,400 free requests/day
  try {
    const text = await callGroq(prompt);
    const steps = parseSteps(text);
    const result = steps.join('|||');
    console.log(`✅ [Groq] Generated ${steps.length} steps for ${category}`);
    setCachedSteps(category, language, mode, result);
    return result;
  } catch (groqError) {
    console.warn(`⚠️ [Groq] Failed (${groqError.message}) — using hardcoded fallback.`);
  }

  // 4. Hardcoded fallback — always works, zero API calls
  console.log(`ℹ️ [Fallback] Using hardcoded steps for ${category}:${mode}`);
  return getFallbackSteps(category, mode);
};

/**
 * Generate a pre-filled FIR / Police Complaint Draft
 */
const getFIRDraft = async (category, signals, context = {}, language = 'english') => {
  const cacheKey = `FIR|${category}|${language}|${context.amountLost || '0'}|${context.platform || 'none'}`;
  const cached = stepsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.steps;

  const signalList = signals.slice(0, 5).join(', ');
  const amountStr = context.amountLost ? `₹${context.amountLost}` : '[Amount]';
  const platformStr = context.platform || '[Platform/Bank]';

  const prompt = `You are an Indian Cyber Crime legal assistant.
Generate a formal, professional cybercrime police complaint / FIR draft for a victim.

SCAM DETAILS:
- Type: ${category.replace(/_/g, ' ')}
- Lost Amount: ${amountStr}
- Platform Used: ${platformStr}
- Key details detected: ${signalList}

Write a formal letter to the "Cyber Crime Cell Inspector".
Keep it professional, copy-paste ready, and leave placeholder brackets like [Your Name], [Scammer Phone Number], etc., for the user to fill in.
The language should be ${language === 'hindi' ? 'Hindi (formal)' : 'English (formal administrative)'}.
Do NOT output markdown bold asterisks. Output ONLY the raw letter text.`;

  try {
    const text = await callGroq(prompt); // Use fast Groq model
    stepsCache.set(cacheKey, { steps: text.trim(), expiresAt: Date.now() + CACHE_TTL_MS });
    return text.trim();
  } catch (err) {
    try {
      const text = await callGemini(prompt);
      stepsCache.set(cacheKey, { steps: text.trim(), expiresAt: Date.now() + CACHE_TTL_MS });
      return text.trim();
    } catch (fallbackErr) {
      return `To,\nThe Inspector of Police,\nCyber Crime Cell,\n\nSubject: Formal complaint regarding ${category.replace(/_/g, ' ')} and loss of ${amountStr}.\n\nRespected Sir/Madam,\n\nI am writing to report a cyber fraud incident that occurred on [Date] where I was scammed out of ${amountStr} via ${platformStr}.\nThe fraudulent activities involved: ${signalList}.\n\nI request you to kindly register an FIR and freeze the fraudulent accounts to recover my funds.\n\nThank you,\n[Your Name]\n[Your Contact Number]\n[Transaction/UTR Number]`;
    }
  }
};


/**
 * Rich hardcoded fallback steps — used when Gemini is unavailable or rate-limited.
 * Formatted with ||| delimiters and multi-line bullet points.
 */
const getFallbackSteps = (category, mode) => {
  const key = `${category}:${mode}`;
  const F = {
    'UPI_Banking_Fraud:prevention': `🛑 1. **Do NOT share your OTP or UPI PIN with anyone**\n- No bank or UPI app will ever ask for your PIN or OTP.\n- Hang up immediately and block the number.\n|||📞 2. **Call your bank's fraud line right now**\n- SBI: 1800-112-211 | HDFC: 1800-210-0566 | ICICI: 1800-102-4242\n- Ask them to freeze your account if any credentials were shared.\n|||🏛️ 3. **Report on cybercrime.gov.in within 24 hours**\n- Go to cybercrime.gov.in → Register a Complaint → Financial Fraud.\n- The sooner you file, the higher the chance of fund recovery.\n|||🚨 4. **Call 1930 (National Cyber Crime Helpline)**\n- Available 9AM–6PM weekdays. Keep your UPI transaction ID ready.\n|||📸 5. **Screenshot all evidence before deleting anything**\n- Capture the Transaction ID, fraudster's UPI ID, and all chat messages.\n- Do NOT block the sender until after you've filed the FIR.`,

    'UPI_Banking_Fraud:recovery': `🚨 1. **Call 1930 RIGHT NOW — every minute matters**\n- Say: "I lost money to UPI fraud" and give your UTR number.\n- They can trigger an inter-bank hold on the fraudster within hours.\n|||🏦 2. **Contact your bank's fraud cell urgently**\n- SBI: 1800-112-211 | HDFC: 1800-210-0566 | ICICI: 1800-102-4242\n- Request an immediate chargeback or dispute on the fraudulent debit.\n|||📋 3. **File at cybercrime.gov.in → Financial Fraud**\n- You will receive a complaint number — save it and share with your bank.\n|||📱 4. **Report in the UPI app you used**\n- PhonePe: Help → Report Fraud | Google Pay: Transactions → Report a Problem\n- Paytm: Help & Support → Report a Fraud\n|||📸 5. **Preserve all evidence — do NOT delete anything**\n- Screenshot the UTR/Transaction ID, fraudster's UPI ID, and all logs.`,

    'Lottery_Prize_Scam:prevention': `🛑 1. **There is NO real lottery — this is 100% a scam**\n- Real lotteries never ask you to pay fees to claim a prize.\n|||🚫 2. **Block the sender and report the number**\n- Block on WhatsApp/SMS and report at sancharsaathi.gov.in\n|||🏛️ 3. **Report at cybercrime.gov.in → Financial Fraud**\n- Even with no money lost, reporting helps protect others.\n|||📞 4. **Call 1930 if you already paid any amount**\n- Give all payment details for any chance of recovery.\n|||⚠️ 5. **Warn your family and contacts**\n- Scammers often target multiple people in the same network.`,

    'Phishing_Identity_Theft:prevention': `🛑 1. **Do NOT click the suspicious link**\n- Phishing links steal credentials in seconds.\n|||🔒 2. **Change all important passwords immediately**\n- Email, banking apps, UPI apps — use strong unique passwords and enable 2FA.\n|||📞 3. **Contact UIDAI if Aadhaar may be compromised**\n- Call 1947 or lock biometrics at uidai.gov.in\n|||🏛️ 4. **Report at cybercrime.gov.in → Other Cybercrime → Identity Theft**\n- This helps get the phishing site taken down quickly.\n|||👁️ 5. **Monitor your CIBIL report for unauthorised loans**\n- Check free at cibil.com — set SMS alerts on all bank accounts.`,

    'Job_Scam:prevention': `🛑 1. **Legitimate companies NEVER charge you to get a job**\n- Any "registration fee" or "training deposit" is a scam — disconnect immediately.\n|||🔍 2. **Verify the company on mca.gov.in (Ministry of Corporate Affairs)**\n- Also search: company name + "fraud" + "reviews" on Google.\n|||🚫 3. **Do NOT share personal documents (Aadhaar/PAN/bank)**\n- Scammers use these for identity theft and fraudulent loans.\n|||🏛️ 4. **Report at cybercrime.gov.in → Financial Fraud → Job Fraud**\n- Also report the post to the platform (LinkedIn/Indeed/WhatsApp).\n|||📞 5. **Call 1930 if you already paid any fees**\n- Provide all payment details — date, amount, recipient account number.`,
  };

  if (F[key]) return F[key];

  if (mode === 'recovery') {
    return `🚨 1. **Call 1930 — National Cyber Crime Helpline (9AM–6PM weekdays)**\n- Report every detail. If money was lost, they can attempt inter-bank holds.\n|||🏛️ 2. **File at cybercrime.gov.in → Other Cybercrime**\n- Get your complaint acknowledgement number for all future follow-ups.\n|||📋 3. **Visit your nearest police station for a formal FIR**\n- Bring printed screenshots, bank statements, and transaction details.\n|||🔒 4. **Secure all accounts — change passwords and enable 2FA**\n- Email, banking, UPI apps, and social media — do this right now.\n|||📸 5. **Preserve all evidence — do NOT delete anything**\n- All messages, IDs, caller numbers, and screenshots are your legal evidence.`;
  }
  return `🛑 1. **Do NOT click links or respond to this message**\n- Suspicious links install malware or steal credentials instantly.\n|||🚫 2. **Block the sender across all platforms immediately**\n- Block on WhatsApp, SMS, email, and all social media.\n|||🏛️ 3. **Report at cybercrime.gov.in → Other Cybercrime**\n- Reporting helps authorities track and shut down scammers.\n|||📸 4. **Screenshot everything before deleting**\n- Capture the full message, sender details, and any links shown.\n|||👨‍👩‍👧 5. **Alert your close contacts about this scam**\n- Scammers often use compromised contacts to target more victims.`;
};

/**
 * Generate approximate scatter coordinates for privacy (50-70km radius)
 */
const INDIAN_HOTSPOTS = [
  { city: 'Delhi NCR', lat: 28.6139, lng: 77.2090 },
  { city: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { city: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { city: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { city: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { city: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { city: 'Jamtara', lat: 23.9667, lng: 86.8000 },
  { city: 'Nuh', lat: 28.1065, lng: 77.0003 },
  { city: 'Bharatpur', lat: 27.2152, lng: 77.4932 },
  { city: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { city: 'Pune', lat: 18.5204, lng: 73.8567 },
  { city: 'Jaipur', lat: 26.9124, lng: 75.7873 },
];

const getApproxLocation = () => {
  // Pick a random hotspot and apply 50-70km scatter
  const hotspot = INDIAN_HOTSPOTS[Math.floor(Math.random() * INDIAN_HOTSPOTS.length)];
  const radiusKm = 50 + Math.random() * 20; // 50-70km
  const angle = Math.random() * 2 * Math.PI;
  // 1 degree lat ≈ 111km
  const latOffset = (radiusKm / 111) * Math.sin(angle);
  const lngOffset = (radiusKm / (111 * Math.cos(hotspot.lat * Math.PI / 180))) * Math.cos(angle);

  return {
    approxLat: parseFloat((hotspot.lat + latOffset).toFixed(4)),
    approxLng: parseFloat((hotspot.lng + lngOffset).toFixed(4)),
    approxRegion: hotspot.city,
  };
};

/**
 * Determine whether this analysis should be persisted to DB
 * Only store if: scam detected + scam keywords present (mentor's suggestion)
 */
const SCAM_KEYWORDS = [
  'won', 'win', 'winner', 'claim', 'prize', 'lottery', 'reward',
  'urgent', 'immediately', 'suspend', 'blocked', 'verify', 'kyc',
  'otp', 'pin', 'password', 'click', 'link', 'free', 'offer',
  // Hindi
  'जीत', 'इनाम', 'तुरंत', 'ब्लॉक', 'क्लिक',
  // Tamil
  'வென்றீர்கள்', 'அவசரம்', 'தொடர்புகொள்ளவும்',
];

const shouldPersist = (content, riskLevel) => {
  if (!['High', 'Critical'].includes(riskLevel)) return false;
  const lower = content.toLowerCase();
  return SCAM_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()) || content.includes(kw));
};

module.exports = { getAISteps, getApproxLocation, shouldPersist, getFallbackSteps, getFIRDraft };
