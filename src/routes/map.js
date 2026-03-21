const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../utils/prisma');

// Predefined set of Indian major cities and cybercrime hubs for simulated mapping
const hotspots = [
    { city: "Delhi", lat: 28.6139, lng: 77.2090 },
    { city: "Mumbai", lat: 19.0760, lng: 72.8777 },
    { city: "Bengaluru", lat: 12.9716, lng: 77.5946 },
    { city: "Hyderabad", lat: 17.3850, lng: 78.4867 },
    { city: "Kolkata", lat: 22.5726, lng: 88.3639 },
    { city: "Chennai", lat: 13.0827, lng: 80.2707 },
    { city: "Jamtara", lat: 23.9667, lng: 86.8000 },
    { city: "Nuh", lat: 28.1065, lng: 77.0003 },
    { city: "Bharatpur", lat: 27.2152, lng: 77.4932 }
];

// Helper to reliably generate a consistently scattered coordinate for a specific analysis ID
const generateCoordinateForId = (idString) => {
    // Generate an index based on the first char of ID to pick a city
    const charCode = idString.charCodeAt(0);
    const hotspot = hotspots[charCode % hotspots.length];
    
    // Add some random scatter (approx ~70km radius)
    // 1 lat deg ~= 111km, so ~70km is ~0.6 deg
    const lngOffset = ((idString.charCodeAt(1) % 100) / 100) * 1.2 - 0.6;
    const latOffset = ((idString.charCodeAt(2) % 100) / 100) * 1.2 - 0.6;
    
    return {
        lat: hotspot.lat + latOffset,
        lng: hotspot.lng + lngOffset,
        city: hotspot.city
    };
};

router.get('/threats', async (req, res) => {
    try {
        const prisma = getPrismaClient();
        
        // Fetch recent High/Critical scam analyses (up to 200 max)
        const alerts = await prisma.analysis.findMany({
            where: {
                riskLevel: { in: ['High', 'Critical'] },
            },
            take: 200,
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                riskScore: true,
                category: true,
                analysisType: true,
                createdAt: true,
            }
        });
        
        // Map them to geographic coordinates for the Mapbox heatmap overlay
        const geoPoints = alerts.map(alert => {
            const loc = generateCoordinateForId(alert.id);
            return {
                id: alert.id,
                riskScore: alert.riskScore,
                category: alert.category,
                type: alert.analysisType,
                time: alert.createdAt,
                lat: loc.lat,
                lng: loc.lng,
                region: loc.city
            };
        });
        
        res.json({ success: true, data: geoPoints });
    } catch (error) {
        console.error('Threat Map backend error:', error);
        res.status(500).json({ error: 'Failed to fetch threat locations' });
    }
});

module.exports = router;
