/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Tax Report Generation and Export Functions
 * 
 * Generates region-specific tax reports and exports them in various formats
 */

import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  TaxReport,
  TaxReportGenerationRequest,
  TaxDocumentType,
  TaxExportLog,
  AnonymizedRevenueSource,
  REVENUE_CATEGORY_LABELS
} from './types';
import { getTaxProfile } from './tax-profile';
import {
  calculateYearlyTaxSummary,
  generateAnonymizedRevenueSources
} from './tax-calculation';
import { getReportType } from './tax-rules';

export async function generateTaxReport(
  request: TaxReportGenerationRequest
): Promise<{ success: boolean; report?: TaxReport; error?: string }> {
  try {
    const { userId, reportType, taxYear, taxQuarter } = request;

    const profile = await getTaxProfile(userId);
    
    if (!profile) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    if (profile.locked) {
      return {
        success: false,
        error: 'Tax profile is locked'
      };
    }

    if (profile.verificationStatus !== 'verified') {
      return {
        success: false,
        error: 'Tax profile not verified'
      };
    }

    const periodStart = taxQuarter
      ? new Date(taxYear, (taxQuarter - 1) * 3, 1)
      : new Date(taxYear, 0, 1);
    
    const periodEnd = taxQuarter
      ? new Date(taxYear, taxQuarter * 3, 0, 23, 59, 59)
      : new Date(taxYear, 11, 31, 23, 59, 59);

    const summary = await calculateYearlyTaxSummary(userId, taxYear);
    const anonymizedSources = await generateAnonymizedRevenueSources(
      userId,
      periodStart,
      periodEnd
    );

    const reportData = await generateReportDataByType(
      reportType,
      profile,
      summary,
      anonymizedSources,
      taxYear,
      taxQuarter
    );

    const report: Omit<TaxReport, 'id'> = {
      userId,
      reportType,
      taxYear,
      taxQuarter,
      periodStart,
      periodEnd,
      totalRevenue: summary.totalGrossRevenue,
      totalTransactions: anonymizedSources.reduce((sum, s) => sum + s.transactionCount, 0),
      currency: 'USD',
      anonymizedSources,
      liability: {
        vatAmount: summary.totalVAT > 0 ? summary.totalVAT : undefined,
        gstAmount: summary.totalGST > 0 ? summary.totalGST : undefined,
        estimatedIncomeTax: undefined
      },
      reportData,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      downloaded: false,
      downloadCount: 0
    };

    const docRef = await db.collection('tax_reports').add({
      ...report,
      generatedAt: FieldValue.serverTimestamp(),
      expiresAt: FieldValue.serverTimestamp(),
      periodStart: FieldValue.serverTimestamp(),
      periodEnd: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'report_generated',
      eventData: {
        reportId: docRef.id,
        reportType,
        taxYear,
        taxQuarter
      }
    });

    return {
      success: true,
      report: {
        id: docRef.id,
        ...report
      }
    };
  } catch (error) {
    console.error('Error generating tax report:', error);
    return {
      success: false,
      error: 'Failed to generate tax report'
    };
  }
}

async function generateReportDataByType(
  reportType: TaxDocumentType,
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number,
  taxQuarter?: number
): Promise<Record<string, any>> {
  switch (reportType) {
    case 'VAT_MOSS':
      return generateVATMOSSReport(profile, summary, sources, taxYear, taxQuarter);
    
    case 'HMRC_DIGITAL':
      return generateHMRCDigitalReport(profile, summary, sources, taxYear, taxQuarter);
    
    case '1099K_SUMMARY':
      return generate1099KReport(profile, summary, sources, taxYear);
    
    case 'GST_HST':
      return generateGSTHSTReport(profile, summary, sources, taxYear, taxQuarter);
    
    case 'BAS_SUMMARY':
      return generateBASReport(profile, summary, sources, taxYear, taxQuarter);
    
    case 'LOCAL_INCOME':
    case 'DIGITAL_GOODS':
      return generateLocalIncomeReport(profile, summary, sources, taxYear);
    
    default:
      return generateLocalIncomeReport(profile, summary, sources, taxYear);
  }
}

function generateVATMOSSReport(
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number,
  taxQuarter?: number
): Record<string, any> {
  return {
    reportName: 'EU VAT MOSS Report',
    taxYear,
    taxQuarter,
    traderDetails: {
      name: profile.legalFullName,
      vatNumber: profile.vatNumber,
      country: profile.taxResidencyCountry
    },
    totalSupplies: summary.totalGrossRevenue,
    vatDue: summary.totalVAT,
    suppliesByMemberState: Object.entries(summary.revenueByCountry)
      .filter(([country]) => isEUCountry(country))
      .map(([country, amount]) => ({
        memberState: country,
        totalValue: amount as number,
        vatRate: getVATRateForCountry(country),
        vatAmount: (amount as number) * getVATRateForCountry(country)
      })),
    digitalServices: sources.map(s => ({
      category: REVENUE_CATEGORY_LABELS[s.category],
      country: s.sourceCountry,
      revenue: s.amount,
      transactionCount: s.transactionCount
    })),
    declarationDate: new Date().toISOString().split('T')[0]
  };
}

