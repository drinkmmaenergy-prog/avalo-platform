/**
 * PACK 445 – Enterprise Readiness & Due Diligence Toolkit
 * AuditEvidenceAssembler
 * 
 * Collects and organizes audit-grade evidence including logs,
 * algorithmic decisions, and policies for Big4, banks, and regulators.
 */

import { firestore } from 'firebase-admin';

export interface AuditEvidence {
  id: string;
  category: 'logs' | 'decisions' | 'policies' | 'compliance' | 'financial';
  timestamp: Date;
  period: {
    start: Date;
    end: Date;
  };
  evidence: EvidencePackage;
  metadata: {
    generatedBy: string;
    purpose: string;
    confidentiality: 'public' | 'internal' | 'confidential' | 'restricted';
  };
}

export interface EvidencePackage {
  logs?: SystemLogs;
  decisions?: AlgorithmicDecisions;
  policies?: PolicyDocuments;
  compliance?: ComplianceRecords;
  financial?: FinancialRecords;
}

export interface SystemLogs {
  accessLogs: LogEntry[];
  securityLogs: LogEntry[];
  auditTrail: LogEntry[];
  errorLogs: LogEntry[];
  summary: {
    totalEntries: number;
    period: { start: Date; end: Date };
    anomalies: number;
  };
}

export interface LogEntry {
  timestamp: Date;
  type: string;
  userId?: string;
  action: string;
  resource?: string;
  status: 'success' | 'failure' | 'warning';
  metadata?: Record<string, any>;
}

export interface AlgorithmicDecisions {
  matchingDecisions: DecisionRecord[];
  contentModeration: DecisionRecord[];
  fraudDetection: DecisionRecord[];
  pricingAlgorithms: DecisionRecord[];
  summary: {
    totalDecisions: number;
    appealable: number;
    appealed: number;
    overturned: number;
  };
}

export interface DecisionRecord {
  id: string;
  timestamp: Date;
  algorithm: string;
  version: string;
  input: Record<string, any>;
  output: any;
  confidence: number;
  reasoning?: string;
  humanReviewed: boolean;
  appealed: boolean;
}

export interface PolicyDocuments {
  privacyPolicy: PolicyVersion[];
  termsOfService: PolicyVersion[];
  cookiePolicy: PolicyVersion[];
  communityGuidelines: PolicyVersion[];
  dataRetention: PolicyVersion[];
  current: {
    privacyPolicy: string;
    termsOfService: string;
    effectiveDate: Date;
  };
}

export interface PolicyVersion {
  version: string;
  effectiveDate: Date;
  expiryDate?: Date;
  content: string;
  changes: string;
  approvedBy: string;
}

export interface ComplianceRecords {
  gdpr: {
    dataSubjectRequests: DSRRecord[];
    consentRecords: ConsentRecord[];
    breachNotifications: BreachRecord[];
  };
  ccpa: {
    optOutRequests: OptOutRecord[];
    dataDisclosure: DisclosureRecord[];
  };
  pci: {
    complianceReports: ComplianceReport[];
    quarterlyScans: ScanReport[];
  };
}

export interface DSRRecord {
  id: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  requestedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'completed' | 'rejected';
  userId: string;
}

export interface ConsentRecord {
  userId: string;
  purpose: string;
  grantedAt: Date;
  revokedAt?: Date;
  version: string;
}

export interface BreachRecord {
  id: string;
  occurredAt: Date;
  discoveredAt: Date;
  notifiedAt?: Date;
  affected: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigated: boolean;
}

export interface OptOutRecord {
  userId: string;
  requestedAt: Date;
  processedAt: Date;
  categories: string[];
}

export interface DisclosureRecord {
  period: { start: Date; end: Date };
  dataCategories: string[];
  recipients: string[];
  purpose: string;
}

export interface ComplianceReport {
  period: { start: Date; end: Date };
  compliant: boolean;
  attestation: string;
  auditor?: string;
}

export interface ScanReport {
  date: Date;
  vendor: string;
  findings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  remediated: boolean;
}

export interface FinancialRecords {
  transactions: TransactionEvidence[];
  revenue: RevenueEvidence;
  reconciliation: ReconciliationReport[];
  taxDocuments: TaxEvidence[];
}

export interface TransactionEvidence {
  month: string;
  totalTransactions: number;
  totalVolume: number;
  averageValue: number;
  refunds: number;
  chargebacks: number;
}

export interface RevenueEvidence {
  period: { start: Date; end: Date };
  breakdown: {
    subscriptions: number;
    transactions: number;
    advertising: number;
  };
  recognized: number;
  deferred: number;
}

export interface ReconciliationReport {
  month: string;
  systemBalance: number;
  bankBalance: number;
  difference: number;
  reconciled: boolean;
  notes?: string;
}

export interface TaxEvidence {
  period: string;
  jurisdiction: string;
  taxType: string;
  amount: number;
  filed: boolean;
  filedAt?: Date;
}

export class AuditEvidenceAssembler {
  private db = firestore();

