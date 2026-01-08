/**
 * PACK 106 — Multi-Currency Price Indexing & Localized Payments
 * Core Currency Management Module
 * 
 * Provides:
 * - FX rate refresh from PSP APIs (Stripe/ECB)
 * - Local token price calculation
 * - PSP routing logic
 * - Currency conversion audit logging
 * 
 * NON-NEGOTIABLE RULES:
 * - Token base price is FIXED at BASE_TOKEN_PRICE_EUR
 * - 65/35 revenue split remains unchanged
 * - No discounts, bonuses, or promotional pricing
 * - All conversions are FX parity only
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { logBusinessAudit } from './pack105-audit-logger';
import {
  CurrencyProfile,
  LocalizedStorefront,
  TokenBundle,
  PSPRoutingDecision,
  CurrencyConversionAudit,
  STANDARD_TOKEN_BUNDLES,
  BASE_TOKEN_PRICE_EUR,
  REFERENCE_CURRENCY,
  SUPPORTED_CURRENCIES,
  VAT_RULES_BY_COUNTRY,
} from './pack106-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PACK106_CONFIG = {
  FX_REFRESH_SCHEDULE: '0 */6 * * *', // Every 6 hours
  FX_CACHE_DURATION_MS: 6 * 60 * 60 * 1000, // 6 hours
  STRIPE_FX_API_TIMEOUT: 5000,
  ECB_FX_API_TIMEOUT: 5000,
  MAX_FX_VARIANCE_THRESHOLD: 0.05, // 5% variance warning
} as const;

// ============================================================================
// FX RATE REFRESH (SCHEDULED JOB)
// ============================================================================

/**
 * Scheduled job to refresh FX rates from PSP APIs
 * Runs every 6 hours
 */
export const refreshCurrencyProfilesFromPSP = onSchedule(
  {
    schedule: PACK106_CONFIG.FX_REFRESH_SCHEDULE,
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '256MiB' as const,
  },
  async (event) => {
    try {
      logger.info('[PACK106] Starting FX rate refresh');

      // Fetch rates from Stripe
      const stripeRates = await fetchStripeExchangeRates();
      
      // Fetch rates from ECB as fallback/validation
      const ecbRates = await fetchECBExchangeRates();

      // Get existing currency profiles
      const profilesSnapshot = await db.collection('currency_profiles').get();
      const existingProfiles = new Map<string, CurrencyProfile>();
      profilesSnapshot.forEach(doc => {
        existingProfiles.set(doc.id, doc.data() as CurrencyProfile);
      });

      let updatedCount = 0;
      let createdCount = 0;
      const batch = db.batch();

      // Update/create currency profiles
      for (const [currencyCode, metadata] of Object.entries(SUPPORTED_CURRENCIES)) {
        const fxRate = stripeRates[currencyCode] || ecbRates[currencyCode];
        
        if (!fxRate) {
          logger.warn(`[PACK106] No FX rate available for ${currencyCode}`);
          continue;
        }

        // Determine tax rules
        const country = metadata.countries[0];
        const vatRule = VAT_RULES_BY_COUNTRY[country] || { rate: 0, included: false, jurisdiction: 'No VAT' };

        // Determine PSP support
        const supportedPSPs = determinePSPSupport(currencyCode);

        const profileRef = db.collection('currency_profiles').doc(currencyCode);
        const existingProfile = existingProfiles.get(currencyCode);

        // Check for significant variance (alert if > 5%)
        if (existingProfile && existingProfile.fxRate) {
          const variance = Math.abs((fxRate - existingProfile.fxRate) / existingProfile.fxRate);
          if (variance > PACK106_CONFIG.MAX_FX_VARIANCE_THRESHOLD) {
            logger.warn(`[PACK106] High FX variance for ${currencyCode}: ${(variance * 100).toFixed(2)}%`);
            // Could trigger alert here via pack105-alerts
          }
        }

        const profileData: CurrencyProfile = {
          code: currencyCode,
          symbol: metadata.symbol,
          name: metadata.name,
          fxRate,
          taxIncluded: vatRule.included,
          taxRate: vatRule.rate,
          decimalPlaces: metadata.decimalPlaces,
          enabled: existingProfile?.enabled ?? true,
          supportedPSPs,
          updatedAt: Timestamp.now(),
          fxSource: stripeRates[currencyCode] ? 'stripe' : 'ecb',
          metadata: {
            countries: [...metadata.countries],
            notes: vatRule.jurisdiction,
          },
        };

        batch.set(profileRef, profileData, { merge: true });

        if (existingProfile) {
          updatedCount++;
        } else {
          createdCount++;
        }
      }

      await batch.commit();

      logger.info(`[PACK106] FX rate refresh complete: ${updatedCount} updated, ${createdCount} created`);

      // Log to business audit
      await logBusinessAudit({
        eventType: 'CURRENCY_CONVERSION_FOR_PURCHASE', // Reusing existing type
        context: {
          action: 'FX_RATE_REFRESH',
          updatedCount,
          createdCount,
          source: 'scheduled_job',
        },
        source: 'pack106-currency-management',
      });

      return null;
    } catch (error: any) {
      logger.error('[PACK106] Error refreshing FX rates', error);
      throw error;
    }
  }
);

