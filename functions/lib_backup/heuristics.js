"use strict";
/**
 * Fraud Detection Heuristics (Phase 8)
 *
 * Contains rules and scoring logic to detect:
 * - Spam messages
 * - Fake profiles
 * - Payment fraud
 * - Scam attempts
 * - Inappropriate content
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskLevel = void 0;
exports.detectSpam = detectSpam;
exports.detectEscortContent = detectEscortContent;
exports.detectPII = detectPII;
exports.assessUserRisk = assessUserRisk;
exports.detectBotBehavior = detectBotBehavior;
exports.scanContent = scanContent;
exports.calculateTrustScore = calculateTrustScore;
/**
 * Risk levels for content/user assessment
 */
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high";
    RiskLevel["CRITICAL"] = "critical";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
/**
 * Spam patterns to check in messages
 */
const SPAM_PATTERNS = [
    /\b(click here|buy now|limited time|act now)\b/i,
    /\b(viagra|cialis|porn|xxx)\b/i,
    /\b(whatsapp|telegram|snapchat|kik)\s*[:=]?\s*[\d+]/i,
    /\b(cashapp|venmo|paypal|zelle)\s*[:=]?\s*[@\w]+/i,
    /(http|https):\/\/[^\s]+/g, // External links
    /\$\d+|\d+\s*(usd|eur|pln|dollars?|euros?)/i, // Money mentions
];
/**
 * Suspicious keywords that might indicate escort/sex work
 */
const ESCORT_KEYWORDS = [
    /\b(escort|hooker|prostitute|sex work)\b/i,
    /\b(full service|gfe|pse|greek)\b/i,
    /\b(incall|outcall|donation|roses)\b/i,
    /\b(happy ending|massage parlor)\b/i,
];
/**
 * PII patterns that users shouldn't share early
 */
const PII_PATTERNS = [
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone numbers
    /\b[\w.%-]+@[\w.-]+\.\w{2,}\b/, // Email addresses
    /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd)\b/i, // Street addresses
];
/**
 * Check if message content contains spam patterns
 */
function detectSpam(content) {
    const matches = [];
    let matchCount = 0;
    for (const pattern of SPAM_PATTERNS) {
        const result = content.match(pattern);
        if (result) {
            matches.push(pattern.source);
            matchCount += result.length;
        }
    }
    // Risk scoring based on number of matches
    let risk = RiskLevel.LOW;
    if (matchCount >= 3) {
        risk = RiskLevel.CRITICAL;
    }
    else if (matchCount >= 2) {
        risk = RiskLevel.HIGH;
    }
    else if (matchCount >= 1) {
        risk = RiskLevel.MEDIUM;
    }
    return {
        isSpam: matchCount > 0,
        risk,
        matches,
    };
}
/**
 * Check for escort/sex work keywords (legal compliance)
 */
function detectEscortContent(content) {
    const matches = [];
    let matchCount = 0;
    for (const pattern of ESCORT_KEYWORDS) {
        const result = content.match(pattern);
        if (result) {
            matches.push(pattern.source);
            matchCount += result.length;
        }
    }
    // Any escort keywords are high risk
    const risk = matchCount > 0 ? RiskLevel.CRITICAL : RiskLevel.LOW;
    return {
        detected: matchCount > 0,
        risk,
        matches,
    };
}
/**
 * Check for premature PII sharing (privacy concern)
 */