  /**
   * Assemble complete audit evidence package for a given period
   */
  async assembleEvidencePackage(
    period: { start: Date; end: Date },
    categories: Array<'logs' | 'decisions' | 'policies' | 'compliance' | 'financial'> = ['logs', 'decisions', 'policies', 'compliance', 'financial'],
    purpose: string = 'General Audit'
  ): Promise<AuditEvidence> {
    const evidence: EvidencePackage = {};

    // Collect evidence for each category
    if (categories.includes('logs')) {
      evidence.logs = await this.collectSystemLogs(period);
    }

    if (categories.includes('decisions')) {
      evidence.decisions = await this.collectAlgorithmicDecisions(period);
    }

    if (categories.includes('policies')) {
      evidence.policies = await this.collectPolicyDocuments(period);
    }

    if (categories.includes('compliance')) {
      evidence.compliance = await this.collectComplianceRecords(period);
    }

    if (categories.includes('financial')) {
      evidence.financial = await this.collectFinancialRecords(period);
    }

    const auditEvidence: AuditEvidence = {
      id: `evidence_${Date.now()}`,
      category: categories[0], // Primary category
      timestamp: new Date(),
      period,
      evidence,
      metadata: {
        generatedBy: 'AuditEvidenceAssembler',
        purpose,
        confidentiality: 'confidential'
      }
    };

    // Store evidence package
    await this.db.collection('auditEvidence').doc(auditEvidence.id).set(auditEvidence);

    return auditEvidence;
  }

  /**
   * Collect system logs for audit period
   */
  private async collectSystemLogs(period: { start: Date; end: Date }): Promise<SystemLogs> {
    const accessLogs = await this.queryLogs('access', period);
    const securityLogs = await this.queryLogs('security', period);
    const auditTrail = await this.queryLogs('audit', period);
    const errorLogs = await this.queryLogs('error', period);

    const totalEntries = accessLogs.length + securityLogs.length + auditTrail.length + errorLogs.length;
    const anomalies = securityLogs.filter(log => log.status === 'failure').length;

    return {
      accessLogs,
      securityLogs,
      auditTrail,
      errorLogs,
      summary: {
        totalEntries,
        period,
        anomalies
      }
    };
  }

  /**
   * Collect algorithmic decision records
   */
  private async collectAlgorithmicDecisions(period: { start: Date; end: Date }): Promise<AlgorithmicDecisions> {
    const matchingDecisions = await this.queryDecisions('matching', period);
    const contentModeration = await this.queryDecisions('moderation', period);
    const fraudDetection = await this.queryDecisions('fraud', period);
    const pricingAlgorithms = await this.queryDecisions('pricing', period);

    const allDecisions = [...matchingDecisions, ...contentModeration, ...fraudDetection, ...pricingAlgorithms];
    const appealable = allDecisions.filter(d => d.humanReviewed === false).length;
    const appealed = allDecisions.filter(d => d.appealed === true).length;
    const overturned = 0; // Would need to track this separately

    return {
      matchingDecisions,
      contentModeration,
      fraudDetection,
      pricingAlgorithms,
      summary: {
        totalDecisions: allDecisions.length,
        appealable,
        appealed,
        overturned
      }
    };
  }

  /**
   * Collect policy documents
   */
  private async collectPolicyDocuments(period: { start: Date; end: Date }): Promise<PolicyDocuments> {
    const policies = await this.db
      .collection('legalDocuments')
      .where('type', 'in', ['privacy', 'terms', 'cookies', 'community', 'retention'])
      .get();

    const privacyPolicy: PolicyVersion[] = [];
    const termsOfService: PolicyVersion[] = [];
    const cookiePolicy: PolicyVersion[] = [];
    const communityGuidelines: PolicyVersion[] = [];
    const dataRetention: PolicyVersion[] = [];

    policies.forEach(doc => {
      const policy = doc.data() as PolicyVersion & { type: string };
      const version: PolicyVersion = {
        version: policy.version,
        effectiveDate: policy.effectiveDate,
        expiryDate: policy.expiryDate,
        content: policy.content,
        changes: policy.changes,
        approvedBy: policy.approvedBy
      };

      switch (policy.type) {
        case 'privacy':
          privacyPolicy.push(version);
          break;
        case 'terms':
          termsOfService.push(version);
          break;
        case 'cookies':
          cookiePolicy.push(version);
          break;
        case 'community':
          communityGuidelines.push(version);
          break;
        case 'retention':
          dataRetention.push(version);
          break;
      }
    });

    // Get current versions
    const currentPrivacy = privacyPolicy.sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
    const currentTerms = termsOfService.sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];