function generateHMRCDigitalReport(
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number,
  taxQuarter?: number
): Record<string, any> {
  return {
    reportName: 'HMRC Digital Services Report',
    taxYear,
    taxQuarter,
    businessDetails: {
      name: profile.legalFullName,
      vatNumber: profile.vatNumber,
      country: profile.taxResidencyCountry
    },
    digitalServices: {
      totalRevenue: summary.totalGrossRevenue,
      vatCharged: summary.totalVAT,
      netRevenue: summary.totalNetRevenue
    },
    suppliesByCategory: Object.entries(summary.revenueByCategory).map(([cat, amt]) => ({
      category: REVENUE_CATEGORY_LABELS[cat as keyof typeof REVENUE_CATEGORY_LABELS],
      amount: amt
    })),
    suppliesByCountry: sources.map(s => ({
      category: REVENUE_CATEGORY_LABELS[s.category],
      country: s.sourceCountry,
      revenue: s.amount,
      transactionCount: s.transactionCount
    })),
    submissionDate: new Date().toISOString().split('T')[0]
  };
}

function generate1099KReport(
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number
): Record<string, any> {
  return {
    reportName: 'Form 1099-K Summary Report',
    taxYear,
    payeeInformation: {
      name: profile.legalFullName,
      tin: profile.taxId,
      accountType: profile.accountType
    },
    grossAmount: summary.totalGrossRevenue,
    platformFees: summary.totalPlatformFee,
    netProceeds: summary.totalNetRevenue,
    numberOfTransactions: sources.reduce((sum, s) => sum + s.transactionCount, 0),
    revenueByCategory: Object.entries(summary.revenueByCategory).map(([cat, amt]) => ({
      category: REVENUE_CATEGORY_LABELS[cat as keyof typeof REVENUE_CATEGORY_LABELS],
      amount: amt
    })),
    internationalSales: sources
      .filter(s => s.sourceCountry !== 'US')
      .map(s => ({
        category: REVENUE_CATEGORY_LABELS[s.category],
        country: s.sourceCountry,
        revenue: s.amount
      })),
    reportDate: new Date().toISOString().split('T')[0]
  };
}

function generateGSTHSTReport(
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number,
  taxQuarter?: number
): Record<string, any> {
  return {
    reportName: 'GST/HST Report',
    taxYear,
    taxQuarter,
    businessDetails: {
      name: profile.legalFullName,
      businessNumber: profile.businessRegistrationNumber,
      gstNumber: profile.vatNumber
    },
    totalSupplies: summary.totalGrossRevenue,
    gstHstCollected: summary.totalGST,
    netTaxOwing: summary.totalGST,
    suppliesByProvince: Object.entries(summary.revenueByCountry)
      .filter(([country]) => country === 'CA')
      .map(([country, amount]) => ({
        province: 'All Provinces',
        amount: amount
      })),
    digitalServices: sources.map(s => ({
      category: REVENUE_CATEGORY_LABELS[s.category],
      country: s.sourceCountry,
      revenue: s.amount,
      transactionCount: s.transactionCount
    })),
    filingDate: new Date().toISOString().split('T')[0]
  };
}

function generateBASReport(
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number,
  taxQuarter?: number
): Record<string, any> {
  return {
    reportName: 'Business Activity Statement (BAS) Summary',
    taxYear,
    taxQuarter,
    businessDetails: {
      name: profile.legalFullName,
      abn: profile.businessRegistrationNumber,
      country: profile.taxResidencyCountry
    },
    gstOnSales: summary.totalGST,
    totalSales: summary.totalGrossRevenue,
    exportSales: sources
      .filter(s => s.sourceCountry !== 'AU')
      .reduce((sum, s) => sum + s.amount, 0),
    salesByCategory: Object.entries(summary.revenueByCategory).map(([cat, amt]) => ({
      category: REVENUE_CATEGORY_LABELS[cat as keyof typeof REVENUE_CATEGORY_LABELS],
      amount: amt
    })),
    internationalRevenue: sources
      .filter(s => s.sourceCountry !== 'AU')
      .map(s => ({
        category: REVENUE_CATEGORY_LABELS[s.category],
        country: s.sourceCountry,
        revenue: s.amount
      })),
    lodgementDate: new Date().toISOString().split('T')[0]
  };
}

