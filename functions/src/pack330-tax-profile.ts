/**
 * PACK 330 — Tax Profile Management
 * Cloud Functions for tax profile CRUD operations
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import {
  TaxProfile,
  SetTaxProfileRequest,
  SetTaxProfileResponse,
  GetTaxProfileResponse,
  TAX_CONFIG,
} from './types/pack330-tax.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate country code (ISO 3166-1 alpha-2)
 */
function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

/**
 * Check if user has identity verification (PACK 328A)
 */
async function checkIdentityVerification(userId: string): Promise<boolean> {
  try {
    const verificationDoc = await db
      .collection('identityVerificationResults')
      .doc(userId)
      .get();
    
    if (!verificationDoc.exists) {
      return false;
    }
    
    const data = verificationDoc.data();
    return data?.verified === true && data?.ageConfirmed === true;
  } catch (error) {
    logger.error('Check identity verification error:', error);
    return false;
  }
}

/**
 * Check if user is 18+
 */
async function checkAge(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return (userData?.age || 0) >= 18;
  } catch (error) {
    logger.error('Check age error:', error);
    return false;
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Set or update tax profile
 * Requires: Identity verification + 18+ age
 */
export const pack330_setTaxProfile = https.onCall<SetTaxProfileRequest>(
  { region: 'europe-west3', memory: '256MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      userId,
      countryCode,
      taxResidenceCountry,
      isBusiness,
      vatId,
      personalTaxId,
      preferredReportCurrency,
    } = request.data;

    // Validate user can only set their own profile
    if (userId !== auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'You can only set your own tax profile'
      );
    }

    // Validate required fields
    if (!countryCode || !taxResidenceCountry || !preferredReportCurrency) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: countryCode, taxResidenceCountry, preferredReportCurrency'
      );
    }

    // Validate country codes
    if (!isValidCountryCode(countryCode) || !isValidCountryCode(taxResidenceCountry)) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid country code format (must be ISO 3166-1 alpha-2)'
      );
    }

    // Validate currency
    if (!TAX_CONFIG.SUPPORTED_CURRENCIES.includes(preferredReportCurrency)) {
      throw new HttpsError(
        'invalid-argument',
        `Currency must be one of: ${TAX_CONFIG.SUPPORTED_CURRENCIES.join(', ')}`
      );
    }

    try {
      // Check identity verification (PACK 328A requirement)
      const hasVerification = await checkIdentityVerification(userId);
      if (!hasVerification) {
        throw new HttpsError(
          'failed-precondition',
          'Identity verification required. Please complete identity verification (PACK 328A) before setting tax profile.'
        );
      }

      // Check age requirement
      const isOver18 = await checkAge(userId);
      if (!isOver18) {
        throw new HttpsError(
          'failed-precondition',
          'Must be 18 or older to set tax profile'
        );
      }

      // Get existing profile to check if it exists
      const profileRef = db.collection(TAX_CONFIG.COLLECTIONS.TAX_PROFILES).doc(userId);
      const existingProfile = await profileRef.get();

      const taxProfile: TaxProfile = {
        userId,
        countryCode: countryCode.toUpperCase(),
        taxResidenceCountry: taxResidenceCountry.toUpperCase(),
        isBusiness,
        vatId: isBusiness ? vatId : undefined,
        personalTaxId,
        preferredReportCurrency,
        consentToElectronicDocs: true, // Required for tax reports
        createdAt: existingProfile.exists 
          ? existingProfile.data()!.createdAt 
          : (serverTimestamp() as any),
        updatedAt: serverTimestamp() as any,
      };

      await profileRef.set(taxProfile, { merge: true });

      logger.info('Tax profile set', {
        userId,
        countryCode,
        isBusiness,
        isUpdate: existingProfile.exists,
      });

      const response: SetTaxProfileResponse = {
        success: true,
      };

      return response;
    } catch (error: any) {
      logger.error('Set tax profile error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        error.message || 'Failed to set tax profile'
      );
    }
  }
);

/**
 * Get tax profile for current user
 */
export const pack330_getTaxProfile = https.onCall(
  { region: 'europe-west3', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = request.data;

    // Users can only get their own profile (or admins can get any)
    if (userId && userId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError(
        'permission-denied',
        'You can only view your own tax profile'
      );
    }

    const targetUserId = userId || auth.uid;

    try {
      const profileDoc = await db
        .collection(TAX_CONFIG.COLLECTIONS.TAX_PROFILES)
        .doc(targetUserId)
        .get();

      if (!profileDoc.exists) {
        const response: GetTaxProfileResponse = {
          success: true,
          profile: undefined,
        };
        return response;
      }

      const profile = profileDoc.data() as TaxProfile;

      const response: GetTaxProfileResponse = {
        success: true,
        profile,
      };

      return response;
    } catch (error: any) {
      logger.error('Get tax profile error:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to get tax profile'
      );
    }
  }
);