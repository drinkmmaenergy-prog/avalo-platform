/**
 * PACK 201 — App Store Validation
 * Validates platform readiness for Apple App Store and Google Play Store submission
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AppStoreSubmission,
  AppStoreValidation,
  ValidationCheck,
  ValidationIssue,
  Platform,
} from './types/pack201-compliance.types';

// ============================================================================
// APP STORE VALIDATION
// ============================================================================

/**
 * Validate App Store submission readiness
 */
export async function validateAppStoreSubmission(
  platform: 'APPLE' | 'GOOGLE',
  appVersion: string,
  buildNumber: string
): Promise<AppStoreSubmission> {
  const submissionId = generateId();
  
  logger.info('[Pack201] Validating app store submission', { platform, appVersion, submissionId });

  try {
    // Run platform-specific validation
    const validation = platform === 'APPLE' 
      ? await validateAppleAppStore(appVersion)
      : await validateGooglePlayStore(appVersion);

    // Determine overall status
    let status: 'VALIDATING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW' = 'APPROVED';
    
    if (!validation.passed) {
      const blockingIssues = validation.issues.filter(i => i.severity === 'BLOCKING');
      status = blockingIssues.length > 0 ? 'REJECTED' : 'NEEDS_REVIEW';
    }

    const submission: AppStoreSubmission = {
      submissionId,
      platform,
      appVersion,
      buildNumber,
      validation,
      status,
      submittedAt: serverTimestamp() as Timestamp,
      validatedAt: serverTimestamp() as Timestamp,
    };

    if (status === 'APPROVED') {
      submission.approvedAt = serverTimestamp() as Timestamp;
    }

    // Save submission
    await db.collection('appstore_submissions').doc(submissionId).set(submission);

    logger.info('[Pack201] App store validation completed', {
      submissionId,
      platform,
      status,
      passed: validation.passed,
    });

    return submission;
  } catch (error) {
    logger.error('[Pack201] Error validating app store submission', { error });
    throw error;
  }
}

/**
 * Validate Apple App Store requirements
 */
async function validateAppleAppStore(appVersion: string): Promise<AppStoreValidation> {
  const validationId = generateId();
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];

  // Check 1: Age restriction (18+ required)
  const ageRestriction = await checkAgeRestriction();
  if (!ageRestriction.passed && ageRestriction.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Age Rating',
      description: 'App must have 18+ age restriction',
      howToFix: 'Set age rating to 18+ in App Store Connect',
      autoFixAvailable: false,
    });
  }

  // Check 2: Content restrictions
  const contentRestrictions = await checkContentRestrictions();
  if (!contentRestrictions.passed && contentRestrictions.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Content Policy',
      description: contentRestrictions.details,
      howToFix: 'Remove or block prohibited content types',
      autoFixAvailable: false,
    });
  }

  // Check 3: Safety features
  const safetyFeatures = await checkSafetyFeatures();
  if (!safetyFeatures.passed && safetyFeatures.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Safety',
      description: 'Required safety features are missing',
      howToFix: 'Implement reporting, blocking, and moderation systems',
      autoFixAvailable: false,
    });
  }

  // Check 4: Payment compliance
  const paymentCompliance = await checkPaymentCompliance();
  if (!paymentCompliance.passed) {
    issues.push({
      issueId: generateId(),
      severity: 'WARNING',
      category: 'In-App Purchase',
      description: paymentCompliance.details,
      howToFix: 'Ensure all digital goods use Apple IAP',
      autoFixAvailable: false,
    });
    warnings.push('Review payment implementation for IAP compliance');
  }

  // Check 5: Business transparency
  const businessTransparency = await checkBusinessTransparency();
  if (!businessTransparency.passed && businessTransparency.required) {
    issues.push({
      issueId: generateId(),
      severity: 'WARNING',
      category: 'Transparency',
      description: 'Business model and pricing not clearly explained',
      howToFix: 'Add clear documentation of revenue model and pricing',
      autoFixAvailable: true,
    });
  }

  // Check 6: Subscription clarity
  const subscriptionClarity = await checkSubscriptionClarityValidation();
  if (!subscriptionClarity.passed) {
    warnings.push('Subscription terms should be more clearly displayed');
  }

  // Check 7: Loot box compliance (must not have random purchases)
  const lootBoxCompliance = await checkLootBoxCompliance();
  if (!lootBoxCompliance.passed && lootBoxCompliance.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Gambling',
      description: 'App contains loot box or gambling mechanics',
      howToFix: 'Remove all random reward mechanics that can be purchased',
      autoFixAvailable: false,
    });
  }

  // Check 8: Crypto compliance (must be zero crypto)
  const cryptoCompliance = await checkCryptoCompliance();
  if (!cryptoCompliance.passed && cryptoCompliance.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Cryptocurrency',
      description: 'App contains cryptocurrency features',
      howToFix: 'Remove all cryptocurrency trading, mining, or wallet features',
      autoFixAvailable: false,
    });
  }

  const passed = issues.filter(i => i.severity === 'BLOCKING').length === 0;

  return {
    validationId,
    platform: 'APPLE',
    ageRestriction,
    contentRestrictions,
    safetyFeatures,
    paymentCompliance,
    businessTransparency,
    subscriptionClarity,
    lootBoxCompliance,
    cryptoCompliance,
    passed,
    issues,
    warnings,
    validatedAt: serverTimestamp() as Timestamp,
  };
}

