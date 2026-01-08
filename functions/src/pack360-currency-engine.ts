/**
 * PACK 360 - Currency Engine
 * Multi-currency display with local fiat presentation
 * Internal accounting always in tokens
 * 
 * Dependencies: PACK 277 (Wallet), PACK 280 (Membership)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

// Types
export interface CurrencyProfile {
  countryCode: string;
  currency: string; // PLN, EUR, USD, GBP
  symbol: string;
  exchangeRate: number; // Rate to USD
  lastUpdate: number;
  enabled: boolean;
}

export interface TokenPriceConfig {
  tokenId: string; // "basic", "premium", "vip"
  baseUSD: number; // Base price in USD
  tokenAmount: number;
  localPrices: Record<string, number>; // currency -> price
}

export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  convertedAmount: number;
  rate: number;
  timestamp: number;
}

// Supported currencies configuration
const SUPPORTED_CURRENCIES: Record<string, Omit<CurrencyProfile, 'exchangeRate' | 'lastUpdate'>> = {
  USD: { countryCode: 'US', currency: 'USD', symbol: '$', enabled: true },
  EUR: { countryCode: 'EU', currency: 'EUR', symbol: '€', enabled: true },
  GBP: { countryCode: 'GB', currency: 'GBP', symbol: '£', enabled: true },
  PLN: { countryCode: 'PL', currency: 'PLN', symbol: 'zł', enabled: true },
  CHF: { countryCode: 'CH', currency: 'CHF', symbol: 'CHF', enabled: true },
  SEK: { countryCode: 'SE', currency: 'SEK', symbol: 'kr', enabled: true },
  NOK: { countryCode: 'NO', currency: 'NOK', symbol: 'kr', enabled: true },
  DKK: { countryCode: 'DK', currency: 'DKK', symbol: 'kr', enabled: true },
  JPY: { countryCode: 'JP', currency: 'JPY', symbol: '¥', enabled: true },
  CNY: { countryCode: 'CN', currency: 'CNY', symbol: '¥', enabled: true },
  KRW: { countryCode: 'KR', currency: 'KRW', symbol: '₩', enabled: true },
  AUD: { countryCode: 'AU', currency: 'AUD', symbol: 'A$', enabled: true },
  CAD: { countryCode: 'CA', currency: 'CAD', symbol: 'C$', enabled: true },
  NZD: { countryCode: 'NZ', currency: 'NZD', symbol: 'NZ$', enabled: true },
  SGD: { countryCode: 'SG', currency: 'SGD', symbol: 'S$', enabled: true },
  HKD: { countryCode: 'HK', currency: 'HKD', symbol: 'HK$', enabled: true },
  INR: { countryCode: 'IN', currency: 'INR', symbol: '₹', enabled: true },
  BRL: { countryCode: 'BR', currency: 'BRL', symbol: 'R$', enabled: true },
  MXN: { countryCode: 'MX', currency: 'MXN', symbol: 'MX$', enabled: true },
  ARS: { countryCode: 'AR', currency: 'ARS', symbol: 'AR$', enabled: true },
  CZK: { countryCode: 'CZ', currency: 'CZK', symbol: 'Kč', enabled: true },
  HUF: { countryCode: 'HU', currency: 'HUF', symbol: 'Ft', enabled: true },
  ILS: { countryCode: 'IL', currency: 'ILS', symbol: '₪', enabled: true },
  AED: { countryCode: 'AE', currency: 'AED', symbol: 'د.إ', enabled: true },
  SAR: { countryCode: 'SA', currency: 'SAR', symbol: 'ر.س', enabled: true },
  TRY: { countryCode: 'TR', currency: 'TRY', symbol: '₺', enabled: true },
  ZAR: { countryCode: 'ZA', currency: 'ZAR', symbol: 'R', enabled: true },
  THB: { countryCode: 'TH', currency: 'THB', symbol: '฿', enabled: true },
  MYR: { countryCode: 'MY', currency: 'MYR', symbol: 'RM', enabled: true },
  IDR: { countryCode: 'ID', currency: 'IDR', symbol: 'Rp', enabled: true },
  PHP: { countryCode: 'PH', currency: 'PHP', symbol: '₱', enabled: true },
  VND: { countryCode: 'VN', currency: 'VND', symbol: '₫', enabled: true }
};

// Country to primary currency mapping
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD',
  PL: 'PLN', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR',
  FI: 'EUR', GR: 'EUR', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CH: 'CHF', JP: 'JPY', CN: 'CNY', KR: 'KRW', SG: 'SGD',
  HK: 'HKD', IN: 'INR', BR: 'BRL', MX: 'MXN', AR: 'ARS',
  CZ: 'CZK', HU: 'HUF', IL: 'ILS', AE: 'AED', SA: 'SAR',
  TR: 'TRY', ZA: 'ZAR', TH: 'THB', MY: 'MYR', ID: 'IDR',
  PH: 'PHP', VN: 'VND'
};

// Update exchange rates (scheduled every 6 hours)
export const updateExchangeRates = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const db = admin.firestore();
    
    try {
      // Fetch exchange rates from external API (e.g., exchangerate-api.com)
      // Using a free API endpoint - in production, use a paid service for reliability
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
      const rates = response.data.rates;
      
      const batch = db.batch();
      const timestamp = Date.now();
      
      // Update each currency's exchange rate
      for (const [currencyCode, config] of Object.entries(SUPPORTED_CURRENCIES)) {
        if (rates[currencyCode]) {
          const currencyProfile: CurrencyProfile = {
            ...config,
            exchangeRate: rates[currencyCode],
            lastUpdate: timestamp
          };
          
          const ref = db.collection('currency-rates').doc(currencyCode);
          batch.set(ref, currencyProfile);
        }
      }
      
      await batch.commit();
      
      // Update system config
      await db.collection('system').doc('currency-config').set({
        lastRateUpdate: timestamp,
        ratesSource: 'exchangerate-api.com',
        baseCurrency: 'USD'
      }, { merge: true });
      
      console.log('Exchange rates updated successfully');
      return { success: true, timestamp };
    } catch (error) {
      console.error('Error updating exchange rates:', error);
      return { success: false, error };
    }
  });

// Get user currency based on country
export const getUserCurrency = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Check for manual currency preference
    const prefDoc = await db.collection('user-currency-preferences').doc(userId).get();
    if (prefDoc.exists) {
      const currency = prefDoc.data()?.currency;
      const rateDoc = await db.collection('currency-rates').doc(currency).get();
      return {
        success: true,
        currency,
        ...rateDoc.data()
      };
    }
    
    // Auto-detect from country
    const country = userData?.country || data.countryCode || 'US';
    const currency = COUNTRY_TO_CURRENCY[country.toUpperCase()] || 'USD';
    
    // Get current rate
    const rateDoc = await db.collection('currency-rates').doc(currency).get();
    
    return {
      success: true,
      currency,
      autoDetected: true,
      ...rateDoc.data()
    };
  } catch (error: any) {
    console.error('Error getting user currency:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Set user currency preference (manual)
export const setUserCurrency = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { currency } = data;
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Validate currency is supported
    if (!SUPPORTED_CURRENCIES[currency]) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported currency');
    }
    
    // Save preference
    await db.collection('user-currency-preferences').doc(userId).set({
      userId,
      currency,
      manual: true,
      lastUpdated: Date.now()
    });
    
    return { success: true, currency };
  } catch (error: any) {
    console.error('Error setting user currency:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Convert token price to local currency
export const convertTokenPriceToLocal = functions.https.onCall(async (data, context) => {
  try {
    const { tokenPackage, currency } = data;
    const db = admin.firestore();
    
    // Get token package configuration
    const packageDoc = await db.collection('token-packages').doc(tokenPackage).get();
    if (!packageDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Token package not found');
    }
    
    const packageData = packageDoc.data() as TokenPriceConfig;
    const baseUSD = packageData.baseUSD;
    
    // Get exchange rate
    const rateDoc = await db.collection('currency-rates').doc(currency).get();
    if (!rateDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Currency not supported');
    }
    
    const rate = rateDoc.data()?.exchangeRate || 1;
    const localPrice = baseUSD * rate;
    
    // Apply regional pricing adjustments if configured
    const adjustmentDoc = await db.collection('regional-pricing-adjustments').doc(currency).get();
    let finalPrice = localPrice;
    
    if (adjustmentDoc.exists) {
      const adjustment = adjustmentDoc.data()?.multiplier || 1;
      finalPrice = localPrice * adjustment;
    }
    
    // Round to appropriate decimal places based on currency
    const decimals = ['JPY', 'KRW', 'VND', 'IDR'].includes(currency) ? 0 : 2;
    finalPrice = Math.round(finalPrice * Math.pow(10, decimals)) / Math.pow(10, decimals);
    
    return {
      success: true,
      tokenPackage,
      currency,
      baseUSD,
      exchangeRate: rate,
      localPrice: finalPrice,
      tokenAmount: packageData.tokenAmount
    };
  } catch (error: any) {
    console.error('Error converting token price:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Convert payout to local currency (for creator earnings preview)
export const convertPayoutToLocal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { tokenAmount, currency } = data;
    const db = admin.firestore();
    
    // Get token to USD conversion rate
    const tokenValueDoc = await db.collection('system').doc('token-config').get();
    const tokenValueUSD = tokenValueDoc.data()?.valueUSD || 0.01; // Default: 1 token = $0.01
    
    const amountUSD = tokenAmount * tokenValueUSD;
    
    // Get exchange rate
    const rateDoc = await db.collection('currency-rates').doc(currency).get();
    if (!rateDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Currency not supported');
    }
    
    const rate = rateDoc.data()?.exchangeRate || 1;
    const localAmount = amountUSD * rate;
    
    // Round to appropriate decimal places
    const decimals = ['JPY', 'KRW', 'VND', 'IDR'].includes(currency) ? 0 : 2;
    const finalAmount = Math.round(localAmount * Math.pow(10, decimals)) / Math.pow(10, decimals);
    
    return {
      success: true,
      tokenAmount,
      currency,
      amountUSD,
      exchangeRate: rate,
      localAmount: finalAmount,
      symbol: SUPPORTED_CURRENCIES[currency]?.symbol || currency
    };
  } catch (error: any) {
    console.error('Error converting payout:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get all supported currencies
export const getSupportedCurrencies = functions.https.onCall(async (data, context) => {
  try {
    const db = admin.firestore();
    
    // Get current rates
    const snapshot = await db.collection('currency-rates').get();
    const currencies: CurrencyProfile[] = [];
    
    snapshot.forEach((doc: any) => {
      const data = doc.data() as CurrencyProfile;
      if (data.enabled) {
        currencies.push(data);
      }
    });
    
    return {
      success: true,
      currencies: currencies.sort((a, b) => a.currency.localeCompare(b.currency))
    };
  } catch (error: any) {
    console.error('Error getting supported currencies:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Set regional pricing adjustment
export const adminSetRegionalPricing = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { currency, multiplier, reason } = data;
    
    if (multiplier <= 0 || multiplier > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Multiplier must be between 0 and 5');
    }
    
    await db.collection('regional-pricing-adjustments').doc(currency).set({
      currency,
      multiplier,
      reason: reason || 'Regional pricing adjustment',
      updatedBy: context.auth.uid,
      lastUpdated: Date.now()
    });
    
    return { success: true, currency, multiplier };
  } catch (error: any) {
    console.error('Error setting regional pricing:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Toggle currency support
export const adminToggleCurrency = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { currency, enabled } = data;
    
    // Can't disable USD
    if (currency === 'USD') {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot disable USD');
    }
    
    await db.collection('currency-rates').doc(currency).update({
      enabled,
      lastUpdated: Date.now()
    });
    
    return { success: true, currency, enabled };
  } catch (error: any) {
    console.error('Error toggling currency:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Format currency for display
export const formatCurrency = functions.https.onCall(async (data, context) => {
  try {
    const { amount, currency } = data;
    
    if (!SUPPORTED_CURRENCIES[currency]) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported currency');
    }
    
    const config = SUPPORTED_CURRENCIES[currency];
    const decimals = ['JPY', 'KRW', 'VND', 'IDR'].includes(currency) ? 0 : 2;
    
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(amount);
    
    return {
      success: true,
      formatted: `${config.symbol}${formatted}`,
      amount,
      currency,
      symbol: config.symbol
    };
  } catch (error: any) {
    console.error('Error formatting currency:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Initialize currency rates on first deployment
export const initializeCurrencyRates = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    // Fetch initial rates
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const rates = response.data.rates;
    
    const batch = db.batch();
    const timestamp = Date.now();
    
    for (const [currencyCode, config] of Object.entries(SUPPORTED_CURRENCIES)) {
      const currencyProfile: CurrencyProfile = {
        ...config,
        exchangeRate: rates[currencyCode] || 1,
        lastUpdate: timestamp
      };
      
      const ref = db.collection('currency-rates').doc(currencyCode);
      batch.set(ref, currencyProfile);
    }
    
    await batch.commit();
    
    return { success: true, message: 'Currency rates initialized' };
  } catch (error: any) {
    console.error('Error initializing currency rates:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
