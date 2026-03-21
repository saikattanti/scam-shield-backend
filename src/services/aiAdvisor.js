/**
 * AI Advisor Service — Gemini-powered actionable recovery steps
 * 
 * Privacy: This service receives only the scam CATEGORY and SIGNALS (never raw content).
 * It generates targeted, platform-specific next steps for Indian users.
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

Generate exactly 5 clear, numbered recovery steps in ${langInstruction}.
Steps must be India-specific, time-sensitive, and actionable RIGHT NOW.
Mention exact helpline numbers, official URLs (cybercrime.gov.in), bank chargeback steps.

CRITICAL FORMAT RULES:
- EXACTLY 5 steps, each on its OWN NEW LINE
- Start each with the number and period: 1. 2. 3. etc.
- Maximum 2 sentences per step
- No markdown headers, no bold, no intro text
- Include 1930 helpline and cybercrime.gov.in in steps

1. [Immediate action — do within next 60 minutes]
2. [Bank/UPI fraud block steps]
3. [Official complaint filing]
4. [Evidence collection]
5. [Future prevention]`;
  }

  return `You are ScamShield, India's AI scam safety assistant.

THREAT ANALYSIS:
- Scam Type: ${category.replace(/_/g, ' ')}
- Warning Signals Detected:
  - ${signalList}${financialContext}${platformUsed}
${platformContext}

Generate exactly 5 numbered prevention steps in ${langInstruction}.
Be India-specific. Include exact helpline numbers where relevant.

CRITICAL FORMAT RULES:
- EXACTLY 5 steps, each on its OWN NEW LINE
- Start each with: 1. 2. 3. etc.
- Maximum 2 sentences per step
- No markdown, no headers, no intro text

1. [Do NOT do this — immediate safety action]
2. [Block/Report the sender]
3. [Protect your financial accounts]
4. [Report to authorities — include helpline number]
5. [Protect your personal data]`;
};

/**
 * Call Gemini API and return structured steps
 */
const getAISteps = async (category, signals, language = 'english', mode = 'prevention', context = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — returning fallback steps');
    return getFallbackSteps(category, mode);
  }

  try {
    const prompt = buildPrompt(category, signals, language, mode, context);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey.trim()}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
          topP: 0.8,
        }
      },
      { timeout: 10000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    // FORCE SPLIT: If Gemini returned everything on one line, we split by digit markers
    let steps = text.trim().split(/\n+/).filter(s => s.trim().length > 5);
    
    // If it's still 1 line but contains markers like 2. or 3.
    if (steps.length < 3 && text.match(/\d\./)) {
      steps = text.split(/(?=\d\.\s)/).map(s => s.trim()).filter(s => s.length > 5);
    }

    // Ensure we have exactly strings without leading numbers for the frontend to handle
    const cleanedSteps = steps
      .map(s => s.replace(/^\d+\.\s*/, '').trim())
      .filter(s => s.length > 0)
      .slice(0, 5);

    console.log(`✅ Gemini AI Generated ${cleanedSteps.length} recovery steps.`);
    return cleanedSteps.join('\n');
  } catch (error) {
    if (error.response) {
      console.error('Gemini AI 404 Debug Data:', JSON.stringify(error.response.data, null, 2));
      console.error('URL used:', error.config.url.replace(/key=.*$/, 'key=HIDDEN'));
    } else {
      console.error('Gemini AI Advisor error:', error.message);
    }
    return getFallbackSteps(category, mode);
  }
};

/**
 * Hardcoded fallback steps if Gemini is unavailable
 */
const getFallbackSteps = (category, mode) => {
  const platformInfo = PLATFORM_SUPPORT[category] || PLATFORM_SUPPORT.General_Suspicious_Activity;
  
  if (mode === 'recovery') {
    return `1. Immediately call the National Cyber Crime Helpline: 1930 and register a complaint.\n2. Visit cybercrime.gov.in to file a formal FIR online — do this within 24 hours.\n3. Contact your bank immediately to freeze the transaction or request a chargeback.\n4. Take screenshots of all evidence (messages, transaction IDs, caller numbers) before deleting anything.\n5. ${platformInfo.authorities[0] || 'Report to local police with all evidence collected.'}`;
  }

  return `1. Do NOT click any links or call back unknown numbers from this message.\n2. Block the sender immediately on WhatsApp/SMS.\n3. If you shared any bank details, call your bank's fraud line NOW.\n4. Report this at cybercrime.gov.in or call 1930.\n5. Warn family members — scammers often target multiple people in the same contact list.`;
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

module.exports = { getAISteps, getApproxLocation, shouldPersist, getFallbackSteps };
