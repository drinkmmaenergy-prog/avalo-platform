/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Ambassador Types & Structure
 * 
 * Defines all ambassador roles, hierarchies, and regional structures
 */

import * as admin from 'firebase-admin';

// ============================================================================
// AMBASSADOR ROLES & TYPES
// ============================================================================

export enum AmbassadorRole {
  CITY_AMBASSADOR = 'city_ambassador',
  CAMPUS_AMBASSADOR = 'campus_ambassador',
  NIGHTLIFE_AMBASSADOR = 'nightlife_ambassador',
  CREATOR_RECRUITER = 'creator_recruiter',
  COMMUNITY_AMBASSADOR = 'community_ambassador',
}

export enum AmbassadorTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  TITAN = 'titan', // City lead
}

export enum AmbassadorStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
}

// ============================================================================
// AMBASSADOR DATA STRUCTURES
// ============================================================================

export interface AmbassadorProfile {
  id: string;
  userId: string;
  role: AmbassadorRole;
  tier: AmbassadorTier;
  status: AmbassadorStatus;
  
  // Regional assignment
  region: {
    country: string;
    city: string;
    state?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    radius?: number; // in km
  };
  
  // Identification
  referralCode: string; // Unique alphanumeric code
  qrCode: string; // URL to dynamic QR code
  digitalIdCard: string; // URL to ambassador ID card
  
  // KPIs
  kpis: AmbassadorKPIs;
  
  // Compensation
  compensation: CompensationSettings;
  
  // Metadata
  createdAt: admin.firestore.Timestamp;
  approvedAt?: admin.firestore.Timestamp;
  lastActiveAt?: admin.firestore.Timestamp;
  certifications: string[]; // Training modules completed
  
  // Performance
  performance: {
    totalReferrals: number;
    verifiedReferrals: number;
    creatorsRecruited: number;
    eventsHosted: number;
    revenue: number;
    rating: number;
  };
  
  // Contract
  contractUrl?: string;
  contractSigned?: boolean;
  contractSignedAt?: admin.firestore.Timestamp;
}

export interface AmbassadorKPIs {
  // Referral targets
  minMonthlyReferrals: number;
  minCreatorsPerMonth: number;
  minEventsPerQuarter: number;
  
  // Quality targets
  minConversionRate: number; // % of referrals who complete KYC
  minRetentionRate: number; // % who stay active 30 days
  
  // Revenue targets
  minMonthlyRevenue?: number;
  
  // Custom targets by role
  customTargets?: Record<string, number>;
}

export interface CompensationSettings {
  // Per-action payments
  cpi?: number; // Cost per install
  cpa?: number; // Cost per activation (KYC + profile)
  cps?: number; // Cost per subscriber (Royal/VIP)
  
  // Revenue sharing
  revShare?: number; // % of lifetime earnings (1-3%)
  revShareDuration?: number; // months
  
  // Event rewards
  eventRewards?: {
    perAttendee?: number;
    bonusThreshold?: number;
    bonusAmount?: number;
  };
  
  // Tier bonuses
  tierMultiplier: number; // 1.0 for bronze, up to 3.0 for titan
  
  // Regional multipliers
  regionalMultiplier?: number; // High-value markets get higher rates
}

// ============================================================================
// TIER REQUIREMENTS
// ============================================================================

export const TIER_REQUIREMENTS: Record<AmbassadorTier, TierRequirement> = {
  [AmbassadorTier.BRONZE]: {
    minReferrals: 0,
    minCreators: 0,
    minEvents: 0,
    minRevenue: 0,
    multiplier: 1.0,
  },
  [AmbassadorTier.SILVER]: {
    minReferrals: 50,
    minCreators: 5,
    minEvents: 2,
    minRevenue: 500,
    multiplier: 1.3,
  },
  [AmbassadorTier.GOLD]: {
    minReferrals: 200,
    minCreators: 20,
    minEvents: 5,
    minRevenue: 2000,
    multiplier: 1.6,
  },
  [AmbassadorTier.PLATINUM]: {
    minReferrals: 500,
    minCreators: 50,
    minEvents: 10,
    minRevenue: 5000,
    multiplier: 2.0,
  },
  [AmbassadorTier.TITAN]: {
    minReferrals: 1000,
    minCreators: 100,
    minEvents: 20,
    minRevenue: 10000,
    multiplier: 3.0,
  },
};

export interface TierRequirement {
  minReferrals: number;
  minCreators: number;
  minEvents: number;
  minRevenue: number;
  multiplier: number;
}

