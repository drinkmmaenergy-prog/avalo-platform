/**
 * PACK 378 — Creator Payout Compliance Gate
 * Validates all legal and compliance requirements before allowing payouts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CreatorTaxProfile } from '../../firestore/schemas/pack378-tax-profiles';

const db = admin.firestore();

interface ComplianceCheckResult {
  approved: boolean;
  blockReasons: string[];
  warnings: string[];
  requiredActions: string[];
}

/**
 * PACK378_payoutComplianceGate
 * Comprehensive compliance check before payout
 */
export const pack378_payoutComplianceGate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { creatorId, amount } = data;

  if (!creatorId || !amount) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const result: ComplianceCheckResult = {
    approved: true,
    blockReasons: [],
    warnings: [],
    requiredActions: []
  };

  // 1. Check identity verification
  const identityCheck = await checkIdentityVerification(creatorId);
  if (!identityCheck.verified) {
    result.approved = false;
    result.blockReasons.push('Identity verification required');
    result.requiredActions.push('Complete KYC verification');
  }

  // 2. Check tax profile
  const taxProfileCheck = await checkTaxProfile(creatorId);
  if (!taxProfileCheck.complete) {
    result.approved = false;
    result.blockReasons.push('Tax profile incomplete');
    result.requiredActions.push(...taxProfileCheck.missingFields);
  }

  // 3. Check AML velocity
  const amlCheck = await checkAMLVelocity(creatorId, amount);
  if (!amlCheck.passed) {
    result.approved = false;
    result.blockReasons.push('AML velocity check failed');
    result.requiredActions.push('Contact support for AML verification');
  }

  // 4. Check fraud score
  const fraudCheck = await checkFraudScore(creatorId);
  if (fraudCheck.score > 75) {
    result.approved = false;
    result.blockReasons.push('High fraud risk detected');
    result.requiredActions.push('Account under security review');
  } else if (fraudCheck.score > 50) {
    result.warnings.push('Elevated fraud risk - additional monitoring applied');
  }

  // 5. Check suspicious patterns
  const patternCheck = await checkSuspiciousPatterns(creatorId);
  if (patternCheck.detected) {
    result.approved = false;
    result.blockReasons.push('Suspicious activity detected');
    result.requiredActions.push('Account flagged for manual review');
  }

  // 6. Check VAT compliance (if applicable)
  const vatCheck = await checkVATCompliance(creatorId);
  if (vatCheck.required && !vatCheck.compliant) {
    result.approved = false;
    result.blockReasons.push('VAT registration required');
    result.requiredActions.push('Register for VAT and provide VAT number');
  }

  // 7. Check country-specific requirements
  const countryCheck = await checkCountryRequirements(creatorId, amount);
  if (!countryCheck.met) {
    result.approved = false;
    result.blockReasons.push(...countryCheck.violations);
    result.requiredActions.push(...countryCheck.actions);
  }

  // Log compliance check
  await db.collection('complianceChecks').add({
    creatorId,
    amount,
    approved: result.approved,
    blockReasons: result.blockReasons,
    warnings: result.warnings,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return result;
});

/**
 * Check identity verification status
 */
async function checkIdentityVerification(creatorId: string): Promise<{ verified: boolean; provider?: string }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return { verified: false };
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;
  return {
    verified: profile.identityVerified,
    provider: profile.identityProvider
  };
}

/**
 * Check tax profile completeness
 */
async function checkTaxProfile(creatorId: string): Promise<{ complete: boolean; missingFields: string[] }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return {
      complete: false,
      missingFields: ['Create tax profile', 'Provide country of residence', 'Provide tax ID']
    };
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;
  const missingFields: string[] = [];

  if (!profile.countryCode) {
    missingFields.push('Country of residence');
  }

  // Get country tax requirements
  const taxProfileDoc = await db.collection('taxProfiles')
    .where('countryCode', '==', profile.countryCode)
    .limit(1)
    .get();

  if (!taxProfileDoc.empty) {
    const countryTaxProfile = taxProfileDoc.docs[0].data();
    
    if (countryTaxProfile.needsTaxId && !profile.taxId) {
      missingFields.push('Tax ID number');
    }

    if (countryTaxProfile.needsBusinessRegistration && !profile.businessRegistration) {
      missingFields.push('Business registration');
    }
  }

  return {
    complete: missingFields.length === 0,
    missingFields
  };
}

/**
 * Check AML velocity limits
 */