/**
 * Validate Google Play Store requirements
 */
async function validateGooglePlayStore(appVersion: string): Promise<AppStoreValidation> {
  const validationId = generateId();
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];

  // Google Play has similar but slightly different requirements
  const ageRestriction = await checkAgeRestriction();
  if (!ageRestriction.passed && ageRestriction.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Content Rating',
      description: 'App must have MATURE 17+ or AO 18+ rating',
      howToFix: 'Set appropriate content rating in Play Console',
      autoFixAvailable: false,
    });
  }

  const contentRestrictions = await checkContentRestrictions();
  if (!contentRestrictions.passed && contentRestrictions.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Content Policy',
      description: contentRestrictions.details,
      howToFix: 'Remove or restrict adult content',
      autoFixAvailable: false,
    });
  }

  const safetyFeatures = await checkSafetyFeatures();
  if (!safetyFeatures.passed && safetyFeatures.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'User Safety',
      description: 'Required safety features are missing',
      howToFix: 'Implement user reporting and blocking systems',
      autoFixAvailable: false,
    });
  }

  const paymentCompliance = await checkPaymentCompliance();
  if (!paymentCompliance.passed) {
    warnings.push('Review Google Play Billing integration');
  }

  const businessTransparency = await checkBusinessTransparency();
  const subscriptionClarity = await checkSubscriptionClarityValidation();
  const lootBoxCompliance = await checkLootBoxCompliance();
  const cryptoCompliance = await checkCryptoCompliance();

  if (!lootBoxCompliance.passed && lootBoxCompliance.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Gambling',
      description: 'App contains gambling mechanics',
      howToFix: 'Remove all gambling and loot box features',
      autoFixAvailable: false,
    });
  }

  if (!cryptoCompliance.passed && cryptoCompliance.required) {
    issues.push({
      issueId: generateId(),
      severity: 'BLOCKING',
      category: 'Cryptocurrency',
      description: 'App contains cryptocurrency features',
      howToFix: 'Remove cryptocurrency functionality',
      autoFixAvailable: false,
    });
  }

  const passed = issues.filter(i => i.severity === 'BLOCKING').length === 0;

  return {
    validationId,
    platform: 'GOOGLE',
    ageRestriction,
    contentRestrictions,
    safetyFeatures,
    paymentCompliance,
    businessTransparency,
    subscriptionClarity,
    lootBoxCompliance,
    cryptoCompliance,
    passed,
    issues,
    warnings,
    validatedAt: serverTimestamp() as Timestamp,
  };
}

// ============================================================================
// VALIDATION CHECK IMPLEMENTATIONS
// ============================================================================

