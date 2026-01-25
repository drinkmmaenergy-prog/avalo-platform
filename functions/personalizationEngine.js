"use strict";
/**
 * PACK 49 — Personalization Engine
 * Pure logic for computing user taste profiles from aggregated signals
 * NO Firestore I/O inside these functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeTasteProfile = computeTasteProfile;
exports.aggregateEventCounters = aggregateEventCounters;
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    TOP_INTERESTS_COUNT: 10,
    MIN_INTEREST_THRESHOLD: 2, // Min occurrences to be considered
    MIN_GENDER_THRESHOLD: 3, // Min occurrences to prefer a gender
    // Score scaling factors
    INTERACTION_LOG_BASE: 50, // Log scale base for interaction
    SPENDER_LOG_BASE: 100, // Log scale base for spending
    AI_USAGE_LOG_BASE: 30, // Log scale base for AI usage
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Compute log-scaled score from 0 to 100
 * Uses logarithmic scaling to handle wide ranges of values
 */
function computeLogScore(value, logBase) {
    if (value <= 0)
        return 0;
    // Log scale: score = 100 * (log(value + 1) / log(logBase + 1))
    const score = 100 * (Math.log(value + 1) / Math.log(logBase + 1));
    // Clamp to 0-100
    return Math.min(100, Math.max(0, Math.round(score)));
}
/**
 * Get top N items by count from a record
 */
function getTopItems(items, n, minThreshold = 0) {
    return Object.entries(items)
        .filter(([_, count]) => count >= minThreshold)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, n)
        .map(([key, _]) => key);
}
// ============================================================================
// MAIN COMPUTATION FUNCTION
// ============================================================================
/**
 * Compute taste profile from aggregated user behavior signals
 * Pure function - deterministic output for same input
 */
function computeTasteProfile(input) {
    const { counters, interestCounts, genderCounts, agePrefMin, agePrefMax, distanceKm } = input;
    // Extract liked interests (top N with min threshold)
    const likedInterests = getTopItems(interestCounts, CONFIG.TOP_INTERESTS_COUNT, CONFIG.MIN_INTEREST_THRESHOLD);
    // Disliked interests - reserved for future negative signals
    const dislikedInterests = [];
    // Preferred genders (those with significant count)
    const preferredGenders = getTopItems(genderCounts, 3, // Max 3 genders
    CONFIG.MIN_GENDER_THRESHOLD);
    // Compute interaction intensity score
    // Based on: swipe rights + chat messages + media unlocks
    const interactionTotal = counters.swipeRightCount +
        counters.chatMessageCount +
        counters.mediaUnlockCount;
    const interactionIntensityScore = computeLogScore(interactionTotal, CONFIG.INTERACTION_LOG_BASE);
    // Compute spender score
    // Based on: total tokens spent
    const spenderScore = computeLogScore(counters.tokensSpentTotal, CONFIG.SPENDER_LOG_BASE);
    // Compute AI usage score
    // Based on: AI messages relative to total messages
    const totalMessages = counters.chatMessageCount + counters.aiMessageCount;
    let aiUsageScore = 0;
    if (totalMessages > 0) {
        const aiRatio = counters.aiMessageCount / totalMessages;
        aiUsageScore = Math.round(aiRatio * 100);
    }
    return {
        preferredAgeMin: agePrefMin ?? null,
        preferredAgeMax: agePrefMax ?? null,
        preferredDistanceKm: distanceKm ?? null,
        likedInterests,
        dislikedInterests,
        preferredGenders,
        interactionIntensityScore,
        spenderScore,
        aiUsageScore,
    };
}
/**
 * Helper to aggregate events into counters
 * Used by background aggregation functions
 */
function aggregateEventCounters(events) {
    const counters = {
        swipeRightCount: 0,
        chatMessageCount: 0,
        tokensSpentTotal: 0,
        mediaUnlockCount: 0,
        aiMessageCount: 0,
    };
    const interestCounts = {};
    const genderCounts = {};
    for (const event of events) {
        // Update counters based on event type
        switch (event.type) {
            case 'SWIPE_RIGHT':
                counters.swipeRightCount++;
                break;
            case 'CHAT_MESSAGE_SENT':
                counters.chatMessageCount++;
                break;
            case 'TOKENS_SPENT':
                counters.tokensSpentTotal += event.tokensSpent || 0;
                break;
            case 'MEDIA_UNLOCK':
                counters.mediaUnlockCount++;
                counters.tokensSpentTotal += event.tokensSpent || 0;
                break;
            case 'AI_MESSAGE':
                counters.aiMessageCount++;
                break;
        }
        // Aggregate interests
        if (event.interestsContext) {
            for (const interest of event.interestsContext) {
                const normalized = interest.toLowerCase().trim();
                if (normalized) {
                    interestCounts[normalized] = (interestCounts[normalized] || 0) + 1;
                }
            }
        }
        // Aggregate genders
        if (event.targetGender) {
            const normalized = event.targetGender.toLowerCase().trim();
            if (normalized) {
                genderCounts[normalized] = (genderCounts[normalized] || 0) + 1;
            }
        }
    }
    return { counters, interestCounts, genderCounts };
}
// ============================================================================
// EXPORTS
// ============================================================================
exports.default = {
    computeTasteProfile,
    aggregateEventCounters,
};
