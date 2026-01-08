/**
 * PACK 308 — Verified Badge UI, Trust Labels & Safety Messaging
 * 
 * Type definitions for trust labels and verification status
 * No tokenomics changes - pure UI/UX layer
 */

export type TrustLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SafetyFlags {
  underReview: boolean;
  visibilityLimited: boolean;
}

export interface TrustLabel {
  verified: boolean;
  trustLevel: TrustLevel;
  safetyFlags: SafetyFlags;
}

/**
 * Verification status from users/{userId}/verification/status
 */
export type VerificationStatus = 
  | 'VERIFIED' 
  | 'FAILED' 
  | 'BANNED' 
  | 'PENDING' 
  | 'NOT_STARTED';

export interface VerificationData {
  status: VerificationStatus;
  ageVerified: boolean;
  minAgeConfirmed: number;
}

/**
 * Risk state from userRisk/{userId}
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface UserRisk {
  riskLevel: RiskLevel;
  catfishRiskScore: number;
  autoHiddenFromDiscovery: boolean;
}

/**
 * Helper function to determine trust label from verification and risk data
 */
export function getUserTrustLabel(
  verificationData: VerificationData | null,
  riskState: UserRisk | null
): TrustLabel {
  // Default to unverified with medium trust
  if (!verificationData || !riskState) {
    return {
      verified: false,
      trustLevel: 'MEDIUM',
      safetyFlags: {
        underReview: false,
        visibilityLimited: false,
      },
    };
  }

  // Determine verified status
  const verified = 
    verificationData.status === 'VERIFIED' &&
    verificationData.ageVerified === true &&
    verificationData.minAgeConfirmed >= 18;

  // Map risk level to trust level
  let trustLevel: TrustLevel;
  switch (riskState.riskLevel) {
    case 'LOW':
      trustLevel = 'HIGH';
      break;
    case 'MEDIUM':
      trustLevel = 'MEDIUM';
      break;
    case 'HIGH':
    case 'CRITICAL':
      trustLevel = 'LOW';
      break;
    default:
      trustLevel = 'MEDIUM';
  }

  // Determine safety flags
  const underReview = 
    riskState.riskLevel === 'HIGH' || 
    riskState.riskLevel === 'CRITICAL';
  
  const visibilityLimited = riskState.autoHiddenFromDiscovery === true;

  return {
    verified,
    trustLevel,
    safetyFlags: {
      underReview,
      visibilityLimited,
    },
  };
}