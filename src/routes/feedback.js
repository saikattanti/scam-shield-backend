const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../utils/prisma');

router.post('/', async (req, res) => {
    try {
        const prisma = getPrismaClient();
        const { analysisId, isAccurate, comment } = req.body;

        if (!analysisId) {
            return res.status(400).json({ error: 'Analysis ID is required' });
        }

        // Verify analysis exists
        const analysis = await prisma.analysis.findUnique({
            where: { id: analysisId }
        });

        if (!analysis) {
            return res.status(404).json({ error: 'Analysis not found' });
        }

        // Save feedback
        const feedback = await prisma.feedback.create({
            data: {
                analysisId,
                userId: req.user.id,
                isAccurate: Boolean(isAccurate),
                comment: comment || null
            }
        });

        // Calculate accuracy statistics
        const stats = await prisma.feedback.aggregate({
            _count: { id: true },
            where: { isAccurate: true }
        });

        const totalCount = await prisma.feedback.count();
        const accurateCount = stats._count.id;
        const accuracyRate = totalCount > 0 ? ((accurateCount / totalCount) * 100).toFixed(1) : 0;

        console.log(`📊 Feedback received: ${isAccurate ? '✅ Accurate' : '❌ Inaccurate'} | Overall Accuracy: ${accuracyRate}% (${accurateCount}/${totalCount})`);

        res.json({
            success: true,
            message: 'Feedback recorded successfully',
            stats: {
                accuracyRate,
                totalFeedback: totalCount,
            },
        });
    } catch (error) {
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Failed to save feedback' });
    }
});

// Get feedback statistics
router.get('/stats', async (req, res) => {
    try {
        const prisma = getPrismaClient();
        const totalCount = await prisma.feedback.count();
        const accurateCount = await prisma.feedback.count({            where: { isAccurate: true }
        });

        // Get category-wise breakdown
        const categoryStats = await prisma.$queryRaw`
            SELECT 
                a.category,
                COUNT(f.id) as total,
                SUM(CASE WHEN f."isAccurate" THEN 1 ELSE 0 END) as accurate
            FROM feedback f
            JOIN analyses a ON f."analysisId" = a.id
            GROUP BY a.category
        `;

        const categoryBreakdown = {};
        categoryStats.forEach(stat => {
            categoryBreakdown[stat.category] = {
                total: Number(stat.total),
                accurate: Number(stat.accurate),
                accuracyRate: ((Number(stat.accurate) / Number(stat.total)) * 100).toFixed(1)
            };
        });

        const stats = {
            totalFeedback: totalCount,
            accurateCount,
            inaccurateCount: totalCount - accurateCount,
            accuracyRate: totalCount > 0 ? ((accurateCount / totalCount) * 100).toFixed(1) : 0,
            categoryBreakdown
        };

        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

module.exports = router;