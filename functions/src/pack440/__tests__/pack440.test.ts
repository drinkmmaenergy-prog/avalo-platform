/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { CreatorRevenueIntegrityScoreService } from '../services/CreatorRevenueIntegrityScore';
import { IntelligentPayoutEscrowService } from '../services/IntelligentPayoutEscrowService';
import { ProgressiveFreezeController } from '../services/ProgressiveFreezeController';
import { CreatorPayoutStatusAPI } from '../services/CreatorPayoutStatusAPI';
import { ComplianceEscalationOrchestrator } from '../services/ComplianceEscalationOrchestrator';

// Test database instance
let db: admin.firestore.Firestore;
let integrityService: CreatorRevenueIntegrityScoreService;
let escrowService: IntelligentPayoutEscrowService;
let freezeController: ProgressiveFreezeController;
let statusAPI: CreatorPayoutStatusAPI;
let complianceOrchestrator: ComplianceEscalationOrchestrator;

// Test data
const TEST_CREATOR_ID = 'test_creator_123';
const TEST_PAYOUT_AMOUNT = 1000;

beforeEach(async () => {
  // Initialize test database
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'test-project'
    });
  }
  
  db = admin.firestore();
  
  // Initialize services
  integrityService = new CreatorRevenueIntegrityScoreService(db);
  escrowService = new IntelligentPayoutEscrowService(db, integrityService);
  freezeController = new ProgressiveFreezeController(db, integrityService);
  statusAPI = new CreatorPayoutStatusAPI(db);
  complianceOrchestrator = new ComplianceEscalationOrchestrator(db);
  
  // Setup test creator
  await db.collection('users').doc(TEST_CREATOR_ID).set({
    createdAt: Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    kyc_verified: true
  });
});

afterEach(async () => {
  // Cleanup test data
  const batch = db.batch();
  
  const collections = [
    'users',
    'creator_revenue_integrity',
    'payout_escrow',
    'payout_freezes',
    'payout_status_transparency',
    'compliance_escalations',
    'transactions',
    'refunds',
    'chargebacks'
  ];
  
  for (const collection of collections) {
    const snapshot = await db.collection(collection).where('__name__', '>=', '').get();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
  }
  
  await batch.commit();
});

describe('PACK 440: Creator Revenue Integrity Score', () => {
  it('should calculate integrity score for new creator', async () => {
    const score = await integrityService.calculateScore(TEST_CREATOR_ID);
    
    expect(score).toBeDefined();
    expect(score.creatorId).toBe(TEST_CREATOR_ID);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1000);
    expect(score.riskLevel).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
  });
  
  it('should score high for diverse revenue sources', async () => {
    // Create diverse revenue
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 100,
      type: 'subscription',
      senderId: 'payer1',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 100,
      type: 'media',
      senderId: 'payer2',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 100,
      type: 'call',
      senderId: 'payer3',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    const score = await integrityService.calculateScore(TEST_CREATOR_ID);
    
    expect(score.scoreComponents.revenueSourceDiversity).toBeGreaterThan(70);
  });
  
  it('should score low for high refund ratio', async () => {
    // Create transactions with high refunds
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 100,
      type: 'subscription',
      senderId: 'payer1',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    await db.collection('refunds').add({
      creatorId: TEST_CREATOR_ID,
      amount: 50,
      createdAt: Timestamp.now()
    });
    
    const score = await integrityService.calculateScore(TEST_CREATOR_ID);
    
    expect(score.scoreComponents.refundRatio).toBeLessThan(80);
  });
  
  it('should score very low for chargebacks', async () => {
    // Create transactions with chargebacks
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 100,
      type: 'subscription',
      senderId: 'payer1',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    await db.collection('chargebacks').add({
      creatorId: TEST_CREATOR_ID,
      amount: 30,
      createdAt: Timestamp.now()
    });
    
    const score = await integrityService.calculateScore(TEST_CREATOR_ID);
    
    expect(score.scoreComponents.chargebackExposure).toBeLessThan(60);
    expect(score.flags).toContain('HIGH_CHARGEBACK_RISK');
  });
});

