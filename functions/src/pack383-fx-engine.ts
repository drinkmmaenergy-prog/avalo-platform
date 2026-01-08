/**
 * PACK 383 - Global Payment Routing, Compliance & Cross-Border Payout Engine
 * FX & Token Conversion Engine
 * 
 * Handles:
 * - Token to fiat conversion (1 token = 0.20 PLN from PACK 277)
 * - Cross-border FX rates
 * - Regional rounding rules
 * - Volatility buffers
 * - Min payout enforcement
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Constants from PACK 277
const TOKEN_TO_PLN_RATE = 0.20;

// FX Rate Interface
interface FXRate {
  from: string;
  to: string;
  rate: number;
  inverseRate: number;
  source: string;
  timestamp: admin.firestore.Timestamp;
  validUntil: admin.firestore.Timestamp;
}

/**
 * Convert tokens to local fiat currency
 */
export const pack383_convertTokenToLocalFiat = functions.https.onCall(
  async (data: { tokens: number; targetCurrency: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { tokens, targetCurrency } = data;

    try {
      // Step 1: Convert tokens to PLN
      const plnAmount = tokens * TOKEN_TO_PLN_RATE;

      // Step 2: Convert PLN to target currency
      const { amount, rate, appliedFees } = await convertCurrency(plnAmount, 'PLN', targetCurrency);

      // Step 3: Apply regional rounding rules
      const roundedAmount = applyRegionalRounding(amount, targetCurrency);

      // Step 4: Check minimum payout threshold
      const minPayout = getMinimumPayout(targetCurrency);
      if (roundedAmount < minPayout) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Amount ${roundedAmount} ${targetCurrency} is below minimum payout threshold of ${minPayout} ${targetCurrency}`
        );
      }

      return {
        success: true,
        tokens,
        plnAmount,
        targetCurrency,
        amount: roundedAmount,
        fxRate: rate,
        fees: appliedFees,
        minimumPayout: minPayout,
      };
    } catch (error: any) {
      console.error('Error converting token to fiat:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get current FX rate between two currencies
 */
export const pack383_getFXRate = functions.https.onCall(
  async (data: { from: string; to: string }, context) => {
    const { from, to } = data;

    try {
      // Check cache first
      const cachedRate = await getCachedFXRate(from, to);
      if (cachedRate && cachedRate.validUntil.toDate() > new Date()) {
        return {
          success: true,
          from,
          to,
          rate: cachedRate.rate,
          inverseRate: cachedRate.inverseRate,
          source: cachedRate.source,
          cachedAt: cachedRate.timestamp.toDate().toISOString(),
        };
      }

      // Fetch fresh rate
      const freshRate = await fetchFXRate(from, to);

      // Cache the rate
      await db.collection('fxRates').add({
        from,
        to,
        rate: freshRate.rate,
        inverseRate: 1 / freshRate.rate,
        source: freshRate.source,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        validUntil: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 3600000) // 1 hour
        ),
      });

      return {
        success: true,
        from,
        to,
        rate: freshRate.rate,
        inverseRate: 1 / freshRate.rate,
        source: freshRate.source,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('Error getting FX rate:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update FX rates from external source
 * Scheduled function
 */
export const pack383_updateFXRates = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      // Major currency pairs to update
      const currencyPairs = [
        { from: 'PLN', to: 'USD' },
        { from: 'PLN', to: 'EUR' },
        { from: 'PLN', to: 'GBP' },
        { from: 'PLN', to: 'CAD' },
        { from: 'PLN', to: 'AUD' },
        { from: 'USD', to: 'EUR' },
        { from: 'USD', to: 'GBP' },
      ];

      const updatePromises = currencyPairs.map(async (pair) => {
        try {
          const rate = await fetchFXRate(pair.from, pair.to);

          await db.collection('fxRates').add({
            from: pair.from,
            to: pair.to,
            rate: rate.rate,
            inverseRate: 1 / rate.rate,
            source: rate.source,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            validUntil: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 7200000) // 2 hours
            ),
          });

          console.log(`Updated FX rate: ${pair.from}/${pair.to} = ${rate.rate}`);
        } catch (error) {
          console.error(`Error updating ${pair.from}/${pair.to}:`, error);
        }
      });

      await Promise.all(updatePromises);

      console.log(`Updated ${currencyPairs.length} FX rates`);
      return null;
    } catch (error) {
      console.error('Error updating FX rates:', error);
      return null;
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<{ amount: number; rate: number; appliedFees: number }> {
  if (fromCurrency === toCurrency) {
    return { amount, rate: 1, appliedFees: 0 };
  }

  // Get FX rate
  const fxRateDoc = await getCachedFXRate(fromCurrency, toCurrency);
  let rate: number;

  if (fxRateDoc && fxRateDoc.validUntil.toDate() > new Date()) {
    rate = fxRateDoc.rate;
  } else {
    const freshRate = await fetchFXRate(fromCurrency, toCurrency);
    rate = freshRate.rate;
  }

  // Apply volatility buffer (0.5% to account for market fluctuations)
  const volatilityBuffer = 0.005;
  const adjustedRate = rate * (1 - volatilityBuffer);

  // Calculate converted amount
  const convertedAmount = amount * adjustedRate;

  // Calculate fees (0.3% conversion fee)
  const conversionFee = convertedAmount * 0.003;
  const finalAmount = convertedAmount - conversionFee;

  return {
    amount: finalAmount,
    rate: adjustedRate,
    appliedFees: conversionFee,
  };
}

async function getCachedFXRate(from: string, to: string): Promise<FXRate | null> {
  const snapshot = await db
    .collection('fxRates')
    .where('from', '==', from)
    .where('to', '==', to)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as FXRate;
}

async function fetchFXRate(from: string, to: string): Promise<{ rate: number; source: string }> {
  // Placeholder for external FX API integration
  // In production, integrate with:
  // - Open Exchange Rates
  // - Xe.com API
  // - European Central Bank API
  // - Currency Layer API

  // Simplified static rates for development
  const staticRates: Record<string, Record<string, number>> = {
    'PLN': {
      'USD': 0.25,
      'EUR': 0.23,
      'GBP': 0.20,
      'CAD': 0.34,
      'AUD': 0.37,
    },
    'USD': {
      'PLN': 4.0,
      'EUR': 0.92,
      'GBP': 0.79,
      'CAD': 1.35,
      'AUD': 1.48,
    },
    'EUR': {
      'PLN': 4.35,
      'USD': 1.09,
      'GBP': 0.86,
      'CAD': 1.47,
      'AUD': 1.61,
    },
  };

  if (staticRates[from] && staticRates[from][to]) {
    return {
      rate: staticRates[from][to],
      source: 'static_rates',
    };
  }

  // If not in static rates, calculate inverse
  if (staticRates[to] && staticRates[to][from]) {
    return {
      rate: 1 / staticRates[to][from],
      source: 'inverse_static_rates',
    };
  }

  throw new Error(`FX rate not available for ${from}/${to}`);
}

function applyRegionalRounding(amount: number, currency: string): number {
  // Regional rounding rules
  const roundingRules: Record<string, { decimals: number; roundTo?: number }> = {
    'PLN': { decimals: 2 },
    'USD': { decimals: 2 },
    'EUR': { decimals: 2 },
    'GBP': { decimals: 2 },
    'JPY': { decimals: 0 }, // Yen has no decimals
    'KRW': { decimals: 0 }, // Korean Won has no decimals
    'CHF': { decimals: 2, roundTo: 0.05 }, // Swiss Franc rounds to 5 cents
  };

  const rule = roundingRules[currency] || { decimals: 2 };

  if (rule.roundTo) {
    // Round to nearest specified amount
    return Math.round(amount / rule.roundTo) * rule.roundTo;
  }

  // Standard decimal rounding
  const factor = Math.pow(10, rule.decimals);
  return Math.round(amount * factor) / factor;
}

function getMinimumPayout(currency: string): number {
  // Minimum payout thresholds by currency
  const minPayouts: Record<string, number> = {
    'PLN': 10,
    'USD': 5,
    'EUR': 5,
    'GBP': 5,
    'CAD': 7,
    'AUD': 7,
    'JPY': 500,
    'CHF': 5,
    'SEK': 50,
    'NOK': 50,
    'DKK': 35,
  };

  return minPayouts[currency] || 10; // Default minimum: 10 units
}

/**
 * Calculate conversion preview (no database writes)
 */
export const pack383_previewConversion = functions.https.onCall(
  async (data: { tokens: number; targetCurrency: string }, context) => {
    const { tokens, targetCurrency } = data;

    try {
      const plnAmount = tokens * TOKEN_TO_PLN_RATE;
      const { amount, rate, appliedFees } = await convertCurrency(plnAmount, 'PLN', targetCurrency);
      const roundedAmount = applyRegionalRounding(amount, targetCurrency);
      const minPayout = getMinimumPayout(targetCurrency);

      return {
        success: true,
        tokens,
        plnAmount,
        targetCurrency,
        estimatedAmount: roundedAmount,
        fxRate: rate,
        estimatedFees: appliedFees,
        minimumPayout: minPayout,
        meetsMinimum: roundedAmount >= minPayout,
        breakdown: {
          tokensValue: plnAmount,
          fxConversion: amount,
          fees: appliedFees,
          final: roundedAmount,
        },
      };
    } catch (error: any) {
      console.error('Error previewing conversion:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
