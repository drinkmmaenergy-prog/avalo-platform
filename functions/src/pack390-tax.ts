/**
 * PACK 390 - TAX & VAT HANDLING
 * Automated tax calculation, VAT detection, and financial reporting
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// CONSTANTS
// ============================================================================

// VAT rates by country (standard rates as of 2024)
const VAT_RATES: Record<string, number> = {
  PL: 0.23,   // Poland
  DE: 0.19,   // Germany
  FR: 0.20,   // France
  ES: 0.21,   // Spain
  IT: 0.22,   // Italy
  GB: 0.20,   // UK
  CZ: 0.21,   // Czech Republic
  RO: 0.19,   // Romania
  BG: 0.20,   // Bulgaria
  HR: 0.25,   // Croatia
  UA: 0.20,   // Ukraine
  TR: 0.20,   // Turkey
  US: 0.00,   // No federal VAT
  DEFAULT: 0.20
};

// Platform fee structure
const PLATFORM_FEES = {
  calendarBooking: 0.20,      // 20% on calendar bookings
  tokenPurchase: 0.15,        // 15% on token purchases
  eventTicket: 0.10,          // 10% on event tickets
  subscription: 0.15,         // 15% on subscriptions
  donation: 0.05              // 5% on donations
};

// ============================================================================
// TAX CALCULATION
// ============================================================================

/**
 * Calculate VAT for a transaction
 */