function generateLocalIncomeReport(
  profile: any,
  summary: any,
  sources: AnonymizedRevenueSource[],
  taxYear: number
): Record<string, any> {
  return {
    reportName: 'Annual Income Statement',
    taxYear,
    individualDetails: {
      name: profile.legalFullName,
      country: profile.taxResidencyCountry,
      taxId: profile.taxId
    },
    grossIncome: summary.totalGrossRevenue,
    platformFees: summary.totalPlatformFee,
    netIncome: summary.totalNetRevenue,
    incomeByCategory: Object.entries(summary.revenueByCategory).map(([cat, amt]) => ({
      category: REVENUE_CATEGORY_LABELS[cat as keyof typeof REVENUE_CATEGORY_LABELS],
      amount: amt
    })),
    internationalIncome: sources.map(s => ({
      category: REVENUE_CATEGORY_LABELS[s.category],
      country: s.sourceCountry,
      revenue: s.amount,
      transactionCount: s.transactionCount
    })),
    reportDate: new Date().toISOString().split('T')[0]
  };
}

export async function exportTaxReport(
  reportId: string,
  userId: string,
  exportType: 'pdf' | 'csv' | 'json',
  ipAddress: string,
  userAgent: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const reportDoc = await db.collection('tax_reports').doc(reportId).get();
    
    if (!reportDoc.exists) {
      return {
        success: false,
        error: 'Report not found'
      };
    }

    const report = reportDoc.data() as TaxReport;
    
    if (report.userId !== userId) {
      return {
        success: false,
        error: 'Unauthorized access'
      };
    }

    await db.collection('tax_reports').doc(reportId).update({
      downloaded: true,
      downloadCount: FieldValue.increment(1),
      lastDownloadedAt: FieldValue.serverTimestamp()
    });

    const exportLog: Omit<TaxExportLog, 'id'> = {
      userId,
      reportId,
      exportType,
      exportedAt: new Date(),
      ipAddress,
      userAgent,
      regulatorRequest: false
    };

    await db.collection('tax_export_logs').add({
      ...exportLog,
      exportedAt: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'report_downloaded',
      eventData: {
        reportId,
        exportType
      }
    });

    let exportData: any;
    
    switch (exportType) {
      case 'json':
        exportData = report;
        break;
      case 'csv':
        exportData = convertReportToCSV(report);
        break;
      case 'pdf':
        exportData = { reportData: report.reportData };
        break;
    }

    return {
      success: true,
      data: exportData
    };
  } catch (error) {
    console.error('Error exporting tax report:', error);
    return {
      success: false,
      error: 'Failed to export tax report'
    };
  }
}

function convertReportToCSV(report: TaxReport): string {
  const lines: string[] = [];
  
  lines.push('Tax Report Summary');
  lines.push(`Report Type,${report.reportType}`);
  lines.push(`Tax Year,${report.taxYear}`);
  lines.push(`Total Revenue,${report.totalRevenue}`);
  lines.push(`Total Transactions,${report.totalTransactions}`);
  lines.push('');
  
  lines.push('Revenue Sources');
  lines.push('Category,Country,Amount,Transaction Count');
  
  for (const source of report.anonymizedSources) {
    lines.push(
      `${REVENUE_CATEGORY_LABELS[source.category]},${source.sourceCountry},${source.amount},${source.transactionCount}`
    );
  }
  
  return lines.join('\n');
}

function isEUCountry(country: string): boolean {
  const euCountries = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PL', 'SE', 'DK', 'FI', 'PT', 'GR', 'CZ', 'IE'];
  return euCountries.includes(country);
}

function getVATRateForCountry(country: string): number {
  const rates: Record<string, number> = {
    'DE': 0.19, 'FR': 0.20, 'ES': 0.21, 'IT': 0.22, 'NL': 0.21,
    'BE': 0.21, 'AT': 0.20, 'PL': 0.23, 'SE': 0.25, 'DK': 0.25,
    'FI': 0.24, 'PT': 0.23, 'GR': 0.24, 'CZ': 0.21, 'IE': 0.23
  };
  return rates[country] || 0.20;
}

async function logAuditTrail(data: {
  userId: string;
  eventType: 'report_generated' | 'report_downloaded';
  eventData: Record<string, any>;
}): Promise<void> {
  try {
    await db.collection('tax_audit_trail').add({
      ...data,
      timestamp: FieldValue.serverTimestamp(),
      performedBy: 'system'
    });
  } catch (error) {
    console.error('Error logging audit trail:', error);
  }
}

export async function getTaxReportsForUser(
  userId: string,
  taxYear?: number
): Promise<TaxReport[]> {
  try {
    let query = db
      .collection('tax_reports')
      .where('userId', '==', userId);

    if (taxYear) {
      query = query.where('taxYear', '==', taxYear);
    }

    const snapshot = await query
      .orderBy('generatedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      periodStart: doc.data().periodStart?.toDate(),
      periodEnd: doc.data().periodEnd?.toDate(),
      generatedAt: doc.data().generatedAt?.toDate(),
      expiresAt: doc.data().expiresAt?.toDate(),
      lastDownloadedAt: doc.data().lastDownloadedAt?.toDate()
    })) as TaxReport[];
  } catch (error) {
    console.error('Error fetching tax reports:', error);
    return [];
  }
}