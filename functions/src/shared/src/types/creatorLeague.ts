import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

/**
 * Creator League Types
 */

export interface CreatorLeague {
  id: string;
  name: string;
  tier: LeagueTier;
  members: string[];
  createdAt: Date;
}

export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface LeagueStanding {
  userId: string;
  points: number;
  rank: number;
  tier: LeagueTier;
}

export interface LeagueReward {
  id: string;
  tier: LeagueTier;
  type: 'badge' | 'tokens' | 'feature_unlock';
  value: number | string;
}




























