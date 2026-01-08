/**
 * PACK 195: Invoicing & Tax Calculation Functions
 * Automatic invoice generation with global tax compliance
 */

import { db, serverTimestamp, generateId } from '../init';
import {
  Invoice,
  InvoiceStatus,
  InvoiceItem,
  TaxProfile,
  TaxRegion,
  TaxType,
  TaxReport,
  EarningsCertificate,
} from './types';

const TAX_RATES: Record<TaxRegion, { rate: number; type: TaxType }> = {
  US: { rate: 0, type: 'SALES_TAX' },
  EU: { rate: 0.20, type: 'VAT' },
  UK: { rate: 0.20, type: 'VAT' },
  CA: { rate: 0.05, type: 'GST' },
  AU: { rate: 0.10, type: 'GST' },
  JP: { rate: 0.10, type: 'SALES_TAX' },
  KR: { rate: 0.10, type: 'VAT' },
  BR: { rate: 0.17, type: 'IVA' },
  MX: { rate: 0.16, type: 'IVA' },
  IN: { rate: 0.18, type: 'GST' },
  OTHER: { rate: 0, type: 'NONE' },
};

export async function generateInvoice(data: {
  creatorId: string;
  customerId: string;
  items: InvoiceItem[];
  currency: string;
  customerInfo: {
    name: string;
    email: string;
    address?: string;
    taxId?: string;
    region?: TaxRegion;
  };
  notes?: string;
  dueInDays?: number;
}): Promise<{ invoiceId: string; invoice: Invoice }> {
  const invoiceId = generateId();

  const taxProfileSnap = await db
    .collection('tax_profiles')
    .doc(data.creatorId)
    .get();

  if (!taxProfileSnap.exists) {
    throw new Error('Creator must set up tax profile first');
  }

  const taxProfile = taxProfileSnap.data() as TaxProfile;

  const customerRegion = data.customerInfo.region || 'OTHER';
  const taxInfo = TAX_RATES[customerRegion];

  let subtotal = 0;
  for (const item of data.items) {
    subtotal += item.totalPrice;
  }

  const shouldCollectTax =
    taxProfile.taxSettings.collectTax && taxInfo.rate > 0;

  const taxAmount = shouldCollectTax ? subtotal * taxInfo.rate : 0;
  const totalAmount = subtotal + taxAmount;

  const invoiceNumber = await generateInvoiceNumber(
    data.creatorId,
    taxProfile.taxRegion
  );

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + (data.dueInDays || 30));

  const invoice: Invoice = {
    id: invoiceId,
    creatorId: data.creatorId,
    customerId: data.customerId,
    invoiceNumber,
    status: 'pending',
    items: data.items,
    subtotal,
    taxAmount,
    totalAmount,
    currency: data.currency,
    taxRegion: customerRegion,
    taxType: taxInfo.type,
    taxRate: taxInfo.rate,
    createdAt: new Date(),
    updatedAt: new Date(),
    dueAt,
    notes: data.notes,
    customerInfo: {
      name: data.customerInfo.name,
      email: data.customerInfo.email,
      address: data.customerInfo.address,
      taxId: data.customerInfo.taxId,
    },
    creatorInfo: {
      legalName: taxProfile.legalName,
      displayName: taxProfile.businessName,
      email: taxProfile.userId,
      address: `${taxProfile.address.street}, ${taxProfile.address.city}, ${taxProfile.address.country}`,
      taxId: taxProfile.taxId,
    },
  };

  await db.collection('invoices').doc(invoiceId).set({
    ...invoice,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    dueAt: dueAt,
  });

  return { invoiceId, invoice };
}

async function generateInvoiceNumber(
  creatorId: string,
  region: TaxRegion
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const countRef = db
    .collection('invoice_counters')
    .doc(`${creatorId}-${year}-${month}`);

  const result = await db.runTransaction(async (transaction) => {
    const countDoc = await transaction.get(countRef);

    let count = 1;
    if (countDoc.exists) {
      count = (countDoc.data()?.count || 0) + 1;
    }

    transaction.set(countRef, { count, updatedAt: serverTimestamp() }, { merge: true });

    return count;
  });

  const regionCode = region.substring(0, 2).toUpperCase();
  return `${regionCode}-${year}${month}-${String(result).padStart(4, '0')}`;
}

export async function markInvoicePaid(data: {
  invoiceId: string;
  paymentReference: string;
}): Promise<{ success: boolean }> {
  const invoiceRef = db.collection('invoices').doc(data.invoiceId);
  const invoiceSnap = await invoiceRef.get();

  if (!invoiceSnap.exists) {
    throw new Error('Invoice not found');
  }

  const invoice = invoiceSnap.data() as Invoice;

  if (invoice.status === 'paid') {
    throw new Error('Invoice already marked as paid');
  }

  await invoiceRef.update({
    status: 'paid',
    paidAt: serverTimestamp(),
    paymentReference: data.paymentReference,
    updatedAt: serverTimestamp(),
  });

  return { success: true };
}

export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const snap = await db.collection('invoices').doc(invoiceId).get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as Invoice;
}

export async function getCreatorInvoices(data: {
  creatorId: string;
  status?: InvoiceStatus;
  limit?: number;
}): Promise<Invoice[]> {
  let query = db
    .collection('invoices')
    .where('creatorId', '==', data.creatorId)
    .orderBy('createdAt', 'desc');

  if (data.status) {
    query = query.where('status', '==', data.status) as any;
  }

  if (data.limit) {
    query = query.limit(data.limit) as any;
  }

  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as Invoice);
}

