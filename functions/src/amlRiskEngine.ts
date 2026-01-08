/**
 * PACK 63 — AML & Risk Monitoring Hub
 * Risk Scoring Engine
 *
 * Pure functions for computing AML risk scores based on user metrics.
 * No ML required - uses heuristic thresholds and weighted scoring.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AmlInputMetrics {
  // Token activity (rolling windows)
  tokensPurchased7d: number;
  tokensPurchased30d: number;
  tokensPurchased90d: number;
  tokensEarned7d: number;
  tokensEarned30d: number;
  tokensEarned90d: number;
  tokensCashedOut7d: number;
  tokensCashedOut30d: number;
  tokensCashedOut90d: number;
  
  // Transaction counts
  payoutsCount30d: number;
  
  // Dispute indicators
  disputesCount30d: number;
  disputesLossCount30d: number;
  
  // Reservation indicators
  reservationsCompleted30d: number;
  reservationsNoShowFlags30d: number;
  
  // Account metadata
  accountAgeDays: number;
  kycLevel: 'NONE' | 'BASIC' | 'FULL';
  
  // Optional contextual data
  countryIso?: string;
  multiAccountRisk?: 'NONE' | 'SUSPECTED' | 'CONFIRMED';
}

export interface AmlRiskResult {
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFlags: string[];
}

// ============================================================================
// CONFIGURATION & THRESHOLDS
// ============================================================================

interface RiskThresholds {
  // Volume thresholds (tokens)
  highVolumePurchase30d: number;
  highVolumeEarned30d: number;
  highVolumeCashout30d: number;
  
  // Velocity thresholds
  rapidAccountHighVolumeDays: number;
  rapidAccountHighVolumeTokens: number;
  
  // Ratio thresholds
  highCashoutRatio: number; // cashout/earned ratio
  
  // Frequency thresholds
  frequentPayouts30d: number;
  manyDisputes30d: number;
  highDisputeLossRatio: number;
  highNoShowCount30d: number;
  
  // KYC requirements
  kycRequiredEarned365d: number; // Not used in scoring but referenced elsewhere
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  highVolumePurchase30d: 50000,  // 50k tokens (~$500)
  highVolumeEarned30d: 30000,    // 30k tokens (~$300)
  highVolumeCashout30d: 20000,   // 20k tokens (~$200)
  
  rapidAccountHighVolumeDays: 30,
  rapidAccountHighVolumeTokens: 10000,
  
  highCashoutRatio: 0.8, // 80% cashout rate
  
  frequentPayouts30d: 10,
  manyDisputes30d: 5,
  highDisputeLossRatio: 0.5, // 50% dispute loss rate
  highNoShowCount30d: 3,
  
  kycRequiredEarned365d: 2000
};

// ============================================================================
// RISK SCORING FUNCTION
// ============================================================================

/**
 * Compute AML risk score and flags based on user metrics.
 * 
 * Risk score is accumulated from multiple factors:
 * - High transaction volumes
 * - Rapid velocity (new account + high volume)
 * - Suspicious patterns (high cashout ratio, many disputes)
 * - Missing KYC despite high activity
 * - Structural indicators (no-shows, multi-account risk)
 */