async function checkAMLVelocity(creatorId: string, amount: number): Promise<{ passed: boolean; details?: string }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return { passed: false, details: 'No tax profile found' };
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;
  
  if (!profile.amlVelocityCheckPassed) {
    return { passed: false, details: 'AML velocity check previously failed' };
  }

  // Check recent payout velocity
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentPayoutsSnapshot = await db.collection('payouts')
    .where('creatorId', '==', creatorId)
    .where('timestamp', '>=', oneDayAgo)
    .where('status', '==', 'completed')
    .get();

  const dailyTotal = recentPayoutsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
  
  // Daily limit: $10,000 USD equivalent
  const DAILY_LIMIT = 10000;
  if (dailyTotal + amount > DAILY_LIMIT) {
    return { passed: false, details: 'Daily payout limit exceeded' };
  }

  return { passed: true };
}

/**
 * Check fraud score from PACK 302
 */
async function checkFraudScore(creatorId: string): Promise<{ score: number }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return { score: 100 }; // Max risk if no profile
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;
  return { score: profile.fraudScore || 0 };
}

/**
 * Check for suspicious patterns
 */
async function checkSuspiciousPatterns(creatorId: string): Promise<{ detected: boolean; details?: string }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return { detected: false };
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;
  
  if (profile.suspiciousPatternDetected) {
    return {
      detected: true,
      details: profile.suspiciousPatternDetails || 'Pattern detected by fraud system'
    };
  }

  return { detected: false };
}

/**
 * Check VAT compliance
 */
async function checkVATCompliance(creatorId: string): Promise<{ required: boolean; compliant: boolean }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return { required: false, compliant: true };
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;

  // VAT registration required for high-volume EU sellers
  const isEUCountry = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'SE', 'AT', 'DK', 'FI', 'IE', 'PT', 'GR', 'CZ', 'RO', 'HU', 'BG'].includes(profile.countryCode);
  
  if (!isEUCountry) {
    return { required: false, compliant: true };
  }

  // Check annual revenue threshold (simplified: €10,000)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const annualPayoutsSnapshot = await db.collection('payouts')
    .where('creatorId', '==', creatorId)
    .where('timestamp', '>=', oneYearAgo)
    .where('status', '==', 'completed')
    .get();

  const annualRevenue = annualPayoutsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
  
  const VAT_THRESHOLD = 10000; // EUR equivalent
  const vatRequired = annualRevenue > VAT_THRESHOLD;

  if (vatRequired) {
    return {
      required: true,
      compliant: profile.vatRegistered && profile.vatNumberVerified
    };
  }

  return { required: false, compliant: true };
}

/**
 * Check country-specific requirements
 */
async function checkCountryRequirements(creatorId: string, amount: number): Promise<{ met: boolean; violations: string[]; actions: string[] }> {
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  
  if (!creatorDoc.exists) {
    return {
      met: false,
      violations: ['Tax profile not created'],
      actions: ['Create tax profile']
    };
  }

  const profile = creatorDoc.data() as CreatorTaxProfile;
  const violations: string[] = [];
  const actions: string[] = [];

  // Get country-specific rules
  const taxProfileDoc = await db.collection('taxProfiles')
    .where('countryCode', '==', profile.countryCode)
    .limit(1)
    .get();

  if (taxProfileDoc.empty) {
    violations.push('Country not supported for payouts');
    actions.push('Contact support about country availability');
    return { met: false, violations, actions };
  }

  const countryProfile = taxProfileDoc.docs[0].data();

  // Check minimum payout threshold
  if (amount < (countryProfile.minPayoutAmount || 10)) {
    violations.push('Amount below minimum payout threshold');
    actions.push(`Minimum payout: ${countryProfile.minPayoutAmount} ${countryProfile.currency}`);
  }

  // Check if invoicing is required
  if (countryProfile.requiresInvoice && !profile.canIssueInvoices) {
    violations.push('Invoice issuance capability required');
    actions.push('Enable invoice generation in tax settings');
  }

  return {
    met: violations.length === 0,
    violations,
    actions
  };
}

/**
 * Update creator compliance status
 */
export const updateCreatorComplianceStatus = functions.firestore
  .document('creatorTaxProfiles/{creatorId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as CreatorTaxProfile;
    const after = change.after.data() as CreatorTaxProfile;

    // Check if critical fields changed
    const criticalFieldsChanged = 
      before.identityVerified !== after.identityVerified ||
      before.fraudScore !== after.fraudScore ||
      before.suspiciousPatternDetected !== after.suspiciousPatternDetected;

    if (criticalFieldsChanged) {
      // Re-evaluate payout approval
      const approved = 
        after.identityVerified &&
        after.fraudScore < 75 &&
        !after.suspiciousPatternDetected &&
        after.amlVelocityCheckPassed;

      await change.after.ref.update({
        payoutApproved: approved,
        payoutBlockReason: approved ? null : 'Compliance requirements not met',
        lastComplianceCheck: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });
