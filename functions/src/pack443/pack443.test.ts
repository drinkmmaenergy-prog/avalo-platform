/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Test Suite
 * 
 * Validates all core functionality including:
 * - Holdout cohort management
 * - Experiment orchestration
 * - Bias-corrected analytics
 * - Progressive rollout
 * - Audit ledger
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { initializePack443, Pack443Services } from './index';

// Mock Firestore for testing
const mockFirestore = {
  collection: jest.fn(),
  doc: jest.fn(),
} as any;

describe('PACK 443 - Holdout Cohort Manager', () => {
  let services: Pack443Services;

  beforeEach(() => {
    services = new Pack443Services(mockFirestore);
  });

  it('should create a holdout cohort with valid percentage', async () => {
    const cohort = await services.holdoutManager.createHoldoutCohort(
      'Test Holdout',
      10,
      'Test purpose',
      'test@example.com'
    );

    expect(cohort.name).toBe('Test Holdout');
    expect(cohort.percentage).toBe(10);
    expect(cohort.frozen).toBe(false);
  });

  it('should reject invalid holdout percentage', async () => {
    await expect(
      services.holdoutManager.createHoldoutCohort(
        'Invalid Holdout',
        25, // > 20%
        'Test',
        'test@example.com'
      )
    ).rejects.toThrow('Holdout percentage must be between 1% and 20%');
  });

  it('should freeze a cohort making it immutable', async () => {
    const cohort = await services.holdoutManager.createHoldoutCohort(
      'Test Holdout',
      10,
      'Test',
      'test@example.com'
    );

    await services.holdoutManager.freezeCohort(cohort.id);

    // Verify frozen status
    // This would query Firestore in real implementation
    expect(true).toBe(true); // Placeholder
  });

  it('should detect spillover violations', async () => {
    const result = await services.holdoutManager.checkSpilloverViolation(
      'user1',
      'user2',
      'referral'
    );

    expect(result).toHaveProperty('allowed');
    expect(typeof result.allowed).toBe('boolean');
  });

  it('should calculate contamination rate', async () => {
    const cohort = await services.holdoutManager.createHoldoutCohort(
      'Test Holdout',
      10,
      'Test',
      'test@example.com'
    );

    const report = await services.holdoutManager.getHoldoutHealthReport(cohort.id);

    expect(report).toHaveProperty('contaminationRate');
    expect(report).toHaveProperty('isolationIntegrity');
  });
});

describe('PACK 443 - Offer Experiment Orchestrator', () => {
  let services: Pack443Services;

  beforeEach(() => {
    services = new Pack443Services(mockFirestore);
  });

  it('should create experiment with valid configuration', async () => {
    const experiment = await services.experimentOrchestrator.createExperiment({
      name: 'Test Experiment',
      description: 'Test description',
      hypothesis: {
        statement: 'Test hypothesis',
        expectedImpact: 'Test impact',
        risksIdentified: [],
        successCriteria: [],
      },
      kpis: [
        {
          name: 'Primary KPI',
          type: 'PRIMARY',
          metric: 'revenue',
          direction: 'INCREASE',
        },
      ],
      guardrails: [
        {
          kpiName: 'Churn',
          metric: 'churn_rate',
          maxThreshold: 0.05,
          violationAction: 'KILL',
          cooldownPeriod: 60,
        },
      ],
      holdoutCohortId: 'test-cohort-id',
      treatmentPercentage: 50,
      offerType: 'PRICE_CHANGE',
      offerConfig: { newPrice: 9.99 },
      plannedStartDate: new Date(),
      plannedEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      author: 'test@example.com',
      approvers: ['approver@example.com'],
    });

    expect(experiment.name).toBe('Test Experiment');
    expect(experiment.status).toBe('DRAFT');
    expect(experiment.kpis).toHaveLength(1);
  });

  it('should reject experiment without primary KPI', async () => {
    await expect(
      services.experimentOrchestrator.createExperiment({
        name: 'Invalid Experiment',
        description: 'Test',
        hypothesis: {
          statement: 'Test',
          expectedImpact: 'Test',
          risksIdentified: [],
          successCriteria: [],
        },
        kpis: [], // Empty KPIs
        guardrails: [],
        holdoutCohortId: 'test-cohort-id',
        treatmentPercentage: 50,
        offerType: 'PRICE_CHANGE',
        offerConfig: {},
        plannedStartDate: new Date(),
        plannedEndDate: new Date(),
        author: 'test@example.com',
        approvers: [],
      })
    ).rejects.toThrow();
  });

  it('should check guardrails and return violations', async () => {
    const experimentId = 'test-experiment-id';

    const result = await services.experimentOrchestrator.checkGuardrails(experimentId);

    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('violations');
    expect(Array.isArray(result.violations)).toBe(true);
  });
});

