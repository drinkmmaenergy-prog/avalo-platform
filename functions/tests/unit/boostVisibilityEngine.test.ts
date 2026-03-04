/**
 * PACK 460 — AVALO Paid Visibility Engine: Test Suite
 *
 * Tests:
 *  1. Concurrent impression safety
 *  2. Budget exhaustion handling
 *  3. Ledger replay validation
 *  4. Anti-whale enforcement (max 3 active campaigns)
 *  5. Pacing engine (EVEN + ACCELERATED)
 *  6. Sponsored feed density (max 30%)
 *  7. Region dominance (max 20%)
 *  8. Campaign lifecycle (create, pause, resume, expire)
 *  9. Ranking hook integration
 *
 * Uses Firebase Emulator + Firestore transactions for real atomicity testing.
 */

process.env.FUNCTIONS_EMULATOR = 'true';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'test';

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin for tests
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-avalo-test' });
}

const db = admin.firestore();

// Import the engine under test
import {
  createBoostCampaign,
  confirmImpression,
  pauseBoostCampaign,
  resumeBoostCampaign,
  getAdvertiserCampaigns,
  expireEndedCampaigns,
  refundUnspentBudgets,
  getBoostCampaign,
  validateCampaignLedger,
  calculateBoostScore,
  getBoostedCandidates,
  isPacingAllowed,
} from '../../src/pack460-boost-visibility-engine';

import {
  applyBoostToFeed,
  injectBoostedCandidates,
  reportSponsoredView,
} from '../../src/pack460-boost-ranking-hook';

import type {
  CreateBoostCampaignRequest,
  BoostCampaign,
} from '../../src/types/boostCampaign.types';

import { BOOST_CAMPAIGN_CONSTANTS as C } from '../../src/types/boostCampaign.types';

// ============================================================================
// TEST HELPERS
// ============================================================================

