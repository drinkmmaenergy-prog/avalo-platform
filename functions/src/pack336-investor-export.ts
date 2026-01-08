/**
 * PACK 336 — INVESTOR EXPORT PIPELINE
 * 
 * One-click investor report generation in PDF, CSV, and Google Sheets formats.
 * Includes:
 * - Last 30/90/180 days metrics
 * - Revenue by stream
 * - Cohort performance
 * - Country breakdown
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init.js';
import type { InvestorReportData, ExportOptions } from './pack336-types.js';

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * Generate comprehensive investor report
 */
export async function generateInvestorReport(
  periodDays: 30 | 90 | 180
): Promise<InvestorReportData> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  console.log(`[PACK 336] Generating investor report for ${startDateStr} to ${endDateStr}`);
  
  // Get daily global KPIs for the period
  const dailyGlobalSnapshot = await db.collection('kpiDailyGlobal')
    .where('date', '>=', startDateStr)
    .where('date', '<=', endDateStr)
    .orderBy('date', 'asc')
    .get();
  
  // Aggregate summary metrics
  let totalRevenue = 0;
  let totalActiveUsers = 0;
  let totalPayingUsers = 0;
  let totalRegisteredUsers = 0;
  
  dailyGlobalSnapshot.docs.forEach(doc => {
    const data = doc.data();
    totalRevenue += data.totalRevenuePLN || 0;
    totalActiveUsers = Math.max(totalActiveUsers, data.activeUsersMAU || 0);
    totalPayingUsers = Math.max(totalPayingUsers, data.payingUsersMAU || 0);
    totalRegisteredUsers = Math.max(totalRegisteredUsers, data.registeredUsersTotal || 0);
  });
  
  const avgRevenuePerUser = totalActiveUsers > 0 ? totalRevenue / totalActiveUsers : 0;
  
  // Get revenue by stream
  const revenueStreamsSnapshot = await db.collection('kpiRevenueStreams')
    .where('date', '>=', startDateStr)
    .where('date', '<=', endDateStr)
    .get();
  
  const revenueByStream: Record<string, number> = {
    chat: 0,
    voice: 0,
    video: 0,
    calendar: 0,
    events: 0,
    ai: 0,
    subscriptions: 0,
    tips: 0,
  };
  
  revenueStreamsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    revenueByStream.chat += data.chatRevenuePLN || 0;
    revenueByStream.voice += data.voiceRevenuePLN || 0;
    revenueByStream.video += data.videoRevenuePLN || 0;
    revenueByStream.calendar += data.calendarRevenuePLN || 0;
    revenueByStream.events += data.eventsRevenuePLN || 0;
    revenueByStream.ai += data.aiRevenuePLN || 0;
    revenueByStream.subscriptions += data.subscriptionsPLN || 0;
    revenueByStream.tips += data.tipsRevenuePLN || 0;
  });
  
  // Get cohort performance
  const cohortsSnapshot = await db.collection('kpiCohorts')
    .orderBy('cohortId', 'desc')
    .limit(12) // Last 12 weeks
    .get();
  
  const cohortData = cohortsSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      cohort: data.cohortId,
      retention: data.day30Retention || 0,
      revenue: data.revenueDay30PLN || 0,
    };
  });
  
  // Get country breakdown
  const countryBreakdownSnapshot = await db.collection('kpiDailyByCountry')
    .where('date', '>=', startDateStr)
    .where('date', '<=', endDateStr)
    .get();
  
  const countryAggregates = new Map<string, { users: number; revenue: number }>();
  
  countryBreakdownSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const country = data.country;
    const existing = countryAggregates.get(country) || { users: 0, revenue: 0 };
    
    countryAggregates.set(country, {
      users: Math.max(existing.users, data.usersActive || 0),
      revenue: existing.revenue + (data.revenuePLN || 0),
    });
  });
  
  const countryBreakdown = Array.from(countryAggregates.entries())
    .map(([country, data]) => ({
      country,
      users: data.users,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  
  // Calculate growth metrics
  const firstDay = dailyGlobalSnapshot.docs[0]?.data();
  const lastDay = dailyGlobalSnapshot.docs[dailyGlobalSnapshot.docs.length - 1]?.data();
  
  const userGrowthPercent = firstDay && lastDay
    ? ((lastDay.registeredUsersTotal - firstDay.registeredUsersTotal) / firstDay.registeredUsersTotal) * 100
    : 0;
  
  const revenueGrowthPercent = firstDay && lastDay && firstDay.totalRevenuePLN > 0
    ? ((lastDay.totalRevenuePLN - firstDay.totalRevenuePLN) / firstDay.totalRevenuePLN) * 100
    : 0;
  
  // Get average k-factor
  const viralitySnapshot = await db.collection('kpiVirality')
    .where('date', '>=', startDateStr)
    .where('date', '<=', endDateStr)
    .get();
  
  const avgKFactor = viralitySnapshot.docs.length > 0
    ? viralitySnapshot.docs.reduce((sum, doc) => sum + (doc.data().kFactor || 0), 0) / viralitySnapshot.docs.length
    : 0;
  
  return {
    reportId: generateReportId(),
    generatedAt: serverTimestamp() as any,
    periodStart: startDateStr,
    periodEnd: endDateStr,
    summary: {
      totalUsers: totalRegisteredUsers,
      activeUsers: totalActiveUsers,
      payingUsers: totalPayingUsers,
      totalRevenuePLN: totalRevenue,
      avgRevenuePerUser,
    },
    revenueByStream,
    cohortData,
    countryBreakdown,
    growthMetrics: {
      userGrowthPercent,
      revenueGrowthPercent,
      kFactor: avgKFactor,
    },
  };
}

/**
 * Export report to CSV format
 */
export async function exportReportToCSV(
  reportData: InvestorReportData
): Promise<string> {
  const lines: string[] = [];
  
  // Header
  lines.push('AVALO INVESTOR REPORT');
  lines.push(`Period: ${reportData.periodStart} to ${reportData.periodEnd}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  
  // Summary
  lines.push('SUMMARY');
  lines.push('Metric,Value');
  lines.push(`Total Users,${reportData.summary.totalUsers}`);
  lines.push(`Active Users,${reportData.summary.activeUsers}`);
  lines.push(`Paying Users,${reportData.summary.payingUsers}`);
  lines.push(`Total Revenue (PLN),${reportData.summary.totalRevenuePLN.toFixed(2)}`);
  lines.push(`Avg Revenue Per User (PLN),${reportData.summary.avgRevenuePerUser.toFixed(2)}`);
  lines.push('');
  
  // Revenue by stream
  lines.push('REVENUE BY STREAM');
  lines.push('Stream,Revenue (PLN)');
  Object.entries(reportData.revenueByStream).forEach(([stream, revenue]) => {
    lines.push(`${stream},${revenue.toFixed(2)}`);
  });
  lines.push('');
  
  // Country breakdown
  lines.push('COUNTRY BREAKDOWN');
  lines.push('Country,Users,Revenue (PLN)');
  reportData.countryBreakdown.forEach(country => {
    lines.push(`${country.country},${country.users},${country.revenue.toFixed(2)}`);
  });
  lines.push('');
  
  // Cohort performance
  lines.push('COHORT PERFORMANCE');
  lines.push('Cohort,Retention (%),Revenue (PLN)');
  reportData.cohortData.forEach(cohort => {
    lines.push(`${cohort.cohort},${cohort.retention.toFixed(2)},${cohort.revenue.toFixed(2)}`);
  });
  lines.push('');
  
  // Growth metrics
  lines.push('GROWTH METRICS');
  lines.push('Metric,Value');
  lines.push(`User Growth (%),"${reportData.growthMetrics.userGrowthPercent.toFixed(2)}"`);
  lines.push(`Revenue Growth (%),"${reportData.growthMetrics.revenueGrowthPercent.toFixed(2)}"`);
  lines.push(`K-Factor,${reportData.growthMetrics.kFactor.toFixed(2)}`);
  
  return lines.join('\n');
}

/**
 * Export report to PDF format (stub for future implementation)
 */
export async function exportReportToPDF(
  reportData: InvestorReportData
): Promise<Buffer> {
  // TODO: Implement PDF generation using library like pdfkit or puppeteer
  throw new Error('PDF export not yet implemented');
}

/**
 * Export report to Google Sheets (stub for future implementation)
 */
export async function exportReportToGoogleSheets(
  reportData: InvestorReportData
): Promise<string> {
  // TODO: Implement Google Sheets API integration
  throw new Error('Google Sheets export not yet implemented');
}

/**
 * Generate unique report ID
 */
function generateReportId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `INV-${timestamp}-${random}`;
}

// ============================================================================
// CALLABLE ENDPOINTS
// ============================================================================

/**
 * Generate and export investor report (admin only)
 */
export const pack336_exportInvestorReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { format, periodDays, includeCountryBreakdown, includeCohortAnalysis } = data;
  
  if (!format || !['PDF', 'CSV', 'GOOGLE_SHEETS'].includes(format)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid format. Must be PDF, CSV, or GOOGLE_SHEETS');
  }
  
  if (!periodDays || ![30, 90, 180].includes(periodDays)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid periodDays. Must be 30, 90, or 180');
  }
  
  try {
    console.log(`[PACK 336] Generating ${format} investor report for ${periodDays} days`);
    
    // Generate report data
    const reportData = await generateInvestorReport(periodDays);
    
    // Filter data based on options
    if (!includeCountryBreakdown) {
      reportData.countryBreakdown = [];
    }
    
    if (!includeCohortAnalysis) {
      reportData.cohortData = [];
    }
    
    // Store report metadata
    const reportRef = await db.collection('investorReports').add({
      ...reportData,
      format,
      requestedBy: context.auth.uid,
      status: 'generated',
    });
    
    let exportUrl: string | null = null;
    let exportData: string | null = null;
    
    // Export based on format
    switch (format) {
      case 'CSV':
        exportData = await exportReportToCSV(reportData);
        
        // Store CSV in Cloud Storage
        const admin = await import('firebase-admin');
        const bucket = admin.storage().bucket();
        const fileName = `investor-reports/${reportData.reportId}.csv`;
        const file = bucket.file(fileName);
        
        await file.save(exportData, {
          contentType: 'text/csv',
          metadata: {
            reportId: reportData.reportId,
            generatedBy: context.auth.uid,
          },
        });
        
        // Generate signed URL (valid for 7 days)
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        
        exportUrl = url;
        break;
      
      case 'PDF':
        throw new functions.https.HttpsError('unimplemented', 'PDF export not yet implemented');
      
      case 'GOOGLE_SHEETS':
        throw new functions.https.HttpsError('unimplemented', 'Google Sheets export not yet implemented');
    }
    
    // Update report with export URL
    await reportRef.update({
      exportUrl,
      exportGeneratedAt: serverTimestamp(),
    });
    
    console.log(`[PACK 336] Report ${reportData.reportId} exported successfully`);
    
    return {
      success: true,
      reportId: reportData.reportId,
      exportUrl,
      format,
      periodDays,
      summary: reportData.summary,
    } as any;
  } catch (error: any) {
    console.error('[PACK 336] Error generating investor report:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get list of generated investor reports (admin only)
 */
export const pack336_getInvestorReports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { limit } = data;
  
  try {
    const reportsSnapshot = await db.collection('investorReports')
      .orderBy('generatedAt', 'desc')
      .limit(limit || 20)
      .get();
    
    const reports = reportsSnapshot.docs.map(doc => ({
      id: doc.id,
      reportId: doc.data().reportId,
      periodStart: doc.data().periodStart,
      periodEnd: doc.data().periodEnd,
      format: doc.data().format,
      generatedAt: doc.data().generatedAt,
      exportUrl: doc.data().exportUrl,
      summary: doc.data().summary,
    }));
    
    return { success: true, reports };
  } catch (error: any) {
    console.error('[PACK 336] Error getting investor reports:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get specific investor report by ID (admin only)
 */
export const pack336_getInvestorReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { reportId } = data;
  
  if (!reportId) {
    throw new functions.https.HttpsError('invalid-argument', 'reportId is required');
  }
  
  try {
    const reportsSnapshot = await db.collection('investorReports')
      .where('reportId', '==', reportId)
      .limit(1)
      .get();
    
    if (reportsSnapshot.empty) {
      throw new functions.https.HttpsError('not-found', 'Report not found');
    }
    
    const reportDoc = reportsSnapshot.docs[0];
    
    return {
      success: true,
      report: {
        id: reportDoc.id,
        ...reportDoc.data(),
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting investor report:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Quick investor summary (admin only)
 * Returns key metrics without generating full report
 */
export const pack336_getInvestorSummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { periodDays } = data;
  
  if (!periodDays || ![30, 90, 180].includes(periodDays)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid periodDays. Must be 30, 90, or 180');
  }
  
  try {
    const reportData = await generateInvestorReport(periodDays);
    
    return {
      success: true,
      summary: reportData.summary,
      growthMetrics: reportData.growthMetrics,
      periodStart: reportData.periodStart,
      periodEnd: reportData.periodEnd,
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting investor summary:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});