/**
 * PACK 106 — Multi-Currency Client Endpoints
 * 
 * Callable functions for mobile app:
 * - getLocalStorefront: Fetch token bundles in local currency
 * - setUserCurrency: Set user's preferred currency (90-day cooldown)
 * - getUserCurrencyPreference: Get current currency preference
 * 
 * NON-NEGOTIABLE RULES:
 * - No discounts or promotional pricing
 * - Currency changes limited to once per 90 days
 * - All prices are token-equivalent (FX parity only)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  generateLocalizedStorefront,
  getCurrencyProfile,
  getEnabledCurrencies,
} from './pack106-currency-management';
import {
  LocalizedStorefront,
  UserCurrencyPreference,
  CurrencyProfile,
} from './pack106-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CURRENCY_CONFIG = {
  CHANGE_COOLDOWN_DAYS: 90,
  AUTO_DETECT_CURRENCIES: true,
} as const;

// ============================================================================
// GET LOCAL STOREFRONT
// ============================================================================

/**
 * Get localized token storefront for a specific currency
 * Returns all token bundles with local pricing and tax info
 * 
 * Mobile usage:
 * const storefront = await getLocalStorefront({ currencyCode: 'USD' });
 */
export const getLocalStorefront = onCall(
  { region: 'europe-west3' },
  async (request): Promise<LocalizedStorefront> => {
    try {
      const currencyCode = request.data.currencyCode as string;

      if (!currencyCode) {
        throw new HttpsError('invalid-argument', 'currencyCode is required');
      }

      // Validate currency is supported
      const profile = await getCurrencyProfile(currencyCode);
      if (!profile) {
        throw new HttpsError(
          'not-found',
          `Currency ${currencyCode} is not supported`
        );
      }

      if (!profile.enabled) {
        throw new HttpsError(
          'failed-precondition',
          `Currency ${currencyCode} is currently disabled`
        );
      }

      // Generate localized storefront
      const storefront = await generateLocalizedStorefront(currencyCode);

      logger.info(`[PACK106] Generated storefront for ${currencyCode}`, {
        userId: request.auth?.uid,
        bundles: storefront.bundles.length,
      });

      return storefront;
    } catch (error: any) {
      logger.error('[PACK106] Error in getLocalStorefront', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to get storefront: ${error.message}`
      );
    }
  }
);

// ============================================================================
// SET USER CURRENCY
// ============================================================================

/**
 * Set user's preferred currency
 * Enforces 90-day cooldown between changes to prevent arbitrage
 * 
 * Mobile usage:
 * await setUserCurrency({ currencyCode: 'EUR' });
 */
export const setUserCurrency = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; nextChangeAllowedAt?: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const userId = request.auth.uid;
      const currencyCode = request.data.currencyCode as string;
      const countryCode = request.data.countryCode as string | undefined;

      if (!currencyCode) {
        throw new HttpsError('invalid-argument', 'currencyCode is required');
      }

      // Validate currency is supported and enabled
      const profile = await getCurrencyProfile(currencyCode);
      if (!profile) {
        throw new HttpsError(
          'not-found',
          `Currency ${currencyCode} is not supported`
        );
      }

      if (!profile.enabled) {
        throw new HttpsError(
          'failed-precondition',
          `Currency ${currencyCode} is currently disabled`
        );
      }

      // Check existing preference
      const preferenceRef = db
        .collection('users')
        .doc(userId)
        .collection('preferences')
        .doc('currency');

      const existingPref = await preferenceRef.get();

      if (existingPref.exists) {
        const existing = existingPref.data() as UserCurrencyPreference;

        // Check cooldown
        if (existing.canChangeAfter) {
          const now = Timestamp.now();
          if (now.toMillis() < existing.canChangeAfter.toMillis()) {
            const nextAllowedDate = existing.canChangeAfter.toDate();
            throw new HttpsError(
              'failed-precondition',
              `Currency can only be changed once every ${CURRENCY_CONFIG.CHANGE_COOLDOWN_DAYS} days. Next change allowed: ${nextAllowedDate.toISOString()}`,
              { nextChangeAllowedAt: nextAllowedDate.toISOString() }
            );
          }
        }
      }

      // Calculate cooldown expiry (90 days from now)
      const now = Timestamp.now();
      const cooldownExpiry = Timestamp.fromMillis(
        now.toMillis() + CURRENCY_CONFIG.CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
      );

      // Update preference
      const newPreference: UserCurrencyPreference = {
        userId,
        currency: currencyCode,
        setAt: now,
        lastChangedAt: now,
        canChangeAfter: cooldownExpiry,
        autoDetected: false,
        countryCode,
      };

      await preferenceRef.set(newPreference);

      // Also update display currency in main user profile
      await db.collection('users').doc(userId).update({
        displayCurrency: currencyCode,
        updatedAt: serverTimestamp(),
      });

      logger.info(`[PACK106] User ${userId} set currency to ${currencyCode}`, {
        previousCurrency: existingPref.exists ? existingPref.data()?.currency : 'none',
        cooldownExpiry: cooldownExpiry.toDate().toISOString(),
      });

      return {
        success: true,
        nextChangeAllowedAt: cooldownExpiry.toDate().toISOString(),
      };
    } catch (error: any) {
      logger.error('[PACK106] Error in setUserCurrency', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to set currency: ${error.message}`
      );
    }
  }
);

