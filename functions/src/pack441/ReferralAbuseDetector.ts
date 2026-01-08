/**
 * PACK 441 — Growth Safety Net & Viral Abuse Control
 * Referral Fraud Detection Module
 * 
 * Detects invite rings, self-referrals, and account farming with automatic actions.
 */

import { Firestore } from 'firebase-admin/firestore';
import {
  ReferralFraudSignals,
  ReferralFraudAction,
  Pack441Config,
  GrowthAbuseAlert,
} from './types';

export class ReferralAbuseDetector {
  private db: Firestore;
  private config: Pack441Config;

  constructor(db: Firestore, config: Pack441Config) {
    this.db = db;
    this.config = config;
  }

  /**
   * Analyze user for referral fraud signals
   */
  async analyzeUser(userId: string): Promise<ReferralFraudSignals> {
    const [inviteRing, selfReferral, farmIndicators] = await Promise.all([
      this.detectInviteRing(userId),
      this.detectSelfReferral(userId),
      this.detectAccountFarm(userId),
    ]);

    const totalIndicators = 
      (inviteRing ? 1 : 0) + 
      (selfReferral ? 1 : 0) + 
      farmIndicators;

    const signalStrength = this.calculateSignalStrength(totalIndicators);
    const confidenceScore = await this.calculateConfidenceScore(userId, {
      inviteRing,
      selfReferral,
      farmIndicators,
    });

    const signals: ReferralFraudSignals = {
      userId,
      suspectedInviteRing: inviteRing.detected,
      selfReferralDetected: selfReferral,
      accountFarmIndicators: farmIndicators,
      signalStrength,
      detectedAt: new Date(),
      metadata: {
        ringMembers: inviteRing.detected ? inviteRing.members : undefined,
        farmCharacteristics: farmIndicators > 0 ? await this.getFarmCharacteristics(userId) : undefined,
        confidenceScore,
      },
    };

    await this.storeFraudSignals(signals);

    // Trigger automatic action if needed
    if (confidenceScore >= this.config.fraudDetection.confidenceThreshold) {
      await this.triggerAutomaticAction(signals);
    }

    return signals;
  }

  /**
   * Detect invite ring patterns
   */
  private async detectInviteRing(userId: string): Promise<{ detected: boolean; members: string[] }> {
    if (!this.config.fraudDetection.ringDetectionEnabled) {
      return { detected: false, members: [] };
    }

    // Get user's invites (sent and received)
    const [sentInvites, receivedInvites] = await Promise.all([
      this.db
        .collection('invitations')
        .where('senderId', '==', userId)
        .get(),
      this.db
        .collection('invitations')
        .where('recipientId', '==', userId)
        .get(),
    ]);

    const invitedUsers = new Set<string>();
    const invitedByUsers = new Set<string>();

    sentInvites.forEach((doc) => {
      const recipientId = doc.data().recipientId;
      if (recipientId) invitedUsers.add(recipientId);
    });

    receivedInvites.forEach((doc) => {
      const senderId = doc.data().senderId;
      if (senderId) invitedByUsers.add(senderId);
    });

    // Check for circular invitations (ring pattern)
    const ringMembers = new Set<string>();
    for (const invitedUser of invitedUsers) {
      if (invitedByUsers.has(invitedUser)) {
        ringMembers.add(invitedUser);
      }
    }

    // Check for multi-level rings
    if (ringMembers.size > 0) {
      for (const member of ringMembers) {
        const memberRing = await this.findConnectedRingMembers(member, userId);
        memberRing.forEach((m) => ringMembers.add(m));
      }
    }

    const detected = ringMembers.size >= 2; // At least 2 other users in ring

    return {
      detected,
      members: Array.from(ringMembers),
    };
  }

  /**
   * Find connected ring members recursively
   */
  private async findConnectedRingMembers(
    userId: string,
    originalUser: string,
    visited: Set<string> = new Set()
  ): Promise<string[]> {
    if (visited.has(userId) || visited.size > 10) {
      return []; // Prevent infinite loops and limit depth
    }

    visited.add(userId);

    const invites = await this.db
      .collection('invitations')
      .where('senderId', '==', userId)
      .get();

    const connected: string[] = [];

    for (const doc of invites.docs) {
      const recipientId = doc.data().recipientId;
      if (recipientId && recipientId !== originalUser && !visited.has(recipientId)) {
        // Check if this recipient invited the original user
        const backInvite = await this.db
          .collection('invitations')
          .where('senderId', '==', recipientId)
          .where('recipientId', '==', originalUser)
          .get();

        if (!backInvite.empty) {
          connected.push(recipientId);
          const nested = await this.findConnectedRingMembers(recipientId, originalUser, visited);
          connected.push(...nested);
        }
      }
    }

    return connected;
  }

