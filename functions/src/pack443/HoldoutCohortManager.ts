/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Module: HoldoutCohortManager
 * 
 * Purpose: Manages non-contaminated holdout cohorts that never see experimental treatments.
 * Ensures spillover isolation (referrals, gifts, shared wallets).
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import * as crypto from 'crypto';

export interface HoldoutCohort {
  id: string;
  name: string;
  percentage: number; // 0-100, typically 5-10%
  seed: string; // Random seed for consistent hashing
  createdAt: Date;
  frozen: boolean; // Once frozen, cannot be modified
  isolationRules: {
    blockReferrals: boolean; // Don't allow referrals from/to this cohort
    blockGifts: boolean; // Don't allow gift transactions
    blockSharedWallets: boolean; // Flag shared wallet usage
  };
  metadata: {
    purpose: string;
    owner: string;
    experiments: string[]; // Experiments this cohort is protecting against
  };
}

export interface UserCohortAssignment {
  userId: string;
  cohortId: string;
  assignedAt: Date;
  permanent: boolean; // Cannot be reassigned
  isolationFlags: {
    hasReceivedReferral: boolean;
    hasGivenReferral: boolean;
    hasReceivedGift: boolean;
    hasGivenGift: boolean;
    hasSharedWallet: boolean;
  };
}

export class HoldoutCohortManager {
  private db: admin.firestore.Firestore;

  constructor(db: admin.firestore.Firestore) {
    this.db = db;
  }

  /**
   * Create a new holdout cohort
   */
  async createHoldoutCohort(
    name: string,
    percentage: number,
    purpose: string,
    owner: string
  ): Promise<HoldoutCohort> {
    if (percentage < 1 || percentage > 20) {
      throw new Error('Holdout percentage must be between 1% and 20%');
    }

    const cohort: HoldoutCohort = {
      id: crypto.randomUUID(),
      name,
      percentage,
      seed: crypto.randomBytes(32).toString('hex'),
      createdAt: new Date(),
      frozen: false,
      isolationRules: {
        blockReferrals: true,
        blockGifts: true,
        blockSharedWallets: true,
      },
      metadata: {
        purpose,
        owner,
        experiments: [],
      },
    };

    await this.db.collection('holdoutCohorts').doc(cohort.id).set(cohort);

    logger.info('Holdout cohort created', {
      cohortId: cohort.id,
      name,
      percentage,
      owner,
    });

    return cohort;
  }

  /**
   * Freeze a cohort - makes it permanent and immutable
   */
  async freezeCohort(cohortId: string): Promise<void> {
    await this.db.collection('holdoutCohorts').doc(cohortId).update({
      frozen: true,
    });

    logger.info('Holdout cohort frozen', { cohortId });
  }

  /**
   * Check if a user is in a holdout cohort
   * Uses consistent hashing to ensure stable assignments
   */
  async isUserInHoldout(userId: string, cohortId?: string): Promise<boolean> {
    // First check if user has explicit assignment
    const assignment = await this.getUserCohortAssignment(userId);
    if (assignment) {
      if (cohortId) {
        return assignment.cohortId === cohortId;
      }
      return true; // User is in some holdout
    }

    // If no cohortId specified, check if user would be in any active holdout
    if (!cohortId) {
      const cohorts = await this.getActiveHoldoutCohorts();
      for (const cohort of cohorts) {
        if (this.hashUserToCohort(userId, cohort)) {
          return true;
        }
      }
      return false;
    }

    // Check if user hashes into this specific cohort
    const cohort = await this.getHoldoutCohort(cohortId);
    if (!cohort) {
      return false;
    }

    return this.hashUserToCohort(userId, cohort);
  }

