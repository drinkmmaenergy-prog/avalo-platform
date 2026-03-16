import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface CreatorLeagueEntry {
    earnerId: string;
    tier: string;
    points: number;
    rank: number;
}
export interface LeagueTier {
    name: string;
    minPoints: number;
    maxPoints: number;
    benefits: string[];
}
export type LeagueTierName = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';


























