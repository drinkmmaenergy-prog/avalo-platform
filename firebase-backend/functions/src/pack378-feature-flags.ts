/**
 * PACK 378 — Feature Flags for Tax & Compliance
 * Centralized control for tax engine features
 */

import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface Pack378FeatureFlags {
  'tax.engine.enabled': boolean;
  'vat.engine.enabled': boolean;
  'payout.withholding.enabled': boolean;
  'legal.dsa.enabled': boolean;
  'store.compliance.enabled': boolean;
  'price.normalization.enabled': boolean;
  'audit.exports.enabled': boolean;
  'compliance.gate.strict.enabled': boolean;
}

const DEFAULT_FLAGS: Pack378FeatureFlags = {
  'tax.engine.enabled': true,
  'vat.engine.enabled': true,
  'payout.withholding.enabled': true,
  'legal.dsa.enabled': true,
  'store.compliance.enabled': true,
  'price.normalization.enabled': true,
  'audit.exports.enabled': true,
  'compliance.gate.strict.enabled': false // Default to lenient mode for testing
};

/**
 * Get feature flag value
 */
export async function getFeatureFlag(flagName: keyof Pack378FeatureFlags): Promise<boolean> {
  try {
    const flagDoc = await db.collection('featureFlags').doc('pack378').get();
    
    if (!flagDoc.exists) {
      return DEFAULT_FLAGS[flagName];
    }

    const flags = flagDoc.data() as Pack378FeatureFlags;
    return flags[flagName] ?? DEFAULT_FLAGS[flagName];
  } catch (error) {
    console.error('Error fetching feature flag:', error);
    return DEFAULT_FLAGS[flagName];
  }
}

/**
 * Check if tax engine is enabled
 */
export async function isTaxEngineEnabled(): Promise<boolean> {
  return await getFeatureFlag('tax.engine.enabled');
}

/**
 * Check if VAT engine is enabled
 */
export async function isVATEngineEnabled(): Promise<boolean> {
  return await getFeatureFlag('vat.engine.enabled');
}

/**
 * Check if payout withholding is enabled
 */
export async function isPayoutWithholdingEnabled(): Promise<boolean> {
  return await getFeatureFlag('payout.withholding.enabled');
}

/**
 * Check if DSA compliance is enabled
 */
export async function isDSAEnabled(): Promise<boolean> {
  return await getFeatureFlag('legal.dsa.enabled');
}

/**
 * Check if store compliance is enabled
 */
export async function isStoreComplianceEnabled(): Promise<boolean> {
  return await getFeatureFlag('store.compliance.enabled');
}

/**
 * Check if price normalization is enabled
 */
export async function isPriceNormalizationEnabled(): Promise<boolean> {
  return await getFeatureFlag('price.normalization.enabled');
}

/**
 * Check if strict compliance mode is enabled
 */
export async function isStrictComplianceEnabled(): Promise<boolean> {
  return await getFeatureFlag('compliance.gate.strict.enabled');
}

/**
 * Initialize feature flags if they don't exist
 */
export async function initializeFeatureFlags(): Promise<void> {
  const flagDoc = await db.collection('featureFlags').doc('pack378').get();
  
  if (!flagDoc.exists) {
    await db.collection('featureFlags').doc('pack378').set(DEFAULT_FLAGS);
    console.log('PACK 378 feature flags initialized with defaults');
  }
}

/**
 * Update feature flag
 */
export async function updateFeatureFlag(
  flagName: keyof Pack378FeatureFlags,
  value: boolean
): Promise<void> {
  await db.collection('featureFlags').doc('pack378').update({
    [flagName]: value,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`Feature flag ${flagName} updated to ${value}`);
}

/**
 * Get all feature flags
 */
export async function getAllFeatureFlags(): Promise<Pack378FeatureFlags> {
  const flagDoc = await db.collection('featureFlags').doc('pack378').get();
  
  if (!flagDoc.exists) {
    return DEFAULT_FLAGS;
  }

  return { ...DEFAULT_FLAGS, ...flagDoc.data() } as Pack378FeatureFlags;
}
