/**
 * PACK 378 — Tax Audit Export Engine
 * Generate comprehensive tax reports for compliance and accounting
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { TaxAuditExport, VATRecord } from '../../firestore/schemas/pack378-tax-profiles';

const db = admin.firestore();

/**
 * PACK378_generateTaxAuditExports
 * Generate tax reports in various formats
 */
export const pack378_generateTaxAuditExports = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin privileges
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const {
    exportType,
    periodStart,
    periodEnd,
    countries,
    format
  } = data;

  if (!exportType || !periodStart || !periodEnd) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Create export record
  const exportRecord: Partial<TaxAuditExport> = {
    exportType,
    periodStart: start,
    periodEnd: end,
    countries: countries || [],
    format: format || 'csv',
    status: 'pending',
    generatedAt: new Date(),
    generatedBy: context.auth.uid
  };

  const exportDoc = await db.collection('taxAuditExports').add(exportRecord);

  // Generate export asynchronously
  generateExportFile(exportDoc.id, exportType, start, end, countries, format)
    .catch(error => {
      functions.logger.error('Export generation failed', error);
      exportDoc.update({ status: 'failed', error: error.message });
    });

  return {
    exportId: exportDoc.id,
    status: 'pending',
    message: 'Export generation started'
  };
});

/**
 * Generate export file
 */
async function generateExportFile(
  exportId: string,
  exportType: string,
  start: Date,
  end: Date,
  countries: string[],
  format: string
): Promise<void> {
  let data: any[];
  let filename: string;

  switch (exportType) {
    case 'vat_report':
      data = await generateVATReport(start, end, countries);
      filename = `vat_report_${formatDate(start)}_${formatDate(end)}.${format}`;
      break;

    case 'payout_tax':
      data = await generatePayoutTaxReport(start, end, countries);
      filename = `payout_tax_${formatDate(start)}_${formatDate(end)}.${format}`;
      break;

    case 'profit_statement':
      data = await generateProfitStatement(start, end, countries);
      filename = `profit_statement_${formatDate(start)}_${formatDate(end)}.${format}`;
      break;

    case 'fraud_tax_risk':
      data = await generateFraudTaxRiskReport(start, end, countries);
      filename = `fraud_tax_risk_${formatDate(start)}_${formatDate(end)}.${format}`;
      break;

    default:
      throw new Error(`Unknown export type: ${exportType}`);
  }

  // Convert to requested format
  let fileContent: string;
  switch (format) {
    case 'csv':
      fileContent = convertToCSV(data);
      break;
    case 'json':
      fileContent = JSON.stringify(data, null, 2);
      break;
    case 'xml':
      fileContent = convertToXML(data, exportType);
      break;
    default:
      throw new Error(`Unknown format: ${format}`);
  }

  // Upload to Firebase Storage
  const bucket = admin.storage().bucket();
  const file = bucket.file(`tax-exports/${filename}`);
  
  await file.save(fileContent, {
    contentType: getContentType(format),
    metadata: {
      exportId,
      exportType,
      generatedAt: new Date().toISOString()
    }
  });

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  // Update export record
  await db.collection('taxAuditExports').doc(exportId).update({
    status: 'completed',
    fileUrl: url,
    fileSize: Buffer.byteLength(fileContent),
    recordCount: data.length
  });
}

/**
 * Generate VAT report
 */
async function generateVATReport(start: Date, end: Date, countries: string[]): Promise<any[]> {
  let query = db.collection('vatRecords')
    .where('timestamp', '>=', start)
    .where('timestamp', '<=', end);

  if (countries && countries.length > 0) {
    query = query.where('taxJurisdiction', 'in', countries);
  }

  const snapshot = await query.get();
  
  return snapshot.docs.map(doc => {
    const record = doc.data() as VATRecord;
    return {
      transactionId: record.transactionId,
      date: record.timestamp,
      userId: record.userId,
      creatorId: record.creatorId || 'N/A',
      country: record.taxJurisdiction,
      netAmount: record.netAmount,
      vatAmount: record.vatAmount,
      grossAmount: record.grossAmount,
      vatRate: record.vatRate,
      vatMOSS: record.vatMossApplied ? 'Yes' : 'No',
      reverseCharge: record.reverseChargeApplied ? 'Yes' : 'No',
      invoiceIssued: record.invoiceIssued ? 'Yes' : 'No',
      invoiceNumber: record.invoiceNumber || 'N/A'
    };
  });
}

/**
 * Generate payout tax report
 */
async function generatePayoutTaxReport(start: Date, end: Date, countries: string[]): Promise<any[]> {
  let query = db.collection('taxWithholdings')
    .where('timestamp', '>=', start)
    .where('timestamp', '<=', end);

  if (countries && countries.length > 0) {
    query = query.where('countryCode', 'in', countries);
  }

  const snapshot = await query.get();
  
  const payoutData = await Promise.all(snapshot.docs.map(async doc => {
    const withholding = doc.data();
    
    // Get creator details
    const creatorDoc = await db.collection('creatorTaxProfiles').doc(withholding.creatorId).get();
    const creator = creatorDoc.data() || {};

    return {
      creatorId: withholding.creatorId,
      creatorName: creator.businessName || 'N/A',
      creatorTaxId: creator.taxId || 'N/A',
      country: withholding.countryCode,
      date: withholding.timestamp,
      grossAmount: withholding.grossAmount,
      withholdingAmount: withholding.amount,
      netAmount: withholding.netAmount,
      withholdingRate: withholding.withholdingRate,
      fiscalYear: withholding.fiscalYear
    };
  }));

  return payoutData;
}

