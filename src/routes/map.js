const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../utils/prisma');

router.get('/threats', async (req, res) => {
  try {
    const prisma = getPrismaClient();

    // Fetch recent High/Critical scam analyses that have stored approx location
    const alerts = await prisma.analysis.findMany({
      where: {
        riskLevel: { in: ['High', 'Critical'] },
        approxLat: { not: null },
        approxLng: { not: null },
      },
      take: 300,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        riskScore: true,
        category: true,
        analysisType: true,
        createdAt: true,
        approxLat: true,
        approxLng: true,
        approxRegion: true,
      },
    });

    const geoPoints = alerts.map(alert => ({
      id: alert.id,
      riskScore: alert.riskScore,
      category: alert.category,
      type: alert.analysisType,
      time: alert.createdAt,
      lat: alert.approxLat,
      lng: alert.approxLng,
      region: alert.approxRegion || 'India',
    }));

    // Also fetch ScamReport locations for the "I got scammed" reports
    const reports = await prisma.scamReport.findMany({
      where: {
        approxLat: { not: null },
        approxLng: { not: null },
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        scamCategory: true,
        createdAt: true,
        approxLat: true,
        approxLng: true,
        approxRegion: true,
      },
    });

    const reportPoints = reports.map(r => ({
      id: `rpt_${r.id}`,
      riskScore: 90, // Self-reported scams are high priority on the map
      category: r.scamCategory,
      type: 'self_report',
      time: r.createdAt,
      lat: r.approxLat,
      lng: r.approxLng,
      region: r.approxRegion || 'India',
    }));

    res.json({ success: true, data: [...geoPoints, ...reportPoints] });
  } catch (error) {
    console.error('Threat Map backend error:', error);
    res.status(500).json({ error: 'Failed to fetch threat locations' });
  }
});

// GET /api/map/hotspots — aggregated regional scam density for heatmap
router.get('/hotspots', async (req, res) => {
  try {
    const prisma = getPrismaClient();

    const grouped = await prisma.analysis.groupBy({
      by: ['approxRegion'],
      where: {
        riskLevel: { in: ['High', 'Critical'] },
        approxRegion: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    });

    res.json({ success: true, data: grouped.map(g => ({ region: g.approxRegion, count: g._count.id })) });
  } catch (error) {
    console.error('Hotspot aggregation error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
