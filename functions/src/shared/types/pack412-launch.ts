import { MONETIZATION_SPLITS, SPLITS } from "../../config/monetizationSplits";

/**
 * Pack 412 Launch Types
 */

export interface LaunchConfig {
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  targetRegions: string[];
  features: string[];
  rolloutPercentage: number;
}

export interface LaunchMetrics {
  launchId: string;
  activeUsers: number;
  conversions: number;
  errors: number;
  timestamp: Date;
}

export type LaunchStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';



























