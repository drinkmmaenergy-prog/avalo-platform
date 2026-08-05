import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 349 - Real-Time Ad Billing Engine
 * Token-based spending system for ads
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AvaloAd,
  BrandCampaign,
  AdPlacement,
  AdConversion,
  AdStats,
  AD_CONSTANTS,
} from './pack349-types';
import { admin, timestamp } from './runtime';

// ── P0-01 ADVERTISER-CREDIT — SAFE UNAVAILABLE CONTAINMENT (R3) ──────────────────────────────────────
// Advertiser credit is FINANCIAL VALUE, a SEPARATE accounting domain from user tokens and creator earnings.
// R2 added a module-private Symbol "capability" gate, but the functions that MINTED that capability
// (verifyAdminFromClaims, buildVerifiedProviderFundingProof) were EXPORTED and derived authority from an
// arbitrary plain object / a Boolean "verified" flag. Any importing server module could therefore FORGE
// admin or provider authority and mint credit when the feature flag was ON — the private Symbol was NOT a
// real authority boundary. No repository-native, cryptographically/runtime-verified admin-request adapter or
// provider-verification adapter is authorized or available in this task, and inventing one is forbidden.
// RESOLUTION (Option B — SAFE UNAVAILABLE CONTAINMENT): the weak factories, the capability Symbol, and the
// private mutation core are REMOVED. Every advertiser-credit CREATION operation is UNAVAILABLE and throws a
// deterministic *_UNAVAILABLE / retired error BEFORE any Firestore access. No public function returns a
// finance capability; no plain object or Boolean can create one; no importable path reaches credit mutation.
// Advertiser credit stays OFF (kill switch, default OFF) but the flag is NOT the only control — credit cannot
// be minted even when ADVERTISER_CREDIT_ENABLED=true. The R2 numeric/identifier/idempotency/ledger logic was
// removed together with the core it served; those controls are now unreachable-by-absence and would be
// reintroduced only alongside a genuine verified authority adapter in a future authorized decomposition.

export const ADVERTISER_CREDIT_ENABLED_ENV = 'ADVERTISER_CREDIT_ENABLED';
export function isAdvertiserCreditEnabled(): boolean { return process.env[ADVERTISER_CREDIT_ENABLED_ENV] === 'true'; }

// Collection names retained ONLY for zero-write assertions / future decomposition. NOTHING writes them.
export const ADVERTISER_CREDIT_LEDGER_COLLECTION = 'advertiserCreditLedger';
export const ADVERTISER_CREDIT_BARRIER_COLLECTION = 'advertiserCreditBarriers';

// Retained error taxonomy.
export class AdvertiserCreditDisabledError extends Error { constructor() { super('ADVERTISER_CREDIT_DISABLED'); this.name = 'AdvertiserCreditDisabledError'; } }
export class AdvertiserCreditAuthorityError extends Error { constructor(reason: string) { super(reason); this.name = 'AdvertiserCreditAuthorityError'; } }
// Thrown by every contained advertiser-credit CREATION operation, BEFORE any Firestore access, in ALL flag states.
export class AdvertiserCreditUnavailableError extends Error { constructor(operation: string) { super(operation + '_UNAVAILABLE'); this.name = 'AdvertiserCreditUnavailableError'; } }

export class AdBillingEngine {
  /**
   * Spend tokens for ad interaction
   * This is the main billing function called on every billable event
   */
  static async spendTokens(
    advertiserId: string,
    amount: number,
    reason: 'impression' | 'click' | 'view' | 'conversion',
    metadata: {
      adId: string;
      campaignId?: string;
      placementId: string;
      userId: string;
      countryCode: string;
    }
  ): Promise<boolean> {
    try {
      // Check advertiser account
      const advertiserRef = db.collection('advertisers').doc(advertiserId);
      const advertiser = await advertiserRef.get();

      if (!advertiser.exists) {
        throw new Error('Advertiser account not found');
      }

      const currentBalance = advertiser.data()?.tokenBalance || 0;

      if (currentBalance < amount) {
        console.warn(`Insufficient balance for advertiser ${advertiserId}`);
        // Pause campaign due to insufficient funds
        await this.pauseCampaignDueToFunds(metadata.campaignId, metadata.adId);
        return false;
      }

      // Deduct tokens
      await advertiserRef.update({
        tokenBalance: currentBalance - amount,
        totalSpent: (advertiser.data()?.totalSpent || 0) + amount,
        updatedAt: serverTimestamp(),
      });

      // Record transaction
      await db.collection('adTransactions').add({
        advertiserId,
        adId: metadata.adId,
        campaignId: metadata.campaignId,
        placementId: metadata.placementId,
        amount,
        type: reason,
        userId: metadata.userId,
        countryCode: metadata.countryCode,
        timestamp: serverTimestamp(),
      });

      // Update ad spend
      await this.updateAdSpend(metadata.adId, amount);

      // Update campaign spend if applicable
      if (metadata.campaignId) {
        await this.updateCampaignSpend(metadata.campaignId, amount);
      }

      return true;
    } catch (error) {
      console.error('Error spending tokens:', error);
      return false;
    }
  }

