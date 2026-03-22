/**
 * Core Scam Detection Logic (Hybrid Engine) - Enhanced with Multi-Language Support
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { deepAnalyzeUrl } = require('./urlScanner');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

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
    // Exclude digits and common punctuation from script detection to avoid OCR hallucinations
    // Devanagari letters only (no digits \u0966-\u096f)
    const hindiMatches = text.match(/[\u0904-\u0939\u0958-\u095F]/g);
    if (hindiMatches && hindiMatches.length >= 2) return 'hindi';
    
    // Tamil letters only (no digits)
    const tamilMatches = text.match(/[\u0B85-\u0BB9]/g);
    if (tamilMatches && tamilMatches.length >= 2) return 'tamil';
    
    // Telugu letters only (no digits)
    const teluguMatches = text.match(/[\u0C05-\u0C39]/g);
    if (teluguMatches && teluguMatches.length >= 2) return 'telugu';
    
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
        const mlResponse = await axios.post(`${ML_URL}/analyze`, 
            { text: content, language: detectedLanguage },
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
        // Boosted weight from 15 to 40 because keywords are highly accurate for Indian scams
        const keywordScore = Math.min(keywordMatches.length * 10, 40);
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
    
    if (bankingMatches.length > 0) {
        // Boosted weight from 10 to 25
        const bankScore = Math.min(bankingMatches.length * 8, 25);
        score += bankScore;
        signals.push(`Banking/Financial context detected (${detectedLanguage})`);
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
        /త్వரగా/i, /ఇప్పుడు/i, /24 గంటల్లో/i
    ];
    
    let urgencyDetected = urgencyPatterns.some(pattern => pattern.test(content));

    if (urgencyDetected) {
        // Boosted weight from 10 to 25
        score += 25;
        signals.push(`High urgency manipulation detected (${detectedLanguage})`);
    }

    // --- 5. Link & Domain Analysis (Weight: 15 / Or overrides if DeepScan) ---
    // Improved regex to catch urls with OR without http://
    const urlRegex = /([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s]*)?)/g;
    const urls = content.match(urlRegex) || [];

    const suspiciousDomains = ['bit.ly', 'tinyurl.com', 'ngrok.io', 'is.gd', 't.co', 'goo.gl', 'tiny.cc'];
    const typosquattingPatterns = [
        'sbi.co', 'hdcf.com', 'paytm.co', 'icici.co', 'phonepe.co', 
        'googlepay.co', 'bhim.co', 'axis.co', 'kotak.co'
    ];
    const ipUrlRegex = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

    let linkRiskScore = 0;
    let isDeepScanned = false;

    // Static Rules
    urls.forEach(url => {
        if (ipUrlRegex.test(url)) {
            linkRiskScore += 10;
            signals.push("⚠️ URL uses raw IP address (common phishing technique)");
        }

        if (suspiciousDomains.some(d => url.includes(d))) {
            linkRiskScore += 15;
            signals.push("⚠️ URL shortener detected (hides actual destination)");
        }
        
        if (typosquattingPatterns.some(pattern => url.includes(pattern))) {
            linkRiskScore += 30;
            signals.push("🚨 Typosquatting domain detected (fake bank website)");
        }

        if (url.startsWith('http://') && (lowerContent.includes('bank') || lowerContent.includes('verify'))) {
            linkRiskScore += 10;
            signals.push("⚠️ Insecure HTTP link for sensitive request");
        }
    });

    // Deep Sandboxing 
    let urlMetadata = null;
    // ONLY run the heavy Puppeteer/WHOIS deep sandbox if explicitly requesting URL scan!
    // Never run it on raw text messages to prevent 1-minute timeout blocks.
    if (type === 'url') {
        let targetUrl = urls.length > 0 ? urls[0] : content;
        try {
            const deepScan = await deepAnalyzeUrl(targetUrl);
            if (deepScan.addedScore > 0) {
                linkRiskScore += deepScan.addedScore;
                isDeepScanned = true;
            }
            if (deepScan.newSignals.length > 0) {
                signals.push(...deepScan.newSignals);
            }
            urlMetadata = deepScan.metadata || null;
        } catch (e) {
            console.error("Deep scan integration error:", e);
        }
    }

    if (isDeepScanned || type === 'url') {
        // Cap higher if definitively deep scanned or explicitly requested URL analysis
        score += Math.min(linkRiskScore, 80); 
    } else {
        // Boosted regex text-link max from 15 to 40
        score += Math.min(linkRiskScore, 40);
    }


    // --- 6. Formatting & Anomalies (Weight: 5) ---
    const upperCaseCount = (content.match(/[A-Z]/g) || []).length;
    const totalLength = content.length;
    if (totalLength > 10 && (upperCaseCount / totalLength) > 0.4) {
        score += 5;
        signals.push("Excessive UPPERCASE letters detected");
    }

    // --- Final Scoring & Categorization ---
    score = Math.min(score, 100);

    // Determine risk level by taking the HIGHER of ML risk and Rule-based Risk
    let ruleRisk = "Low";
    if (score >= 80) ruleRisk = "Critical";
    else if (score >= 50) ruleRisk = "High";
    else if (score >= 20) ruleRisk = "Medium";

    if (mlResult) {
        const mlRisk = mlResult.risk_level || "Medium";
        const riskLevels = { "Low": 1, "Medium": 2, "High": 3, "Critical": 4 };
        
        // Pick the most severe risk level
        risk = riskLevels[mlRisk] > riskLevels[ruleRisk] ? mlRisk : ruleRisk;
    } else {
        risk = ruleRisk;
    }

    // Get category from ML or determine from signals
    const category = mlResult?.scam_category || determineCategory(signals, lowerContent, mlResult);
    
    // Override category if deep scan picked up severe phishing
    if (isDeepScanned && linkRiskScore > 40) {
        risk = "Critical";
    }

    // Get appropriate recommendation based on language
    const recommendations = multilingualKeywords.recommendations?.[detectedLanguage] || 
                           multilingualKeywords.recommendations?.english || {};
    
    let recommendation = "Seems safe.";
    if (risk === "Critical" || risk === "High") {
        recommendation = recommendations.high || "Do NOT click any links. Block sender immediately.";
    } else if (risk === "Medium") {
        recommendation = recommendations.medium || "Be cautious. Verify source independently.";
    } else {
        // More intelligent low-risk message based on context
        if (urls.length > 0) {
            recommendation = recommendations.low || "Seems safe, but always verify sender before clicking links.";
        } else {
            recommendation = "This message appears completely safe and normal. No suspicious patterns detected.";
        }
    }

    return {
        score: Math.round(score),
        risk,
        category,
        signals,
        recommendation,
        language: detectedLanguage,
        mlPowered: mlResult !== null,
        aiConfidence: mlResult?.confidence_score || null,
        urlMetadata: urlMetadata || undefined,
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

const analyzeImage = async (buffer, originalname) => {
    console.log(`Analyzing Image: ${originalname}`);
    
    try {
        const form = new FormData();
        form.append('file', buffer, {
            filename: originalname,
            contentType: 'image/jpeg', // Default, multer will provide actual
        });

        const mlResponse = await axios.post(`${ML_URL}/analyze-image`, form, {
            headers: {
                ...form.getHeaders(),
            },
            timeout: 10000
        });

        const mlResult = mlResponse.data;
        console.log("ML Image Analysis:", mlResult);

        // Process the result through the same logic as text if text was extracted
        if (mlResult.extracted_text) {
            const finalResult = await analyzeInput('text', mlResult.extracted_text);
            // Append that this was an image scan
            finalResult.analysisType = 'image';
            finalResult.extractedText = mlResult.extracted_text;
            return finalResult;
        }

        return {
            score: 0,
            risk: "Low",
            category: "Legitimate",
            signals: ["No text detected in image"],
            recommendation: "Seems safe.",
            language: "english",
            mlPowered: true,
            analysisType: 'image'
        };

    } catch (error) {
        console.error("Image ML Service error:", error.message);
        return {
            score: 50,
            risk: "High",
            category: "General_Suspicious_Activity",
            signals: ["AI Service failed during image analysis"],
            recommendation: "Manual verification required.",
            language: "unknown",
            mlPowered: false,
            analysisType: 'image'
        };
    }
};

module.exports = { analyzeInput, analyzeImage };
