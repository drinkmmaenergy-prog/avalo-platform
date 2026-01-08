/**
 * PACK 129 — Tax Document Generation & Storage
 * Automated generation of invoices, statements, and tax reports
 * 
 * DOCUMENT TYPES:
 * - Monthly earnings statements
 * - Business invoices (VAT-compliant)
 * - Tax certificates
 * - Withholding statements
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db, serverTimestamp, storage } from './init';
import {
  TaxDocument,
  TaxDocumentType,
  DocumentFormat,
  InvoiceData,
  InvoiceLineItem,
  TaxProfile,
  RevenueCategory,
  IssueInvoiceRequest,
  IssueInvoiceResponse,
  GenerateTaxReportRequest,
  GenerateTaxReportResponse,
  REVENUE_CATEGORY_MAPPING,
} from './types/tax.types';
import { getEarningsSummaryWithTax } from './tax-treasury-integration';

// ============================================================================
// DOCUMENT NUMBER GENERATION
// ============================================================================

/**
 * Generate sequential document number
 */
async function generateDocumentNumber(
  documentType: TaxDocumentType,
  year: number
): Promise<string> {
  const prefix = {
    MONTHLY_STATEMENT: 'MS',
    INVOICE: 'INV',
    TAX_CERTIFICATE: 'TC',
    '1099_MISC': '1099',
    WITHHOLDING_STATEMENT: 'WS',
    VAT_INVOICE: 'VAT',
    ANNUAL_SUMMARY: 'AS',
  }[documentType];

  // Get counter for this type and year
  const counterRef = db
    .collection('tax_document_counters')
    .doc(`${documentType}_${year}`);

  const counterDoc = await counterRef.get();
  let nextNumber = 1;

  if (counterDoc.exists) {
    nextNumber = (counterDoc.data()?.lastNumber || 0) + 1;
  }

  // Update counter
  await counterRef.set({
    documentType,
    year,
    lastNumber: nextNumber,
    updatedAt: serverTimestamp(),
  });

  // Format: PREFIX-YYYY-NNNNNN
  return `${prefix}-${year}-${String(nextNumber).padStart(6, '0')}`;
}

// ============================================================================
// INVOICE GENERATION
// ============================================================================

/**
 * Generate invoice data
 */
async function generateInvoiceData(
  userId: string,
  periodStart: Timestamp,
  periodEnd: Timestamp
): Promise<InvoiceData> {
  // Get tax profile
  const profileDoc = await db.collection('tax_profiles').doc(userId).get();
  if (!profileDoc.exists) {
    throw new Error('Tax profile not found');
  }

  const profile = profileDoc.data() as TaxProfile;

  // Get earnings summary
  const summary = await getEarningsSummaryWithTax(userId, periodStart, periodEnd);

  // Create line items by category
  const lineItems: InvoiceLineItem[] = [];

  for (const [category, amount] of Object.entries(summary.earningsByCategory)) {
    if (amount > 0) {
      const categoryInfo = REVENUE_CATEGORY_MAPPING[category as RevenueCategory];
      
      lineItems.push({
        description: categoryInfo.description,
        quantity: 1,
        unitPrice: amount,
        amount,
        category: category as RevenueCategory,
      });
    }
  }

  // Generate invoice number
  const invoiceNumber = await generateDocumentNumber(
    'INVOICE',
    periodStart.toDate().getFullYear()
  );

  const invoiceData: InvoiceData = {
    invoiceNumber,
    invoiceDate: Timestamp.now(),
    issuer: {
      name: 'Avalo Platform',
      address: 'Legal entity address', // Would come from config
      taxId: 'Platform Tax ID',
      vatId: profile.vatEligible ? 'Platform VAT ID' : undefined,
    },
    recipient: {
      name: profile.businessName || 'Creator',
      address: `${profile.billingAddress.line1}, ${profile.billingAddress.city}, ${profile.billingAddress.postalCode}, ${profile.billingAddress.country}`,
      taxId: profile.taxId,
      vatId: profile.vatId,
      entityType: profile.entityType,
    },
    lineItems,
    subtotal: summary.grossEarnings,
    taxAmount: summary.withheldTax,
    totalAmount: summary.netEarnings,
    paymentMethod: 'Platform Tokens',
    country: profile.country,
    currency: 'EUR', // Display currency
    notes: summary.withheldTax > 0 
      ? `Tax withheld: ${summary.withheldTax} tokens`
      : undefined,
  };

  return invoiceData;
}

