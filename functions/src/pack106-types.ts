/**
 * PACK 106 — Multi-Currency Price Indexing & Localized Payments Types
 * 
 * Type definitions for:
 * - Currency profiles (FX rates, tax rules)
 * - Localized storefronts
 * - PSP routing
 * - Currency conversion audit
 * 
 * NON-NEGOTIABLE RULES:
 * - Token base price is FIXED (never changes dynamically)
 * - 65/35 revenue split remains untouched
 * - No discounts, bonuses, cashback, or promo codes
 * - Currency conversion is for display only
 * - All prices are token-equivalent (no hidden benefits)
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CURRENCY PROFILES
// ============================================================================

/**
 * Currency profile with FX rates and tax rules
 * Stored in: currency_profiles collection
 */
export interface CurrencyProfile {
  /** ISO 4217 currency code */
  code: string;
  
  /** Currency symbol for display */
  symbol: string;
  
  /** Full currency name */
  name: string;
  
  /** Exchange rate: BASE_CURRENCY → this currency */
  fxRate: number;
  
  /** Whether VAT/tax must be included in displayed price */
  taxIncluded: boolean;
  
  /** Tax rate (0-1) if applicable */
  taxRate: number;
  
  /** Decimal places for display (e.g., 2 for USD, 0 for JPY) */
  decimalPlaces: number;
  
  /** Whether this currency is actively supported */
  enabled: boolean;
  
  /** PSP that supports this currency */
  supportedPSPs: Array<'STRIPE' | 'WISE'>;
  
  /** Last update timestamp */
  updatedAt: Timestamp;
  
  /** Source of FX rate (stripe, ecb, manual) */
  fxSource?: string;
  
  /** Additional metadata */
  metadata?: {
    /** Countries that primarily use this currency */
    countries?: string[];
    /** Regional notes */
    notes?: string;
  };
}

// ============================================================================
// BASE TOKEN PRICING
// ============================================================================

/**
 * Global base token price configuration
 * This is FIXED and should only be changed via admin 2-key approval
 */
export interface BaseTokenPriceConfig {
  /** Base price in reference currency (EUR) */
  basePriceEUR: number;
  
  /** Reference currency code */
  referenceCurrency: 'EUR' | 'USD';
  
  /** Last updated */
  updatedAt: Timestamp;
  
  /** Who updated (admin ID) */
  updatedBy?: string;
  
  /** Approval signatures (2-key system) */
  approvals?: {
    admin1: string;
    admin2: string;
    timestamp: Timestamp;
  };
}

// ============================================================================
// LOCALIZED STOREFRONT
// ============================================================================

/**
 * Token bundle configuration (fixed token amounts)
 */
export interface TokenBundle {
  /** Number of tokens */
  tokens: number;
  
  /** Price in local currency */
  price: number;
  
  /** Currency code */
  currency: string;
  
  /** Price including tax (if applicable) */
  priceWithTax?: number;
  
  /** Tax amount */
  taxAmount?: number;
  
  /** Display label */
  label: string;
  
  /** Save percentage display (optional, for UI only) */
  popularBadge?: boolean;
}

/**
 * Localized storefront for a specific currency
 */
export interface LocalizedStorefront {
  /** Currency code */
  currency: string;
  
  /** Currency symbol */
  symbol: string;
  
  /** Available token bundles */
  bundles: TokenBundle[];
  
  /** Whether tax is included in prices */
  taxIncluded: boolean;
  
  /** Tax rate (if applicable) */
  taxRate?: number;
  
  /** Tax jurisdiction label */
  taxJurisdiction?: string;
  
  /** FX rate used for conversion */
  fxRate: number;
  
  /** Base token price used */
  baseTokenPrice: number;
  
  /** Timestamp of rate used */
  rateTimestamp: Timestamp;
  
  /** PSP that will process payment */
  preferredPSP: 'STRIPE' | 'WISE';
}

// ============================================================================
// USER CURRENCY PREFERENCES
// ============================================================================

