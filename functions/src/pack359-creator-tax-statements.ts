import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 359 — Legal Compliance: Creator Tax Statements
 * 
 * Generates monthly tax statements for earners with:
 * - Earnings breakdown
 * - Platform fees
 * - Tax withholding
 * - Export to PDF, CSV, XML
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getUserJurisdiction } from './pack359-jurisdiction-engine';
import { FieldValue, HttpsError, auth, onCall, serverTimestamp, timestamp, onSchedule } from './runtime';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CreatorTaxStatement {
  userId: string;
  period: string; // YYYY-MM format
  year: number;
  month: number;
  grossEarnings: number;
  platformFees: number;
  taxableIncome: number;
  withheldTax: number;
  netPaidOut: number;
  country: string;
  currency: string;
  transactionCount: number;
  breakdownByType: {
    calendar_bookings: number;
    ai_chats: number;
    video_calls: number;
    subscriptions: number;
    tips: number;
  };
  generatedAt: Date;
  statementId: string;
}

export interface TaxStatementExport {
  format: 'pdf' | 'csv' | 'xml';
  data: string | Buffer;
  filename: string;
  mimeType: string;
}

export interface AnnualTaxSummary {
  userId: string;
  year: number;
  totalGrossEarnings: number;
  totalPlatformFees: number;
  totalTaxableIncome: number;
  totalWithheldTax: number;
  totalNetPaidOut: number;
  monthlyStatements: CreatorTaxStatement[];
  country: string;
  currency: string;
}

// ============================================================================
// STATEMENT GENERATION
// ============================================================================

/**
 * Generate monthly tax statement for earner
 */
