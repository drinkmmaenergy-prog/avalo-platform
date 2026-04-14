import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 395 - Automatic Invoicing System
 * Generates invoices for purchases and payout statements for earners
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { calculateTransactionTax } from './pack395-tax-engine';
import { FieldValue, HttpsError, auth, onCall, serverTimestamp, z, onSchedule } from './runtime';

const db = admin.firestore();

interface InvoiceData {
  invoiceNumber: string;
  userId: string;
  userEmail: string;
  userName: string;
  userAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  transactionId: string;
  purchaseType: 'tokens' | 'subscription' | 'gift' | 'boost';
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  taxRate: number;
  taxType: string;
  currency: string;
  paymentMethod: string;
  issuedAt: Date;
  dueAt?: Date;
  paidAt: Date;
  platformEntity: {
    name: string;
    address: string;
    taxId: string;
    vatNumber?: string;
  };
  legalDisclaimer: string;
}

interface PayoutStatementData {
  statementId: string;
  earnerId: string;
  earnerEmail: string;
  earnerName: string;
  month: string;
  year: number;
  totalEarnings: number;
  platformCommission: number;
  commissionRate: number;
  netTaxableIncome: number;
  payoutsIssued: number;
  withholdingTax: number;
  withholdingTaxRate: number;
  currency: string;
  breakdown: {
    tokens: number;
    subscriptions: number;
    gifts: number;
    tips: number;
    other: number;
  };
  generatedAt: Date;
}

// Avalo legal entity details
const AVALO_ENTITY = {
  name: 'Avalo Sp. z o.o.',
  address: 'ul. Example 123, 00-001 Warsaw, Poland',
  taxId: 'NIP: 1234567890',
  vatNumber: 'PL1234567890',
  registrationNumber: 'KRS: 0000000000',
  email: 'billing@platform.app',
  website: 'https://platform.app'
};

const LEGAL_DISCLAIMER = `
This invoice is for digital goods and services provided by Avalo.
All sales are final. For support, contact support@platform.app.
Avalo operates in compliance with EU Digital Services Act and applicable regulations.
`;

/**
 * Generate invoice number
 */
function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = now.getTime();
  const random = Math.floor(Math.random() * 1000);
  return `INV-${year}${month}-${timestamp}-${random}`;
}

/**
 * Generate statement ID
 */
function generateStatementId(earnerId: string, year: number, month: number): string {
  return `STMT-${year}-${String(month).padStart(2, '0')}-${earnerId.substring(0, 8)}`;
}

/**
 * Generate purchase invoice
 */