/**
 * User's selected currency preference
 * Stored in: users/{uid}/currency_preference
 */
export interface UserCurrencyPreference {
  /** User ID */
  userId: string;
  
  /** Selected currency code */
  currency: string;
  
  /** When currency was set */
  setAt: Timestamp;
  
  /** Last change timestamp */
  lastChangedAt?: Timestamp;
  
  /** Change cooldown expiry (90 days from last change) */
  canChangeAfter?: Timestamp;
  
  /** Auto-detected from location */
  autoDetected: boolean;
  
  /** IP country code at time of selection */
  countryCode?: string;
}

// ============================================================================
// CURRENCY CONVERSION AUDIT
// ============================================================================

/**
 * Audit log for currency conversion events
 * Integrates with PACK 105 business_audit_log
 */
export interface CurrencyConversionAudit {
  /** Unique event ID */
  id: string;
  
  /** Event type */
  eventType: 'CURRENCY_CONVERSION_FOR_PURCHASE';
  
  /** User ID */
  userId: string;
  
  /** Originating currency */
  originatingCurrency: string;
  
  /** Target currency (always tokens internally) */
  targetCurrency: 'TOKENS';
  
  /** FX rate applied */
  fxRateApplied: number;
  
  /** Amount in originating currency */
  originatingAmount: number;
  
  /** Token amount purchased */
  tokensAmount: number;
  
  /** PSP used */
  pspUsed: 'STRIPE' | 'WISE';
  
  /** Transaction ID from PSP */
  pspTransactionId?: string;
  
  /** Timestamp */
  createdAt: Timestamp;
  
  /** Source of FX rate */
  fxSource: string;
  
  /** Additional context */
  context?: Record<string, any>;
}

// ============================================================================
// PSP ROUTING
// ============================================================================

/**
 * PSP routing decision for a payment
 */
export interface PSPRoutingDecision {
  /** Selected PSP */
  psp: 'STRIPE' | 'WISE' | 'FALLBACK';
  
  /** Currency to charge */
  chargeCurrency: string;
  
  /** Amount to charge */
  chargeAmount: number;
  
  /** Reason for routing decision */
  reason: string;
  
  /** Whether currency is fully supported */
  nativeSupport: boolean;
  
  /** FX conversion applied by PSP (if any) */
  pspFxConversion?: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
  };
  
  /** Disclosure message for user */
  disclosureMessage?: string;
}

// ============================================================================
// ADMIN ENDPOINTS TYPES
// ============================================================================

/**
 * Currency profile update request
 */
export interface UpdateCurrencyProfileRequest {
  code: string;
  taxIncluded?: boolean;
  taxRate?: number;
  enabled?: boolean;
  supportedPSPs?: Array<'STRIPE' | 'WISE'>;
  metadata?: Record<string, any>;
}

/**
 * Set base token price request (2-key approval required)
 */
export interface SetBaseTokenPriceRequest {
  basePriceEUR: number;
  reason: string;
  approver1: string;
  approver2: string;
}

/**
 * Currency management dashboard stats
 */
export interface CurrencyDashboardStats {
  /** Total active currencies */
  activeCurrencies: number;
  
  /** Currencies pending FX update */
  staleRates: number;
  
  /** Last FX refresh timestamp */
  lastRefresh: Timestamp;
  
  /** Top currencies by transaction volume */
  topCurrencies: Array<{
    code: string;
    transactions: number;
    volume: number;
  }>;
  
  /** FX variance warnings */
  fxVarianceWarnings: Array<{
    currency: string;
    expectedRate: number;
    actualRate: number;
    variance: number;
  }>;
}

// ============================================================================
// STANDARD TOKEN BUNDLES
// ============================================================================

/**
 * Standard token bundle sizes (fixed, no bulk discounts)
 */
export const STANDARD_TOKEN_BUNDLES = [
  { tokens: 50, popular: false },
  { tokens: 100, popular: false },
  { tokens: 200, popular: true },  // Popular badge for UX only
  { tokens: 500, popular: false },
  { tokens: 1000, popular: false },
] as const;

