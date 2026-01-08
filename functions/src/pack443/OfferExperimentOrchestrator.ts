/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Module: OfferExperimentOrchestrator
 * 
 * Purpose: Orchestrates offer experiments with hypothesis tracking, KPI monitoring,
 * and automatic guardrail enforcement via PACK 365 kill-switch.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import * as crypto from 'crypto';
import { HoldoutCohortManager } from './HoldoutCohortManager';

export interface ExperimentHypothesis {
  statement: string;
  expectedImpact: string;
  risksIdentified: string[];
  successCriteria: string[];
}

export interface ExperimentKPI {
  name: string;
  type: 'PRIMARY' | 'SECONDARY' | 'GUARDRAIL';
  metric: string; // e.g., 'net_ltv', 'conversion_rate', 'refund_rate'
  baselineValue?: number;
  targetValue?: number;
  threshold?: number; // For guardrails
  direction: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
}

export interface ExperimentGuardrail {
  kpiName: string;
  metric: string;
  maxThreshold?: number;
  minThreshold?: number;
  violationAction: 'WARN' | 'PAUSE' | 'KILL';
  cooldownPeriod: number; // minutes before re-evaluation
}

export interface OfferExperiment {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'KILLED';
  
  // Experimentation details
  hypothesis: ExperimentHypothesis;
  kpis: ExperimentKPI[];
  guardrails: ExperimentGuardrail[];
  
  // Cohort configuration
  holdoutCohortId: string;
  treatmentPercentage: number; // Percentage of non-holdout users receiving treatment
  
  // Offer configuration
  offerType: 'PRICE_CHANGE' | 'PROMO' | 'PAYWALL' | 'BUNDLE' | 'DYNAMIC_PRICING';
  offerConfig: any; // Specific to offer type
  
  // Timing
  plannedStartDate: Date;
  plannedEndDate: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  
  // Ownership & approval
  author: string;
  approvers: string[];
  approvalStatus: {
    approved: boolean;
    approvedBy: string[];
    rejectedBy: string[];
    pendingFrom: string[];
  };
  