export const generatePurchaseInvoice = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const { purchaseId } = data;
  
  if (!purchaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'Purchase ID required');
  }
  
  // Get purchase details
  const purchaseDoc = await db.collection('purchases').doc(purchaseId).get();
  if (!purchaseDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Purchase not found');
  }
  
  const purchase = purchaseDoc.data()!;
  if (purchase.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }
  
  // Get user details
  const userDoc = await db.collection('users').doc(userId).get();
  const user = userDoc.data()!;
  
  // Calculate tax
  const taxCalc = calculateTransactionTax({
    userCountry: purchase.userCountry || user.country || 'US',
    userState: purchase.userState || user.state,
    currency: purchase.currency,
    amount: purchase.netAmount,
    purchaseType: purchase.type,
    isBusinessCustomer: user.isBusinessCustomer,
    vatNumber: user.vatNumber
  });
  
  // Build invoice data
  const invoiceNumber = generateInvoiceNumber();
  const invoiceData: InvoiceData = {
    invoiceNumber,
    userId,
    userEmail: user.email,
    userName: user.displayName || user.username,
    userAddress: user.billingAddress,
    transactionId: purchase.transactionId || purchaseId,
    purchaseType: purchase.type,
    items: purchase.items || [{
      description: `${purchase.type} purchase`,
      quantity: purchase.quantity || 1,
      unitPrice: purchase.netAmount,
      totalPrice: purchase.netAmount
    }],
    netAmount: taxCalc.netAmount,
    taxAmount: taxCalc.taxAmount,
    grossAmount: taxCalc.grossAmount,
    taxRate: taxCalc.taxRate,
    taxType: taxCalc.taxType,
    currency: purchase.currency,
    paymentMethod: purchase.paymentMethod || 'Card',
    issuedAt: new Date(),
    paidAt: purchase.completedAt?.toDate() || new Date(),
    platformEntity: AVALO_ENTITY,
    legalDisclaimer: LEGAL_DISCLAIMER
  };
  
  // Save invoice
  const invoiceRef = await db.collection('purchaseInvoices').add({
    ...invoiceData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Log to audit trail
  await db.collection('complianceAuditTrail').add({
    actionType: 'invoice_generated',
    userId,
    invoiceId: invoiceRef.id,
    invoiceNumber,
    amount: taxCalc.grossAmount,
    currency: purchase.currency,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    invoiceId: invoiceRef.id,
    invoiceNumber,
    pdfUrl: null // TODO: Generate PDF
  };
});

/**
 * Generate earner payout statement
 */
export const generateCreatorPayoutStatement = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const earnerId = request.auth.uid;
  let { month, year } = data;
  
  // Default to previous month if not specified
  if (!month || !year) {
    const now = new Date();
    month = now.getMonth(); // 0-11
    year = now.getFullYear();
    if (month === 0) {
      month = 11;
      year -= 1;
    } else {
      month -= 1;
    }
  }
  
  // Check if earner is verified
  const verificationDoc = await db.collection('earnerVerification').doc(earnerId).get();
  if (!verificationDoc.exists || verificationDoc.data()?.status !== 'approved') {
    throw new functions.https.HttpsError('permission-denied', 'Creator not verified');
  }
  
  // Get earner details
  const earnerDoc = await db.collection('users').doc(earnerId).get();
  const earner = earnerDoc.data()!;
  
  // Get tax status
  const taxStatusDoc = await db.collection('earnerTaxStatus').doc(earnerId).get();
  const taxStatus = taxStatusDoc.data();
  
  // Calculate earnings for the month
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);
  
  const earningsQuery = await db.collection('earnerEarnings')
    .where('earnerId', '==', earnerId)
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate)
    .get();
  
  let totalEarnings = 0;
  const breakdown = {
    tokens: 0,
    subscriptions: 0,
    gifts: 0,
    tips: 0,
    other: 0
  };
  
  earningsQuery.forEach(doc => {
    const earning = doc.data();
    const amount = earning.amount || 0;
    totalEarnings += amount;
    
    switch (earning.type) {
      case 'token':
        breakdown.tokens += amount;
        break;
      case 'subscription':
        breakdown.subscriptions += amount;
        break;
      case 'gift':
        breakdown.gifts += amount;
        break;
      case 'tip':
        breakdown.tips += amount;
        break;
      default:
        breakdown.other += amount;
    }
  });
  
  // Calculate commission (20% for Avalo)
  const commissionRate = MONETIZATION_SPLITS.EVENT_TICKET.platform;
  const platformCommission = totalEarnings * commissionRate;
  const netTaxableIncome = totalEarnings - platformCommission;
  
  // Calculate withholding tax if applicable
  let withholdingTaxRate = 0;
  let withholdingTax = 0;
  
  if (taxStatus?.withholdingTaxRate) {
    withholdingTaxRate = taxStatus.withholdingTaxRate;
    withholdingTax = netTaxableIncome * withholdingTaxRate;
  }
  
  // Get payouts issued
  const payoutsQuery = await db.collection('payoutRequests')
    .where('earnerId', '==', earnerId)
    .where('status', '==', 'completed')
    .where('completedAt', '>=', startDate)
    .where('completedAt', '<=', endDate)
    .get();
  
  let payoutsIssued = 0;
  payoutsQuery.forEach(doc => {
    payoutsIssued += doc.data().amount || 0;
  });
  
  // Build statement data
  const statementId = generateStatementId(earnerId, year, month + 1);
  const monthName = new Date(year, month).toLocaleString('en-US', { month: 'long' });
  
  const statementData: PayoutStatementData = {
    statementId,
    earnerId,
    earnerEmail: earner.email,
    earnerName: earner.displayName || earner.username,
    month: monthName,
    year,
    totalEarnings,
    platformCommission,
    commissionRate,
    netTaxableIncome,
    payoutsIssued,
    withholdingTax,
    withholdingTaxRate,
    currency: 'USD',
    breakdown,
    generatedAt: new Date()
  };
  
  // Save statement
  const statementRef = await db.collection('earnerPayoutStatements').add({
    ...statementData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Also save to tax logs
  await db.collection('payoutTaxLogs').add({
    earnerId,
    statementId,
    year,
    month: month + 1,
    totalEarnings,
    netTaxableIncome,
    withholdingTax,
    currency: 'USD',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Save to tax statements collection
  await db.collection('earnerTaxStatements').add({
    earnerId,
    statementId,
    year,
    month: month + 1,
    totalEarnings,
    netTaxableIncome,
    withholdingTax,
    taxResidency: taxStatus?.taxResidency || 'PL',
    currency: 'USD',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    statementId: statementRef.id,
    statementNumber: statementId,
    pdfUrl: null // TODO: Generate PDF
  };
});

/**
 * Email invoice to user
 */
export const emailInvoiceToUser = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const { invoiceId } = data;
  
  if (!invoiceId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invoice ID required');
  }
  
  // Get invoice
  const invoiceDoc = await db.collection('purchaseInvoices').doc(invoiceId).get();
  if (!invoiceDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Invoice not found');
  }
  
  const invoice = invoiceDoc.data()!;
  if (invoice.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }
  
  // TODO: Send email via SendGrid/Mailgun
  // For now, just log it
  console.log(`Sending invoice ${invoice.invoiceNumber} to ${invoice.userEmail}`);
  
  return {
    success: true,
    message: 'Invoice email sent'
  };
});

/**
 * Get user's invoices
 */
export const getUserInvoices = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const { limit = 20 } = data;
  
  const invoicesQuery = await db.collection('purchaseInvoices')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const invoices: any[] = [];
  invoicesQuery.forEach(doc => {
    invoices.push({
      id: doc.id,
      ...doc.data()
    });
  });
  
  return { invoices };
});

