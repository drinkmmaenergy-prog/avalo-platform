/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Module: ProgressiveRolloutController
 * 
 * Purpose: Manages progressive rollout stages (1% → 5% → 10% → 25% → 50%)
 * with statistical significance and compliance checks at each stage.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { BiasCorrectedAnalytics } from './BiasCorrectedAnalytics';
import { OfferExperimentOrchestrator } from './OfferExperimentOrchestrator';

export interface RolloutStage {
  percentage: number;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  startedAt?: Date;
  completedAt?: Date;
  
  // Requirements for progression
  requirements: {
    minSampleSize: number;
    minDuration: number; // hours
    minStatisticalSignificance: number; // p-value threshold
    maxGuardrailViolations: number;
  };
  
  // Actual metrics
  metrics?: {
    sampleSize: number;
    duration: number;
    pValue?: number;
    guardrailViolations: number;
    primaryKPIChange: number;
  };
  
  // Decision
  decision?: {
    approved: boolean;
    approvedBy?: string;
    approvedAt?: Date;
    reason?: string;
  };
}

export interface RolloutPlan {
  experimentId: string;
  stages: RolloutStage[];
  currentStage: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'ABORTED';
  startedAt: Date;
  completedAt?: Date;
  
  // Configuration
  autoProgress: boolean; // Automatically progress if requirements met
  pauseOnViolation: boolean;
  rollbackOnFailure: boolean;
}

export class ProgressiveRolloutController {
  private db: admin.firestore.Firestore;
  private analytics: BiasCorrectedAnalytics;
  private orchestrator: OfferExperimentOrchestrator;

  // Default rollout stages
  private readonly DEFAULT_STAGES = [1, 5, 10, 25, 50];

  constructor(
    db: admin.firestore.Firestore,
    analytics: BiasCorrectedAnalytics,
    orchestrator: OfferExperimentOrchestrator
  ) {
    this.db = db;
    this.analytics = analytics;
    this.orchestrator = orchestrator;
  }

  /**
   * Create a new rollout plan for an experiment
   */
  async createRolloutPlan(
    experimentId: string,
    options: {
      stages?: number[];
      autoProgress?: boolean;
      pauseOnViolation?: boolean;
      rollbackOnFailure?: boolean;
    } = {}
  ): Promise<RolloutPlan> {
    const stages = options.stages || this.DEFAULT_STAGES;

    const rolloutStages: RolloutStage[] = stages.map((percentage) => ({
      percentage,
      status: 'PENDING',
      requirements: this.calculateStageRequirements(percentage),
    }));

    const plan: RolloutPlan = {
      experimentId,
      stages: rolloutStages,
      currentStage: 0,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      autoProgress: options.autoProgress ?? true,
      pauseOnViolation: options.pauseOnViolation ?? true,
      rollbackOnFailure: options.rollbackOnFailure ?? true,
    };

    await this.db.collection('rolloutPlans').doc(experimentId).set(plan);

    logger.info('Rollout plan created', {
      experimentId,
      stages: stages.join('% → ') + '%',
      autoProgress: plan.autoProgress,
    });

    return plan;
  }

  /**
   * Start the first rollout stage
   */
  async startRollout(experimentId: string): Promise<void> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    if (plan.status !== 'IN_PROGRESS') {
      throw new Error(`Cannot start rollout in status ${plan.status}`);
    }

    // Start first stage
    await this.progressToStage(experimentId, 0);