describe('PACK 440: Intelligent Payout Escrow', () => {
  it('should create escrow with correct period based on score', async () => {
    // Create high-quality creator profile
    await integrityService.calculateScore(TEST_CREATOR_ID);
    
    const escrow = await escrowService.createPayoutEscrow({
      creatorId: TEST_CREATOR_ID,
      amount: TEST_PAYOUT_AMOUNT,
      currency: 'USD',
      revenueBreakdown: {
        subscriptions: 500,
        media: 300,
        calls: 200
      }
    });
    
    expect(escrow).toBeDefined();
    expect(escrow.creatorId).toBe(TEST_CREATOR_ID);
    expect(escrow.amount).toBe(TEST_PAYOUT_AMOUNT);
    expect(escrow.status).toBe('IN_ESCROW');
    expect(escrow.escrowPeriod.cooldownHours).toBeGreaterThan(0);
  });
  
  it('should extend escrow for high-risk creators', async () => {
    // Create high-risk profile with chargebacks
    await db.collection('chargebacks').add({
      creatorId: TEST_CREATOR_ID,
      amount: 500,
      createdAt: Timestamp.now()
    });
    
    await integrityService.calculateScore(TEST_CREATOR_ID);
    
    const escrow = await escrowService.createPayoutEscrow({
      creatorId: TEST_CREATOR_ID,
      amount: TEST_PAYOUT_AMOUNT,
      currency: 'USD',
      revenueBreakdown: {
        subscriptions: 1000,
        media: 0,
        calls: 0
      }
    });
    
    expect(escrow.escrowPeriod.cooldownHours).toBeGreaterThan(48); // Extended period
    expect(escrow.riskFactors.length).toBeGreaterThan(0);
  });
  
  it('should run compliance checks', async () => {
    const escrow = await escrowService.createPayoutEscrow({
      creatorId: TEST_CREATOR_ID,
      amount: TEST_PAYOUT_AMOUNT,
      currency: 'USD',
      revenueBreakdown: {
        subscriptions: 1000,
        media: 0,
        calls: 0
      }
    });
    
    expect(escrow.complianceChecks).toBeDefined();
    expect(escrow.complianceChecks.amlPassed).toBeDefined();
    expect(escrow.complianceChecks.fraudChecked).toBeDefined();
    expect(escrow.complianceChecks.chargebackReview).toBeDefined();
  });
});

describe('PACK 440: Progressive Freeze Controller', () => {
  it('should evaluate freeze conditions', async () => {
    await integrityService.calculateScore(TEST_CREATOR_ID);
    
    const freezeEval = await freezeController.evaluateFreeze(
      TEST_CREATOR_ID,
      'test_payout_123',
      TEST_PAYOUT_AMOUNT
    );
    
    // Should not freeze for clean creator
    expect(freezeEval).toBeNull();
  });
  
  it('should trigger freeze for chargeback spike', async () => {
    // Create chargeback spike
    for (let i = 0; i < 5; i++) {
      await db.collection('chargebacks').add({
        creatorId: TEST_CREATOR_ID,
        amount: 100,
        createdAt: Timestamp.now()
      });
    }
    
    await integrityService.calculateScore(TEST_CREATOR_ID);
    
    const freezeEval = await freezeController.evaluateFreeze(
      TEST_CREATOR_ID,
      'test_payout_123',
      TEST_PAYOUT_AMOUNT
    );
    
    expect(freezeEval).toBeDefined();
    expect(freezeEval!.shouldFreeze).toBe(true);
    expect(freezeEval!.reason.code).toContain('CHARGEBACK');
  });
  
  it('should create and release freeze', async () => {
    const freezeEval = {
      shouldFreeze: true,
      freezeType: 'PAYOUT' as const,
      reason: {
        code: 'TEST_FREEZE',
        severity: 'LOW' as const,
        publicMessage: 'Test freeze',
        internalNotes: 'Test'
      },
      severity: 'LOW' as const,
      affectedAmount: 100,
      estimatedReleaseHours: 24
    };
    
    const freeze = await freezeController.createFreeze(
      TEST_CREATOR_ID,
      freezeEval,
      'test_payout_123'
    );
    
    expect(freeze).toBeDefined();
    expect(freeze.status).toBe('ACTIVE');
    
    // Release freeze
    await freezeController.releaseFreeze(freeze.freezeId, 'TEST_USER', 'Test release');
    
    const updatedFreeze = await freezeController.getFreeze(freeze.freezeId);
    expect(updatedFreeze?.status).toBe('RELEASED');
  });
});

