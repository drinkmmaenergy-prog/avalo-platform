/**
 * PACK 395 - Global Tax Engine
 * Handles VAT, GST, and sales tax calculations for digital goods
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// VAT/Tax rates by country (should be updated from external provider)
export const VAT_RATES: Record<string, { rate: number; type: string; country: string }> = {
  // EU Countries
  'AT': { rate: 0.20, type: 'VAT', country: 'Austria' },
  'BE': { rate: 0.21, type: 'VAT', country: 'Belgium' },
  'BG': { rate: 0.20, type: 'VAT', country: 'Bulgaria' },
  'HR': { rate: 0.25, type: 'VAT', country: 'Croatia' },
  'CY': { rate: 0.19, type: 'VAT', country: 'Cyprus' },
  'CZ': { rate: 0.21, type: 'VAT', country: 'Czech Republic' },
  'DK': { rate: 0.25, type: 'VAT', country: 'Denmark' },
  'EE': { rate: 0.20, type: 'VAT', country: 'Estonia' },
  'FI': { rate: 0.24, type: 'VAT', country: 'Finland' },
  'FR': { rate: 0.20, type: 'VAT', country: 'France' },
  'DE': { rate: 0.19, type: 'VAT', country: 'Germany' },
  'GR': { rate: 0.24, type: 'VAT', country: 'Greece' },
  'HU': { rate: 0.27, type: 'VAT', country: 'Hungary' },
  'IE': { rate: 0.23, type: 'VAT', country: 'Ireland' },
  'IT': { rate: 0.22, type: 'VAT', country: 'Italy' },
  'LV': { rate: 0.21, type: 'VAT', country: 'Latvia' },
  'LT': { rate: 0.21, type: 'VAT', country: 'Lithuania' },
  'LU': { rate: 0.17, type: 'VAT', country: 'Luxembourg' },
  'MT': { rate: 0.18, type: 'VAT', country: 'Malta' },
  'NL': { rate: 0.21, type: 'VAT', country: 'Netherlands' },
  'PL': { rate: 0.23, type: 'VAT', country: 'Poland' },
  'PT': { rate: 0.23, type: 'VAT', country: 'Portugal' },
  'RO': { rate: 0.19, type: 'VAT', country: 'Romania' },
  'SK': { rate: 0.20, type: 'VAT', country: 'Slovakia' },
  'SI': { rate: 0.22, type: 'VAT', country: 'Slovenia' },
  'ES': { rate: 0.21, type: 'VAT', country: 'Spain' },
  'SE': { rate: 0.25, type: 'VAT', country: 'Sweden' },
  
  // UK
  'GB': { rate: 0.20, type: 'VAT', country: 'United Kingdom' },
  
  // Other European
  'NO': { rate: 0.25, type: 'VAT', country: 'Norway' },
  'CH': { rate: 0.077, type: 'VAT', country: 'Switzerland' },
  
  // Americas
  'US': { rate: 0.00, type: 'Sales Tax', country: 'United States' }, // State-specific
  'CA': { rate: 0.05, type: 'GST', country: 'Canada' }, // Federal GST, provinces add PST
  'BR': { rate: 0.00, type: 'Digital Tax', country: 'Brazil' }, // Complex system
  'MX': { rate: 0.16, type: 'VAT', country: 'Mexico' },
  'AR': { rate: 0.21, type: 'VAT', country: 'Argentina' },
  'CL': { rate: 0.19, type: 'VAT', country: 'Chile' },
  
  // Asia-Pacific
  'AU': { rate: 0.10, type: 'GST', country: 'Australia' },
  'NZ': { rate: 0.15, type: 'GST', country: 'New Zealand' },
  'SG': { rate: 0.08, type: 'GST', country: 'Singapore' },
  'IN': { rate: 0.18, type: 'GST', country: 'India' },
  'JP': { rate: 0.10, type: 'Consumption Tax', country: 'Japan' },
  'KR': { rate: 0.10, type: 'VAT', country: 'South Korea' },
  'MY': { rate: 0.00, type: 'SST', country: 'Malaysia' }, // Digital services exempt
  'TH': { rate: 0.07, type: 'VAT', country: 'Thailand' },
  'ID': { rate: 0.11, type: 'VAT', country: 'Indonesia' },
  'PH': { rate: 0.12, type: 'VAT', country: 'Philippines' },
  'VN': { rate: 0.10, type: 'VAT', country: 'Vietnam' },
  
  // Middle East
  'AE': { rate: 0.05, type: 'VAT', country: 'United Arab Emirates' },
  'SA': { rate: 0.15, type: 'VAT', country: 'Saudi Arabia' },
  'IL': { rate: 0.17, type: 'VAT', country: 'Israel' },
  'TR': { rate: 0.18, type: 'VAT', country: 'Turkey' },
  
  // Africa
  'ZA': { rate: 0.15, type: 'VAT', country: 'South Africa' },
  'NG': { rate: 0.075, type: 'VAT', country: 'Nigeria' },
  'EG': { rate: 0.14, type: 'VAT', country: 'Egypt' },
  'KE': { rate: 0.16, type: 'VAT', country: 'Kenya' },
  
  // Default for unknown countries
  'DEFAULT': { rate: 0.00, type: 'None', country: 'Other' }
};

// US State sales tax rates for digital goods
const US_STATE_TAX_RATES: Record<string, number> = {
  'AL': 0.04,  // Alabama
  'AK': 0.00,  // Alaska - no state sales tax
  'AZ': 0.056, // Arizona
  'AR': 0.065, // Arkansas
  'CA': 0.0725, // California
  'CO': 0.029, // Colorado
  'CT': 0.0635, // Connecticut
  'DE': 0.00,  // Delaware - no sales tax
  'FL': 0.06,  // Florida
  'GA': 0.04,  // Georgia
  'HI': 0.04,  // Hawaii
  'ID': 0.06,  // Idaho
  'IL': 0.0625, // Illinois
  'IN': 0.07,  // Indiana
  'IA': 0.06,  // Iowa
  'KS': 0.065, // Kansas
  'KY': 0.06,  // Kentucky
  'LA': 0.0445, // Louisiana
  'ME': 0.055, // Maine
  'MD': 0.06,  // Maryland
  'MA': 0.0625, // Massachusetts
  'MI': 0.06,  // Michigan
  'MN': 0.06875, // Minnesota
  'MS': 0.07,  // Mississippi
  'MO': 0.04225, // Missouri
  'MT': 0.00,  // Montana - no sales tax
  'NE': 0.055, // Nebraska
  'NV': 0.0685, // Nevada
  'NH': 0.00,  // New Hampshire - no sales tax
  'NJ': 0.06625, // New Jersey
  'NM': 0.05125, // New Mexico
  'NY': 0.04,  // New York
  'NC': 0.0475, // North Carolina
  'ND': 0.05,  // North Dakota
  'OH': 0.0575, // Ohio
  'OK': 0.045, // Oklahoma
  'OR': 0.00,  // Oregon - no sales tax
  'PA': 0.06,  // Pennsylvania
  'RI': 0.07,  // Rhode Island
  'SC': 0.06,  // South Carolina
  'SD': 0.045, // South Dakota
  'TN': 0.07,  // Tennessee
  'TX': 0.0625, // Texas
  'UT': 0.0485, // Utah
  'VT': 0.06,  // Vermont
  'VA': 0.053, // Virginia
  'WA': 0.065, // Washington
  'WV': 0.06,  // West Virginia
  'WI': 0.05,  // Wisconsin
  'WY': 0.04,  // Wyoming
  'DC': 0.06   // District of Columbia
};

interface TaxCalculationInput {
  userCountry: string;
  userState?: string; // For US
  currency: string;
  amount: number;
  purchaseType: 'tokens' | 'subscription' | 'gift' | 'boost';
  isBusinessCustomer?: boolean;
  vatNumber?: string;
}

interface TaxCalculationResult {
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  taxRate: number;
  taxType: string;
  country: string;
  currency: string;
  isReversedCharge: boolean;
  exemptionReason?: string;
}

/**
 * Calculate tax for a purchase
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  const { userCountry, userState, currency, amount, purchaseType, isBusinessCustomer, vatNumber } = input;
  
  // Get base tax rate
  let taxRate = 0;
  let taxType = 'None';
  let country = 'Other';
  let isReversedCharge = false;
  let exemptionReason: string | undefined;
  
  // Check if tax rates are available
  const countryTax = VAT_RATES[userCountry] || VAT_RATES['DEFAULT'];
  taxRate = countryTax.rate;
  taxType = countryTax.type;
  country = countryTax.country;
  
  // US state-specific handling
  if (userCountry === 'US' && userState) {
    const stateTaxRate = US_STATE_TAX_RATES[userState];
    if (stateTaxRate !== undefined) {
      taxRate = stateTaxRate;
    }
  }
  
  // EU B2B Reverse Charge
  if (isBusinessCustomer && vatNumber && isEUCountry(userCountry)) {
    isReversedCharge = true;
    taxRate = 0;
    exemptionReason = 'EU B2B Reverse Charge - VAT Number: ' + vatNumber;
  }
  
  // Calculate amounts
  const netAmount = amount;
  const taxAmount = Math.round(netAmount * taxRate * 100) / 100;
  const grossAmount = netAmount + taxAmount;
  
  return {
    netAmount,
    taxAmount,
    grossAmount,
    taxRate,
    taxType,
    country,
    currency,
    isReversedCharge,
    exemptionReason
  };
}

/**
 * Check if country is in EU
 */
