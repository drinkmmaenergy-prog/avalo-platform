// Stub types for creator league
export interface CreatorLeagueEntry {
  creatorId: string;
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
