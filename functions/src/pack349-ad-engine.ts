/**
 * PACK 349 - Main Ad Engine
 * Core ad management and CRUD operations
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AvaloAd,
  AdvertiserAccount,
  SponsoredCreatorProfile,
  AdReport,
  AdViolation,
  AD_CONSTANTS,
  AD_VALIDATION_RULES,
} from './pack349-types';
import { AdSafetyGate } from './pack349-safety';

export class AdEngine {
  /**
   * Create a new ad
   */
  static async createAd(
    advertiserId: string,
    adData: {
      type: AvaloAd['type'];
      countryScopes: string[];
      media: AvaloAd['media'];
      headline: string;
      description: string;
      targetUrl?: string;
      dailyBudgetTokens: number;
      bidPerViewTokens: number;
      bidPerClickTokens: number;
      bidPerImpressionTokens?: number;
    }
  ): Promise<AvaloAd> {
    // Validate advertiser
    const advertiser = await db.collection('advertisers').doc(advertiserId).get();

    if (!advertiser.exists) {
      throw new Error('Advertiser account not found');
    }

    const advertiserData = advertiser.data() as AdvertiserAccount;

    if (advertiserData.status === 'banned') {
      throw new Error('Advertiser is banned');
    }

    if (advertiserData.status === 'suspended') {
      throw new Error('Advertiser is suspended');
    }

    // Validate input
    if (adData.headline.length < AD_VALIDATION_RULES.headline.minLength ||
        adData.headline.length > AD_VALIDATION_RULES.headline.maxLength) {
      throw new Error(`Headline must be between ${AD_VALIDATION_RULES.headline.minLength} and ${AD_VALIDATION_RULES.headline.maxLength} characters`);
    }

    if (adData.description.length < AD_VALIDATION_RULES.description.minLength ||
        adData.description.length > AD_VALIDATION_RULES.description.maxLength) {
      throw new Error(`Description must be between ${AD_VALIDATION_RULES.description.minLength} and ${AD_VALIDATION_RULES.description.maxLength} characters`);
    }

    if (adData.countryScopes.length < AD_VALIDATION_RULES.countryScopes.minCountries ||
        adData.countryScopes.length > AD_VALIDATION_RULES.countryScopes.maxCountries) {
      throw new Error(`Must target between ${AD_VALIDATION_RULES.countryScopes.minCountries} and ${AD_VALIDATION_RULES.countryScopes.maxCountries} countries`);
    }

    if (adData.bidPerViewTokens < AD_CONSTANTS.MIN_BID_TOKENS ||
        adData.bidPerViewTokens > AD_CONSTANTS.MAX_BID_TOKENS) {
      throw new Error(`Bid per view must be between ${AD_CONSTANTS.MIN_BID_TOKENS} and ${AD_CONSTANTS.MAX_BID_TOKENS} tokens`);
    }

    if (adData.bidPerClickTokens < AD_CONSTANTS.MIN_BID_TOKENS ||
        adData.bidPerClickTokens > AD_CONSTANTS.MAX_BID_TOKENS) {
      throw new Error(`Bid per click must be between ${AD_CONSTANTS.MIN_BID_TOKENS} and ${AD_CONSTANTS.MAX_BID_TOKENS} tokens`);
    }

    // Create ad object
    const adRef = db.collection('ads').doc();
    const now = Timestamp.now();

    const ad: AvaloAd = {
      id: adRef.id,
      advertiserId,
      type: adData.type,
      status: 'draft',
      countryScopes: adData.countryScopes,
      ageGate: AD_CONSTANTS.MIN_AGE_GATE,
      media: adData.media,
      headline: adData.headline,
      description: adData.description,
      targetUrl: adData.targetUrl,
      dailyBudgetTokens: adData.dailyBudgetTokens,
      bidPerViewTokens: adData.bidPerViewTokens,
      bidPerClickTokens: adData.bidPerClickTokens,
      bidPerImpressionTokens: adData.bidPerImpressionTokens || 0,
      createdAt: now,
      updatedAt: now,
      moderationStatus: 'pending',
      totalImpressions: 0,
      totalClicks: 0,
      totalViews: 0,
      totalSpent: 0,
    };

    // Safety validation
    const safetyCheck = await AdSafetyGate.validateAd(ad);

    if (!safetyCheck.isValid) {
      ad.status = 'rejected';
      ad.moderationStatus = 'rejected';
      ad.rejectionReason = AdSafetyGate.getViolationSummary(safetyCheck);

      // Record violation
      await this.recordViolation(advertiserId, ad.id, safetyCheck);
    } else if (safetyCheck.requiresManualReview) {
      ad.moderationStatus = 'pending';
      // Add to moderation queue
      await db.collection('adModerationQueue').add({
        id: db.collection('adModerationQueue').doc().id,
        adId: ad.id,
        advertiserId,
        type: 'new_ad',
        priority: safetyCheck.risk === 'high' ? 'high' : 'medium',
        status: 'pending',
        flagReason: 'Requires manual review',
        createdAt: now,
      });
    } else {
      ad.moderationStatus = 'approved';
    }

    await adRef.set(ad);

    return ad;
  }

  /**
   * Update an existing ad
   */
  static async updateAd(
    adId: string,
    advertiserId: string,
    updates: Partial<AvaloAd>
  ): Promise<void> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;

    if (adData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    // Don't allow updates to active ads without re-review
    if (adData.status === 'active') {
      throw new Error('Cannot update active ad. Pause it first.');
    }

    // Re-validate if content changed
    if (updates.headline || updates.description || updates.media) {
      const updatedAd = { ...adData, ...updates };
      const safetyCheck = await AdSafetyGate.validateAd(updatedAd as AvaloAd);

      if (!safetyCheck.isValid) {
        throw new Error(`Update failed safety check: ${safetyCheck.violations.join(', ')}`);
      }

      if (safetyCheck.requiresManualReview) {
        updates.moderationStatus = 'pending';
      }
    }

    await adRef.update({
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Delete an ad
   */
  static async deleteAd(adId: string, advertiserId: string): Promise<void> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    if (ad.data()?.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    // Can't delete active ads
    if (ad.data()?.status === 'active') {
      throw new Error('Cannot delete active ad. Pause it first.');
    }

    await adRef.delete();
  }

  /**
   * Activate an ad
   */
  static async activateAd(adId: string, advertiserId: string): Promise<void> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;

    if (adData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    if (adData.moderationStatus !== 'approved') {
      throw new Error('Ad must be approved before activation');
    }

    // Check advertiser balance
    const advertiser = await db.collection('advertisers').doc(advertiserId).get();
    const balance = advertiser.data()?.tokenBalance || 0;

    if (balance < adData.dailyBudgetTokens) {
      throw new Error('Insufficient token balance');
    }

    await adRef.update({
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Pause an ad
   */
  static async pauseAd(adId: string, advertiserId: string): Promise<void> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    if (ad.data()?.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    await adRef.update({
      status: 'paused',
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Report an ad
   */
  static async reportAd(
    adId: string,
    reporterId: string,
    reason: string,
    category: AdReport['category'],
    description?: string
  ): Promise<void> {
    const ad = await db.collection('ads').doc(adId).get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    // Create report
    const reportRef = db.collection('adReports').doc();
    const report: AdReport = {
      id: reportRef.id,
      adId,
      reporterId,
      reason,
      category,
      description,
      timestamp: Timestamp.now(),
      status: 'pending',
    };

    await reportRef.set(report);

    // Increment report count on campaign if applicable
    const campaigns = await db
      .collection('brandCampaigns')
      .where('ads', 'array-contains', adId)
      .get();

    for (const campaignDoc of campaigns.docs) {
      const reportCount = (campaignDoc.data().reportCount || 0) + 1;
      await campaignDoc.ref.update({
        reportCount,
        updatedAt: serverTimestamp(),
      });

      // Auto-pause if threshold reached
      if (reportCount >= AD_CONSTANTS.REPORT_THRESHOLD_AUTO_PAUSE) {
        await campaignDoc.ref.update({
          status: 'paused',
          autoPausedAt: serverTimestamp(),
          autoPauseReason: 'Excessive user reports',
        });

        // Add to moderation queue
        await db.collection('adModerationQueue').add({
          id: db.collection('adModerationQueue').doc().id,
          adId,
          advertiserId: ad.data()?.advertiserId,
          type: 'reported_ad',
          priority: 'high',
          status: 'pending',
          reportCount,
          flagReason: `Ad reached ${reportCount} reports`,
          createdAt: serverTimestamp(),
        });
      }
    }
  }

  /**
   * Record violation
   */
  private static async recordViolation(
    advertiserId: string,
    adId: string,
    safetyCheck: any
  ): Promise<void> {
    for (const violation of safetyCheck.violations) {
      const violationRef = db.collection('adViolations').doc();
      const violationData: AdViolation = {
        id: violationRef.id,
        adId,
        advertiserId,
        violationType: 'other',
        description: violation,
        severity: safetyCheck.risk,
        detectedBy: 'auto',
        action: safetyCheck.risk === 'critical' ? 'banned' : 'rejected',
        timestamp: Timestamp.now(),
        resolved: false,
      };

      await violationRef.set(violationData);
    }

    // Update advertiser violation count
    const advertiser = await db.collection('advertisers').doc(advertiserId).get();
    const violationCount = (advertiser.data()?.violationCount || 0) + 1;

    await db.collection('advertisers').doc(advertiserId).update({
      violationCount,
      lastViolationAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Check if should suspend or ban
    if (violationCount >= AD_CONSTANTS.VIOLATION_THRESHOLD_BAN) {
      await this.banAdvertiser(advertiserId, 'Repeated violations');
    } else if (violationCount >= AD_CONSTANTS.VIOLATION_THRESHOLD_SUSPEND) {
      await this.suspendAdvertiser(advertiserId, 'Multiple violations');
    }
  }

  /**
   * Suspend advertiser
   */
  static async suspendAdvertiser(
    advertiserId: string,
    reason: string
  ): Promise<void> {
    await db.collection('advertisers').doc(advertiserId).update({
      status: 'suspended',
      suspendedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Pause all active ads
    const ads = await db
      .collection('ads')
      .where('advertiserId', '==', advertiserId)
      .where('status', '==', 'active')
      .get();

    const batch = db.batch();
    ads.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'paused',
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  }

  /**
   * Ban advertiser
   */
  static async banAdvertiser(advertiserId: string, reason: string): Promise<void> {
    await db.collection('advertisers').doc(advertiserId).update({
      status: 'banned',
      bannedAt: serverTimestamp(),
      banReason: reason,
      updatedAt: serverTimestamp(),
    });

    // Stop all ads
    const ads = await db
      .collection('ads')
      .where('advertiserId', '==', advertiserId)
      .get();

    const batch = db.batch();
    ads.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'paused',
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  }

  /**
   * Create advertiser account
   */
  static async createAdvertiserAccount(
    userId: string,
    businessName: string,
    contactEmail: string
  ): Promise<AdvertiserAccount> {
    const accountRef = db.collection('advertisers').doc(userId);
    const existing = await accountRef.get();

    if (existing.exists) {
      throw new Error('Advertiser account already exists');
    }

    const now = Timestamp.now();
    const account: AdvertiserAccount = {
      id: userId,
      userId,
      businessName,
      contactEmail,
      status: 'active',
      tokenBalance: 0,
      totalSpent: 0,
      activeCampaigns: 0,
      trustScore: 100,
      violationCount: 0,
      warningCount: 0,
      billingHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    await accountRef.set(account);

    return account;
  }
}
