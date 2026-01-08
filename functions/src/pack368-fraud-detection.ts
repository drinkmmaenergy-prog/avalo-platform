/**
 * PACK 368 — Viral Referral & Invite Engine
 * Fraud Detection & Prevention Engine
 */

import { db } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import { ReferralFraudSignal, Referral } from './pack368-referral-types';

export class ReferralFraudDetector {
  private db: FirebaseFirestore.Firestore;

  constructor(database: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Comprehensive fraud detection for referrals
   */
  async detectFraud(referral: Referral): Promise<{
    isFraudulent: boolean;
    riskScore: number;
    signals: ReferralFraudSignal[];
  }> {
    const signals: ReferralFraudSignal[] = [];
    let totalRiskScore = 0;

    // Run all fraud checks in parallel
    const [
      multiAccountSignal,
      proxyVpnSignal,
      inviteLoopSignal,
      selfInviteSignal,
      rapidInvitesSignal,
      emulatorSignal,
      suspiciousDeviceSignal,
    ] = await Promise.all([
      this.checkMultiAccount(referral),
      this.checkProxyVpn(referral),
      this.checkInviteLoop(referral),
      this.checkSelfInvite(referral),
      this.checkRapidInvites(referral),
      this.checkEmulator(referral),
      this.checkSuspiciousDevice(referral),
    ]);

    // Collect all signals
    if (multiAccountSignal) {
      signals.push(multiAccountSignal);
      totalRiskScore += this.getRiskWeight(multiAccountSignal.riskLevel);
    }
    if (proxyVpnSignal) {
      signals.push(proxyVpnSignal);
      totalRiskScore += this.getRiskWeight(proxyVpnSignal.riskLevel);
    }
    if (inviteLoopSignal) {
      signals.push(inviteLoopSignal);
      totalRiskScore += this.getRiskWeight(inviteLoopSignal.riskLevel);
    }
    if (selfInviteSignal) {
      signals.push(selfInviteSignal);
      totalRiskScore += this.getRiskWeight(selfInviteSignal.riskLevel);
    }
    if (rapidInvitesSignal) {
      signals.push(rapidInvitesSignal);
      totalRiskScore += this.getRiskWeight(rapidInvitesSignal.riskLevel);
    }
    if (emulatorSignal) {
      signals.push(emulatorSignal);
      totalRiskScore += this.getRiskWeight(emulatorSignal.riskLevel);
    }
    if (suspiciousDeviceSignal) {
      signals.push(suspiciousDeviceSignal);
      totalRiskScore += this.getRiskWeight(suspiciousDeviceSignal.riskLevel);
    }

    // Save fraud signals
    for (const signal of signals) {
      await this.db.collection('referralFraudSignals').add({
        ...signal,
        detectedAt: FieldValue.serverTimestamp(),
      });
    }

    // Calculate final risk score (0-100)
    const normalizedScore = Math.min(100, totalRiskScore);
    const isFraudulent = normalizedScore >= 60; // Threshold for fraud

    return {
      isFraudulent,
      riskScore: normalizedScore,
      signals,
    };
  }

  /**
   * Check for multi-account farming patterns
   */
  private async checkMultiAccount(referral: Referral): Promise<ReferralFraudSignal | null> {
    if (!referral.deviceFingerprint) return null;

    // Check how many accounts share this device fingerprint
    const accountsSnapshot = await this.db
      .collection('referrals')
      .where('deviceFingerprint', '==', referral.deviceFingerprint)
      .get();

    const accountCount = accountsSnapshot.size;

    if (accountCount >= 5) {
      return {
        id: '',
        userId: referral.invitedUserId,
        referralId: referral.id,
        signalType: 'multi_account',
        riskLevel: 'critical',
        confidence: 0.95,
        details: {
          deviceFingerprint: referral.deviceFingerprint,
          accountCount,
        },
        deviceFingerprint: referral.deviceFingerprint,
        detectedAt: new Date(),
      };
    } else if (accountCount >= 3) {
      return {
        id: '',
        userId: referral.invitedUserId,
        referralId: referral.id,
        signalType: 'multi_account',
        riskLevel: 'high',
        confidence: 0.75,
        details: {
          deviceFingerprint: referral.deviceFingerprint,
          accountCount,
        },
        deviceFingerprint: referral.deviceFingerprint,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for proxy/VPN usage
   */
  private async checkProxyVpn(referral: Referral): Promise<ReferralFraudSignal | null> {
    if (!referral.ipAddress) return null;

    // Check if IP is in known VPN/proxy database
    // This would integrate with a service like IP2Location or similar
    const isKnownVpn = await this.isVpnIp(referral.ipAddress);

    if (isKnownVpn) {
      return {
        id: '',
        userId: referral.invitedUserId,
        referralId: referral.id,
        signalType: 'proxy_vpn',
        riskLevel: 'medium',
        confidence: 0.70,
        details: {
          ipAddress: referral.ipAddress,
        },
        ipAddress: referral.ipAddress,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for invite loop (A invites B, B invites A)
   */
  private async checkInviteLoop(referral: Referral): Promise<ReferralFraudSignal | null> {
    // Check if inviter was previously invited by the invitee
    const loopSnapshot = await this.db
      .collection('referrals')
      .where('inviterId', '==', referral.invitedUserId)
      .where('invitedUserId', '==', referral.inviterId)
      .get();

    if (!loopSnapshot.empty) {
      return {
        id: '',
        userId: referral.invitedUserId,
        referralId: referral.id,
        signalType: 'invite_loop',
        riskLevel: 'critical',
        confidence: 1.0,
        details: {
          inviterId: referral.inviterId,
          invitedUserId: referral.invitedUserId,
          loopDetected: true,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for self-invite attempts
   */
  private async checkSelfInvite(referral: Referral): Promise<ReferralFraudSignal | null> {
    if (!referral.deviceFingerprint && !referral.ipAddress) return null;

    // Check if inviter used same device/IP recently
    const inviterReferrals = await this.db
      .collection('referrals')
      .where('inviterId', '==', referral.inviterId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    for (const doc of inviterReferrals.docs) {
      const data = doc.data();
      if (
        (referral.deviceFingerprint && data.deviceFingerprint === referral.deviceFingerprint) ||
        (referral.ipAddress && data.ipAddress === referral.ipAddress)
      ) {
        return {
          id: '',
          userId: referral.invitedUserId,
          referralId: referral.id,
          signalType: 'self_invite',
          riskLevel: 'critical',
          confidence: 0.90,
          details: {
            matchedDevice: data.deviceFingerprint === referral.deviceFingerprint,
            matchedIp: data.ipAddress === referral.ipAddress,
          },
          deviceFingerprint: referral.deviceFingerprint,
          ipAddress: referral.ipAddress,
          detectedAt: new Date(),
        };
      }
    }

    return null;
  }

  /**
   * Check for rapid invite patterns (bot behavior)
   */
  private async checkRapidInvites(referral: Referral): Promise<ReferralFraudSignal | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Check invites from this inviter in last 5 minutes
    const recentInvites = await this.db
      .collection('referrals')
      .where('inviterId', '==', referral.inviterId)
      .where('createdAt', '>=', fiveMinutesAgo)
      .get();

    if (recentInvites.size >= 10) {
      return {
        id: '',
        userId: referral.inviterId,
        referralId: referral.id,
        signalType: 'rapid_invites',
        riskLevel: 'high',
        confidence: 0.85,
        details: {
          inviteCount: recentInvites.size,
          windowMinutes: 5,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for emulator detection
   */
  private async checkEmulator(referral: Referral): Promise<ReferralFraudSignal | null> {
    if (!referral.userAgent) return null;

    // Check for common emulator indicators
    const emulatorIndicators = [
      'Android SDK built for',
      'Emulator',
      'generic_x86',
      'GoogleSDK',
      'Genymotion',
    ];

    const isEmulator = emulatorIndicators.some(indicator =>
      referral.userAgent?.includes(indicator)
    );

    if (isEmulator) {
      return {
        id: '',
        userId: referral.invitedUserId,
        referralId: referral.id,
        signalType: 'emulator',
        riskLevel: 'high',
        confidence: 0.80,
        details: {
          userAgent: referral.userAgent,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Check for suspicious device patterns
   */
  private async checkSuspiciousDevice(referral: Referral): Promise<ReferralFraudSignal | null> {
    if (!referral.deviceFingerprint) return null;

    // Check if device has been flagged previously
    const flaggedDevice = await this.db
      .collection('referralFraudSignals')
      .where('deviceFingerprint', '==', referral.deviceFingerprint)
      .where('riskLevel', 'in', ['high', 'critical'])
      .limit(1)
      .get();

    if (!flaggedDevice.empty) {
      return {
        id: '',
        userId: referral.invitedUserId,
        referralId: referral.id,
        signalType: 'suspicious_device',
        riskLevel: 'high',
        confidence: 0.75,
        details: {
          deviceFingerprint: referral.deviceFingerprint,
          previousFlags: flaggedDevice.size,
        },
        deviceFingerprint: referral.deviceFingerprint,
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Convert risk level to numeric weight
   */
  private getRiskWeight(riskLevel: ReferralFraudSignal['riskLevel']): number {
    switch (riskLevel) {
      case 'low':
        return 10;
      case 'medium':
        return 25;
      case 'high':
        return 40;
      case 'critical':
        return 60;
      default:
        return 0;
    }
  }

  /**
   * Check if IP is a known VPN/proxy
   * This is a placeholder - integrate with actual VPN detection service
   */
  private async isVpnIp(ipAddress: string): Promise<boolean> {
    // TODO: Integrate with IP2Location, IPQualityScore, or similar service
    // For now, return false
    return false;
  }

  /**
   * Check if user is eligible for referral rewards
   */
  async isUserEligibleForReward(userId: string): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return { eligible: false, reason: 'User not found' };
    }

    const userData = userDoc.data()!;

    // Check age verification
    if (userData.age < 18) {
      return { eligible: false, reason: 'User under 18' };
    }

    // Check profile verification
    if (!userData.verified) {
      return { eligible: false, reason: 'Profile not verified' };
    }

    // Check selfie verification
    if (!userData.selfieVerified) {
      return { eligible: false, reason: 'Selfie not verified' };
    }

    // Check if user has completed first action
    const hasCompletedAction = await this.hasUserCompletedAction(userId);
    if (!hasCompletedAction) {
      return { eligible: false, reason: 'No completed actions' };
    }

    // Check fraud signals
    const fraudSignals = await this.db
      .collection('referralFraudSignals')
      .where('userId', '==', userId)
      .where('riskLevel', 'in', ['high', 'critical'])
      .get();

    if (!fraudSignals.empty) {
      return { eligible: false, reason: 'Fraud signals detected' };
    }

    return { eligible: true };
  }

  /**
   * Check if user has completed any real action
   */
  private async hasUserCompletedAction(userId: string): Promise<boolean> {
    // Check for swipes
    const swipes = await this.db
      .collection('swipes')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!swipes.empty) return true;

    // Check for chats
    const chats = await this.db
      .collection('chats')
      .where('participants', 'array-contains', userId)
      .limit(1)
      .get();

    if (!chats.empty) return true;

    // Check for purchases
    const purchases = await this.db
      .collection('purchases')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!purchases.empty) return true;

    return false;
  }
}