export function computeAmlRisk(
  metrics: AmlInputMetrics,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS
): AmlRiskResult {
  let riskScore = 0;
  const riskFlags: string[] = [];
  
  // ============================================================================
  // FACTOR 1: HIGH VOLUME ACTIVITY
  // ============================================================================
  
  // High token purchases
  if (metrics.tokensPurchased30d >= thresholds.highVolumePurchase30d) {
    riskScore += 15;
    riskFlags.push('HIGH_VOLUME_PURCHASES_30D');
  }
  
  // High token earnings
  if (metrics.tokensEarned30d >= thresholds.highVolumeEarned30d) {
    riskScore += 20;
    riskFlags.push('HIGH_VOLUME_EARNED_30D');
  }
  
  // High cashout volume
  if (metrics.tokensCashedOut30d >= thresholds.highVolumeCashout30d) {
    riskScore += 25;
    riskFlags.push('HIGH_VOLUME_CASHOUT_30D');
  }
  
  // ============================================================================
  // FACTOR 2: VELOCITY & NEW ACCOUNT RISK
  // ============================================================================
  
  // New account with high volume (potential account farming)
  if (metrics.accountAgeDays <= thresholds.rapidAccountHighVolumeDays) {
    if (metrics.tokensEarned30d >= thresholds.rapidAccountHighVolumeTokens ||
        metrics.tokensCashedOut30d >= thresholds.rapidAccountHighVolumeTokens) {
      riskScore += 30;
      riskFlags.push('NEW_ACCOUNT_HIGH_VOLUME');
    }
  }
  
  // ============================================================================
  // FACTOR 3: CASHOUT PATTERNS
  // ============================================================================
  
  // High cashout ratio (possible money laundering indicator)
  if (metrics.tokensEarned30d > 0) {
    const cashoutRatio = metrics.tokensCashedOut30d / metrics.tokensEarned30d;
    if (cashoutRatio >= thresholds.highCashoutRatio) {
      riskScore += 20;
      riskFlags.push('HIGH_CASHOUT_RATIO');
    }
  }
  
  // Frequent payouts (structuring indicator)
  if (metrics.payoutsCount30d >= thresholds.frequentPayouts30d) {
    riskScore += 15;
    riskFlags.push('FREQUENT_PAYOUTS');
  }
  
  // ============================================================================
  // FACTOR 4: KYC GAPS
  // ============================================================================
  
  // No KYC with significant payouts
  if (metrics.kycLevel === 'NONE' && metrics.tokensCashedOut30d > 1000) {
    riskScore += 25;
    riskFlags.push('NO_KYC_WITH_PAYOUTS');
  }
  
  // Basic KYC only with very high volumes
  if (metrics.kycLevel === 'BASIC' && metrics.tokensCashedOut30d > 10000) {
    riskScore += 15;
    riskFlags.push('BASIC_KYC_HIGH_VOLUME');
  }
  
  // ============================================================================
  // FACTOR 5: DISPUTE PATTERNS
  // ============================================================================
  
  // Many disputes (conflict-prone behavior)
  if (metrics.disputesCount30d >= thresholds.manyDisputes30d) {
    riskScore += 15;
    riskFlags.push('MANY_DISPUTES');
  }
  
  // High dispute loss ratio (abusive/fraudulent behavior)
  if (metrics.disputesCount30d > 0) {
    const lossRatio = metrics.disputesLossCount30d / metrics.disputesCount30d;
    if (lossRatio >= thresholds.highDisputeLossRatio) {
      riskScore += 20;
      riskFlags.push('HIGH_DISPUTE_LOSS_RATIO');
    }
  }
  
  // ============================================================================
  // FACTOR 6: RESERVATION ABUSE
  // ============================================================================
  
  // Many no-shows (reservation abuse)
  if (metrics.reservationsNoShowFlags30d >= thresholds.highNoShowCount30d) {
    riskScore += 10;
    riskFlags.push('RESERVATION_NO_SHOW_PATTERN');
  }
  
  // ============================================================================
  // FACTOR 7: MULTI-ACCOUNT RISK
  // ============================================================================
  
  if (metrics.multiAccountRisk === 'SUSPECTED') {
    riskScore += 15;
    riskFlags.push('MULTI_ACCOUNT_SUSPECTED');
  }
  
  if (metrics.multiAccountRisk === 'CONFIRMED') {
    riskScore += 30;
    riskFlags.push('MULTI_ACCOUNT_CONFIRMED');
  }
  
  // ============================================================================
  // CAP SCORE & DETERMINE LEVEL
  // ============================================================================
  
  // Cap at 100
  riskScore = Math.min(100, riskScore);
  
  // Determine risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  if (riskScore <= 30) {
    riskLevel = 'LOW';
  } else if (riskScore <= 60) {
    riskLevel = 'MEDIUM';
  } else if (riskScore <= 80) {
    riskLevel = 'HIGH';
  } else {
    riskLevel = 'CRITICAL';
  }
  
  return {
    riskScore,
    riskLevel,
    riskFlags
  };
}

// ============================================================================
// HELPER: CHECK IF KYC REQUIRED
// ============================================================================

/**
 * Determine if KYC is required based on earnings thresholds.
 * This is separate from risk scoring.
 */
export function isKycRequired(
  tokensEarnedAllTime: number,
  tokensEarned365d: number,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS
): boolean {
  return tokensEarned365d >= thresholds.kycRequiredEarned365d;
}

// ============================================================================
// HELPER: SUGGEST AML STATUS
// ============================================================================

/**
 * Suggest AML ops status based on risk level and KYC state.
 * This is advisory only - actual enforcement goes through PACK 54.
 */
export function suggestAmlStatus(
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  kycRequired: boolean,
  kycVerified: boolean
): {
  status: 'NORMAL' | 'UNDER_REVIEW' | 'RESTRICTED' | 'BLOCK_PAYOUTS' | 'BLOCK_EARNINGS';
  reason: string;
} {
  // CRITICAL risk - immediate review and potential blocks
  if (riskLevel === 'CRITICAL') {
    if (!kycVerified) {
      return { 
        status: 'BLOCK_PAYOUTS', 
        reason: 'Critical risk level with unverified KYC' 
      };
    }
    return { 
      status: 'UNDER_REVIEW', 
      reason: 'Critical risk level - manual review required' 
    };
  }
  
  // HIGH risk
  if (riskLevel === 'HIGH') {
    if (kycRequired && !kycVerified) {
      return { 
        status: 'BLOCK_PAYOUTS', 
        reason: 'High risk with KYC verification required' 
      };
    }
    return { 
      status: 'UNDER_REVIEW', 
      reason: 'High risk level - monitoring required' 
    };
  }
  
  // MEDIUM risk
  if (riskLevel === 'MEDIUM') {
    if (kycRequired && !kycVerified) {
      return { 
        status: 'RESTRICTED', 
        reason: 'KYC verification required for continued activity' 
      };
    }
    return { 
      status: 'NORMAL', 
      reason: 'Medium risk - routine monitoring' 
    };
  }
  
  // LOW risk
  return { 
    status: 'NORMAL', 
    reason: 'Low risk - normal operations' 
  };
}