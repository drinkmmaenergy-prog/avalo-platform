/**
 * PACK 105 — Creator Revenue Export System
 * 
 * VAT & Tax Compliance Exports for Creators
 * 
 * Business Rules:
 * - Factual data only (no tax advice)
 * - No auto-filing or tax estimation
 * - Read-only export for creator records
 * - Annual and custom date range exports
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, admin, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { CreatorRevenueExport, VATInvoiceData } from './pack105-types';
import { logRevenueExportRequested, logVatInvoiceGenerated } from './pack105-audit-logger';

// ============================================================================
// REVENUE EXPORT API
// ============================================================================

/**
 * Get creator revenue export for a specific year or date range
 */
export const getCreatorRevenueExport = onCall(
  {
    region: 'europe-west3',
    timeoutSeconds: 300,
    memory: '512MiB' as const,
  },
  async (request): Promise<CreatorRevenueExport> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { year, startDate, endDate, format } = request.data;

    if (!year && (!startDate || !endDate)) {
      throw new HttpsError(
        'invalid-argument',
        'Either year or startDate/endDate must be provided'
      );
    }

    try {
      let periodStart: Date;
      let periodEnd: Date;

      if (year) {
        periodStart = new Date(year, 0, 1);
        periodEnd = new Date(year, 11, 31, 23, 59, 59);
      } else {
        periodStart = new Date(startDate);
        periodEnd = new Date(endDate);
      }

      const revenueExport = await generateCreatorRevenueExport(
        userId,
        periodStart,
        periodEnd,
        year || new Date(periodStart).getFullYear()
      );

      await logRevenueExportRequested({
        userId,
        year: year || new Date(periodStart).getFullYear(),
        requestedFormat: format || 'json',
      });

      if (format === 'pdf' || format === 'csv') {
        const fileUrl = await generateExportFile(revenueExport, format);
        revenueExport.fileUrl = fileUrl;
      }

      logger.info('[RevenueExport] Generated export', {
        userId,
        year: year || 'custom',
        totalEarnings: revenueExport.summary.totalEarningsTokens,
      });

      return revenueExport;
    } catch (error: any) {
      logger.error('[RevenueExport] Failed to generate export', {
        error: error.message,
        userId,
      });
      throw new HttpsError('internal', `Failed to generate revenue export: ${error.message}`);
    }
  }
);

/**
 * Generate creator revenue export data
 */
async function generateCreatorRevenueExport(
  userId: string,
  startDate: Date,
  endDate: Date,
  year: number
): Promise<CreatorRevenueExport> {
  const startTimestamp = Timestamp.fromDate(startDate);
  const endTimestamp = Timestamp.fromDate(endDate);

  const earningsSnapshot = await db
    .collection('earnings_ledger')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<=', endTimestamp)
    .get();

  let totalEarningsTokens = 0;
  const breakdown = {
    gifts: 0,
    premiumStories: 0,
    paidMedia: 0,
    paidCalls: 0,
    aiCompanion: 0,
    other: 0,
  };

  earningsSnapshot.forEach(doc => {
    const entry = doc.data();
    const netTokens = entry.netTokensCreator || 0;
    totalEarningsTokens += netTokens;

    switch (entry.sourceType) {
      case 'GIFT':
        breakdown.gifts += netTokens;
        break;
      case 'PREMIUM_STORY':
        breakdown.premiumStories += netTokens;
        break;
      case 'PAID_MEDIA':
        breakdown.paidMedia += netTokens;
        break;
      case 'PAID_CALL':
        breakdown.paidCalls += netTokens;
        break;
      case 'AI_COMPANION':
        breakdown.aiCompanion += netTokens;
        break;
      default:
        breakdown.other += netTokens;
    }
  });

  const settlementRate = 0.2;
  const totalEarningsPLN = totalEarningsTokens * settlementRate;

  const payoutsSnapshot = await db
    .collection('payoutRequests')
    .where('userId', '==', userId)
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<=', endTimestamp)
    .where('status', 'in', ['completed', 'processing'])
    .get();

  let payoutsTotal = 0;
  const payouts: Array<{
    payoutId: string;
    date: string;
    amountPLN: number;
    method: string;
    status: string;
  }> = [];

  payoutsSnapshot.forEach(doc => {
    const payout = doc.data();
    const amountPLN = payout.amountPLN || 0;
    payoutsTotal += amountPLN;

    payouts.push({
      payoutId: doc.id,
      date: payout.createdAt.toDate().toISOString().split('T')[0],
      amountPLN,
      method: payout.method || 'unknown',
      status: payout.status,
    });
  });

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const userCountry = userData?.location?.country || 'UNKNOWN';

  const vatInfo = determineVATApplicability(userCountry, totalEarningsPLN);

  const revenueExport: CreatorRevenueExport = {
    userId,
    year,
    period: {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    },
    summary: {
      totalEarningsTokens,
      totalEarningsPLN,
      paidInteractions: earningsSnapshot.size,
      payoutsTotal,
      payoutsCount: payoutsSnapshot.size,
    },
    breakdown,
    vatInfo,
    payouts,
    generatedAt: Timestamp.now(),
  };

  return revenueExport;
}

