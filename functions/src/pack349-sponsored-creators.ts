/**
 * PACK 349 - Sponsored Creator System
 * Manages creator sponsorships with opt-in and 65/35 revenue split
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { SponsoredCreatorProfile, AD_CONSTANTS } from './pack349-types';

export class SponsoredCreatorEngine {
  /**
   * Create sponsored creator profile (creator must opt-in)
   */
  static async createSponsorship(
    userId: string,
    sponsorshipData: {
      sponsorshipType: SponsoredCreatorProfile['sponsorshipType'];
      brandName: string;
      brandId: string;
      campaignId?: string;
      badgeText: string;
      badgeColor?: string;
      startAt: Date;
      endAt?: Date;
      commissionRate?: number;
      minimumGuarantee?: number;
    }
  ): Promise<SponsoredCreatorProfile> {
    // Check if creator already has active sponsorship
    const existing = await db.collection('sponsoredCreators').doc(userId).get();

    if (existing.exists && existing.data()?.isActive) {
      throw new Error('Creator already has an active sponsorship');
    }

    // Verify brand exists
    const brand = await db.collection('advertisers').doc(sponsorshipData.brandId).get();

    if (!brand.exists) {
      throw new Error('Brand not found');
    }

    const sponsorshipRef = db.collection('sponsoredCreators').doc(userId);
    const now = Timestamp.now();

    const sponsorship: SponsoredCreatorProfile = {
      userId,
      sponsorshipType: sponsorshipData.sponsorshipType,
      brandName: sponsorshipData.brandName,
      brandId: sponsorshipData.brandId,
      campaignId: sponsorshipData.campaignId,
      isActive: true,
      optedInAt: now,
      earnings: {
        total: 0,
        pending: 0,
        paid: 0,
      },
      badgeText: sponsorshipData.badgeText,
      badgeColor: sponsorshipData.badgeColor || '#FFD700',
      startAt: Timestamp.fromDate(sponsorshipData.startAt),
      endAt: sponsorshipData.endAt ? Timestamp.fromDate(sponsorshipData.endAt) : undefined,
      commissionRate: sponsorshipData.commissionRate || AD_CONSTANTS.CREATOR_COMMISSION_RATE,
      minimumGuarantee: sponsorshipData.minimumGuarantee,
      createdAt: now,
      updatedAt: now,
    };

    await sponsorshipRef.set(sponsorship);

    // Update user profile with sponsorship badge
    await db.collection('users').doc(userId).update({
      'sponsorship': {
        isSponsored: true,
        badgeText: sponsorship.badgeText,
        badgeColor: sponsorship.badgeColor,
        brandName: sponsorship.brandName,
      },
      updatedAt: serverTimestamp(),
    });

    return sponsorship;
  }

  /**
   * End sponsorship
   */
  static async endSponsorship(userId: string): Promise<void> {
    const sponsorshipRef = db.collection('sponsoredCreators').doc(userId);
    const sponsorship = await sponsorshipRef.get();

    if (!sponsorship.exists) {
      throw new Error('Sponsorship not found');
    }

    await sponsorshipRef.update({
      isActive: false,
      updatedAt: serverTimestamp(),
    });

    // Remove badge from user profile
    await db.collection('users').doc(userId).update({
      'sponsorship': null,
      updatedAt: serverTimestamp(),
    });

    // Final payout of pending earnings
    const earnings = sponsorship.data()?.earnings;
    if (earnings?.pending > 0) {
      await this.payoutEarnings(userId, earnings.pending);
    }
  }

  /**
   * Record sponsorship earnings from ad interaction
   * Called when a sponsored creator's ad generates revenue
   */
  static async recordEarnings(
    userId: string,
    amount: number,
    source: 'impression' | 'click' | 'view' | 'conversion',
    metadata: {
      adId: string;
      campaignId?: string;
      placementId: string;
    }
  ): Promise<void> {
    const sponsorshipRef = db.collection('sponsoredCreators').doc(userId);
    const sponsorship = await sponsorshipRef.get();

    if (!sponsorship.exists || !sponsorship.data()?.isActive) {
      return; // No active sponsorship
    }

    const sponsorshipData = sponsorship.data() as SponsoredCreatorProfile;
    const creatorShare = amount * sponsorshipData.commissionRate;
    const avaloShare = amount * AD_CONSTANTS.AVALO_COMMISSION_RATE;

    // Update creator earnings
    await sponsorshipRef.update({
      'earnings.total': (sponsorshipData.earnings.total || 0) + creatorShare,
      'earnings.pending': (sponsorshipData.earnings.pending || 0) + creatorShare,
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    await db.collection('sponsorshipEarnings').add({
      userId,
      brandId: sponsorshipData.brandId,
      campaignId: metadata.campaignId,
      adId: metadata.adId,
      placementId: metadata.placementId,
      amount: creatorShare,
      source,
      commissionRate: sponsorshipData.commissionRate,
      timestamp: serverTimestamp(),
    });
  }

  /**
   * Payout earnings to creator
   */
  static async payoutEarnings(
    userId: string,
    amount?: number
  ): Promise<number> {
    const sponsorshipRef = db.collection('sponsoredCreators').doc(userId);
    const sponsorship = await sponsorshipRef.get();

    if (!sponsorship.exists) {
      throw new Error('Sponsorship not found');
    }

    const sponsorshipData = sponsorship.data() as SponsoredCreatorProfile;
    const payoutAmount = amount || sponsorshipData.earnings.pending;

    if (payoutAmount <= 0) {
      throw new Error('No earnings to payout');
    }

    if (payoutAmount > sponsorshipData.earnings.pending) {
      throw new Error('Insufficient pending earnings');
    }

    // Update earnings
    await sponsorshipRef.update({
      'earnings.pending': sponsorshipData.earnings.pending - payoutAmount,
      'earnings.paid': (sponsorshipData.earnings.paid || 0) + payoutAmount,
      updatedAt: serverTimestamp(),
    });

    // Add to creator wallet (assuming token-based system)
    const userRef = db.collection('users').doc(userId);
    const user = await userRef.get();

    if (user.exists) {
      const currentBalance = user.data()?.tokenBalance || 0;
      await userRef.update({
        tokenBalance: currentBalance + payoutAmount,
        updatedAt: serverTimestamp(),
      });
    }

    // Record payout
    await db.collection('sponsorshipPayouts').add({
      userId,
      amount: payoutAmount,
      brandId: sponsorshipData.brandId,
      timestamp: serverTimestamp(),
      method: 'tokens',
    });

    return payoutAmount;
  }

  /**
   * Get creator sponsorship analytics
   */
  static async getCreatorAnalytics(userId: string): Promise<any> {
    const sponsorshipRef = db.collection('sponsoredCreators').doc(userId);
    const sponsorship = await sponsorshipRef.get();

    if (!sponsorship.exists) {
      throw new Error('Sponsorship not found');
    }

    // Get all earnings transactions
    const earnings = await db
      .collection('sponsorshipEarnings')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();

    // Get all payouts
    const payouts = await db
      .collection('sponsorshipPayouts')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();

    // Aggregate by source
    const bySource = {
      impression: 0,
      click: 0,
      view: 0,
      conversion: 0,
    };

    earnings.docs.forEach(doc => {
      const data = doc.data();
      bySource[data.source as keyof typeof bySource] += data.amount || 0;
    });

    return {
      sponsorship: sponsorship.data(),
      earnings: {
        total: sponsorship.data()?.earnings.total || 0,
        pending: sponsorship.data()?.earnings.pending || 0,
        paid: sponsorship.data()?.earnings.paid || 0,
        bySource,
      },
      transactions: earnings.docs.map(doc => doc.data()),
      payouts: payouts.docs.map(doc => doc.data()),
    };
  }

  /**
   * Check if creator is eligible for sponsorship
   */
  static async isEligibleForSponsorship(userId: string): Promise<boolean> {
    const user = await db.collection('users').doc(userId).get();

    if (!user.exists) {
      return false;
    }

    const userData = user.data();

    // Eligibility criteria (customize as needed)
    const hasMinFollowers = (userData?.followers || 0) >= 1000;
    const isVerified = userData?.verified === true;
    const hasGoodStanding = (userData?.violations || 0) < 3;

    return hasMinFollowers && isVerified && hasGoodStanding;
  }

  /**
   * Get all active sponsored creators
   */
  static async getActiveSponsoredCreators(): Promise<SponsoredCreatorProfile[]> {
    const snapshot = await db
      .collection('sponsoredCreators')
      .where('isActive', '==', true)
      .get();

    return snapshot.docs.map(doc => doc.data() as SponsoredCreatorProfile);
  }

  /**
   * Scheduled: Process minimum guarantees
   * Run monthly to ensure creators get their minimum guarantee
   */
  static async processMinimumGuarantees(): Promise<void> {
    const sponsored = await db
      .collection('sponsoredCreators')
      .where('isActive', '==', true)
      .get();

    for (const doc of sponsored.docs) {
      const data = doc.data() as SponsoredCreatorProfile;

      if (data.minimumGuarantee && data.minimumGuarantee > 0) {
        const monthlyEarnings = data.earnings.total; // Assuming this is monthly

        if (monthlyEarnings < data.minimumGuarantee) {
          const topUp = data.minimumGuarantee - monthlyEarnings;

          // Add top-up to pending earnings
          await db.collection('sponsoredCreators').doc(doc.id).update({
            'earnings.pending': (data.earnings.pending || 0) + topUp,
            'earnings.total': data.minimumGuarantee,
            updatedAt: serverTimestamp(),
          });

          // Record guarantee payment
          await db.collection('sponsorshipEarnings').add({
            userId: doc.id,
            brandId: data.brandId,
            amount: topUp,
            source: 'minimum_guarantee',
            commissionRate: 1.0,
            timestamp: serverTimestamp(),
          });
        }
      }
    }
  }
}
