/**
 * PACK 195: Legal & Tax Command Center Types
 * Contracts, invoicing, tax compliance, and creator protection
 */

export type ContractType =
  | 'brand_collaboration'
  | 'licensing_agreement'
  | 'digital_product_rights'
  | 'model_release'
  | 'event_hosting'
  | 'nda'
  | 'image_rights';

export type ContractStatus =
  | 'draft'
  | 'pending_signature'
  | 'signed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export type TaxRegion =
  | 'US'
  | 'EU'
  | 'UK'
  | 'CA'
  | 'AU'
  | 'JP'
  | 'KR'
  | 'BR'
  | 'MX'
  | 'IN'
  | 'OTHER';

export type TaxType =
  | 'VAT'
  | 'GST'
  | 'SALES_TAX'
  | 'IVA'
  | 'NONE';

export interface ContractParty {
  userId: string;
  legalName: string;
  displayName?: string;
  email: string;
  address?: string;
  taxId?: string;
  signedAt?: Date;
  ipAddress?: string;
}

export interface ContractTerms {
  description: string;
  scope: string[];
  deliverables?: string[];
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentSchedule?: string;
  startDate?: Date;
  endDate?: Date;
  exclusivity?: {
    enabled: boolean;
    scope?: string;
    duration?: number;
  };
  intellectualProperty?: {
    ownershipTransfer: boolean;
    licenseGrant?: string;
    restrictions?: string[];
  };
  confidentiality?: {
    enabled: boolean;
    duration?: number;
    exceptions?: string[];
  };
}

export interface Contract {
  id: string;
  type: ContractType;
  status: ContractStatus;
  creatorId: string;
  creator: ContractParty;
  counterparty: ContractParty;
  terms: ContractTerms;
  createdAt: Date;
  updatedAt: Date;
  signedAt?: Date;
  expiresAt?: Date;
  templateId?: string;
  version: number;
  reviewPeriodEndsAt?: Date;
  antiExploitationChecks: {
    passed: boolean;
    warnings: string[];
    blockers: string[];
    checkedAt: Date;
  };
  metadata?: {
    industry?: string;
    projectName?: string;
    referenceNumber?: string;
  };
}

export interface Invoice {
  id: string;
  creatorId: string;
  customerId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  taxRegion: TaxRegion;
  taxType: TaxType;
  taxRate: number;
  createdAt: Date;
  updatedAt: Date;
  dueAt: Date;
  paidAt?: Date;
  notes?: string;
  paymentReference?: string;
  customerInfo: {
    name: string;
    email: string;
    address?: string;
    taxId?: string;
  };
  creatorInfo: {
    legalName: string;
    displayName?: string;
    email: string;
    address?: string;
    taxId?: string;
  };
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxable: boolean;
}

export interface TaxProfile {
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
  taxSettings: {
    collectTax: boolean;
    taxRate?: number;
    taxType?: TaxType;
  };
  payoutInfo?: {
    method: 'stripe' | 'wise' | 'bank';
    accountId?: string;
    bankDetails?: {
      accountNumber?: string;
      routingNumber?: string;
      iban?: string;
      swift?: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
  verified: boolean;
}

export interface LegalResource {
  id: string;
  region: TaxRegion;
  type: 'guide' | 'template' | 'faq' | 'external_link';
  title: string;
  description: string;
  content?: string;
  url?: string;
  category: string;
  tags: string[];
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EarningsCertificate {
  id: string;
  userId: string;
  certificateNumber: string;
  periodStart: Date;
  periodEnd: Date;
  totalEarnings: number;
  recurringRevenue: number;
  currency: string;
  transactionCount: number;
  generatedAt: Date;
  expiresAt: Date;
  verified: boolean;
  includesDetails: {
    payoutHistory: boolean;
    revenueBreakdown: boolean;
    verifiedPayouts: boolean;
  };
}

export interface TaxReport {
  id: string;
  userId: string;
  reportType: 'monthly' | 'quarterly' | 'annual';
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    grossRevenue: number;
    netRevenue: number;
    taxCollected: number;
    platformFee: number;
    payouts: number;
  };
  breakdown: {
    byType: Record<string, number>;
    byRegion: Record<TaxRegion, number>;
  };
  currency: string;
  generatedAt: Date;
  format: 'pdf' | 'csv' | 'json';
  downloadUrl?: string;
}

export interface ContractDispute {
  id: string;
  contractId: string;
  raisedBy: string;
  against: string;
  reason: string;
  description: string;
  status: 'open' | 'mediation' | 'resolved' | 'escalated';
  evidence: string[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface AntiExploitationCheck {
  contractId: string;
  checks: {
    excessiveSplit: boolean;
    forcedExclusivity: boolean;
    lifetimeExclusivity: boolean;
    romanticClauses: boolean;
    modelingEscortRed: boolean;
    insufficientReviewTime: boolean;
  };
  warnings: string[];
  blockers: string[];
  passed: boolean;
  checkedAt: Date;
}

export interface ContractTemplate {
  id: string;
  type: ContractType;
  name: string;
  description: string;
  template: string;
  variables: string[];
  region?: TaxRegion;
  language: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
}