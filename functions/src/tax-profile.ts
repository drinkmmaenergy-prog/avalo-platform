/**
 * PACK 129 — Tax Profile Management
 * Functions for managing creator tax profiles and entity information
 * 
 * NON-NEGOTIABLE RULES:
 * - No creator receives higher payout rates because of business entity type
 * - Entity type = compliance only, NOT privilege
 * - Profile changes require compliance review
 * - No tax avoidance by switching regions
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import {
  TaxProfile,
  TaxProfileStatus,
  EntityType,
  SubmitTaxProfileRequest,
  SubmitTaxProfileResponse,
  UpdateTaxProfileRequest,
  UpdateTaxProfileResponse,
  TaxComplianceCheck,
  isValidEntityType,
} from './types/tax.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate billing address
 */
function validateBillingAddress(address: any): { valid: boolean; error?: string } {
  if (!address) {
    return { valid: false, error: 'Billing address is required' };
  }

  const required = ['line1', 'city', 'postalCode', 'country'];
  for (const field of required) {
    if (!address[field] || typeof address[field] !== 'string') {
      return { valid: false, error: `Address ${field} is required` };
    }
  }

  if (address.country.length !== 2) {
    return { valid: false, error: 'Country must be ISO-2 code (e.g., US, PL, DE)' };
  }

  return { valid: true };
}

/**
 * Validate tax ID format based on country
 */
function validateTaxId(taxId: string, country: string): boolean {
  if (!taxId) return true; // Optional field

  // Basic validation - can be enhanced with country-specific rules
  const minLength = 5;
  const maxLength = 30;

  if (taxId.length < minLength || taxId.length > maxLength) {
    return false;
  }

  // Only alphanumeric and basic punctuation
  const validPattern = /^[A-Z0-9\-\/]+$/i;
  return validPattern.test(taxId);
}

/**
 * Validate VAT ID format
 */
function validateVatId(vatId: string, country: string): boolean {
  if (!vatId) return true; // Optional field

  // Basic VAT ID validation
  // EU VAT IDs typically start with country code
  const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
                       'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 
                       'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

  if (euCountries.includes(country)) {
    // Should start with country code
    if (!vatId.toUpperCase().startsWith(country)) {
      return false;
    }
  }

  // Basic length check
  return vatId.length >= 8 && vatId.length <= 15;
}

/**
 * Determine if profile requires verification
 */
function requiresVerification(entityType: EntityType, country: string): boolean {
  // All company profiles require verification
  if (entityType === 'COMPANY') {
    return true;
  }

  // High-risk countries require individual verification
  const highRiskCountries = ['PK', 'NG', 'KE']; // Example list
  if (highRiskCountries.includes(country)) {
    return true;
  }

  return false;
}

/**
 * Check for existing profile
 */
async function getExistingProfile(userId: string): Promise<TaxProfile | null> {
  try {
    const profileDoc = await db.collection('tax_profiles').doc(userId).get();
    if (profileDoc.exists) {
      return profileDoc.data() as TaxProfile;
    }
    return null;
  } catch (error) {
    logger.error('Error getting existing profile', { error, userId });
    return null;
  }
}

/**
 * Verify user region consistency
 */
async function verifyRegionConsistency(
  userId: string,
  submittedCountry: string
): Promise<{ consistent: boolean; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    // Check user's KYC country
    const kycDoc = await db.collection('user_kyc_status').doc(userId).get();
    if (kycDoc.exists) {
      const kycData = kycDoc.data();
      const kycCountry = kycData?.country;

      if (kycCountry && kycCountry !== submittedCountry) {
        warnings.push(`Tax country (${submittedCountry}) differs from KYC country (${kycCountry})`);
      }
    }

    // Check user's region verification
    const regionDoc = await db.collection('user_region_verification').doc(userId).get();
    if (regionDoc.exists) {
      const regionData = regionDoc.data();
      const consensusRegion = regionData?.consensusRegion;

      if (consensusRegion && consensusRegion !== submittedCountry) {
        warnings.push(`Tax country (${submittedCountry}) differs from verified region (${consensusRegion})`);
      }
    }

    // If there are warnings, flag for review
    return {
      consistent: warnings.length === 0,
      warnings,
    };
  } catch (error) {
    logger.error('Error verifying region consistency', { error, userId });
    return { consistent: true, warnings: [] }; // Fail open for now
  }
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Submit or update tax profile
 */
