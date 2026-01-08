/**
 * PACK 359 — Legal Compliance: Jurisdiction Engine
 * 
 * Auto-detects user jurisdiction and applies country-specific rules:
 * - VAT rates
 * - Digital service tax rates
 * - KYC requirements
 * - Age restrictions
 * - Data retention policies
 * - Payout eligibility
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface JurisdictionProfile {
  countryCode: string;
  vatRate: number;
  digitalServiceTaxRate: number;
  payoutAllowed: boolean;
  kycRequired: boolean;
  minimumAge: number;
  dataRetentionDays: number;
  gdprApplies: boolean;
  dsaApplies: boolean;
  currency: string;
  languageCode: string;
  requiresWithholdingTax: boolean;
  withholdingTaxRate: number;
  invoiceRequired: boolean;
}

export interface JurisdictionDetectionData {
  phonePrefix?: string;
  billingCountry?: string;
  ipCountry?: string;
  detectedCountry: string;
  confidence: 'high' | 'medium' | 'low';
  timestamp: Date;
}

// ============================================================================
// JURISDICTION PROFILES DATABASE
// ============================================================================

const JURISDICTION_PROFILES: Record<string, JurisdictionProfile> = {
  // European Union Countries
  'PL': {
    countryCode: 'PL',
    vatRate: 0.23,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'PLN',
    languageCode: 'pl',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  'DE': {
    countryCode: 'DE',
    vatRate: 0.19,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'EUR',
    languageCode: 'de',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  'FR': {
    countryCode: 'FR',
    vatRate: 0.20,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'EUR',
    languageCode: 'fr',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  'IT': {
    countryCode: 'IT',
    vatRate: 0.22,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'EUR',
    languageCode: 'it',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  'ES': {
    countryCode: 'ES',
    vatRate: 0.21,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'EUR',
    languageCode: 'es',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  'NL': {
    countryCode: 'NL',
    vatRate: 0.21,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'EUR',
    languageCode: 'nl',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  'SE': {
    countryCode: 'SE',
    vatRate: 0.25,
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: true,
    currency: 'SEK',
    languageCode: 'sv',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  
  // United Kingdom
  'GB': {
    countryCode: 'GB',
    vatRate: 0.20,
    digitalServiceTaxRate: 0.02,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true,
    dsaApplies: false,
    currency: 'GBP',
    languageCode: 'en',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  
  // United States
  'US': {
    countryCode: 'US',
    vatRate: 0, // State-specific sales tax handled separately
    digitalServiceTaxRate: 0,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 730, // 2 years for US compliance
    gdprApplies: false,
    dsaApplies: false,
    currency: 'USD',
    languageCode: 'en',
    requiresWithholdingTax: true,
    withholdingTaxRate: 0.24, // Federal backup withholding
    invoiceRequired: false,
  },
  
  // Canada
  'CA': {
    countryCode: 'CA',
    vatRate: 0.05, // GST, provincial taxes handled separately
    digitalServiceTaxRate: 0.03,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 730,
    gdprApplies: false,
    dsaApplies: false,
    currency: 'CAD',
    languageCode: 'en',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  
  // Australia
  'AU': {
    countryCode: 'AU',
    vatRate: 0.10, // GST
    digitalServiceTaxRate: 0,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 730,
    gdprApplies: false,
    dsaApplies: false,
    currency: 'AUD',
    languageCode: 'en',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
  
  // Japan
  'JP': {
    countryCode: 'JP',
    vatRate: 0.10,
    digitalServiceTaxRate: 0,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 1825, // 5 years
    gdprApplies: false,
    dsaApplies: false,
    currency: 'JPY',
    languageCode: 'ja',
    requiresWithholdingTax: true,
    withholdingTaxRate: 0.1021,
    invoiceRequired: true,
  },
  
  // Brazil
  'BR': {
    countryCode: 'BR',
    vatRate: 0.15,
    digitalServiceTaxRate: 0,
    payoutAllowed: true,
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 1825,
    gdprApplies: false,
    dsaApplies: false,
    currency: 'BRL',
    languageCode: 'pt',
    requiresWithholdingTax: true,
    withholdingTaxRate: 0.15,
    invoiceRequired: true,
  },
  
  // Default/Unknown
  'XX': {
    countryCode: 'XX',
    vatRate: 0,
    digitalServiceTaxRate: 0,
    payoutAllowed: false, // Require verification first
    kycRequired: true,
    minimumAge: 18,
    dataRetentionDays: 365,
    gdprApplies: true, // Conservative default
    dsaApplies: true,
    currency: 'USD',
    languageCode: 'en',
    requiresWithholdingTax: false,
    withholdingTaxRate: 0,
    invoiceRequired: true,
  },
};

// Phone prefix to country code mapping
const PHONE_PREFIX_MAP: Record<string, string> = {
  '+1': 'US',
  '+44': 'GB',
  '+33': 'FR',
  '+49': 'DE',
  '+39': 'IT',
  '+34': 'ES',
  '+31': 'NL',
  '+46': 'SE',
  '+48': 'PL',
  '+81': 'JP',
  '+55': 'BR',
  '+61': 'AU',
  '+1-': 'CA', // Canadian +1 area codes
};

// ============================================================================
// JURISDICTION DETECTION
// ============================================================================

/**
 * Detect user's jurisdiction from multiple sources
 */