  /**
   * Charge for impression
   */
  static async chargeImpression(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string
  ): Promise<boolean> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;
    const amount = adData.bidPerImpressionTokens || 0;

    if (amount === 0) {
      return true; // No charge for impressions
    }

    const campaignId = await this.getAdCampaignId(adId);

    return this.spendTokens(advertiserId, amount, 'impression', {
      adId,
      campaignId,
      placementId,
      userId,
      countryCode,
    });
  }

  /**
   * Charge for click
   */
  static async chargeClick(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string
  ): Promise<boolean> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;
    const amount = adData.bidPerClickTokens;

    const campaignId = await this.getAdCampaignId(adId);

    return this.spendTokens(advertiserId, amount, 'click', {
      adId,
      campaignId,
      placementId,
      userId,
      countryCode,
    });
  }

  /**
   * Charge for view (video/engagement)
   */
  static async chargeView(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string,
    viewDuration: number
  ): Promise<boolean> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;
    const amount = adData.bidPerViewTokens;

    // Only charge if viewed for at least 3 seconds
    if (viewDuration < 3) {
      return true;
    }

    const campaignId = await this.getAdCampaignId(adId);

    return this.spendTokens(advertiserId, amount, 'view', {
      adId,
      campaignId,
      placementId,
      userId,
      countryCode,
    });
  }

  /**
   * Charge for conversion (optional higher-tier billing)
   */
  static async chargeConversion(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string,
    conversionValue?: number
  ): Promise<boolean> {
    // Conversion billing is optional and set at campaign level
    const campaignId = await this.getAdCampaignId(adId);

    if (!campaignId) {
      return true; // No conversion billing
    }

    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return true;
    }

    // For now, conversions are tracked but not separately billed
    // This can be extended for CPA (Cost Per Action) campaigns
    return true;
  }

  /**
   * Update ad spend tracking
   */
  private static async updateAdSpend(adId: string, amount: number): Promise<void> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (ad.exists) {
      await adRef.update({
        totalSpent: (ad.data()?.totalSpent || 0) + amount,
        updatedAt: serverTimestamp(),
      });
    }
  }

  /**
   * Update campaign spend and check budget limits
   */
  private static async updateCampaignSpend(
    campaignId: string,
    amount: number
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return;
    }

    const campaignData = campaign.data() as BrandCampaign;
    const newSpent = (campaignData.currentSpentTokens || 0) + amount;

    await campaignRef.update({
      currentSpentTokens: newSpent,
      updatedAt: serverTimestamp(),
    });

    // Auto-pause if budget exceeded
    if (newSpent >= campaignData.maxSpendTokens) {
      await campaignRef.update({
        status: 'ended',
        autoPausedAt: serverTimestamp(),
        autoPauseReason: 'Budget exhausted',
      });

      // Pause all ads in campaign
      await this.pauseAllCampaignAds(campaignId);
    }
  }

  /**
   * Pause campaign due to insufficient funds
   */
  private static async pauseCampaignDueToFunds(
    campaignId: string | undefined,
    adId: string
  ): Promise<void> {
    // Pause the specific ad
    await db.collection('ads').doc(adId).update({
      status: 'paused',
      updatedAt: serverTimestamp(),
    });

    if (campaignId) {
      await db.collection('brandCampaigns').doc(campaignId).update({
        status: 'paused',
        autoPausedAt: serverTimestamp(),
        autoPauseReason: 'Insufficient advertiser balance',
        updatedAt: serverTimestamp(),
      });
    }
  }

  /**
   * Pause all ads in a campaign
   */
  private static async pauseAllCampaignAds(campaignId: string): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return;
    }

    const adIds = (campaign.data() as BrandCampaign).ads || [];
    const batch = db.batch();

    for (const adId of adIds) {
      const adRef = db.collection('ads').doc(adId);
      batch.update(adRef, {
        status: 'paused',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /**
   * Get campaign ID for an ad
   */
  private static async getAdCampaignId(adId: string): Promise<string | undefined> {
    const campaigns = await db
      .collection('brandCampaigns')
      .where('ads', 'array-contains', adId)
      .limit(1)
      .get();

    if (campaigns.empty) {
      return undefined;
    }

    return campaigns.docs[0].id;
  }

  /** P0-01 R3 — RETIRED. No public generic advertiser-credit primitive exists (throws before any DB access). */
  static async creditAdvertiserAccount(): Promise<never> {
    throw new AdvertiserCreditAuthorityError('generic_credit_primitive_retired_use_reason_specific');
  }

  /**
   * P0-01 R3 — UNAVAILABLE (SAFE CONTAINMENT). Admin advertiser-credit adjustment has NO repository-native,
   * runtime-verified admin-request adapter; the R2 exported capability factory was forgeable from a plain
   * object and has been removed. This operation is unavailable in ALL feature-flag states and throws BEFORE
   * any Firestore access. No capability can be produced, so no importer can mint admin credit.
   */
  static async applyVerifiedAdvertiserAdminAdjustment(): Promise<never> {
    throw new AdvertiserCreditUnavailableError('ADVERTISER_ADMIN_ADJUSTMENT');
  }

  /**
   * P0-01 R3 — UNAVAILABLE (SAFE CONTAINMENT). Provider funding has NO repository-native trusted provider-
   * verification adapter or server-owned advertiser product authority; the R2 exported proof factory accepted
   * a Boolean "verified" flag and has been removed. Unavailable in ALL feature-flag states; throws BEFORE any
   * Firestore access. No caller-supplied paid amount / currency / granted tokens / product is retained.
   */
  static async completeVerifiedAdvertiserFunding(): Promise<never> {
    throw new AdvertiserCreditUnavailableError('ADVERTISER_PROVIDER_FUNDING');
  }

  /**
   * P0-01 R3 — UNAVAILABLE (SAFE CONTAINMENT). Spend-reversal credit depended on the removed forgeable admin
   * capability; it is unavailable in ALL feature-flag states and throws BEFORE any Firestore access. A
   * canonical, linked, bounded reversal belongs to a future authorized decomposition with a verified adapter.
   * Legacy refundTokens remains retired.
   */
  static async applyVerifiedAdvertiserSpendReversal(): Promise<never> {
    throw new AdvertiserCreditUnavailableError('ADVERTISER_SPEND_REVERSAL');
  }

  /**
   * P0-01 CONTAINMENT — RETIRED. The client-reachable, unauthenticated-scope advertiser-credit mint
   * (client-controlled advertiserId/amount, commented-out admin check, non-transactional, no idempotency,
   * no ledger) is HARD-DISABLED. Its exported callable (addAdvertiserTokens) is removed from index.ts.
   * Sanctioned crediting is server-only via creditAdvertiserAccount(authority, params) (kill switch OFF).
   */
  static async addTokens(
    _advertiserId: string,
    _amount: number,
    _reason: string,
    _adminId?: string
  ): Promise<void> {
    throw new AdvertiserCreditAuthorityError('addTokens_retired_use_creditAdvertiserAccount');
  }

  /**
   * Get advertiser balance
   */
  static async getBalance(advertiserId: string): Promise<number> {
    const advertiser = await db.collection('advertisers').doc(advertiserId).get();

    if (!advertiser.exists) {
      throw new Error('Advertiser account not found');
    }

    return advertiser.data()?.tokenBalance || 0;
  }

  /**
   * Check if advertiser can afford an ad
   */
  static async canAfford(
    advertiserId: string,
    estimatedCost: number
  ): Promise<boolean> {
    const balance = await this.getBalance(advertiserId);
    return balance >= estimatedCost;
  }

  /**
   * Refund tokens (in case of error or violation)
   */
  static async refundTokens(
    _advertiserId: string,
    _amount: number,
    _reason: string,
    _originalTransactionId?: string
  ): Promise<void> {
    // P0-01 CONTAINMENT — RETIRED. This legacy balance-add "refund" path was non-transactional, unbounded,
    // non-idempotent and never linked to an original funding/spend (it minted advertiser credit). It has NO
    // runtime caller. It is HARD-DISABLED; a canonical, linked, bounded, idempotent reversal belongs to the
    // future advertiser-credit reversal decomposition and must route through creditAdvertiserAccount authority.
    throw new AdvertiserCreditAuthorityError('refundTokens_retired');
  }
}

