// ============================================================================
// GET USER CURRENCY PREFERENCE
// ============================================================================

/**
 * Get user's current currency preference
 * Auto-detects from location if not set
 * 
 * Mobile usage:
 * const preference = await getUserCurrencyPreference();
 */
export const getUserCurrencyPreference = onCall(
  { region: 'europe-west3' },
  async (request): Promise<UserCurrencyPreference> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const userId = request.auth.uid;
      const countryCode = request.data.countryCode as string | undefined;

      // Check for existing preference
      const preferenceRef = db
        .collection('users')
        .doc(userId)
        .collection('preferences')
        .doc('currency');

      const preferenceDoc = await preferenceRef.get();

      if (preferenceDoc.exists) {
        return preferenceDoc.data() as UserCurrencyPreference;
      }

      // No preference set - auto-detect from country
      let detectedCurrency = 'EUR'; // Default

      if (countryCode && CURRENCY_CONFIG.AUTO_DETECT_CURRENCIES) {
        detectedCurrency = detectCurrencyFromCountry(countryCode);
      }

      // Validate detected currency is enabled
      const profile = await getCurrencyProfile(detectedCurrency);
      if (!profile || !profile.enabled) {
        detectedCurrency = 'EUR'; // Fallback
      }

      // Create auto-detected preference
      const autoPreference: UserCurrencyPreference = {
        userId,
        currency: detectedCurrency,
        setAt: Timestamp.now(),
        canChangeAfter: Timestamp.now(), // Can change immediately on first set
        autoDetected: true,
        countryCode,
      };

      await preferenceRef.set(autoPreference);

      logger.info(`[PACK106] Auto-detected currency ${detectedCurrency} for user ${userId}`, {
        countryCode,
      });

      return autoPreference;
    } catch (error: any) {
      logger.error('[PACK106] Error in getUserCurrencyPreference', error);
      
      throw new HttpsError(
        'internal',
        `Failed to get currency preference: ${error.message}`
      );
    }
  }
);

// ============================================================================
// GET SUPPORTED CURRENCIES
// ============================================================================

/**
 * Get list of all supported currencies
 * For currency selection UI
 * 
 * Mobile usage:
 * const currencies = await getSupportedCurrencies();
 */
export const getSupportedCurrencies = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CurrencyProfile[]> => {
    try {
      const currencies = await getEnabledCurrencies();

      // Sort by name for UI display
      currencies.sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`[PACK106] Fetched ${currencies.length} supported currencies`);

      return currencies;
    } catch (error: any) {
      logger.error('[PACK106] Error in getSupportedCurrencies', error);
      
      throw new HttpsError(
        'internal',
        `Failed to get supported currencies: ${error.message}`
      );
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect currency from country code
 * Uses mapping from pack106-types
 */
function detectCurrencyFromCountry(countryCode: string): string {
  const currencyMap: Record<string, string> = {
    // EU countries
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR',
    AT: 'EUR', PT: 'EUR', GR: 'EUR', IE: 'EUR', FI: 'EUR', LU: 'EUR',
    SI: 'EUR', MT: 'EUR', CY: 'EUR', SK: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR',
    
    // Major currencies
    US: 'USD', GB: 'GBP', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK',
    CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW',
    
    // Other supported
    BR: 'BRL', MX: 'MXN', IN: 'INR', SG: 'SGD', HK: 'HKD', ZA: 'ZAR',
    CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', TR: 'TRY', AE: 'AED',
    SA: 'SAR', IL: 'ILS', TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR',
  };

  return currencyMap[countryCode.toUpperCase()] || 'EUR';
}

/**
 * Validate currency change is allowed
 * Used internally - cooldown check is primary validation
 */
export async function canChangeCurrency(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  nextAllowedAt?: Date;
}> {
  try {
    const preferenceRef = db
      .collection('users')
      .doc(userId)
      .collection('preferences')
      .doc('currency');

    const preferenceDoc = await preferenceRef.get();

    if (!preferenceDoc.exists) {
      return { allowed: true }; // First time setting
    }

    const preference = preferenceDoc.data() as UserCurrencyPreference;

    if (!preference.canChangeAfter) {
      return { allowed: true }; // No cooldown set
    }

    const now = Timestamp.now();
    const cooldownExpiry = preference.canChangeAfter;

    if (now.toMillis() < cooldownExpiry.toMillis()) {
      return {
        allowed: false,
        reason: 'Currency change cooldown active',
        nextAllowedAt: cooldownExpiry.toDate(),
      };
    }

    return { allowed: true };
  } catch (error: any) {
    logger.error('[PACK106] Error checking currency change eligibility', error);
    return { allowed: false, reason: 'System error' };
  }
}