/**
 * Generate PDF invoice (placeholder - would use PDF library)
 */
async function generateInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
  // In production, use a library like pdfkit or puppeteer
  // For now, return a simple text representation
  const content = `
INVOICE

Invoice Number: ${invoiceData.invoiceNumber}
Invoice Date: ${invoiceData.invoiceDate.toDate().toLocaleDateString()}

FROM:
${invoiceData.issuer.name}
${invoiceData.issuer.address}
Tax ID: ${invoiceData.issuer.taxId}

TO:
${invoiceData.recipient.name}
${invoiceData.recipient.address}
Tax ID: ${invoiceData.recipient.taxId || 'N/A'}

LINE ITEMS:
${invoiceData.lineItems.map(item => 
  `${item.description}: ${item.amount} tokens`
).join('\n')}

SUBTOTAL: ${invoiceData.subtotal} tokens
TAX: ${invoiceData.taxAmount} tokens
TOTAL: ${invoiceData.totalAmount} tokens

${invoiceData.notes || ''}
`;

  return Buffer.from(content, 'utf-8');
}

/**
 * Generate CSV export
 */
async function generateInvoiceCSV(invoiceData: InvoiceData): Promise<Buffer> {
  const rows = [
    ['Invoice Number', invoiceData.invoiceNumber],
    ['Date', invoiceData.invoiceDate.toDate().toISOString()],
    ['', ''],
    ['Description', 'Amount'],
    ...invoiceData.lineItems.map(item => [item.description, item.amount.toString()]),
    ['', ''],
    ['Subtotal', invoiceData.subtotal.toString()],
    ['Tax', invoiceData.taxAmount.toString()],
    ['Total', invoiceData.totalAmount.toString()],
  ];

  const csv = rows.map(row => row.join(',')).join('\n');
  return Buffer.from(csv, 'utf-8');
}

/**
 * Upload document to storage
 */
async function uploadDocument(
  userId: string,
  documentId: string,
  format: DocumentFormat,
  content: Buffer
): Promise<string> {
  const bucket = storage().bucket();
  const fileName = `tax-documents/${userId}/${documentId}.${format.toLowerCase()}`;
  const file = bucket.file(fileName);

  await file.save(content, {
    metadata: {
      contentType: format === 'PDF' ? 'application/pdf' : 'text/csv',
    },
  });

  // Generate signed URL (valid for 1 year)
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
  });

  return url;
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Issue invoice for period
 */
export const tax_issueInvoice = https.onCall<IssueInvoiceRequest>(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, periodStart, periodEnd, format } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot issue invoice for another user');
    }

    try {
      // Generate invoice data
      const invoiceData = await generateInvoiceData(userId, periodStart, periodEnd);

      // Create document record
      const documentId = db.collection('tax_documents').doc().id;
      const formats: Array<{ format: DocumentFormat; storageUrl: string; generatedAt: Timestamp }> = [];

      // Generate requested format (default PDF)
      const requestedFormat = format || 'PDF';
      
      if (requestedFormat === 'PDF' || !format) {
        const pdfBuffer = await generateInvoicePDF(invoiceData);
        const pdfUrl = await uploadDocument(userId, documentId, 'PDF', pdfBuffer);
        formats.push({
          format: 'PDF',
          storageUrl: pdfUrl,
          generatedAt: Timestamp.now(),
        });
      }

      if (requestedFormat === 'CSV') {
        const csvBuffer = await generateInvoiceCSV(invoiceData);
        const csvUrl = await uploadDocument(userId, documentId, 'CSV', csvBuffer);
        formats.push({
          format: 'CSV',
          storageUrl: csvUrl,
          generatedAt: Timestamp.now(),
        });
      }

      // Get earnings breakdown
      const summary = await getEarningsSummaryWithTax(userId, periodStart, periodEnd);

      // Create tax document record
      const taxDocument: TaxDocument = {
        id: documentId,
        userId,
        documentType: 'INVOICE',
        documentNumber: invoiceData.invoiceNumber,
        periodStart,
        periodEnd,
        fiscalYear: periodStart.toDate().getFullYear(),
        grossEarnings: invoiceData.subtotal,
        taxWithheld: invoiceData.taxAmount,
        netEarnings: invoiceData.totalAmount,
        earningsBreakdown: summary.earningsByCategory,
        formats,
        status: 'FINALIZED',
        finalizedAt: Timestamp.now(),
        country: invoiceData.country,
        entityType: invoiceData.recipient.entityType,
        locale: 'en', // Would be based on user preference
        createdAt: Timestamp.now(),
        createdBy: 'SYSTEM',
      };

      await db.collection('tax_documents').doc(documentId).set(taxDocument);

      logger.info('Invoice issued', {
        userId,
        documentId,
        documentNumber: invoiceData.invoiceNumber,
        grossEarnings: invoiceData.subtotal,
      });

      // Prepare download URLs
      const downloadUrls: Record<DocumentFormat, string> = {} as any;
      formats.forEach(f => {
        downloadUrls[f.format] = f.storageUrl;
      });

      const response: IssueInvoiceResponse = {
        success: true,
        documentId,
        downloadUrls,
      };

      return response;
    } catch (error: any) {
      logger.error('Invoice issuance failed', { error, userId });
      throw new HttpsError('internal', error.message || 'Failed to issue invoice');
    }
  }
);

