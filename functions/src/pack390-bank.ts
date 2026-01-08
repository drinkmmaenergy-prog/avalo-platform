/**
 * PACK 390 - FINANCIAL REPORTING & BANKING
 * Export financial reports, audit trails, and banking compliance data
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// FINANCIAL REPORTING
// ============================================================================

/**
 * Generate comprehensive financial report
 */
export const pack390_generateFinancialReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Require finance team access
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAuthorized = userDoc.exists && 
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  const { startDate, endDate, format = 'json' } = data;
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Generate all financial metrics
    const dailyRevenue = await calculateDailyRevenue(start, end);
    const tokenCirculation = await calculateTokenCirculation(start, end);
    const payoutLiabilities = await calculatePayoutLiabilities();
    const platformFees = await calculatePlatformFees(start, end);
    const eventSettlements = await calculateEventSettlements(start, end);
    const chargebackExposure = await calculateChargebackExposure(start, end);
    
    const report = {
      period: { startDate, endDate },
      dailyRevenue,
      tokenCirculation,
      payoutLiabilities,
      platformFees,
      eventSettlements,
      chargebackExposure,
      generatedAt: new Date().toISOString(),
      generatedBy: context.auth.uid
    };
    
    // Store report
    const reportRef = await db.collection('bankingComplianceReports').add({
      ...report,
      format,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Format based on request
    if (format === 'csv') {
      return {
        success: true,
        reportId: reportRef.id,
        csv: convertToCSV(report)
      };
    } else if (format === 'pdf') {
      return {
        success: true,
        reportId: reportRef.id,
        message: 'PDF generation not yet implemented',
        data: report
      };
    } else {
      return {
        success: true,
        reportId: reportRef.id,
        data: report
      };
    }
    
  } catch (error) {
    console.error('Financial report error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Export audit trail for regulators
 */
export const pack390_exportAuditTrail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Require admin access
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { startDate, endDate, type, format = 'json' } = data;
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let query = db.collection('financialAuditLogs')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end);
    
    if (type) {
      query = query.where('type', '==', type);
    }
    
    const logsSnapshot = await query.orderBy('timestamp', 'desc').get();
    
    const auditLogs = logsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Format based on request
    if (format === 'csv') {
      return {
        success: true,
        count: auditLogs.length,
        csv: convertToCSV({ auditLogs })
      };
    } else {
      return {
        success: true,
        count: auditLogs.length,
        auditLogs
      };
    }
    
  } catch (error) {
    console.error('Audit trail export error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get platform financial dashboard metrics
 */
export const pack390_getDashboardMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Require finance team access
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAuthorized = userDoc.exists && 
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  try {
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get key metrics
    const metrics = {
      revenue: await calculateDailyRevenue(last30Days, today),
      activePayouts: await getActivePayoutsCount(),
      pendingAMLReviews: await getPendingAMLReviewsCount(),
      tokenCirculation: await getCurrentTokenCirculation(),
      platformFeesEarned: await calculatePlatformFees(last30Days, today),
      chargebacks: await getRecentChargebacks(),
      topCountries: await getTopCountriesByRevenue(),
      alertSummary: await getAMLAlertSummary()
    };
    
    return {
      success: true,
      metrics,
      lastUpdated: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

async function calculateDailyRevenue(startDate: Date, endDate: Date) {
  const ledgerSnapshot = await db.collection('fiatLedgers')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .where('amount', '>', 0)
    .get();
  
  let totalRevenue = 0;
  const revenueByDay: Record<string, number> = {};
  
  ledgerSnapshot.forEach(doc => {
    const data = doc.data();
    totalRevenue += data.amount || 0;
    
    const date = data.timestamp.toDate().toISOString().split('T')[0];
    revenueByDay[date] = (revenueByDay[date] || 0) + data.amount;
  });
  
  return { totalRevenue, revenueByDay, transactionCount: ledgerSnapshot.size };
}

async function calculateTokenCirculation(startDate: Date, endDate: Date) {
  const statsSnapshot = await db.collection('tokenCirculationStats')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  if (statsSnapshot.empty) {
    return { totalInCirculation: 0, issued: 0, redeemed: 0 };
  }
  
  return statsSnapshot.docs[0].data();
}

async function calculatePayoutLiabilities() {
  const pendingPayouts = await db.collection('payoutRequests')
    .where('status', 'in', ['pending', 'approved', 'processing', 'aml_review'])
    .get();
  
  let totalLiability = 0;
  const liabilitiesByCurrency: Record<string, number> = {};
  
  pendingPayouts.forEach(doc => {
    const data = doc.data();
    totalLiability += data.fiatAmount || 0;
    
    const currency = data.currency || 'PLN';
    liabilitiesByCurrency[currency] = (liabilitiesByCurrency[currency] || 0) + data.fiatAmount;
  });
  
  return { 
    totalPayouts: pendingPayouts.size,
    totalLiability,
    liabilitiesByCurrency
  };
}

async function calculatePlatformFees(startDate: Date, endDate: Date) {
  const feesSnapshot = await db.collection('platformFees')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .get();
  
  let totalFees = 0;
  const feesByType: Record<string, number> = {};
  
  feesSnapshot.forEach(doc => {
    const data = doc.data();
    totalFees += data.amount || 0;
    
    const type = data.type || 'other';
    feesByType[type] = (feesByType[type] || 0) + data.amount;
  });
  
  return { totalFees, feesByType };
}

async function calculateEventSettlements(startDate: Date, endDate: Date) {
  const settlementsSnapshot = await db.collection('eventSettlements')
    .where('settledAt', '>=', startDate)
    .where('settledAt', '<=', endDate)
    .get();
  
  let totalSettled = 0;
  settlementsSnapshot.forEach(doc => {
    totalSettled += doc.data().amount || 0;
  });
  
  return {
    count: settlementsSnapshot.size,
    totalAmount: totalSettled
  };
}

async function calculateChargebackExposure(startDate: Date, endDate: Date) {
  const chargebacksSnapshot = await db.collection('chargebackRecords')
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate)
    .get();
  
  let totalChargebacks = 0;
  let totalAmount = 0;
  
  chargebacksSnapshot.forEach(doc => {
    const data = doc.data();
    totalChargebacks++;
    totalAmount += data.amount || 0;
  });
  
  return {
    count: totalChargebacks,
    totalAmount,
    averageAmount: totalChargebacks > 0 ? totalAmount / totalChargebacks : 0
  };
}

async function getActivePayoutsCount() {
  const payoutsSnapshot = await db.collection('payoutRequests')
    .where('status', 'in', ['pending', 'approved', 'processing'])
    .get();
  
  return payoutsSnapshot.size;
}

async function getPendingAMLReviewsCount() {
  const reviewsSnapshot = await db.collection('amlAlerts')
    .where('status', '==', 'pending')
    .get();
  
  return reviewsSnapshot.size;
}

async function getCurrentTokenCirculation() {
  const statsSnapshot = await db.collection('tokenCirculationStats')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  
  if (statsSnapshot.empty) {
    return { totalInCirculation: 0 };
  }
  
  return statsSnapshot.docs[0].data();
}

async function getRecentChargebacks() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const chargebacksSnapshot = await db.collection('chargebackRecords')
    .where('createdAt', '>=', thirtyDaysAgo)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  
  return chargebacksSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function getTopCountriesByRevenue() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const ledgerSnapshot = await db.collection('fiatLedgers')
    .where('timestamp', '>=', thirtyDaysAgo)
    .where('amount', '>', 0)
    .get();
  
  const revenueByCountry: Record<string, number> = {};
  
  ledgerSnapshot.forEach(doc => {
    const data = doc.data();
    const country = data.countryCode || 'UNKNOWN';
    revenueByCountry[country] = (revenueByCountry[country] || 0) + data.amount;
  });
  
  const sorted = Object.entries(revenueByCountry)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([country, revenue]) => ({ country, revenue }));
  
  return sorted;
}

async function getAMLAlertSummary() {
  const alertsSnapshot = await db.collection('amlAlerts')
    .where('status', 'in', ['pending', 'under_review'])
    .get();
  
  const summary = {
    total: alertsSnapshot.size,
    bySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    }
  };
  
  alertsSnapshot.forEach(doc => {
    const severity = doc.data().severity || 'medium';
    summary.bySeverity[severity as keyof typeof summary.bySeverity]++;
  });
  
  return summary;
}

// ============================================================================
// MARKET STATUS MANAGEMENT
// ============================================================================

/**
 * Update market status for a country
 */
export const pack390_updateMarketStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Require admin access
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { countryCode, paymentsEnabled, payoutsEnabled, vatEnabled } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code required');
  }
  
  try {
    await db.collection('marketStatus').doc(countryCode).set({
      countryCode,
      paymentsEnabled: paymentsEnabled !== false,
      payoutsEnabled: payoutsEnabled !== false,
      vatEnabled: vatEnabled !== false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid
    }, { merge: true });
    
    // Log change
    await db.collection('financialAuditLogs').add({
      type: 'market_status_update',
      countryCode,
      paymentsEnabled,
      payoutsEnabled,
      vatEnabled,
      updatedBy: context.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: `Market status updated for ${countryCode}`
    };
    
  } catch (error) {
    console.error('Market status update error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get market status for all countries
 */
export const pack390_getAllMarketStatus = functions.https.onCall(async (data, context) => {
  try {
    const statusSnapshot = await db.collection('marketStatus').get();
    
    const markets: Record<string, any> = {};
    statusSnapshot.forEach(doc => {
      markets[doc.id] = doc.data();
    });
    
    return { markets };
    
  } catch (error) {
    console.error('Get market status error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function convertToCSV(data: any): string {
  // Simple CSV conversion (can be enhanced)
  const jsonData = JSON.stringify(data, null, 2);
  
  // This is a placeholder - would need proper CSV formatting
  return jsonData;
}

/**
 * Record chargeback
 */
export const pack390_recordChargeback = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Require finance team access
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAuthorized = userDoc.exists && 
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  const { userId, transactionId, amount, currency, reason } = data;
  
  try {
    const chargebackRef = await db.collection('chargebackRecords').add({
      userId,
      transactionId,
      amount,
      currency,
      reason,
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      recordedBy: context.auth.uid
    });
    
    // Log to audit trail
    await db.collection('financialAuditLogs').add({
      type: 'chargeback_recorded',
      chargebackId: chargebackRef.id,
      userId,
      amount,
      currency,
      recordedBy: context.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      chargebackId: chargebackRef.id
    };
    
  } catch (error) {
    console.error('Record chargeback error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