  /**
   * Detect self-referral patterns
   */
  private async detectSelfReferral(userId: string): Promise<boolean> {
    if (!this.config.fraudDetection.selfReferralCheckEnabled) {
      return false;
    }

    // Get user's device and IP info
    const userDoc = await this.db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    const userDevices = new Set(userData?.deviceIds || []);
    const userIps = new Set(userData?.ipAddresses || []);

    // Check invites sent by this user
    const sentInvites = await this.db
      .collection('invitations')
      .where('senderId', '==', userId)
      .get();

    for (const invite of sentInvites.docs) {
      const inviteData = invite.data();
      const recipientId = inviteData.recipientId;

      if (!recipientId) continue;

      // Get recipient's device and IP info
      const recipientDoc = await this.db.collection('users').doc(recipientId).get();
      if (!recipientDoc.exists) continue;

      const recipientData = recipientDoc.data();
      const recipientDevices = new Set(recipientData?.deviceIds || []);
      const recipientIps = new Set(recipientData?.ipAddresses || []);

      // Check for device/IP overlap
      const deviceOverlap = [...userDevices].some((d) => recipientDevices.has(d));
      const ipOverlap = [...userIps].some((ip) => recipientIps.has(ip));

      if (deviceOverlap || ipOverlap) {
        return true; // Self-referral detected
      }
    }

    return false;
  }

  /**
   * Detect account farm indicators
   */
  private async detectAccountFarm(userId: string): Promise<number> {
    if (!this.config.fraudDetection.farmDetectionEnabled) {
      return 0;
    }

    let indicators = 0;

    // Check various farm indicators
    const [
      similarProfiles,
      sequentialCreation,
      lowActivity,
      identicalBehavior,
      bulkInvites,
    ] = await Promise.all([
      this.checkSimilarProfiles(userId),
      this.checkSequentialCreation(userId),
      this.checkLowActivity(userId),
      this.checkIdenticalBehavior(userId),
      this.checkBulkInvites(userId),
    ]);

    if (similarProfiles) indicators++;
    if (sequentialCreation) indicators++;
    if (lowActivity) indicators++;
    if (identicalBehavior) indicators++;
    if (bulkInvites) indicators++;

    return indicators;
  }

  /**
   * Check for similar profile patterns
   */
  private async checkSimilarProfiles(userId: string): Promise<boolean> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    const deviceIds = userData?.deviceIds || [];

    if (deviceIds.length === 0) return false;

    // Check for multiple accounts from same device
    const sameDeviceUsers = await this.db
      .collection('users')
      .where('deviceIds', 'array-contains-any', deviceIds.slice(0, 10))
      .get();