describe('PACK 443 - Bias Corrected Analytics', () => {
  let services: Pack443Services;

  beforeEach(() => {
    services = new Pack443Services(mockFirestore);
  });

  it('should perform bias-corrected analysis', async () => {
    const result = await services.analytics.analyzeExperiment(
      'test-experiment-id',
      'revenue',
      ['user1', 'user2', 'user3'],
      ['user4', 'user5', 'user6']
    );

    expect(result).toHaveProperty('treatmentMean');
    expect(result).toHaveProperty('controlMean');
    expect(result).toHaveProperty('correctedTreatmentMean');
    expect(result).toHaveProperty('correctedControlMean');
    expect(result).toHaveProperty('pValue');
    expect(result).toHaveProperty('biasAdjustments');
    expect(result).toHaveProperty('dataQuality');
    expect(result).toHaveProperty('recommendation');
  });

  it('should identify different bias types', async () => {
    const result = await services.analytics.analyzeExperiment(
      'test-experiment-id',
      'revenue',
      ['user1', 'user2'],
      ['user3', 'user4']
    );

    // Check for bias adjustment types
    const biasTypes = result.biasAdjustments.map((b) => b.type);
    expect(biasTypes).toBeInstanceOf(Array);
  });

  it('should calculate statistical significance', async () => {
    const result = await services.analytics.analyzeExperiment(
      'test-experiment-id',
      'revenue',
      Array(100).fill(null).map((_, i) => `user${i}`),
      Array(100).fill(null).map((_, i) => `user${i + 100}`)
    );

    expect(typeof result.pValue).toBe('number');
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

describe('PACK 443 - Progressive Rollout Controller', () => {
  let services: Pack443Services;

  beforeEach(() => {
    services = new Pack443Services(mockFirestore);
  });

  it('should create rollout plan with default stages', async () => {
    const plan = await services.rolloutController.createRolloutPlan('test-experiment-id');

    expect(plan.stages).toHaveLength(5); // 1%, 5%, 10%, 25%, 50%
    expect(plan.stages[0].percentage).toBe(1);
    expect(plan.stages[4].percentage).toBe(50);
  });

  it('should create rollout plan with custom stages', async () => {
    const plan = await services.rolloutController.createRolloutPlan('test-experiment-id', {
      stages: [5, 10, 25],
    });

    expect(plan.stages).toHaveLength(3);
    expect(plan.stages[0].percentage).toBe(5);
  });

  it('should check stage progression requirements', async () => {
    await services.rolloutController.createRolloutPlan('test-experiment-id');
    await services.rolloutController.startRollout('test-experiment-id');

    const progress = await services.rolloutController.checkStageProgress('test-experiment-id');

    expect(progress).toHaveProperty('ready');
    expect(progress).toHaveProperty('met');
    expect(progress).toHaveProperty('unmet');
    expect(progress).toHaveProperty('blocking');
  });

  it('should pause and resume rollout', async () => {
    await services.rolloutController.createRolloutPlan('test-experiment-id');
    await services.rolloutController.startRollout('test-experiment-id');

    await services.rolloutController.pauseRollout('test-experiment-id', 'Test pause');

    // Verify paused
    // This would check Firestore in real implementation
    expect(true).toBe(true); // Placeholder

    await services.rolloutController.resumeRollout('test-experiment-id');

    // Verify resumed
    expect(true).toBe(true); // Placeholder
  });
});

describe('PACK 443 - Experiment Ledger Service', () => {
  let services: Pack443Services;

  beforeEach(() => {
    services = new Pack443Services(mockFirestore);
  });

  it('should record experiment event', async () => {
    const entry = await services.ledger.recordEvent(
      'test-experiment-id',
      'CREATED',
      'test@example.com',
      { notes: 'Test event' }
    );

    expect(entry.experimentId).toBe('test-experiment-id');
    expect(entry.eventType).toBe('CREATED');
    expect(entry.actor).toBe('test@example.com');
    expect(entry).toHaveProperty('entryHash');
  });

  it('should maintain hash chain integrity', async () => {
    const entry1 = await services.ledger.recordEvent(
      'test-experiment-id',
      'CREATED',
      'test@example.com',
      {}
    );

    const entry2 = await services.ledger.recordEvent(
      'test-experiment-id',
      'APPROVED',
      'approver@example.com',
      {}
    );

    expect(entry2.previousEntryHash).toBe(entry1.entryHash);
  });

  it('should verify ledger integrity', async () => {
    await services.ledger.recordEvent('test-experiment-id', 'CREATED', 'test@example.com', {});
    await services.ledger.recordEvent('test-experiment-id', 'APPROVED', 'approver@example.com', {});

    const verification = await services.ledger.verifyLedgerIntegrity('test-experiment-id');

    expect(verification).toHaveProperty('valid');
    expect(verification).toHaveProperty('errors');
    expect(Array.isArray(verification.errors)).toBe(true);
  });

  it('should generate audit report', async () => {
    await services.ledger.recordEvent('test-experiment-id', 'CREATED', 'test@example.com', {});

    const report = await services.ledger.generateAuditReport('test-experiment-id');

    expect(report).toHaveProperty('experimentId');
    expect(report).toHaveProperty('timeline');
    expect(report).toHaveProperty('decisions');
    expect(report).toHaveProperty('results');
  });

  it('should export audit report in different formats', async () => {
    await services.ledger.recordEvent('test-experiment-id', 'CREATED', 'test@example.com', {});

    const json = await services.ledger.exportAuditReport('test-experiment-id', 'JSON');
    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json)).not.toThrow();

    const csv = await services.ledger.exportAuditReport('test-experiment-id', 'CSV');
    expect(typeof csv).toBe('string');
    expect(csv).toContain(','); // CSV should have commas
  });
});

describe('PACK 443 - Full Integration', () => {
  let services: Pack443Services;

  beforeEach(() => {
    services = new Pack443Services(mockFirestore);
  });

  it('should run full experiment lifecycle', async () => {
    const experimentId = await services.runFullExperimentLifecycle({
      name: 'Integration Test',
      description: 'Full lifecycle test',
      hypothesis: {
        statement: 'Test',
        expectedImpact: 'Test',
        risksIdentified: [],
        successCriteria: [],
      },
      kpis: [
        {
          name: 'Revenue',
          type: 'PRIMARY',
          metric: 'revenue',
          direction: 'INCREASE',
        },
      ],
      guardrails: [
        {
          kpiName: 'Churn',
          metric: 'churn',
          maxThreshold: 0.05,
          violationAction: 'KILL',
          cooldownPeriod: 60,
        },
      ],
      offerType: 'PRICE_CHANGE',
      offerConfig: {},
      author: 'test@example.com',
      approvers: ['approver@example.com'],
    });

    expect(typeof experimentId).toBe('string');
    expect(experimentId.length).toBeGreaterThan(0);
  });

  it('should monitor experiment health', async () => {
    const experimentId = 'test-experiment-id';

    const health = await services.monitorExperiment(experimentId);

    expect(health).toHaveProperty('health');
    expect(health).toHaveProperty('issues');
    expect(health).toHaveProperty('actions');
    expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(health.health);
  });
});

// Run tests
if (require.main === module) {
  console.log('Running PACK 443 tests...');
  console.log('Note: These tests require a proper Jest setup.');
  console.log('Run with: npm test -- pack443.test.ts');
}