// ============================================================================
// ROLE DESCRIPTIONS & KPIS
// ============================================================================

export const ROLE_DEFINITIONS: Record<AmbassadorRole, RoleDefinition> = {
  [AmbassadorRole.CITY_AMBASSADOR]: {
    name: 'City Ambassador',
    description: 'Manages a city, brings influencers, hosts meetups',
    defaultKPIs: {
      minMonthlyReferrals: 100,
      minCreatorsPerMonth: 10,
      minEventsPerQuarter: 3,
      minConversionRate: 0.3,
      minRetentionRate: 0.5,
    },
    maxRadius: 50, // km
  },
  [AmbassadorRole.CAMPUS_AMBASSADOR]: {
    name: 'Campus Ambassador',
    description: 'University-level recruiting',
    defaultKPIs: {
      minMonthlyReferrals: 50,
      minCreatorsPerMonth: 5,
      minEventsPerQuarter: 2,
      minConversionRate: 0.4,
      minRetentionRate: 0.6,
    },
    maxRadius: 10, // Campus area
  },
  [AmbassadorRole.NIGHTLIFE_AMBASSADOR]: {
    name: 'Nightlife Ambassador',
    description: 'Works with clubs, bars, DJs',
    defaultKPIs: {
      minMonthlyReferrals: 80,
      minCreatorsPerMonth: 8,
      minEventsPerQuarter: 4,
      minConversionRate: 0.25,
      minRetentionRate: 0.4,
    },
    maxRadius: 30,
  },
  [AmbassadorRole.CREATOR_RECRUITER]: {
    name: 'Creator Recruiter',
    description: 'Signs new paid creators, linked with PACK 433',
    defaultKPIs: {
      minMonthlyReferrals: 30,
      minCreatorsPerMonth: 15,
      minEventsPerQuarter: 1,
      minConversionRate: 0.5,
      minRetentionRate: 0.7,
    },
    maxRadius: 100, // Regional
  },
  [AmbassadorRole.COMMUNITY_AMBASSADOR]: {
    name: 'Community Ambassador',
    description: 'Drives local engagement & events',
    defaultKPIs: {
      minMonthlyReferrals: 60,
      minCreatorsPerMonth: 6,
      minEventsPerQuarter: 3,
      minConversionRate: 0.35,
      minRetentionRate: 0.55,
    },
    maxRadius: 40,
  },
};

export interface RoleDefinition {
  name: string;
  description: string;
  defaultKPIs: AmbassadorKPIs;
  maxRadius: number; // km
}

// ============================================================================
// REGIONAL SETTINGS
// ============================================================================

export interface RegionalConfiguration {
  country: string;
  multiplier: number; // Payment multiplier based on market
  minTierForMarket: AmbassadorTier;
  maxAmbassadorsPerCity: number;
  requiresBackgroundCheck: boolean;
  requiresIdVerification: boolean;
  minAge: number;
  currency: string;
}