export const tax_submitProfile = https.onCall<SubmitTaxProfileRequest>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data;
    const userId = auth.uid;

    // Validate user ID matches authenticated user
    if (data.userId !== userId) {
      throw new HttpsError('permission-denied', 'Cannot submit profile for another user');
    }

    // Validate entity type
    if (!isValidEntityType(data.entityType)) {
      throw new HttpsError('invalid-argument', 'Invalid entity type');
    }

    // Validate billing address
    const addressValidation = validateBillingAddress(data.billingAddress);
    if (!addressValidation.valid) {
      throw new HttpsError('invalid-argument', addressValidation.error || 'Invalid address');
    }

    // Validate tax ID if provided
    if (data.taxId && !validateTaxId(data.taxId, data.country)) {
      throw new HttpsError('invalid-argument', 'Invalid tax ID format');
    }

    // Validate VAT ID if provided
    if (data.vatId && !validateVatId(data.vatId, data.country)) {
      throw new HttpsError('invalid-argument', 'Invalid VAT ID format');
    }

    try {
      // Check for existing profile
      const existingProfile = await getExistingProfile(userId);

      // Verify region consistency
      const consistency = await verifyRegionConsistency(userId, data.country);

      // Determine status
      let status: TaxProfileStatus = 'ACTIVE';
      const needsVerification = requiresVerification(data.entityType, data.country);

      if (needsVerification || !consistency.consistent) {
        status = 'REVIEW_REQUIRED';
      }

      // Get regional tax rules
      let requiresWithholding = false;
      let vatEligible = false;

      try {
        const taxRulesDoc = await db
          .collection('regional_tax_rules')
          .doc(data.country)
          .get();

        if (taxRulesDoc.exists) {
          const rules = taxRulesDoc.data();
          requiresWithholding = rules?.withholding?.required || false;
          vatEligible = rules?.vat?.applicable || false;
        }
      } catch (error) {
        logger.warn('Could not fetch regional tax rules', { error, country: data.country });
      }

      // Create or update profile
      const profile: TaxProfile = {
        userId,
        entityType: data.entityType,
        country: data.country,
        taxId: data.taxId,
        vatId: data.vatId,
        businessName: data.businessName,
        companyType: data.companyType,
        registrationNumber: data.registrationNumber,
        billingAddress: data.billingAddress,
        status,
        documentsVerified: false,
        requiresWithholding,
        vatEligible,
        createdAt: existingProfile?.createdAt || (serverTimestamp() as any),
        updatedAt: serverTimestamp() as any,
        notes: consistency.warnings.length > 0 
          ? `Region inconsistencies detected: ${consistency.warnings.join('; ')}`
          : undefined,
      };

      // Save profile
      await db.collection('tax_profiles').doc(userId).set(profile);

      // Log profile submission
      logger.info('Tax profile submitted', {
        userId,
        entityType: data.entityType,
        country: data.country,
        status,
        needsVerification,
        regionInconsistencies: consistency.warnings.length,
      });

      const response: SubmitTaxProfileResponse = {
        success: true,
        profileId: userId,
        status,
        requiresVerification: status === 'REVIEW_REQUIRED',
        message: status === 'REVIEW_REQUIRED'
          ? 'Tax profile submitted for review. You will be notified once verified.'
          : 'Tax profile activated successfully.',
      };

      return response;
    } catch (error: any) {
      logger.error('Tax profile submission failed', { error, userId });
      throw new HttpsError('internal', error.message || 'Failed to submit tax profile');
    }
  }
);

/**
 * Update existing tax profile
 */
