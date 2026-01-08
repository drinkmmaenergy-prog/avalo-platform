/**
 * PACK 425 — Pricing & Payment Matrix
 * Multi-currency token pricing and payment provider mapping
 */

import * as admin from 'firebase-admin';

export interface CurrencyInfo {
  code: string;           // PLN, EUR, USD, MXN, BRL, INR, AED...
  symbol: string;         // zł, €, $, R$, ₹, د.إ...
  name: string;           // Polish Zloty, Euro, US Dollar...
  decimals: number;       // 2 for most, 0 for JPY, KRW...
  conversionRateToPLN: number; // Base conversion rate to PLN
}

export interface TokenPackPricing {
  packId: string;
  tokens: number;
  basePricePLN: number;  // Base price in PLN
  localizedPrices: {
    [currencyCode: string]: number;
  };
  discount?: number;     // Percentage discount if any
}

export interface PaymentProviderConfig {
  provider: 'stripe' | 'android-billing' | 'apple-iap' | 'local';
  enabled: boolean;
  supportedCurrencies: string[];
  minTransactionAmount?: number;
  maxTransactionAmount?: number;
  fees?: {
    fixed: number;      // Fixed fee in local currency
    percentage: number; // Percentage fee
  };
}

export interface CountryPaymentProfile {
  countryCode: string;
  currency: string;
  
  // Payment providers available
  paymentProviders: PaymentProviderConfig[];
  
  // Token pricing
  tokenPacks: TokenPackPricing[];
  
  // Payout configuration
  payoutEnabled: boolean;
  payoutMinimumThreshold: number;  // Minimum tokens to cash out
  payoutCurrency: string;
  payoutProviders: string[];       // 'stripe', 'paypal', 'wire', 'local'
  
  // Purchasing power adjustment
  purchasingPowerIndex: number;    // 1.0 = base (Poland), >1 = higher, <1 = lower
  
  // Legal restrictions
  monetizationRestricted: boolean;
  taxWithholdingRequired: boolean;
  
  updatedAt: FirebaseFirestore.Timestamp;
}

// Standard token conversion rate
export const TOKEN_TO_PLN_RATE = 0.2; // 1 token = 0.20 PLN

// Currency database (simplified - in production use forex API)
export const CURRENCIES: { [code: string]: CurrencyInfo } = {
  PLN: { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', decimals: 2, conversionRateToPLN: 1.0 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, conversionRateToPLN: 4.3 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, conversionRateToPLN: 4.0 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, conversionRateToPLN: 5.0 },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2, conversionRateToPLN: 4.5 },
  
  MXN: { code: 'MXN', symbol: '$', name: 'Mexican Peso', decimals: 2, conversionRateToPLN: 0.23 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2, conversionRateToPLN: 0.8 },
  ARS: { code: 'ARS', symbol: '$', name: 'Argentine Peso', decimals: 2, conversionRateToPLN: 0.004 },
  
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2, conversionRateToPLN: 1.09 },
  SAR: { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimals: 2, conversionRateToPLN: 1.07 },
  
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, conversionRateToPLN: 0.048 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, conversionRateToPLN: 0.027 },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0, conversionRateToPLN: 0.003 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2, conversionRateToPLN: 0.55 },
  
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, conversionRateToPLN: 2.6 },
  NZD: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2, conversionRateToPLN: 2.4 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2, conversionRateToPLN: 3.0 },
};

// Standard token pack sizes
export const STANDARD_TOKEN_PACKS = [
  { packId: 'small', tokens: 100, basePricePLN: 20 },
  { packId: 'medium', tokens: 500, basePricePLN: 95, discount: 5 },
  { packId: 'large', tokens: 1000, basePricePLN: 180, discount: 10 },
  { packId: 'xlarge', tokens: 2500, basePricePLN: 425, discount: 15 },
  { packId: 'mega', tokens: 5000, basePricePLN: 800, discount: 20 },
];

/**
 * Convert PLN amount to target currency
 */
export function convertPLNToCurrency(amountPLN: number, targetCurrency: string): number {
  const currency = CURRENCIES[targetCurrency];
  if (!currency) {
    throw new Error(`Unknown currency: ${targetCurrency}`);
  }
  
  const converted = amountPLN / currency.conversionRateToPLN;
  
  // Round to appropriate decimals
  return Math.round(converted * Math.pow(10, currency.decimals)) / Math.pow(10, currency.decimals);
}

/**
 * Convert currency amount to PLN
 */
export function convertCurrencyToPLN(amount: number, sourceCurrency: string): number {
  const currency = CURRENCIES[sourceCurrency];
  if (!currency) {
    throw new Error(`Unknown currency: ${sourceCurrency}`);
  }
  
  return amount * currency.conversionRateToPLN;
}

/**
 * Calculate localized token pack prices
 */
export function calculateLocalizedPricing(
  basePacks: typeof STANDARD_TOKEN_PACKS,
  targetCurrency: string,
  purchasingPowerIndex: number = 1.0
): TokenPackPricing[] {
  return basePacks.map(pack => {
    const adjustedPrice = pack.basePricePLN * purchasingPowerIndex;
    const localPrice = convertPLNToCurrency(adjustedPrice, targetCurrency);
    
    return {
      packId: pack.packId,
      tokens: pack.tokens,
      basePricePLN: pack.basePricePLN,
      localizedPrices: {
        [targetCurrency]: localPrice,
      },
      discount: pack.discount,
    };
  });
}

/**
 * Get payment profile for a country
 */