export const REGIONAL_CONFIGS: Record<string, RegionalConfiguration> = {
  US: {
    country: 'United States',
    multiplier: 1.5,
    minTierForMarket: AmbassadorTier.BRONZE,
    maxAmbassadorsPerCity: 10,
    requiresBackgroundCheck: true,
    requiresIdVerification: true,
    minAge: 21,
    currency: 'USD',
  },
  UK: {
    country: 'United Kingdom',
    multiplier: 1.4,
    minTierForMarket: AmbassadorTier.BRONZE,
    maxAmbassadorsPerCity: 8,
    requiresBackgroundCheck: true,
    requiresIdVerification: true,
    minAge: 18,
    currency: 'GBP',
  },
  DE: {
    country: 'Germany',
    multiplier: 1.3,
    minTierForMarket: AmbassadorTier.BRONZE,
    maxAmbassadorsPerCity: 8,
    requiresBackgroundCheck: true,
    requiresIdVerification: true,
    minAge: 18,
    currency: 'EUR',
  },
  PL: {
    country: 'Poland',
    multiplier: 1.0,
    minTierForMarket: AmbassadorTier.BRONZE,
    maxAmbassadorsPerCity: 5,
    requiresBackgroundCheck: false,
    requiresIdVerification: true,
    minAge: 18,
    currency: 'PLN',
  },
  BR: {
    country: 'Brazil',
    multiplier: 0.8,
    minTierForMarket: AmbassadorTier.BRONZE,
    maxAmbassadorsPerCity: 12,
    requiresBackgroundCheck: false,
    requiresIdVerification: true,
    minAge: 18,
    currency: 'BRL',
  },
  IN: {
    country: 'India',
    multiplier: 0.6,
    minTierForMarket: AmbassadorTier.BRONZE,
    maxAmbassadorsPerCity: 15,
    requiresBackgroundCheck: false,
    requiresIdVerification: true,
    minAge: 18,
    currency: 'INR',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export class AmbassadorTypeService {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Get default KPIs for a role
   */
  getDefaultKPIs(role: AmbassadorRole): AmbassadorKPIs {
    return ROLE_DEFINITIONS[role].defaultKPIs;
  }

  /**
   * Get regional configuration
   */
  getRegionalConfig(countryCode: string): RegionalConfiguration {
    return REGIONAL_CONFIGS[countryCode] || REGIONAL_CONFIGS.US;
  }

  /**
   * Calculate tier based on performance
   */
  calculateTier(performance: AmbassadorProfile['performance']): AmbassadorTier {
    const tiers = [
      AmbassadorTier.TITAN,
      AmbassadorTier.PLATINUM,
      AmbassadorTier.GOLD,
      AmbassadorTier.SILVER,
      AmbassadorTier.BRONZE,
    ];

    for (const tier of tiers) {
      const req = TIER_REQUIREMENTS[tier];
      if (
        performance.verifiedReferrals >= req.minReferrals &&
        performance.creatorsRecruited >= req.minCreators &&
        performance.eventsHosted >= req.minEvents &&
        performance.revenue >= req.minRevenue
      ) {
        return tier;
      }
    }

    return AmbassadorTier.BRONZE;
  }

  /**
   * Check if performance meets tier requirements
   */
  meetsTierRequirements(
    performance: AmbassadorProfile['performance'],
    targetTier: AmbassadorTier
  ): boolean {
    const req = TIER_REQUIREMENTS[targetTier];
    return (
      performance.verifiedReferrals >= req.minReferrals &&
      performance.creatorsRecruited >= req.minCreators &&
      performance.eventsHosted >= req.minEvents &&
      performance.revenue >= req.minRevenue
    );
  }

  /**
   * Generate unique referral code
   */
  generateReferralCode(userId: string, role: AmbassadorRole): string {
    const rolePrefix = {
      [AmbassadorRole.CITY_AMBASSADOR]: 'CITY',
      [AmbassadorRole.CAMPUS_AMBASSADOR]: 'CAMP',
      [AmbassadorRole.NIGHTLIFE_AMBASSADOR]: 'NIGHT',
      [AmbassadorRole.CREATOR_RECRUITER]: 'RECV',
      [AmbassadorRole.COMMUNITY_AMBASSADOR]: 'CMTY',
    };

    const prefix = rolePrefix[role];
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userHash = userId.substring(0, 4).toUpperCase();
    
    return `${prefix}${userHash}${random}`;
  }

  /**
   * Get performance gap to next tier
   */
  getPerformanceGap(
    currentPerformance: AmbassadorProfile['performance'],
    currentTier: AmbassadorTier
  ): Partial<TierRequirement> | null {
    const tierOrder = [
      AmbassadorTier.BRONZE,
      AmbassadorTier.SILVER,
      AmbassadorTier.GOLD,
      AmbassadorTier.PLATINUM,
      AmbassadorTier.TITAN,
    ];

    const currentIndex = tierOrder.indexOf(currentTier);
    if (currentIndex === tierOrder.length - 1) {
      return null; // Already at max tier
    }

    const nextTier = tierOrder[currentIndex + 1];
    const nextReq = TIER_REQUIREMENTS[nextTier];

    return {
      minReferrals: Math.max(0, nextReq.minReferrals - currentPerformance.verifiedReferrals),
      minCreators: Math.max(0, nextReq.minCreators - currentPerformance.creatorsRecruited),
      minEvents: Math.max(0, nextReq.minEvents - currentPerformance.eventsHosted),
      minRevenue: Math.max(0, nextReq.minRevenue - currentPerformance.revenue),
    };
  }

  /**
   * Calculate total compensation multiplier
   */
  calculateTotalMultiplier(
    tier: AmbassadorTier,
    countryCode: string,
    customMultiplier?: number
  ): number {
    const tierMultiplier = TIER_REQUIREMENTS[tier].multiplier;
    const regionalConfig = this.getRegionalConfig(countryCode);
    const regionalMultiplier = regionalConfig.multiplier;
    const custom = customMultiplier || 1.0;

    return tierMultiplier * regionalMultiplier * custom;
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const ambassadorTypeService = new AmbassadorTypeService();
