const puppeteer = require('puppeteer');
const whois = require('whois');
const axios = require('axios');
const dns = require('dns').promises;

// Promisify whois lookup
const lookupWhois = (domain) => {
    return new Promise((resolve) => {
        // Set a hard timeout for WHOIS lookups (usually the biggest bottleneck)
        const timeout = setTimeout(() => {
            console.log(`⚠️ WHOIS timeout for ${domain}`);
            resolve(null);
        }, 8000);

        try {
            whois.lookup(domain, (err, data) => {
                clearTimeout(timeout);
                if (err) return resolve(null);
                resolve(data);
            });
        } catch (error) {
            clearTimeout(timeout);
            resolve(null);
        }
    });
};

// Known URL shortener services
const URL_SHORTENERS = [
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'tiny.cc',
    'ow.ly', 'buff.ly', 'rb.gy', 'short.io', 'snip.ly', 'rebrand.ly',
    'cutt.ly', 'bl.ink', 'bitly.com', 'v.gd', 'yourls.org', 'clck.ru',
    'shorte.st', 'adf.ly', 'bc.vc', 'mcaf.ee', 'wa.me',
];

// Known phishing domain patterns
const PHISHING_PATTERNS = [
    /sbi[\-\.]?(net|co|bank|login|secure|kyc|verification)/i,
    /hdfc[\-\.]?(net|co|bank|login|secure)/i,
    /paytm[\-\.]?(kyc|verify|secure|login|help)/i,
    /phonepe[\-\.]?(kyc|verify|secure|login)/i,
    /icici[\-\.]?(net|co|bank|secure)/i,
    /axis[\-\.]?(bank|secure|kyc)/i,
    /npci[\-\.]?(org|verify|upi)/i,
    /rbi[\-\.]?(org|secure|verify)/i,
    /income[\-\.]?tax[\-\.]?(verify|secure|refund)/i,
    /aadhaar[\-\.]?(verify|update|kyc)/i,
    /uidai[\-\.]?(verify|update|secure)/i,
    /amazon[\-\.]?(verify|secure|in)/i,
    /whatsapp[\-\.]?(verify|call|video)/i,
];

// Suspicious TLDs often used in scams
const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.download'];

/**
 * Attempt to resolve a shortlink to its final destination
 */
const unshortenUrl = async (url) => {
    try {
        const response = await axios.head(url, {
            maxRedirects: 10,
            timeout: 5000,
            validateStatus: () => true,
        });
        return response.request?.res?.responseUrl || response.config?.url || url;
    } catch {
        try {
            // Fallback to GET if HEAD fails
            const response = await axios.get(url, {
                maxRedirects: 5,
                timeout: 5000,
                validateStatus: () => true,
            });
            return response.request?.res?.responseUrl || url;
        } catch {
            return url;
        }
    }
};

/**
 * DNS resolution check — verifies if domain resolves and detects suspicious patterns
 */
const checkDNS = async (domain) => {
    try {
        const addresses = await Promise.race([
            dns.resolve4(domain),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 4000))
        ]);
        return { resolves: true, ips: addresses };
    } catch {
        return { resolves: false, ips: [] };
    }
};

/**
 * Perform a deep scan of a URL using WHOIS, DNS, and a Headless Browser Sandbox
 * @param {string} url - The URL to scan
 * @returns {object} - Risk score, signals, and extracted metadata
 */
