const express = require('express');
const router = express.Router();
const multer = require('multer');
const { analyzeInput, analyzeImage } = require('../services/scamDetector');
const { addAnalysis } = require('./ticker');
const upload = multer({ storage: multer.memoryStorage() });
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
                        riskScore: parseFloat(result.score) || 0,
                        riskLevel: result.risk || 'Low',
                        category: result.category || 'General_Suspicious_Activity',
                        language: result.language || 'en',
                        mlPowered: result.mlPowered || false,
                        aiConfidence: result.aiConfidence || null,
                        signals: result.signals || []
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

router.post('/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image is required' });
        }

        const result = await analyzeImage(req.file.buffer, req.file.originalname);
        
        // Use analysis ID
        let analysisId = `analysis_${Date.now()}_img_${Math.random().toString(36).substr(2, 5)}`;
        
        // Try to save to DB
        if (req.user && req.session) {
            try {
                const prisma = getPrismaClient();
                const analysis = await prisma.analysis.create({
                    data: {
                        userId: req.user.id,
                        sessionId: req.session.id,
                        contentHash: hashContent(result.extractedText || ""),
                        contentPreview: (result.extractedText || "Image Scan").substring(0, 200),
                        analysisType: 'image',
                        riskScore: parseFloat(result.score) || 0,
                        riskLevel: result.risk || 'Low',
                        category: result.category || 'General_Suspicious_Activity',
                        language: result.language || 'en',
                        mlPowered: result.mlPowered || false,
                        aiConfidence: result.aiConfidence || null,
                        signals: result.signals || []
                    }
                });
                analysisId = analysis.id;
            } catch (dbError) {
                console.error('Error saving image analysis to DB:', dbError.message);
            }
        }

        result.analysisId = analysisId;
        
        // Add to live ticker
        addAnalysis(result);
        
        res.json(result);
    } catch (error) {
        console.error('Image analysis route error:', error);
        res.status(500).json({ error: 'Error analyzing image' });
    }
});

module.exports = router;