function isEUCountry(countryCode: string): boolean {
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  return euCountries.includes(countryCode);
}

/**
 * Cloud Function: Calculate tax for a purchase
 */
export const calculatePurchaseTax = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { userCountry, userState, currency, amount, purchaseType } = data;
  
  // Validate inputs
  if (!userCountry || !currency || !amount || !purchaseType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Get user's business status if available
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  const isBusinessCustomer = userData?.isBusinessCustomer || false;
  const vatNumber = userData?.vatNumber;
  
  // Calculate tax
  const result = calculateTax({
    userCountry,
    userState,
    currency,
    amount,
    purchaseType,
    isBusinessCustomer,
    vatNumber
  });
  
  // Log the calculation
  await db.collection('transactionVAT').add({
    userId,
    userCountry,
    userState,
    currency,
    amount,
    purchaseType,
    ...result,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return result;
});

/**
 * Update VAT rates from external provider
 * Should be run periodically via Cloud Scheduler
 */
export const updateVATRates = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  // In production, fetch from external API like:
  // - VAT API (https://vatapi.com/)
  // - TaxJar API
  // - Avalara
  
  // For now, update from our static rates
  const batch = db.batch();
  
  for (const [countryCode, taxInfo] of Object.entries(VAT_RATES)) {
    if (countryCode !== 'DEFAULT') {
      const ref = db.collection('vatRates').doc(countryCode);
      batch.set(ref, {
        ...taxInfo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'manual'
      }, { merge: true });
    }
  }
  
  await batch.commit();
  console.log('VAT rates updated successfully');
});