const deepAnalyzeUrl = async (url) => {
    console.log(`🔍 Starting Deep URL Scan on: ${url}`);
    let signals = [];
    let riskScore = 0;
    
    let urlInfo = {
        title: null,
        creationDate: null,
        ageInDays: null,
        hasPasswordForm: false,
        isShortlink: false,
        resolvedUrl: null,
        dnsResolved: false,
        suspiciousTLD: false,
        matchesPhishingPattern: false,
        isIPUrl: false,
        protocol: 'https',
        domainAge: null,
    };

    let targetUrl = url;

    try {
        // Ensure valid URL
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }
        
        const urlObj = new URL(targetUrl);
        const domain = urlObj.hostname.replace('www.', '');
        urlInfo.protocol = urlObj.protocol;

        // === 0. Raw IP address detection ===
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipRegex.test(urlObj.hostname)) {
            urlInfo.isIPUrl = true;
            riskScore += 40;
            signals.push('🚨 CRITICAL: URL uses a raw IP address instead of a domain name. This is a major phishing indicator.');
        }

        // === 1. Shortlink Detection + Unshortening ===
        const isShortlink = URL_SHORTENERS.some(s => domain.includes(s));
        if (isShortlink) {
            urlInfo.isShortlink = true;
            riskScore += 25;
            signals.push(`⚠️ URL shortener detected (${domain}). Shortlinks hide the real destination.`);
            console.log(`  -> Unshortening ${targetUrl}...`);
            const resolved = await unshortenUrl(targetUrl);
            if (resolved !== targetUrl) {
                urlInfo.resolvedUrl = resolved;
                signals.push(`🔍 Resolves to: ${resolved.substring(0, 100)}`);
                // Update domain for further checks
                try {
                    const resolvedObj = new URL(resolved);
                    const resolvedDomain = resolvedObj.hostname.replace('www.', '');
                    if (PHISHING_PATTERNS.some(p => p.test(resolvedDomain))) {
                        riskScore += 40;
                        signals.push(`🚨 CRITICAL: Shortlink RESOLVES to a known phishing domain pattern: ${resolvedDomain}`);
                    }
                } catch { /* ignore */ }
            }
        }

        // === 2. Suspicious TLD check ===
        const tld = domain.substring(domain.lastIndexOf('.'));
        if (SUSPICIOUS_TLDS.includes(tld.toLowerCase())) {
            urlInfo.suspiciousTLD = true;
            riskScore += 20;
            signals.push(`⚠️ Suspicious free/scam TLD detected: ${tld} — highly associated with fraud sites.`);
        }

        // === 3. Phishing Pattern Matching ===
        if (PHISHING_PATTERNS.some(p => p.test(domain))) {
            urlInfo.matchesPhishingPattern = true;
            riskScore += 50;
            signals.push(`🚨 CRITICAL: Domain matches known Indian bank/UPI phishing patterns: "${domain}"`);
        }

        // === 4. DNS Resolution Check ===
        if (!urlInfo.isIPUrl) {
            console.log(`  -> DNS check for ${domain}...`);
            const dnsResult = await checkDNS(domain);
            urlInfo.dnsResolved = dnsResult.resolves;
            if (!dnsResult.resolves) {
                riskScore += 15;
                signals.push(`⚠️ Domain does not resolve via DNS — may be offline or newly registered.`);
            } else {
                // Check for suspicious IP ranges (private/localhost)
                const suspiciousIPs = dnsResult.ips.filter(ip => 
                    ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('172.16.')
                );
                if (suspiciousIPs.length > 0) {
                    riskScore += 30;
                    signals.push(`🚨 Domain resolves to a private/local IP address — likely a network attack.`);
                }
            }
        }

        // === 5. WHOIS Domain Age Check ===
        if (!urlInfo.isIPUrl) {
            console.log(`  -> Checking WHOIS for ${domain}...`);
            const whoisData = await lookupWhois(domain);
            
            if (whoisData) {
                const creationMatch = whoisData.match(/(?:Creation Date|Registered on|Registration Time|Created Date):\s*(.+)/i);
                if (creationMatch && creationMatch[1]) {
                    const creationDate = new Date(creationMatch[1].trim());
                    if (!isNaN(creationDate.getTime())) {
                        urlInfo.creationDate = creationDate.toISOString();
                        const ageInDays = (new Date() - creationDate) / (1000 * 60 * 60 * 24);
                        urlInfo.ageInDays = Math.round(ageInDays);
                        urlInfo.domainAge = urlInfo.ageInDays;

                        if (ageInDays < 15) {
                            riskScore += 50;
                            signals.push(`🚨 CRITICAL: Domain is only ${urlInfo.ageInDays} days old — extremely new, high risk of temporary scam site.`);
                        } else if (ageInDays < 90) {
                            riskScore += 25;
                            signals.push(`⚠️ Domain registered only ${urlInfo.ageInDays} days ago. New sites are commonly used for fraud.`);
                        } else if (ageInDays < 180) {
                            riskScore += 10;
                            signals.push(`⚠️ Domain is relatively new (${urlInfo.ageInDays} days old). Verify carefully.`);
                        } else {
                            signals.push(`✅ Domain is established (${urlInfo.ageInDays} days old).`);
                        }
                    }
                }

                // Check for privacy-protected WHOIS (scammers hide identity)
                if (whoisData.includes('privacy') || whoisData.includes('Protected') || whoisData.includes('REDACTED FOR PRIVACY')) {
                    riskScore += 10;
                    signals.push(`⚠️ Domain owner identity is hidden (WHOIS privacy-protected).`);
                }
            } else {
                riskScore += 10;
                signals.push(`⚠️ WHOIS records unavailable — domain history cannot be verified.`);
            }
        }

        // === 6. HTTP vs HTTPS for sensitive content ===
        if (urlInfo.protocol === 'http:') {
            riskScore += 20;
            signals.push(`🚨 Insecure HTTP connection — any data entered here is transmitted without encryption.`);
        }

        // === 7. Headless Browser Sandboxing ===
        console.log(`  -> Launching Puppeteer Sandbox for ${targetUrl}...`);
        let browser = null;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                timeout: 10000 
            });
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
            
            urlInfo.title = await page.title();
            console.log(`  -> Page Title: ${urlInfo.title}`);
            
            // Title mismatch check (e.g., "SBI" title but not sbi.co.in)
            const titleLower = urlInfo.title.toLowerCase();
            const bankKeywords = ['sbi', 'hdfc', 'icici', 'axis', 'bank', 'paytm', 'phonepe', 'npci', 'aadhaar', 'uidai'];
            const trustedDomains = ['sbi.co.in', 'hdfcbank.com', 'icicibank.com', 'axisbank.com', 'paytm.com', 'phonepe.com'];
            
            for (const kw of bankKeywords) {
                if (titleLower.includes(kw) && !trustedDomains.some(d => domain.endsWith(d))) {
                    riskScore += 35;
                    signals.push(`🚨 CRITICAL: Page title claims to be "${urlInfo.title}" but domain does not match official website.`);
                    break;
                }
            }

            // Password form check
            urlInfo.hasPasswordForm = await page.evaluate(() => !!document.querySelector('input[type="password"]'));
            if (urlInfo.hasPasswordForm) {
                if (urlObj.protocol === 'http:') {
                    riskScore += 50;
                    signals.push(`🚨 CRITICAL: Page is stealing credentials over an INSECURE (HTTP) connection!`);
                } else {
                    riskScore += 20;
                    signals.push(`⚠️ Page contains a login/password form — verify this is the official website before entering credentials.`);
                }
            }

            // Check for OTP/Aadhaar/PAN input fields (data harvesting)
            const hasSensitiveForm = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input');
                const suspicious = ['otp', 'aadhaar', 'aadhar', 'pan', 'debit', 'credit', 'cvv', 'pin'];
                return Array.from(inputs).some(inp => 
                    suspicious.some(s => (inp.name || inp.placeholder || inp.id || '').toLowerCase().includes(s))
                );
            });

            if (hasSensitiveForm) {
                riskScore += 30;
                signals.push(`🚨 Page contains input fields for OTP/Aadhaar/PAN/CVV — high risk of data theft.`);
            }
            
        } catch (sandboxError) {
            console.log(`  -> Sandbox: ${sandboxError.message}`);
            signals.push(`⚠️ Could not fully load site in sandbox — it may be offline, blocking crawlers, or the URL may be malformed.`);
        } finally {
            if (browser) {
                try { await browser.close(); } catch { /* ignore */ }
            }
        }

    } catch (e) {
        console.error("Deep URL Scan Error:", e.message);
        riskScore += 10;
        signals.push("⚠️ Invalid URL structure or formatting.");
    }

    console.log(`🔍 Deep Scan Complete. Total Risk Score Added: ${riskScore}`);
    
    return {
        addedScore: riskScore,
        newSignals: signals,
        metadata: urlInfo
    };
};

module.exports = { deepAnalyzeUrl };