/**
 * Generate profit statement by country
 */
async function generateProfitStatement(start: Date, end: Date, countries: string[]): Promise<any[]> {
  const statements = [];

  const targetCountries = countries && countries.length > 0 
    ? countries 
    : await getAllActiveCountries();

  for (const country of targetCountries) {
    // Get revenue (VAT records)
    const revenueSnapshot = await db.collection('vatRecords')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .where('taxJurisdiction', '==', country)
      .get();

    const totalRevenue = revenueSnapshot.docs.reduce((sum, doc) => 
      sum + (doc.data().netAmount || 0), 0);

    const totalVAT = revenueSnapshot.docs.reduce((sum, doc) => 
      sum + (doc.data().vatAmount || 0), 0);

    // Get payouts (costs)
    const payoutsSnapshot = await db.collection('payouts')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .where('countryCode', '==', country)
      .where('status', '==', 'completed')
      .get();

    const totalPayouts = payoutsSnapshot.docs.reduce((sum, doc) => 
      sum + (doc.data().amount || 0), 0);

    // Get withholdings (tax collected)
    const withholdingsSnapshot = await db.collection('taxWithholdings')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .where('countryCode', '==', country)
      .get();

    const totalWithholdings = withholdingsSnapshot.docs.reduce((sum, doc) => 
      sum + (doc.data().amount || 0), 0);

    statements.push({
      country,
      periodStart: start,
      periodEnd: end,
      totalRevenue,
      totalVAT,
      totalPayouts,
      totalWithholdings,
      grossProfit: totalRevenue - totalPayouts,
      netProfit: totalRevenue - totalPayouts - totalVAT,
      transactionCount: revenueSnapshot.size,
      payoutCount: payoutsSnapshot.size
    });
  }

  return statements;
}

/**
 * Generate fraud tax risk report
 */
async function generateFraudTaxRiskReport(start: Date, end: Date, countries: string[]): Promise<any[]> {
  // Get high-risk creators
  let query = db.collection('creatorTaxProfiles')
    .where('fraudScore', '>', 50);

  const snapshot = await query.get();
  
  const riskData = await Promise.all(snapshot.docs.map(async doc => {
    const profile = doc.data();
    
    // Get recent payouts
    const payoutsSnapshot = await db.collection('payouts')
      .where('creatorId', '==', doc.id)
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .get();

    const totalPayouts = payoutsSnapshot.docs.reduce((sum, doc) => 
      sum + (doc.data().amount || 0), 0);

    // Get tax withholdings
    const withholdingsSnapshot = await db.collection('taxWithholdings')
      .where('creatorId', '==', doc.id)
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .get();

    const totalWithholdings = withholdingsSnapshot.docs.reduce((sum, doc) => 
      sum + (doc.data().amount || 0), 0);

    return {
      creatorId: doc.id,
      fraudScore: profile.fraudScore,
      suspiciousPatterns: profile.suspiciousPatternDetected ? 'Yes' : 'No',
      suspiciousDetails: profile.suspiciousPatternDetails || 'N/A',
      country: profile.countryCode,
      identityVerified: profile.identityVerified ? 'Yes' : 'No',
      totalPayouts,
      totalWithholdings,
      taxRisk: totalWithholdings < (totalPayouts * 0.1) ? 'High' : 'Normal',
      complianceFailures: profile.complianceFailures || 0,
      lastComplianceCheck: profile.lastComplianceCheck
    };
  }));

  return riskData.filter(data => 
    !countries || countries.length === 0 || countries.includes(data.country)
  );
}

/**
 * Helper functions
 */

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

function convertToXML(data: any[], rootElement: string): string {
  const xmlItems = data.map(item => {
    const fields = Object.entries(item)
      .map(([key, value]) => `    <${key}>${escapeXML(String(value))}</${key}>`)
      .join('\n');
    return `  <item>\n${fields}\n  </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n${xmlItems}\n</${rootElement}>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getContentType(format: string): string {
  switch (format) {
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    case 'xml': return 'application/xml';
    default: return 'text/plain';
  }
}

async function getAllActiveCountries(): Promise<string[]> {
  const snapshot = await db.collection('taxProfiles').get();
  return [...new Set(snapshot.docs.map(doc => doc.data().countryCode))];
}

/**
 * Scheduled export generation
 */
export const scheduledMonthlyExports = functions.pubsub
  .schedule('0 2 1 * *') // 2 AM on 1st of each month
  .onRun(async (context) => {
    functions.logger.info('Starting scheduled monthly tax exports');

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Generate VAT report
    const vatExportDoc = await db.collection('taxAuditExports').add({
      exportType: 'vat_report',
      periodStart: lastMonth,
      periodEnd: lastMonthEnd,
      countries: [],
      format: 'csv',
      status: 'pending',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: 'system'
    });

    await generateExportFile(
      vatExportDoc.id,
      'vat_report',
      lastMonth,
      lastMonthEnd,
      [],
      'csv'
    );

    // Generate profit statement
    const profitExportDoc = await db.collection('taxAuditExports').add({
      exportType: 'profit_statement',
      periodStart: lastMonth,
      periodEnd: lastMonthEnd,
      countries: [],
      format: 'csv',
      status: 'pending',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: 'system'
    });

    await generateExportFile(
      profitExportDoc.id,
      'profit_statement',
      lastMonth,
      lastMonthEnd,
      [],
      'csv'
    );

    functions.logger.info('Scheduled monthly tax exports completed');
  });