/**
 * Fetch exchange rates from Stripe API
 * Returns map of currency code -> rate (EUR base)
 */
async function fetchStripeExchangeRates(): Promise<Record<string, number>> {
  try {
    // Note: This is a stub. In production, use Stripe SDK:
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const rates = await stripe.exchangeRates.retrieve('eur');
    
    logger.info('[PACK106] Fetching Stripe exchange rates (stub)');
    
    // Stub: Return empty for now - implement with actual Stripe SDK
    // In production, Stripe provides real-time rates via their API
    return {};
  } catch (error: any) {
    logger.error('[PACK106] Error fetching Stripe rates', error);
    return {};
  }
}

/**
 * Fetch exchange rates from European Central Bank API
 * Fallback source for FX rates
 */
async function fetchECBExchangeRates(): Promise<Record<string, number>> {
  try {
    // ECB provides daily reference rates
    // API: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
    
    logger.info('[PACK106] Fetching ECB exchange rates (stub)');
    
    // Stub: Return static fallback rates
    // In production, fetch from ECB API and parse XML
    const fallbackRates: Record<string, number> = {
      EUR: 1.0,
      USD: 1.08,
      GBP: 0.85,
      PLN: 4.34,
      SEK: 11.35,
      NOK: 11.50,
      DKK: 7.46,
      CHF: 0.95,
      CAD: 1.47,
      AUD: 1.65,
      JPY: 161.50,
      KRW: 1429.00,
      BRL: 5.35,
      MXN: 18.50,
      INR: 90.00,
      SGD: 1.45,
      HKD: 8.45,
      NZD: 1.78,
      ZAR: 19.50,
      CZK: 24.50,
      HUF: 385.00,
      RON: 4.97,
      BGN: 1.96,
      TRY: 32.50,
      AED: 3.97,
      SAR: 4.05,
      ILS: 3.95,
      THB: 37.50,
      MYR: 4.85,
      PHP: 60.50,
      IDR: 16850.00,
    };
    
    return fallbackRates;
  } catch (error: any) {
    logger.error('[PACK106] Error fetching ECB rates', error);
    return {};
  }
}

/**
 * Determine which PSPs support a given currency
 */
function determinePSPSupport(currencyCode: string): Array<'STRIPE' | 'WISE'> {
  // Most major currencies supported by Stripe
  const stripeCurrencies = [
    'EUR', 'USD', 'GBP', 'PLN', 'SEK', 'NOK', 'DKK', 'CHF',
    'CAD', 'AUD', 'JPY', 'SGD', 'HKD', 'NZD', 'MXN', 'BRL',
    'CZK', 'RON', 'BGN', 'ILS', 'THB', 'MYR', 'PHP', 'AED', 'SAR'
  ];

  // Wise supports many currencies but different set
  const wiseCurrencies = [
    'EUR', 'USD', 'GBP', 'PLN', 'SEK', 'NOK', 'DKK', 'CHF',
    'CAD', 'AUD', 'NZD', 'JPY', 'SGD', 'HKD', 'INR', 'ZAR',
    'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'THB', 'MYR', 'PHP', 'IDR'
  ];

  const result: Array<'STRIPE' | 'WISE'> = [];
  
  if (stripeCurrencies.includes(currencyCode)) {
    result.push('STRIPE');
  }
  
  if (wiseCurrencies.includes(currencyCode)) {
    result.push('WISE');
  }

  return result;
}

// ============================================================================
// LOCAL TOKEN PRICE CALCULATION
// ============================================================================

/**
 * Calculate local token price with tax
 * 
 * Formula: price_local = BASE_PRICE × FX_RATE × TAX_MULTIPLIER
 * 
 * @param tokens Number of tokens
 * @param currencyCode Target currency
 * @returns Price in local currency
 */
