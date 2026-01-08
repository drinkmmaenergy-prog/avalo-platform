/**
 * PACK 390 - FX RATES & CURRENCY CONVERSION
 * Handles multi-currency conversions and FX rate synchronization
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'RON', 'BGN', 'HRK', 'UAH', 'TRY'];
const BASE_TOKEN_VALUE_PLN = 0.20; // 1 token = 0.20 PLN (fixed)

// ECB API for European currencies
const ECB_API_URL = 'https://api.exchangerate-api.com/v4/latest/PLN';

// ============================================================================
// FX RATE SYNCHRONIZATION
// ============================================================================

/**
 * Syncs FX rates daily from external oracle (ECB/Wise)
 * Scheduled to run daily at 00:00 UTC
 */
export const syncFXRates = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      console.log('Starting FX rate synchronization...');
      
      // Fetch latest rates from ECB API
      const response = await axios.get(ECB_API_URL);
      const rates = response.data.rates;
      
      const batch = db.batch();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      
      // Store rates for each supported currency
      for (const currency of SUPPORTED_CURRENCIES) {
        if (currency === 'PLN') continue; // PLN is base currency
        
        const rate = rates[currency];
        if (!rate) {
          console.warn(`Rate not found for ${currency}`);
          continue;
        }
        
        const rateDoc = db.collection('fxRates').doc(`PLN_${currency}`);
        batch.set(rateDoc, {
          baseCurrency: 'PLN',
          targetCurrency: currency,
          rate: rate,
          inverseRate: 1 / rate,
          source: 'ECB',
          timestamp: timestamp,
          updatedAt: timestamp
        });
      }
      
      await batch.commit();
      console.log(`Successfully synced ${SUPPORTED_CURRENCIES.length - 1} FX rates`);
      
      // Log to audit trail
      await db.collection('financialAuditLogs').add({
        type: 'fx_sync',
        action: 'sync_rates',
        currenciesUpdated: SUPPORTED_CURRENCIES.filter(c => c !== 'PLN'),
        timestamp: timestamp,
        success: true
      });
      
    } catch (error) {
      console.error('Error syncing FX rates:', error);
      
      // Log error to audit trail
      await db.collection('financialAuditLogs').add({
        type: 'fx_sync',
        action: 'sync_rates',
        error: error.message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        success: false
      });
      
      throw error;
    }
  });

/**
 * Manual trigger for FX rate sync (for testing/admin use)
 */
export const pack390_syncFXRates = functions.https.onCall(async (data, context) => {
  // Only admins can manually trigger
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can sync FX rates');
  }
  
  try {
    // Fetch latest rates
    const response = await axios.get(ECB_API_URL);
    const rates = response.data.rates;
    
    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    for (const currency of SUPPORTED_CURRENCIES) {
      if (currency === 'PLN') continue;
      
      const rate = rates[currency];
      if (!rate) continue;
      
      const rateDoc = db.collection('fxRates').doc(`PLN_${currency}`);
      batch.set(rateDoc, {
        baseCurrency: 'PLN',
        targetCurrency: currency,
        rate: rate,
        inverseRate: 1 / rate,
        source: 'ECB',
        timestamp: timestamp,
        updatedAt: timestamp,
        triggeredBy: context.auth.uid
      });
    }
    
    await batch.commit();
    
    return {
      success: true,
      message: `Synced ${SUPPORTED_CURRENCIES.length - 1} currency rates`,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Manual FX sync error:', error);
    throw new functions.https.HttpsError('internal', `Failed to sync rates: ${error.message}`);
  }
});

// ============================================================================
// CURRENCY CONVERSION
// ============================================================================

/**
 * Convert tokens to fiat currency
 */