  // Results
  results?: {
    primaryKPIChange: number;
    statisticalSignificance: number;
    guardrailViolations: number;
    recommendation: 'SHIP' | 'ITERATE' | 'KILL';
    analysis: string;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

export interface ExperimentSnapshot {
  experimentId: string;
  timestamp: Date;
  kpiValues: Record<string, number>;
  treatmentUsers: number;
  controlUsers: number;
  guardrailViolations: string[];
  notes?: string;
}

export class OfferExperimentOrchestrator {
  private db: admin.firestore.Firestore;
  private holdoutManager: HoldoutCohortManager;

  constructor(db: admin.firestore.Firestore, holdoutManager: HoldoutCohortManager) {
    this.db = db;
    this.holdoutManager = holdoutManager;
  }

  /**
   * Create a new offer experiment
   */
  async createExperiment(config: {
    name: string;
    description: string;
    hypothesis: ExperimentHypothesis;
    kpis: ExperimentKPI[];
    guardrails: ExperimentGuardrail[];
    holdoutCohortId: string;
    treatmentPercentage: number;
    offerType: string;
    offerConfig: any;
    plannedStartDate: Date;
    plannedEndDate: Date;
    author: string;
    approvers: string[];
  }): Promise<OfferExperiment> {
    // Validate inputs
    this.validateExperimentConfig(config);

    // Verify holdout cohort exists and is frozen
    const cohort = await this.db
      .collection('holdoutCohorts')
      .doc(config.holdoutCohortId)
      .get();

    if (!cohort.exists) {
      throw new Error(`Holdout cohort ${config.holdoutCohortId} not found`);
    }

    if (!cohort.data()?.frozen) {
      throw new Error('Holdout cohort must be frozen before creating experiment');
    }

    const experiment: OfferExperiment = {
      id: crypto.randomUUID(),
      name: config.name,
      description: config.description,
      status: 'DRAFT',
      hypothesis: config.hypothesis,
      kpis: config.kpis,
      guardrails: config.guardrails,
      holdoutCohortId: config.holdoutCohortId,
      treatmentPercentage: config.treatmentPercentage,
      offerType: config.offerType as any,
      offerConfig: config.offerConfig,
      plannedStartDate: config.plannedStartDate,
      plannedEndDate: config.plannedEndDate,
      author: config.author,
      approvers: config.approvers,
      approvalStatus: {
        approved: false,
        approvedBy: [],
        rejectedBy: [],
        pendingFrom: config.approvers,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    };

    await this.db.collection('offerExperiments').doc(experiment.id).set(experiment);

    logger.info('Offer experiment created', {
      experimentId: experiment.id,
      name: config.name,
      author: config.author,
    });

    return experiment;
  }

  /**
   * Submit experiment for approval
   */
  async submitForApproval(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'DRAFT') {
      throw new Error('Only draft experiments can be submitted for approval');
    }

    await this.db.collection('offerExperiments').doc(experimentId).update({
      status: 'PENDING_APPROVAL',
      updatedAt: new Date(),
    });

    // Send notifications to approvers
    await this.notifyApprovers(experimentId, experiment.approvers);

    logger.info('Experiment submitted for approval', {
      experimentId,
      approvers: experiment.approvers,
    });
  }

  /**
   * Approve experiment
   */
  async approveExperiment(experimentId: string, approverId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (!experiment.approvers.includes(approverId)) {
      throw new Error(`User ${approverId} is not an approver for this experiment`);
    }

    const approvedBy = [...experiment.approvalStatus.approvedBy, approverId];
    const pendingFrom = experiment.approvalStatus.pendingFrom.filter((a) => a !== approverId);
    const approved = pendingFrom.length === 0;

    await this.db.collection('offerExperiments').doc(experimentId).update({
      'approvalStatus.approvedBy': approvedBy,
      'approvalStatus.pendingFrom': pendingFrom,
      'approvalStatus.approved': approved,
      updatedAt: new Date(),
    });

    logger.info('Experiment approved', {
      experimentId,
      approverId,
      fullyApproved: approved,
    });
  }

  /**
   * Start experiment (activate offer for treatment group)
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (!experiment.approvalStatus.approved) {
      throw new Error('Experiment must be fully approved before starting');
    }

    if (experiment.status !== 'PENDING_APPROVAL') {
      throw new Error('Experiment must be in PENDING_APPROVAL status to start');
    }

    // Activate kill-switch monitoring (PACK 365 integration)
    await this.activateKillSwitch(experimentId);

    await this.db.collection('offerExperiments').doc(experimentId).update({
      status: 'ACTIVE',
      actualStartDate: new Date(),
      updatedAt: new Date(),
    });

    // Create initial snapshot
    await this.createExperimentSnapshot(experimentId);

    logger.info('Experiment started', { experimentId });
  }

  /**
   * Check guardrails and trigger kill-switch if violated
   */
  async checkGuardrails(experimentId: string): Promise<{
    passed: boolean;
    violations: Array<{ guardrail: string; value: number; threshold: number }>;
  }> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const violations: Array<{ guardrail: string; value: number; threshold: number }> = [];

    // Get latest KPI values
    const latestSnapshot = await this.getLatestSnapshot(experimentId);
    if (!latestSnapshot) {
      return { passed: true, violations: [] };
    }

    // Check each guardrail
    for (const guardrail of experiment.guardrails) {
      const value = latestSnapshot.kpiValues[guardrail.metric];
      if (value === undefined) {
        continue;
      }

      let violated = false;
      let threshold = 0;

      if (guardrail.maxThreshold !== undefined && value > guardrail.maxThreshold) {
        violated = true;
        threshold = guardrail.maxThreshold;
      }

      if (guardrail.minThreshold !== undefined && value < guardrail.minThreshold) {
        violated = true;
        threshold = guardrail.minThreshold;
      }

      if (violated) {
        violations.push({
          guardrail: guardrail.kpiName,
          value,
          threshold,
        });

        // Take action based on violation type
        if (guardrail.violationAction === 'KILL') {
          await this.killExperiment(experimentId, `Guardrail violated: ${guardrail.kpiName}`);
        } else if (guardrail.violationAction === 'PAUSE') {
          await this.pauseExperiment(experimentId, `Guardrail violated: ${guardrail.kpiName}`);
        } else {
          logger.warn('Guardrail warning', {
            experimentId,
            guardrail: guardrail.kpiName,
            value,
            threshold,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Pause experiment
   */
  async pauseExperiment(experimentId: string, reason: string): Promise<void> {
    await this.db.collection('offerExperiments').doc(experimentId).update({
      status: 'PAUSED',
      updatedAt: new Date(),
    });

    await this.db.collection('experimentEvents').add({
      experimentId,
      type: 'PAUSED',
      reason,
      timestamp: new Date(),
    });

    logger.warn('Experiment paused', { experimentId, reason });
  }

  /**
   * Kill experiment (emergency stop via PACK 365)
   */
  async killExperiment(experimentId: string, reason: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Trigger kill-switch (PACK 365 integration)
    await this.triggerKillSwitch(experimentId, reason);

    await this.db.collection('offerExperiments').doc(experimentId).update({
      status: 'KILLED',
      actualEndDate: new Date(),
      updatedAt: new Date(),
    });

    await this.db.collection('experimentEvents').add({
      experimentId,
      type: 'KILLED',
      reason,
      timestamp: new Date(),
    });

    logger.error('Experiment killed', { experimentId, reason });
  }

  /**
   * Complete experiment and generate results
   */
  async completeExperiment(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'ACTIVE') {
      throw new Error('Only active experiments can be completed');
    }

    // Calculate final results
    const results = await this.calculateExperimentResults(experimentId);

    await this.db.collection('offerExperiments').doc(experimentId).update({
      status: 'COMPLETED',
      actualEndDate: new Date(),
      results,
      updatedAt: new Date(),
    });

    logger.info('Experiment completed', {
      experimentId,
      recommendation: results.recommendation,
    });
  }

  /**
   * Create experiment snapshot (periodic)
   */
  async createExperimentSnapshot(experimentId: string): Promise<ExperimentSnapshot> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Calculate KPI values from analytics (PACK 299 integration)
    const kpiValues = await this.calculateKPIValues(experimentId);

    // Count treatment and control users
    const { treatmentUsers, controlUsers } = await this.countExperimentUsers(experimentId);

    // Check for guardrail violations
    const guardrailCheck = await this.checkGuardrails(experimentId);

    const snapshot: ExperimentSnapshot = {
      experimentId,
      timestamp: new Date(),
      kpiValues,
      treatmentUsers,
      controlUsers,
      guardrailViolations: guardrailCheck.violations.map((v) => v.guardrail),
    };

    await this.db.collection('experimentSnapshots').add(snapshot);

    return snapshot;
  }

  // Private helpers

  private validateExperimentConfig(config: any): void {
    if (config.treatmentPercentage < 1 || config.treatmentPercentage > 50) {
      throw new Error('Treatment percentage must be between 1% and 50%');
    }

    if (config.kpis.length === 0) {
      throw new Error('At least one KPI must be defined');
    }

    const primaryKPIs = config.kpis.filter((k: ExperimentKPI) => k.type === 'PRIMARY');
    if (primaryKPIs.length !== 1) {
      throw new Error('Exactly one primary KPI must be defined');
    }

    if (config.guardrails.length === 0) {
      throw new Error('At least one guardrail must be defined');
    }
  }

  private async getExperiment(experimentId: string): Promise<OfferExperiment | null> {
    const doc = await this.db.collection('offerExperiments').doc(experimentId).get();
    return doc.exists ? (doc.data() as OfferExperiment) : null;
  }

  private async getLatestSnapshot(experimentId: string): Promise<ExperimentSnapshot | null> {
    const snapshot = await this.db
      .collection('experimentSnapshots')
      .where('experimentId', '==', experimentId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as ExperimentSnapshot;
  }

  private async calculateKPIValues(experimentId: string): Promise<Record<string, number>> {
    // Integration point with PACK 299 (Analytics Engine)
    // This would query actual metrics from the analytics system
    return {};
  }

  private async countExperimentUsers(experimentId: string): Promise<{
    treatmentUsers: number;
    controlUsers: number;
  }> {
    // Integration point with user assignment system
    return { treatmentUsers: 0, controlUsers: 0 };
  }

  private async calculateExperimentResults(experimentId: string): Promise<any> {
    // Integration point with PACK 443 BiasCorrectedAnalytics
    return {
      primaryKPIChange: 0,
      statisticalSignificance: 0,
      guardrailViolations: 0,
      recommendation: 'ITERATE',
      analysis: 'Results pending statistical analysis',
    };
  }

  private async activateKillSwitch(experimentId: string): Promise<void> {
    // Integration point with PACK 365 (Kill-Switch Framework)
    logger.info('Kill-switch activated for experiment', { experimentId });
  }

  private async triggerKillSwitch(experimentId: string, reason: string): Promise<void> {
    // Integration point with PACK 365 (Kill-Switch Framework)
    logger.error('Kill-switch triggered', { experimentId, reason });
  }

  private async notifyApprovers(experimentId: string, approvers: string[]): Promise<void> {
    // Send notifications (email, Slack, etc.)
    logger.info('Approvers notified', { experimentId, approvers });
  }
}