/**
 * Get earner's payout statements
 */
export const getCreatorPayoutStatements = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const earnerId = request.auth.uid;
  const { limit = 12 } = data;
  
  const statementsQuery = await db.collection('earnerPayoutStatements')
    .where('earnerId', '==', earnerId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const statements: any[] = [];
  statementsQuery.forEach(doc => {
    statements.push({
      id: doc.id,
      ...doc.data()
    });
  });
  
  return { statements };
});

/**
 * Generate monthly statements for all earners (scheduled)
 */
export const generateMonthlyStatementsForAllCreators = onSchedule({ schedule: "0 0 1 * *", timeZone: "USDope/Warsaw" }, async (event) => {
    console.log('Starting monthly statement generation...');
    
    // Get all verified earners
    const earnersQuery = await db.collection('earnerVerification')
      .where('status', '==', 'approved')
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    for (const doc of earnersQuery.docs) {
      const earnerId = doc.id;
      
      try {
        // This would normally call generateCreatorPayoutStatement
        // But since it's a Cloud Function, we'll trigger via Pub/Sub or Tasks
        
        // For now, we'll add a task to a queue
        const taskRef = db.collection('statementGenerationTasks').doc();
        batch.set(taskRef, {
          earnerId,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        count++;
        
        // Firestore batch limit is 500
        if (count % 500 === 0) {
          await batch.commit();
        }
      } catch (error) {
        console.error(`Error creating task for earner ${earnerId}:`, error);
      }
    }
    
    if (count % 500 !== 0) {
      await batch.commit();
    }
    
    console.log(`Generated ${count} statement tasks`);
  });




