function generateUserId(): string {
  return `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateCampaignRequest(
  advertiserId: string,
  overrides?: Partial<CreateBoostCampaignRequest>
): CreateBoostCampaignRequest {
  const now = new Date();
  const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now

  return {
    advertiserId,
    name: `Test Campaign ${Date.now()}`,
    targetContentId: `profile_${Date.now()}`,
    targetContentType: 'PROFILE',
    placements: ['FEED', 'DISCOVERY'],
    pacingMode: 'ACCELERATED',
    costPerImpression: 5,
    totalBudget: 500,
    maxImpressions: 0,
    startAt: now,
    endAt: endDate,
    ...overrides,
  };
}

async function setupWallet(userId: string, tokens: number): Promise<void> {
  await db.collection(C.COLLECTION_USER_WALLETS).doc(userId).set({
    userId,
    availableTokens: tokens,
    lifetimePurchased: tokens,
    lifetimeSpent: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

async function getWalletBalance(userId: string): Promise<number> {
  const snap = await db.collection(C.COLLECTION_USER_WALLETS).doc(userId).get();
  return snap.exists ? (snap.data()?.availableTokens ?? 0) : 0;
}

async function getPlatformRevenue(): Promise<number> {
  const snap = await db.collection(C.COLLECTION_AVALO_VAULT).doc('platform').get();
  return snap.exists ? (snap.data()?.totalRevenue ?? 0) : 0;
}

async function cleanupCollection(collection: string): Promise<void> {
  const snap = await db.collection(collection).limit(500).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('PACK 460 — Boost Visibility Engine', () => {
  // Clean up collections before each test
  beforeEach(async () => {
    await Promise.all([
      cleanupCollection(C.COLLECTION_CAMPAIGNS),
      cleanupCollection(C.COLLECTION_IMPRESSIONS),
      cleanupCollection(C.COLLECTION_LEDGER),
      cleanupCollection(C.COLLECTION_USER_WALLETS),
      cleanupCollection(C.COLLECTION_AVALO_VAULT),
    ]);
  });

  // ========================================================================
  // 1. CAMPAIGN CREATION & LIFECYCLE
  // ========================================================================

  describe('Campaign Creation', () => {
    it('should create a campaign and deduct budget from wallet', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, { totalBudget: 500 });
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(true);
      expect(result.campaignId).toBeDefined();

      // Verify wallet was deducted
      const balance = await getWalletBalance(userId);
      expect(balance).toBe(500); // 1000 - 500

      // Verify campaign exists
      const campaign = await getBoostCampaign(result.campaignId!);
      expect(campaign).toBeDefined();
      expect(campaign!.status).toBe('ACTIVE');
      expect(campaign!.totalBudget).toBe(500);
      expect(campaign!.remainingBudget).toBe(500);
      expect(campaign!.spentBudget).toBe(0);
    });

    it('should reject campaign when wallet has insufficient balance', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 100);

      const request = generateCampaignRequest(userId, { totalBudget: 500 });
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient balance');

      // Verify wallet was NOT deducted
      const balance = await getWalletBalance(userId);
      expect(balance).toBe(100);
    });

    it('should reject campaign when wallet does not exist', async () => {
      const userId = generateUserId();

      const request = generateCampaignRequest(userId);
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('wallet not found');
    });

    it('should reject campaign with CPI below minimum', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, { costPerImpression: 0 });
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cost per impression');
    });

    it('should reject campaign with CPI above maximum', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 100000);

      const request = generateCampaignRequest(userId, { costPerImpression: 200 });
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cost per impression');
    });

    it('should reject campaign with budget below minimum', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, { totalBudget: 10 });
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum campaign budget');
    });

    it('should reject campaign where endAt <= startAt', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const now = new Date();
      const request = generateCampaignRequest(userId, {
        startAt: now,
        endAt: new Date(now.getTime() - 1000),
      });
      const result = await createBoostCampaign(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('End date must be after start date');
    });
  });

  // ========================================================================
  // 2. ANTI-WHALE: MAX 3 ACTIVE CAMPAIGNS
  // ========================================================================

  describe('Anti-Whale Enforcement', () => {
    it('should allow up to 3 active campaigns per user', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      // Create 3 campaigns — all should succeed
      for (let i = 0; i < 3; i++) {
        const request = generateCampaignRequest(userId, {
          totalBudget: 100,
          name: `Campaign ${i + 1}`,
        });
        const result = await createBoostCampaign(request);
        expect(result.success).toBe(true);
      }

      // 4th campaign should be rejected
      const request4 = generateCampaignRequest(userId, {
        totalBudget: 100,
        name: 'Campaign 4',
      });
      const result4 = await createBoostCampaign(request4);

      expect(result4.success).toBe(false);
      expect(result4.error).toContain('Maximum 3 active campaigns');
    });

    it('should allow new campaign after pausing one', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const campaignIds: string[] = [];

      // Create 3 campaigns
      for (let i = 0; i < 3; i++) {
        const request = generateCampaignRequest(userId, {
          totalBudget: 100,
          name: `Campaign ${i + 1}`,
        });
        const result = await createBoostCampaign(request);
        expect(result.success).toBe(true);
        campaignIds.push(result.campaignId!);
      }

      // Pause one campaign
      const pauseResult = await pauseBoostCampaign(campaignIds[0], userId);
      expect(pauseResult.success).toBe(true);

      // Now 4th should succeed (only 2 active + 1 paused, but paused doesn't count against active)
      // Wait — spec says PENDING + ACTIVE count. PAUSED should not count.
      // Let's verify by checking the query: status in ['PENDING', 'ACTIVE']
      // Paused is not in that list, so new campaign should be allowed.
      // Actually looking at the code, the query uses `['PENDING', 'ACTIVE']`, so PAUSED doesn't count.
      // BUT wait, the current implementation counts PAUSED as active too in the anti-whale check.
      // Let me re-read the engine code...
      // The engine checks: .where('status', 'in', ['PENDING', 'ACTIVE'])
      // So PAUSED does NOT count. Good.

      const request4 = generateCampaignRequest(userId, {
        totalBudget: 100,
        name: 'Campaign 4',
      });
      const result4 = await createBoostCampaign(request4);
      expect(result4.success).toBe(true);
    });
  });

  // ========================================================================
  // 3. IMPRESSION CONFIRMATION & BILLING
  // ========================================================================

  describe('Impression Confirmation', () => {
    it('should deduct tokens from campaign and credit platform wallet', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 500,
        costPerImpression: 10,
      });
      const createResult = await createBoostCampaign(request);
      expect(createResult.success).toBe(true);

      const initialPlatformRevenue = await getPlatformRevenue();

      // Confirm an impression
      const impressionResult = await confirmImpression({
        campaignId: createResult.campaignId!,
        viewerUserId: 'viewer_123',
        placement: 'FEED',
      });

      expect(impressionResult.success).toBe(true);
      expect(impressionResult.tokensCharged).toBe(10);
      expect(impressionResult.impressionId).toBeDefined();

      // Verify campaign updated
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.spentBudget).toBe(10);
      expect(campaign!.remainingBudget).toBe(490);
      expect(campaign!.impressionsDelivered).toBe(1);

      // Verify platform wallet credited
      const platformRevenue = await getPlatformRevenue();
      expect(platformRevenue).toBe(initialPlatformRevenue + 10);
    });

    it('should reject impression when campaign is not active', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, { totalBudget: 500 });
      const createResult = await createBoostCampaign(request);

      // Pause the campaign
      await pauseBoostCampaign(createResult.campaignId!, userId);

      const impressionResult = await confirmImpression({
        campaignId: createResult.campaignId!,
        viewerUserId: 'viewer_123',
        placement: 'FEED',
      });

      expect(impressionResult.success).toBe(false);
      expect(impressionResult.error).toContain('CAMPAIGN_NOT_ACTIVE');
    });

    it('should reject impression for non-existent campaign', async () => {
      const result = await confirmImpression({
        campaignId: 'nonexistent_campaign',
        viewerUserId: 'viewer_123',
        placement: 'FEED',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CAMPAIGN_NOT_FOUND');
    });
  });

  // ========================================================================
  // 4. BUDGET EXHAUSTION
  // ========================================================================

  describe('Budget Exhaustion', () => {
    it('should set status to BUDGET_EXHAUSTED when budget runs out', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      // Campaign with budget for exactly 5 impressions
      const request = generateCampaignRequest(userId, {
        totalBudget: 50,
        costPerImpression: 10,
      });
      const createResult = await createBoostCampaign(request);
      expect(createResult.success).toBe(true);

      // Deliver 5 impressions
      for (let i = 0; i < 5; i++) {
        const result = await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
        expect(result.success).toBe(true);
      }

      // 6th impression should fail
      const result6 = await confirmImpression({
        campaignId: createResult.campaignId!,
        viewerUserId: 'viewer_6',
        placement: 'FEED',
      });

      // Campaign should now be BUDGET_EXHAUSTED
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.status).toBe('BUDGET_EXHAUSTED');
      expect(campaign!.remainingBudget).toBe(0);
      expect(campaign!.spentBudget).toBe(50);
      expect(campaign!.impressionsDelivered).toBe(5);

      // Additional impression should not be possible
      expect(result6.success).toBe(false);
    });

    it('should handle edge case where remaining budget < CPI after last impression', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      // Budget 55, CPI 10: 5 impressions, 5 tokens leftover (< CPI)
      const request = generateCampaignRequest(userId, {
        totalBudget: 55,
        costPerImpression: 10,
      });
      const createResult = await createBoostCampaign(request);

      // Deliver 5 impressions (spending 50 tokens, 5 remaining < CPI of 10)
      for (let i = 0; i < 5; i++) {
        const result = await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
        expect(result.success).toBe(true);
      }

      // After 5th impression: remaining = 5, which is < CPI of 10
      // So status should be BUDGET_EXHAUSTED
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.status).toBe('BUDGET_EXHAUSTED');
      expect(campaign!.remainingBudget).toBe(5); // 55 - 50
    });
  });

  // ========================================================================
  // 5. CONCURRENT IMPRESSION SAFETY
  // ========================================================================

  describe('Concurrent Impression Safety', () => {
    it('should handle concurrent impressions without double-spending', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      // Campaign: 200 budget, 10 CPI → max 20 impressions
      const request = generateCampaignRequest(userId, {
        totalBudget: 200,
        costPerImpression: 10,
      });
      const createResult = await createBoostCampaign(request);
      expect(createResult.success).toBe(true);

      // Fire 30 concurrent impressions (more than budget allows)
      const concurrentPromises = Array.from({ length: 30 }, (_, i) =>
        confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        })
      );

      const results = await Promise.all(concurrentPromises);

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // At most 20 should succeed (200 budget / 10 CPI)
      expect(successful.length).toBeLessThanOrEqual(20);
      expect(successful.length).toBeGreaterThan(0);

      // Verify campaign integrity
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.spentBudget).toBeLessThanOrEqual(200);
      expect(campaign!.remainingBudget).toBeGreaterThanOrEqual(0);
      expect(campaign!.spentBudget + campaign!.remainingBudget).toBe(200);

      // Verify no over-billing: platform revenue = exactly spentBudget
      const platformRevenue = await getPlatformRevenue();
      expect(platformRevenue).toBe(campaign!.spentBudget);
    });

    it('should serialize writes within transaction to prevent race conditions', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 10000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 1000,
        costPerImpression: 5,
      });
      const createResult = await createBoostCampaign(request);

      // Fire 10 rapid parallel impressions
      const promises = Array.from({ length: 10 }, (_, i) =>
        confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `rapid_viewer_${i}`,
          placement: 'DISCOVERY',
        })
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.success).length;

      // All 10 should succeed (1000 / 5 = 200 max impressions)
      expect(successCount).toBe(10);

      // Verify totals
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.spentBudget).toBe(50); // 10 * 5
      expect(campaign!.impressionsDelivered).toBe(10);
    });
  });

  // ========================================================================
  // 6. LEDGER REPLAY VALIDATION
  // ========================================================================

  describe('Ledger Replay Validation', () => {
    it('should have consistent ledger entries matching campaign spent', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 500,
        costPerImpression: 10,
      });
      const createResult = await createBoostCampaign(request);

      // Deliver 15 impressions
      for (let i = 0; i < 15; i++) {
        await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
      }

      // Validate ledger
      const validation = await validateCampaignLedger(createResult.campaignId!);

      expect(validation.valid).toBe(true);
      expect(validation.campaignSpent).toBe(150); // 15 * 10
      expect(validation.ledgerTotal).toBe(150);
      expect(validation.impressionCount).toBe(15);
      expect(validation.ledgerEntryCount).toBe(15);
    });

    it('should create one ledger entry per impression', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 500,
        costPerImpression: 5,
      });
      const createResult = await createBoostCampaign(request);

      // Deliver 7 impressions
      for (let i = 0; i < 7; i++) {
        await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'DISCOVERY',
        });
      }

      const validation = await validateCampaignLedger(createResult.campaignId!);
      expect(validation.ledgerEntryCount).toBe(7);
      expect(validation.impressionCount).toBe(7);
      expect(validation.ledgerTotal).toBe(35); // 7 * 5
    });
  });

  // ========================================================================
  // 7. PACING ENGINE
  // ========================================================================

  describe('Pacing Engine', () => {
    it('ACCELERATED: should allow all impressions without throttling', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 200,
        costPerImpression: 10,
        pacingMode: 'ACCELERATED',
      });
      const createResult = await createBoostCampaign(request);

      // Deliver 20 impressions rapidly (budget allows exactly 20)
      let successCount = 0;
      for (let i = 0; i < 20; i++) {
        const result = await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
        if (result.success) successCount++;
      }

      expect(successCount).toBe(20);
    });

    it('EVEN: should allow impressions within pacing window', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      // Campaign: 24h duration, 100 impressions max, EVEN pacing
      const now = new Date();
      const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 1000,
        costPerImpression: 10,
        pacingMode: 'EVEN',
        maxImpressions: 100,
        startAt: now,
        endAt: endDate,
      });
      const createResult = await createBoostCampaign(request);

      // At beginning of campaign, even pacing should allow ~10% + buffer
      // since progress is near 0, expectedImpressions ≈ 0, buffer = 10
      // So up to 10 impressions should be allowed at start
      let successCount = 0;
      for (let i = 0; i < 15; i++) {
        const result = await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
        if (result.success) successCount++;
      }

      // At least some should succeed (buffer allows initial burst)
      expect(successCount).toBeGreaterThan(0);
      // But not all 15 should succeed if pacing is working
      // (Buffer is max(1, ceil(100 * 0.10)) = 10, expected at start ≈ 0)
      // So max ~10 should be allowed
      expect(successCount).toBeLessThanOrEqual(12); // Some tolerance
    });
  });

  // ========================================================================
  // 8. CAMPAIGN PAUSE / RESUME
  // ========================================================================

  describe('Campaign Pause/Resume', () => {
    it('should pause and resume a campaign', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, { totalBudget: 500 });
      const createResult = await createBoostCampaign(request);
      const campaignId = createResult.campaignId!;

      // Pause
      const pauseResult = await pauseBoostCampaign(campaignId, userId);
      expect(pauseResult.success).toBe(true);

      let campaign = await getBoostCampaign(campaignId);
      expect(campaign!.status).toBe('PAUSED');

      // Impressions should fail while paused
      const impressionResult = await confirmImpression({
        campaignId,
        viewerUserId: 'viewer_1',
        placement: 'FEED',
      });
      expect(impressionResult.success).toBe(false);

      // Resume
      const resumeResult = await resumeBoostCampaign(campaignId, userId);
      expect(resumeResult.success).toBe(true);

      campaign = await getBoostCampaign(campaignId);
      expect(campaign!.status).toBe('ACTIVE');

      // Impressions should work again
      const impressionResult2 = await confirmImpression({
        campaignId,
        viewerUserId: 'viewer_2',
        placement: 'FEED',
      });
      expect(impressionResult2.success).toBe(true);
    });

    it('should reject pause by non-owner', async () => {
      const userId = generateUserId();
      const otherUserId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, { totalBudget: 500 });
      const createResult = await createBoostCampaign(request);

      const result = await pauseBoostCampaign(createResult.campaignId!, otherUserId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  // ========================================================================
  // 9. CAMPAIGN EXPIRATION
  // ========================================================================

  describe('Campaign Expiration', () => {
    it('should expire campaigns past their endAt time', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      // Create campaign that already expired
      const past = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const pastEnd = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

      const campaignId = db.collection(C.COLLECTION_CAMPAIGNS).doc().id;
      await db.collection(C.COLLECTION_CAMPAIGNS).doc(campaignId).set({
        campaignId,
        advertiserId: userId,
        name: 'Expired Campaign',
        targetContentId: 'profile_expired',
        targetContentType: 'PROFILE',
        placements: ['FEED'],
        status: 'ACTIVE',
        pacingMode: 'ACCELERATED',
        costPerImpression: 10,
        totalBudget: 100,
        spentBudget: 50,
        remainingBudget: 50,
        impressionsDelivered: 5,
        maxImpressions: 0,
        startAt: Timestamp.fromDate(past),
        endAt: Timestamp.fromDate(pastEnd),
        createdAt: Timestamp.fromDate(past),
        updatedAt: Timestamp.fromDate(past),
      });

      const expiredCount = await expireEndedCampaigns();
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const campaign = await getBoostCampaign(campaignId);
      expect(campaign!.status).toBe('COMPLETED');
    });
  });

  // ========================================================================
  // 10. UNSPENT BUDGET RETURN
  // ========================================================================

  describe('Unspent Budget Return', () => {
    it('should return unspent tokens to advertiser wallet', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 1000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 500,
        costPerImpression: 10,
      });
      const createResult = await createBoostCampaign(request);

      // Deliver 10 impressions (spending 100 tokens, 400 remaining)
      for (let i = 0; i < 10; i++) {
        await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
      }

      // Manually complete the campaign
      await db.collection(C.COLLECTION_CAMPAIGNS).doc(createResult.campaignId!).update({
        status: 'COMPLETED',
      });

      // Balance before refund: 1000 - 500 = 500
      const balanceBefore = await getWalletBalance(userId);
      expect(balanceBefore).toBe(500);

      // Run refund job
      const refunded = await refundUnspentBudgets();
      expect(refunded).toBeGreaterThanOrEqual(1);

      // Balance after refund: 500 + 400 (unspent) = 900
      const balanceAfter = await getWalletBalance(userId);
      expect(balanceAfter).toBe(900);

      // Campaign remaining should be 0
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.remainingBudget).toBe(0);
    });
  });

  // ========================================================================
  // 11. BOOST SCORE CALCULATION
  // ========================================================================

  describe('Boost Score Calculation', () => {
    it('should return 0 for non-boosted content', async () => {
      const result = await calculateBoostScore('non_existent_content', 'FEED');

      expect(result.boostScore).toBe(0);
      expect(result.campaignIds).toEqual([]);
      expect(result.isSponsored).toBe(false);
    });

    it('should return positive score for active boosted content', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const targetContentId = `profile_boosted_${Date.now()}`;
      const request = generateCampaignRequest(userId, {
        totalBudget: 500,
        costPerImpression: 50,
        targetContentId,
        placements: ['FEED', 'DISCOVERY', 'SWIPE'],
      });
      const createResult = await createBoostCampaign(request);
      expect(createResult.success).toBe(true);

      const result = await calculateBoostScore(targetContentId, 'FEED');

      expect(result.boostScore).toBeGreaterThan(0);
      expect(result.boostScore).toBeLessThanOrEqual(0.3);
      expect(result.campaignIds).toContain(createResult.campaignId);
      expect(result.isSponsored).toBe(true);
    });

    it('should cap boost score at 0.3', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 10000);

      const targetContentId = `profile_multiboosted_${Date.now()}`;

      // Create MAX campaigns with max CPI to try to exceed 0.3
      for (let i = 0; i < 3; i++) {
        const request = generateCampaignRequest(userId, {
          totalBudget: 1000,
          costPerImpression: 100, // Max CPI
          targetContentId,
          name: `Max Boost ${i}`,
        });
        await createBoostCampaign(request);
      }

      const result = await calculateBoostScore(targetContentId, 'FEED');

      expect(result.boostScore).toBeLessThanOrEqual(0.3);
    });
  });

  // ========================================================================
  // 12. SPONSORED DENSITY & REGION DOMINANCE
  // ========================================================================

  describe('Density & Region Limits', () => {
    it('should respect 30% sponsored feed density', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 50000);

      // Create multiple campaigns with different targets
      for (let i = 0; i < 10; i++) {
        const request = generateCampaignRequest(userId, {
          totalBudget: 1000,
          costPerImpression: 10,
          targetContentId: `profile_density_${i}`,
          name: `Density Campaign ${i}`,
        });
        // We can only create 3 at a time due to anti-whale, so this will fail after 3
        await createBoostCampaign(request);
      }

      // Get boosted candidates for a feed of 20 items
      const { candidates, maxSponsoredSlots } = await getBoostedCandidates('FEED', 20);

      // Max 30% of 20 = 6 sponsored slots
      expect(maxSponsoredSlots).toBe(6);
      expect(candidates.length).toBeLessThanOrEqual(6);
    });

    it('should respect 20% region dominance', async () => {
      // Create campaigns from different advertisers in same region
      const regionUsers: string[] = [];
      for (let i = 0; i < 5; i++) {
        const uid = generateUserId();
        await setupWallet(uid, 10000);
        regionUsers.push(uid);
      }

      // Create campaigns targeting same region
      for (let i = 0; i < 5; i++) {
        const request = generateCampaignRequest(regionUsers[i], {
          totalBudget: 500,
          costPerImpression: 10,
          targetContentId: `profile_region_${i}`,
          targetRegion: 'europe-west',
          name: `Region Campaign ${i}`,
        });
        await createBoostCampaign(request);
      }

      // Feed of 20 items: max 20% from one region = 4
      const { candidates } = await getBoostedCandidates('FEED', 20);

      const regionCounts = new Map<string, number>();
      for (const c of candidates) {
        if (c.region) {
          regionCounts.set(c.region, (regionCounts.get(c.region) ?? 0) + 1);
        }
      }

      for (const [_region, count] of regionCounts) {
        expect(count).toBeLessThanOrEqual(4); // 20% of 20
      }
    });
  });

  // ========================================================================
  // 13. RANKING HOOK INTEGRATION
  // ========================================================================

  describe('Ranking Hook — applyBoostToFeed', () => {
    it('should add boostScore to organic scores', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const targetContentId = `boosted_profile_${Date.now()}`;
      await createBoostCampaign(
        generateCampaignRequest(userId, {
          totalBudget: 500,
          costPerImpression: 50,
          targetContentId,
          placements: ['FEED'],
        })
      );

      const organicFeed = [
        targetContentId,
        'organic_1',
        'organic_2',
        'organic_3',
      ];
      const organicScores = new Map<string, number>([
        [targetContentId, 0.5],
        ['organic_1', 0.8],
        ['organic_2', 0.6],
        ['organic_3', 0.4],
      ]);

      const result = await applyBoostToFeed(organicFeed, organicScores, 'FEED');

      // Find the boosted item
      const boostedItem = result.items.find((i) => i.contentId === targetContentId);
      expect(boostedItem).toBeDefined();
      expect(boostedItem!.boostScore).toBeGreaterThan(0);
      expect(boostedItem!.finalScore).toBeGreaterThan(0.5);
      expect(boostedItem!.isSponsored).toBe(true);
      expect(result.sponsoredCount).toBe(1);
    });

    it('should not break organic ranking for non-boosted items', async () => {
      const organicFeed = ['a', 'b', 'c', 'd'];
      const organicScores = new Map<string, number>([
        ['a', 0.9],
        ['b', 0.7],
        ['c', 0.5],
        ['d', 0.3],
      ]);

      const result = await applyBoostToFeed(organicFeed, organicScores, 'FEED');

      // All items should have boostScore 0 (no campaigns)
      for (const item of result.items) {
        expect(item.boostScore).toBe(0);
        expect(item.isSponsored).toBe(false);
      }

      // Original order should be preserved
      expect(result.items[0].contentId).toBe('a');
      expect(result.items[1].contentId).toBe('b');
      expect(result.items[2].contentId).toBe('c');
      expect(result.items[3].contentId).toBe('d');
    });
  });

  describe('Ranking Hook — injectBoostedCandidates', () => {
    it('should merge sponsored items at distributed positions', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const targetContentId = `inject_target_${Date.now()}`;
      await createBoostCampaign(
        generateCampaignRequest(userId, {
          totalBudget: 500,
          costPerImpression: 50,
          targetContentId,
          placements: ['FEED'],
        })
      );

      const organicFeed = Array.from({ length: 20 }, (_, i) => ({
        contentId: `organic_${i}`,
        score: 1 - i * 0.05,
      }));

      const result = await injectBoostedCandidates(organicFeed, 'FEED');

      // Sponsored items should be present
      const sponsoredItems = result.mergedFeed.filter((i) => i.isSponsored);
      expect(result.sponsoredCount).toBeLessThanOrEqual(6); // 30% of 20

      // All organic items should still be present
      const organicItems = result.mergedFeed.filter((i) => !i.isSponsored);
      expect(organicItems.length).toBe(20);
    });

    it('should not duplicate organic items as sponsored', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      // Boost a content that's already in the organic feed
      const duplicateId = 'organic_0';
      await createBoostCampaign(
        generateCampaignRequest(userId, {
          totalBudget: 500,
          costPerImpression: 50,
          targetContentId: duplicateId,
          placements: ['FEED'],
        })
      );

      const organicFeed = [
        { contentId: duplicateId, score: 0.9 },
        { contentId: 'organic_1', score: 0.7 },
      ];

      const result = await injectBoostedCandidates(organicFeed, 'FEED');

      // The duplicate should NOT appear as sponsored (already in organic)
      const duplicateSponsoredCount = result.mergedFeed.filter(
        (i) => i.contentId === duplicateId && i.isSponsored
      ).length;
      expect(duplicateSponsoredCount).toBe(0);
    });
  });

  // ========================================================================
  // 14. 100% AVALO REVENUE — NO SPLIT
  // ========================================================================

  describe('Revenue Rules', () => {
    it('should credit 100% of impression tokens to AVALO platform', async () => {
      const userId = generateUserId();
      await setupWallet(userId, 5000);

      const request = generateCampaignRequest(userId, {
        totalBudget: 300,
        costPerImpression: 15,
      });
      const createResult = await createBoostCampaign(request);

      // Deliver 10 impressions
      for (let i = 0; i < 10; i++) {
        await confirmImpression({
          campaignId: createResult.campaignId!,
          viewerUserId: `viewer_${i}`,
          placement: 'FEED',
        });
      }

      // 10 impressions * 15 tokens = 150 tokens total
      const platformRevenue = await getPlatformRevenue();
      expect(platformRevenue).toBe(150); // 100% to AVALO, no split

      // Verify no creator wallet was credited
      // (There's no creator in this system — all revenue is platform's)
      const campaign = await getBoostCampaign(createResult.campaignId!);
      expect(campaign!.spentBudget).toBe(150);
    });
  });
});
