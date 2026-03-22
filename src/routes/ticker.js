const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../utils/prisma');

// Store all connected SSE clients
let clients = [];

// Add analysis to broadcast (called after DB save)
function addAnalysis(analysis) {
    const tickerItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        message: formatAnalysisMessage(analysis),
        risk: analysis.risk_level,
        category: analysis.category,
    };

    // Broadcast to all connected clients
    broadcastToClients(tickerItem);
}

function formatAnalysisMessage(analysis) {
    const riskEmoji = {
        'Critical': '🔥',
        'High': '🚨',
        'Medium': '⚠️',
        'Low': '🛡️',
        'Safe': '✅',
    }[analysis.risk_level] || '🔍';

    const categoryShort = analysis.category
        .replace('_', ' ')
        .split(' ')
        .slice(0, 2)
        .join(' ');

    return `${riskEmoji} ${analysis.risk_level} Risk: '${categoryShort}' detected in ${analysis.language || 'English'} message...`;
}

function broadcastToClients(data) {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

// SSE endpoint for live updates
router.get('/stream', async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Get recent analyses from database
    try {
        const prisma = getPrismaClient();
        const recentAnalyses = await prisma.analysis.findMany({
            take: 20,
            orderBy: { createdAt: 'desc' }
        });

        const formattedAnalyses = recentAnalyses.map(a => ({
            id: a.id,
            timestamp: a.createdAt.toISOString(),
            message: formatAnalysisMessage({
                risk_level: a.riskLevel,
                category: a.category,
                language: a.language
            }),
            risk: a.riskLevel,
            category: a.category
        }));

        // Send initial data
        res.write(`data: ${JSON.stringify({ type: 'connected', analyses: formattedAnalyses })}\n\n`);
    } catch (error) {
        console.warn('Ticker stream error (DB Skip):', error.message);
        res.write(`data: ${JSON.stringify({ type: 'connected', analyses: [] })}\n\n`);
    }

    // Add client to the list
    clients.push(res);

    // Remove client when connection closes
    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});

// Get recent analyses (REST endpoint)
router.get('/recent', async (req, res) => {
    try {
        const prisma = getPrismaClient();
        const recentAnalyses = await prisma.analysis.findMany({
            take: 20,
            orderBy: { createdAt: 'desc' }
        });

        const formattedAnalyses = recentAnalyses.map(a => ({
            id: a.id,
            timestamp: a.createdAt.toISOString(),
            message: formatAnalysisMessage({
                risk_level: a.riskLevel,
                category: a.category,
                language: a.language
            }),
            risk: a.riskLevel,
            category: a.category
        }));

        res.json(formattedAnalyses);
    } catch (error) {
        console.warn('Ticker recent error (DB Skip):', error.message);
        res.json([]);
    }
});

module.exports = { router, addAnalysis };
