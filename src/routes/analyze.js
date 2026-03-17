const express = require('express');
const router = express.Router();
const { analyzeInput } = require('../services/scamDetector');
const { addAnalysis } = require('./ticker');
const { getPrismaClient } = require('../utils/prisma');
const { hashContent, getContentPreview } = require('../middleware/session');

router.post('/', async (req, res) => {
    try {
        const { type, content } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const result = await analyzeInput(type, content);
        
        // Use analysis ID directly if no session/user available
        let analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Try to save analysis to database if session is available
        if (req.user && req.session) {
            try {
                const prisma = getPrismaClient();
                const analysis = await prisma.analysis.create({
                    data: {
                        userId: req.user.id,
                        sessionId: req.session.id,
                        contentHash: hashContent(content),
                        contentPreview: getContentPreview(content),
                        analysisType: type || 'text',
                        riskScore: result.risk_score,
                        riskLevel: result.risk_level,
                        category: result.category,
                        language: result.language || 'en',
                        mlPowered: result.ml_powered || false,
                        aiConfidence: result.ai_confidence,
                        signals: result.warning_signals || []
                    }
                });
                analysisId = analysis.id;
            } catch (dbError) {
                console.error('Error saving analysis to DB:', dbError.message);
                // Continue with fallback analysisId
            }
        }
        
        // Add analysisId to result for frontend
        result.analysisId = analysisId;
        
        // Add to live ticker feed
        addAnalysis(result);
        
        res.json(result);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