export async function getCountryPaymentProfile(
  countryCode: string
): Promise<CountryPaymentProfile | null> {
  const db = admin.firestore();
  const doc = await db.collection('countryPayments').doc(countryCode).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as CountryPaymentProfile;
}

/**
 * Create payment profile for a country
 */
export async function createCountryPaymentProfile(
  countryCode: string,
  currency: string,
  options: {
    purchasingPowerIndex?: number;
    payoutEnabled?: boolean;
    monetizationRestricted?: boolean;
    customProviders?: PaymentProviderConfig[];
  } = {}
): Promise<CountryPaymentProfile> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const purchasingPowerIndex = options.purchasingPowerIndex ?? 1.0;
  
  // Default payment providers
  const paymentProviders: PaymentProviderConfig[] = options.customProviders ?? [
    {
      provider: 'stripe',
      enabled: true,
      supportedCurrencies: [currency],
      fees: { fixed: 0, percentage: 2.9 },
    },
    {
      provider: 'android-billing',
      enabled: true,
      supportedCurrencies: [currency],
      fees: { fixed: 0, percentage: 15 },
    },
    {
      provider: 'apple-iap',
      enabled: true,
      supportedCurrencies: [currency],
      fees: { fixed: 0, percentage: 15 },
    },
  ];
  
  // Calculate localized token packs
  const tokenPacks = calculateLocalizedPricing(
    STANDARD_TOKEN_PACKS,
    currency,
    purchasingPowerIndex
  );
  
  const profile: CountryPaymentProfile = {
    countryCode,
    currency,
    paymentProviders,
    tokenPacks,
    payoutEnabled: options.payoutEnabled ?? true,
    payoutMinimumThreshold: 1000, // 1000 tokens = 200 PLN
    payoutCurrency: currency,
    payoutProviders: ['stripe'],
    purchasingPowerIndex,
    monetizationRestricted: options.monetizationRestricted ?? false,
    taxWithholdingRequired: false,
    updatedAt: now,
  };
  
  await db.collection('countryPayments').doc(countryCode).set(profile);
  
  return profile;
}

/**
 * Update token pack pricing for a country
 */
export async function updateTokenPricing(
  countryCode: string,
  tokenPacks: TokenPackPricing[]
): Promise<void> {
  const db = admin.firestore();
  await db.collection('countryPayments').doc(countryCode).update({
    tokenPacks,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Enable/disable payout for a country
 */
export async function setPayoutStatus(
  countryCode: string,
  enabled: boolean
): Promise<void> {
  const db = admin.firestore();
  await db.collection('countryPayments').doc(countryCode).update({
    payoutEnabled: enabled,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Get token pack price for a specific country and pack
 */
export async function getTokenPackPrice(
  countryCode: string,
  packId: string
): Promise<{ currency: string; price: number } | null> {
  const profile = await getCountryPaymentProfile(countryCode);
  if (!profile) return null;
  
  const pack = profile.tokenPacks.find(p => p.packId === packId);
  if (!pack) return null;
  
  const price = pack.localizedPrices[profile.currency];
  if (price === undefined) return null;
  
  return {
    currency: profile.currency,
    price,
  };
}

/**
 * Check if monetization is allowed in a country
 */
export async function isMonetizationAllowed(countryCode: string): Promise<boolean> {
  const profile = await getCountryPaymentProfile(countryCode);
  if (!profile) return false;
  
  return !profile.monetizationRestricted;
}

/**
 * Check if payout is enabled in a country
 */
export async function isPayoutEnabled(countryCode: string): Promise<boolean> {
  const profile = await getCountryPaymentProfile(countryCode);
  if (!profile) return false;
  
  return profile.payoutEnabled;
}

/**
 * Get all payment profiles
 */
export async function getAllPaymentProfiles(): Promise<CountryPaymentProfile[]> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryPayments').get();
  return snapshot.docs.map(doc => doc.data() as CountryPaymentProfile);
}

/**
 * Calculate creator payout in local currency
 */
export async function calculateCreatorPayout(
  countryCode: string,
  tokens: number
): Promise<{ currency: string; amount: number; eligible: boolean } | null> {
  const profile = await getCountryPaymentProfile(countryCode);
  if (!profile) return null;
  
  const eligible = profile.payoutEnabled && tokens >= profile.payoutMinimumThreshold;
  
  if (!eligible) {
    return {
      currency: profile.currency,
      amount: 0,
      eligible: false,
    };
  }
  
  // Convert tokens to PLN, then to local currency
  const amountPLN = tokens * TOKEN_TO_PLN_RATE;
  const localAmount = convertPLNToCurrency(amountPLN, profile.currency);
  
  return {
    currency: profile.currency,
    amount: localAmount,
    eligible: true,
  };
}

/**
 * Bulk update purchasing power index for multiple countries
 */
export async function bulkUpdatePurchasingPower(
  updates: Array<{ countryCode: string; purchasingPowerIndex: number }>
): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();
  const now = admin.firestore.Timestamp.now();
  
  for (const { countryCode, purchasingPowerIndex } of updates) {
    const profile = await getCountryPaymentProfile(countryCode);
    if (!profile) continue;
    
    // Recalculate pricing
    const tokenPacks = calculateLocalizedPricing(
      STANDARD_TOKEN_PACKS,
      profile.currency,
      purchasingPowerIndex
    );
    
    const ref = db.collection('countryPayments').doc(countryCode);
    batch.update(ref, {
      purchasingPowerIndex,
      tokenPacks,
      updatedAt: now,
    });
  }
  
  await batch.commit();
}
