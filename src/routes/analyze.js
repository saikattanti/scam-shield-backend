const express = require('express');
const router = express.Router();
const multer = require('multer');
const { analyzeInput, analyzeImage } = require('../services/scamDetector');
const { getAISteps, getApproxLocation, shouldPersist } = require('../services/aiAdvisor');
const { transcribeAudio } = require('../services/audioScanner');
const { addAnalysis } = require('./ticker');
const { getPrismaClient } = require('../utils/prisma');
const { hashContent, getContentPreview } = require('../middleware/session');
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Persist to DB only when: High/Critical risk + scam keywords detected.
 * Stores hash (never content), 100-char preview, approx location.
 * Attaches AI steps before saving.
 */
async function maybePersistAnalysis({ content, result, type, aiSteps, req }) {
  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!shouldPersist(content, result.risk)) {
    // Not a confirmed scam + keyword match — do not write to DB
    console.log(`[Privacy] Skipping DB write — risk: ${result.risk}, no scam keywords matched`);
    return analysisId;
  }

  try {
    const prisma = getPrismaClient();
    const location = getApproxLocation(); // 50-70km scatter, never exact
    const contentHash = hashContent(content);

    // Check if this exact scam content hash already exists (dedup)
    const existing = await prisma.analysis.findFirst({ where: { contentHash } });
    if (existing) {
      console.log(`[Privacy] Duplicate scam hash — skipping insert, returning existing ID`);
      return existing.id;
    }

    const data = {
      contentHash,
      contentPreview: getContentPreview(content, 100), // max 100 chars
      analysisType: type || 'text',
      riskScore: parseFloat(result.score) || 0,
      riskLevel: result.risk || 'Low',
      category: result.category || 'General_Suspicious_Activity',
      language: result.language || 'en',
      mlPowered: result.mlPowered || false,
      aiConfidence: result.aiConfidence || null,
      signals: result.signals || [],
      aiSteps: aiSteps || null,
      storedReason: `Auto-stored: ${result.risk} risk + scam keyword match`,
      ...location,
    };

    // Add user/session if authenticated
    if (req.user && req.session) {
      data.userId = req.user.id;
      data.sessionId = req.session.id;
    } else {
      // Use a system anonymous user/session ID (must exist in DB)
      data.userId = process.env.ANON_USER_ID || 'anon';
      data.sessionId = process.env.ANON_SESSION_ID || 'anon';
    }

    const analysis = await prisma.analysis.create({ data });
    console.log(`[Privacy] Stored confirmed scam: ${analysis.id} | region: ${location.approxRegion}`);
    return analysis.id;
  } catch (dbError) {
    console.error('[Privacy] DB write error:', dbError.message);
    return analysisId;
  }
}

// ─── POST /api/analyze ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { type, content, platform, amountLost } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    // 1. Run ML + rule-based detection
    const result = await analyzeInput(type, content);

    // 2. Get Gemini AI steps with context (runs in parallel-ish, non-blocking for response)
    let aiSteps = null;
    if (['High', 'Critical', 'Medium'].includes(result.risk)) {
      const context = { platform, amountLost };
      aiSteps = await getAISteps(result.category, result.signals, result.language, 'prevention', context);
    }

    // 3. Privacy-first DB persist (only for confirmed High/Critical scams with keywords)
    const analysisId = await maybePersistAnalysis({ content, result, type, aiSteps, req });

    // 4. Add to live ticker
    addAnalysis(result);

    res.json({ ...result, analysisId, aiSteps });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── POST /api/analyze/image ─────────────────────────────────────────────────
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image is required' });

    // Image is analyzed purely in memory — file is never written to disk
    const result = await analyzeImage(req.file.buffer, req.file.originalname);

    let aiSteps = null;
    if (['High', 'Critical', 'Medium'].includes(result.risk)) {
      aiSteps = await getAISteps(result.category, result.signals, result.language, 'prevention');
    }

    // For images, use the extracted text (if any) for DB storage decision
    const textContent = result.extractedText || '';
    const analysisId = await maybePersistAnalysis({
      content: textContent,
      result,
      type: 'image',
      aiSteps,
      req,
    });

    addAnalysis(result);
    res.json({ ...result, analysisId, aiSteps });
  } catch (error) {
    console.error('Image analysis route error:', error);
    res.status(500).json({ error: 'Error analyzing image' });
  }
});