function detectPII(content) {
    const types = [];
    if (PII_PATTERNS[0].test(content))
        types.push("phone");
    if (PII_PATTERNS[1].test(content))
        types.push("email");
    if (PII_PATTERNS[2].test(content))
        types.push("address");
    const risk = types.length > 0 ? RiskLevel.MEDIUM : RiskLevel.LOW;
    return {
        detected: types.length > 0,
        risk,
        types,
    };
}
function assessUserRisk(behavior) {
    const reasons = [];
    let score = 0;
    // New account sending lots of messages
    if (behavior.accountAge < 24 && behavior.messagesSent > 50) {
        score += 3;
        reasons.push("High message volume from new account");
    }
    // Multiple chat attempts with no wallet activity
    if (behavior.chatsStarted > 5 && behavior.transactionCount === 0) {
        score += 2;
        reasons.push("Multiple chats with no payments");
    }
    // Multiple reports against user
    if (behavior.reportedCount > 2) {
        score += 4;
        reasons.push("Multiple user reports");
    }
    // Not verified but trying to earn
    if (behavior.verificationStatus !== "approved" && behavior.walletBalance > 100) {
        score += 3;
        reasons.push("Unverified user with earnings");
    }
    // Determine risk level
    let risk;
    if (score >= 7) {
        risk = RiskLevel.CRITICAL;
    }
    else if (score >= 5) {
        risk = RiskLevel.HIGH;
    }
    else if (score >= 3) {
        risk = RiskLevel.MEDIUM;
    }
    else {
        risk = RiskLevel.LOW;
    }
    return { risk, reasons };
}
/**
 * Check for rapid successive actions (bot behavior)
 */
function detectBotBehavior(timestamps) {
    if (timestamps.length < 3) {
        return { isBot: false, risk: RiskLevel.LOW };
    }
    // Check if actions are too uniform (< 2 second intervals)
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
        const diff = timestamps[i].toMillis() - timestamps[i - 1].toMillis();
        intervals.push(diff);
    }
    // Bot detection: all intervals < 2 seconds
    const rapidActions = intervals.filter(i => i < 2000).length;
    const isBot = rapidActions > 5;
    const risk = isBot ? RiskLevel.CRITICAL : RiskLevel.LOW;
    return { isBot, risk };
}
function scanContent(content) {
    const spam = detectSpam(content);
    const escort = detectEscortContent(content);
    const pii = detectPII(content);
    const reasons = [];
    let maxRisk = RiskLevel.LOW;
    if (spam.isSpam) {
        reasons.push("Spam patterns detected");
        if (spam.risk === RiskLevel.CRITICAL || spam.risk === RiskLevel.HIGH) {
            maxRisk = spam.risk;
        }
    }
    if (escort.detected) {
        reasons.push("Escort/sex work keywords detected");
        maxRisk = RiskLevel.CRITICAL; // Instant critical
    }
    if (pii.detected) {
        reasons.push(`PII detected: ${pii.types.join(", ")}`);
        if (maxRisk === RiskLevel.LOW) {
            maxRisk = RiskLevel.MEDIUM;
        }
    }
    // Flag if risk is HIGH or CRITICAL
    const shouldFlag = maxRisk === RiskLevel.HIGH || maxRisk === RiskLevel.CRITICAL;
    return {
        overallRisk: maxRisk,
        shouldFlag,
        reasons,
        details: {
            spam: spam.isSpam ? spam : undefined,
            escort: escort.detected ? escort : undefined,
            pii: pii.detected ? pii : undefined,
        },
    };
}
/**
 * Calculate trust score (0-100)
 * Higher = more trustworthy
 */
function calculateTrustScore(data) {
    let score = 50; // Start neutral
    // Account age bonus (max +15)
    const ageBonus = Math.min(15, Math.floor(data.accountAgeHours / 168)); // +1 per week, max 15 weeks
    score += ageBonus;
    // Verification bonus
    if (data.verificationStatus === "approved") {
        score += 20;
    }
    // Reports penalty
    score -= data.reportedCount * 10;
    // Transaction history bonus (max +10)
    const txBonus = Math.min(10, data.successfulTransactions);
    score += txBonus;
    // Review balance
    const reviewScore = (data.positiveReviews * 2) - (data.negativeReviews * 3);
    score += Math.min(10, Math.max(-10, reviewScore));
    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
}
//# sourceMappingURL=heuristics.js.map