/**
 * Validate VAT number (EU)
 */
export const validateVATNumber = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { vatNumber, countryCode } = data;
  
  if (!vatNumber || !countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'VAT number and country code required');
  }
  
  // Basic format validation
  const cleanVAT = vatNumber.replace(/[^A-Z0-9]/g, '');
  
  // Check format based on country
  const vatPatterns: Record<string, RegExp> = {
    'AT': /^ATU\d{8}$/,
    'BE': /^BE0?\d{9}$/,
    'BG': /^BG\d{9,10}$/,
    'CY': /^CY\d{8}[A-Z]$/,
    'CZ': /^CZ\d{8,10}$/,
    'DE': /^DE\d{9}$/,
    'DK': /^DK\d{8}$/,
    'EE': /^EE\d{9}$/,
    'EL': /^EL\d{9}$/,
    'ES': /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
    'FI': /^FI\d{8}$/,
    'FR': /^FR[A-Z0-9]{2}\d{9}$/,
    'GB': /^GB(\d{9}|\d{12}|(GD|HA)\d{3})$/,
    'HR': /^HR\d{11}$/,
    'HU': /^HU\d{8}$/,
    'IE': /^IE\d[A-Z0-9]\d{5}[A-Z]$/,
    'IT': /^IT\d{11}$/,
    'LT': /^LT(\d{9}|\d{12})$/,
    'LU': /^LU\d{8}$/,
    'LV': /^LV\d{11}$/,
    'MT': /^MT\d{8}$/,
    'NL': /^NL\d{9}B\d{2}$/,
    'PL': /^PL\d{10}$/,
    'PT': /^PT\d{9}$/,
    'RO': /^RO\d{2,10}$/,
    'SE': /^SE\d{12}$/,
    'SI': /^SI\d{8}$/,
    'SK': /^SK\d{10}$/
  };
  
  const pattern = vatPatterns[countryCode];
  if (!pattern) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported country code');
  }
  
  const isValidFormat = pattern.test(cleanVAT);
  
  // In production, also check against VIES (VAT Information Exchange System)
  // https://ec.europa.eu/taxation_customs/vies/
  
  return {
    valid: isValidFormat,
    vatNumber: cleanVAT,
    countryCode,
    checkedAt: new Date().toISOString()
  };
});

/**
 * Export tax calculation function for use in other modules
 */
export { calculateTax as calculateTransactionTax };
