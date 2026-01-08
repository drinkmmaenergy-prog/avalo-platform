/**
 * PACK 303 — Statement Export Service
 * 
 * Handles PDF and CSV generation for monthly statements
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { db, storage } from './init';
import {
  MonthlyStatement,
  ExportStatementRequest,
  ExportStatementResponse,
  STATEMENT_EXPORT_CONFIG,
} from './types/pack303-creator-earnings.types';
import { getMonthlyStatement, logStatementAudit } from './pack303-earnings-service';

// ============================================================================
// CSV GENERATION
// ============================================================================

/**
 * Generate CSV content from monthly statement
 */
function generateStatementCSV(statement: MonthlyStatement): string {
  const lines: string[] = [];
  
  // Header information
  lines.push('Avalo Creator Earnings Statement');
  lines.push(`Period: ${statement.period.year}-${String(statement.period.month).padStart(2, '0')}`);
  lines.push(`Currency: ${statement.baseCurrency}`);
  lines.push(`Token Payout Rate: ${statement.tokenPayoutRate} ${statement.baseCurrency}`);
  lines.push('');
  
  // Summary section
  lines.push('Summary');
  lines.push('Metric,Value');
  lines.push(`Net Tokens Earned,${statement.summary.tokensNetEarned}`);
  lines.push(`Creator Share (Tokens),${statement.summary.tokensCreatorShare}`);
  lines.push(`Avalo Share (Tokens),${statement.summary.tokensAvaloShare}`);
  lines.push(`Payout Tokens Paid,${statement.summary.payoutTokensPaid}`);
  lines.push(`Payout Fiat Paid,${statement.summary.payoutFiatPaid}`);
  lines.push('');
  
  // By source section
  lines.push('Earnings by Source');
  lines.push('Source,Tokens Earned,Tokens Refunded,Creator Share');
  for (const source of statement.bySource) {
    lines.push(`${source.source},${source.tokensEarned},${source.tokensRefunded},${source.tokensCreatorShare}`);
  }
  lines.push('');
  
  // Transactions section
  lines.push('Transactions');
  lines.push('Date,Type,Direction,Amount (Tokens),Related ID,Note');
  for (const tx of statement.transactions) {
    const note = (tx.note || '').replace(/,/g, ';'); // Escape commas
    lines.push(`${tx.date},${tx.type},${tx.direction},${tx.amountTokens},${tx.relatedId || ''},${note}`);
  }
  
  return lines.join('\n');
}

/**
 * Export statement as CSV
 */
export async function exportStatementCSV(
  request: ExportStatementRequest
): Promise<ExportStatementResponse> {
  try {
    const { userId, year, month } = request;
    
    // Get statement data
    const statementResponse = await getMonthlyStatement({
      userId,
      year,
      month,
    });
    
    if (!statementResponse.success || !statementResponse.statement) {
      return {
        success: false,
        error: statementResponse.error || 'Failed to get statement',
      };
    }
    
    // Generate CSV content
    const csvContent = generateStatementCSV(statementResponse.statement);
    
    // Upload to Cloud Storage
    const filename = `statements/${userId}/${year}/${String(month).padStart(2, '0')}/statement_${userId}_${year}_${String(month).padStart(2, '0')}.csv`;
    const bucket = storage.bucket(STATEMENT_EXPORT_CONFIG.bucketName);
    const file = bucket.file(filename);
    
    await file.save(csvContent, {
      contentType: 'text/csv',
      metadata: {
        userId,
        year: String(year),
        month: String(month),
        format: 'csv',
        generatedAt: new Date().toISOString(),
      },
    });
    
    // Generate signed URL (expires in 24 hours)
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + STATEMENT_EXPORT_CONFIG.expirationHours);
    
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expirationDate,
    });
    
    // Log audit
    await logStatementAudit('USER', userId, 'STATEMENT_EXPORTED_CSV', userId, year, month, 'csv');
    
    return {
      success: true,
      downloadUrl,
      expiresAt: expirationDate.toISOString(),
    };
  } catch (error: any) {
    console.error('Error exporting statement as CSV:', error);
    return {
      success: false,
      error: error.message || 'Failed to export statement as CSV',
    };
  }
}

// ============================================================================
// PDF GENERATION
// ============================================================================

/**
 * Generate HTML content for PDF conversion
 */