export async function generateMonthlyStatement(
  earnerId: string,
  year: number,
  month: number
): Promise<CreatorTaxStatement> {
  // Get earner's tax summary for the period
  const summaryId = `${earnerId}_${year}_${month}`;
  const summaryDoc = await db.collection('earner_tax_summaries').doc(summaryId).get();
  
  if (!summaryDoc.exists) {
    throw new Error(`No tax data found for ${earnerId} in ${year}-${month}`);
  }
  
  const summaryData = summaryDoc.data()!;
  const { profile } = await getUserJurisdiction(earnerId);
  
  // Get transaction breakdown by type
  const breakdownByType = await getEarningsBreakdown(earnerId, year, month);
  
  const statement: CreatorTaxStatement = {
    userId: earnerId,
    period: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    grossEarnings: summaryData.grossEarnings || 0,
    platformFees: summaryData.platformFees || 0,
    taxableIncome: summaryData.taxableIncome || 0,
    withheldTax: summaryData.withheldTax || 0,
    netPaidOut: summaryData.netPaidOut || 0,
    country: profile.countryCode,
    currency: profile.currency,
    transactionCount: summaryData.transactionCount || 0,
    breakdownByType,
    generatedAt: new Date(),
    statementId: `${earnerId}_${year}_${month}_${Date.now()}`,
  };
  
  // Store the statement
  await db.collection('tax_statements').doc(statement.statementId).set({
    ...statement,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return statement;
}

/**
 * Generate annual tax summary for earner
 */
export async function generateAnnualSummary(
  earnerId: string,
  year: number
): Promise<AnnualTaxSummary> {
  const monthlyStatements: CreatorTaxStatement[] = [];
  
  // Generate statements for all 12 months
  for (let month = 1; month <= 12; month++) {
    try {
      const statement = await generateMonthlyStatement(earnerId, year, month);
      monthlyStatements.push(statement);
    } catch (error) {
      // Month has no data, skip it
      console.log(`No data for ${year}-${month}`);
    }
  }
  
  if (monthlyStatements.length === 0) {
    throw new Error(`No tax data found for ${earnerId} in ${year}`);
  }
  
  // Calculate annual totals
  const totalGrossEarnings = monthlyStatements.reduce((sum, s) => sum + s.grossEarnings, 0);
  const totalPlatformFees = monthlyStatements.reduce((sum, s) => sum + s.platformFees, 0);
  const totalTaxableIncome = monthlyStatements.reduce((sum, s) => sum + s.taxableIncome, 0);
  const totalWithheldTax = monthlyStatements.reduce((sum, s) => sum + s.withheldTax, 0);
  const totalNetPaidOut = monthlyStatements.reduce((sum, s) => sum + s.netPaidOut, 0);
  
  const { profile } = await getUserJurisdiction(earnerId);
  
  const annualSummary: AnnualTaxSummary = {
    userId: earnerId,
    year,
    totalGrossEarnings,
    totalPlatformFees,
    totalTaxableIncome,
    totalWithheldTax,
    totalNetPaidOut,
    monthlyStatements,
    country: profile.countryCode,
    currency: profile.currency,
  };
  
  // Store annual summary
  await db.collection('annual_tax_summaries').doc(`${earnerId}_${year}`).set({
    ...annualSummary,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return annualSummary;
}

/**
 * Get earnings breakdown by transaction type
 */
async function getEarningsBreakdown(
  earnerId: string,
  year: number,
  month: number
): Promise<CreatorTaxStatement['breakdownByType']> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const transactions = await db.collection('tax_ledger')
    .where('earnerId', '==', earnerId)
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .get();
  
  const breakdown = {
    calendar_bookings: 0,
    ai_chats: 0,
    video_calls: 0,
    subscriptions: 0,
    tips: 0,
  };
  
  transactions.forEach(doc => {
    const tx = doc.data();
    const earnings = tx.taxBreakdown?.grossEarnings || 0;
    
    switch (tx.type) {
      case 'calendar_booking':
        breakdown.calendar_bookings += earnings;
        break;
      case 'ai_chat':
        breakdown.ai_chats += earnings;
        break;
      case 'video_call':
        breakdown.video_calls += earnings;
        break;
      case 'subscription':
        breakdown.subscriptions += earnings;
        break;
      default:
        breakdown.tips += earnings;
    }
  });
  
  return breakdown;
}

// ============================================================================
// EXPORT FORMATS
// ============================================================================

/**
 * Export statement as CSV
 */
export function exportAsCSV(statement: CreatorTaxStatement): TaxStatementExport {
  const lines = [
    'Creator Tax Statement',
    `Period,${statement.period}`,
    `Creator ID,${statement.userId}`,
    `Country,${statement.country}`,
    `Currency,${statement.currency}`,
    '',
    'Summary',
    `Gross Earnings,${statement.grossEarnings.toFixed(2)}`,
    `Platform Fees,${statement.platformFees.toFixed(2)}`,
    `Taxable Income,${statement.taxableIncome.toFixed(2)}`,
    `Withheld Tax,${statement.withheldTax.toFixed(2)}`,
    `Net Paid Out,${statement.netPaidOut.toFixed(2)}`,
    `Transaction Count,${statement.transactionCount}`,
    '',
    'Breakdown by Type',
    `Calendar Bookings,${statement.breakdownByType.calendar_bookings.toFixed(2)}`,
    `AI Chats,${statement.breakdownByType.ai_chats.toFixed(2)}`,
    `Video Calls,${statement.breakdownByType.video_calls.toFixed(2)}`,
    `Subscriptions,${statement.breakdownByType.subscriptions.toFixed(2)}`,
    `Tips,${statement.breakdownByType.tips.toFixed(2)}`,
  ];
  
  const csv = lines.join('\n');
  
  return {
    format: 'csv',
    data: csv,
    filename: `tax_statement_${statement.period}.csv`,
    mimeType: 'text/csv',
  };
}

/**
 * Export statement as XML (for accounting software)
 */
export function exportAsXML(statement: CreatorTaxStatement): TaxStatementExport {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TaxStatement>
  <Period>${statement.period}</Period>
  <CreatorId>${statement.userId}</CreatorId>
  <Country>${statement.country}</Country>
  <Currency>${statement.currency}</Currency>
  <Summary>
    <GrossEarnings>${statement.grossEarnings.toFixed(2)}</GrossEarnings>
    <PlatformFees>${statement.platformFees.toFixed(2)}</PlatformFees>
    <TaxableIncome>${statement.taxableIncome.toFixed(2)}</TaxableIncome>
    <WithheldTax>${statement.withheldTax.toFixed(2)}</WithheldTax>
    <NetPaidOut>${statement.netPaidOut.toFixed(2)}</NetPaidOut>
    <TransactionCount>${statement.transactionCount}</TransactionCount>
  </Summary>
  <BreakdownByType>
    <CalendarBookings>${statement.breakdownByType.calendar_bookings.toFixed(2)}</CalendarBookings>
    <AIChats>${statement.breakdownByType.ai_chats.toFixed(2)}</AIChats>
    <VideoCalls>${statement.breakdownByType.video_calls.toFixed(2)}</VideoCalls>
    <Subscriptions>${statement.breakdownByType.subscriptions.toFixed(2)}</Subscriptions>
    <Tips>${statement.breakdownByType.tips.toFixed(2)}</Tips>
  </BreakdownByType>
  <GeneratedAt>${statement.generatedAt.toISOString()}</GeneratedAt>
</TaxStatement>`;
  
  return {
    format: 'xml',
    data: xml,
    filename: `tax_statement_${statement.period}.xml`,
    mimeType: 'application/xml',
  };
}

/**
 * Export statement as PDF (simplified text-based version)
 * In production, use a PDF library like pdfkit or puppeteer
 */
export function exportAsPDF(statement: CreatorTaxStatement): TaxStatementExport {
  // This is a placeholder - in production, generate actual PDF
  const text = `
CREATOR TAX STATEMENT
Period: ${statement.period}
Creator ID: ${statement.userId}
Country: ${statement.country}
Currency: ${statement.currency}

SUMMARY
-------
Gross Earnings:    ${statement.currency} ${statement.grossEarnings.toFixed(2)}
Platform Fees:     ${statement.currency} ${statement.platformFees.toFixed(2)}
Taxable Income:    ${statement.currency} ${statement.taxableIncome.toFixed(2)}
Withheld Tax:      ${statement.currency} ${statement.withheldTax.toFixed(2)}
Net Paid Out:      ${statement.currency} ${statement.netPaidOut.toFixed(2)}

Transaction Count: ${statement.transactionCount}

BREAKDOWN BY TYPE
-----------------
Calendar Bookings: ${statement.currency} ${statement.breakdownByType.calendar_bookings.toFixed(2)}
AI Chats:          ${statement.currency} ${statement.breakdownByType.ai_chats.toFixed(2)}
Video Calls:       ${statement.currency} ${statement.breakdownByType.video_calls.toFixed(2)}
Subscriptions:     ${statement.currency} ${statement.breakdownByType.subscriptions.toFixed(2)}
Tips:              ${statement.currency} ${statement.breakdownByType.tips.toFixed(2)}

Generated: ${statement.generatedAt.toISOString()}
`;
  
  return {
    format: 'pdf',
    data: text,
    filename: `tax_statement_${statement.period}.pdf`,
    mimeType: 'application/pdf',
  };
}

/**
 * Export annual summary as CSV
 */
export function exportAnnualSummaryAsCSV(summary: AnnualTaxSummary): TaxStatementExport {
  const lines = [
    'Annual Tax Summary',
    `Year,${summary.year}`,
    `Creator ID,${summary.userId}`,
    `Country,${summary.country}`,
    `Currency,${summary.currency}`,
    '',
    'Annual Totals',
    `Total Gross Earnings,${summary.totalGrossEarnings.toFixed(2)}`,
    `Total Platform Fees,${summary.totalPlatformFees.toFixed(2)}`,
    `Total Taxable Income,${summary.totalTaxableIncome.toFixed(2)}`,
    `Total Withheld Tax,${summary.totalWithheldTax.toFixed(2)}`,
    `Total Net Paid Out,${summary.totalNetPaidOut.toFixed(2)}`,
    '',
    'Monthly Breakdown',
    'Month,Gross Earnings,Platform Fees,Taxable Income,Withheld Tax,Net Paid Out',
  ];
  
  summary.monthlyStatements.forEach(statement => {
    lines.push(
      `${statement.period},${statement.grossEarnings.toFixed(2)},${statement.platformFees.toFixed(2)},${statement.taxableIncome.toFixed(2)},${statement.withheldTax.toFixed(2)},${statement.netPaidOut.toFixed(2)}`
    );
  });
  
  const csv = lines.join('\n');
  
  return {
    format: 'csv',
    data: csv,
    filename: `annual_tax_summary_${summary.year}.csv`,
    mimeType: 'text/csv',
  };
}

// ============================================================================
// AUTOMATED STATEMENT GENERATION
// ============================================================================

/**
 * Automatically generate statements at month end
 * Run this as a scheduled function on the 1st of each month
 */
export const generateMonthlyStatements = onSchedule({ schedule: "0 0 1 * *", timeZone: "UTC" }, async (event) => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;
    
    console.log(`Generating tax statements for ${year}-${month}`);
    
    // Get all earners with earnings in the last month
    const summaries = await db.collection('earner_tax_summaries')
      .where('year', '==', year)
      .where('month', '==', month)
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    for (const doc of summaries.docs) {
      const earnerId = doc.data().earnerId;
      
      try {
        const statement = await generateMonthlyStatement(earnerId, year, month);
        
        // Notify earner
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
          userId: earnerId,
          type: 'tax_statement_ready',
          title: 'Monthly Tax Statement Available',
          message: `Your tax statement for ${statement.period} is now available for download.`,
          data: {
            statementId: statement.statementId,
            period: statement.period,
          },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        count++;
      } catch (error) {
        console.error(`Failed to generate statement for ${earnerId}:`, error);
      }
    }
    
    await batch.commit();
    console.log(`Generated ${count} tax statements`);
  });

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Get earner's tax statement for a specific period
 */
export const getCreatorStatement = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { year, month } = data;
  const earnerId = request.auth.uid;
  
  if (!year || !month) {
    throw new functions.https.HttpsError('invalid-argument', 'Year and month required');
  }
  
  try {
    const statement = await generateMonthlyStatement(earnerId, year, month);
    return statement;
  } catch (error) {
    throw new functions.https.HttpsError('not-found', 'No tax data found for this period');
  }
});

/**
 * Export earner's tax statement in specified format
 */
export const exportStatement = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { year, month, format } = data;
  const earnerId = request.auth.uid;
  
  if (!year || !month || !format) {
    throw new functions.https.HttpsError('invalid-argument', 'Year, month, and format required');
  }
  
  if (!['csv', 'xml', 'pdf'].includes(format)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid format');
  }
  
  const statement = await generateMonthlyStatement(earnerId, year, month);
  
  let exportData: TaxStatementExport;
  
  switch (format) {
    case 'csv':
      exportData = exportAsCSV(statement);
      break;
    case 'xml':
      exportData = exportAsXML(statement);
      break;
    case 'pdf':
      exportData = exportAsPDF(statement);
      break;
    default:
      throw new functions.https.HttpsError('invalid-argument', 'Invalid format');
  }
  
  return {
    data: exportData.data,
    filename: exportData.filename,
    mimeType: exportData.mimeType,
  };
});

/**
 * Get earner's annual tax summary
 */
export const getAnnualSummary = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { year } = data;
  const earnerId = request.auth.uid;
  
  if (!year) {
    throw new functions.https.HttpsError('invalid-argument', 'Year required');
  }
  
  try {
    const summary = await generateAnnualSummary(earnerId, year);
    return summary;
  } catch (error) {
    throw new functions.https.HttpsError('not-found', 'No tax data found for this year');
  }
});

/**
 * List all available tax statements for earner
 */
export const listCreatorStatements = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const earnerId = request.auth.uid;
  
  const statements = await db.collection('tax_statements')
    .where('userId', '==', earnerId)
    .orderBy('year', 'desc')
    .orderBy('month', 'desc')
    .limit(24) // Last 2 years
    .get();
  
  return statements.docs.map(doc => doc.data());
});

























