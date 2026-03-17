/**
 * Core Scam Detection Logic (Hybrid Engine) - Enhanced with Multi-Language Support
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load multilingual keywords
let multilingualKeywords = {};
try {
    const keywordsPath = path.join(__dirname, '../data/multilingual-keywords.json');
    multilingualKeywords = JSON.parse(fs.readFileSync(keywordsPath, 'utf8'));
} catch (error) {
    console.error("Failed to load multilingual keywords:", error.message);
}

/**
 * Detect language of input text
 */
const detectLanguage = (text) => {
    // Check for Devanagari script (Hindi)
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';
    // Check for Tamil script
    if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
    // Check for Telugu script
    if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
    // Default to English
    return 'english';
};

const analyzeInput = async (type, content) => {
    console.log(`Analyzing [${type}]: ${content.substring(0, 100)}...`);

    let score = 0;
    let risk = "Low";
    let signals = [];
    let mlResult = null;
    
    // Detect language
    const detectedLanguage = detectLanguage(content);
    console.log(`Detected language: ${detectedLanguage}`);

    // --- 1. AI Model Prediction (Primary) ---
    try {
        const mlResponse = await axios.post('http://localhost:8000/predict', 
            { text: content },
            { timeout: 5000 }
        );
        mlResult = mlResponse.data;
        console.log("ML Analysis:", mlResult);

        // ML Score Contribution (0-70 points)
        if (mlResult.predicted_label === 'scam') {
            score += mlResult.scam_probability * 70;
            signals.push(`AI Model: ${mlResult.confidence_score}% confidence - ${mlResult.scam_category}`);
            
            // Add AI insights if available
            if (mlResult.ai_insights && mlResult.ai_insights.length > 0) {
                signals.push(...mlResult.ai_insights);
            }
        } else {
            // Even if legit, factor in probability
            score += mlResult.scam_probability * 20;
        }

    } catch (error) {
        console.error("ML Service unavailable, falling back to Rules:", error.message);
        signals.push("AI Service offline - Using Enhanced Rule-Based Fallback");
        // Enhanced fallback - use more sophisticated rule scoring
        score = 30; // Base fallback score
    }

    const lowerContent = content.toLowerCase();

    // --- 2. Multi-Language Keyword Analysis (Weight: 15) ---
    const suspiciousKeywords = [
        ...multilingualKeywords.suspiciousKeywords?.english || [],
        ...multilingualKeywords.suspiciousKeywords?.[detectedLanguage] || []
    ];
    
    const keywordMatches = suspiciousKeywords.filter(word => 
        content.toLowerCase().includes(word.toLowerCase()) || content.includes(word)
    );

    if (keywordMatches.length > 0) {
        const keywordScore = Math.min(keywordMatches.length * 5, 15);
        score += keywordScore;
        signals.push(`${keywordMatches.length} suspicious keywords detected (${detectedLanguage})`);
    }

    // --- 3. Banking Terms Check (Weight: 10) ---
    const bankingTerms = [
        ...multilingualKeywords.bankingTerms?.english || [],
        ...multilingualKeywords.bankingTerms?.[detectedLanguage] || []
    ];
    
    const bankingMatches = bankingTerms.filter(term => 
        content.toLowerCase().includes(term.toLowerCase()) || content.includes(term)
    );
    
    if (bankingMatches.length > 0 && keywordMatches.length > 0) {
        score += 10;
        signals.push(`Banking context with suspicious intent detected`);
    }

    // --- 4. Urgency & Pressure Patterns (Weight: 10) ---
    const urgencyPatterns = [
        /immediately/i, /urgent/i, /within 24 hours/i, /act now/i,
        /limited time/i, /expires soon/i, /today only/i, /click link below/i,
        // Hindi patterns
        /तुरंत/i, /अभी/i, /24 घंटे/i,
        // Tamil patterns  
        /உடனடி/i, /இப்போது/i, /24 மணி/i,
        // Telugu patterns
        /త్వరగా/i, /ఇప్పుడు/i, /24 గంటల్లో/i
    ];
    
    let urgencyDetected = urgencyPatterns.some(pattern => pattern.test(content));

    if (urgencyDetected) {
        score += 10;
        signals.push(`Urgency/pressure tactics detected in ${detectedLanguage}`);
    }

    // --- 5. Link & Domain Analysis (Weight: 15) ---
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex) || [];

    const suspiciousDomains = ['bit.ly', 'tinyurl.com', 'ngrok.io', 'is.gd', 't.co', 'goo.gl', 'tiny.cc'];
    const typosquattingPatterns = [
        'sbi.co', 'hdcf.com', 'paytm.co', 'icici.co', 'phonepe.co', 
        'googlepay.co', 'bhim.co', 'axis.co', 'kotak.co'
    ];
    const ipUrlRegex = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

    let linkRiskScore = 0;

    urls.forEach(url => {
        if (ipUrlRegex.test(url)) {
            linkRiskScore += 10;
            signals.push("⚠️ URL uses raw IP address (common phishing technique)");
        }

        if (suspiciousDomains.some(d => url.includes(d))) {
            linkRiskScore += 8;
            signals.push("⚠️ URL shortener detected (hides actual destination)");
        }
        
        if (typosquattingPatterns.some(pattern => url.includes(pattern))) {
            linkRiskScore += 12;
            signals.push("🚨 Typosquatting domain detected (fake bank website)");
        }

        if (url.startsWith('http://') && (lowerContent.includes('bank') || lowerContent.includes('verify'))) {
            linkRiskScore += 10;
            signals.push("⚠️ Insecure HTTP link for sensitive request");
        }
    });

    score += Math.min(linkRiskScore, 15);


    // --- 6. Formatting & Anomalies (Weight: 5) ---
    const upperCaseCount = (content.match(/[A-Z]/g) || []).length;
    const totalLength = content.length;
    if (totalLength > 10 && (upperCaseCount / totalLength) > 0.4) {
        score += 5;
        signals.push("Excessive UPPERCASE letters detected");
    }

    // --- Final Scoring & Categorization ---
    score = Math.min(score, 100);

    // Determine risk level with ML-informed thresholds
    if (mlResult) {
        // Use ML risk level if available
        risk = mlResult.risk_level || "Medium";
    } else {
        // Fallback to score-based risk
        if (score >= 80) risk = "Critical";
        else if (score >= 50) risk = "High";
        else if (score >= 20) risk = "Medium";
        else risk = "Low";
    }

    // Get category from ML or determine from signals
    const category = mlResult?.scam_category || determineCategory(signals, lowerContent, mlResult);

    // Get appropriate recommendation based on language
    const recommendations = multilingualKeywords.recommendations?.[detectedLanguage] || 
                           multilingualKeywords.recommendations?.english || {};
    
    let recommendation = "Seems safe.";
    if (risk === "Critical" || risk === "High") {
        recommendation = recommendations.high || "Do NOT click any links. Block sender immediately.";
    } else if (risk === "Medium") {
        recommendation = recommendations.medium || "Be cautious. Verify source independently.";
    } else {
        recommendation = recommendations.low || "Seems safe, but always verify sender.";
    }

    return {
        score: Math.round(score),
        risk,
        category,
        signals,
        recommendation,
        language: detectedLanguage,
        mlPowered: mlResult !== null,
        aiConfidence: mlResult?.confidence_score || null
    };
};

const determineCategory = (signals, text, mlResult) => {
    // Use ML category if available
    if (mlResult && mlResult.scam_category) {
        return mlResult.scam_category;
    }
    
    // Fallback to rule-based categorization
    if (text.includes('bank') || text.includes('kyc') || text.includes('debit') || text.includes('upi')) {
        return 'UPI_Banking_Fraud';
    }
    if (text.includes('lottery') || text.includes('winner') || text.includes('prize')) {
        return 'Lottery_Prize_Scam';
    }
    if (text.includes('job') || text.includes('hiring') || text.includes('earn')) {
        return 'Job_Scam';
    }
    if (signals.some(s => s.includes('URL') || s.includes('link'))) {
        return 'Phishing_Identity_Theft';
    }
    return 'General_Suspicious_Activity';
};

module.exports = { analyzeInput };
