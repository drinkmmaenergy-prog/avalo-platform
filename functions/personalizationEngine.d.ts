/**
 * PACK 49 — Personalization Engine
 * Pure logic for computing user taste profiles from aggregated signals
 * NO Firestore I/O inside these functions
 */
export interface TasteCounters {
    swipeRightCount: number;
    chatMessageCount: number;
    tokensSpentTotal: number;
    mediaUnlockCount: number;
    aiMessageCount: number;
}
export interface TasteProfileInput {
    counters: TasteCounters;
    interestCounts: Record<string, number>;
    genderCounts: Record<string, number>;
    agePrefMin?: number | null;
    agePrefMax?: number | null;
    distanceKm?: number | null;
}
export interface TasteProfileCalculated {
    preferredAgeMin: number | null;
    preferredAgeMax: number | null;
    preferredDistanceKm: number | null;
    likedInterests: string[];
    dislikedInterests: string[];
    preferredGenders: string[];
    interactionIntensityScore: number;
    spenderScore: number;
    aiUsageScore: number;
}
/**
 * Compute taste profile from aggregated user behavior signals
 * Pure function - deterministic output for same input
 */
export declare function computeTasteProfile(input: TasteProfileInput): TasteProfileCalculated;
/**
 * Helper to aggregate events into counters
 * Used by background aggregation functions
 */
export declare function aggregateEventCounters(events: Array<{
    type: string;
    tokensSpent?: number;
    interestsContext?: string[];
    targetGender?: string;
}>): {
    counters: TasteCounters;
    interestCounts: Record<string, number>;
    genderCounts: Record<string, number>;
};
declare const _default: {
    computeTasteProfile: typeof computeTasteProfile;
    aggregateEventCounters: typeof aggregateEventCounters;
};
export default _default;