    return {
      privacyPolicy,
      termsOfService,
      cookiePolicy,
      communityGuidelines,
      dataRetention,
      current: {
        privacyPolicy: currentPrivacy?.version || '3.0',
        termsOfService: currentTerms?.version || '3.0',
        effectiveDate: currentPrivacy?.effectiveDate || new Date()
      }
    };
  }

  /**
   * Collect compliance records
   */
  private async collectComplianceRecords(period: { start: Date; end: Date }): Promise<ComplianceRecords> {
    // GDPR records
    const dsrSnapshot = await this.db
      .collection('dataSubjectRequests')
      .where('requestedAt', '>=', period.start)
      .where('requestedAt', '<=', period.end)
      .get();

    const dataSubjectRequests: DSRRecord[] = dsrSnapshot.docs.map(doc => doc.data() as DSRRecord);

    const consentSnapshot = await this.db
      .collection('userConsents')
      .where('grantedAt', '>=', period.start)
      .where('grantedAt', '<=', period.end)
      .get();

    const consentRecords: ConsentRecord[] = consentSnapshot.docs.map(doc => doc.data() as ConsentRecord);

    const breachSnapshot = await this.db
      .collection('securityBreaches')
      .where('occurredAt', '>=', period.start)
      .where('occurredAt', '<=', period.end)
      .get();

    const breachNotifications: BreachRecord[] = breachSnapshot.docs.map(doc => doc.data() as BreachRecord);

    // CCPA records
    const optOutSnapshot = await this.db
      .collection('ccpaOptOuts')
      .where('requestedAt', '>=', period.start)
      .where('requestedAt', '<=', period.end)
      .get();

    const optOutRequests: OptOutRecord[] = optOutSnapshot.docs.map(doc => doc.data() as OptOutRecord);

    // PCI records
    const complianceSnapshot = await this.db
      .collection('pciCompliance')
      .where('period.start', '>=', period.start)
      .get();

    const complianceReports: ComplianceReport[] = complianceSnapshot.docs.map(doc => doc.data() as ComplianceReport);

    return {
      gdpr: {
        dataSubjectRequests,
        consentRecords,
        breachNotifications
      },
      ccpa: {
        optOutRequests,
        dataDisclosure: []
      },
      pci: {
        complianceReports,
        quarterlyScans: []
      }
    };
  }

  /**
   * Collect financial records
   */
  private async collectFinancialRecords(period: { start: Date; end: Date }): Promise<FinancialRecords> {
    const transactions: TransactionEvidence[] = await this.getTransactionEvidence(period);
    const revenue: RevenueEvidence = await this.getRevenueEvidence(period);
    const reconciliation: ReconciliationReport[] = await this.getReconciliationReports(period);
    const taxDocuments: TaxEvidence[] = await this.getTaxEvidence(period);

    return {
      transactions,
      revenue,
      reconciliation,
      taxDocuments
    };
  }

  /**
   * Helper methods for querying logs and decisions
   */
  private async queryLogs(type: string, period: { start: Date; end: Date }): Promise<LogEntry[]> {
    const snapshot = await this.db
      .collection('systemLogs')
      .where('type', '==', type)
      .where('timestamp', '>=', period.start)
      .where('timestamp', '<=', period.end)
      .limit(10000)
      .get();

    return snapshot.docs.map(doc => doc.data() as LogEntry);
  }

  private async queryDecisions(algorithm: string, period: { start: Date; end: Date }): Promise<DecisionRecord[]> {
    const snapshot = await this.db
      .collection('algorithmicDecisions')
      .where('algorithm', '==', algorithm)
      .where('timestamp', '>=', period.start)
      .where('timestamp', '<=', period.end)
      .limit(1000)
      .get();

    return snapshot.docs.map(doc => doc.data() as DecisionRecord);
  }

  private async getTransactionEvidence(period: { start: Date; end: Date }): Promise<TransactionEvidence[]> {
    // Aggregate from PACK 304 Platform Finance Console
    const snapshot = await this.db
      .collection('monthlyTransactionSummaries')
      .where('month', '>=', this.formatMonth(period.start))
      .where('month', '<=', this.formatMonth(period.end))
      .get();

    return snapshot.docs.map(doc => doc.data() as TransactionEvidence);
  }

  private async getRevenueEvidence(period: { start: Date; end: Date }): Promise<RevenueEvidence> {
    const snapshot = await this.db
      .collection('revenueRecognition')
      .where('period.start', '>=', period.start)
      .where('period.end', '<=', period.end)
      .get();

    if (snapshot.empty) {
      return {
        period,
        breakdown: { subscriptions: 0, transactions: 0, advertising: 0 },
        recognized: 0,
        deferred: 0
      };
    }

    return snapshot.docs[0].data() as RevenueEvidence;
  }

  private async getReconciliationReports(period: { start: Date; end: Date }): Promise<ReconciliationReport[]> {
    const snapshot = await this.db
      .collection('financialReconciliation')
      .where('month', '>=', this.formatMonth(period.start))
      .where('month', '<=', this.formatMonth(period.end))
      .get();

    return snapshot.docs.map(doc => doc.data() as ReconciliationReport);
  }

  private async getTaxEvidence(period: { start: Date; end: Date }): Promise<TaxEvidence[]> {
    const snapshot = await this.db
      .collection('taxDocuments')
      .where('period', '>=', this.formatMonth(period.start))
      .where('period', '<=', this.formatMonth(period.end))
      .get();

    return snapshot.docs.map(doc => doc.data() as TaxEvidence);
  }

  private formatMonth(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}