export async function calculateLocalTokenPrice(
  tokens: number,
  currencyCode: string
): Promise<{ price: number; priceWithTax: number; taxAmount: number; fxRate: number }> {
  try {
    // Fetch currency profile
    const profileDoc = await db.collection('currency_profiles').doc(currencyCode).get();
    
    if (!profileDoc.exists) {
      throw new Error(`Currency ${currencyCode} not supported`);
    }

    const profile = profileDoc.data() as CurrencyProfile;

    // Calculate base price in EUR
    const basePriceEUR = tokens * BASE_TOKEN_PRICE_EUR;

    // Convert to local currency
    const priceBeforeTax = basePriceEUR * profile.fxRate;

    // Apply tax if required
    let priceWithTax = priceBeforeTax;
    let taxAmount = 0;

    if (profile.taxIncluded && profile.taxRate > 0) {
      taxAmount = priceBeforeTax * profile.taxRate;
      priceWithTax = priceBeforeTax + taxAmount;
    }

    // Round to appropriate decimal places
    const roundedPrice = roundCurrency(priceBeforeTax, profile.decimalPlaces);
    const roundedPriceWithTax = roundCurrency(priceWithTax, profile.decimalPlaces);
    const roundedTaxAmount = roundCurrency(taxAmount, profile.decimalPlaces);

    return {
      price: roundedPrice,
      priceWithTax: roundedPriceWithTax,
      taxAmount: roundedTaxAmount,
      fxRate: profile.fxRate,
    };
  } catch (error: any) {
    logger.error('[PACK106] Error calculating local token price', error);
    throw error;
  }
}

/**
 * Round currency amount to appropriate decimal places
 */
function roundCurrency(amount: number, decimalPlaces: number): number {
  const multiplier = Math.pow(10, decimalPlaces);
  return Math.round(amount * multiplier) / multiplier;
}

/**
 * Generate localized storefront for a currency
 * Returns all token bundles with local pricing
 */
export async function generateLocalizedStorefront(
  currencyCode: string
): Promise<LocalizedStorefront> {
  try {
    // Fetch currency profile
    const profileDoc = await db.collection('currency_profiles').doc(currencyCode).get();
    
    if (!profileDoc.exists) {
      throw new Error(`Currency ${currencyCode} not supported`);
    }

    const profile = profileDoc.data() as CurrencyProfile;

    // Calculate prices for all standard bundles
    const bundles: TokenBundle[] = [];

    for (const bundle of STANDARD_TOKEN_BUNDLES) {
      const pricing = await calculateLocalTokenPrice(bundle.tokens, currencyCode);

      bundles.push({
        tokens: bundle.tokens,
        price: profile.taxIncluded ? pricing.priceWithTax : pricing.price,
        currency: currencyCode,
        priceWithTax: pricing.priceWithTax,
        taxAmount: pricing.taxAmount,
        label: `${bundle.tokens} Tokens`,
        popularBadge: bundle.popular,
      });
    }

    // Determine preferred PSP
    const preferredPSP = profile.supportedPSPs[0] || 'STRIPE';

    return {
      currency: currencyCode,
      symbol: profile.symbol,
      bundles,
      taxIncluded: profile.taxIncluded,
      taxRate: profile.taxRate,
      taxJurisdiction: profile.metadata?.notes,
      fxRate: profile.fxRate,
      baseTokenPrice: BASE_TOKEN_PRICE_EUR,
      rateTimestamp: profile.updatedAt,
      preferredPSP,
    };
  } catch (error: any) {
    logger.error('[PACK106] Error generating localized storefront', error);
    throw error;
  }
}

// ============================================================================
// PSP ROUTING
// ============================================================================

/**
 * Determine PSP routing for a payment
 * Selects best PSP based on currency support
 */
