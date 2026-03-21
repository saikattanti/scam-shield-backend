const puppeteer = require('puppeteer');
const whois = require('whois');

// Promisify whois lookup
const lookupWhois = (domain) => {
    return new Promise((resolve) => {
        try {
            whois.lookup(domain, (err, data) => {
                if (err) return resolve(null);
                resolve(data);
            });
        } catch (error) {
            resolve(null);
        }
    });
};

/**
 * Perform a deep scan of a URL using WHOIS and a Headless Browser Sandbox
 * @param {string} url - The URL to scan
 * @returns {object} - Risk score, signals, and extracted metadata
 */
const deepAnalyzeUrl = async (url) => {
    console.log(`🔍 Starting Deep URL Scan on: ${url}`);
    let signals = [];
    let riskScore = 0;
    
    // Default metadata
    let urlInfo = {
        title: null,
        creationDate: null,
        ageInDays: null,
        hasPasswordForm: false
    };

    try {
        // Ensure valid URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');

        // === 1. WHOIS Domain Age Check ===
        console.log(`  -> Checking WHOIS for ${domain}...`);
        const whoisData = await lookupWhois(domain);
        
        if (whoisData) {
            // Find "Creation Date:" or "Registered on" depending on registrar
            const creationMatch = whoisData.match(/(?:Creation Date|Registered on|Registration Time):\s*(.+)/i);
            if (creationMatch && creationMatch[1]) {
                const creationDate = new Date(creationMatch[1].trim());
                if (!isNaN(creationDate.getTime())) {
                    urlInfo.creationDate = creationDate.toISOString();
                    
                    const ageInDays = (new Date() - creationDate) / (1000 * 60 * 60 * 24);
                    urlInfo.ageInDays = Math.round(ageInDays);

                    if (ageInDays < 15) {
                        riskScore += 50;
                        signals.push(`🚨 CRITICAL: Domain is extremely new (${urlInfo.ageInDays} days old). High risk of temporary scam site.`);
                    } else if (ageInDays < 180) {
                        riskScore += 20;
                        signals.push(`⚠️ Domain was registered recently (${urlInfo.ageInDays} days ago). Proceed with caution.`);
                    } else {
                        signals.push(`✅ Domain is established (${urlInfo.ageInDays} days old).`);
                    }
                }
            }
        } else {
            riskScore += 10;
            signals.push(`⚠️ Could not retrieve WHOIS records (Domain might be hidden).`);
        }

        // === 2. Headless Browser Sandboxing ===
        console.log(`  -> Launching Puppeteer Sandbox for ${url}...`);
        let browser = null;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                timeout: 10000 
            });
            const page = await browser.newPage();
            
            // Go to page, waiting only for DOM to load (not all images)
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
            
            urlInfo.title = await page.title();
            console.log(`  -> Page Title: ${urlInfo.title}`);
            
            // Check for trickery: Title says "Bank" but domain is not matching
            const titleLower = urlInfo.title.toLowerCase();
            if (titleLower.includes('bank') && !domain.includes('bank') && !domain.includes('sbi') && !domain.includes('hdfc')) {
                riskScore += 30;
                signals.push(`🚨 Title claims to be a Bank, but domain name does not match conventional banking URLs.`);
            }

            // Look for credential stealing forms (login pages)
            urlInfo.hasPasswordForm = await page.evaluate(() => {
                return !!document.querySelector('input[type="password"]');
            });

            if (urlInfo.hasPasswordForm) {
                if (urlObj.protocol === 'http:') {
                    riskScore += 60;
                    signals.push(`🚨 CRITICAL: Page asks for a password over an INSECURE (HTTP) connection!`);
                } else {
                    riskScore += 15;
                    signals.push(`⚠️ Page contains a login form (Potential phishing risk).`);
                }
            }
            
        } catch (sandboxError) {
            console.log(`  -> Sandbox Error: ${sandboxError.message}`);
            riskScore += 10;
            signals.push(`⚠️ Could not fully load site in sandbox (It may be offline or blocking crawlers).`);
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) {
                    console.log(`  -> Warning: Sandbox cleanup error ignored: ${closeErr.message}`);
                }
            }
        }

    } catch (e) {
        console.error("Deep URL Scan Error:", e.message);
        riskScore += 10;
        signals.push("⚠️ Invalid URL structure or formatting.");
    }

    console.log(`🔍 Deep Scan Complete. Added Risk Score: ${riskScore}`);
    
    return {
        addedScore: riskScore,
        newSignals: signals,
        metadata: urlInfo
    };
};

module.exports = { deepAnalyzeUrl };
