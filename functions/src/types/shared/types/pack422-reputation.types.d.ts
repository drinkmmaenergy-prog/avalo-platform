export interface ReputationScore  {
    userId: string;
    score: number;
    tier: string;
    factors: ReputationFactor[];
  [key: string]: any;
}
export interface ReputationFactor  {
    name: string;
    weight: number;
    value: number;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  [key: string]: any;
}
export interface ReputationPolicy  {
    id: string;
    name: string;
    rules: string[];
    penalties: string[];
  [key: string]: any;
}
export type ReputationTier = 'NEW' | 'TRUSTED' | 'VERIFIED' | 'ELITE';
