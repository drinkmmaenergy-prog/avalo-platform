export interface ReputationScore {
    userId: string;
    score: number;
    tier: string;
    factors: ReputationFactor[];
}
export interface ReputationFactor {
    name: string;
    weight: number;
    value: number;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}
export interface ReputationPolicy {
    id: string;
    name: string;
    rules: string[];
    penalties: string[];
}
export type ReputationTier = 'NEW' | 'TRUSTED' | 'VERIFIED' | 'ELITE';