/**
 * Base token price in EUR (FIXED, only changeable via admin 2-key)
 * Example: €0.25 per token
 */
export const BASE_TOKEN_PRICE_EUR = 0.25;

/**
 * Reference currency
 */
export const REFERENCE_CURRENCY = 'EUR';

// ============================================================================
// SUPPORTED CURRENCIES
// ============================================================================

/**
 * Major supported currencies with metadata
 */
export const SUPPORTED_CURRENCIES = {
  EUR: { name: 'Euro', symbol: '€', decimalPlaces: 2, countries: ['DE', 'FR', 'IT', 'ES', 'NL'] },
  USD: { name: 'US Dollar', symbol: '$', decimalPlaces: 2, countries: ['US'] },
  GBP: { name: 'British Pound', symbol: '£', decimalPlaces: 2, countries: ['GB'] },
  PLN: { name: 'Polish Złoty', symbol: 'zł', decimalPlaces: 2, countries: ['PL'] },
  SEK: { name: 'Swedish Krona', symbol: 'kr', decimalPlaces: 2, countries: ['SE'] },
  NOK: { name: 'Norwegian Krone', symbol: 'kr', decimalPlaces: 2, countries: ['NO'] },
  DKK: { name: 'Danish Krone', symbol: 'kr', decimalPlaces: 2, countries: ['DK'] },
  CHF: { name: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2, countries: ['CH'] },
  CAD: { name: 'Canadian Dollar', symbol: 'CA$', decimalPlaces: 2, countries: ['CA'] },
  AUD: { name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2, countries: ['AU'] },
  JPY: { name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, countries: ['JP'] },
  KRW: { name: 'South Korean Won', symbol: '₩', decimalPlaces: 0, countries: ['KR'] },
  BRL: { name: 'Brazilian Real', symbol: 'R$', decimalPlaces: 2, countries: ['BR'] },
  MXN: { name: 'Mexican Peso', symbol: 'MX$', decimalPlaces: 2, countries: ['MX'] },
  INR: { name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, countries: ['IN'] },
  SGD: { name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2, countries: ['SG'] },
  HKD: { name: 'Hong Kong Dollar', symbol: 'HK$', decimalPlaces: 2, countries: ['HK'] },
  NZD: { name: 'New Zealand Dollar', symbol: 'NZ$', decimalPlaces: 2, countries: ['NZ'] },
  ZAR: { name: 'South African Rand', symbol: 'R', decimalPlaces: 2, countries: ['ZA'] },
  CZK: { name: 'Czech Koruna', symbol: 'Kč', decimalPlaces: 2, countries: ['CZ'] },
  HUF: { name: 'Hungarian Forint', symbol: 'Ft', decimalPlaces: 0, countries: ['HU'] },
  RON: { name: 'Romanian Leu', symbol: 'lei', decimalPlaces: 2, countries: ['RO'] },
  BGN: { name: 'Bulgarian Lev', symbol: 'лв', decimalPlaces: 2, countries: ['BG'] },
  TRY: { name: 'Turkish Lira', symbol: '₺', decimalPlaces: 2, countries: ['TR'] },
  AED: { name: 'UAE Dirham', symbol: 'AED', decimalPlaces: 2, countries: ['AE'] },
  SAR: { name: 'Saudi Riyal', symbol: 'SAR', decimalPlaces: 2, countries: ['SA'] },
  ILS: { name: 'Israeli Shekel', symbol: '₪', decimalPlaces: 2, countries: ['IL'] },
  THB: { name: 'Thai Baht', symbol: '฿', decimalPlaces: 2, countries: ['TH'] },
  MYR: { name: 'Malaysian Ringgit', symbol: 'RM', decimalPlaces: 2, countries: ['MY'] },
  PHP: { name: 'Philippine Peso', symbol: '₱', decimalPlaces: 2, countries: ['PH'] },
  IDR: { name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 0, countries: ['ID'] },
} as const;

/**
 * VAT/Tax rules by country
 */