export const pack390_convertTokenToFiat = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { tokens, targetCurrency } = data;
  
  // Validation
  if (typeof tokens !== 'number' || tokens <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid token amount');
  }
  
  if (!SUPPORTED_CURRENCIES.includes(targetCurrency)) {
    throw new functions.https.HttpsError('invalid-argument', `Currency ${targetCurrency} not supported`);
  }
  
  try {
    // Calculate PLN value (base)
    const plnValue = tokens * BASE_TOKEN_VALUE_PLN;
    
    if (targetCurrency === 'PLN') {
      return {
        tokens,
        currency: 'PLN',
        amount: plnValue,
        rate: BASE_TOKEN_VALUE_PLN,
        timestamp: new Date().toISOString()
      };
    }
    
    // Get current FX rate
    const rateDoc = await db.collection('fxRates').doc(`PLN_${targetCurrency}`).get();
    
    if (!rateDoc.exists) {
      throw new functions.https.HttpsError('not-found', `FX rate for ${targetCurrency} not found`);
    }
    
    const fxRate = rateDoc.data()!.rate;
    const fiatAmount = plnValue * fxRate;
    
    // Log conversion
    await db.collection('currencyConversions').add({
      userId: context.auth.uid,
      fromAmount: tokens,
      fromCurrency: 'TOKENS',
      toAmount: fiatAmount,
      toCurrency: targetCurrency,
      plnIntermediate: plnValue,
      fxRate: fxRate,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      tokens,
      currency: targetCurrency,
      amount: Math.round(fiatAmount * 100) / 100, // Round to 2 decimals
      plnValue,
      fxRate,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Token to fiat conversion error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Convert fiat currency to tokens
 */
export const pack390_convertFiatToTokens = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, currency } = data;
  
  // Validation
  if (typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new functions.https.HttpsError('invalid-argument', `Currency ${currency} not supported`);
  }
  
  try {
    let plnValue = amount;
    
    // Convert to PLN first if needed
    if (currency !== 'PLN') {
      const rateDoc = await db.collection('fxRates').doc(`PLN_${currency}`).get();
      
      if (!rateDoc.exists) {
        throw new functions.https.HttpsError('not-found', `FX rate for ${currency} not found`);
      }
      
      const inverseRate = rateDoc.data()!.inverseRate;
      plnValue = amount * inverseRate;
    }
    
    // Convert PLN to tokens
    const tokens = Math.floor(plnValue / BASE_TOKEN_VALUE_PLN);
    
    // Log conversion
    await db.collection('currencyConversions').add({
      userId: context.auth.uid,
      fromAmount: amount,
      fromCurrency: currency,
      toAmount: tokens,
      toCurrency: 'TOKENS',
      plnIntermediate: plnValue,
      tokenRate: BASE_TOKEN_VALUE_PLN,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      amount,
      currency,
      tokens,
      plnValue,
      tokenRate: BASE_TOKEN_VALUE_PLN,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Fiat to token conversion error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// GET CURRENT RATES
// ============================================================================

/**
 * Get current FX rates for all supported currencies
 */
export const pack390_getCurrentRates = functions.https.onCall(async (data, context) => {
  try {
    const ratesSnapshot = await db.collection('fxRates')
      .where('baseCurrency', '==', 'PLN')
      .orderBy('timestamp', 'desc')
      .get();
    
    const rates: any = {
      PLN: {
        rate: 1,
        tokenValue: BASE_TOKEN_VALUE_PLN,
        currency: 'PLN'
      }
    };
    
    ratesSnapshot.forEach(doc => {
      const data = doc.data();
      rates[data.targetCurrency] = {
        rate: data.rate,
        tokenValue: BASE_TOKEN_VALUE_PLN * data.rate,
        currency: data.targetCurrency,
        lastUpdated: data.timestamp
      };
    });
    
    return {
      rates,
      baseTokenValue: BASE_TOKEN_VALUE_PLN,
      baseCurrency: 'PLN',
      supportedCurrencies: SUPPORTED_CURRENCIES
    };
    
  } catch (error) {
    console.error('Error getting current rates:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get FX rate for specific currency pair
 */
export const pack390_getRate = functions.https.onCall(async (data, context) => {
  const { from, to } = data;
  
  if (!from || !to) {
    throw new functions.https.HttpsError('invalid-argument', 'Both from and to currencies required');
  }
  
  // If same currency
  if (from === to) {
    return { rate: 1, from, to };
  }
  
  try {
    // Direct rate
    const directRate = await db.collection('fxRates').doc(`${from}_${to}`).get();
    if (directRate.exists) {
      return {
        rate: directRate.data()!.rate,
        from,
        to,
        lastUpdated: directRate.data()!.timestamp
      };
    }
    
    // Inverse rate
    const inverseRate = await db.collection('fxRates').doc(`${to}_${from}`).get();
    if (inverseRate.exists) {
      return {
        rate: inverseRate.data()!.inverseRate,
        from,
        to,
        lastUpdated: inverseRate.data()!.timestamp
      };
    }
    
    throw new functions.https.HttpsError('not-found', `Rate for ${from}/${to} not found`);
    
  } catch (error) {
    console.error('Error getting rate:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