export const tax_updateProfile = https.onCall<UpdateTaxProfileRequest>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, updates } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot update profile for another user');
    }

    try {
      const profileDoc = await db.collection('tax_profiles').doc(userId).get();

      if (!profileDoc.exists) {
        throw new HttpsError('not-found', 'Tax profile not found. Please submit a new profile.');
      }

      const currentProfile = profileDoc.data() as TaxProfile;

      // Check if profile is suspended
      if (currentProfile.status === 'SUSPENDED') {
        throw new HttpsError(
          'failed-precondition',
          'Profile is suspended. Contact support for assistance.'
        );
      }

      // Validate updates
      if (updates.billingAddress) {
        const addressValidation = validateBillingAddress(updates.billingAddress);
        if (!addressValidation.valid) {
          throw new HttpsError('invalid-argument', addressValidation.error || 'Invalid address');
        }
      }

      if (updates.taxId && updates.country) {
        if (!validateTaxId(updates.taxId, updates.country)) {
          throw new HttpsError('invalid-argument', 'Invalid tax ID format');
        }
      }

      if (updates.vatId && updates.country) {
        if (!validateVatId(updates.vatId, updates.country)) {
          throw new HttpsError('invalid-argument', 'Invalid VAT ID format');
        }
      }

      // Check if critical fields changed (require review)
      const criticalFieldsChanged = 
        (updates.country && updates.country !== currentProfile.country) ||
        (updates.entityType && updates.entityType !== currentProfile.entityType) ||
        (updates.taxId && updates.taxId !== currentProfile.taxId);

      let newStatus = currentProfile.status;
      if (criticalFieldsChanged && currentProfile.status === 'ACTIVE') {
        newStatus = 'REVIEW_REQUIRED';
      }

      // Apply updates
      const updatedFields = {
        ...updates,
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      await db.collection('tax_profiles').doc(userId).update(updatedFields);

      logger.info('Tax profile updated', {
        userId,
        criticalFieldsChanged,
        newStatus,
      });

      const response: UpdateTaxProfileResponse = {
        success: true,
        updated: true,
        requiresReview: newStatus === 'REVIEW_REQUIRED',
        message: newStatus === 'REVIEW_REQUIRED'
          ? 'Profile updated. Changes require review before approval.'
          : 'Profile updated successfully.',
      };

      return response;
    } catch (error: any) {
      logger.error('Tax profile update failed', { error, userId });
      throw new HttpsError('internal', error.message || 'Failed to update tax profile');
    }
  }
);

/**
 * Get tax profile
 */
export const tax_getProfile = https.onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access profile for another user');
    }

    try {
      const profileDoc = await db.collection('tax_profiles').doc(userId).get();

      if (!profileDoc.exists) {
        return {
          exists: false,
          profile: null,
        };
      }

      const profile = profileDoc.data() as TaxProfile;

      return {
        exists: true,
        profile: {
          ...profile,
          createdAt: profile.createdAt.toMillis(),
          updatedAt: profile.updatedAt.toMillis(),
          verifiedAt: profile.verifiedAt?.toMillis(),
          lastReviewedAt: profile.lastReviewedAt?.toMillis(),
        },
      };
    } catch (error: any) {
      logger.error('Failed to get tax profile', { error, userId });
      throw new HttpsError('internal', 'Failed to retrieve tax profile');
    }
  }
);

/**
 * Check tax compliance for payout eligibility
 */
export const tax_checkCompliance = https.onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot check compliance for another user');
    }

    try {
      const profileDoc = await db.collection('tax_profiles').doc(userId).get();

      const checks = {
        profileComplete: false,
        taxIdValid: false,
        addressValid: false,
        documentsVerified: false,
        withholdingRulesApplied: false,
      };

      const blockers: string[] = [];
      const warnings: string[] = [];

      if (!profileDoc.exists) {
        blockers.push('Tax profile not submitted');
      } else {
        const profile = profileDoc.data() as TaxProfile;

        checks.profileComplete = true;

        if (profile.status === 'SUSPENDED') {
          blockers.push('Tax profile is suspended');
        }

        if (profile.status === 'REVIEW_REQUIRED') {
          warnings.push('Tax profile pending review');
        }

        // Check tax ID
        if (profile.requiresWithholding && !profile.taxId) {
          blockers.push('Tax ID required for your region');
        } else {
          checks.taxIdValid = true;
        }

        // Check address
        const addressCheck = validateBillingAddress(profile.billingAddress);
        checks.addressValid = addressCheck.valid;
        if (!addressCheck.valid) {
          blockers.push('Invalid billing address');
        }

        // Check verification
        checks.documentsVerified = profile.documentsVerified;
        if (!profile.documentsVerified && profile.entityType === 'COMPANY') {
          warnings.push('Business documents pending verification');
        }

        // Withholding rules
        checks.withholdingRulesApplied = profile.requiresWithholding;
      }

      const complianceCheck: TaxComplianceCheck = {
        userId,
        checks,
        blockers,
        warnings,
        passed: blockers.length === 0,
        checkedAt: serverTimestamp() as any,
      };

      // Store compliance check result
      await db
        .collection('tax_compliance_checks')
        .doc(userId)
        .set(complianceCheck);

      return complianceCheck;
    } catch (error: any) {
      logger.error('Tax compliance check failed', { error, userId });
      throw new HttpsError('internal', 'Failed to check tax compliance');
    }
  }
);