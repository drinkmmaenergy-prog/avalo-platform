/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Main Integration Module
 * 
 * Exports all services and provides factory functions for easy initialization.
 */

import * as admin from 'firebase-admin';
import { HoldoutCohortManager } from './HoldoutCohortManager';
import { OfferExperimentOrchestrator } from './OfferExperimentOrchestrator';
import { BiasCorrectedAnalytics } from './BiasCorrectedAnalytics';
import { ProgressiveRolloutController } from './ProgressiveRolloutController';
import { ExperimentLedgerService } from './ExperimentLedgerService';

// Export all types
export * from './HoldoutCohortManager';
export * from './OfferExperimentOrchestrator';
export * from './BiasCorrectedAnalytics';
export * from './ProgressiveRolloutController';
export * from './ExperimentLedgerService';

/**
 * Pack443 Service Container
 * Provides centralized access to all experiment framework services
 */
export class Pack443Services {
  holdoutManager: HoldoutCohortManager;
  experimentOrchestrator: OfferExperimentOrchestrator;
  analytics: BiasCorrectedAnalytics;
  rolloutController: ProgressiveRolloutController;
  ledger: ExperimentLedgerService;

  constructor(db: admin.firestore.Firestore) {
    this.holdoutManager = new HoldoutCohortManager(db);
    this.analytics = new BiasCorrectedAnalytics(db);
    this.experimentOrchestrator = new OfferExperimentOrchestrator(db, this.holdoutManager);
    this.rolloutController = new ProgressiveRolloutController(
      db,
      this.analytics,
      this.experimentOrchestrator
    );
    this.ledger = new ExperimentLedgerService(db);
  }

  /**
   * Full experiment lifecycle: Create → Approve → Start → Monitor → Complete
   */
  async runFullExperimentLifecycle(config: {
    name: string;
    description: string;
    hypothesis: any;
    kpis: any[];
    guardrails: any[];
    offerType: string;
    offerConfig: any;
    author: string;
    approvers: string[];
    holdoutPercentage?: number;
  }): Promise<string> {
    // 1. Create holdout cohort
    const holdout = await this.holdoutManager.createHoldoutCohort(
      `${config.name}-holdout`,
      config.holdoutPercentage || 10,
      `Holdout for experiment: ${config.name}`,
      config.author
    );

    await this.holdoutManager.freezeCohort(holdout.id);

    // 2. Create experiment
    const experiment = await this.experimentOrchestrator.createExperiment({
      ...config,
      holdoutCohortId: holdout.id,
      treatmentPercentage: 50,
      plannedStartDate: new Date(),
      plannedEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // 3. Record in ledger
    await this.ledger.recordEvent(experiment.id, 'CREATED', config.author, {
      name: config.name,
    }, { experiment });

    // 4. Create rollout plan
    await this.rolloutController.createRolloutPlan(experiment.id, {
      autoProgress: true,
      pauseOnViolation: true,
      rollbackOnFailure: true,
    });

    return experiment.id;
  }

  /**
   * Check experiment health and auto-manage lifecycle
   */
  async monitorExperiment(experimentId: string): Promise<{
    health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    issues: string[];
    actions: string[];
  }> {
    const issues: string[] = [];
    const actions: string[] = [];

    // Check guardrails
    const guardrailCheck = await this.experimentOrchestrator.checkGuardrails(experimentId);
    if (!guardrailCheck.passed) {
      issues.push(`Guardrail violations: ${guardrailCheck.violations.length}`);
      actions.push('Experiment may be paused or killed');
    }

    // Check rollout progress
    const progress = await this.rolloutController.checkStageProgress(experimentId);
    if (progress.blocking.length > 0) {
      issues.push('Rollout blocked: ' + progress.blocking.join(', '));
    }

    // Determine health status
    let health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    if (guardrailCheck.violations.some(v => v.guardrail.includes('CRITICAL'))) {
      health = 'CRITICAL';
    } else if (issues.length > 0) {
      health = 'WARNING';
    } else {
      health = 'HEALTHY';
    }

    return { health, issues, actions };
  }
}

/**
 * Initialize Pack443 services
 */
export function initializePack443(db?: admin.firestore.Firestore): Pack443Services {
  const firestore = db || admin.firestore();
  return new Pack443Services(firestore);
}

/**
 * Example usage:
 * 
 * const pack443 = initializePack443();
 * 
 * const experimentId = await pack443.runFullExperimentLifecycle({
 *   name: "Premium Price Test",
 *   description: "Test $9.99 vs $12.99",
 *   hypothesis: { ... },
 *   kpis: [ ... ],
 *   guardrails: [ ... ],
 *   offerType: "PRICE_CHANGE",
 *   offerConfig: { newPrice: 12.99 },
 *   author: "pm@company.com",
 *   approvers: ["ceo@company.com", "cfo@company.com"]
 * });
 * 
 * // Monitor
 * const health = await pack443.monitorExperiment(experimentId);
 * console.log(health);
 */