async function checkAgeRestriction(): Promise<ValidationCheck> {
  const configDoc = await db.collection('app_config').doc('age_restrictions').get();
  const config = configDoc.data();
  
  const passed = config?.minimumAge === 18 && config?.enforced === true;
  
  return {
    checkName: 'Age Restriction 18+',
    passed,
    required: true,
    details: passed 
      ? 'App enforces 18+ age restriction'
      : 'App must enforce 18+ age restriction',
    evidence: passed ? ['Age gate implemented', 'Age verification active'] : [],
  };
}

async function checkContentRestrictions(): Promise<ValidationCheck> {
  const contentDoc = await db.collection('app_config').doc('content_policy').get();
  const policy = contentDoc.data();
  
  // Check that sexual content is blocked
  const sexualContentBlocked = policy?.blockSexualContent === true;
  const pornographyBlocked = policy?.blockPornography === true;
  const romanticServicesBlocked = policy?.blockRomanticServices === true;
  
  const passed = sexualContentBlocked && pornographyBlocked && romanticServicesBlocked;
  
  return {
    checkName: 'Content Restrictions',
    passed,
    required: true,
    details: passed
      ? 'All prohibited content types are blocked'
      : 'Some prohibited content types are not properly restricted',
    evidence: passed 
      ? [
          'Sexual content blocked',
          'Pornography blocked',
          'Romantic services blocked',
        ]
      : [],
  };
}

async function checkSafetyFeatures(): Promise<ValidationCheck> {
  const safetyDoc = await db.collection('app_config').doc('safety_features').get();
  const features = safetyDoc.data();
  
  const hasReporting = features?.reportingEnabled === true;
  const hasBlocking = features?.blockingEnabled === true;
  const hasModeration = features?.moderationEnabled === true;
  const hasAppealProcess = features?.appealProcessEnabled === true;
  
  const passed = hasReporting && hasBlocking && hasModeration && hasAppealProcess;
  
  return {
    checkName: 'Safety Features',
    passed,
    required: true,
    details: passed
      ? 'All required safety features are implemented'
      : 'Some required safety features are missing',
    evidence: passed
      ? [
          'User reporting system active',
          'User blocking system active',
          'Content moderation active',
          'Appeal process available',
        ]
      : [],
  };
}

async function checkPaymentCompliance(): Promise<ValidationCheck> {
  const paymentDoc = await db.collection('app_config').doc('payments').get();
  const config = paymentDoc.data();
  
  const usesStorePayments = config?.usesInAppPurchases === true;
  const noExternalPayments = config?.allowsExternalPayments !== true;
  
  const passed = usesStorePayments && noExternalPayments;
  
  return {
    checkName: 'Payment Compliance',
    passed,
    required: false, // Warning only
    details: passed
      ? 'Payment processing complies with store policies'
      : 'Review payment integration for compliance',
    evidence: passed ? ['Uses in-app purchases', 'No external payment links'] : [],
  };
}

async function checkBusinessTransparency(): Promise<ValidationCheck> {
  const transparencyDoc = await db.collection('app_config').doc('transparency').get();
  const config = transparencyDoc.data();
  
  const hasPrivacyPolicy = config?.hasPrivacyPolicy === true;
  const hasTermsOfService = config?.hasTermsOfService === true;
  const hasPricingInfo = config?.hasClearPricing === true;
  const hasRevenueModel = config?.hasRevenueModelDisclosure === true;
  
  const passed = hasPrivacyPolicy && hasTermsOfService && hasPricingInfo && hasRevenueModel;
  
  return {
    checkName: 'Business Transparency',
    passed,
    required: true,
    details: passed
      ? 'Business model and policies are clearly disclosed'
      : 'Missing required transparency documentation',
    evidence: passed
      ? [
          'Privacy policy available',
          'Terms of service available',
          'Pricing clearly displayed',
          'Revenue model disclosed (65/35 split)',
        ]
      : [],
  };
}