/**
 * Determine VAT applicability based on jurisdiction
 */
function determineVATApplicability(
  country: string,
  earnings: number
): {
  applicable: boolean;
  jurisdiction?: string;
  vatNumber?: string;
  notes: string;
} {
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  ];

  const isEU = euCountries.includes(country);

  if (country === 'PL') {
    return {
      applicable: earnings >= 200000,
      jurisdiction: 'Poland',
      notes: 'VAT registration required if annual revenue exceeds 200,000 PLN. This is informational only - consult a tax advisor.',
    };
  }

  if (isEU) {
    return {
      applicable: true,
      jurisdiction: `EU - ${country}`,
      notes: 'EU VAT rules may apply. Revenue from digital services may be subject to local VAT. Consult a tax advisor for your specific situation.',
    };
  }

  return {
    applicable: false,
    notes: 'This is a factual revenue statement. Tax obligations vary by jurisdiction. Consult a qualified tax advisor for guidance.',
  };
}

/**
 * Generate export file (CSV or PDF)
 */
async function generateExportFile(
  revenueExport: CreatorRevenueExport,
  format: 'csv' | 'pdf'
): Promise<string> {
  try {
    const bucket = admin.storage().bucket();
    const fileName = `revenue_exports/${revenueExport.userId}/${revenueExport.year}_revenue.${format}`;

    let content: string;

    if (format === 'csv') {
      content = generateCSVContent(revenueExport);
    } else {
      content = generatePDFContent(revenueExport);
    }

    const file = bucket.file(fileName);
    await file.save(content, {
      contentType: format === 'csv' ? 'text/csv' : 'application/pdf',
      metadata: {
        userId: revenueExport.userId,
        year: revenueExport.year.toString(),
        generatedAt: new Date().toISOString(),
      },
    });

    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 72);

    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiryDate,
    });

    return downloadUrl;
  } catch (error: any) {
    logger.error('[RevenueExport] Failed to generate file', {
      error: error.message,
      userId: revenueExport.userId,
      format,
    });
    throw error;
  }
}

/**
 * Generate CSV content for revenue export
 */