// ─── POST /api/analyze/audio ─────────────────────────────────────────────────
router.post('/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Audio file is required' });

    console.log(`🎤 Processing audio upload: ${req.file.originalname} (${req.file.size} bytes)`);

    // 1. Send buffer directly to Gemini for accurate transcription
    const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);

    if (!transcript) {
      return res.status(400).json({ error: 'Could not transcribe any speech from the audio.' });
    }

    // 2. Feed the transcript right into our standard text Scam Detector
    const result = await analyzeInput('text', transcript);

    // 3. Generate Gemini steps based on the risk
    let aiSteps = null;
    if (['High', 'Critical', 'Medium'].includes(result.risk)) {
      aiSteps = await getAISteps(result.category, result.signals, result.language, 'prevention');
    }

    // 4. Privacy DB save (keeps transcription if High/Critical, otherwise shreds it)
    const analysisId = await maybePersistAnalysis({
      content: transcript,
      result,
      type: 'audio',
      aiSteps,
      req,
    });

    addAnalysis(result);

    // We return the raw transcript back to the frontend so the user can read what was heard!
    res.json({ ...result, analysisId, aiSteps, transcribedText: transcript });
  } catch (error) {
    console.error('Audio analysis route error:', error.message);
    res.status(500).json({ error: error.message || 'Error analyzing audio' });
  }
});

// ─── POST /api/analyze/assist — "I Got Scammed" Recovery Mode ────────────────
router.post('/assist', upload.single('image'), async (req, res) => {
  try {
    const { situation, platform, amountLost, language } = req.body;

    if (!situation && !req.file) {
      return res.status(400).json({ error: 'Please describe your situation or upload a screenshot' });
    }

    let contentToAnalyze = situation || '';

    // If image attached, extract text from it first
    if (req.file) {
      try {
        const imageResult = await analyzeImage(req.file.buffer, req.file.originalname);
        if (imageResult.extractedText) {
          contentToAnalyze += '\n' + imageResult.extractedText;
        }
      } catch (imgErr) {
        console.error('Assist image extraction error:', imgErr.message);
      }
    }

    // Run detection on the described situation
    const detectionResult = contentToAnalyze
      ? await analyzeInput('text', contentToAnalyze)
      : { category: 'General_Suspicious_Activity', signals: [], language: language || 'english', risk: 'High' };

    // Generate detailed recovery steps using Gemini
    const recoverySteps = await getAISteps(
      detectionResult.category,
      detectionResult.signals,
      detectionResult.language || language || 'english',
      'recovery'
    );

    // Store the report (no raw content — only hash, category, approx location)
    try {
      const prisma = getPrismaClient();
      const location = getApproxLocation();
      const { hashContent } = require('../middleware/session');

      await prisma.scamReport.create({
        data: {
          contentHash: contentToAnalyze ? hashContent(contentToAnalyze) : null,
          scamCategory: detectionResult.category,
          platformUsed: platform || null,
          amountLost: amountLost ? parseFloat(amountLost) : null,
          language: detectionResult.language || 'en',
          recoverySteps,
          ...location,
        },
      });
    } catch (dbErr) {
      console.error('[Assist] DB write error:', dbErr.message);
    }

    res.json({
      scamType: detectionResult.category,
      riskLevel: detectionResult.risk,
      detectedSignals: detectionResult.signals,
      recoverySteps,
      platform: platform || null,
    });
  } catch (error) {
    console.error('Assist route error:', error);
    res.status(500).json({ error: 'Failed to generate recovery plan' });
  }
});

module.exports = router;