async function checkSubscriptionClarityValidation(): Promise<ValidationCheck> {
  const subscriptionDoc = await db.collection('app_config').doc('subscriptions').get();
  const config = subscriptionDoc.data();
  
  const hasClearTerms = config?.termsDisplayed === true;
  const hasCancellationInfo = config?.cancellationInfoDisplayed === true;
  const hasPricingInfo = config?.pricingDisplayed === true;
  const hasRecurringInfo = config?.recurringInfoDisplayed === true;
  
  const passed = hasClearTerms && hasCancellationInfo && hasPricingInfo && hasRecurringInfo;
  
  return {
    checkName: 'Subscription Clarity',
    passed,
    required: true,
    details: passed
      ? 'Subscription terms are clear and user-friendly'
      : 'Subscription terms need improvement',
    evidence: passed
      ? [
          'Terms clearly displayed',
          'Cancellation process explained',
          'Pricing shown upfront',
          'Recurring billing disclosed',
        ]
      : [],
  };
}

async function checkLootBoxCompliance(): Promise<ValidationCheck> {
  const featuresDoc = await db.collection('app_config').doc('features').get();
  const features = featuresDoc.data();
  
  const noLootBoxes = features?.lootBoxesEnabled !== true;
  const noRandomRewards = features?.randomRewardsEnabled !== true;
  const noGambling = features?.gamblingEnabled !== true;
  
  const passed = noLootBoxes && noRandomRewards && noGambling;
  
  return {
    checkName: 'No Loot Boxes / Gambling',
    passed,
    required: true,
    details: passed
      ? 'App contains no gambling or loot box mechanics'
      : 'App contains prohibited gambling mechanics',
    evidence: passed
      ? [
          'No loot boxes',
          'No random reward purchases',
          'No gambling features',
        ]
      : [],
  };
}

async function checkCryptoCompliance(): Promise<ValidationCheck> {
  const cryptoDoc = await db.collection('app_config').doc('crypto').get();
  const config = cryptoDoc.data();
  
  const noCryptoTrading = config?.tradingEnabled !== true;
  const noCryptoWallet = config?.walletEnabled !== true;
  const noCryptoMining = config?.miningEnabled !== true;
  const noCryptoPayments = config?.paymentsEnabled !== true;
  
  const passed = noCryptoTrading && noCryptoWallet && noCryptoMining && noCryptoPayments;
  
  return {
    checkName: 'No Cryptocurrency',
    passed,
    required: true,
    details: passed
      ? 'App contains no cryptocurrency features'
      : 'App contains prohibited cryptocurrency features',
    evidence: passed
      ? [
          'No crypto trading',
          'No crypto wallet',
          'No crypto mining',
          'No crypto payments',
        ]
      : [],
  };
}

// ============================================================================
// LAUNCH READINESS CHECK
// ============================================================================

/**
 * Comprehensive launch readiness check for all platforms
 */
export async function validatePlayStoreSubmission(
  appVersion: string,
  buildNumber: string
): Promise<AppStoreSubmission> {
  return validateAppStoreSubmission('GOOGLE', appVersion, buildNumber);
}

/**
 * Generate compliance report for app store submission
 */
export async function generateComplianceReport(
  platform: 'APPLE' | 'GOOGLE'
): Promise<{
  passed: boolean;
  blockingIssues: number;
  warnings: number;
  recommendations: string[];
}> {
  const submission = await validateAppStoreSubmission(
    platform,
    'pre-submission-check',
    'validation'
  );

  const blockingIssues = submission.validation.issues.filter(
    i => i.severity === 'BLOCKING'
  ).length;
  
  const warnings = submission.validation.warnings.length;
  
  const recommendations: string[] = [];
  
  if (blockingIssues > 0) {
    recommendations.push(`Resolve ${blockingIssues} blocking issues before submission`);
  }
  
  if (warnings > 0) {
    recommendations.push(`Review ${warnings} warnings to improve approval chances`);
  }
  
  if (blockingIssues === 0 && warnings === 0) {
    recommendations.push('App is ready for store submission');
  }

  return {
    passed: submission.validation.passed,
    blockingIssues,
    warnings,
    recommendations,
  };
}