export async function createTaxProfile(data: {
  userId: string;
  legalName: string;
  businessName?: string;
  taxRegion: TaxRegion;
  taxId?: string;
  vatNumber?: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  businessType: 'individual' | 'sole_proprietor' | 'company' | 'partnership';
}): Promise<{ success: boolean }> {
  const taxProfile: TaxProfile = {
    userId: data.userId,
    legalName: data.legalName,
    businessName: data.businessName,
    taxRegion: data.taxRegion,
    taxId: data.taxId,
    vatNumber: data.vatNumber,
    address: data.address,
    businessType: data.businessType,
    taxSettings: {
      collectTax: true,
      taxRate: TAX_RATES[data.taxRegion].rate,
      taxType: TAX_RATES[data.taxRegion].type,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: false,
  };

  await db.collection('tax_profiles').doc(data.userId).set({
    ...taxProfile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { success: true };
}

export async function updateTaxProfile(data: {
  userId: string;
  updates: Partial<TaxProfile>;
}): Promise<{ success: boolean }> {
  const taxProfileRef = db.collection('tax_profiles').doc(data.userId);
  const snap = await taxProfileRef.get();

  if (!snap.exists) {
    throw new Error('Tax profile not found');
  }

  await taxProfileRef.update({
    ...data.updates,
    updatedAt: serverTimestamp(),
  });

  return { success: true };
}

export async function getTaxProfile(userId: string): Promise<TaxProfile | null> {
  const snap = await db.collection('tax_profiles').doc(userId).get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as TaxProfile;
}

export async function generateTaxReport(data: {
  userId: string;
  reportType: 'monthly' | 'quarterly' | 'annual';
  period: {
    start: Date;
    end: Date;
  };
}): Promise<{ reportId: string; report: TaxReport }> {
  const reportId = generateId();

  const invoicesSnap = await db
    .collection('invoices')
    .where('creatorId', '==', data.userId)
    .where('status', '==', 'paid')
    .where('paidAt', '>=', data.period.start)
    .where('paidAt', '<=', data.period.end)
    .get();

  let grossRevenue = 0;
  let taxCollected = 0;
  const byType: Record<string, number> = {};
  const byRegion: Record<TaxRegion, number> = {} as any;

  for (const doc of invoicesSnap.docs) {
    const invoice = doc.data() as Invoice;
    grossRevenue += invoice.totalAmount;
    taxCollected += invoice.taxAmount;

    byType[invoice.taxType] = (byType[invoice.taxType] || 0) + invoice.totalAmount;
    byRegion[invoice.taxRegion] =
      (byRegion[invoice.taxRegion] || 0) + invoice.totalAmount;
  }

  const platformFee = grossRevenue * 0.35;
  const netRevenue = grossRevenue - platformFee;

  const report: TaxReport = {
    id: reportId,
    userId: data.userId,
    reportType: data.reportType,
    period: data.period,
    summary: {
      grossRevenue,
      netRevenue,
      taxCollected,
      platformFee,
      payouts: netRevenue,
    },
    breakdown: {
      byType,
      byRegion,
    },
    currency: 'USD',
    generatedAt: new Date(),
    format: 'json',
  };

  await db.collection('tax_reports').doc(reportId).set({
    ...report,
    generatedAt: serverTimestamp(),
  });

  return { reportId, report };
}

export async function generateEarningsCertificate(data: {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<{ certificateId: string; certificate: EarningsCertificate }> {
  const certificateId = generateId();

  const invoicesSnap = await db
    .collection('invoices')
    .where('creatorId', '==', data.userId)
    .where('status', '==', 'paid')
    .where('paidAt', '>=', data.periodStart)
    .where('paidAt', '<=', data.periodEnd)
    .get();

  let totalEarnings = 0;
  let transactionCount = 0;

  for (const doc of invoicesSnap.docs) {
    const invoice = doc.data() as Invoice;
    totalEarnings += invoice.totalAmount;
    transactionCount++;
  }

  const recurringRevenue = totalEarnings / 12;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  const certificateNumber = await generateCertificateNumber(data.userId);

  const certificate: EarningsCertificate = {
    id: certificateId,
    userId: data.userId,
    certificateNumber,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    totalEarnings,
    recurringRevenue,
    currency: 'USD',
    transactionCount,
    generatedAt: new Date(),
    expiresAt,
    verified: true,
    includesDetails: {
      payoutHistory: true,
      revenueBreakdown: true,
      verifiedPayouts: true,
    },
  };

  await db.collection('earnings_certificates').doc(certificateId).set({
    ...certificate,
    generatedAt: serverTimestamp(),
  });

  return { certificateId, certificate };
}

async function generateCertificateNumber(userId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();

  const countRef = db
    .collection('certificate_counters')
    .doc(`${userId}-${year}`);

  const result = await db.runTransaction(async (transaction) => {
    const countDoc = await transaction.get(countRef);

    let count = 1;
    if (countDoc.exists) {
      count = (countDoc.data()?.count || 0) + 1;
    }

    transaction.set(countRef, { count, updatedAt: serverTimestamp() }, { merge: true });

    return count;
  });

  return `EC-${year}-${String(result).padStart(6, '0')}`;
}

export async function calculateTax(data: {
  amount: number;
  region: TaxRegion;
}): Promise<{ taxAmount: number; taxRate: number; taxType: TaxType }> {
  const taxInfo = TAX_RATES[data.region];

  return {
    taxAmount: data.amount * taxInfo.rate,
    taxRate: taxInfo.rate,
    taxType: taxInfo.type,
  };
}