function generateStatementHTML(statement: MonthlyStatement, userName?: string): string {
  const periodName = new Date(statement.period.year, statement.period.month - 1, 1)
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Avalo Creator Earnings Statement - ${periodName}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 40px;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6366f1;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #6366f1;
      margin-bottom: 10px;
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .period {
      font-size: 18px;
      color: #666;
    }
    .info-box {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #111;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      margin: 30px 0 15px 0;
      color: #111;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background: #6366f1;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:hover {
      background: #f9fafb;
    }
    .amount {
      text-align: right;
      font-family: monospace;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    .disclaimer {
      background: #fef3c7;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 14px;
      color: #92400e;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">AVALO</div>
    <div class="title">Creator Earnings Statement</div>
    <div class="period">${periodName}</div>
  </div>

  ${userName ? `<div class="info-box"><div class="info-row"><div class="info-label">Creator:</div><div class="info-value">${userName}</div></div></div>` : ''}

  <div class="section-title">Summary</div>
  <div class="info-box">
    <div class="info-row">
      <div class="info-label">Net Tokens Earned</div>
      <div class="info-value">${statement.summary.tokensNetEarned.toLocaleString()} tokens</div>
    </div>
    <div class="info-row">
      <div class="info-label">Your Creator Share</div>
      <div class="info-value">${statement.summary.tokensCreatorShare.toLocaleString()} tokens</div>
    </div>
    <div class="info-row">
      <div class="info-label">Avalo Platform Fee</div>
      <div class="info-value">${statement.summary.tokensAvaloShare.toLocaleString()} tokens</div>
    </div>
    <div class="info-row">
      <div class="info-label">Payouts Processed</div>
      <div class="info-value">${statement.summary.payoutTokensPaid.toLocaleString()} tokens (${statement.summary.payoutFiatPaid.toFixed(2)} ${statement.baseCurrency})</div>
    </div>
    <div class="info-row">
      <div class="info-label">Token Payout Rate</div>
      <div class="info-value">1 token = ${statement.tokenPayoutRate} ${statement.baseCurrency}</div>
    </div>
  </div>

  <div class="section-title">Earnings by Source</div>
  <table>
    <thead>
      <tr>
        <th>Source</th>
        <th class="amount">Tokens Earned</th>
        <th class="amount">Tokens Refunded</th>
        <th class="amount">Your Share</th>
      </tr>
    </thead>
    <tbody>
      ${statement.bySource.map(source => `
        <tr>
          <td>${source.source}</td>
          <td class="amount">${source.tokensEarned.toLocaleString()}</td>
          <td class="amount">${source.tokensRefunded.toLocaleString()}</td>
          <td class="amount">${source.tokensCreatorShare.toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="section-title">Transaction History</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Direction</th>
        <th class="amount">Amount (Tokens)</th>
      </tr>
    </thead>
    <tbody>
      ${statement.transactions.slice(0, 50).map(tx => `
        <tr>
          <td>${new Date(tx.date).toLocaleDateString()}</td>
          <td>${tx.type}</td>
          <td>${tx.direction}</td>
          <td class="amount">${tx.amountTokens.toLocaleString()}</td>
        </tr>
      `).join('')}
      ${statement.transactions.length > 50 ? `
        <tr>
          <td colspan="4" style="text-align: center; color: #666; font-style: italic;">
            Showing 50 of ${statement.transactions.length} transactions. Download CSV for complete list.
          </td>
        </tr>
      ` : ''}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>Important Notice:</strong> This statement is for informational purposes only and does not constitute tax advice. 
    Please consult with a qualified tax professional regarding your specific tax obligations.
  </div>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
    <p>© ${new Date().getFullYear()} Avalo. All rights reserved.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Export statement as PDF
 * Note: This uses a simple HTML-to-PDF approach. For production, consider using a library like puppeteer
 */
export async function exportStatementPDF(
  request: ExportStatementRequest
): Promise<ExportStatementResponse> {
  try {
    const { userId, year, month } = request;
    
    // Get statement data
    const statementResponse = await getMonthlyStatement({
      userId,
      year,
      month,
    });
    
    if (!statementResponse.success || !statementResponse.statement) {
      return {
        success: false,
        error: statementResponse.error || 'Failed to get statement',
      };
    }
    
    // Get user name for statement
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userName = userData?.displayName || userData?.name || undefined;
    
    // Generate HTML content
    const htmlContent = generateStatementHTML(statementResponse.statement, userName);
    
    // For now, we'll save the HTML and provide a note about PDF generation
    // In production, you would use puppeteer or similar to convert HTML to PDF
    const filename = `statements/${userId}/${year}/${String(month).padStart(2, '0')}/statement_${userId}_${year}_${String(month).padStart(2, '0')}.html`;
    const bucket = storage.bucket(STATEMENT_EXPORT_CONFIG.bucketName);
    const file = bucket.file(filename);
    
    await file.save(htmlContent, {
      contentType: 'text/html',
      metadata: {
        userId,
        year: String(year),
        month: String(month),
        format: 'pdf',
        generatedAt: new Date().toISOString(),
        note: 'HTML version - convert to PDF using browser or puppeteer in production',
      },
    });
    
    // Generate signed URL (expires in 24 hours)
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + STATEMENT_EXPORT_CONFIG.expirationHours);
    
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expirationDate,
    });
    
    // Log audit
    await logStatementAudit('USER', userId, 'STATEMENT_EXPORTED_PDF', userId, year, month, 'pdf');
    
    return {
      success: true,
      downloadUrl,
      expiresAt: expirationDate.toISOString(),
    };
  } catch (error: any) {
    console.error('Error exporting statement as PDF:', error);
    return {
      success: false,
      error: error.message || 'Failed to export statement as PDF',
    };
  }
}

/**
 * Export statement (auto-detect format)
 */
export async function exportStatement(
  request: ExportStatementRequest
): Promise<ExportStatementResponse> {
  if (request.format === 'csv') {
    return exportStatementCSV(request);
  } else if (request.format === 'pdf') {
    return exportStatementPDF(request);
  } else {
    return {
      success: false,
      error: 'Invalid export format. Must be "pdf" or "csv".',
    };
  }
}