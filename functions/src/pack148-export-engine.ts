/**
 * PACK 148 - Ledger Export Engine
 * Export transaction history, payout reports, and tax summaries
 */

import { db, serverTimestamp, generateId, storage } from './init';
import * as crypto from 'crypto';
import {
  LedgerExport,
  LedgerTransaction,
  ExportFormat,
  ExportType,
  TransactionProductType,
  TransactionStatus,
  PayoutLedgerSummary,
  TaxSummary,
  ExportError,
  EXPORT_EXPIRY_HOURS,
  MAX_EXPORT_DOWNLOADS,
  MAX_EXPORT_RECORDS,
  PRIVACY_HASH_ALGORITHM,
  PLATFORM_FEE_PERCENTAGE,
  CREATOR_SHARE_PERCENTAGE,
} from './pack148-types';
import { getUserLedgerTransactions } from './pack148-ledger-engine';

/**
 * Generate secure download token
 */
function generateDownloadToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash user ID for privacy
 */
function hashUserId(userId: string): string {
  return crypto
    .createHash(PRIVACY_HASH_ALGORITHM)
    .update(userId)
    .digest('hex');
}

/**
 * Convert transactions to CSV format
 */
function convertToCSV(transactions: LedgerTransaction[]): string {
  const headers = [
    'Transaction ID',
    'Date',
    'Product Type',
    'Token Amount',
    'USD Equivalent',
    'Status',
    'Platform Share',
    'Creator Share',
    'Blockchain Hash',
    'Verified',
  ];
  
  const rows = transactions.map(tx => [
    tx.transactionId,
    tx.timestamp.toDate().toISOString(),
    tx.productType,
    tx.tokenAmount.toString(),
    tx.usdEquivalent.toFixed(2),
    tx.status,
    tx.platformShare.toString(),
    tx.creatorShare.toString(),
    tx.blockchainHash,
    tx.blockchainVerified ? 'Yes' : 'No',
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
  
  return csvContent;
}

/**
 * Convert transactions to JSON format
 */
function convertToJSON(transactions: LedgerTransaction[]): string {
  const exportData = {
    exportDate: new Date().toISOString(),
    recordCount: transactions.length,
    transactions: transactions.map(tx => ({
      transactionId: tx.transactionId,
      date: tx.timestamp.toDate().toISOString(),
      productType: tx.productType,
      tokenAmount: tx.tokenAmount,
      usdEquivalent: tx.usdEquivalent,
      status: tx.status,
      platformShare: tx.platformShare,
      creatorShare: tx.creatorShare,
      blockchainHash: tx.blockchainHash,
      blockchainVerified: tx.blockchainVerified,
      regionTag: tx.regionTag,
    })),
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * Generate PDF (simplified - returns HTML for now)
 */
function generatePDFContent(transactions: LedgerTransaction[], userId: string): string {
  const now = new Date().toISOString();
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Avalo Transaction Ledger</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .header { margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .verified { color: green; }
    .unverified { color: red; }
    .footer { margin-top: 40px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Avalo Blockchain Token Ledger</h1>
    <p><strong>Export Date:</strong> ${now}</p>
    <p><strong>User Hash:</strong> ${hashUserId(userId)}</p>
    <p><strong>Total Records:</strong> ${transactions.length}</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Transaction ID</th>
        <th>Type</th>
        <th>Tokens</th>
        <th>USD</th>
        <th>Status</th>
        <th>Blockchain Hash</th>
      </tr>
    </thead>
    <tbody>
`;
  
  for (const tx of transactions) {
    const verifiedClass = tx.blockchainVerified ? 'verified' : 'unverified';
    html += `
      <tr>
        <td>${tx.timestamp.toDate().toLocaleDateString()}</td>
        <td>${tx.transactionId.substring(0, 12)}...</td>
        <td>${tx.productType}</td>
        <td>${tx.tokenAmount}</td>
        <td>$${tx.usdEquivalent.toFixed(2)}</td>
        <td>${tx.status}</td>
        <td class="${verifiedClass}">${tx.blockchainHash.substring(0, 16)}...</td>
      </tr>
    `;
  }
  
  html += `
    </tbody>
  </table>
  
  <div class="footer">
    <p><strong>Note:</strong> All transactions are recorded on Avalo's immutable blockchain ledger.</p>
    <p>This export is for your records only. Tokens cannot be transferred outside Avalo platform.</p>
    <p><strong>65/35 Revenue Split:</strong> Creators receive 65%, Platform receives 35%</p>
  </div>
</body>
</html>
`;
  
  return html;
}

/**
 * Generate payout report
 */
async function generatePayoutReport(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<PayoutLedgerSummary> {
  const transactions = await getUserLedgerTransactions(userId, {
    startAfter: startDate,
  });
  
  // Filter by date range
  const filtered = transactions.filter(tx => {
    const txDate = tx.timestamp.toDate();
    return txDate >= startDate && txDate <= endDate;
  });
  
  // Calculate totals
  let totalEarned = 0;
  let platformFees = 0;
  let totalPaidOut = 0;
  let pendingPayout = 0;
  let inEscrow = 0;
  let refunded = 0;
  
  const earningsByType: { [key: string]: number } = {};
  const blockchainHashes: string[] = [];
  
  let completedCount = 0;
  let disputedCount = 0;
  let verifiedCount = 0;
  
  const userHash = hashUserId(userId);
  
  for (const tx of filtered) {
    // Only count if user is receiver
    if (tx.receiverHash !== userHash) continue;
    
    totalEarned += tx.creatorShare;
    platformFees += tx.platformShare;
    
    // Track by type
    if (!earningsByType[tx.productType]) {
      earningsByType[tx.productType] = 0;
    }
    earningsByType[tx.productType] += tx.creatorShare;
    
    // Track by status
    switch (tx.status) {
      case 'completed':
        totalPaidOut += tx.creatorShare;
        completedCount++;
        break;
      case 'escrowed':
        inEscrow += tx.creatorShare;
        break;
      case 'pending':
        pendingPayout += tx.creatorShare;
        break;
      case 'refunded':
        refunded += tx.creatorShare;
        break;
      case 'disputed':
        disputedCount++;
        break;
    }
    
    if (tx.blockchainVerified) {
      verifiedCount++;
      blockchainHashes.push(tx.blockchainHash);
    }
  }
  
  return {
    userId,
    period: 'monthly',
    startDate: startDate as any,
    endDate: endDate as any,
    totalEarned,
    platformFees,
    earningsByType: earningsByType as any,
    totalPaidOut,
    pendingPayout,
    inEscrow,
    refunded,
    totalTransactions: filtered.length,
    completedTransactions: completedCount,
    disputedTransactions: disputedCount,
    allTransactionsVerified: verifiedCount === filtered.length,
    verificationRate: filtered.length > 0 ? (verifiedCount / filtered.length) * 100 : 0,
    generatedAt: new Date() as any,
    blockchainHashes,
  };
}

/**
 * Generate tax summary
 */
async function generateTaxSummary(
  userId: string,
  taxYear: number,
  region: string
): Promise<TaxSummary> {
  const startDate = new Date(taxYear, 0, 1);
  const endDate = new Date(taxYear, 11, 31, 23, 59, 59);
  
  const transactions = await getUserLedgerTransactions(userId, {
    startAfter: startDate,
  });
  
  const yearTransactions = transactions.filter(tx => {
    const txDate = tx.timestamp.toDate();
    return txDate >= startDate && txDate <= endDate;
  });
  
  const userHash = hashUserId(userId);
  
  let totalIncome = 0;
  let totalTokens = 0;
  let platformFees = 0;
  let refundsIssued = 0;
  
  const incomeByType: { [key: string]: any } = {};
  const monthlyBreakdown: any[] = Array(12).fill(null).map((_, i) => ({
    month: i + 1,
    tokens: 0,
    usd: 0,
    transactions: 0,
  }));
  
  for (const tx of yearTransactions) {
    if (tx.receiverHash !== userHash) continue;
    
    totalTokens += tx.creatorShare;
    totalIncome += tx.creatorShare * tx.conversionRate;
    platformFees += tx.platformShare * tx.conversionRate;
    
    if (tx.status === 'refunded') {
      refundsIssued += tx.creatorShare * tx.conversionRate;
    }
    
    // By type
    if (!incomeByType[tx.productType]) {
      incomeByType[tx.productType] = {
        tokens: 0,
        usd: 0,
        transactionCount: 0,
      };
    }
    incomeByType[tx.productType].tokens += tx.creatorShare;
    incomeByType[tx.productType].usd += tx.creatorShare * tx.conversionRate;
    incomeByType[tx.productType].transactionCount += 1;
    
    // Monthly
    const month = tx.timestamp.toDate().getMonth();
    monthlyBreakdown[month].tokens += tx.creatorShare;
    monthlyBreakdown[month].usd += tx.creatorShare * tx.conversionRate;
    monthlyBreakdown[month].transactions += 1;
  }
  
  return {
    userId,
    taxYear,
    region,
    totalIncome,
    totalTokens,
    incomeByType: incomeByType as any,
    platformFees,
    refundsIssued,
    chargebackLosses: 0,
    monthlyBreakdown,
    allTransactionsRecorded: true,
    blockchainVerified: yearTransactions.every(tx => tx.blockchainVerified),
    generatedAt: new Date() as any,
  };
}

/**
 * Create export request
 */
export async function createExportRequest(
  userId: string,
  exportType: ExportType,
  format: ExportFormat,
  dateRange?: { startDate: Date; endDate: Date },
  filters?: {
    productTypes?: TransactionProductType[];
    status?: TransactionStatus[];
  }
): Promise<string> {
  const exportId = generateId();
  const downloadToken = generateDownloadToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + EXPORT_EXPIRY_HOURS);
  
  const exportRecord: LedgerExport = {
    id: exportId,
    userId,
    userHash: hashUserId(userId),
    exportType,
    format,
    dateRange: {
      startDate: (dateRange?.startDate || new Date(0)) as any,
      endDate: (dateRange?.endDate || new Date()) as any,
    },
    filters,
    status: 'pending',
    downloadToken,
    expiresAt: expiresAt as any,
    downloadCount: 0,
    maxDownloads: MAX_EXPORT_DOWNLOADS,
    createdAt: serverTimestamp() as any,
  };
  
  await db.collection('ledger_exports').doc(exportId).set(exportRecord);
  
  // Process export asynchronously
  processExport(exportId, userId, exportType, format, dateRange, filters).catch(error => {
    console.error(`Failed to process export ${exportId}:`, error);
  });
  
  return exportId;
}

/**
 * Process export (background job)
 */
async function processExport(
  exportId: string,
  userId: string,
  exportType: ExportType,
  format: ExportFormat,
  dateRange?: { startDate: Date; endDate: Date },
  filters?: any
): Promise<void> {
  try {
    // Update status
    await db.collection('ledger_exports').doc(exportId).update({
      status: 'processing',
    });
    
    let content: string;
    let filename: string;
    let mimeType: string;
    
    // Generate content based on type
    switch (exportType) {
      case 'transaction_history': {
        const transactions = await getUserLedgerTransactions(userId, {
          startAfter: dateRange?.startDate,
          productTypes: filters?.productTypes,
          status: filters?.status,
          limit: MAX_EXPORT_RECORDS,
        });
        
        // Filter by end date
        const filtered = dateRange?.endDate
          ? transactions.filter(tx => tx.timestamp.toDate() <= dateRange.endDate)
          : transactions;
        
        if (format === 'csv') {
          content = convertToCSV(filtered);
          filename = `avalo-transactions-${Date.now()}.csv`;
          mimeType = 'text/csv';
        } else if (format === 'json') {
          content = convertToJSON(filtered);
          filename = `avalo-transactions-${Date.now()}.json`;
          mimeType = 'application/json';
        } else {
          content = generatePDFContent(filtered, userId);
          filename = `avalo-transactions-${Date.now()}.html`;
          mimeType = 'text/html';
        }
        break;
      }
      
      case 'payout_report': {
        const report = await generatePayoutReport(
          userId,
          dateRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          dateRange?.endDate || new Date()
        );
        
        content = JSON.stringify(report, null, 2);
        filename = `avalo-payout-report-${Date.now()}.json`;
        mimeType = 'application/json';
        break;
      }
      
      case 'tax_summary': {
        const year = dateRange?.startDate?.getFullYear() || new Date().getFullYear();
        const taxSummary = await generateTaxSummary(userId, year, 'US');
        
        content = JSON.stringify(taxSummary, null, 2);
        filename = `avalo-tax-summary-${year}.json`;
        mimeType = 'application/json';
        break;
      }
      
      case 'dispute_history': {
        // Placeholder for dispute history
        content = JSON.stringify({ message: 'Dispute history not yet implemented' }, null, 2);
        filename = `avalo-disputes-${Date.now()}.json`;
        mimeType = 'application/json';
        break;
      }
      
      default:
        throw new ExportError('Invalid export type', exportId, 'INVALID_TYPE');
    }
    
    // Upload to storage
    const bucket = storage.bucket();
    const file = bucket.file(`exports/${userId}/${filename}`);
    
    await file.save(content, {
      metadata: {
        contentType: mimeType,
      },
    });
    
    // Generate signed URL (24 hour expiry)
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000,
    });
    
    // Update export record
    await db.collection('ledger_exports').doc(exportId).update({
      status: 'completed',
      recordCount: content.length,
      fileUrl: url,
      fileSize: Buffer.byteLength(content, 'utf8'),
      completedAt: serverTimestamp(),
    });
    
    console.log(`✅ Export ${exportId} completed successfully`);
  } catch (error) {
    console.error(`❌ Export ${exportId} failed:`, error);
    
    await db.collection('ledger_exports').doc(exportId).update({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get export status
 */
export async function getExportStatus(exportId: string): Promise<LedgerExport> {
  const doc = await db.collection('ledger_exports').doc(exportId).get();
  
  if (!doc.exists) {
    throw new ExportError('Export not found', exportId, 'NOT_FOUND');
  }
  
  return doc.data() as LedgerExport;
}

/**
 * Download export (validates token and tracks downloads)
 */
export async function downloadExport(
  exportId: string,
  downloadToken: string
): Promise<{ url: string; expiresAt: Date }> {
  const exportRecord = await getExportStatus(exportId);
  
  // Validate token
  if (exportRecord.downloadToken !== downloadToken) {
    throw new ExportError('Invalid download token', exportId, 'INVALID_TOKEN');
  }
  
  // Check expiry
  if (exportRecord.expiresAt.toDate() < new Date()) {
    throw new ExportError('Export has expired', exportId, 'EXPIRED');
  }
  
  // Check download limit
  if (exportRecord.downloadCount >= exportRecord.maxDownloads) {
    throw new ExportError('Download limit exceeded', exportId, 'LIMIT_EXCEEDED');
  }
  
  // Check status
  if (exportRecord.status !== 'completed') {
    throw new ExportError('Export not ready', exportId, 'NOT_READY');
  }
  
  // Increment download count
  await db.collection('ledger_exports').doc(exportId).update({
    downloadCount: exportRecord.downloadCount + 1,
  });
  
  return {
    url: exportRecord.fileUrl!,
    expiresAt: exportRecord.expiresAt.toDate(),
  };
}

/**
 * Get user's export history
 */
export async function getUserExports(userId: string): Promise<LedgerExport[]> {
  const snapshot = await db
    .collection('ledger_exports')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as LedgerExport);
}

/**
 * Cleanup expired exports (scheduled job)
 */
export async function cleanupExpiredExports(): Promise<number> {
  const now = new Date();
  const snapshot = await db
    .collection('ledger_exports')
    .where('expiresAt', '<', now)
    .limit(100)
    .get();
  
  let deleted = 0;
  
  for (const doc of snapshot.docs) {
    const exportRecord = doc.data() as LedgerExport;
    
    // Delete file from storage
    if (exportRecord.fileUrl) {
      try {
        const bucket = storage.bucket();
        const filename = exportRecord.fileUrl.split('/').pop()?.split('?')[0];
        if (filename) {
          await bucket.file(`exports/${exportRecord.userId}/${filename}`).delete();
        }
      } catch (error) {
        console.error(`Failed to delete export file: ${error}`);
      }
    }
    
    // Delete record
    await doc.ref.delete();
    deleted++;
  }
  
  console.log(`Deleted ${deleted} expired exports`);
  return deleted;
}