  /**
   * Assign a user to a holdout cohort (explicit assignment)
   */
  async assignUserToHoldout(
    userId: string,
    cohortId: string,
    permanent: boolean = true
  ): Promise<UserCohortAssignment> {
    const cohort = await this.getHoldoutCohort(cohortId);
    if (!cohort) {
      throw new Error(`Holdout cohort ${cohortId} not found`);
    }

    // Check if user is already assigned
    const existing = await this.getUserCohortAssignment(userId);
    if (existing && existing.permanent) {
      throw new Error(`User ${userId} is permanently assigned to cohort ${existing.cohortId}`);
    }

    const assignment: UserCohortAssignment = {
      userId,
      cohortId,
      assignedAt: new Date(),
      permanent,
      isolationFlags: {
        hasReceivedReferral: false,
        hasGivenReferral: false,
        hasReceivedGift: false,
        hasGivenGift: false,
        hasSharedWallet: false,
      },
    };

    await this.db
      .collection('holdoutAssignments')
      .doc(userId)
      .set(assignment);

    logger.info('User assigned to holdout', {
      userId,
      cohortId,
      permanent,
    });

    return assignment;
  }

  /**
   * Check if a user interaction would contaminate holdout
   */
  async checkSpilloverViolation(
    fromUserId: string,
    toUserId: string,
    interactionType: 'referral' | 'gift' | 'sharedWallet'
  ): Promise<{ allowed: boolean; reason?: string }> {
    const fromAssignment = await this.getUserCohortAssignment(fromUserId);
    const toAssignment = await this.getUserCohortAssignment(toUserId);

    // If neither user is in holdout, allow
    if (!fromAssignment && !toAssignment) {
      return { allowed: true };
    }

    // Get the cohorts
    const cohorts = await Promise.all([
      fromAssignment ? this.getHoldoutCohort(fromAssignment.cohortId) : null,
      toAssignment ? this.getHoldoutCohort(toAssignment.cohortId) : null,
    ]);

    const fromCohort = cohorts[0];
    const toCohort = cohorts[1];

    // Check isolation rules
    if (interactionType === 'referral') {
      if (fromCohort?.isolationRules.blockReferrals || toCohort?.isolationRules.blockReferrals) {
        return {
          allowed: false,
          reason: 'Referrals blocked for holdout cohort members',
        };
      }
    }

    if (interactionType === 'gift') {
      if (fromCohort?.isolationRules.blockGifts || toCohort?.isolationRules.blockGifts) {
        return {
          allowed: false,
          reason: 'Gifts blocked for holdout cohort members',
        };
      }
    }

    if (interactionType === 'sharedWallet') {
      if (fromCohort?.isolationRules.blockSharedWallets || toCohort?.isolationRules.blockSharedWallets) {
        return {
          allowed: false,
          reason: 'Shared wallets blocked for holdout cohort members',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a spillover event (when it's allowed but needs tracking)
   */
  async recordSpilloverEvent(
    fromUserId: string,
    toUserId: string,
    interactionType: 'referral' | 'gift' | 'sharedWallet'
  ): Promise<void> {
    const event = {
      fromUserId,
      toUserId,
      interactionType,
      timestamp: new Date(),
      fromHoldout: await this.isUserInHoldout(fromUserId),
      toHoldout: await this.isUserInHoldout(toUserId),
    };

    await this.db.collection('holdoutSpilloverEvents').add(event);

    // Update isolation flags
    const updates = [];
    if (event.fromHoldout) {
      const flagField =
        interactionType === 'referral'
          ? 'isolationFlags.hasGivenReferral'
          : interactionType === 'gift'
          ? 'isolationFlags.hasGivenGift'
          : 'isolationFlags.hasSharedWallet';

      updates.push(
        this.db
          .collection('holdoutAssignments')
          .doc(fromUserId)
          .update({ [flagField]: true })
      );
    }

    if (event.toHoldout) {
      const flagField =
        interactionType === 'referral'
          ? 'isolationFlags.hasReceivedReferral'
          : interactionType === 'gift'
          ? 'isolationFlags.hasReceivedGift'
          : 'isolationFlags.hasSharedWallet';

      updates.push(
        this.db
          .collection('holdoutAssignments')
          .doc(toUserId)
          .update({ [flagField]: true })
      );
    }

    await Promise.all(updates);

    logger.warn('Holdout spillover event recorded', event);
  }

  /**
   * Get contaminated users (users in holdout who have spillover)
   */
  async getContaminatedUsers(cohortId: string): Promise<string[]> {
    const snapshot = await this.db
      .collection('holdoutAssignments')
      .where('cohortId', '==', cohortId)
      .get();

    const contaminated: string[] = [];

    snapshot.forEach((doc) => {
      const assignment = doc.data() as UserCohortAssignment;
      const flags = assignment.isolationFlags;

      if (
        flags.hasReceivedReferral ||
        flags.hasGivenReferral ||
        flags.hasReceivedGift ||
        flags.hasGivenGift ||
        flags.hasSharedWallet
      ) {
        contaminated.push(assignment.userId);
      }
    });

    return contaminated;
  }

  /**
   * Generate holdout health report
   */
  async getHoldoutHealthReport(cohortId: string): Promise<{
    totalUsers: number;
    contaminatedUsers: number;
    contaminationRate: number;
    spilloverEvents: number;
    isolationIntegrity: 'HIGH' | 'MEDIUM' | 'LOW';
  }> {
    const cohort = await this.getHoldoutCohort(cohortId);
    if (!cohort) {
      throw new Error(`Cohort ${cohortId} not found`);
    }

    const assignmentsSnapshot = await this.db
      .collection('holdoutAssignments')
      .where('cohortId', '==', cohortId)
      .get();

    const totalUsers = assignmentsSnapshot.size;
    const contaminatedUsers = (await this.getContaminatedUsers(cohortId)).length;
    const contaminationRate = totalUsers > 0 ? contaminatedUsers / totalUsers : 0;

    const spilloverSnapshot = await this.db
      .collection('holdoutSpilloverEvents')
      .where('fromUserId', 'in', assignmentsSnapshot.docs.map(d => d.id))
      .get();

    const spilloverEvents = spilloverSnapshot.size;

    let isolationIntegrity: 'HIGH' | 'MEDIUM' | 'LOW';
    if (contaminationRate < 0.01) {
      isolationIntegrity = 'HIGH';
    } else if (contaminationRate < 0.05) {
      isolationIntegrity = 'MEDIUM';
    } else {
      isolationIntegrity = 'LOW';
    }

    return {
      totalUsers,
      contaminatedUsers,
      contaminationRate,
      spilloverEvents,
      isolationIntegrity,
    };
  }

  // Private helpers

  private async getHoldoutCohort(cohortId: string): Promise<HoldoutCohort | null> {
    const doc = await this.db.collection('holdoutCohorts').doc(cohortId).get();
    return doc.exists ? (doc.data() as HoldoutCohort) : null;
  }

  private async getActiveHoldoutCohorts(): Promise<HoldoutCohort[]> {
    const snapshot = await this.db
      .collection('holdoutCohorts')
      .where('frozen', '==', true)
      .get();

    return snapshot.docs.map((doc) => doc.data() as HoldoutCohort);
  }

  private async getUserCohortAssignment(userId: string): Promise<UserCohortAssignment | null> {
    const doc = await this.db.collection('holdoutAssignments').doc(userId).get();
    return doc.exists ? (doc.data() as UserCohortAssignment) : null;
  }

  /**
   * Consistent hash function to determine if user belongs to cohort
   */
  private hashUserToCohort(userId: string, cohort: HoldoutCohort): boolean {
    const hash = crypto
      .createHash('sha256')
      .update(userId + cohort.seed)
      .digest();

    // Convert first 4 bytes to number 0-100
    const hashValue = (hash.readUInt32BE(0) % 100) + 1;

    return hashValue <= cohort.percentage;
  }
}