export const pack390_calculateVAT = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, countryCode, transactionType, isB2B } = data;
  
  // Validation
  if (typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code required');
  }
  
  try {
    // Get VAT rate for country
    const vatRate = VAT_RATES[countryCode] || VAT_RATES.DEFAULT;
    
    // B2B transactions may use reverse charge (no VAT collected by platform)
    const reverseCharge = isB2B && isEUCountry(countryCode);
    
    let vatAmount = 0;
    let netAmount = amount;
    let grossAmount = amount;
    
    if (!reverseCharge) {
      vatAmount = amount * vatRate;
      grossAmount = amount + vatAmount;
    }
    
    return {
      netAmount,
      vatAmount,
      grossAmount,
      vatRate,
      countryCode,
      reverseCharge,
      transactionType
    };
    
  } catch (error) {
    console.error('VAT calculation error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calculate platform fee for a transaction
 */
export const pack390_calculatePlatformFee = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, transactionType } = data;
  
  // Validation
  if (typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  try {
    const feeRate = PLATFORM_FEES[transactionType as keyof typeof PLATFORM_FEES] || 0.15;
    const platformFee = amount * feeRate;
    const creatorAmount = amount - platformFee;
    
    return {
      totalAmount: amount,
      platformFee,
      creatorAmount,
      feeRate,
      transactionType
    };
    
  } catch (error) {
    console.error('Platform fee calculation error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// TAX REPORT GENERATION
// ============================================================================

/**
 * Generate tax report for a user
 */
export const pack390_generateTaxReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = data.userId || context.auth.uid;
  const { year, quarter } = data;
  
  // Check if user can access this report
  if (userId !== context.auth.uid) {
    const requesterDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAuthorized = requesterDoc.exists && 
      (requesterDoc.data()?.role === 'admin' || requesterDoc.data()?.permissions?.finance === true);
    
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
    }
  }
  
  try {
    // Calculate date range
    const { startDate, endDate } = getDateRange(year, quarter);
    
    // Get all income transactions
    const ledgerSnapshot = await db.collection('fiatLedgers')
      .where('userId', '==', userId)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();
    
    let totalIncome = 0;
    let totalPlatformFees = 0;
    let totalVAT = 0;
    const incomeByType: Record<string, number> = {};
    const incomeByCountry: Record<string, number> = {};
    
    for (const doc of ledgerSnapshot.docs) {
      const data = doc.data();
      
      if (data.type === 'payout' || data.amount < 0) continue;
      
      const amount = data.amount || 0;
      totalIncome += amount;
      
      // Categorize by type
      const type = data.transactionType || 'other';
      incomeByType[type] = (incomeByType[type] || 0) + amount;
      
      // Calculate platform fee
      const feeRate = PLATFORM_FEES[type as keyof typeof PLATFORM_FEES] || 0.15;
      totalPlatformFees += amount * feeRate;
      
      // Categorize by country
      const country = data.countryCode || 'UNKNOWN';
      incomeByCountry[country] = (incomeByCountry[country] || 0) + amount;
      
      // Calculate VAT
      if (data.vatAmount) {
        totalVAT += data.vatAmount;
      }
    }
    
    const netIncome = totalIncome - totalPlatformFees;
    
    // Create tax report
    const reportRef = await db.collection('taxReports').add({
      userId,
      year,
      quarter,
      startDate,
      endDate,
      totalIncome,
      totalPlatformFees,
      netIncome,
      totalVAT,
      incomeByType,
      incomeByCountry,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: context.auth.uid
    });
    
    return {
      success: true,
      reportId: reportRef.id,
      summary: {
        totalIncome,
        totalPlatformFees,
        netIncome,
        totalVAT,
        incomeByType,
        incomeByCountry
      }
    };
    
  } catch (error) {
    console.error('Tax report generation error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate VAT statement for a country
 */
export const pack390_generateVATStatement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Only finance team can generate VAT statements
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAuthorized = userDoc.exists && 
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  const { countryCode, year, quarter } = data;
  
  try {
    const { startDate, endDate } = getDateRange(year, quarter);
    
    // Get all transactions for this country
    const ledgerSnapshot = await db.collection('fiatLedgers')
      .where('countryCode', '==', countryCode)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();
    
    let totalSales = 0;
    let totalVATCollected = 0;
    let b2cSales = 0;
    let b2bSales = 0;
    let reverseChargeSales = 0;
    
    ledgerSnapshot.forEach(doc => {
      const data = doc.data();
      const amount = data.amount || 0;
      
      if (amount > 0) {
        totalSales += amount;
        
        if (data.vatAmount) {
          totalVATCollected += data.vatAmount;
          b2cSales += amount;
        } else if (data.reverseCharge) {
          reverseChargeSales += amount;
          b2bSales += amount;
        }
      }
    });
    
    // Create VAT statement
    const statementRef = await db.collection('vatStatements').add({
      countryCode,
      year,
      quarter,
      startDate,
      endDate,
      totalSales,
      totalVATCollected,
      b2cSales,
      b2bSales,
      reverseChargeSales,
      vatRate: VAT_RATES[countryCode] || VAT_RATES.DEFAULT,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: context.auth.uid
    });
    
    return {
      success: true,
      statementId: statementRef.id,
      summary: {
        countryCode,
        totalSales,
        totalVATCollected,
        b2cSales,
        b2bSales,
        reverseChargeSales
      }
    };
    
  } catch (error) {
    console.error('VAT statement generation error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate country revenue breakdown
 */
export const pack390_generateCountryRevenue = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Only finance team can generate revenue reports
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAuthorized = userDoc.exists && 
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  const { year, month } = data;
  
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const ledgerSnapshot = await db.collection('fiatLedgers')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .where('amount', '>', 0)
      .get();
    
    const revenueByCountry: Record<string, any> = {};
    
    ledgerSnapshot.forEach(doc => {
      const data = doc.data();
      const country = data.countryCode || 'UNKNOWN';
      const amount = data.amount || 0;
      const currency = data.currency || 'PLN';
      
      if (!revenueByCountry[country]) {
        revenueByCountry[country] = {
          totalRevenue: 0,
          transactionCount: 0,
          currencies: {},
          platformFees: 0
        };
      }
      
      revenueByCountry[country].totalRevenue += amount;
      revenueByCountry[country].transactionCount += 1;
      revenueByCountry[country].currencies[currency] = 
        (revenueByCountry[country].currencies[currency] || 0) + amount;
      
      if (data.platformFee) {
        revenueByCountry[country].platformFees += data.platformFee;
      }
    });
    
    // Create breakdown document
    const breakdownRef = await db.collection('countryRevenueBreakdown').add({
      year,
      month,
      revenueByCountry,
      totalRevenue: Object.values(revenueByCountry).reduce(
        (sum: number, country: any) => sum + country.totalRevenue, 0
      ),
      totalTransactions: Object.values(revenueByCountry).reduce(
        (sum: number, country: any) => sum + country.transactionCount, 0
      ),
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: context.auth.uid
    });
    
    return {
      success: true,
      breakdownId: breakdownRef.id,
      revenueByCountry
    };
    
  } catch (error) {
    console.error('Country revenue generation error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// SCHEDULED TAX REPORTS
// ============================================================================

/**
 * Auto-generate quarterly tax reports
 * Runs on the 5th of Jan, Apr, Jul, Oct
 */
export const pack390_autoGenerateQuarterlyReports = functions.pubsub
  .schedule('0 2 5 1,4,7,10 *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const quarter = Math.floor((now.getMonth() - 1) / 3) + 1; // Previous quarter
      
      console.log(`Generating quarterly reports for Q${quarter} ${year}`);
      
      // Get all creators with income
      const creatorsSnapshot = await db.collection('users')
        .where('role', '==', 'creator')
        .where('hasIncome', '==', true)
        .get();
      
      const batch = db.batch();
      
      for (const creatorDoc of creatorsSnapshot.docs) {
        const userId = creatorDoc.id;
        
        // Generate tax report for this creator
        const { startDate, endDate } = getDateRange(year, quarter);
        
        // Get income data
        const ledgerSnapshot = await db.collection('fiatLedgers')
          .where('userId', '==', userId)
          .where('timestamp', '>=', startDate)
          .where('timestamp', '<=', endDate)
          .where('amount', '>', 0)
          .get();
        
        if (ledgerSnapshot.empty) continue;
        
        let totalIncome = 0;
        ledgerSnapshot.forEach(doc => {
          totalIncome += doc.data().amount || 0;
        });
        
        const reportRef = db.collection('taxReports').doc();
        batch.set(reportRef, {
          userId,
          year,
          quarter,
          startDate,
          endDate,
          totalIncome,
          autoGenerated: true,
          generatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      await batch.commit();
      console.log(`Generated ${creatorsSnapshot.size} quarterly tax reports`);
      
    } catch (error) {
      console.error('Auto tax report generation error:', error);
    }
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDateRange(year: number, quarter?: number) {
  if (quarter) {
    const startMonth = (quarter - 1) * 3;
    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59);
    return { startDate, endDate };
  } else {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    return { startDate, endDate };
  }
}

function isEUCountry(countryCode: string): boolean {
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  return euCountries.includes(countryCode);
}

/**
 * Get tax information for a user's country
 */
export const pack390_getTaxInfo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code required');
  }
  
  const vatRate = VAT_RATES[countryCode] || VAT_RATES.DEFAULT;
  const isEU = isEUCountry(countryCode);
  
  return {
    countryCode,
    vatRate,
    isEU,
    reverseChargeAvailable: isEU,
    platformFees: PLATFORM_FEES
  };
});