    return sameDeviceUsers.size > 3; // More than 3 accounts from same device
  }

  /**
   * Check for sequential account creation
   */
  private async checkSequentialCreation(userId: string): Promise<boolean> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    const createdAt = userData?.createdAt?.toDate();
    if (!createdAt) return false;

    const ipAddress = userData?.ipAddresses?.[0];
    if (!ipAddress) return false;

    // Check for accounts created within 1 hour from same IP
    const timeWindow = 60 * 60 * 1000; // 1 hour
    const windowStart = new Date(createdAt.getTime() - timeWindow);
    const windowEnd = new Date(createdAt.getTime() + timeWindow);

    const recentAccounts = await this.db
      .collection('users')
      .where('ipAddresses', 'array-contains', ipAddress)
      .where('createdAt', '>=', windowStart)
      .where('createdAt', '<=', windowEnd)
      .get();

    return recentAccounts.size > 5; // More than 5 accounts in 1 hour window
  }

  /**
   * Check for low activity patterns
   */
  private async checkLowActivity(userId: string): Promise<boolean> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    const accountAge = Date.now() - userData?.createdAt?.toDate()?.getTime();

    // If account is older than 7 days, check activity
    if (accountAge > 7 * 24 * 60 * 60 * 1000) {
      const activityCount = userData?.activityCount || 0;
      const avgActivityPerDay = activityCount / (accountAge / (24 * 60 * 60 * 1000));

      // Less than 1 action per day is suspicious
      return avgActivityPerDay < 1;
    }

    return false;
  }

  /**
   * Check for identical behavior patterns
   */
  private async checkIdenticalBehavior(userId: string): Promise<boolean> {
    // Get user's recent actions
    const actions = await this.db
      .collection('user_actions')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    if (actions.size < 10) return false;

    // Check for highly repetitive patterns
    const actionTypes = actions.docs.map((doc) => doc.data().actionType);
    const uniqueActions = new Set(actionTypes);

    // If less than 3 unique action types, it's suspicious
    return uniqueActions.size < 3 && actionTypes.length > 20;
  }

  /**
   * Check for bulk invitation patterns
   */
  private async checkBulkInvites(userId: string): Promise<boolean> {
    const recentInvites = await this.db
      .collection('invitations')
      .where('senderId', '==', userId)
      .where('createdAt', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    return recentInvites.size > 50; // More than 50 invites in 24 hours
  }

  /**
   * Calculate signal strength based on indicators
   */
  private calculateSignalStrength(totalIndicators: number): 'low' | 'medium' | 'high' | 'critical' {
    if (totalIndicators === 0) return 'low';
    if (totalIndicators === 1) return 'medium';
    if (totalIndicators === 2) return 'high';
    return 'critical';
  }

  /**
   * Calculate confidence score for fraud detection
   */
  private async calculateConfidenceScore(
    userId: string,
    signals: { inviteRing: boolean; selfReferral: boolean; farmIndicators: number }
  ): Promise<number> {
    let score = 0;

    if (signals.inviteRing) score += 40;
    if (signals.selfReferral) score += 35;
    score += signals.farmIndicators * 10; // 10 points per farm indicator

    // Consider user history
    const trustScore = await this.getUserTrustScore(userId);
    const historyAdjustment = (100 - trustScore) / 10; // Lower trust = higher confidence in fraud

    score += historyAdjustment;

    return Math.min(100, score);
  }

  /**
   * Get user trust score
   */
  private async getUserTrustScore(userId: string): Promise<number> {
    const doc = await this.db.collection('pack441_trust_scores').doc(userId).get();
    return doc.exists ? doc.data()?.currentScore || 100 : 100;
  }

  /**
   * Get farm characteristics for reporting
   */
  private async getFarmCharacteristics(userId: string): Promise<string[]> {
    const characteristics: string[] = [];

    if (await this.checkSimilarProfiles(userId)) {
      characteristics.push('Multiple accounts from same device');
    }
    if (await this.checkSequentialCreation(userId)) {
      characteristics.push('Sequential account creation pattern');
    }
    if (await this.checkLowActivity(userId)) {
      characteristics.push('Low activity for account age');
    }
    if (await this.checkIdenticalBehavior(userId)) {
      characteristics.push('Repetitive behavior patterns');
    }
    if (await this.checkBulkInvites(userId)) {
      characteristics.push('Bulk invitation sending');
    }

    return characteristics;
  }

  /**
   * Store fraud signals in Firestore
   */
  private async storeFraudSignals(signals: ReferralFraudSignals): Promise<void> {
    await this.db.collection('pack441_fraud_signals').doc(signals.userId).set({
      ...signals,
      detectedAt: Firestore.FieldValue.serverTimestamp(),
    });

    // Also store in history
    await this.db
      .collection('pack441_fraud_signals')
      .doc(signals.userId)
      .collection('history')
      .add({
        ...signals,
        detectedAt: Firestore.FieldValue.serverTimestamp(),
      });
  }

  /**
   * Trigger automatic action based on fraud signals
   */
  private async triggerAutomaticAction(signals: ReferralFraudSignals): Promise<void> {
    const severity = this.determineSeverity(signals);
    const actionType = this.determineActionType(signals, severity);

    const action: ReferralFraudAction = {
      userId: signals.userId,
      actionType,
      severity,
      appliedAt: new Date(),
      expiresAt: this.calculateExpirationDate(actionType, severity),
      metadata: {
        reason: this.generateActionReason(signals),
        signalStrength: signals.signalStrength,
        reviewRequired: severity === 'high',
      },
    };

    await this.applyFraudAction(action);

    // Create alert if severity is high
    if (severity === 'high') {
      await this.createAbuseAlert(signals, action);
    }
  }

  /**
   * Determine action severity
   */
  private determineSeverity(signals: ReferralFraudSignals): 'low' | 'medium' | 'high' {
    if (signals.signalStrength === 'critical') return 'high';
    if (signals.signalStrength === 'high') return 'medium';
    return 'low';
  }

  /**
   * Determine appropriate action type
   */
  private determineActionType(
    signals: ReferralFraudSignals,
    severity: 'low' | 'medium' | 'high'
  ): 'reward_throttle' | 'delayed_unlock' | 'soft_cap' | 'manual_review' | 'account_flag' {
    if (severity === 'high') return 'manual_review';
    if (signals.selfReferralDetected) return 'soft_cap';
    if (signals.suspectedInviteRing) return 'delayed_unlock';
    if (signals.accountFarmIndicators > 2) return 'account_flag';
    return 'reward_throttle';
  }

  /**
   * Calculate expiration date for action
   */
  private calculateExpirationDate(
    actionType: string,
    severity: 'low' | 'medium' | 'high'
  ): Date | undefined {
    const durations: Record<string, number> = {
      reward_throttle: 7 * 24 * 60 * 60 * 1000, // 7 days
      delayed_unlock: 14 * 24 * 60 * 60 * 1000, // 14 days
      soft_cap: 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    const duration = durations[actionType];
    return duration ? new Date(Date.now() + duration) : undefined;
  }

  /**
   * Generate human-readable action reason
   */
  private generateActionReason(signals: ReferralFraudSignals): string {
    const reasons: string[] = [];

    if (signals.suspectedInviteRing) {
      reasons.push('Suspected invite ring pattern detected');
    }
    if (signals.selfReferralDetected) {
      reasons.push('Self-referral activity identified');
    }
    if (signals.accountFarmIndicators > 0) {
      reasons.push(`${signals.accountFarmIndicators} account farming indicators detected`);
    }

    return reasons.join('; ');
  }

  /**
   * Apply fraud action
   */
  private async applyFraudAction(action: ReferralFraudAction): Promise<void> {
    await this.db.collection('pack441_fraud_actions').doc(action.userId).set({
      ...action,
      appliedAt: Firestore.FieldValue.serverTimestamp(),
    });

    // Update user's trust score
    await this.updateTrustScore(action.userId, action.severity);
  }

  /**
   * Update user trust score based on fraud action
   */
  private async updateTrustScore(userId: string, severity: 'low' | 'medium' | 'high'): Promise<void> {
    const penalties: Record<string, number> = {
      low: -10,
      medium: -25,
      high: -40,
    };

    const doc = await this.db.collection('pack441_trust_scores').doc(userId).get();
    const currentScore = doc.exists ? doc.data()?.currentScore || 100 : 100;
    const newScore = Math.max(0, currentScore + penalties[severity]);

    await this.db.collection('pack441_trust_scores').doc(userId).set({
      userId,
      currentScore: newScore,
      lastUpdated: Firestore.FieldValue.serverTimestamp(),
      history: Firestore.FieldValue.arrayUnion({
        score: newScore,
        timestamp: new Date(),
        reason: `Fraud action applied (severity: ${severity})`,
        adjustment: penalties[severity],
      }),
    }, { merge: true });
  }

  /**
   * Create abuse alert for high-severity cases
   */
  private async createAbuseAlert(
    signals: ReferralFraudSignals,
    action: ReferralFraudAction
  ): Promise<void> {
    const alert: GrowthAbuseAlert = {
      alertId: `alert_${Date.now()}_${signals.userId}`,
      severity: 'high',
      alertType: signals.suspectedInviteRing ? 'invite_ring' : 
                 signals.accountFarmIndicators > 0 ? 'account_farm' : 'mass_abuse',
      affectedUsers: [signals.userId, ...(signals.metadata.ringMembers || [])],
      metrics: {
        confidenceScore: signals.metadata.confidenceScore,
        farmIndicators: signals.accountFarmIndicators,
        ringSize: signals.metadata.ringMembers?.length || 0,
      },
      detectedAt: new Date(),
      status: 'active',
    };

    await this.db.collection('pack441_alerts').add({
      ...alert,
      detectedAt: Firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Get user's fraud signals
   */
  async getFraudSignals(userId: string): Promise<ReferralFraudSignals | null> {
    const doc = await this.db.collection('pack441_fraud_signals').doc(userId).get();
    return doc.exists ? (doc.data() as ReferralFraudSignals) : null;
  }

  /**
   * Get user's fraud action
   */
  async getFraudAction(userId: string): Promise<ReferralFraudAction | null> {
    const doc = await this.db.collection('pack441_fraud_actions').doc(userId).get();
    if (!doc.exists) return null;

    const action = doc.data() as ReferralFraudAction;
    
    // Check if action has expired
    if (action.expiresAt && action.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return action;
  }
}
