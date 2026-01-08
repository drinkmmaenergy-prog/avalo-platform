import * as admin from 'firebase-admin';
import { enforcement } from '../extortion/enforcement';
import {
  MediaIntegrityCase,
  MediaIntegrityViolationType,
  MediaIntegritySeverity
} from './types';

export class MediaIntegritySafetyIntegration {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async integrateWithSafetyVault(
    caseId: string,
    victimId: string,
    evidenceData: any
  ): Promise<void> {
    await this.db.collection('safety_vault_records').add({
      victimId,
      recordType: 'synthetic_media_evidence',
      caseId,
      relatedSystem: 'media_integrity',
      encryptedContent: evidenceData,
      moderatorAccessGranted: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await this.db
      .collection('media_integrity_cases')
      .doc(caseId)
      .update({
        evidenceVaulted: true,
        vaultedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  async integrateWithFraudDetection(
    uploaderId: string,
    caseId: string,
    violationType: MediaIntegrityViolationType
  ): Promise<void> {
    const isFraudRelated =
      violationType === MediaIntegrityViolationType.IDENTITY_MORPHING ||
      violationType === MediaIntegrityViolationType.EVIDENCE_FABRICATION;

    if (isFraudRelated) {
      await this.db.collection('fraud_cases').add({
        userId: uploaderId,
        fraudType: 'synthetic_identity_fraud',
        relatedCaseId: caseId,
        relatedSystem: 'media_integrity',
        severity: 'high',
        status: 'detected',
        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
        evidence: {
          violationType,
          syntheticMediaDetected: true
        }
      });

      await this.updateUserFraudRiskProfile(uploaderId);
    }
  }

  async integrateWithCyberstalkingDefense(
    uploaderId: string,
    victimId: string | undefined,
    caseId: string,
    violationType: MediaIntegrityViolationType
  ): Promise<void> {
    if (!victimId) return;

    const isStalkingRelated =
      violationType === MediaIntegrityViolationType.DEEPFAKE_FACE ||
      violationType === MediaIntegrityViolationType.SYNTHETIC_PORNOGRAPHY ||
      violationType === MediaIntegrityViolationType.AI_NUDE_GENERATOR;

    if (isStalkingRelated) {
      const existingBehaviors = await this.db
        .collection('stalking_behaviors')
        .where('stalkerUserId', '==', uploaderId)
        .where('victimUserId', '==', victimId)
        .get();

      if (!existingBehaviors.empty) {
        await this.db.collection('stalking_cases').add({
          victimUserId: victimId,
          stalkerUserId: uploaderId,
          behaviorType: 'synthetic_media_harassment',
          relatedCaseId: caseId,
          relatedSystem: 'media_integrity',
          severity: 'critical',
          status: 'active',
          detectedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      await this.db.collection('stalking_behaviors').add({
        stalkerUserId: uploaderId,
        victimUserId: victimId,
        behaviorType: 'deepfake_harassment',
        relatedCaseId: caseId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      await this.applyStalkingMitigations(uploaderId, victimId);
    }
  }

  async integrateWithExtortionDefense(
    uploaderId: string,
    victimId: string | undefined,
    caseId: string,
    violationType: MediaIntegrityViolationType,
    severity: MediaIntegritySeverity
  ): Promise<void> {
    if (!victimId) return;

    const isExtortionRelated =
      violationType === MediaIntegrityViolationType.SYNTHETIC_PORNOGRAPHY ||
      violationType === MediaIntegrityViolationType.AI_NUDE_GENERATOR;

    if (isExtortionRelated) {
      const recentMessages = await this.checkForExtortionMessages(uploaderId, victimId);

      if (recentMessages.length > 0) {
        await this.db.collection('extortion_cases').add({
          victimId,
          accusedId: uploaderId,
          type: 'sextortion',
          severity: severity >= MediaIntegritySeverity.HIGH ? 'critical' : 'high',
          status: 'confirmed',
          relatedCaseId: caseId,
          relatedSystem: 'media_integrity',
          evidence: {
            syntheticMediaDetected: true,
            violationType
          },
          detectedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await enforcement.applyImmediateAction(
          caseId,
          uploaderId,
          severity >= MediaIntegritySeverity.HIGH ? 3 : 2,
          'sextortion' as any
        );

        await this.notifyVictim(victimId, caseId, 'extortion_attempt');
      }
    }
  }

  async escalateToModeration(
    caseId: string,
    uploaderId: string,
    severity: MediaIntegritySeverity,
    violations: MediaIntegrityViolationType[]
  ): Promise<void> {
    const priority = severity >= MediaIntegritySeverity.HIGH ? 'urgent' : 'high';

    await this.db.collection('moderation_queue').add({
      type: 'media_integrity_violation',
      caseId,
      userId: uploaderId,
      violations,
      severity,
      priority,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (severity === MediaIntegritySeverity.CRITICAL) {
      await this.notifyModerationTeam(caseId, violations);
    }
  }

  async notifyVictim(
    victimId: string,
    caseId: string,
    notificationType: string
  ): Promise<void> {
    await this.db.collection('victim_notifications').add({
      victimId,
      caseId,
      type: notificationType,
      relatedSystem: 'media_integrity',
      read: false,
      priority: 'high',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const victimShields = await this.db
      .collection('victim_identity_shields')
      .where('victimId', '==', victimId)
      .where('notificationsEnabled', '==', true)
      .get();

    if (!victimShields.empty) {
      await this.sendPushNotification(victimId, {
        title: 'Identity Shield Alert',
        body: 'Synthetic media targeting your identity has been blocked',
        data: { caseId, type: notificationType }
      });
    }
  }

  async createLegalEvidence(
    caseId: string,
    victimId: string,
    evidenceData: any
  ): Promise<void> {
    await this.db.collection('legal_evidence_vault').add({
      caseId,
      victimId,
      evidenceType: 'synthetic_media',
      relatedSystem: 'media_integrity',
      encryptedEvidence: evidenceData,
      chainOfCustody: [
        {
          action: 'created',
          timestamp: new Date(),
          system: 'media_integrity_engine'
        }
      ],
      courtReady: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async updateVictimShieldStats(
    victimId: string,
    caseId: string,
    attackerId: string
  ): Promise<void> {
    const shields = await this.db
      .collection('victim_identity_shields')
      .where('victimId', '==', victimId)
      .get();

    if (!shields.empty) {
      const shieldDoc = shields.docs[0];
      const currentData = shieldDoc.data();

      await shieldDoc.ref.update({
        syntheticMediaBlocked: admin.firestore.FieldValue.increment(1),
        attackersBlocked: admin.firestore.FieldValue.arrayUnion(attackerId),
        casesOpened: admin.firestore.FieldValue.arrayUnion(caseId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  private async checkForExtortionMessages(
    senderId: string,
    recipientId: string
  ): Promise<any[]> {
    const messages = await this.db
      .collection('messages')
      .where('senderId', '==', senderId)
      .where('recipientId', '==', recipientId)
      .where('timestamp', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .get();

    return messages.docs.map(doc => doc.data());
  }

  private async applyStalkingMitigations(
    stalkerId: string,
    victimId: string
  ): Promise<void> {
    await this.db.collection('stalking_mitigations').add({
      victimUserId: victimId,
      stalkerUserId: stalkerId,
      mitigationType: 'synthetic_media_block',
      action: 'permanent_upload_restriction',
      appliedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await this.db.collection('location_share_blocks').add({
      userA: victimId,
      userB: stalkerId,
      reason: 'synthetic_media_harassment',
      permanent: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await this.db.collection('discovery_blocks').add({
      userId: victimId,
      blockedUserId: stalkerId,
      reason: 'synthetic_media_harassment',
      permanent: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private async updateUserFraudRiskProfile(userId: string): Promise<void> {
    const profileRef = this.db.collection('user_fraud_risk_profiles').doc(userId);
    const profile = await profileRef.get();

    if (profile.exists) {
      await profileRef.update({
        riskScore: admin.firestore.FieldValue.increment(50),
        riskFactors: admin.firestore.FieldValue.arrayUnion('synthetic_media_creation'),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await profileRef.set({
        userId,
        riskScore: 50,
        riskLevel: 'high',
        riskFactors: ['synthetic_media_creation'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  private async notifyModerationTeam(
    caseId: string,
    violations: MediaIntegrityViolationType[]
  ): Promise<void> {
    await this.db.collection('moderation_alerts').add({
      type: 'critical_media_integrity_violation',
      caseId,
      violations,
      priority: 'urgent',
      requiresImmediate: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private async sendPushNotification(
    userId: string,
    notification: { title: string; body: string; data: any }
  ): Promise<void> {
    console.log(`Sending notification to user ${userId}:`, notification);
  }
}

export const safetyIntegration = new MediaIntegritySafetyIntegration();