/**
 * Generate tax report (annual or quarterly)
 */
export const tax_generateReport = https.onCall<GenerateTaxReportRequest>(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, year, quarter, format } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot generate report for another user');
    }

    try {
      // Determine period
      let periodStart: Timestamp;
      let periodEnd: Timestamp;

      if (quarter) {
        // Quarterly report
        const quarterStart = new Date(year, (quarter - 1) * 3, 1);
        const quarterEnd = new Date(year, quarter * 3, 0, 23, 59, 59);
        periodStart = Timestamp.fromDate(quarterStart);
        periodEnd = Timestamp.fromDate(quarterEnd);
      } else {
        // Annual report
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59);
        periodStart = Timestamp.fromDate(yearStart);
        periodEnd = Timestamp.fromDate(yearEnd);
      }

      // Get earnings summary
      const summary = await getEarningsSummaryWithTax(userId, periodStart, periodEnd);

      // Generate document number
      const documentType = quarter ? 'WITHHOLDING_STATEMENT' : 'ANNUAL_SUMMARY';
      const documentNumber = await generateDocumentNumber(documentType, year);

      // Generate report content
      const reportContent = `
TAX REPORT

Document: ${documentNumber}
Period: ${periodStart.toDate().toLocaleDateString()} - ${periodEnd.toDate().toLocaleDateString()}
Generated: ${new Date().toLocaleDateString()}

EARNINGS SUMMARY:
Gross Earnings: ${summary.grossEarnings} tokens
Tax Withheld: ${summary.withheldTax} tokens
Net Earnings: ${summary.netEarnings} tokens

EARNINGS BY CATEGORY:
${Object.entries(summary.earningsByCategory)
  .filter(([_, amount]) => amount > 0)
  .map(([category, amount]) => `${category}: ${amount} tokens`)
  .join('\n')}

WITHHOLDING RECORDS: ${summary.withholdingRecords.length}
`;

      const reportBuffer = Buffer.from(reportContent, 'utf-8');

      // Create document record
      const documentId = db.collection('tax_documents').doc().id;

      // Upload document
      const downloadUrl = await uploadDocument(
        userId,
        documentId,
        format || 'PDF',
        reportBuffer
      );

      // Create tax document record
      const taxDocument: TaxDocument = {
        id: documentId,
        userId,
        documentType,
        documentNumber,
        periodStart,
        periodEnd,
        fiscalYear: year,
        grossEarnings: summary.grossEarnings,
        taxWithheld: summary.withheldTax,
        netEarnings: summary.netEarnings,
        earningsBreakdown: summary.earningsByCategory,
        withholdingRecords: summary.withholdingRecords.map(r => r.id),
        formats: [{
          format: format || 'PDF',
          storageUrl: downloadUrl,
          generatedAt: Timestamp.now(),
        }],
        status: 'FINALIZED',
        finalizedAt: Timestamp.now(),
        country: 'SYSTEM', // Would get from profile
        entityType: 'INDIVIDUAL', // Would get from profile
        locale: 'en',
        createdAt: Timestamp.now(),
        createdBy: 'SYSTEM',
      };

      await db.collection('tax_documents').doc(documentId).set(taxDocument);

      logger.info('Tax report generated', {
        userId,
        documentId,
        year,
        quarter,
        grossEarnings: summary.grossEarnings,
      });

      const response: GenerateTaxReportResponse = {
        success: true,
        documentId,
        downloadUrl,
        summary: {
          totalEarnings: summary.grossEarnings,
          totalWithheld: summary.withheldTax,
          totalNet: summary.netEarnings,
        },
      };

      return response;
    } catch (error: any) {
      logger.error('Tax report generation failed', { error, userId });
      throw new HttpsError('internal', error.message || 'Failed to generate tax report');
    }
  }
);