export async function determinePSPRouting(
  currencyCode: string,
  amount: number
): Promise<PSPRoutingDecision> {
  try {
    // Fetch currency profile
    const profileDoc = await db.collection('currency_profiles').doc(currencyCode).get();
    
    if (!profileDoc.exists) {
      // Fallback: charge in EUR
      return {
        psp: 'FALLBACK',
        chargeCurrency: 'EUR',
        chargeAmount: amount / (await getEURRate(currencyCode)),
        reason: 'Currency not supported, using EUR fallback',
        nativeSupport: false,
        disclosureMessage: `Payment will be processed in EUR. Your bank may apply conversion fees.`,
      };
    }

    const profile = profileDoc.data() as CurrencyProfile;

    // Check PSP support
    if (profile.supportedPSPs.includes('STRIPE')) {
      return {
        psp: 'STRIPE',
        chargeCurrency: currencyCode,
        chargeAmount: amount,
        reason: 'Stripe supports native currency',
        nativeSupport: true,
      };
    }

    if (profile.supportedPSPs.includes('WISE')) {
      return {
        psp: 'WISE',
        chargeCurrency: currencyCode,
        chargeAmount: amount,
        reason: 'Wise supports native currency',
        nativeSupport: true,
      };
    }

    // No native support, use EUR
    const eurAmount = amount / profile.fxRate;
    return {
      psp: 'STRIPE',
      chargeCurrency: 'EUR',
      chargeAmount: eurAmount,
      reason: 'No native PSP support, converting to EUR',
      nativeSupport: false,
      pspFxConversion: {
        fromCurrency: currencyCode,
        toCurrency: 'EUR',
        rate: profile.fxRate,
      },
      disclosureMessage: `Payment will be processed in EUR (€${eurAmount.toFixed(2)}). Exchange rate: 1 EUR = ${profile.fxRate.toFixed(4)} ${currencyCode}`,
    };
  } catch (error: any) {
    logger.error('[PACK106] Error determining PSP routing', error);
    throw error;
  }
}

/**
 * Get EUR exchange rate for a currency (fallback helper)
 */
async function getEURRate(currencyCode: string): Promise<number> {
  try {
    const profileDoc = await db.collection('currency_profiles').doc(currencyCode).get();
    if (profileDoc.exists) {
      return (profileDoc.data() as CurrencyProfile).fxRate;
    }
    return 1.0; // Default to 1:1 if not found
  } catch {
    return 1.0;
  }
}

// ============================================================================
// CURRENCY CONVERSION AUDIT
// ============================================================================

/**
 * Log currency conversion event to business audit log
 * Integrates with PACK 105
 */
export async function logCurrencyConversion(params: {
  userId: string;
  originatingCurrency: string;
  originatingAmount: number;
  tokensAmount: number;
  fxRate: number;
  pspUsed: 'STRIPE' | 'WISE';
  pspTransactionId?: string;
  context?: Record<string, any>;
}): Promise<void> {
  try {
    const auditData: Omit<CurrencyConversionAudit, 'id' | 'createdAt'> = {
      eventType: 'CURRENCY_CONVERSION_FOR_PURCHASE',
      userId: params.userId,
      originatingCurrency: params.originatingCurrency,
      targetCurrency: 'TOKENS',
      fxRateApplied: params.fxRate,
      originatingAmount: params.originatingAmount,
      tokensAmount: params.tokensAmount,
      pspUsed: params.pspUsed,
      pspTransactionId: params.pspTransactionId,
      fxSource: 'currency_profile',
      context: params.context,
    };

    // Log to business audit via PACK 105
    await logBusinessAudit({
      eventType: 'CURRENCY_CONVERSION_FOR_PURCHASE',
      userId: params.userId,
      context: auditData,
      source: 'pack106-currency-management',
    });

    logger.info(`[PACK106] Logged currency conversion for user ${params.userId}`, {
      currency: params.originatingCurrency,
      tokens: params.tokensAmount,
    });
  } catch (error: any) {
    logger.error('[PACK106] Error logging currency conversion', error);
    // Don't throw - audit logging failure shouldn't break payment flow
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get currency profile by code
 */
export async function getCurrencyProfile(currencyCode: string): Promise<CurrencyProfile | null> {
  try {
    const doc = await db.collection('currency_profiles').doc(currencyCode).get();
    return doc.exists ? (doc.data() as CurrencyProfile) : null;
  } catch (error: any) {
    logger.error('[PACK106] Error fetching currency profile', error);
    return null;
  }
}

/**
 * Get all enabled currency profiles
 */
export async function getEnabledCurrencies(): Promise<CurrencyProfile[]> {
  try {
    const snapshot = await db
      .collection('currency_profiles')
      .where('enabled', '==', true)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as CurrencyProfile);
  } catch (error: any) {
    logger.error('[PACK106] Error fetching enabled currencies', error);
    return [];
  }
}

/**
 * Format currency amount for display
 */
export function formatCurrencyAmount(
  amount: number,
  currencyCode: string,
  symbol: string,
  decimalPlaces: number
): string {
  const rounded = roundCurrency(amount, decimalPlaces);
  
  // Symbol position varies by currency
  if (['EUR', 'GBP', 'PLN'].includes(currencyCode)) {
    return `${rounded.toFixed(decimalPlaces)} ${symbol}`;
  }
  
  return `${symbol}${rounded.toFixed(decimalPlaces)}`;
}