import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * PACK 195: Legal & Tax Command Center Cloud Functions
 * HTTP endpoints and scheduled jobs
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../init';
import { onSchedule } from '../runtime';
import {
  generateContract,
  signContract,
  getContractById,
  getCreatorContracts,
  cancelContract,
  raiseContractDispute,
  updateContractTerms,
  runAntiExploitationChecks,
} from './contractManagement';
import {
  generateInvoice,
  markInvoicePaid,
  getInvoiceById,
  getCreatorInvoices,
  createTaxProfile,
  updateTaxProfile,
  getTaxProfile,
  generateTaxReport,
  generateEarningsCertificate,
  calculateTax,
} from './invoicingTax';

export const generateContractFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await generateContract({
        earnerId: request.auth.uid,
        type: data.type,
        earner: data.earner,
        counterparty: data.counterparty,
        terms: data.terms,
        templateId: data.templateId,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const signContractFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await signContract({
        contractId: data.contractId,
        userId: request.auth.uid,
        ipAddress: data.ipAddress || 'unknown',
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const getContractFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const contract = await getContractById(data.contractId);

      if (!contract) {
        throw new Error('Contract not found');
      }

      if (
        contract.earnerId !== request.auth.uid &&
        contract.counterparty.userId !== request.auth.uid
      ) {
        throw new Error('Unauthorized access to contract');
      }

      return contract;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const getCreatorContractsFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const contracts = await getCreatorContracts({
        earnerId: request.auth.uid,
        status: data.status,
        limit: data.limit || 50,
      });

      return contracts;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const cancelContractFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await cancelContract({
        contractId: data.contractId,
        userId: request.auth.uid,
        reason: data.reason,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const raiseContractDisputeFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await raiseContractDispute({
        contractId: data.contractId,
        raisedBy: request.auth.uid,
        reason: data.reason,
        description: data.description,
        evidence: data.evidence || [],
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const updateContractTermsFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await updateContractTerms({
        contractId: data.contractId,
        userId: request.auth.uid,
        terms: data.terms,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const checkContractExploitationFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await runAntiExploitationChecks({
        type: data.type,
        terms: data.terms,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const generateInvoiceFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await generateInvoice({
        earnerId: request.auth.uid,
        customerId: data.customerId,
        items: data.items,
        currency: data.currency || 'USD',
        customerInfo: data.customerInfo,
        notes: data.notes,
        dueInDays: data.dueInDays,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const markInvoicePaidFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await markInvoicePaid({
        invoiceId: data.invoiceId,
        paymentReference: data.paymentReference,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const getInvoiceFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const invoice = await getInvoiceById(data.invoiceId);

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (
        invoice.earnerId !== request.auth.uid &&
        invoice.customerId !== request.auth.uid
      ) {
        throw new Error('Unauthorized access to invoice');
      }

      return invoice;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const getCreatorInvoicesFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const invoices = await getCreatorInvoices({
        earnerId: request.auth.uid,
        status: data.status,
        limit: data.limit || 50,
      });

      return invoices;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const createTaxProfileFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await createTaxProfile({
        userId: request.auth.uid,
        legalName: data.legalName,
        businessName: data.businessName,
        taxRegion: data.taxRegion,
        taxId: data.taxId,
        vatNumber: data.vatNumber,
        address: data.address,
        businessType: data.businessType,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const updateTaxProfileFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await updateTaxProfile({
        userId: request.auth.uid,
        updates: data.updates,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const getTaxProfileFunction = functions.https.onCall(async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const profile = await getTaxProfile(request.auth.uid);
      return profile;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const generateTaxReportFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await generateTaxReport({
        userId: request.auth.uid,
        reportType: data.reportType,
        period: {
          start: new Date(data.period.start),
          end: new Date(data.period.end),
        },
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const generateEarningsCertificateFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await generateEarningsCertificate({
        userId: request.auth.uid,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const calculateTaxFunction = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      const result = await calculateTax({
        amount: data.amount,
        region: data.region,
      });

      return result;
    } catch (error: any) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const monthlyTaxReportsScheduled = onSchedule({ schedule: "0 1 1 * *", timeZone: "UTC" }, async (event) => {
    console.log('Running monthly tax reports generation...');

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const earnersSnap = await db
      .collection('tax_profiles')
      .where('taxSettings.collectTax', '==', true)
      .get();

    const batch = db.batch();
    let count = 0;

    for (const doc of earnersSnap.docs) {
      const profile = doc.data();

      try {
        const { reportId, report } = await generateTaxReport({
          userId: profile.userId,
          reportType: 'monthly',
          period: {
            start: lastMonth,
            end: lastMonthEnd,
          },
        });

        console.log(`Generated monthly report for user ${profile.userId}: ${reportId}`);
        count++;
      } catch (error) {
        console.error(`Failed to generate report for ${profile.userId}:`, error);
      }
    }

    console.log(`Generated ${count} monthly tax reports`);
    return;
  });

export const quarterlyTaxReportsScheduled = onSchedule({ schedule: "0 2 1 1,4,7,10 *", timeZone: "UTC" }, async (event) => {
    console.log('Running quarterly tax reports generation...');

    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const quarterStart = new Date(now.getFullYear(), quarter * 3 - 3, 1);
    const quarterEnd = new Date(now.getFullYear(), quarter * 3, 0);

    const earnersSnap = await db
      .collection('tax_profiles')
      .where('taxSettings.collectTax', '==', true)
      .get();

    let count = 0;

    for (const doc of earnersSnap.docs) {
      const profile = doc.data();

      try {
        const { reportId, report } = await generateTaxReport({
          userId: profile.userId,
          reportType: 'quarterly',
          period: {
            start: quarterStart,
            end: quarterEnd,
          },
        });

        console.log(`Generated quarterly report for user ${profile.userId}: ${reportId}`);
        count++;
      } catch (error) {
        console.error(`Failed to generate report for ${profile.userId}:`, error);
      }
    }

    console.log(`Generated ${count} quarterly tax reports`);
    return;
  });

export const contractExpirationRemindersScheduled = onSchedule({ schedule: "0 9 * * *", timeZone: "UTC" }, async (event) => {
    console.log('Checking for expiring contracts...');

    const now = new Date();
    const warningDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const contractsSnap = await db
      .collection('contracts')
      .where('status', '==', 'active')
      .where('expiresAt', '<=', warningDate)
      .where('expiresAt', '>=', now)
      .get();

    const batch = db.batch();

    for (const doc of contractsSnap.docs) {
      const contract = doc.data();

      const notificationRef = db.collection('notifications').doc();
      batch.set(notificationRef, {
        userId: contract.earnerId,
        type: 'contract_expiring',
        title: 'Contract Expiring Soon',
        message: `Your contract with ${contract.counterparty.displayName || contract.counterparty.legalName} expires in 30 days`,
        data: {
          contractId: contract.id,
          expiresAt: contract.expiresAt,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    }

    await batch.commit();
    console.log(`Sent ${contractsSnap.size} contract expiration reminders`);
    return;
  });

export const overdueInvoiceRemindersScheduled = onSchedule({ schedule: "0 10 * * *", timeZone: "UTC" }, async (event) => {
    console.log('Checking for overdue invoices...');

    const now = new Date();

    const invoicesSnap = await db
      .collection('invoices')
      .where('status', '==', 'pending')
      .where('dueAt', '<', now)
      .get();

    const batch = db.batch();

    for (const doc of invoicesSnap.docs) {
      const invoice = doc.data();

      batch.update(doc.ref, {
        status: 'overdue',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const notificationRef = db.collection('notifications').doc();
      batch.set(notificationRef, {
        userId: invoice.earnerId,
        type: 'invoice_overdue',
        title: 'Invoice Overdue',
        message: `Invoice ${invoice.invoiceNumber} is now overdue`,
        data: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    }

    await batch.commit();
    console.log(`Marked ${invoicesSnap.size} invoices as overdue`);
    return;
  });



