export async function detectJurisdiction(
  userId: string,
  phoneNumber?: string,
  billingCountry?: string,
  ipAddress?: string
): Promise<JurisdictionDetectionData> {
  let detectedCountry = 'XX';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  // Priority 1: Billing country (highest confidence)
  if (billingCountry) {
    detectedCountry = billingCountry.toUpperCase();
    confidence = 'high';
  }
  // Priority 2: Phone number prefix
  else if (phoneNumber) {
    const prefix = extractPhonePrefix(phoneNumber);
    const countryFromPhone = PHONE_PREFIX_MAP[prefix];
    if (countryFromPhone) {
      detectedCountry = countryFromPhone;
      confidence = 'medium';
    }
  }
  // Priority 3: IP-based geolocation (lowest confidence)
  else if (ipAddress) {
    const countryFromIP = await detectCountryFromIP(ipAddress);
    if (countryFromIP) {
      detectedCountry = countryFromIP;
      confidence = 'low';
    }
  }
  
  const detectionData: JurisdictionDetectionData = {
    phonePrefix: phoneNumber ? extractPhonePrefix(phoneNumber) : undefined,
    billingCountry,
    ipCountry: ipAddress ? await detectCountryFromIP(ipAddress) : undefined,
    detectedCountry,
    confidence,
    timestamp: new Date(),
  };
  
  // Store detection data
  await db.collection('legal_jurisdiction').doc(userId).set({
    ...detectionData,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  
  return detectionData;
}

/**
 * Get jurisdiction profile for a country
 */
export function getJurisdictionProfile(countryCode: string): JurisdictionProfile {
  const profile = JURISDICTION_PROFILES[countryCode.toUpperCase()];
  return profile || JURISDICTION_PROFILES['XX'];
}

/**
 * Get user's current jurisdiction profile
 */
export async function getUserJurisdiction(userId: string): Promise<{
  profile: JurisdictionProfile;
  detection: JurisdictionDetectionData;
}> {
  const doc = await db.collection('legal_jurisdiction').doc(userId).get();
  
  if (!doc.exists) {
    // Default to unknown jurisdiction
    const defaultDetection: JurisdictionDetectionData = {
      detectedCountry: 'XX',
      confidence: 'low',
      timestamp: new Date(),
    };
    
    return {
      profile: JURISDICTION_PROFILES['XX'],
      detection: defaultDetection,
    };
  }
  
  const data = doc.data() as JurisdictionDetectionData;
  const profile = getJurisdictionProfile(data.detectedCountry);
  
  return { profile, detection: data };
}

/**
 * Update user jurisdiction based on transaction
 */
export async function updateJurisdictionFromTransaction(
  userId: string,
  billingCountry: string
): Promise<void> {
  await detectJurisdiction(userId, undefined, billingCountry);
}

// ============================================================================
// COMPLIANCE CHECKS
// ============================================================================

/**
 * Check if user meets age requirements for jurisdiction
 */
export async function checkAgeCompliance(
  userId: string,
  dateOfBirth: Date
): Promise<{ compliant: boolean; minimumAge: number; userAge: number }> {
  const { profile } = await getUserJurisdiction(userId);
  
  const age = calculateAge(dateOfBirth);
  const compliant = age >= profile.minimumAge;
  
  return {
    compliant,
    minimumAge: profile.minimumAge,
    userAge: age,
  };
}

/**
 * Check if user requires KYC for their jurisdiction
 */
export async function checkKYCRequirement(userId: string): Promise<boolean> {
  const { profile } = await getUserJurisdiction(userId);
  return profile.kycRequired;
}

/**
 * Check if payouts are allowed in user's jurisdiction
 */
export async function checkPayoutEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const { profile, detection } = await getUserJurisdiction(userId);
  
  if (!profile.payoutAllowed) {
    return {
      eligible: false,
      reason: `Payouts not available in ${profile.countryCode}`,
    };
  }
  
  if (profile.kycRequired) {
    const kycDoc = await db.collection('kyc_verifications').doc(userId).get();
    if (!kycDoc.exists || kycDoc.data()?.status !== 'approved') {
      return {
        eligible: false,
        reason: 'KYC verification required',
      };
    }
  }
  
  if (detection.confidence === 'low') {
    return {
      eligible: false,
      reason: 'Unable to verify jurisdiction',
    };
  }
  
  return { eligible: true };
}

/**
 * Check if GDPR applies to user
 */
export async function checkGDPRApplicability(userId: string): Promise<boolean> {
  const { profile } = await getUserJurisdiction(userId);
  return profile.gdprApplies;
}

/**
 * Check if DSA (Digital Services Act) applies to user
 */
export async function checkDSAApplicability(userId: string): Promise<boolean> {
  const { profile } = await getUserJurisdiction(userId);
  return profile.dsaApplies;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractPhonePrefix(phoneNumber: string): string {
  // Extract country code from phone number
  const cleaned = phoneNumber.replace(/\s+/g, '');
  
  // Try to match common prefixes
  for (const prefix of Object.keys(PHONE_PREFIX_MAP)) {
    if (cleaned.startsWith(prefix)) {
      return prefix;
    }
  }
  
  // Extract first 2-3 digits after +
  if (cleaned.startsWith('+')) {
    const match = cleaned.match(/^\+(\d{1,3})/);
    if (match) {
      return '+' + match[1];
    }
  }
  
  return '';
}

async function detectCountryFromIP(ipAddress: string): Promise<string | undefined> {
  // In production, integrate with IP geolocation service
  // For now, return undefined to use other detection methods
  // Examples: MaxMind GeoIP2, IP2Location, ipapi.co
  
  try {
    // Placeholder for IP geolocation integration
    // const response = await fetch(`https://ipapi.co/${ipAddress}/country/`);
    // const country = await response.text();
    // return country.trim().toUpperCase();
    
    return undefined;
  } catch (error) {
    console.error('IP geolocation failed:', error);
    return undefined;
  }
}

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  
  return age;
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Automatically detect and update user jurisdiction on registration
 */
export const onUserRegistration = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();
    
    await detectJurisdiction(
      userId,
      userData.phoneNumber,
      userData.billingCountry,
      userData.lastKnownIP
    );
  });

/**
 * Update jurisdiction when user updates payment method
 */
export const onPaymentMethodUpdate = functions.firestore
  .document('payment_methods/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    
    const userId = context.params.userId;
    const paymentData = change.after.data();
    
    if (paymentData.billingCountry) {
      await updateJurisdictionFromTransaction(userId, paymentData.billingCountry);
    }
  });

/**
 * HTTP endpoint to get user's jurisdiction
 */
export const getJurisdiction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const jurisdiction = await getUserJurisdiction(userId);
  
  return jurisdiction;
});

/**
 * HTTP endpoint to check compliance requirements
 */
export const checkCompliance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { profile } = await getUserJurisdiction(userId);
  
  const payoutEligibility = await checkPayoutEligibility(userId);
  
  return {
    countryCode: profile.countryCode,
    kycRequired: profile.kycRequired,
    minimumAge: profile.minimumAge,
    gdprApplies: profile.gdprApplies,
    dsaApplies: profile.dsaApplies,
    payoutEligible: payoutEligibility.eligible,
    payoutReason: payoutEligibility.reason,
  };
});
