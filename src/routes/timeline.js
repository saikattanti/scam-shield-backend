const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * POST /api/timeline
 * Fraud Timeline Builder — 3 questions → legal-ready incident summary
 */
router.post('/', async (req, res) => {
  try {
    const { when, actions, platform, situation, amountLost, language } = req.body;

    if (!when && !situation) {
      return res.status(400).json({ error: 'Please provide incident details' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }

    const incidentDate = when ? new Date(when) : new Date();
    const hoursSince = Math.round((Date.now() - incidentDate.getTime()) / (1000 * 60 * 60));
    const daysSince = Math.floor(hoursSince / 24);

    const actionList = Array.isArray(actions) ? actions.join(', ') : (actions || 'Not specified');
    const urgencyTag = hoursSince < 1 ? '🔴 CRITICAL — ACT NOW' :
                       hoursSince < 24 ? '🟠 URGENT — within 24hrs' :
                       daysSince < 7 ? '🟡 IMPORTANT — within 7 days' : '⚪ Report for record';

    const prompt = `You are ScamShield, a legal assistant helping an Indian fraud victim file a cybercrime complaint.

INCIDENT DETAILS:
- Date/Time: ${incidentDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
- Time Since Incident: ${hoursSince < 24 ? `${hoursSince} hours` : `${daysSince} days`}
- Urgency: ${urgencyTag}
- Platform Used: ${platform || 'Unknown'}
- Actions Taken by Victim: ${actionList}
- Amount Lost: ${amountLost ? `₹${amountLost}` : 'Not specified'}
- Victim's Description: ${situation || 'Not provided'}

Generate a FORMAL LEGAL INCIDENT SUMMARY in this EXACT format (no extra text before or after):

INCIDENT REPORT
Date of Incident: [exact date/time in DD/MM/YYYY HH:MM format]
Platform: [platform]
Nature of Fraud: [1-sentence description]
Actions by Victim: [what victim did]
Financial Loss: [amount or "Amount not specified"]
Evidence Available: [list potential evidence the victim might have]

IMMEDIATE ACTIONS REQUIRED:
1. [Most urgent action — time sensitive]
2. [Second action]
3. [Third action]

OFFICIAL COMPLAINT CHANNELS:
1. Cybercrime Portal: https://cybercrime.gov.in — File within 24 hours
2. National Helpline: 1930 — Call immediately for financial fraud
3. [Platform-specific complaint link/number]

LEGAL REFERENCES:
- [Applicable IPC/IT Act sections for this fraud type]

This summary can be directly copied into the cybercrime complaint form.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey.trim()}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          topP: 0.8,
        }
      },
      { timeout: 12000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    res.json({
      summary: text.trim(),
      urgency: urgencyTag,
      hoursSince,
      daysSince,
      incidentDate: incidentDate.toISOString(),
    });

  } catch (error) {
    console.error('Timeline route error:', error.message);
    res.status(500).json({ error: 'Failed to generate incident summary' });
  }
});

module.exports = router;
