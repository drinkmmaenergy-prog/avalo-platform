/**
 * PACK 348 — A/B Test Manager
 * 
 * Manages A/B testing for ranking algorithms
 */

import * as admin from 'firebase-admin';
import { ABTestConfig } from './types';

export class ABTestManager {
  constructor(private db: admin.firestore.Firestore) {}

  /**
   * Create a new A/B test
   */
  async createTest(
    test: Omit<ABTestConfig, 'testId' | 'createdAt' | 'createdBy'>,
    adminId: string
  ): Promise<string> {
    // Validate test configuration
    this.validateTestConfig(test);

    // Generate test ID
    const testRef = this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .doc();

    const fullTest: ABTestConfig = {
      ...test,
      testId: testRef.id,
      createdAt: Date.now(),
      createdBy: adminId,
    };

    await testRef.set(fullTest);

    // Log audit
    await this.logTestAction(testRef.id, 'create_test', adminId, null, fullTest);

    return testRef.id;
  }

  /**
   * Update an existing A/B test
   */
  async updateTest(
    testId: string,
    updates: Partial<ABTestConfig>,
    adminId: string
  ): Promise<void> {
    const testRef = this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .doc(testId);

    const before = (await testRef.get()).data() as ABTestConfig;

    await testRef.update(updates);

    const after = { ...before, ...updates };

    // Log audit
    await this.logTestAction(testId, 'update_test', adminId, before, after);
  }

  /**
   * Disable an A/B test
   */
  async disableTest(testId: string, adminId: string): Promise<void> {
    const testRef = this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .doc(testId);

    const before = (await testRef.get()).data() as ABTestConfig;

    await testRef.update({
      enabled: false,
      endDate: Date.now(),
    });

    const after = { ...before, enabled: false, endDate: Date.now() };

    // Log audit
    await this.logTestAction(testId, 'disable_test', adminId, before, after);
  }

  /**
   * Get active tests
   */
  async getActiveTests(): Promise<ABTestConfig[]> {
    const snapshot = await this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .where('enabled', '==', true)
      .where('endDate', '>', Date.now())
      .get();

    return snapshot.docs.map((doc) => doc.data() as ABTestConfig);
  }

  /**
   * Get all tests (including inactive)
   */
  async getAllTests(): Promise<ABTestConfig[]> {
    const snapshot = await this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as ABTestConfig);
  }

  /**
   * Get test results and metrics
   */
  async getTestResults(testId: string): Promise<{
    testConfig: ABTestConfig;
    controlGroupSize: number;
    testGroupSize: number;
    metrics: {
      avgDiscoveryScore: { control: number; test: number };
      avgFeedScore: { control: number; test: number };
      avgSwipeScore: { control: number; test: number };
      avgAiScore: { control: number; test: number };
    };
  }> {
    const testDoc = await this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .doc(testId)
      .get();

    const testConfig = testDoc.data() as ABTestConfig;

    // Get user counts
    const controlSnapshot = await this.db
      .collection('userRankingScores')
      .where('abTestGroup', '==', `${testId}_control`)
      .count()
      .get();

    const testSnapshot = await this.db
      .collection('userRankingScores')
      .where('abTestGroup', '==', testId)
      .count()
      .get();

    // Get average scores (would need to implement aggregation)
    // For now, return placeholder structure
    return {
      testConfig,
      controlGroupSize: controlSnapshot.data().count,
      testGroupSize: testSnapshot.data().count,
      metrics: {
        avgDiscoveryScore: { control: 0, test: 0 },
        avgFeedScore: { control: 0, test: 0 },
        avgSwipeScore: { control: 0, test: 0 },
        avgAiScore: { control: 0, test: 0 },
      },
    };
  }

  /**
   * Validate test configuration
   */
  private validateTestConfig(test: Partial<ABTestConfig>): void {
    // Ensure critical systems are not altered
    if (test.excludedFromTest) {
      if (
        !test.excludedFromTest.revenueChanges ||
        !test.excludedFromTest.payoutChanges ||
        !test.excludedFromTest.refundPolicyChanges ||
        !test.excludedFromTest.safetyChanges
      ) {
        throw new Error(
          'A/B tests must exclude revenue, payout, refund policy, and safety changes'
        );
      }
    } else {
      throw new Error('excludedFromTest configuration is required');
    }

    // Validate percentage
    if (
      test.testGroupPercentage === undefined ||
      test.testGroupPercentage < 0 ||
      test.testGroupPercentage > 100
    ) {
      throw new Error('testGroupPercentage must be between 0 and 100');
    }

    // Validate dates
    if (test.startDate && test.endDate && test.startDate >= test.endDate) {
      throw new Error('startDate must be before endDate');
    }
  }

  /**
   * Log test action for audit
   */
  private async logTestAction(
    testId: string,
    action: string,
    adminId: string,
    before: any,
    after: any
  ): Promise<void> {
    const logRef = this.db
      .collection('system')
      .doc('rankingAuditLogs')
      .collection('logs')
      .doc();

    await logRef.set({
      id: logRef.id,
      timestamp: Date.now(),
      adminId,
      adminEmail: '',
      action,
      before,
      after,
      testId,
      reversible: true,
    });
  }
}