export const VAT_RULES_BY_COUNTRY: Record<string, { rate: number; included: boolean; jurisdiction: string }> = {
  // EU countries - VAT must be included for B2C
  DE: { rate: 0.19, included: true, jurisdiction: 'Germany VAT' },
  FR: { rate: 0.20, included: true, jurisdiction: 'France VAT' },
  IT: { rate: 0.22, included: true, jurisdiction: 'Italy VAT' },
  ES: { rate: 0.21, included: true, jurisdiction: 'Spain VAT' },
  NL: { rate: 0.21, included: true, jurisdiction: 'Netherlands VAT' },
  PL: { rate: 0.23, included: true, jurisdiction: 'Poland VAT' },
  SE: { rate: 0.25, included: true, jurisdiction: 'Sweden VAT' },
  DK: { rate: 0.25, included: true, jurisdiction: 'Denmark VAT' },
  NO: { rate: 0.25, included: true, jurisdiction: 'Norway VAT' },
  AT: { rate: 0.20, included: true, jurisdiction: 'Austria VAT' },
  BE: { rate: 0.21, included: true, jurisdiction: 'Belgium VAT' },
  FI: { rate: 0.24, included: true, jurisdiction: 'Finland VAT' },
  IE: { rate: 0.23, included: true, jurisdiction: 'Ireland VAT' },
  PT: { rate: 0.23, included: true, jurisdiction: 'Portugal VAT' },
  GR: { rate: 0.24, included: true, jurisdiction: 'Greece VAT' },
  CZ: { rate: 0.21, included: true, jurisdiction: 'Czech Republic VAT' },
  HU: { rate: 0.27, included: true, jurisdiction: 'Hungary VAT' },
  RO: { rate: 0.19, included: true, jurisdiction: 'Romania VAT' },
  BG: { rate: 0.20, included: true, jurisdiction: 'Bulgaria VAT' },
  
  // Other countries - typically tax excluded
  US: { rate: 0.00, included: false, jurisdiction: 'US (varies by state)' },
  GB: { rate: 0.20, included: true, jurisdiction: 'UK VAT' },
  CH: { rate: 0.077, included: true, jurisdiction: 'Switzerland VAT' },
  CA: { rate: 0.05, included: false, jurisdiction: 'Canada GST' },
  AU: { rate: 0.10, included: true, jurisdiction: 'Australia GST' },
  NZ: { rate: 0.15, included: true, jurisdiction: 'New Zealand GST' },
  JP: { rate: 0.10, included: true, jurisdiction: 'Japan Consumption Tax' },
  KR: { rate: 0.10, included: true, jurisdiction: 'South Korea VAT' },
  IN: { rate: 0.18, included: true, jurisdiction: 'India GST' },
  BR: { rate: 0.00, included: false, jurisdiction: 'Brazil (complex tax)' },
  MX: { rate: 0.16, included: false, jurisdiction: 'Mexico IVA' },
  SG: { rate: 0.08, included: true, jurisdiction: 'Singapore GST' },
  ZA: { rate: 0.15, included: true, jurisdiction: 'South Africa VAT' },
  TR: { rate: 0.18, included: true, jurisdiction: 'Turkey KDV' },
  AE: { rate: 0.05, included: true, jurisdiction: 'UAE VAT' },
  SA: { rate: 0.15, included: true, jurisdiction: 'Saudi Arabia VAT' },
  IL: { rate: 0.17, included: true, jurisdiction: 'Israel VAT' },
};

// ============================================================================
// ERROR CODES
// ============================================================================

export type Pack106ErrorCode =
  | 'CURRENCY_NOT_SUPPORTED'
  | 'CURRENCY_CHANGE_COOLDOWN'
  | 'INVALID_CURRENCY_CODE'
  | 'FX_RATE_UNAVAILABLE'
  | 'PSP_NOT_AVAILABLE'
  | 'BASE_PRICE_CHANGE_UNAUTHORIZED'
  | 'INSUFFICIENT_APPROVALS'
  | 'CURRENCY_PROFILE_NOT_FOUND';