/**
 * Get user's tax documents
 */
export const tax_getDocuments = https.onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, year, documentType } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access documents for another user');
    }

    try {
      let query = db
        .collection('tax_documents')
        .where('userId', '==', userId);

      if (year) {
        query = query.where('fiscalYear', '==', year);
      }

      if (documentType) {
        query = query.where('documentType', '==', documentType);
      }

      const docsSnap = await query.orderBy('createdAt', 'desc').get();

      const documents = docsSnap.docs.map(doc => {
        const data = doc.data() as TaxDocument;
        return {
          ...data,
          periodStart: data.periodStart.toMillis(),
          periodEnd: data.periodEnd.toMillis(),
          createdAt: data.createdAt.toMillis(),
          finalizedAt: data.finalizedAt?.toMillis(),
          sentAt: data.sentAt?.toMillis(),
          formats: data.formats.map(f => ({
            ...f,
            generatedAt: f.generatedAt.toMillis(),
          })),
        };
      });

      return {
        success: true,
        documents,
        count: documents.length,
      };
    } catch (error: any) {
      logger.error('Failed to get tax documents', { error, userId });
      throw new HttpsError('internal', 'Failed to retrieve tax documents');
    }
  }
);

/**
 * Generate monthly statement (scheduled function would call this)
 */
export async function generateMonthlyStatement(
  userId: string,
  year: number,
  month: number
): Promise<string> {
  try {
    const monthStart = Timestamp.fromDate(new Date(year, month - 1, 1));
    const monthEnd = Timestamp.fromDate(new Date(year, month, 0, 23, 59, 59));

    const summary = await getEarningsSummaryWithTax(userId, monthStart, monthEnd);

    // Skip if no earnings
    if (summary.grossEarnings === 0) {
      logger.info('No earnings for monthly statement', { userId, year, month });
      return '';
    }

    const documentNumber = await generateDocumentNumber('MONTHLY_STATEMENT', year);

    const statementContent = `
MONTHLY EARNINGS STATEMENT

Document: ${documentNumber}
Period: ${monthStart.toDate().toLocaleDateString()} - ${monthEnd.toDate().toLocaleDateString()}

EARNINGS SUMMARY:
Gross Earnings: ${summary.grossEarnings} tokens
Tax Withheld: ${summary.withheldTax} tokens
Net Earnings: ${summary.netEarnings} tokens

DETAILS:
${Object.entries(summary.earningsByCategory)
  .filter(([_, amount]) => amount > 0)
  .map(([category, amount]) => `${category}: ${amount} tokens`)
  .join('\n')}
`;

    const documentId = db.collection('tax_documents').doc().id;
    const statementBuffer = Buffer.from(statementContent, 'utf-8');
    const downloadUrl = await uploadDocument(userId, documentId, 'PDF', statementBuffer);

    const taxDocument: TaxDocument = {
      id: documentId,
      userId,
      documentType: 'MONTHLY_STATEMENT',
      documentNumber,
      periodStart: monthStart,
      periodEnd: monthEnd,
      fiscalYear: year,
      grossEarnings: summary.grossEarnings,
      taxWithheld: summary.withheldTax,
      netEarnings: summary.netEarnings,
      earningsBreakdown: summary.earningsByCategory,
      formats: [{
        format: 'PDF',
        storageUrl: downloadUrl,
        generatedAt: Timestamp.now(),
      }],
      status: 'FINALIZED',
      finalizedAt: Timestamp.now(),
      country: 'SYSTEM',
      entityType: 'INDIVIDUAL',
      locale: 'en',
      createdAt: Timestamp.now(),
      createdBy: 'SYSTEM',
    };

    await db.collection('tax_documents').doc(documentId).set(taxDocument);

    logger.info('Monthly statement generated', {
      userId,
      documentId,
      year,
      month,
      grossEarnings: summary.grossEarnings,
    });

    return documentId;
  } catch (error) {
    logger.error('Monthly statement generation failed', { error, userId, year, month });
    throw error;
  }
}