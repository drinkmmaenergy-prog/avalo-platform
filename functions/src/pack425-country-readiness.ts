/**
 * PACK 425 — Country Readiness Model
 * Computes launch readiness scores for global market expansion
 */

import * as admin from 'firebase-admin';

export interface CountryRolloutProfile {
  countryCode: string;       // PL, DE, ES, MX, BR, JP...
  region: string;            // EU, LATAM, MENA, APAC...
  
  languageCodes: string[];   // ["pl"], ["es"], ["pt-BR"], etc.
  currency: string;          // PLN, EUR, USD, MXN, BRL...
  
  asoScore: number;          // 0–100
  trustScore: number;        // from PACK 424
  fraudRiskScore: number;    // from PACK 302/352
  
  paymentProviderReady: boolean; // Stripe, Android Billing, Apple IAP
  supportCoverageReady: boolean; // PACK 300 localization
  
  legalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  contentRestrictions?: string[];
  
  launchReadiness: number;    // computed 0–1 score
  recommendedLaunchStrategy: 'AGGRESSIVE' | 'STEADY' | 'CAUTIOUS' | 'DEFER';
  
  // Additional metadata
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  lastReviewedBy?: string;
  notes?: string;
}

export interface ReadinessComputationInput {
  asoScore: number;
  trustScore: number;
  fraudRiskScore: number;
  paymentProviderReady: boolean;
  supportCoverageReady: boolean;
  legalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export type LaunchStrategy = 'AGGRESSIVE' | 'STEADY' | 'CAUTIOUS' | 'DEFER';

/**
 * Compute launch readiness score based on weighted factors
 * 
 * Formula:
 * launchReadiness = 
 *   (0.25 * asoScoreNorm) +
 *   (0.25 * trustScore) +
 *   (0.15 * supportCoverage) +
 *   (0.15 * paymentProviderReady) +
 *   (0.10 * fraudAdjustment) +
 *   (0.10 * legalAdjustment)
 */
export function computeReadinessScore(input: ReadinessComputationInput): number {
  // Normalize ASO score (0-100 to 0-1)
  const asoScoreNorm = input.asoScore / 100;
  
  // Trust score should already be 0-1
  const trustScore = Math.min(Math.max(input.trustScore, 0), 1);
  
  // Support coverage (boolean to 0 or 1)
  const supportCoverage = input.supportCoverageReady ? 1 : 0;
  
  // Payment provider (boolean to 0 or 1)
  const paymentReady = input.paymentProviderReady ? 1 : 0;
  
  // Fraud adjustment (inverse - lower fraud risk = higher score)
  const fraudAdjustment = 1 - (input.fraudRiskScore / 100);
  
  // Legal adjustment
  const legalAdjustment = 
    input.legalRiskLevel === 'LOW' ? 1.0 :
    input.legalRiskLevel === 'MEDIUM' ? 0.6 :
    0.3; // HIGH
  
  // Weighted formula
  const readiness = 
    (0.25 * asoScoreNorm) +
    (0.25 * trustScore) +
    (0.15 * supportCoverage) +
    (0.15 * paymentReady) +
    (0.10 * fraudAdjustment) +
    (0.10 * legalAdjustment);
  
  return Math.round(readiness * 1000) / 1000; // Round to 3 decimals
}

/**
 * Determine launch strategy based on readiness score
 * 
 * >0.75     AGGRESSIVE launch
 * 0.55-0.75 STEADY rollout
 * 0.35-0.55 CAUTIOUS (A/B limited countries)
 * <0.35     DEFER (Not ready)
 */
export function determineStrategy(readinessScore: number): LaunchStrategy {
  if (readinessScore > 0.75) return 'AGGRESSIVE';
  if (readinessScore >= 0.55) return 'STEADY';
  if (readinessScore >= 0.35) return 'CAUTIOUS';
  return 'DEFER';
}

/**
 * Get country rollout profile from Firestore
 */
export async function getCountryProfile(countryCode: string): Promise<CountryRolloutProfile | null> {
  const db = admin.firestore();
  const doc = await db.collection('countryRollout').doc(countryCode).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as CountryRolloutProfile;
}

/**
 * Update country rollout profile
 */
export async function updateCountryProfile(
  countryCode: string,
  updates: Partial<CountryRolloutProfile>
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  // If updating readiness-affecting fields, recompute
  const needsRecomputation = 
    updates.asoScore !== undefined ||
    updates.trustScore !== undefined ||
    updates.fraudRiskScore !== undefined ||
    updates.paymentProviderReady !== undefined ||
    updates.supportCoverageReady !== undefined ||
    updates.legalRiskLevel !== undefined;
  
  if (needsRecomputation) {
    // Get current profile
    const current = await getCountryProfile(countryCode);
    if (current) {
      const input: ReadinessComputationInput = {
        asoScore: updates.asoScore ?? current.asoScore,
        trustScore: updates.trustScore ?? current.trustScore,
        fraudRiskScore: updates.fraudRiskScore ?? current.fraudRiskScore,
        paymentProviderReady: updates.paymentProviderReady ?? current.paymentProviderReady,
        supportCoverageReady: updates.supportCoverageReady ?? current.supportCoverageReady,
        legalRiskLevel: updates.legalRiskLevel ?? current.legalRiskLevel,
      };
      
      const readiness = computeReadinessScore(input);
      const strategy = determineStrategy(readiness);
      
      updates.launchReadiness = readiness;
      updates.recommendedLaunchStrategy = strategy;
    }
  }
  
  await db.collection('countryRollout').doc(countryCode).set({
    ...updates,
    updatedAt: now,
  }, { merge: true });
}

/**
 * Create new country profile
 */
export async function createCountryProfile(
  profile: Omit<CountryRolloutProfile, 'launchReadiness' | 'recommendedLaunchStrategy' | 'createdAt' | 'updatedAt'>
): Promise<CountryRolloutProfile> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const input: ReadinessComputationInput = {
    asoScore: profile.asoScore,
    trustScore: profile.trustScore,
    fraudRiskScore: profile.fraudRiskScore,
    paymentProviderReady: profile.paymentProviderReady,
    supportCoverageReady: profile.supportCoverageReady,
    legalRiskLevel: profile.legalRiskLevel,
  };
  