    logger.info('Rollout started', {
      experimentId,
      firstStage: plan.stages[0].percentage + '%',
    });
  }

  /**
   * Progress to a specific stage
   */
  async progressToStage(experimentId: string, stageIndex: number): Promise<void> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    if (stageIndex >= plan.stages.length) {
      throw new Error(`Invalid stage index ${stageIndex}`);
    }

    const stage = plan.stages[stageIndex];

    // Mark previous stage as completed
    if (stageIndex > 0) {
      plan.stages[stageIndex - 1].status = 'COMPLETED';
      plan.stages[stageIndex - 1].completedAt = new Date();
    }

    // Start new stage
    stage.status = 'ACTIVE';
    stage.startedAt = new Date();
    plan.currentStage = stageIndex;

    await this.db.collection('rolloutPlans').doc(experimentId).update({
      stages: plan.stages,
      currentStage: stageIndex,
    });

    // Apply the new percentage to the experiment
    await this.applyRolloutPercentage(experimentId, stage.percentage);

    logger.info('Progressed to rollout stage', {
      experimentId,
      stage: stageIndex,
      percentage: stage.percentage + '%',
    });
  }

  /**
   * Check if current stage meets progression requirements
   */
  async checkStageProgress(experimentId: string): Promise<{
    ready: boolean;
    met: string[];
    unmet: string[];
    blocking: string[];
  }> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    const stage = plan.stages[plan.currentStage];
    if (stage.status !== 'ACTIVE') {
      return {
        ready: false,
        met: [],
        unmet: ['Stage not active'],
        blocking: ['Stage not active'],
      };
    }

    // Update stage metrics
    const metrics = await this.calculateStageMetrics(experimentId);
    stage.metrics = metrics;

    const met: string[] = [];
    const unmet: string[] = [];
    const blocking: string[] = [];

    // Check sample size
    if (metrics.sampleSize >= stage.requirements.minSampleSize) {
      met.push(`Sample size: ${metrics.sampleSize} >= ${stage.requirements.minSampleSize}`);
    } else {
      const reason = `Sample size: ${metrics.sampleSize} < ${stage.requirements.minSampleSize}`;
      unmet.push(reason);
      blocking.push(reason);
    }

    // Check duration
    if (metrics.duration >= stage.requirements.minDuration) {
      met.push(`Duration: ${metrics.duration}h >= ${stage.requirements.minDuration}h`);
    } else {
      const reason = `Duration: ${metrics.duration}h < ${stage.requirements.minDuration}h`;
      unmet.push(reason);
      blocking.push(reason);
    }

    // Check statistical significance
    if (metrics.pValue !== undefined) {
      if (metrics.pValue <= stage.requirements.minStatisticalSignificance) {
        met.push(`Statistical significance: p=${metrics.pValue.toFixed(4)}`);
      } else {
        unmet.push(`Not statistically significant: p=${metrics.pValue.toFixed(4)}`);
        // Not blocking - can progress with caution
      }
    } else {
      unmet.push('Statistical analysis not yet available');
    }

    // Check guardrail violations
    if (metrics.guardrailViolations <= stage.requirements.maxGuardrailViolations) {
      met.push(`Guardrails OK: ${metrics.guardrailViolations} violations`);
    } else {
      const reason = `Guardrail violations: ${metrics.guardrailViolations} > ${stage.requirements.maxGuardrailViolations}`;
      unmet.push(reason);
      blocking.push(reason);
    }

    // Update plan with new metrics
    await this.db.collection('rolloutPlans').doc(experimentId).update({
      stages: plan.stages,
    });

    const ready = blocking.length === 0;

    // If ready and auto-progress enabled, move to next stage
    if (ready && plan.autoProgress && plan.currentStage < plan.stages.length - 1) {
      await this.progressToNextStage(experimentId);
    }

    return { ready, met, unmet, blocking };
  }

  /**
   * Progress to next stage (if requirements met)
   */
  async progressToNextStage(experimentId: string): Promise<boolean> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    const progress = await this.checkStageProgress(experimentId);
    if (!progress.ready) {
      logger.warn('Cannot progress to next stage - requirements not met', {
        experimentId,
        blocking: progress.blocking,
      });
      return false;
    }

    const nextStageIndex = plan.currentStage + 1;
    if (nextStageIndex >= plan.stages.length) {
      // Rollout complete
      await this.completeRollout(experimentId);
      return true;
    }

    await this.progressToStage(experimentId, nextStageIndex);
    return true;
  }

  /**
   * Pause rollout
   */
  async pauseRollout(experimentId: string, reason: string): Promise<void> {
    await this.db.collection('rolloutPlans').doc(experimentId).update({
      status: 'PAUSED',
    });

    await this.db.collection('rolloutEvents').add({
      experimentId,
      type: 'PAUSED',
      reason,
      timestamp: new Date(),
    });

    logger.warn('Rollout paused', { experimentId, reason });
  }

  /**
   * Resume rollout
   */
  async resumeRollout(experimentId: string): Promise<void> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    if (plan.status !== 'PAUSED') {
      throw new Error(`Cannot resume rollout in status ${plan.status}`);
    }

    await this.db.collection('rolloutPlans').doc(experimentId).update({
      status: 'IN_PROGRESS',
    });

    await this.db.collection('rolloutEvents').add({
      experimentId,
      type: 'RESUMED',
      timestamp: new Date(),
    });

    logger.info('Rollout resumed', { experimentId });
  }

  /**
   * Rollback to previous stage
   */
  async rollbackStage(experimentId: string, reason: string): Promise<void> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    if (plan.currentStage === 0) {
      // Cannot rollback first stage, abort instead
      await this.abortRollout(experimentId, reason);
      return;
    }

    const previousStageIndex = plan.currentStage - 1;
    await this.progressToStage(experimentId, previousStageIndex);

    await this.db.collection('rolloutEvents').add({
      experimentId,
      type: 'ROLLBACK',
      reason,
      from: plan.currentStage,
      to: previousStageIndex,
      timestamp: new Date(),
    });

    logger.warn('Rollout rolled back', {
      experimentId,
      from: plan.currentStage,
      to: previousStageIndex,
      reason,
    });
  }

  /**
   * Abort entire rollout
   */
  async abortRollout(experimentId: string, reason: string): Promise<void> {
    await this.db.collection('rolloutPlans').doc(experimentId).update({
      status: 'ABORTED',
      completedAt: new Date(),
    });

    // Set experiment percentage to 0 (disable offer)
    await this.applyRolloutPercentage(experimentId, 0);

    await this.db.collection('rolloutEvents').add({
      experimentId,
      type: 'ABORTED',
      reason,
      timestamp: new Date(),
    });

    logger.error('Rollout aborted', { experimentId, reason });
  }

  /**
   * Complete rollout (all stages passed)
   */
  async completeRollout(experimentId: string): Promise<void> {
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error(`Rollout plan not found for experiment ${experimentId}`);
    }

    // Mark last stage as completed
    plan.stages[plan.currentStage].status = 'COMPLETED';
    plan.stages[plan.currentStage].completedAt = new Date();

    await this.db.collection('rolloutPlans').doc(experimentId).update({
      status: 'COMPLETED',
      completedAt: new Date(),
      stages: plan.stages,
    });

    await this.db.collection('rolloutEvents').add({
      experimentId,
      type: 'COMPLETED',
      timestamp: new Date(),
    });

    logger.info('Rollout completed successfully', {
      experimentId,
      totalStages: plan.stages.length,
      duration: (plan.completedAt!.getTime() - plan.startedAt.getTime()) / (1000 * 60 * 60) + 'h',
    });
  }

  // Private helpers

  private async getRolloutPlan(experimentId: string): Promise<RolloutPlan | null> {
    const doc = await this.db.collection('rolloutPlans').doc(experimentId).get();
    return doc.exists ? (doc.data() as RolloutPlan) : null;
  }

  private calculateStageRequirements(percentage: number): RolloutStage['requirements'] {
    // Scale requirements based on stage percentage
    return {
      minSampleSize: Math.max(100, percentage * 10),
      minDuration: Math.max(24, percentage / 2), // hours
      minStatisticalSignificance: 0.05, // p-value
      maxGuardrailViolations: 0,
    };
  }

  private async calculateStageMetrics(experimentId: string): Promise<NonNullable<RolloutStage['metrics']>> {
    // Integration with analytics and experiment orchestrator
    const plan = await this.getRolloutPlan(experimentId);
    if (!plan) {
      throw new Error('Rollout plan not found');
    }

    const stage = plan.stages[plan.currentStage];
    const duration = stage.startedAt
      ? (Date.now() - stage.startedAt.getTime()) / (1000 * 60 * 60)
      : 0;

    // Get sample size and metrics from experiment
    // Integration with PACK 299 (Analytics) and experiment data
    return {
      sampleSize: 0, // Placeholder
      duration,
      pValue: undefined,
      guardrailViolations: 0,
      primaryKPIChange: 0,
    };
  }

  private async applyRolloutPercentage(experimentId: string, percentage: number): Promise<void> {
    // Update experiment configuration to apply to specified percentage of users
    logger.info('Applying rollout percentage', { experimentId, percentage: percentage + '%' });
    
    // Integration point with offer delivery system
    await this.db.collection('offerExperiments').doc(experimentId).update({
      'rollout.currentPercentage': percentage,
      'rollout.updatedAt': new Date(),
    });
  }
}