describe('PACK 440: Creator Payout Status API', () => {
  it('should generate payout status for creator', async () => {
    const status = await statusAPI.generateStatus(TEST_CREATOR_ID);
    
    expect(status).toBeDefined();
    expect(status.creatorId).toBe(TEST_CREATOR_ID);
    expect(status.currentStatus).toMatch(/NORMAL|DELAYED|FROZEN|UNDER_REVIEW/);
    expect(status.integrityScoreTier).toMatch(/GOLD|SILVER|BRONZE|PROBATION/);
  });
  
  it('should show correct tier based on score', async () => {
    // Create excellent profile
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 1000,
      type: 'subscription',
      senderId: 'payer1',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    await integrityService.calculateScore(TEST_CREATOR_ID);
    
    const status = await statusAPI.generateStatus(TEST_CREATOR_ID);
    
    expect(['GOLD', 'SILVER']).toContain(status.integrityScoreTier);
  });
});

describe('PACK 440: Compliance Escalation Orchestrator', () => {
  it('should create escalation case', async () => {
    const escalation = await complianceOrchestrator.createEscalation({
      creatorId: TEST_CREATOR_ID,
      type: 'HIGH_RISK_SCORE',
      severity: 'HIGH',
      description: 'Test escalation',
      affectedAmount: 1000,
      riskFactors: ['TEST_RISK']
    });
    
    expect(escalation).toBeDefined();
    expect(escalation.status).toBe('OPEN');
    expect(escalation.severity).toBe('HIGH');
  });
  
  it('should resolve case', async () => {
    const escalation = await complianceOrchestrator.createEscalation({
      creatorId: TEST_CREATOR_ID,
      type: 'HIGH_RISK_SCORE',
      severity: 'LOW',
      description: 'Test',
      affectedAmount: 100
    });
    
    await complianceOrchestrator.resolveCase(
      escalation.caseId,
      'APPROVED',
      'Test resolution',
      'TEST_USER'
    );
    
    const resolved = await complianceOrchestrator.getCase(escalation.caseId);
    expect(resolved?.status).toBe('RESOLVED');
  });
});

describe('PACK 440: End-to-End Flow', () => {
  it('should process complete payout flow', async () => {
    // 1. Create creator profile with transactions
    await db.collection('transactions').add({
      recipientId: TEST_CREATOR_ID,
      amount: 500,
      type: 'subscription',
      senderId: 'payer1',
      status: 'completed',
      completedAt: Timestamp.now()
    });
    
    // 2. Calculate integrity score
    const score = await integrityService.calculateScore(TEST_CREATOR_ID);
    expect(score.score).toBeGreaterThan(0);
    
    // 3. Create payout escrow
    const escrow = await escrowService.createPayoutEscrow({
      creatorId: TEST_CREATOR_ID,
      amount: 500,
      currency: 'USD',
      revenueBreakdown: {
        subscriptions: 500,
        media: 0,
        calls: 0
      }
    });
    expect(escrow.status).toBe('IN_ESCROW');
    
    // 4. Evaluate freeze
    const freezeEval = await freezeController.evaluateFreeze(
      TEST_CREATOR_ID,
      escrow.payoutId,
      500
    );
    // Should not freeze for clean creator
    expect(freezeEval).toBeNull();
    
    // 5. Generate status
    const status = await statusAPI.generateStatus(TEST_CREATOR_ID);
    expect(status.activePayouts.length).toBeGreaterThan(0);
    expect(status.currentStatus).toBe('UNDER_REVIEW');
  });
});

describe('PACK 440: Performance Tests', () => {
  it('should calculate score quickly', async () => {
    const start = Date.now();
    await integrityService.calculateScore(TEST_CREATOR_ID);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });
  
  it('should handle batch score updates', async () => {
    const creatorIds = Array.from({ length: 10 }, (_, i) => `creator_${i}`);
    
    const start = Date.now();
    await Promise.all(
      creatorIds.map(id => integrityService.calculateScore(id).catch(() => null))
    );
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
  });
});