  const readiness = computeReadinessScore(input);
  const strategy = determineStrategy(readiness);
  
  const fullProfile: CountryRolloutProfile = {
    ...profile,
    launchReadiness: readiness,
    recommendedLaunchStrategy: strategy,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.collection('countryRollout').doc(profile.countryCode).set(fullProfile);
  
  return fullProfile;
}

/**
 * List all countries by readiness score
 */
export async function listCountriesByReadiness(
  minScore?: number,
  strategy?: LaunchStrategy
): Promise<CountryRolloutProfile[]> {
  const db = admin.firestore();
  let query = db.collection('countryRollout').orderBy('launchReadiness', 'desc');
  
  if (strategy) {
    query = query.where('recommendedLaunchStrategy', '==', strategy) as any;
  }
  
  const snapshot = await query.get();
  const countries = snapshot.docs.map(doc => doc.data() as CountryRolloutProfile);
  
  if (minScore !== undefined) {
    return countries.filter(c => c.launchReadiness >= minScore);
  }
  
  return countries;
}

/**
 * Get countries by region
 */
export async function getCountriesByRegion(region: string): Promise<CountryRolloutProfile[]> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryRollout')
    .where('region', '==', region)
    .orderBy('launchReadiness', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as CountryRolloutProfile);
}

/**
 * Get launch-ready countries (readiness > 0.75)
 */
export async function getLaunchReadyCountries(): Promise<CountryRolloutProfile[]> {
  return listCountriesByReadiness(0.75, 'AGGRESSIVE');
}

/**
 * Recompute all country readiness scores (admin operation)
 */
export async function recomputeAllReadinessScores(): Promise<{
  updated: number;
  errors: string[];
}> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryRollout').get();
  
  const errors: string[] = [];
  let updated = 0;
  
  for (const doc of snapshot.docs) {
    try {
      const profile = doc.data() as CountryRolloutProfile;
      
      const input: ReadinessComputationInput = {
        asoScore: profile.asoScore,
        trustScore: profile.trustScore,
        fraudRiskScore: profile.fraudRiskScore,
        paymentProviderReady: profile.paymentProviderReady,
        supportCoverageReady: profile.supportCoverageReady,
        legalRiskLevel: profile.legalRiskLevel,
      };
      
      const readiness = computeReadinessScore(input);
      const strategy = determineStrategy(readiness);
      
      await doc.ref.update({
        launchReadiness: readiness,
        recommendedLaunchStrategy: strategy,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      
      updated++;
    } catch (error) {
      errors.push(`${doc.id}: ${error}`);
    }
  }
  
  return { updated, errors };
}