function generateCSVContent(revenueExport: CreatorRevenueExport): string {
  const lines: string[] = [
    '# Avalo Creator Revenue Statement',
    `# Period: ${revenueExport.period.startDate} to ${revenueExport.period.endDate}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `Total Earnings (Tokens),${revenueExport.summary.totalEarningsTokens}`,
    `Total Earnings (PLN),${revenueExport.summary.totalEarningsPLN.toFixed(2)}`,
    `Paid Interactions,${revenueExport.summary.paidInteractions}`,
    `Payouts Total (PLN),${revenueExport.summary.payoutsTotal.toFixed(2)}`,
    `Payouts Count,${revenueExport.summary.payoutsCount}`,
    '',
    '## Breakdown by Source',
    `Gifts,${revenueExport.breakdown.gifts}`,
    `Premium Stories,${revenueExport.breakdown.premiumStories}`,
    `Paid Media,${revenueExport.breakdown.paidMedia}`,
    `Paid Calls,${revenueExport.breakdown.paidCalls}`,
    `AI Companion,${revenueExport.breakdown.aiCompanion}`,
    `Other,${revenueExport.breakdown.other}`,
    '',
    '## Payouts',
    'Date,Payout ID,Amount (PLN),Method,Status',
  ];

  revenueExport.payouts.forEach(payout => {
    lines.push(
      `${payout.date},${payout.payoutId},${payout.amountPLN.toFixed(2)},${payout.method},${payout.status}`
    );
  });

  lines.push('');
  lines.push('## VAT Information');
  lines.push(`Applicable: ${revenueExport.vatInfo?.applicable ? 'Yes' : 'No'}`);
  if (revenueExport.vatInfo?.jurisdiction) {
    lines.push(`Jurisdiction: ${revenueExport.vatInfo.jurisdiction}`);
  }
  lines.push(`Notes: "${revenueExport.vatInfo?.notes}"`);

  return lines.join('\n');
}

/**
 * Generate simple text-based PDF content
 * NOTE: In production, use a proper PDF library like pdfkit
 */
function generatePDFContent(revenueExport: CreatorRevenueExport): string {
  return `AVALO CREATOR REVENUE STATEMENT

Period: ${revenueExport.period.startDate} to ${revenueExport.period.endDate}
Generated: ${new Date().toISOString()}

SUMMARY
-------
Total Earnings: ${revenueExport.summary.totalEarningsTokens} tokens (${revenueExport.summary.totalEarningsPLN.toFixed(2)} PLN)
Paid Interactions: ${revenueExport.summary.paidInteractions}
Total Payouts: ${revenueExport.summary.payoutsTotal.toFixed(2)} PLN (${revenueExport.summary.payoutsCount} payouts)

BREAKDOWN BY SOURCE
-------------------
Gifts: ${revenueExport.breakdown.gifts} tokens
Premium Stories: ${revenueExport.breakdown.premiumStories} tokens
Paid Media: ${revenueExport.breakdown.paidMedia} tokens
Paid Calls: ${revenueExport.breakdown.paidCalls} tokens
AI Companion: ${revenueExport.breakdown.aiCompanion} tokens
Other: ${revenueExport.breakdown.other} tokens

VAT INFORMATION
---------------
Applicable: ${revenueExport.vatInfo?.applicable ? 'Yes' : 'No'}
${revenueExport.vatInfo?.jurisdiction ? `Jurisdiction: ${revenueExport.vatInfo.jurisdiction}` : ''}
Notes: ${revenueExport.vatInfo?.notes}

DISCLAIMER
----------
This is a factual statement of revenue earned through the Avalo platform.
It is NOT tax advice. Consult a qualified tax advisor for your specific situation.
`;
}

// ============================================================================
// VAT INVOICE GENERATION (STUB)
// ============================================================================

/**
 * Generate VAT invoice for a transaction
 * NOTE: This is a stub for future implementation when VAT invoicing is required
 */
export async function generateVATInvoice(params: {
  userId: string;
  transactionId: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  description: string;
}): Promise<string> {
  const invoiceId = `INV-${Date.now()}-${params.userId.slice(0, 8)}`;
  const invoiceNumber = `AVALO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  const invoiceData: Omit<VATInvoiceData, 'createdAt'> & { createdAt: any } = {
    invoiceId,
    invoiceNumber,
    userId: params.userId,
    transactionId: params.transactionId,
    issueDate: new Date().toISOString().split('T')[0],
    amount: {
      net: params.amount,
      vatRate: params.vatRate,
      vatAmount: params.vatAmount,
      gross: params.amount + params.vatAmount,
      currency: 'PLN',
    },
    seller: {
      name: 'Avalo Sp. z o.o.',
      taxId: 'PL1234567890',
      address: 'Warsaw, Poland',
    },
    buyer: {
      name: 'User',
      address: 'Unknown',
      country: 'PL',
    },
    items: [
      {
        description: params.description,
        quantity: 1,
        unitPrice: params.amount,
        total: params.amount,
      },
    ],
    vatApplied: true,
    vatReverseCharge: false,
    notes: 'Digital services - Avalo Platform',
    createdAt: serverTimestamp(),
  };

  try {
    await db.collection('vat_invoices').doc(invoiceId).set(invoiceData);

    await logVatInvoiceGenerated({
      userId: params.userId,
      invoiceId,
      amount: params.amount,
      vatAmount: params.vatAmount,
    });

    logger.info('[VAT] Generated invoice', {
      invoiceId,
      invoiceNumber,
      userId: params.userId,
    });

    return invoiceId;
  } catch (error: any) {
    logger.error('[VAT] Failed to generate invoice', {
      error: error.message,
      userId: params.userId,
    });
    throw error;
  }
}